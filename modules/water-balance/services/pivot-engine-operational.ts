// ============================================================================
// GUARDA OPERACIONAL DO MOTOR HÍDRICO V3 — Kc DUAL FAO-56
// ============================================================================
// Porta pública do motor operacional. Bloqueia cálculo quando faltam fases,
// Kcb explícito ou cobertura temporal completa. Não há fallback silencioso
// para Kc simples.
// ============================================================================

export * from "./pivot-engine-v3-dual";

import { resolveDaeReferenceDate } from "@/modules/assignment/services";
import type { CulturePhase } from "@/modules/culture/services";
import {
  computePivotBalanceSeries as computePivotBalanceSeriesCore,
  type BalanceDay,
  type PivotEngineInput,
  type PivotHydricState,
  type PivotIdentity,
  type DualCulturePhase,
} from "./pivot-engine-v3-dual";

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return out;
  for (let ms = startMs; ms <= endMs; ms += 86_400_000) out.push(new Date(ms).toISOString().slice(0, 10));
  return out;
}

/**
 * Valida cobertura agronômica exata para cada DAE da série.
 * No V3, Kcb explícito é obrigatório; kc_start/kc_end legados não habilitam
 * operação por si só.
 */
export function hasCompletePhaseCoverage(
  phases: Array<CulturePhase & Partial<DualCulturePhase>>,
  input: Pick<PivotEngineInput, "assignment" | "dateStart" | "dateEnd">,
): boolean {
  if (!Array.isArray(phases) || phases.length === 0) return false;
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
  if (sorted.some((phase) => (
    !Number.isFinite(phase.days_after_plant) ||
    !Number.isFinite(phase.duration_days) ||
    phase.duration_days <= 0 ||
    phase.kcb_start == null || phase.kcb_end == null ||
    !Number.isFinite(phase.kcb_start) || !Number.isFinite(phase.kcb_end) ||
    phase.kcb_start < 0 || phase.kcb_start > 2.5 ||
    phase.kcb_end < 0 || phase.kcb_end > 2.5
  ))) return false;

  const dates = dateRange(input.dateStart, input.dateEnd);
  if (dates.length === 0) return false;
  const reference = resolveDaeReferenceDate(input.assignment);
  const referenceMs = new Date(`${reference}T00:00:00Z`).getTime();
  if (!Number.isFinite(referenceMs)) return false;

  return dates.every((date) => {
    const dateMs = new Date(`${date}T00:00:00Z`).getTime();
    const dae = Math.max(0, Math.floor((dateMs - referenceMs) / 86_400_000));
    return sorted.some((phase) => {
      const start = phase.days_after_plant;
      const endExclusive = start + phase.duration_days;
      return dae >= start && dae < endExclusive;
    });
  });
}

export function computePivotBalanceSeries(input: PivotEngineInput): BalanceDay[] {
  if (!hasCompletePhaseCoverage(input.phases, input)) return [];
  return computePivotBalanceSeriesCore(input);
}

export function computePivotCurrentState(identity: PivotIdentity, input: PivotEngineInput): PivotHydricState {
  const history = computePivotBalanceSeries(input);
  return {
    ...identity,
    plantingDate: identity.plantingDate ?? null,
    soilName: identity.soilName ?? null,
    radiusMeters: identity.radiusMeters ?? null,
    sheetIncomplete: identity.sheetIncomplete ?? false,
    startAngleDeg: identity.startAngleDeg ?? null,
    endAngleDeg: identity.endAngleDeg ?? null,
    parcelName: identity.parcelName ?? null,
    current: history.length > 0 ? history[history.length - 1] : null,
    history,
  };
}
