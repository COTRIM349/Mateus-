// ============================================================================
// GUARDA OPERACIONAL DO MOTOR HÍDRICO V2 — FAO-56 Kc simples
// ============================================================================
// Mantém o motor V2 como fonte operacional e bloqueia séries quando as fases
// agronômicas não cobrem todo o período ou possuem Kc inválido.
// ============================================================================

export * from "./pivot-engine-v2";

import { resolveDaeReferenceDate } from "@/modules/assignment/services";
import type { CulturePhase } from "@/modules/culture/services";
import {
  computePivotBalanceSeries as computePivotBalanceSeriesCore,
  type BalanceDay,
  type PivotEngineInput,
  type PivotHydricState,
  type PivotIdentity,
} from "./pivot-engine-v2";

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return out;
  for (let ms = startMs; ms <= endMs; ms += 86_400_000) out.push(new Date(ms).toISOString().slice(0, 10));
  return out;
}

export function hasCompletePhaseCoverage(
  phases: CulturePhase[],
  input: Pick<PivotEngineInput, "assignment" | "dateStart" | "dateEnd">,
): boolean {
  if (!Array.isArray(phases) || phases.length === 0) return false;
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
  if (sorted.some((phase) => (
    !Number.isFinite(phase.days_after_plant) ||
    !Number.isFinite(phase.duration_days) ||
    phase.duration_days <= 0 ||
    phase.kc_start == null || phase.kc_end == null ||
    !Number.isFinite(phase.kc_start) || !Number.isFinite(phase.kc_end) ||
    phase.kc_start < 0 || phase.kc_start > 2.5 ||
    phase.kc_end < 0 || phase.kc_end > 2.5
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
