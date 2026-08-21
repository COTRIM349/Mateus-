/**
 * Quadrante da parcela no pivô.
 * 0° = Norte, sentido horário (azimute). Lat/lng/raio vêm sempre do equipamento.
 * Ângulos vazios = pivô inteiro. Não inventa coordenada própria da parcela.
 */

export interface ParcelAngles {
  startDeg: number | null;
  endDeg: number | null;
}

const FULL_SWEEP = 359.5;

export function normalizeBearingDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** 360° no final do giro (ex.: 315–360) permanece 360; 0° vira 0. */
export function normalizeEndDeg(deg: number): number {
  if (deg === 360) return 360;
  const n = normalizeBearingDeg(deg);
  return n === 0 ? 0 : n;
}

export function sweepAngleDeg(startDeg: number, endDeg: number): number {
  const start = normalizeBearingDeg(startDeg);
  const end = endDeg === 360 ? 360 : normalizeBearingDeg(endDeg);
  const sweep = (end - start + 360) % 360;
  if (sweep === 0) {
    if (start === 0 && (end === 0 || end === 360)) return 360;
    return 0;
  }
  return sweep;
}

export function isFullCircleParcel(startDeg: number | null, endDeg: number | null): boolean {
  if (startDeg == null && endDeg == null) return true;
  if (startDeg == null || endDeg == null) return false;
  return sweepAngleDeg(startDeg, endDeg) >= FULL_SWEEP;
}

export function sectorFraction(startDeg: number | null, endDeg: number | null): number {
  if (isFullCircleParcel(startDeg, endDeg)) return 1;
  return sweepAngleDeg(startDeg as number, endDeg as number) / 360;
}

export function parcelManagedAreaHa(
  pivotAreaHa: number,
  plantedAreaHa: number | null | undefined,
  startDeg: number | null,
  endDeg: number | null,
): number {
  if (plantedAreaHa != null && Number.isFinite(plantedAreaHa) && plantedAreaHa > 0) {
    return plantedAreaHa;
  }
  return Math.max(pivotAreaHa, 0) * sectorFraction(startDeg, endDeg);
}

function toHalfOpenIntervals(startDeg: number, endDeg: number): Array<[number, number]> {
  const start = normalizeBearingDeg(startDeg);
  const sweep = sweepAngleDeg(startDeg, endDeg);
  if (sweep >= FULL_SWEEP) return [[0, 360]];
  if (start + sweep <= 360) return [[start, start + sweep]];
  return [
    [start, 360],
    [0, start + sweep - 360],
  ];
}

function interiorsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function parcelAnglesOverlap(a: ParcelAngles, b: ParcelAngles): boolean {
  if (isFullCircleParcel(a.startDeg, a.endDeg) || isFullCircleParcel(b.startDeg, b.endDeg)) {
    return true;
  }
  const aInt = toHalfOpenIntervals(a.startDeg as number, a.endDeg as number);
  const bInt = toHalfOpenIntervals(b.startDeg as number, b.endDeg as number);
  return aInt.some((left) => bInt.some((right) => interiorsOverlap(left, right)));
}

export function parseParcelAngles(
  startRaw: string | number | null | undefined,
  endRaw: string | number | null | undefined,
): { startDeg: number | null; endDeg: number | null; error: string | null } {
  const startEmpty = startRaw === "" || startRaw == null;
  const endEmpty = endRaw === "" || endRaw == null;
  if (startEmpty && endEmpty) {
    return { startDeg: null, endDeg: null, error: null };
  }
  if (startEmpty || endEmpty) {
    return {
      startDeg: null,
      endDeg: null,
      error: "Informe o ângulo inicial e o final, ou deixe os dois vazios para o pivô inteiro.",
    };
  }
  const startNum = typeof startRaw === "number" ? startRaw : Number(String(startRaw).replace(",", "."));
  const endNum = typeof endRaw === "number" ? endRaw : Number(String(endRaw).replace(",", "."));
  if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
    return { startDeg: null, endDeg: null, error: "Ângulos da parcela devem ser números (0 a 360)." };
  }
  if (startNum < 0 || startNum > 360 || endNum < 0 || endNum > 360) {
    return { startDeg: null, endDeg: null, error: "Ângulos da parcela devem estar entre 0° e 360°." };
  }
  if (isFullCircleParcel(startNum, endNum)) {
    return { startDeg: null, endDeg: null, error: null };
  }
  if (sweepAngleDeg(startNum, endNum) <= 0) {
    return {
      startDeg: null,
      endDeg: null,
      error: "Ângulo inicial e final iguais não formam um quadrante. Use 0° e 360° para o pivô inteiro.",
    };
  }
  return {
    startDeg: normalizeBearingDeg(startNum),
    endDeg: normalizeEndDeg(endNum) === 0 ? 360 : normalizeEndDeg(endNum),
    error: null,
  };
}

export function formatParcelAngles(startDeg: number | null, endDeg: number | null): string {
  if (isFullCircleParcel(startDeg, endDeg)) return "Pivô inteiro";
  const start = Math.round(startDeg as number);
  const end = Math.round(endDeg as number);
  return `${start}°–${end}°`;
}
