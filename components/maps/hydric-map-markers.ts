import {
  MAP_HYDRIC_NEED_IRRIGATE,
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
  type PivotHydricState,
} from "@/modules/water-balance/services";
import type { PivotMarker } from "@/components/maps/PivotMap";

function isoToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Pivô sem parcela ativa não entra no mapa hídrico. */
export function hydricMapStates(states: PivotHydricState[]): PivotHydricState[] {
  return states.filter((state) => Boolean(state.parcelId));
}

function dayOn(state: PivotHydricState, date?: string | null) {
  if (!date) return state.current;
  if (state.current?.date === date) return state.current;
  return state.history.find((row) => row.date === date) ?? null;
}

export function mapStatusOf(state: PivotHydricState, date?: string | null): MapHydricStatus {
  const day = dayOn(state, date);
  if (state.sheetIncomplete || !day) return day?.mapStatus ?? "incompleto";
  return day.mapStatus;
}

export function toHydricMapMarkers(
  states: PivotHydricState[],
  date?: string | null,
): PivotMarker[] {
  return hydricMapStates(states)
    .filter((state) => state.latitude && state.longitude)
    .map((state) => {
      const status = mapStatusOf(state, date);
      const conf = MAP_HYDRIC_STATUS_CONFIG[status];
      return {
        id: state.pivotId,
        name: state.pivotName,
        latitude: state.latitude,
        longitude: state.longitude,
        radiusMeters: state.radiusMeters,
        sheetIncomplete: state.sheetIncomplete || status === "incompleto",
        color: conf.color,
        statusLabel: conf.label,
      };
    });
}

export function countMapStatuses(
  states: PivotHydricState[],
  date?: string | null,
): Partial<Record<MapHydricStatus, number>> {
  const counts: Partial<Record<MapHydricStatus, number>> = {};
  for (const state of hydricMapStates(states)) {
    const status = mapStatusOf(state, date);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

/** Últimos 7 dias com balanço — nunca inventa data futura. */
export function hydricMapDates(states: PivotHydricState[], today = isoToday()): string[] {
  const set = new Set<string>();
  for (const state of hydricMapStates(states)) {
    if (state.current?.date) set.add(state.current.date);
    for (const row of state.history) set.add(row.date);
  }
  return Array.from(set)
    .filter((date) => date <= today)
    .sort()
    .slice(-7);
}

export function hydricDemandSummary(
  states: PivotHydricState[],
  date?: string | null,
): { needing: number; total: number; highestName: string | null } {
  const active = hydricMapStates(states);
  let needing = 0;
  let highestName: string | null = null;
  let highestDeficit = -Infinity;
  for (const state of active) {
    const status = mapStatusOf(state, date);
    if (!MAP_HYDRIC_NEED_IRRIGATE.includes(status)) continue;
    needing += 1;
    const deficit = dayOn(state, date)?.deficit ?? 0;
    if (deficit > highestDeficit) {
      highestDeficit = deficit;
      highestName = state.pivotName;
    }
  }
  return { needing, total: active.length, highestName };
}
