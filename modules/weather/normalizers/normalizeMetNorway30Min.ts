import { adjustWindToTwoMeters } from "@/modules/weather/conversions/weatherUnits";
import type {
  WeatherDataType,
  WeatherInterval30MinData,
  WeatherLocation,
  WeatherQualityStatus,
} from "@/modules/weather/types/weatherTypes";
import type {
  MetNorwayCompactPayload,
  MetNorwayInstantDetails,
} from "@/modules/weather/providers/metNorwayHourly";

export interface NormalizedMetNorway30Min extends WeatherInterval30MinData {}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function lerp(a: number | null, b: number | null, fraction: number): number | null {
  return a === null || b === null ? null : a + (b - a) * fraction;
}

function lerpDirection(a: number | null, b: number | null, fraction: number): number | null {
  if (a === null || b === null) return null;
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * fraction + 360) % 360;
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const epoch = new Date(value).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

function qualityFor(values: {
  temperatureC: number | null;
  dewPointC: number | null;
  relativeHumidityPct: number | null;
  windSpeed10mMs: number | null;
}): { status: WeatherQualityStatus; missingFields: string[] } {
  const missingFields: string[] = [];
  if (values.temperatureC === null) missingFields.push("temperatureC");
  if (values.dewPointC === null) missingFields.push("dewPointC");
  if (values.relativeHumidityPct === null) missingFields.push("relativeHumidityPct");
  if (values.windSpeed10mMs === null) missingFields.push("windSpeed10mMs");
  missingFields.push("solarRadiationWm2", "surfacePressureKpa", "precipitationMm");
  return { status: missingFields.length === 0 ? "complete" : "partial", missingFields };
}

function detailsAt(payload: MetNorwayCompactPayload, index: number): MetNorwayInstantDetails {
  return payload.properties?.timeseries?.[index]?.data?.instant?.details ?? {};
}

export function normalizeMetNorwayHourlyTo30Min(input: {
  payload: MetNorwayCompactPayload;
  location: WeatherLocation;
  fetchedAt: string;
  requestUrl: string;
}): NormalizedMetNorway30Min[] {
  const series = input.payload.properties?.timeseries ?? [];
  if (series.length < 2) return [];

  const fetchedEpoch = new Date(input.fetchedAt).getTime();
  const issuedAt = input.payload.properties?.meta?.updated_at ?? null;
  const rows: NormalizedMetNorway30Min[] = [];

  for (let i = 0; i < series.length - 1; i += 1) {
    const startEpoch = parseTime(series[i].time);
    const nextEpoch = parseTime(series[i + 1].time);
    if (startEpoch === null || nextEpoch === null) continue;
    if (nextEpoch - startEpoch !== 60 * 60_000) continue;

    const a = detailsAt(input.payload, i);
    const b = detailsAt(input.payload, i + 1);

    for (const fraction of [0.5, 1] as const) {
      const intervalEndEpoch = startEpoch + fraction * 60 * 60_000;
      const intervalEnd = new Date(intervalEndEpoch).toISOString();
      const intervalStart = new Date(intervalEndEpoch - 30 * 60_000).toISOString();

      const temperatureC = lerp(finite(a.air_temperature), finite(b.air_temperature), fraction);
      const dewPointC = lerp(
        finite(a.dew_point_temperature),
        finite(b.dew_point_temperature),
        fraction,
      );
      const relativeHumidityPct = lerp(
        finite(a.relative_humidity),
        finite(b.relative_humidity),
        fraction,
      );
      const windSpeed10mMs = lerp(finite(a.wind_speed), finite(b.wind_speed), fraction);
      const windDirectionDeg = lerpDirection(
        finite(a.wind_from_direction),
        finite(b.wind_from_direction),
        fraction,
      );
      const quality = qualityFor({ temperatureC, dewPointC, relativeHumidityPct, windSpeed10mMs });
      const dataType: WeatherDataType = intervalEndEpoch > fetchedEpoch ? "forecast" : "estimated";

      rows.push({
        location: input.location,
        intervalStart,
        intervalEnd,
        temperatureC,
        relativeHumidityPct,
        dewPointC,
        precipitationMm: null,
        windSpeed2mMs:
          windSpeed10mMs === null ? null : adjustWindToTwoMeters(windSpeed10mMs, 10),
        windSpeed10mMs,
        windDirectionDeg,
        solarRadiationWm2: null,
        surfacePressureKpa: null,
        metadata: {
          provider: "met_norway",
          modelName: "met_norway_locationforecast_compact",
          dataType,
          forecastIssuedAt: issuedAt,
          validAt: intervalEnd,
          fetchedAt: input.fetchedAt,
          sourceReference: input.requestUrl,
          qualityStatus: quality.status,
          missingFields: quality.missingFields,
          warnings: [
            "MET Norway Locationforecast possui passo horario neste intervalo; candidato Cotrim de 30 min e interpolado.",
            "Precipitacao next_1_hours e acumulado horario e nao foi repartida em dois intervalos de 30 min.",
            "air_pressure_at_sea_level nao foi usada como surfacePressureKpa.",
            "Radiacao solar nao esta disponivel no contrato compacto usado nesta etapa.",
          ],
          sourceResolutionMinutes: 60,
          interpolated: true,
          estimated: true,
        },
      });
    }
  }

  return rows;
}
