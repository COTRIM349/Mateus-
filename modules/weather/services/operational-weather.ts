import { operationalEtoMm } from "./operational-eto";

export interface OperationalReadingInput {
  id: string;
  date: string;
  et0_calculated?: number | null;
  et0_source?: number | null;
  precipitation?: number | null;
}

export interface OperationalSelectionInput {
  date: string;
  selected_reading_id?: string | null;
}

export interface EngineWeatherPoint {
  et0: number;
  precipitation: number;
}

/**
 * Monta ETo/chuva por data sem exigir aprovação humana.
 * Prefere a leitura da seleção diária; completa lacunas com qualquer leitura
 * que tenha ETo válida.
 */
export function assembleWeatherByDate(
  readings: OperationalReadingInput[],
  selections: OperationalSelectionInput[] = [],
): Record<string, EngineWeatherPoint> {
  const weatherByDate: Record<string, EngineWeatherPoint> = {};
  const readingsById = new Map(readings.map((r) => [r.id, r]));

  for (const sel of selections) {
    const readingId = sel.selected_reading_id;
    if (!readingId) continue;
    const reading = readingsById.get(readingId);
    const et0 = reading ? operationalEtoMm(reading) : null;
    if (et0 == null || !reading) continue;
    weatherByDate[sel.date] = {
      et0,
      precipitation: reading.precipitation ?? 0,
    };
  }

  for (const reading of readings) {
    if (weatherByDate[reading.date]) continue;
    const et0 = operationalEtoMm(reading);
    if (et0 == null) continue;
    weatherByDate[reading.date] = {
      et0,
      precipitation: reading.precipitation ?? 0,
    };
  }

  return weatherByDate;
}

export function utcTodayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function classifyMissingClimateDays(
  missingDates: string[],
  today = utcTodayIso(),
): { historical: string[]; open: string[] } {
  const historical: string[] = [];
  const open: string[] = [];
  for (const date of missingDates) {
    if (date >= today) open.push(date);
    else historical.push(date);
  }
  return { historical, open };
}

/** Último dia com clima quando o dia corrente ainda não fechou. */
export function effectiveClimateEndDate(
  dateEnd: string,
  weatherByDate: Record<string, EngineWeatherPoint>,
  today = utcTodayIso(),
): string {
  if (dateEnd < today) return dateEnd;
  if (weatherByDate[dateEnd]) return dateEnd;
  const available = Object.keys(weatherByDate).filter((d) => d <= dateEnd).sort();
  return available.at(-1) ?? dateEnd;
}
