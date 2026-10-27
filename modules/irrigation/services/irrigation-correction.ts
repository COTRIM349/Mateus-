export interface IrrigationDuplicateCandidate {
  id: string;
  pivot_id: string;
  started_at: string;
  depth_mm: number;
  percentimeter_pct: number | null;
  horimeter_initial: number | null;
  horimeter_final: number | null;
}

function stableNumber(value: number | null | undefined, digits: number): string {
  return value == null || !Number.isFinite(value) ? "null" : value.toFixed(digits);
}

/**
 * Chave conservadora para sinalizar possíveis lançamentos duplicados.
 * Não apaga nada automaticamente: apenas agrupa registros com os mesmos
 * dados operacionais no mesmo pivô e dia.
 */
export function irrigationDuplicateKey(event: IrrigationDuplicateCandidate): string {
  return [
    event.pivot_id,
    event.started_at.slice(0, 10),
    stableNumber(event.depth_mm, 2),
    stableNumber(event.percentimeter_pct, 2),
    stableNumber(event.horimeter_initial, 2),
    stableNumber(event.horimeter_final, 2),
  ].join("|");
}

export function irrigationDuplicateCounts(
  events: IrrigationDuplicateCandidate[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = irrigationDuplicateKey(event);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function isPossibleDuplicate(
  event: IrrigationDuplicateCandidate,
  counts: Map<string, number>,
): boolean {
  return (counts.get(irrigationDuplicateKey(event)) ?? 0) > 1;
}
