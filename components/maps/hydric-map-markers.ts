import {
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
  type PivotHydricState,
} from "@/modules/water-balance/services";
import type { PivotMarker } from "@/components/maps/PivotMap";

/** Pivô sem parcela ativa não entra no mapa hídrico. */
export function hydricMapStates(states: PivotHydricState[]): PivotHydricState[] {
  return states.filter((state) => Boolean(state.parcelId));
}

export function mapStatusOf(state: PivotHydricState): MapHydricStatus {
  if (state.sheetIncomplete || !state.current) return state.current?.mapStatus ?? "incompleto";
  return state.current.mapStatus;
}

export function toHydricMapMarkers(states: PivotHydricState[]): PivotMarker[] {
  return hydricMapStates(states)
    .filter((state) => state.latitude && state.longitude)
    .map((state) => {
      const status = mapStatusOf(state);
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
): Partial<Record<MapHydricStatus, number>> {
  const counts: Partial<Record<MapHydricStatus, number>> = {};
  for (const state of hydricMapStates(states)) {
    const status = mapStatusOf(state);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
