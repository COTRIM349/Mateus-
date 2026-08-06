// ============================================================================
// modules/weather/diagnostics/openMeteoEtoDiagnostic.ts
// ----------------------------------------------------------------------------
// Serviço ISOLADO de diagnóstico. Compara, para uma localização e um dia:
//   • ETo entregue pela Open-Meteo (providerReferenceEtoMm)
//   • ETo calculada internamente pela Cotrim (motor FAO-56 da Etapa 2)
//
// NÃO é chamado por rota, tela, cron ou pelo balanço hídrico. Existe apenas
// para revisão manual/teste. Ver OPENMETEO_INTEGRATION.md §"Modo paralelo".
// ============================================================================

import type {
  DailyWeatherData,
  WeatherFetchRange,
  WeatherLocation,
  WeatherQualityStatus,
  WeatherSourceMetadata,
} from "@/modules/weather/types/weatherTypes";
import type { WeatherProvider } from "@/modules/weather/providers/weatherProvider";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";
import type {
  EstimatedField,
  ReferenceEtoInput,
} from "@/modules/weather/calculations/referenceEtoTypes";

export interface EtoDiagnosticEntry {
  date: string;
  location: WeatherLocation;
  providerMetadata: WeatherSourceMetadata;
  providerEtoMm: number | null;
  internalEtoMm: number | null;
  absoluteDifferenceMm: number | null;
  percentageDifferencePct: number | null;
  inputQualityStatus: WeatherQualityStatus;
  missingFields: string[];
  estimatedFields: EstimatedField[];
  warnings: string[];
  variablesUsed: string[];
  calculationDate: string; // ISO UTC do momento da comparação
}

export interface EtoDiagnosticResult {
  provider: string;
  location: WeatherLocation;
  entries: EtoDiagnosticEntry[];
  runAt: string;
}

/** Converte um DailyWeatherData no input do motor FAO-56 preservando null. */
export function toReferenceEtoInput(day: DailyWeatherData): ReferenceEtoInput {
  return {
    date: day.date,
    latitude: day.location.latitude,
    elevationM: day.location.elevationM,
    temperatureMinC: day.temperatureMinC,
    temperatureMaxC: day.temperatureMaxC,
    temperatureMeanC: day.temperatureMeanC,
    relativeHumidityMinPct: day.relativeHumidityMinPct,
    relativeHumidityMaxPct: day.relativeHumidityMaxPct,
    relativeHumidityMeanPct: day.relativeHumidityMeanPct,
    // Open-Meteo não expõe ea diretamente — deixamos null para o motor
    // derivar de RHmin/RHmax ou RHmean, exatamente como decidido na Etapa 2.
    actualVapourPressureKpa: null,
    windSpeedMs: day.windSpeed10mMs,          // vento ORIGINAL
    windMeasurementHeightM: 10,                // vento original é a 10 m
    solarRadiationMjM2Day: day.solarRadiationMjM2Day,
    surfacePressureKpa: day.surfacePressureKpa,
  };
}

function variablesActuallyUsed(day: DailyWeatherData): string[] {
  const used: string[] = [];
  if (day.temperatureMinC !== null) used.push("temperatureMinC");
  if (day.temperatureMaxC !== null) used.push("temperatureMaxC");
  if (day.temperatureMeanC !== null) used.push("temperatureMeanC");
  if (day.relativeHumidityMinPct !== null) used.push("relativeHumidityMinPct");
  if (day.relativeHumidityMaxPct !== null) used.push("relativeHumidityMaxPct");
  if (day.relativeHumidityMeanPct !== null) used.push("relativeHumidityMeanPct");
  if (day.windSpeed10mMs !== null) used.push("windSpeed10mMs");
  if (day.solarRadiationMjM2Day !== null) used.push("solarRadiationMjM2Day");
  if (day.surfacePressureKpa !== null) used.push("surfacePressureKpa");
  return used;
}

/** Executa provider.fetchDaily → normaliza → FAO-56 → compara, por dia. */
export async function runOpenMeteoEtoDiagnostic(
  provider: WeatherProvider,
  location: WeatherLocation,
  range: WeatherFetchRange,
): Promise<EtoDiagnosticResult> {
  const runAt = new Date().toISOString();
  const days = await provider.fetchDaily(location, range);
  const entries: EtoDiagnosticEntry[] = days.map((day) => {
    const input = toReferenceEtoInput(day);
    const eto = calculateReferenceEtoFao56(input);
    const internalEto = eto.etoMmDay;
    const providerEto = day.providerReferenceEtoMm;
    const absDiff =
      internalEto !== null && providerEto !== null
        ? Math.abs(internalEto - providerEto)
        : null;
    const pctDiff =
      internalEto !== null && providerEto !== null && providerEto !== 0
        ? ((internalEto - providerEto) / providerEto) * 100
        : null;

    return {
      date: day.date,
      location: day.location,
      providerMetadata: day.metadata,
      providerEtoMm: providerEto,
      internalEtoMm: internalEto,
      absoluteDifferenceMm: absDiff,
      percentageDifferencePct: pctDiff,
      inputQualityStatus: eto.qualityStatus,
      missingFields: eto.missingFields,
      estimatedFields: eto.estimatedFields,
      warnings: [...day.metadata.warnings, ...eto.warnings],
      variablesUsed: variablesActuallyUsed(day),
      calculationDate: new Date().toISOString(),
    };
  });

  return {
    provider: provider.name,
    location,
    entries,
    runAt,
  };
}
