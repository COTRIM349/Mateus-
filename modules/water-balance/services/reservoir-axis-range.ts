/** O zoom altera somente a exibição, jamais os valores agronômicos. */
export type ReservatorioZoom = "total" | "atencao" | "arm";

export function reservoirAxisRange(input: {
  zoom: ReservatorioZoom;
  max: number;
  bounds: Array<{ attention: number; safety: number }>;
  water: number[];
}): { min: number; max: number } {
  if (input.zoom === "total") return { min: 0, max: input.max };
  const values = (input.zoom === "atencao"
    ? input.bounds.flatMap((p) => [p.attention, p.safety])
    : input.water).filter(Number.isFinite);
  if (!values.length) return { min: 0, max: input.max };
  const lo = Math.min(...values), hi = Math.max(...values);
  const margin = Math.max(5, Math.max(hi - lo, 15) * 0.22);
  let min = Math.max(0, Math.floor(lo - margin));
  let max = Math.min(input.max, Math.ceil(hi + margin));
  if (max - min < 12) {
    const mid = (max + min) / 2;
    min = Math.max(0, Math.floor(mid - 6));
    max = Math.min(input.max, Math.ceil(mid + 6));
  }
  return { min, max };
}


