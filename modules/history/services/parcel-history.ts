/**
 * Histórico operacional da parcela (Etapas I e J).
 *
 * Encerrar move o ciclo para cá. Filtros: safra, módulo, pivô, parcela,
 * cultura, período. Água, energia e custo vêm dos eventos reais.
 * Sem tarifa persistida no evento, o custo permanece nulo.
 */

import { snapshotCycleEnergyCost } from "@/modules/costs/services/event-cost";
import {
  isHistoricParcel,
  snapshotCycleWater,
} from "@/modules/assignment/services/parcel-cycle";

export const HISTORY_COST_PENDING_NOTE =
  "Sem energia/custo nos eventos — cadastre tarifa ou R$/kWh na ficha do pivô.";

export interface HistoricParcelRow {
  id: string;
  name: string | null;
  pivot_id: string;
  module_id: string | null;
  season_id: string;
  culture_id: string;
  planting_date: string | null;
  closed_at: string | null;
  status: string | null;
  active?: boolean | null;
}

export interface HistoryFilters {
  seasonId: string;
  moduleId: string;
  pivotId: string;
  parcelId: string;
  cultureId: string;
  periodFrom: string;
  periodTo: string;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = {
  seasonId: "",
  moduleId: "",
  pivotId: "",
  parcelId: "",
  cultureId: "",
  periodFrom: "",
  periodTo: "",
};

function ymd(iso: string | null | undefined): string {
  return (iso ?? "").slice(0, 10);
}

export function matchesHistoryFilters(row: HistoricParcelRow, filters: HistoryFilters): boolean {
  if (!isHistoricParcel(row.status, row.active)) return false;
  if (filters.seasonId && row.season_id !== filters.seasonId) return false;
  if (filters.moduleId && row.module_id !== filters.moduleId) return false;
  if (filters.pivotId && row.pivot_id !== filters.pivotId) return false;
  if (filters.parcelId && row.id !== filters.parcelId) return false;
  if (filters.cultureId && row.culture_id !== filters.cultureId) return false;

  if (filters.periodFrom || filters.periodTo) {
    const start = ymd(row.planting_date) || ymd(row.closed_at);
    const end = ymd(row.closed_at) || ymd(row.planting_date);
    if (filters.periodFrom && end && end < filters.periodFrom) return false;
    if (filters.periodTo && start && start > filters.periodTo) return false;
  }
  return true;
}

export function filterHistoricParcels(
  rows: HistoricParcelRow[],
  filters: HistoryFilters,
): HistoricParcelRow[] {
  return rows.filter((row) => matchesHistoryFilters(row, filters));
}

export interface ClosedCycleSummary {
  total_water_applied_mm: number;
  total_volume_m3: number;
  irrigation_count: number;
  sensory_count: number;
  yield_kg_ha: number | null;
  energy_kwh: number | null;
  cost: number | null;
  cost_pending: boolean;
}

/**
 * Resume o ciclo encerrado a partir dos eventos persistidos.
 * Energia/custo: snapshot do encerramento ou soma dos eventos — nunca tarifa inventada.
 */
export function summarizeClosedCycle(input: {
  events: Array<{
    depth_mm?: number | null;
    volume_m3?: number | null;
    energy_kwh?: number | null;
    cost?: number | null;
  }>;
  sensoryCount: number;
  yieldKgHa?: number | null;
  storedEnergyKwh?: number | null;
  storedCost?: number | null;
}): ClosedCycleSummary {
  const water = snapshotCycleWater(input.events);
  const fromEvents = snapshotCycleEnergyCost(input.events);
  const energy = input.storedEnergyKwh ?? fromEvents.total_energy_kwh;
  const cost = input.storedCost ?? fromEvents.total_cost;
  return {
    ...water,
    sensory_count: input.sensoryCount,
    yield_kg_ha: input.yieldKgHa ?? null,
    energy_kwh: energy,
    cost,
    cost_pending: energy == null && cost == null,
  };
}
