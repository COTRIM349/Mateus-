import { adjustWindToTwoMeters } from "@/modules/weather/conversions/weatherUnits";
import type {
  WeatherDataType,
  WeatherInterval30MinData,
  WeatherLocation,
  WeatherQualityStatus,
} from "@/modules/weather/types/weatherTypes";
import type { MeteoblueHourlyPayload } from "@/modules/weather/providers/meteoblueHourly";

export interface NormalizedMeteoblue30Min extends WeatherInterval30MinData {}

function finiteAt(values: (number | null)[] | undefined, index: number): number | null {
  if (!values) return null;
  const value = values[index];
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

function parseUtc(value: string): string | null {
  const iso = value.endsWith("Z") ? value : `${value}Z`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function qualityFor(values: {
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeed10mMs: number | null;
}): { status: WeatherQualityStatus; missingFields: string[] } {
  const missingFields: string[] = [];
  if (values.temperatureC === null) missingFields.push("temperatureC");
  if (values.relativeHumidityPct === null) missingFields.push("relativeHumidityPct");
  if (values.windSpeed10mMs === null) missingFields.push("windSpeed10mMs");
  // basic-1h nao entrega radiação; chuva sub-horaria nao e inferida.
  missingFields.push("solarRadiationWm2", "precipitationMm", "surfacePressureKpa");
  return { status: "partial", missingFields };
}

export function normalizeMeteoblueHourlyTo30Min(input: {
  payload: MeteoblueHourlyPayload;
  location: WeatherLocation;
  fetchedAt: string;
  requestUrl: string;
}): NormalizedMeteoblue30Min[] {
  const block = input.payload.data_1h;
  if (!block?.time || block.time.length < 2) return [];

  const rows: NormalizedMeteoblue30Min[] = [];
  const fetchedEpoch = new Date(input.fetchedAt).getTime();

  for (let i = 0; i < block.time.length - 1; i += 1) {
    const startIso = parseUtc(block.time[i]);
    const nextIso = parseUtc(block.time[i + 1]);
    if (!startIso || !nextIso) continue;

    const startEpoch = new Date(startIso).getTime();
    const nextEpoch = new Date(nextIso).getTime();
    if (nextEpoch - startEpoch !== 60 * 60_000) continue;

    for (const fraction of [0.5, 1] as const) {
      const intervalEndEpoch = startEpoch + fraction * 60 * 60_000;
      const intervalEnd = new Date(intervalEndEpoch).toISOString();
      const intervalStart = new Date(intervalEndEpoch - 30 * 60_000).toISOString();

      const temperatureC = lerp(
        finiteAt(block.temperature, i),
        finiteAt(block.temperature, i + 1),
        fraction,
      );
      const relativeHumidityPct = lerp(
        finiteAt(block.relativehumidity, i),
        finiteAt(block.relativehumidity, i + 1),
        fraction,
      );
      const windSpeed10mMs = lerp(
        finiteAt(block.windspeed, i),
        finiteAt(block.windspeed, i + 1),
        fraction,
      );
      const windDirectionDeg = lerpDirection(
        finiteAt(block.winddirection, i),
        finiteAt(block.winddirection, i + 1),
        fraction,
      );
      const quality = qualityFor({ temperatureC, relativeHumidityPct, windSpeed10mMs });
      const dataType: WeatherDataType = intervalEndEpoch > fetchedEpoch ? "forecast" : "estimated";

      rows.push({
        location: input.location,
        intervalStart,
        intervalEnd,
        temperatureC,
        relativeHumidityPct,
        dewPointC: null,
        precipitationMm: null,
        windSpeed2mMs:
          windSpeed10mMs === null ? null : adjustWindToTwoMeters(windSpeed10mMs, 10),
        windSpeed10mMs,
        windDirectionDeg,
        solarRadiationWm2: null,
        surfacePressureKpa: null,
        metadata: {
          provider: "meteoblue",
          modelName: input.payload.metadata?.name ?? "meteoblue_basic_1h",
          dataType,
          forecastIssuedAt:
            input.payload.metadata?.modelrun_utc ?? input.payload.metadata?.modelrun_updatetime_utc ?? null,
          validAt: intervalEnd,
          fetchedAt: input.fetchedAt,
          sourceReference: input.requestUrl,
          qualityStatus: quality.status,
          missingFields: quality.missingFields,
          warnings: [
            "Meteoblue basic-1h possui resolucao nativa horaria; intervalo Cotrim de 30 min e interpolado.",
            "Precipitacao sub-horaria nao foi inferida a partir do acumulado horario; valor mantido como null.",
            "Radiacao solar nao esta disponivel no pacote basic-1h usado nesta etapa; valor mantido como null.",
            "Sea-level pressure nao e usada como surface pressure; valor canonico permanece null.",
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
