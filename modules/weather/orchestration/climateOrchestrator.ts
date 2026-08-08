import type { SupabaseClient } from "@supabase/supabase-js";
import { syncOpenMeteo30MinShadow } from "@/modules/weather/services/open-meteo-30m-shadow.service";
import { syncMeteoblue30MinShadow } from "@/modules/weather/services/meteoblue-30m-shadow.service";
import { syncWeatherApi30MinShadow } from "@/modules/weather/services/weatherapi-30m-shadow.service";
import { syncMetNorway30MinShadow } from "@/modules/weather/services/met-norway-30m-shadow.service";
import { evaluateClimateConsensusShadow } from "@/modules/weather/services/climate-consensus-shadow.service";
import { calculateFao5630MinShadow } from "@/modules/weather/services/fao56-30m-shadow.service";

export type ClimateOrchestratorProvider =
  | "open_meteo"
  | "meteoblue"
  | "weatherapi"
  | "met_norway";

export type OrchestrationTrigger = "manual" | "cron";

export interface ProviderRunResult {
  status: "success" | "failed" | "skipped";
  rowsInserted: number;
  fetchedAt: string | null;
  durationMs: number;
  error: string | null;
}

export interface ClimateOrchestrationResult {
  runId: string;
  stationId: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  windowStart: string;
  windowEnd: string;
  providerResults: Record<ClimateOrchestratorProvider, ProviderRunResult>;
  intervalsFound: number;
  consensusCreated: number;
  etoCreated: number;
  etoAvailable: number;
  confidenceCounts: Record<string, number>;
  warnings: string[];
}

interface ProviderConfigRow {
  provider: ClimateOrchestratorProvider;
  enabled: boolean;
}

interface IntervalRow {
  interval_start: string;
  interval_end: string;
}

const PROVIDERS: ClimateOrchestratorProvider[] = [
  "open_meteo",
  "meteoblue",
  "weatherapi",
  "met_norway",
];

function floorTo30Minutes(date: Date): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() < 30 ? 0 : 30);
  return d;
}

export function buildOrchestrationWindow(
  now: Date,
  pastMinutes = 60,
  futureMinutes = 180,
): { start: string; end: string } {
  const anchor = floorTo30Minutes(now).getTime();
  return {
    start: new Date(anchor - Math.max(0, pastMinutes) * 60_000).toISOString(),
    end: new Date(anchor + Math.max(30, futureMinutes) * 60_000).toISOString(),
  };
}

function emptyProviderResults(): Record<ClimateOrchestratorProvider, ProviderRunResult> {
  return Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      { status: "skipped", rowsInserted: 0, fetchedAt: null, durationMs: 0, error: null },
    ]),
  ) as Record<ClimateOrchestratorProvider, ProviderRunResult>;
}

async function runProvider(
  provider: ClimateOrchestratorProvider,
  supabase: SupabaseClient,
  stationId: string,
): Promise<ProviderRunResult> {
  const started = Date.now();
  try {
    const result =
      provider === "open_meteo"
        ? await syncOpenMeteo30MinShadow(supabase, stationId)
        : provider === "meteoblue"
          ? await syncMeteoblue30MinShadow(supabase, stationId)
          : provider === "weatherapi"
            ? await syncWeatherApi30MinShadow(supabase, stationId)
            : await syncMetNorway30MinShadow(supabase, stationId);

    return {
      status: "success",
      rowsInserted: result.rowsInserted,
      fetchedAt: result.fetchedAt,
      durationMs: Date.now() - started,
      error: null,
    };
  } catch (error) {
    return {
      status: "failed",
      rowsInserted: 0,
      fetchedAt: null,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Falha desconhecida no provider",
    };
  }
}

function uniqueIntervals(rows: IntervalRow[], maxIntervals: number): IntervalRow[] {
  const seen = new Set<string>();
  const unique: IntervalRow[] = [];
  for (const row of rows) {
    const key = `${row.interval_start}|${row.interval_end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= maxIntervals) break;
  }
  return unique;
}

export function decideOrchestrationStatus(input: {
  enabledProviders: number;
  successfulProviders: number;
  failedProviders: number;
  intervalsFound: number;
  consensusCreated: number;
  etoCreated: number;
  etoAvailable: number;
}): "success" | "partial" | "failed" {
  if (
    input.successfulProviders === 0 &&
    input.consensusCreated === 0 &&
    input.etoCreated === 0
  ) {
    return "failed";
  }
  if (
    input.failedProviders > 0 ||
    input.enabledProviders === 0 ||
    input.intervalsFound === 0 ||
    input.consensusCreated < input.intervalsFound ||
    input.etoCreated < input.consensusCreated ||
    input.etoAvailable < input.etoCreated
  ) {
    return "partial";
  }
  return "success";
}

export async function runClimateOrchestration(
  supabase: SupabaseClient,
  input: {
    virtualStationId: string;
    triggerType: OrchestrationTrigger;
    now?: Date;
    pastMinutes?: number;
    futureMinutes?: number;
    maxIntervals?: number;
  },
): Promise<ClimateOrchestrationResult> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const window = buildOrchestrationWindow(
    input.now ?? new Date(),
    input.pastMinutes ?? 60,
    input.futureMinutes ?? 180,
  );
  const maxIntervals = Math.max(1, Math.min(input.maxIntervals ?? 12, 24));
  const warnings: string[] = [];
  const providerResults = emptyProviderResults();

  const { data: station, error: stationError } = await supabase
    .from("virtual_weather_stations")
    .select("id, shadow_mode, active")
    .eq("id", input.virtualStationId)
    .eq("active", true)
    .single();

  if (stationError || !station) {
    throw new Error(stationError?.message ?? "Estacao virtual nao encontrada");
  }
  if (!station.shadow_mode) throw new Error("CLIMA 8 exige shadow_mode=true");

  const { data: configs, error: configError } = await supabase
    .from("virtual_weather_station_providers")
    .select("provider, enabled")
    .eq("virtual_station_id", input.virtualStationId);
  if (configError) throw new Error(configError.message);

  const enabledSet = new Set(
    ((configs ?? []) as ProviderConfigRow[])
      .filter((row) => row.enabled)
      .map((row) => row.provider),
  );

  const { data: runRow, error: runError } = await supabase
    .from("climate_orchestration_runs")
    .insert({
      virtual_station_id: input.virtualStationId,
      trigger_type: input.triggerType,
      status: "running",
      started_at: startedAt,
      window_start: window.start,
      window_end: window.end,
    })
    .select("id")
    .single();
  if (runError || !runRow) {
    throw new Error(runError?.message ?? "Falha ao abrir ciclo CLIMA 8");
  }
  const runId = runRow.id as string;

  try {
    const enabledProviders = PROVIDERS.filter((provider) => enabledSet.has(provider));
    const providerPairs = await Promise.all(
      enabledProviders.map(async (provider) => [
        provider,
        await runProvider(provider, supabase, input.virtualStationId),
      ] as const),
    );
    for (const [provider, result] of providerPairs) providerResults[provider] = result;

    for (const provider of PROVIDERS) {
      if (!enabledSet.has(provider)) {
        providerResults[provider] = {
          status: "skipped",
          rowsInserted: 0,
          fetchedAt: null,
          durationMs: 0,
          error: null,
        };
      }
    }

    const { data: intervalData, error: intervalError } = await supabase
      .from("weather_interval_30m_candidates")
      .select("interval_start, interval_end")
      .eq("virtual_station_id", input.virtualStationId)
      .gte("interval_start", window.start)
      .lte("interval_end", window.end)
      .order("interval_start", { ascending: true });
    if (intervalError) throw new Error(intervalError.message);

    const intervals = uniqueIntervals((intervalData ?? []) as IntervalRow[], maxIntervals);
    let consensusCreated = 0;
    let etoCreated = 0;
    let etoAvailable = 0;
    const confidenceCounts: Record<string, number> = {};

    for (const interval of intervals) {
      try {
        const consensus = await evaluateClimateConsensusShadow(supabase, {
          virtualStationId: input.virtualStationId,
          intervalStart: interval.interval_start,
          intervalEnd: interval.interval_end,
        });
        consensusCreated += 1;
        confidenceCounts[consensus.confidence] = (confidenceCounts[consensus.confidence] ?? 0) + 1;

        try {
          const eto = await calculateFao5630MinShadow(supabase, {
            virtualStationId: input.virtualStationId,
            intervalStart: interval.interval_start,
            intervalEnd: interval.interval_end,
          });
          etoCreated += 1;
          if (eto.etoMm30Min !== null) etoAvailable += 1;
          else warnings.push(`ETo indisponivel em ${interval.interval_start}`);
        } catch (error) {
          warnings.push(
            `Falha ETo ${interval.interval_start}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
          );
        }
      } catch (error) {
        warnings.push(
          `Falha consenso ${interval.interval_start}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
        );
      }
    }

    const successfulProviders = Object.values(providerResults).filter((r) => r.status === "success").length;
    const failedProviders = Object.values(providerResults).filter((r) => r.status === "failed").length;
    const finalStatus = decideOrchestrationStatus({
      enabledProviders: enabledProviders.length,
      successfulProviders,
      failedProviders,
      intervalsFound: intervals.length,
      consensusCreated,
      etoCreated,
      etoAvailable,
    });
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;

    const { error: updateError } = await supabase
      .from("climate_orchestration_runs")
      .update({
        status: finalStatus,
        finished_at: finishedAt,
        duration_ms: durationMs,
        provider_results: providerResults,
        intervals_found: intervals.length,
        consensus_created: consensusCreated,
        eto_created: etoCreated,
        eto_available: etoAvailable,
        confidence_counts: confidenceCounts,
        warnings,
      })
      .eq("id", runId);
    if (updateError) warnings.push(`Falha ao fechar auditoria do run: ${updateError.message}`);

    return {
      runId,
      stationId: input.virtualStationId,
      status: finalStatus,
      startedAt,
      finishedAt,
      durationMs,
      windowStart: window.start,
      windowEnd: window.end,
      providerResults,
      intervalsFound: intervals.length,
      consensusCreated,
      etoCreated,
      etoAvailable,
      confidenceCounts,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no orquestrador";
    const finishedAt = new Date().toISOString();
    await supabase
      .from("climate_orchestration_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        duration_ms: Date.now() - startedMs,
        provider_results: providerResults,
        warnings,
        error_message: message,
      })
      .eq("id", runId);
    throw error;
  }
}
