// ============================================================================
// modules/weather/diagnostics/climateDiagnosticService.ts
// ----------------------------------------------------------------------------
// Serviço central do Diagnóstico Climático (Shadow Mode — Etapa 5).
//
// Responsabilidade: dado um `farmId` e um período (7/14/30 dias), consultar
// a Open-Meteo em tempo real via openMeteoProvider (Etapa 3), calcular a
// ETo interna FAO-56 (Etapa 2) e cruzar com a ETo atual do sistema
// (weather_readings.et0_calculated, apenas onde origin='open_meteo').
//
// SHADOW MODE:
//   • Nunca escreve no banco.
//   • Nunca importa water-balance ou irrigation.service.
//   • Nunca alimenta recomendação/lâmina/programação/alerta operacional.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenMeteoProvider } from "@/modules/weather/providers/openMeteoProvider";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";
import { toReferenceEtoInput } from "@/modules/weather/diagnostics/openMeteoEtoDiagnostic";
import type {
  DailyWeatherData,
  WeatherLocation,
} from "@/modules/weather/types/weatherTypes";

export const ALLOWED_DIAGNOSTIC_DAYS = [7, 14, 30] as const;
export type AllowedDiagnosticDays = (typeof ALLOWED_DIAGNOSTIC_DAYS)[number];

export interface DiagnosticIntermediateValues {
  atmosphericPressureKpa: number | null;
  psychrometricConstantKpaC: number | null;
  saturationVapourPressureKpa: number | null;
  actualVapourPressureKpa: number | null;
  vapourPressureDeficitKpa: number | null;
  saturationSlopeKpaC: number | null;
  extraterrestrialRadiationMjM2Day: number | null;
  clearSkyRadiationMjM2Day: number | null;
  netShortwaveRadiationMjM2Day: number | null;
  netLongwaveRadiationMjM2Day: number | null;
  netRadiationMjM2Day: number | null;
  soilHeatFluxMjM2Day: number | null;
  windSpeed2mMs: number | null;
}

export interface DiagnosticDailyRow {
  date: string;
  etoCotrimMm: number | null;
  etoOpenMeteoMm: number | null;
  currentSystemEtoMm: number | null;
  absoluteDifferenceMm: number | null;   // Cotrim − OpenMeteo
  percentageDifferencePct: number | null; // (Cotrim − OpenMeteo)/OpenMeteo × 100
  // Entradas climáticas normalizadas (Etapa 3)
  tMinC: number | null;
  tMaxC: number | null;
  tMeanC: number | null;
  rhMinPct: number | null;
  rhMaxPct: number | null;
  rhMeanPct: number | null;
  wind10mMs: number | null;
  wind2mMs: number | null;
  solarRadiationMjM2Day: number | null;
  surfacePressureKpa: number | null;
  vpdKpa: number | null;
  precipitationMm: number | null;
  // Qualidade / rastreabilidade
  qualityStatus: string;
  dataType: string;
  provider: string;
  estimatedFields: string[];
  missingFields: string[];
  warnings: string[];
  intermediateValues: DiagnosticIntermediateValues;
}

export interface DiagnosticSummary {
  n: number;                       // pares válidos (Cotrim && OpenMeteo)
  bias: number | null;             // média(Cotrim − OpenMeteo)
  mae: number | null;              // média(|Cotrim − OpenMeteo|)
  rmse: number | null;             // √média((Cotrim − OpenMeteo)²)
  daysWithSignificantDiff: number; // |Δ|>0.5 mm ou |Δ%|>10
  averageEtoCotrimMm: number | null;
  averageEtoOpenMeteoMm: number | null;
}

export interface DiagnosticResponse {
  farmId: string;
  farmName: string;
  location: WeatherLocation;
  periodDays: AllowedDiagnosticDays;
  startDate: string;
  endDate: string;
  runAt: string;
  rows: DiagnosticDailyRow[];
  summary: DiagnosticSummary;
}

// ── Métricas Bias / MAE / RMSE (apenas pares Cotrim && OpenMeteo) ──────────
export function computeSummary(rows: DiagnosticDailyRow[]): DiagnosticSummary {
  const pairs = rows.filter(
    (r) => r.etoCotrimMm !== null && r.etoOpenMeteoMm !== null,
  );
  const n = pairs.length;
  if (n === 0) {
    return {
      n: 0,
      bias: null,
      mae: null,
      rmse: null,
      daysWithSignificantDiff: 0,
      averageEtoCotrimMm: null,
      averageEtoOpenMeteoMm: null,
    };
  }
  let sumDiff = 0;
  let sumAbs = 0;
  let sumSq = 0;
  let sumCotrim = 0;
  let sumOM = 0;
  let signif = 0;
  for (const r of pairs) {
    const c = r.etoCotrimMm as number;
    const o = r.etoOpenMeteoMm as number;
    const d = c - o;
    sumDiff += d;
    sumAbs += Math.abs(d);
    sumSq += d * d;
    sumCotrim += c;
    sumOM += o;
    const pct = o !== 0 ? Math.abs((d / o) * 100) : 0;
    if (Math.abs(d) > 0.5 || pct > 10) signif += 1;
  }
  return {
    n,
    bias: sumDiff / n,
    mae: sumAbs / n,
    rmse: Math.sqrt(sumSq / n),
    daysWithSignificantDiff: signif,
    averageEtoCotrimMm: sumCotrim / n,
    averageEtoOpenMeteoMm: sumOM / n,
  };
}

// ── Resolve WeatherLocation SERVER-SIDE (coords nunca do cliente) ──────────
// Devolve `null` quando fazenda inexistente / sem acesso.
// Devolve `{ error, source }` quando existe mas as coordenadas armazenadas
// são fisicamente inválidas (fora de [-90,90] / [-180,180]) ou ausentes.
export interface ResolvedLocation {
  farmName: string;
  location: WeatherLocation;
}
export interface LocationResolutionError {
  error: string;
  source: "farms" | "weather_stations";
}

function isValidLatitude(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLongitude(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}

export async function resolveLocation(
  supabase: SupabaseClient,
  farmId: string,
): Promise<ResolvedLocation | LocationResolutionError | null> {
  const { data: farm } = await supabase
    .from("farms")
    .select("id, name, latitude, longitude, altitude, timezone")
    .eq("id", farmId)
    .maybeSingle();
  if (!farm) return null;

  const { data: station } = await supabase
    .from("weather_stations")
    .select("id, name, latitude, longitude, altitude, timezone")
    .eq("farm_id", farmId)
    .eq("active", true)
    .order("source_priority", { ascending: true })
    .limit(1)
    .maybeSingle();

  const latRaw = (station?.latitude ?? farm.latitude) as unknown;
  const lonRaw = (station?.longitude ?? farm.longitude) as unknown;
  const source: LocationResolutionError["source"] =
    station?.latitude != null || station?.longitude != null
      ? "weather_stations"
      : "farms";

  if (latRaw == null || lonRaw == null) {
    return {
      error:
        `Fazenda "${farm.name as string}" está sem coordenadas cadastradas. ` +
        `Preencha latitude e longitude no cadastro da fazenda ou da estação.`,
      source,
    };
  }
  if (!isValidLatitude(latRaw) || !isValidLongitude(lonRaw)) {
    return {
      error:
        `Fazenda "${farm.name as string}" tem coordenadas inválidas ` +
        `(latitude=${String(latRaw)}, longitude=${String(lonRaw)}). ` +
        `Latitude deve estar entre -90 e 90 e longitude entre -180 e 180, ` +
        `em graus decimais. Verifique se o valor não está em UTM ou outro sistema.`,
      source,
    };
  }

  return {
    farmName: farm.name as string,
    location: {
      id: (station?.id ?? farm.id) as string,
      name: (station?.name ?? farm.name) as string,
      latitude: latRaw,
      longitude: lonRaw,
      elevationM: (station?.altitude ?? farm.altitude ?? null) as number | null,
      timezone:
        ((station?.timezone ?? farm.timezone) as string | null) ?? "America/Bahia",
    },
  };
}

// ── Snapshot dos intermediários FAO-56 ──────────────────────────────────────
function intermediateSnapshot(
  iv: Record<string, number | null>,
): DiagnosticIntermediateValues {
  return {
    atmosphericPressureKpa: iv.atmosphericPressureKpa ?? null,
    psychrometricConstantKpaC: iv.psychrometricConstantKpaC ?? null,
    saturationVapourPressureKpa: iv.saturationVapourPressureKpa ?? null,
    actualVapourPressureKpa: iv.actualVapourPressureKpa ?? null,
    vapourPressureDeficitKpa: iv.vapourPressureDeficitKpa ?? null,
    saturationSlopeKpaC: iv.saturationSlopeKpaC ?? null,
    extraterrestrialRadiationMjM2Day: iv.extraterrestrialRadiationMjM2Day ?? null,
    clearSkyRadiationMjM2Day: iv.clearSkyRadiationMjM2Day ?? null,
    netShortwaveRadiationMjM2Day: iv.netShortwaveRadiationMjM2Day ?? null,
    netLongwaveRadiationMjM2Day: iv.netLongwaveRadiationMjM2Day ?? null,
    netRadiationMjM2Day: iv.netRadiationMjM2Day ?? null,
    soilHeatFluxMjM2Day: iv.soilHeatFluxMjM2Day ?? null,
    windSpeed2mMs: iv.windSpeed2mMs ?? null,
  };
}

// ── ETo atual do sistema (série C do gráfico) ───────────────────────────────
// A ETo que HOJE alimenta o balanço hídrico está em
// weather_readings.et0_calculated, ingerida pelo provider LEGADO
// (irrigation.service.ts::calculateET0) quando origin='open_meteo'.
// Se não houver linha para o dia OU origin != 'open_meteo', devolve null.
export async function loadCurrentSystemEto(
  supabase: SupabaseClient,
  farmId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const { data: stations } = await supabase
    .from("weather_stations")
    .select("id")
    .eq("farm_id", farmId)
    .eq("active", true);
  const ids = (stations ?? []).map((s) => s.id as string);
  if (ids.length === 0) return out;
  const { data: readings } = await supabase
    .from("weather_readings")
    .select("date, et0_calculated, origin")
    .in("station_id", ids)
    .gte("date", startDate)
    .lte("date", endDate);
  for (const r of readings ?? []) {
    if (r.origin !== "open_meteo") continue;
    const d = r.date as string;
    const v =
      typeof r.et0_calculated === "number" && Number.isFinite(r.et0_calculated)
        ? (r.et0_calculated as number)
        : null;
    if (!out.has(d)) out.set(d, v);
  }
  return out;
}

// ── Núcleo do diagnóstico ────────────────────────────────────────────────────
export async function runClimateDiagnostic(
  supabase: SupabaseClient,
  params: { farmId: string; days: AllowedDiagnosticDays },
): Promise<DiagnosticResponse | { error: string; status: number }> {
  if (!ALLOWED_DIAGNOSTIC_DAYS.includes(params.days)) {
    return { error: "período inválido — use 7, 14 ou 30 dias", status: 400 };
  }

  const resolved = await resolveLocation(supabase, params.farmId);
  if (resolved === null) {
    return { error: "fazenda inacessível", status: 403 };
  }
  if ("error" in resolved) {
    // Coordenada inválida / ausente — não chamar Open-Meteo com lixo.
    return { error: resolved.error, status: 400 };
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime());
  startDate.setUTCDate(startDate.getUTCDate() - (params.days - 1));
  const startIso = startDate.toISOString().slice(0, 10);
  const endIso = endDate.toISOString().slice(0, 10);

  // Chamada REAL à Open-Meteo (server-only)
  const provider = createOpenMeteoProvider();
  let daily: DailyWeatherData[];
  try {
    daily = await provider.fetchDaily(resolved.location, {
      startDate: startIso,
      endDate: endIso,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Open-Meteo indisponível: ${err.message}`
          : "Open-Meteo indisponível",
      status: 502,
    };
  }

  // Série C: ETo atual do sistema
  const currentByDate = await loadCurrentSystemEto(
    supabase,
    params.farmId,
    startIso,
    endIso,
  );

  const rows: DiagnosticDailyRow[] = daily.map((d) => {
    const input = toReferenceEtoInput(d);
    const eto = calculateReferenceEtoFao56(input);
    const cotrim = eto.etoMmDay;
    const om = d.providerReferenceEtoMm;
    const absDiff =
      cotrim !== null && om !== null ? cotrim - om : null;
    const pctDiff =
      cotrim !== null && om !== null && om !== 0
        ? ((cotrim - om) / om) * 100
        : null;

    return {
      date: d.date,
      etoCotrimMm: cotrim,
      etoOpenMeteoMm: om,
      currentSystemEtoMm: currentByDate.get(d.date) ?? null,
      absoluteDifferenceMm: absDiff,
      percentageDifferencePct: pctDiff,
      tMinC: d.temperatureMinC,
      tMaxC: d.temperatureMaxC,
      tMeanC: d.temperatureMeanC,
      rhMinPct: d.relativeHumidityMinPct,
      rhMaxPct: d.relativeHumidityMaxPct,
      rhMeanPct: d.relativeHumidityMeanPct,
      wind10mMs: d.windSpeed10mMs,
      wind2mMs: d.windSpeed2mMs,
      solarRadiationMjM2Day: d.solarRadiationMjM2Day,
      surfacePressureKpa: d.surfacePressureKpa,
      vpdKpa: d.vapourPressureDeficitKpa,
      precipitationMm: d.precipitationMm,
      qualityStatus: eto.qualityStatus,
      dataType: d.metadata.dataType,
      provider: d.metadata.provider,
      estimatedFields: eto.estimatedFields.map((f) => f.field),
      missingFields: eto.missingFields,
      warnings: [...d.metadata.warnings, ...eto.warnings],
      intermediateValues: intermediateSnapshot(
        eto.intermediateValues as unknown as Record<string, number | null>,
      ),
    };
  });

  return {
    farmId: params.farmId,
    farmName: resolved.farmName,
    location: resolved.location,
    periodDays: params.days,
    startDate: startIso,
    endDate: endIso,
    runAt: new Date().toISOString(),
    rows,
    summary: computeSummary(rows),
  };
}
