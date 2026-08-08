import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildClimateConsensus,
  type ClimateProvider,
  type ConsensusCandidate,
  type ConsensusField,
} from "@/modules/weather/quality/climateQualityConsensus";

interface CandidateRow {
  id: string;
  provider: ClimateProvider;
  model_name: string | null;
  interval_start: string;
  interval_end: string;
  local_date: string;
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  dew_point_c: number | null;
  surface_pressure_kpa: number | null;
  wind_speed_10m_ms: number | null;
  wind_speed_2m_ms: number | null;
  wind_direction_deg: number | null;
  solar_radiation_wm2: number | null;
  precipitation_mm: number | null;
  vapour_pressure_deficit_kpa: number | null;
  fetched_at: string;
}

export interface ClimateConsensusShadowResult {
  consensusId: string;
  intervalStart: string;
  intervalEnd: string;
  confidence: string;
  sourceCount: number;
  disputedFields: ConsensusField[];
  outlierProviders: ClimateProvider[];
}

function latestPerProvider(rows: CandidateRow[]): CandidateRow[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime(),
  );
  const seen = new Set<ClimateProvider>();
  const latest: CandidateRow[] = [];
  for (const row of sorted) {
    if (seen.has(row.provider)) continue;
    seen.add(row.provider);
    latest.push(row);
  }
  return latest;
}

function mapCandidate(row: CandidateRow): ConsensusCandidate {
  return {
    id: row.id,
    provider: row.provider,
    modelName: row.model_name,
    temperatureC: row.temperature_c,
    relativeHumidityPct: row.relative_humidity_pct,
    dewPointC: row.dew_point_c,
    surfacePressureKpa: row.surface_pressure_kpa,
    windSpeed10mMs: row.wind_speed_10m_ms,
    windSpeed2mMs: row.wind_speed_2m_ms,
    windDirectionDeg: row.wind_direction_deg,
    solarRadiationWm2: row.solar_radiation_wm2,
    precipitationMm: row.precipitation_mm,
    vapourPressureDeficitKpa: row.vapour_pressure_deficit_kpa,
  };
}

function provenanceFor(result: ReturnType<typeof buildClimateConsensus>) {
  return Object.fromEntries(
    (Object.keys(result.fields) as ConsensusField[]).map((field) => [
      field,
      {
        providers: result.fields[field].providers,
        outliers: result.fields[field].outliers,
        confidence: result.fields[field].confidence,
        disputed: result.fields[field].disputed,
      },
    ]),
  );
}

export async function evaluateClimateConsensusShadow(
  supabase: SupabaseClient,
  input: { virtualStationId: string; intervalStart: string; intervalEnd: string },
): Promise<ClimateConsensusShadowResult> {
  const { data: station, error: stationError } = await supabase
    .from("virtual_weather_stations")
    .select("id, shadow_mode, active")
    .eq("id", input.virtualStationId)
    .eq("active", true)
    .single();

  if (stationError || !station) {
    throw new Error(stationError?.message ?? "Estacao virtual nao encontrada");
  }
  if (!station.shadow_mode) {
    throw new Error("CLIMA 6 exige shadow_mode=true");
  }

  const { data, error } = await supabase
    .from("weather_interval_30m_candidates")
    .select("id, provider, model_name, interval_start, interval_end, local_date, temperature_c, relative_humidity_pct, dew_point_c, surface_pressure_kpa, wind_speed_10m_ms, wind_speed_2m_ms, wind_direction_deg, solar_radiation_wm2, precipitation_mm, vapour_pressure_deficit_kpa, fetched_at")
    .eq("virtual_station_id", input.virtualStationId)
    .eq("interval_start", input.intervalStart)
    .eq("interval_end", input.intervalEnd)
    .order("fetched_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = latestPerProvider((data ?? []) as CandidateRow[]);
  if (rows.length === 0) {
    throw new Error("Nenhum candidato climatico encontrado para o intervalo");
  }

  const result = buildClimateConsensus(rows.map(mapCandidate));
  const localDate = rows[0].local_date;
  const field = result.fields;

  const { data: consensusRow, error: consensusError } = await supabase
    .from("weather_interval_30m_consensus_shadow")
    .insert({
      virtual_station_id: input.virtualStationId,
      interval_start: input.intervalStart,
      interval_end: input.intervalEnd,
      local_date: localDate,
      algorithm_version: "clima6-v1",
      confidence: result.confidence,
      source_count: rows.length,
      contributing_providers: result.contributingProviders,
      outlier_providers: result.outlierProviders,
      disputed_fields: result.disputedFields,
      temperature_c: field.temperatureC.value,
      relative_humidity_pct: field.relativeHumidityPct.value,
      dew_point_c: field.dewPointC.value,
      surface_pressure_kpa: field.surfacePressureKpa.value,
      wind_speed_10m_ms: field.windSpeed10mMs.value,
      wind_speed_2m_ms: field.windSpeed2mMs.value,
      wind_direction_deg: field.windDirectionDeg.value,
      solar_radiation_wm2: field.solarRadiationWm2.value,
      precipitation_mm: field.precipitationMm.value,
      vapour_pressure_deficit_kpa: field.vapourPressureDeficitKpa.value,
      provenance: provenanceFor(result),
      decision_summary: {
        providers: rows.map((row) => ({ provider: row.provider, modelName: row.model_name, candidateId: row.id })),
        thresholdsVersion: "clima6-v1",
      },
      independence_assumed: false,
      warnings: result.warnings,
    })
    .select("id")
    .single();

  if (consensusError || !consensusRow) {
    throw new Error(consensusError?.message ?? "Falha ao persistir consenso climatico Shadow");
  }

  const flags = (Object.keys(result.fields) as ConsensusField[]).flatMap((fieldName) =>
    result.fields[fieldName].flags.map((flag) => ({
      consensus_id: consensusRow.id,
      candidate_id: flag.candidateId,
      provider: flag.provider,
      model_name: flag.modelName,
      field_name: flag.fieldName,
      original_value: flag.originalValue,
      status: flag.status,
      reason: flag.reason,
      reference_value: flag.referenceValue,
      absolute_difference: flag.absoluteDifference,
      relative_difference_pct: flag.relativeDifferencePct,
    })),
  );

  if (flags.length > 0) {
    const { error: flagsError } = await supabase
      .from("weather_interval_30m_quality_flags")
      .insert(flags);
    if (flagsError) throw new Error(flagsError.message);
  }

  return {
    consensusId: consensusRow.id as string,
    intervalStart: input.intervalStart,
    intervalEnd: input.intervalEnd,
    confidence: result.confidence,
    sourceCount: rows.length,
    disputedFields: result.disputedFields,
    outlierProviders: result.outlierProviders,
  };
}
