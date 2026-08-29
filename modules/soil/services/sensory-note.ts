/**
 * Avaliação sensorial de umidade (Etapa G).
 *
 * A nota é subjetiva (tato em campo). Escala operacional: inteiro 1–10.
 * NÃO converter automaticamente para % da CC, mm ou ARM.
 * Calibração nota → θ só entra depois de curva específica por textura/pivô.
 */

export const SENSORY_NOTE_MIN = 1;
export const SENSORY_NOTE_MAX = 10;
export const SENSORY_NOTE_UNIT = "nota 1–10 (adimensional)";
export const SENSORY_AUTO_CONVERT_TO_PCT_CC = false;

export function validateSensoryNote(note: number): string | null {
  if (!Number.isFinite(note) || !Number.isInteger(note)) {
    return "Nota sensorial deve ser um inteiro de 1 a 10.";
  }
  if (note < SENSORY_NOTE_MIN || note > SENSORY_NOTE_MAX) {
    return "Nota sensorial deve ser um inteiro de 1 a 10.";
  }
  return null;
}

export function validateSensoryDepthCm(depthCm: number | null | undefined): string | null {
  if (depthCm == null || Number.isNaN(depthCm)) return "Informe a profundidade avaliada (cm).";
  if (depthCm <= 0 || depthCm > 300) return "Profundidade avaliada deve estar entre 0 e 300 cm.";
  return null;
}

/**
 * Nota operacional para UI/histórico. Prefere `note` (1–10).
 * Leituras antigas (camadas 1–9) entram como nota bruta — nunca como % CC.
 */
export function resolveSensoryNote(row: {
  note?: number | null;
  layer_1_note?: number | null;
  layer_2_note?: number | null;
  layer_3_note?: number | null;
}): number | null {
  if (row.note != null && Number.isFinite(row.note)) return row.note;
  for (const n of [row.layer_1_note, row.layer_2_note, row.layer_3_note]) {
    if (n != null && Number.isFinite(n)) return n;
  }
  return null;
}

export interface SensoryDisplay {
  note: number;
  unit: typeof SENSORY_NOTE_UNIT;
  /** Sempre null na Etapa G — calibração futura. */
  percentCc: null;
}

export function operationalSensoryDisplay(note: number): SensoryDisplay {
  return {
    note,
    unit: SENSORY_NOTE_UNIT,
    percentCc: null,
  };
}

export interface SensoryRecordDraft {
  farmId: string;
  pivotId: string;
  parcelId: string | null;
  readingDate: string;
  observedAt: string;
  note: number;
  depthCm: number;
  notes: string | null;
  /** Umidade medida em % — calibração. Nunca alimenta o motor automaticamente. */
  measuredMoisturePct?: number | null;
}

/** Payload persistido: nota bruta, sem substituir o balanço calculado. */
export function buildSensoryInsert(draft: SensoryRecordDraft): {
  farm_id: string;
  pivot_id: string;
  parcel_id: string | null;
  reading_date: string;
  observed_at: string;
  note: number;
  depth_cm: number;
  notes: string | null;
  measured_moisture_pct: number | null;
  use_in_balance: false;
  layer_1_moisture_pct: null;
  layer_2_moisture_pct: null;
  layer_3_moisture_pct: null;
} {
  return {
    farm_id: draft.farmId,
    pivot_id: draft.pivotId,
    parcel_id: draft.parcelId,
    reading_date: draft.readingDate,
    observed_at: draft.observedAt,
    note: draft.note,
    depth_cm: draft.depthCm,
    notes: draft.notes,
    measured_moisture_pct: draft.measuredMoisturePct ?? null,
    use_in_balance: false,
    layer_1_moisture_pct: null,
    layer_2_moisture_pct: null,
    layer_3_moisture_pct: null,
  };
}

export function combineObservedAt(dateYmd: string, timeHm: string): string {
  const time = /^\d{2}:\d{2}$/.test(timeHm) ? timeHm : "12:00";
  return `${dateYmd}T${time}:00`;
}

export const SENSORY_NOTE_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return { value: String(n), label: String(n) };
});
