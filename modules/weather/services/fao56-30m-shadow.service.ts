import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateReferenceEtoFao56Subdaily } from "@/modules/weather/calculations/referenceEtoFao56Subdaily";

interface StationRow {
  id: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string;
  shadow_mode: boolean;
  active: boolean;
}

interface ConsensusRow {
  id: string;
  virtual_station_id: string;
  interval_start: string;
  interval_end: string;
  local_date: string;
  evaluated_at: string;
  confidence: string;
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  dew_point_c: number | null;
  surface_pressure_kpa: number | null;
  wind_speed_2m_ms: number | null;
  solar_radiation_wm2: number | null;
  provenance: Record<string, unknown> | null;
  warnings: string[] | null;
}

export interface Fao5630MinShadowResult {
  etoId: string;
  consensusId: string;
  intervalStart: string;
  intervalEnd: string;
  etoMm30Min: number | null;
  etoRateMmH: number | null;
  qualityStatus: string;
  isDaylight: boolean | null;
  cloudinessInherited: boolean;
}

export const MAX_INHERITED_CLOUDINESS_AGE_HOURS = 36;

export function inheritedCloudinessCutoff(before: string): string {
  const timestamp = new Date(before).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Intervalo de referencia invalido");
  return new Date(
    timestamp - MAX_INHERITED_CLOUDINESS_AGE_HOURS * 60 * 60 * 1_000,
  ).toISOString();
}

async function latestDaylightCloudinessRatio(
  supabase: SupabaseClient,
  stationId: string,
  before: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("weather_eto_30m_shadow")
    .select("cloudiness_ratio, interval_end")
    .eq("virtual_station_id", stationId)
    .eq("is_daylight", true)
    .gte("interval_end", inheritedCloudinessCutoff(before))
    .lt("interval_end", before)
    .not("cloudiness_ratio", "is", null)
    .order("interval_end", { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  const ratio = data[0].cloudiness_ratio;
  return typeof ratio === "number" && Number.isFinite(ratio) ? ratio : null;
}

export async function calculateFao5630MinShadow(
  supabase: SupabaseClient,
  input: { virtualStationId: string; intervalStart: string; intervalEnd: string },
): Promise<Fao5630MinShadowResult> {
  const { data: stationData, error: stationError } = await supabase
    .from("virtual_weather_stations")
    .select("id, latitude, longitude, elevation_m, timezone, shadow_mode, active")
    .eq("id", input.virtualStationId)
    .eq("active", true)
    .single();

  if (stationError || !stationData) {
    throw new Error(stationError?.message ?? "Estacao virtual nao encontrada");
  }
  const station = stationData as StationRow;
  if (!station.shadow_mode) throw new Error("CLIMA 7 exige shadow_mode=true");

  const { data: consensusData, error: consensusError } = await supabase
    .from("weather_interval_30m_consensus_shadow")
    .select("id, virtual_station_id, interval_start, interval_end, local_date, evaluated_at, confidence, temperature_c, relative_humidity_pct, dew_point_c, surface_pressure_kpa, wind_speed_2m_ms, solar_radiation_wm2, provenance, warnings")
    .eq("virtual_station_id", input.virtualStationId)
    .eq("interval_start", input.intervalStart)
    .eq("interval_end", input.intervalEnd)
    .order("evaluated_at", { ascending: false })
    .limit(1);

  if (consensusError) throw new Error(consensusError.message);
  if (!consensusData?.length) {
    throw new Error("Consenso CLIMA 6 nao encontrado para o intervalo");
  }
  const consensus = consensusData[0] as ConsensusRow;

  const inheritedCloudinessRatio = await latestDaylightCloudinessRatio(
    supabase,
    station.id,
    input.intervalStart,
  );

  const result = calculateReferenceEtoFao56Subdaily({
    intervalStart: consensus.interval_start,
    intervalEnd: consensus.interval_end,
    latitude: station.latitude,
    longitude: station.longitude,
    elevationM: station.elevation_m,
    timezone: station.timezone,
    temperatureC: consensus.temperature_c,
    relativeHumidityPct: consensus.relative_humidity_pct,
    dewPointC: consensus.dew_point_c,
    surfacePressureKpa: consensus.surface_pressure_kpa,
    windSpeed2mMs: consensus.wind_speed_2m_ms,
    solarRadiationWm2: consensus.solar_radiation_wm2,
    inheritedCloudinessRatio,
  });

  const i = result.intermediate;
  const { data: etoRow, error: insertError } = await supabase
    .from("weather_eto_30m_shadow")
    .insert({
      virtual_station_id: station.id,
      consensus_id: consensus.id,
      interval_start: consensus.interval_start,
      interval_end: consensus.interval_end,
      local_date: consensus.local_date,
      method: "fao_56_penman_monteith_subdaily",
      formula_version: "clima7-v1",
      shadow_mode: true,
      eto_mm_30m: result.etoMmInterval,
      eto_rate_mm_h: result.etoRateMmH,
      quality_status: result.qualityStatus,
      temperature_c: consensus.temperature_c,
      relative_humidity_pct: consensus.relative_humidity_pct,
      dew_point_c: consensus.dew_point_c,
      surface_pressure_kpa: i.atmosphericPressureKpa,
      wind_speed_2m_ms: consensus.wind_speed_2m_ms,
      solar_radiation_wm2: consensus.solar_radiation_wm2,
      elevation_m: station.elevation_m,
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone,
      solar_radiation_mj_m2_interval: i.solarRadiationMjM2Interval,
      extraterrestrial_radiation_mj_m2_interval: i.extraterrestrialRadiationMjM2Interval,
      clear_sky_radiation_mj_m2_interval: i.clearSkyRadiationMjM2Interval,
      cloudiness_ratio: i.cloudinessRatio,
      net_shortwave_radiation_mj_m2_h: i.netShortwaveRadiationMjM2H,
      net_longwave_radiation_mj_m2_h: i.netLongwaveRadiationMjM2H,
      net_radiation_mj_m2_h: i.netRadiationMjM2H,
      soil_heat_flux_mj_m2_h: i.soilHeatFluxMjM2H,
      saturation_vapour_pressure_kpa: i.saturationVapourPressureKpa,
      actual_vapour_pressure_kpa: i.actualVapourPressureKpa,
      vapour_pressure_deficit_kpa: i.vapourPressureDeficitKpa,
      saturation_slope_kpa_c: i.saturationSlopeKpaC,
      psychrometric_constant_kpa_c: i.psychrometricConstantKpaC,
      aerodynamic_term: i.aerodynamicTerm,
      radiation_term: i.radiationTerm,
      is_daylight: result.isDaylight,
      pressure_estimated_from_elevation: result.pressureEstimatedFromElevation,
      cloudiness_inherited: result.cloudinessInherited,
      missing_fields: result.missingFields,
      warnings: [...(consensus.warnings ?? []), ...result.warnings],
      provenance: {
        consensusId: consensus.id,
        consensusConfidence: consensus.confidence,
        consensusEvaluatedAt: consensus.evaluated_at,
        climateProvenance: consensus.provenance ?? {},
        inheritedCloudinessRatio,
      },
    })
    .select("id")
    .single();

  if (insertError || !etoRow) {
    throw new Error(insertError?.message ?? "Falha ao persistir ETo CLIMA 7 Shadow");
  }

  return {
    etoId: etoRow.id as string,
    consensusId: consensus.id,
    intervalStart: consensus.interval_start,
    intervalEnd: consensus.interval_end,
    etoMm30Min: result.etoMmInterval,
    etoRateMmH: result.etoRateMmH,
    qualityStatus: result.qualityStatus,
    isDaylight: result.isDaylight,
    cloudinessInherited: result.cloudinessInherited,
  };
}
