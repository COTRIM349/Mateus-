/**
 * Evento real de irrigação (Etapa H).
 *
 * O operador registra a lâmina bruta aplicada. Volume e tempo seguem as
 * fórmulas auditáveis. O evento alimenta o balanço (I → I_ef = I × eficiência).
 * Custo/energia nascem na Etapa J a partir deste evento (não inventar tarifa).
 */

import { roundTo } from "@/utils/math";
import { calculateIrrigationTime, calculateVolume } from "./irrigation.service";

export const IRRIGATION_DEPTH_UNIT = "mm (lâmina bruta aplicada)";
export const IRRIGATION_VOLUME_UNIT = "m³";
export const IRRIGATION_HOURS_UNIT = "h";
export const VOLUME_FORMULA = "Volume m³ = lâmina mm × área ha × 10";
export const HOURS_FORMULA = "Tempo h = volume m³ / vazão m³/h";

export function validateIrrigationDepth(depthMm: number): string | null {
  if (!Number.isFinite(depthMm) || depthMm <= 0) {
    return "Informe a lâmina bruta aplicada (mm), maior que zero.";
  }
  if (depthMm > 200) return "Lâmina aplicada acima de 200 mm — confira o valor.";
  return null;
}

export function validateOperatingHours(hours: number | null | undefined): string | null {
  if (hours == null || Number.isNaN(hours)) return null;
  if (hours < 0) return "Horas de operação não podem ser negativas.";
  if (hours > 72) return "Horas de operação acima de 72 h — confira o valor.";
  return null;
}

export function deriveAppliedVolume(depthMm: number, areaHa: number): number {
  return calculateVolume(Math.max(depthMm, 0), Math.max(areaHa, 0));
}

export function deriveOperatingHours(depthMm: number, areaHa: number, flowRateM3h: number): number {
  return calculateIrrigationTime(deriveAppliedVolume(depthMm, areaHa), flowRateM3h);
}

export function combineStartedAt(dateYmd: string, timeHm: string): string {
  const time = /^\d{2}:\d{2}$/.test(timeHm) ? timeHm : "06:00";
  return `${dateYmd}T${time}:00`;
}

export function endedAtFromHours(startedAt: string, hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return null;
  return new Date(t + hours * 3600000).toISOString();
}

export function eventDateKey(startedAt: string): string {
  return startedAt.slice(0, 10);
}

/** Soma lâminas brutas do mesmo dia — o motor consome este mapa. */
export function sumGrossDepthByDate(
  events: Array<{ started_at: string; depth_mm: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of events) {
    const d = eventDateKey(ev.started_at);
    out[d] = roundTo((out[d] ?? 0) + Math.max(ev.depth_mm, 0), 2);
  }
  return out;
}

export interface IrrigationEventDraft {
  pivotId: string;
  parcelId: string | null;
  dateYmd: string;
  timeHm: string;
  depthMm: number;
  areaHa: number;
  flowRateM3h: number;
  hoursOverride?: number | null;
  notes?: string | null;
}

export function buildIrrigationEventInsert(draft: IrrigationEventDraft): {
  pivot_id: string;
  parcel_id: string | null;
  started_at: string;
  ended_at: string | null;
  depth_mm: number;
  volume_m3: number;
  operating_hours: number;
  notes: string | null;
  status: "concluida";
} {
  const depth = roundTo(draft.depthMm, 2);
  const volume = deriveAppliedVolume(depth, draft.areaHa);
  const derivedHours = deriveOperatingHours(depth, draft.areaHa, draft.flowRateM3h);
  const hours = draft.hoursOverride != null && Number.isFinite(draft.hoursOverride)
    ? roundTo(draft.hoursOverride, 2)
    : derivedHours;
  const startedAt = combineStartedAt(draft.dateYmd, draft.timeHm);
  return {
    pivot_id: draft.pivotId,
    parcel_id: draft.parcelId,
    started_at: startedAt,
    ended_at: endedAtFromHours(startedAt, hours),
    depth_mm: depth,
    volume_m3: volume,
    operating_hours: hours,
    notes: draft.notes ?? null,
    status: "concluida",
  };
}
