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

export interface ClimateSeriesWindow {
  seriesEnd: string;
  historicalMissing: string[];
  openMissing: string[];
  blockingMessage: string | null;
  notice: string | null;
}

export function datesInRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || end < cursor) return dates;
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Monta ETo/chuva por data sem exigir aprovação humana.
 * Prefere a leitura da seleção diária; completa lacunas com qualquer leitura
 * que tenha ETo válida (calculada ou de modelo).
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

/**
 * Decide se o balanço pode rodar e até quando.
 * Falta de ETo no dia corrente (ou futuro) não bloqueia: a série recua.
 */
export function resolveClimateSeriesWindow(
  dateStart: string,
  dateEnd: string,
  weatherByDate: Record<string, EngineWeatherPoint>,
  today = utcTodayIso(),
): ClimateSeriesWindow {
  const missing = datesInRange(dateStart, dateEnd).filter((date) => !weatherByDate[date]);
  const { historical, open } = classifyMissingClimateDays(missing, today);
  const seriesEnd = effectiveClimateEndDate(dateEnd, weatherByDate, today);

  if (historical.length > 0) {
    const sample = historical.slice(0, 3).join(", ");
    return {
      seriesEnd,
      historicalMissing: historical,
      openMissing: open,
      blockingMessage: `Balanço bloqueado: ${historical.length} dia(s) encerrado(s) sem ETo (${sample}${historical.length > 3 ? ", …" : ""}). O clima sincroniza automaticamente — tente novamente em instantes.`,
      notice: null,
    };
  }

  if (!weatherByDate[seriesEnd]) {
    return {
      seriesEnd,
      historicalMissing: historical,
      openMissing: open,
      blockingMessage:
        "Balanço bloqueado: nenhum dia do período tem ETo. O clima sincroniza automaticamente — tente novamente em instantes.",
      notice: null,
    };
  }

  const notice =
    open.length > 0 && seriesEnd < dateEnd
      ? `ETo de ${open.join(", ")} ainda está atualizando. Balanço calculado até ${seriesEnd}.`
      : null;

  return {
    seriesEnd,
    historicalMissing: historical,
    openMissing: open,
    blockingMessage: null,
    notice,
  };
}
