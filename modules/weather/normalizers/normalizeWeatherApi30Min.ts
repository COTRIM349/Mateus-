import { adjustWindToTwoMeters } from "@/modules/weather/conversions/weatherUnits";
import type {
  WeatherInterval30MinData,
  WeatherLocation,
  WeatherQualityStatus,
} from "@/modules/weather/types/weatherTypes";
import type {
  WeatherApiForecastPayload,
  WeatherApiHour,
} from "@/modules/weather/providers/weatherApiHourly";

export interface NormalizedWeatherApi30Min extends WeatherInterval30MinData {}

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

function epochMs(hour: WeatherApiHour): number | null {
  if (typeof hour.time_epoch === "number" && Number.isFinite(hour.time_epoch)) {
    return hour.time_epoch * 1000;
  }
  return null;
}

function qualityFor(values: {
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  dewPointC: number | null;
  windSpeed10mMs: number | null;
  surfacePressureKpa: number | null;
  solarRadiationWm2: number | null;
}): { status: WeatherQualityStatus; missingFields: string[] } {
  const missingFields: string[] = [];
  if (values.temperatureC === null) missingFields.push("temperatureC");
  if (values.relativeHumidityPct === null) missingFields.push("relativeHumidityPct");
  if (values.dewPointC === null) missingFields.push("dewPointC");
  if (values.windSpeed10mMs === null) missingFields.push("windSpeed10mMs");
  if (values.surfacePressureKpa === null) missingFields.push("surfacePressureKpa");
  if (values.solarRadiationWm2 === null) missingFields.push("solarRadiationWm2");
  // precip_mm e um acumulado horario; nao e dividido artificialmente em 30 min.
  missingFields.push("precipitationMm");
  return {
    status: missingFields.length === 0 ? "complete" : "partial",
    missingFields,
  };
}

export function normalizeWeatherApiHourlyTo30Min(input: {
  payload: WeatherApiForecastPayload;
  location: WeatherLocation;
  fetchedAt: string;
  requestUrl: string;
}): NormalizedWeatherApi30Min[] {
  const hours = input.payload.forecast?.forecastday?.flatMap((day) => day.hour ?? []) ?? [];
  if (hours.length < 2) return [];

  const sorted = [...hours]
    .filter((hour) => epochMs(hour) !== null)
    .sort((a, b) => (epochMs(a) ?? 0) - (epochMs(b) ?? 0));

  const rows: NormalizedWeatherApi30Min[] = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aEpoch = epochMs(a);
    const bEpoch = epochMs(b);
    if (aEpoch === null || bEpoch === null) continue;
    if (bEpoch - aEpoch !== 60 * 60_000) continue;

    for (const fraction of [0.5, 1] as const) {
      const intervalEndEpoch = aEpoch + fraction * 60 * 60_000;
      const intervalEnd = new Date(intervalEndEpoch).toISOString();
      const intervalStart = new Date(intervalEndEpoch - 30 * 60_000).toISOString();

      const temperatureC = lerp(finite(a.temp_c), finite(b.temp_c), fraction);
      const relativeHumidityPct = lerp(finite(a.humidity), finite(b.humidity), fraction);
      const dewPointC = lerp(finite(a.dewpoint_c), finite(b.dewpoint_c), fraction);

      const windA = finite(a.wind_kph);
      const windB = finite(b.wind_kph);
      const windSpeed10mMs = lerp(
        windA === null ? null : windA / 3.6,
        windB === null ? null : windB / 3.6,
        fraction,
      );
      const windDirectionDeg = lerpDirection(
        finite(a.wind_degree),
        finite(b.wind_degree),
        fraction,
      );

      const pressureMb = lerp(finite(a.pressure_mb), finite(b.pressure_mb), fraction);
      const surfacePressureKpa = pressureMb === null ? null : pressureMb / 10;
      const solarRadiationWm2 = lerp(finite(a.short_rad), finite(b.short_rad), fraction);

      const quality = qualityFor({
        temperatureC,
        relativeHumidityPct,
        dewPointC,
        windSpeed10mMs,
        surfacePressureKpa,
        solarRadiationWm2,
      });

      const warnings = [
        "WeatherAPI forecast possui resolucao horaria; intervalo Cotrim de 30 min e interpolado.",
        "Precipitacao horaria nao foi dividida em dois intervalos de 30 min; valor mantido como null.",
        "short_rad so e utilizado quando vier no payload; no plano gratuito normalmente permanece null.",
        "pressure_mb foi convertido de mb/hPa para kPa e deve ser validado contra altitude/pressao FAO-56 na etapa de ETo.",
      ];

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
        solarRadiationWm2,
        surfacePressureKpa,
        metadata: {
          provider: "weatherapi",
          modelName: "weatherapi_forecast",
          dataType: "forecast",
          forecastIssuedAt: null,
          validAt: intervalEnd,
          fetchedAt: input.fetchedAt,
          sourceReference: input.requestUrl,
          qualityStatus: quality.status,
          missingFields: quality.missingFields,
          warnings,
          sourceResolutionMinutes: 60,
          interpolated: true,
          estimated: true,
        },
      });
    }
  }

  return rows;
}
