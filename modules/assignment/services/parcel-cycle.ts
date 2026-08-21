/**
 * Ciclo de vida da parcela (Etapas C e I).
 *
 * Parcela = unidade agronômica e temporal. Nova cultura = novo ciclo.
 * Encerrar preserva o registro; nunca reutilizar nem apagar.
 * Cultura, cultivar, plantio e manejo pertencem à parcela, não ao pivô.
 * Solo e KL de perfil vêm do pivô; a parcela pode só registrar override de KL.
 *
 * Etapa I: data de encerramento, bloqueio de lançamentos no ciclo fechado,
 * snapshot de água aplicada. Custo/energia ficam para a Etapa J.
 */

import { roundTo } from "@/utils/math";

export const PARCEL_STATUSES = ["rascunho", "ativa", "encerrada", "cancelada"] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

export const PARCEL_CLOSE_REASONS = [
  "colheita",
  "falha_lavoura",
  "clima_adverso",
  "decisao_gerencial",
  "outro",
] as const;
export type ParcelCloseReason = (typeof PARCEL_CLOSE_REASONS)[number];

export const PARCEL_CLOSE_REASON_LABELS: Record<ParcelCloseReason, string> = {
  colheita: "Colheita",
  falha_lavoura: "Falha da lavoura",
  clima_adverso: "Clima adverso",
  decisao_gerencial: "Decisão gerencial",
  outro: "Outro",
};

export const CLOSED_PARCEL_NO_LAUNCH =
  "Parcela encerrada: não é possível lançar neste ciclo. O histórico permanece; abra um novo ciclo no pivô.";
export const NO_ACTIVE_PARCEL_LAUNCH =
  "Não há parcela ativa neste pivô. Cadastre ou abra um novo ciclo para lançar.";

export interface ParcelCycleRef {
  id: string;
  pivot_id: string;
  status?: string | null;
  active?: boolean | null;
}

export function isHistoricParcel(status: string | null | undefined, active?: boolean | null): boolean {
  if (status === "encerrada" || status === "cancelada") return true;
  if (status === "ativa" || status === "rascunho") return false;
  return active === false;
}

export function isActiveParcel(status: string | null | undefined, active?: boolean | null): boolean {
  if (status === "ativa") return true;
  if (status === "encerrada" || status === "cancelada" || status === "rascunho") return false;
  return active !== false;
}

/** Encerrada/cancelada nunca volta a ser o ciclo operacional. */
export function canReuseParcel(status: string | null | undefined): boolean {
  return status !== "encerrada" && status !== "cancelada";
}

/** Histórico é permanente: não apagar nem reabrir o registro. */
export function canMutateParcelRecord(
  status: string | null | undefined,
  active?: boolean | null,
): boolean {
  return !isHistoricParcel(status, active);
}

export function canDeleteParcel(
  status: string | null | undefined,
  active?: boolean | null,
): boolean {
  return canMutateParcelRecord(status, active);
}

/**
 * Lançamentos normais (irrigação, sensorial, manejo) só no ciclo ativo.
 * Parcela encerrada sai das listas operacionais e entra no histórico.
 */
export function assertParcelAcceptsOperationalLaunch(
  parcel: { status?: string | null; active?: boolean | null } | null | undefined,
): string | null {
  if (!parcel) return NO_ACTIVE_PARCEL_LAUNCH;
  if (!isActiveParcel(parcel.status, parcel.active)) return CLOSED_PARCEL_NO_LAUNCH;
  return null;
}

export function suggestParcelName(pivotName: string, cultureName: string, seasonName: string): string {
  return [pivotName, cultureName, seasonName].filter(Boolean).join(" · ");
}

export function validatePlantedArea(
  plantedAreaHa: number | null | undefined,
  pivotAreaHa: number,
): string | null {
  if (plantedAreaHa == null || Number.isNaN(plantedAreaHa)) return null;
  if (plantedAreaHa <= 0) return "Área da parcela deve ser maior que zero.";
  if (pivotAreaHa > 0 && plantedAreaHa > pivotAreaHa) {
    return `Área da parcela (${plantedAreaHa} ha) não pode ser maior que a área do pivô (${pivotAreaHa} ha).`;
  }
  return null;
}

export function findBlockingActiveParcel(
  parcels: ParcelCycleRef[],
  pivotId: string,
  excludeId?: string | null,
): ParcelCycleRef | undefined {
  return parcels.find(
    (p) =>
      p.pivot_id === pivotId &&
      p.id !== excludeId &&
      isActiveParcel(p.status, p.active),
  );
}

export interface ParcelCycleDraft {
  name: string | null;
  plantedArea: number | null;
  pivotId: string;
  pivotArea: number;
  pivotSoilId: string | null;
  seasonId: string;
  cultureId: string;
  cultureVarietyId: string | null;
  plantingDate: string;
  emergenceDate: string | null;
  expectedHarvestDate: string | null;
  klOverride: number | null;
  notes: string | null;
  existingOnPivot: ParcelCycleRef[];
  editingId?: string | null;
}

export function validateParcelCycle(draft: ParcelCycleDraft): string | null {
  if (!draft.pivotId) return "Selecione o pivô.";
  if (!draft.seasonId) return "Selecione a safra.";
  if (!draft.cultureId) return "Selecione a cultura.";
  if (!draft.pivotSoilId) {
    return "O pivô selecionado não tem solo cadastrado. Associe um perfil em Cadastros → Solos ou na ficha do pivô.";
  }
  if (!draft.plantingDate) return "Informe a data de plantio.";
  if (draft.emergenceDate && draft.emergenceDate < draft.plantingDate) {
    return "A data de emergência não pode ser anterior ao plantio.";
  }
  if (draft.expectedHarvestDate && draft.expectedHarvestDate <= draft.plantingDate) {
    return "A colheita prevista deve ser posterior ao plantio.";
  }
  if (draft.klOverride != null && (Number.isNaN(draft.klOverride) || draft.klOverride < 0 || draft.klOverride > 1)) {
    return "KL da parcela deve estar entre 0 e 1. Vazio usa o padrão do pivô central (1).";
  }
  const areaError = validatePlantedArea(draft.plantedArea, draft.pivotArea);
  if (areaError) return areaError;

  const blocking = findBlockingActiveParcel(draft.existingOnPivot, draft.pivotId, draft.editingId);
  if (blocking) {
    return "Já existe parcela ativa neste pivô. Encerre o ciclo atual para abrir um novo (nova cultura = nova parcela).";
  }
  return null;
}

export interface ParcelInsertRow {
  name: string | null;
  planted_area: number | null;
  pivot_id: string;
  season_id: string;
  culture_id: string;
  culture_variety_id: string | null;
  variety_id: string | null;
  soil_id: string;
  planting_date: string;
  emergence_date: string | null;
  expected_harvest_date: string | null;
  kl_override: number | null;
  notes: string | null;
  status: "ativa";
  active: true;
}

export function buildParcelInsertRow(draft: ParcelCycleDraft): ParcelInsertRow {
  if (!draft.pivotSoilId) {
    throw new Error("Parcela exige solo do pivô.");
  }
  return {
    name: draft.name,
    planted_area: draft.plantedArea,
    pivot_id: draft.pivotId,
    season_id: draft.seasonId,
    culture_id: draft.cultureId,
    culture_variety_id: draft.cultureVarietyId,
    variety_id: draft.cultureVarietyId,
    soil_id: draft.pivotSoilId,
    planting_date: draft.plantingDate,
    emergence_date: draft.emergenceDate,
    expected_harvest_date: draft.expectedHarvestDate,
    kl_override: draft.klOverride,
    notes: draft.notes,
    status: "ativa",
    active: true,
  };
}

export interface ParcelClosePayload {
  status: "encerrada";
  active: false;
  closed_at: string;
  close_reason: ParcelCloseReason;
  close_note: string | null;
  yield_kg_ha: number | null;
  total_water_applied_mm: number | null;
  total_energy_kwh: number | null;
  total_cost: number | null;
}

export function closeDateToIso(ymd: string): string {
  return `${ymd}T12:00:00.000Z`;
}

export function validateParcelClose(input: {
  currentStatus?: string | null;
  currentActive?: boolean | null;
  closeReason: string;
  closedAtYmd: string;
  plantingDate?: string | null;
  yieldKgHa?: number | null;
}): string | null {
  if (!isActiveParcel(input.currentStatus, input.currentActive)) {
    return "Só é possível encerrar uma parcela ativa.";
  }
  if (!input.closeReason) return "Informe o motivo do encerramento.";
  if (!(PARCEL_CLOSE_REASONS as readonly string[]).includes(input.closeReason)) {
    return "Motivo de encerramento inválido.";
  }
  if (!input.closedAtYmd) return "Informe a data de encerramento.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.closedAtYmd)) {
    return "Data de encerramento inválida.";
  }
  if (input.plantingDate && input.closedAtYmd < input.plantingDate) {
    return "A data de encerramento não pode ser anterior ao plantio.";
  }
  if (input.yieldKgHa != null && (Number.isNaN(input.yieldKgHa) || input.yieldKgHa < 0)) {
    return "Produtividade deve ser um número ≥ 0.";
  }
  return null;
}

/** Soma a lâmina bruta dos eventos do ciclo. Não calcula energia nem custo. */
export function snapshotCycleWater(
  events: Array<{ depth_mm?: number | null; volume_m3?: number | null }>,
): { total_water_applied_mm: number; total_volume_m3: number; irrigation_count: number } {
  let mm = 0;
  let vol = 0;
  for (const e of events) {
    mm += Math.max(Number(e.depth_mm) || 0, 0);
    vol += Math.max(Number(e.volume_m3) || 0, 0);
  }
  return {
    total_water_applied_mm: roundTo(mm, 2),
    total_volume_m3: roundTo(vol, 2),
    irrigation_count: events.length,
  };
}

export function buildParcelClosePayload(input: {
  closeReason: string;
  closeNote?: string | null;
  yieldKgHa?: number | null;
  closedAt?: string;
  totalWaterAppliedMm?: number | null;
  totalEnergyKwh?: number | null;
  totalCost?: number | null;
}): ParcelClosePayload {
  const reason = (PARCEL_CLOSE_REASONS as readonly string[]).includes(input.closeReason)
    ? (input.closeReason as ParcelCloseReason)
    : "outro";
  return {
    status: "encerrada",
    active: false,
    closed_at: input.closedAt ?? new Date().toISOString(),
    close_reason: reason,
    close_note: input.closeNote?.trim() ? input.closeNote.trim() : null,
    yield_kg_ha: input.yieldKgHa ?? null,
    total_water_applied_mm: input.totalWaterAppliedMm ?? null,
    total_energy_kwh: input.totalEnergyKwh ?? null,
    total_cost: input.totalCost ?? null,
  };
}
