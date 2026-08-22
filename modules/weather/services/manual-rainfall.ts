/**
 * Lançamento de chuva manual (pluviômetro / observação de campo).
 *
 * Ground truth de precipitação por fazenda/data. Sobrescreve a chuva da
 * leitura climática aprovada quando use_in_balance=true. Não inventa ETo.
 */

import { roundTo } from "@/utils/math";
import { calculateEffectivePrecipitation } from "./weather.service";

export const MANUAL_RAIN_UNIT = "mm (chuva bruta do dia)";
export const MANUAL_RAIN_MAX_MM = 500;
export const MANUAL_RAIN_OVERRIDE_NOTE =
  "Chuva manual tem prioridade sobre a precipitação da estação no balanço.";

export function validateManualRainfallMm(mm: number): string | null {
  if (!Number.isFinite(mm)) return "Informe a chuva do dia (mm).";
  if (mm < 0) return "Chuva não pode ser negativa.";
  if (mm > MANUAL_RAIN_MAX_MM) {
    return `Chuva acima de ${MANUAL_RAIN_MAX_MM} mm — confira o valor.`;
  }
  return null;
}

export function validateReadingDate(dateYmd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return "Informe a data no formato AAAA-MM-DD.";
  }
  const t = Date.parse(`${dateYmd}T12:00:00Z`);
  if (Number.isNaN(t)) return "Data inválida.";
  const today = new Date().toISOString().slice(0, 10);
  if (dateYmd > today) return "Não é permitido lançar chuva em data futura.";
  return null;
}

export interface ManualRainfallDraft {
  farmId: string;
  readingDate: string;
  precipitationMm: number;
  notes?: string | null;
  useInBalance?: boolean;
  observedBy?: string | null;
}

/** Payload persistido em manual_rainfall. */
export function buildManualRainfallInsert(draft: ManualRainfallDraft): {
  farm_id: string;
  reading_date: string;
  precipitation_mm: number;
  use_in_balance: boolean;
  notes: string | null;
  observed_by: string | null;
  updated_at: string;
} {
  const dateErr = validateReadingDate(draft.readingDate);
  if (dateErr) throw new Error(dateErr);
  const mmErr = validateManualRainfallMm(draft.precipitationMm);
  if (mmErr) throw new Error(mmErr);

  return {
    farm_id: draft.farmId,
    reading_date: draft.readingDate,
    precipitation_mm: roundTo(draft.precipitationMm, 2),
    use_in_balance: draft.useInBalance !== false,
    notes: draft.notes?.trim() ? draft.notes.trim() : null,
    observed_by: draft.observedBy ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function effectivePrecipFromManual(mm: number): number {
  return calculateEffectivePrecipitation(Math.max(mm, 0));
}

/** Mapa data → chuva bruta (mm) a partir das linhas ativas no balanço. */
export function sumManualRainByDate(
  rows: Array<{ reading_date: string; precipitation_mm: number; use_in_balance?: boolean | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.use_in_balance === false) continue;
    const d = r.reading_date.slice(0, 10);
    out[d] = roundTo((out[d] ?? 0) + Math.max(r.precipitation_mm, 0), 2);
  }
  return out;
}

export interface WeatherDayPrecip {
  et0: number;
  precipitation: number;
}

/**
 * Aplica chuva manual sobre o mapa climático do motor.
 * Mantém ETo; só troca precipitação nos dias com lançamento ativo.
 * Dias só com chuva manual (sem ETo) não entram — não inventamos clima.
 */
export function applyManualRainfallOverride<T extends WeatherDayPrecip>(
  weatherByDate: Record<string, T>,
  manualByDate: Record<string, number>,
): Record<string, T> {
  const out: Record<string, T> = { ...weatherByDate };
  for (const [date, mm] of Object.entries(manualByDate)) {
    const existing = out[date];
    if (!existing) continue;
    out[date] = { ...existing, precipitation: roundTo(Math.max(mm, 0), 2) };
  }
  return out;
}

/** Lista quais datas do clima tiveram chuva sobrescrita. */
export function listManualOverrideDates(
  weatherDates: string[],
  manualByDate: Record<string, number>,
): string[] {
  return weatherDates.filter((d) => d in manualByDate).sort();
}
