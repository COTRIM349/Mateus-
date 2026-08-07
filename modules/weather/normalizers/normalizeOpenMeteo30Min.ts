import { adjustWindToTwoMeters } from "@/modules/weather/conversions/weatherUnits";
import type {
  WeatherDataType,
  WeatherInterval30MinData,
  WeatherLocation,
  WeatherQualityStatus,
} from "@/modules/weather/types/weatherTypes";

export interface OpenMeteoMinutely15Block {
  time?: string[];
  temperature_2m?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  dew_point_2m?: (number | null)[];
  precipitation?: (number | null)[];
  shortwave_radiation?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
  surface_pressure?: (number | null)[];
  vapour_pressure_deficit?: (number | null)[];
}

export interface OpenMeteoMinutely15Payload {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  generationtime_ms?: number;
  minutely_15?: OpenMeteoMinutely15Block;
  minutely_15_units?: Record<string, string>;
}

export interface NormalizedOpenMeteo30Min extends WeatherInterval30MinData {
  vapourPressureDeficitKpa: number | null;
}

function finiteAt(values: (number | null)[] | undefined, index: number): number | null {
  if (!values) return null;
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mean2(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : (a + b) / 2;
}

function sum2(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

function meanDirectionDeg(
  d1: number | null,
  d2: number | null,
  w1: number | null,
  w2: number | null,
): number | null {
  if (d1 === null || d2 === null) return null;
  const weight1 = w1 !== null && w1 > 0 ? w1 : 1;
  const weight2 = w2 !== null && w2 > 0 ? w2 : 1;
  const r1 = (d1 * Math.PI) / 180;
  const r2 = (d2 * Math.PI) / 180;
  const x = Math.cos(r1) * weight1 + Math.cos(r2) * weight2;
  const y = Math.sin(r1) * weight1 + Math.sin(r2) * weight2;
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return null;
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function hpaToKpa(value: number | null): number | null {
  return value === null ? null : value / 10;
}

function utcIsoFromOpenMeteo(value: string): string | null {
  const normalized = value.endsWith("Z") ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function localDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Open-Meteo documenta dados 15-min nativos principalmente em America do
 * Norte e Europa Central. Fora dessas regioes, os valores sao interpolados
 * dos dados horarios. A caixa abaixo e propositalmente conservadora: se nao
 * temos certeza de cobertura nativa, marcamos como interpolado.
 */
export function openMeteoLikelyInterpolates15Min(location: WeatherLocation): boolean {
  const northAmerica =
    location.latitude >= 15 && location.latitude <= 72 &&
    location.longitude >= -170 && location.longitude <= -50;
  const centralEurope =
    location.latitude >= 35 && location.latitude <= 72 &&
    location.longitude >= -25 && location.longitude <= 45;
  return !(northAmerica || centralEurope);
}

function qualityFor(values: {
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeed10mMs: number | null;
  solarRadiationWm2: number | null;
  surfacePressureKpa: number | null;
}): { status: WeatherQualityStatus; missingFields: string[] } {
  const missingFields: string[] = [];
  if (values.temperatureC === null) missingFields.push("temperatureC");
  if (values.relativeHumidityPct === null) missingFields.push("relativeHumidityPct");
  if (values.windSpeed10mMs === null) missingFields.push("windSpeed10mMs");
  if (values.solarRadiationWm2 === null) missingFields.push("solarRadiationWm2");
  if (values.surfacePressureKpa === null) missingFields.push("surfacePressureKpa");
  return {
    status: missingFields.length === 0 ? "complete" : "partial",
    missingFields,
  };
}

export function normalizeOpenMeteo15MinTo30Min(input: {
  payload: OpenMeteoMinutely15Payload;
  location: WeatherLocation;
  fetchedAt: string;
  requestUrl: string;
}): NormalizedOpenMeteo30Min[] {
  const block = input.payload.minutely_15;
  if (!block?.time?.length) return [];

  const byEpoch = new Map<number, number>();
  for (let i = 0; i < block.time.length; i += 1) {
    const iso = utcIsoFromOpenMeteo(block.time[i]);
    if (iso) byEpoch.set(new Date(iso).getTime(), i);
  }

  const fetchedEpoch = new Date(input.fetchedAt).getTime();
  const providerInterpolated = openMeteoLikelyInterpolates15Min(input.location);
  const rows: NormalizedOpenMeteo30Min[] = [];

  for (const [endEpoch, secondIndex] of [...byEpoch.entries()].sort((a, b) => a[0] - b[0])) {
    const end = new Date(endEpoch);
    const minute = end.getUTCMinutes();
    // Fechamos apenas janelas alinhadas 00-30 e 30-00.
    if (minute !== 0 && minute !== 30) continue;

    const firstEpoch = endEpoch - 15 * 60_000;
    const firstIndex = byEpoch.get(firstEpoch);
    if (firstIndex === undefined) continue;

    const intervalStart = new Date(endEpoch - 30 * 60_000).toISOString();
    const intervalEnd = end.toISOString();

    const t = mean2(
      finiteAt(block.temperature_2m, firstIndex),
      finiteAt(block.temperature_2m, secondIndex),
    );
    const rh = mean2(
      finiteAt(block.relative_humidity_2m, firstIndex),
      finiteAt(block.relative_humidity_2m, secondIndex),
    );
    const dew = mean2(
      finiteAt(block.dew_point_2m, firstIndex),
      finiteAt(block.dew_point_2m, secondIndex),
    );
    const rain = sum2(
      finiteAt(block.precipitation, firstIndex),
      finiteAt(block.precipitation, secondIndex),
    );
    const radiation = mean2(
      finiteAt(block.shortwave_radiation, firstIndex),
      finiteAt(block.shortwave_radiation, secondIndex),
    );
    const windFirst = finiteAt(block.wind_speed_10m, firstIndex);
    const windSecond = finiteAt(block.wind_speed_10m, secondIndex);
    const wind10 = mean2(windFirst, windSecond);
    const wind2 = wind10 === null ? null : adjustWindToTwoMeters(wind10, 10);
    const direction = meanDirectionDeg(
      finiteAt(block.wind_direction_10m, firstIndex),
      finiteAt(block.wind_direction_10m, secondIndex),
      windFirst,
      windSecond,
    );
    const pressure = hpaToKpa(mean2(
      finiteAt(block.surface_pressure, firstIndex),
      finiteAt(block.surface_pressure, secondIndex),
    ));
    const vpd = mean2(
      finiteAt(block.vapour_pressure_deficit, firstIndex),
      finiteAt(block.vapour_pressure_deficit, secondIndex),
    );

    const quality = qualityFor({
      temperatureC: t,
      relativeHumidityPct: rh,
      windSpeed10mMs: wind10,
      solarRadiationWm2: radiation,
      surfacePressureKpa: pressure,
    });

    const dataType: WeatherDataType = endEpoch > fetchedEpoch ? "forecast" : "estimated";
    const warnings: string[] = [
      "Intervalo Cotrim de 30 min agregado a partir de dois passos de 15 min do Open-Meteo.",
    ];
    if (providerInterpolated) {
      warnings.push(
        "Open-Meteo 15-min nesta localizacao e tratado como interpolado de dados horarios, conforme documentacao do provedor.",
      );
    }

    rows.push({
      location: input.location,
      intervalStart,
      intervalEnd,
      temperatureC: t,
      relativeHumidityPct: rh,
      dewPointC: dew,
      precipitationMm: rain,
      windSpeed2mMs: wind2,
      windSpeed10mMs: wind10,
      windDirectionDeg: direction,
      solarRadiationWm2: radiation,
      surfacePressureKpa: pressure,
      vapourPressureDeficitKpa: vpd,
      metadata: {
        provider: "open_meteo",
        modelName: "best_match",
        dataType,
        forecastIssuedAt: dataType === "forecast" ? input.fetchedAt : null,
        validAt: intervalEnd,
        fetchedAt: input.fetchedAt,
        sourceReference: input.requestUrl,
        qualityStatus: quality.status,
        missingFields: quality.missingFields,
        warnings,
        sourceResolutionMinutes: providerInterpolated ? 60 : 15,
        interpolated: true,
        estimated: dataType === "estimated",
      },
    });
  }

  return rows;
}
