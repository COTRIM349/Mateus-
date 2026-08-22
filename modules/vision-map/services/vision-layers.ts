/**
 * Mapa Vision — camadas de manejo, chuva, umidade orbital e custo.
 * Cores de chuva/custo são relativas aos dados da fazenda, não inventam limiar agronômico.
 * Umidade orbital é m³/m³ do modelo — não é ARM nem %CC.
 */

import { MAP_HYDRIC_COLORS, MAP_HYDRIC_STATUS_CONFIG } from "@/modules/water-balance/services";
import type { PivotHydricState } from "@/modules/water-balance/services";
import { hydricMapStates, hydricStateId, mapStatusOf } from "@/components/maps/hydric-map-markers";
import type { PivotMarker } from "@/components/maps/PivotMap";

export type VisionLayer = "manejo" | "chuva" | "orbital" | "custo";

export const VISION_LAYERS: VisionLayer[] = ["manejo", "chuva", "orbital", "custo"];

export const VISION_LAYER_CONFIG: Record<VisionLayer, { label: string; hint: string }> = {
  manejo: { label: "Manejo hídrico", hint: "Condição de ARM da parcela ativa (FAO-56)." },
  chuva: { label: "Chuva 7d", hint: "Soma da chuva observada no balanço. Sem dado → cinza." },
  orbital: { label: "Umidade orbital", hint: "Modelo de solo Open-Meteo (m³/m³). Não é %CC." },
  custo: { label: "Custo 30d", hint: "R$/ha relativo à fazenda (tercis). Sem inventar limiar." },
};

export const VISION_LAYER_LABELS: Record<VisionLayer, string> = {
  manejo: VISION_LAYER_CONFIG.manejo.label,
  chuva: VISION_LAYER_CONFIG.chuva.label,
  orbital: VISION_LAYER_CONFIG.orbital.label,
  custo: VISION_LAYER_CONFIG.custo.label,
};

export interface OrbitalMoistureSample {
  pivotId: string;
  sampledAt: string;
  moisture07: number | null;
  moisture728: number | null;
  moisture28100: number | null;
  source: string;
}

export interface ParcelCostSlice {
  key: string;
  costReais: number;
  areaHa: number;
}

export function rainAccumulatedMm(state: PivotHydricState, endDate?: string | null, days = 7): number | null {
  const cutoff = endDate ?? state.current?.date;
  if (!cutoff) return null;
  const start = addDays(cutoff, -(days - 1));
  let sum = 0;
  let n = 0;
  for (const row of state.history) {
    if (row.date < start || row.date > cutoff) continue;
    if (row.precipitation == null || !Number.isFinite(row.precipitation)) continue;
    sum += Math.max(row.precipitation, 0);
    n += 1;
  }
  if (state.current && state.current.date >= start && state.current.date <= cutoff) {
    const already = state.history.some((row) => row.date === state.current!.date);
    if (!already && Number.isFinite(state.current.precipitation)) {
      sum += Math.max(state.current.precipitation, 0);
      n += 1;
    }
  }
  return n > 0 ? sum : null;
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** Escala de chuva em mm acumulados — faixas de visualização, não recomendação. */
export function rainColor(mm: number | null): { color: string; label: string } {
  if (mm == null || !Number.isFinite(mm)) {
    return { color: MAP_HYDRIC_COLORS.gray, label: "Sem chuva registrada" };
  }
  if (mm <= 0) return { color: "#BBDEFB", label: "0 mm" };
  if (mm < 10) return { color: "#64B5F6", label: `${mm.toFixed(0)} mm` };
  if (mm < 25) return { color: "#1E88E5", label: `${mm.toFixed(0)} mm` };
  return { color: "#0D47A1", label: `${mm.toFixed(0)} mm` };
}

/**
 * Cor da umidade orbital (m³/m³ na camada 0–7 cm).
 * Faixas de mapa, não equivalem a CC do solo cadastrado.
 */
export function orbitalColor(moistureM3: number | null): { color: string; label: string } {
  if (moistureM3 == null || !Number.isFinite(moistureM3)) {
    return { color: MAP_HYDRIC_COLORS.gray, label: "Sem dado orbital" };
  }
  const pct = moistureM3 * 100;
  const label = `${pct.toFixed(1)}% vol.`;
  if (moistureM3 < 0.10) return { color: MAP_HYDRIC_COLORS.red, label };
  if (moistureM3 < 0.18) return { color: MAP_HYDRIC_COLORS.yellow, label };
  if (moistureM3 < 0.28) return { color: MAP_HYDRIC_COLORS.green, label };
  return { color: MAP_HYDRIC_COLORS.blue, label };
}

export function costPerHa(slice: ParcelCostSlice | undefined): number | null {
  if (!slice || !(slice.areaHa > 0) || !Number.isFinite(slice.costReais)) return null;
  return slice.costReais / slice.areaHa;
}

/** Agrupa custo já lançado. Não precifica de novo — usa `irrigation_events.cost`. */
export function costSlicesFromEvents(
  events: Array<{ parcelId: string | null; pivotId: string; cost: number | null }>,
  areaByKey: Map<string, number>,
): ParcelCostSlice[] {
  const sums = new Map<string, number>();
  for (const ev of events) {
    if (ev.cost == null || !Number.isFinite(ev.cost)) continue;
    const key = ev.parcelId ?? ev.pivotId;
    if (!key) continue;
    sums.set(key, (sums.get(key) ?? 0) + ev.cost);
  }
  return Array.from(sums.entries()).map(([key, costReais]) => ({
    key,
    costReais,
    areaHa: areaByKey.get(key) ?? 0,
  }));
}

/** Escala relativa aos custos da própria fazenda (tercis). Sem dado → cinza. */
export function costColor(
  value: number | null,
  farmValues: number[],
): { color: string; label: string } {
  if (value == null || !Number.isFinite(value)) {
    return { color: MAP_HYDRIC_COLORS.gray, label: "Sem custo no período" };
  }
  const label = `${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/ha`;
  const positives = farmValues.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (positives.length === 0) {
    return { color: value <= 0 ? MAP_HYDRIC_COLORS.green : MAP_HYDRIC_COLORS.yellow, label };
  }
  const q1 = positives[Math.floor((positives.length - 1) * 0.33)];
  const q2 = positives[Math.floor((positives.length - 1) * 0.66)];
  if (value <= 0) return { color: MAP_HYDRIC_COLORS.green, label };
  if (value <= q1) return { color: MAP_HYDRIC_COLORS.green, label };
  if (value <= q2) return { color: MAP_HYDRIC_COLORS.yellow, label };
  return { color: MAP_HYDRIC_COLORS.red, label };
}

function markerBase(state: PivotHydricState): Omit<PivotMarker, "color" | "statusLabel"> {
  return {
    id: hydricStateId(state),
    name: state.parcelName?.trim() || state.pivotName,
    latitude: state.latitude,
    longitude: state.longitude,
    radiusMeters: state.radiusMeters,
    startAngleDeg: state.startAngleDeg,
    endAngleDeg: state.endAngleDeg,
    sheetIncomplete: state.sheetIncomplete,
  };
}

export function toVisionMarkers(
  states: PivotHydricState[],
  layer: VisionLayer,
  options?: {
    date?: string | null;
    orbital?: OrbitalMoistureSample[];
    costs?: ParcelCostSlice[];
  },
): PivotMarker[] {
  const active = hydricMapStates(states).filter((s) => s.latitude && s.longitude);
  const orbitalByPivot = new Map((options?.orbital ?? []).map((s) => [s.pivotId, s]));
  const costByKey = new Map((options?.costs ?? []).map((s) => [s.key, s]));
  const farmCosts = (options?.costs ?? [])
    .map((s) => costPerHa(s))
    .filter((n): n is number => n != null);

  return active.map((state) => {
    const base = markerBase(state);
    if (layer === "manejo") {
      const status = mapStatusOf(state, options?.date);
      const conf = MAP_HYDRIC_STATUS_CONFIG[status];
      return { ...base, color: conf.color, statusLabel: conf.label, sheetIncomplete: base.sheetIncomplete || status === "incompleto" };
    }
    if (layer === "chuva") {
      const mm = rainAccumulatedMm(state, options?.date ?? state.current?.date);
      const vis = rainColor(mm);
      return { ...base, color: vis.color, statusLabel: `Chuva 7d · ${vis.label}` };
    }
    if (layer === "orbital") {
      const sample = orbitalByPivot.get(state.pivotId);
      const vis = orbitalColor(sample?.moisture07 ?? null);
      const when = sample?.sampledAt ? ` · ${sample.sampledAt}` : "";
      return { ...base, color: vis.color, statusLabel: `Orbital 0–7 cm · ${vis.label}${when}` };
    }
    const key = hydricStateId(state);
    const vis = costColor(costPerHa(costByKey.get(key) ?? costByKey.get(state.pivotId)), farmCosts);
    return { ...base, color: vis.color, statusLabel: `Custo 30d · ${vis.label}` };
  });
}
