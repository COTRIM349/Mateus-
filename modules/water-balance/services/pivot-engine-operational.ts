// ============================================================================
// GUARDA OPERACIONAL DO MOTOR HÍDRICO V2 — FAO-56 Kc simples
// ============================================================================
// Mantém o motor V2 como fonte operacional e bloqueia séries quando as fases
// agronômicas não cobrem todo o período ou possuem parâmetros inválidos.
//
// Regra de segurança: a flag deficit_irrigation NÃO reduz lâmina por percentual
// fixo. Irrigação deficitária só poderá alterar a recomendação quando existir
// alvo agronômico explícito/configurável. Até lá, a recomendação repõe o déficit
// calculado pelo balanço, corrigido somente pela eficiência de aplicação.
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

function phaseParametersAreOperational(phase: CulturePhase): boolean {
  const p = Number(phase.depletion_factor);
  const rootStart = Number(phase.root_depth_start);
  const rootEnd = Number(phase.root_depth_end);
  const kl = phase.kl == null ? 1 : Number(phase.kl);

  return (
    Number.isFinite(phase.days_after_plant) &&
    Number.isFinite(phase.duration_days) &&
    phase.duration_days > 0 &&
    phase.kc_start != null && phase.kc_end != null &&
    Number.isFinite(phase.kc_start) && Number.isFinite(phase.kc_end) &&
    phase.kc_start >= 0 && phase.kc_start <= 2.5 &&
    phase.kc_end >= 0 && phase.kc_end <= 2.5 &&
    Number.isFinite(p) && p > 0 && p < 1 &&
    Number.isFinite(rootStart) && Number.isFinite(rootEnd) &&
    rootStart > 0 && rootEnd > 0 && rootEnd >= rootStart &&
    Number.isFinite(kl) && kl > 0 && kl <= 1
  );
}

export function hasCompletePhaseCoverage(
  phases: CulturePhase[],
  input: Pick<PivotEngineInput, "assignment" | "dateStart" | "dateEnd">,
): boolean {
  if (!Array.isArray(phases) || phases.length === 0) return false;
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
  if (sorted.some((phase) => !phaseParametersAreOperational(phase))) return false;

  // A linha do tempo precisa ser contínua. Buracos ou sobreposição indicam
  // cadastro inconsistente e não devem ser escondidos pelo interpolador.
  for (let i = 1; i < sorted.length; i++) {
    const previousEnd = sorted[i - 1].days_after_plant + sorted[i - 1].duration_days;
    if (sorted[i].days_after_plant !== previousEnd) return false;
  }

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

/**
 * Regras operacionais que prevalecem sobre opções experimentais do cadastro.
 * Não altera o objeto recebido pelo chamador.
 */
export function normalizeOperationalInput(input: PivotEngineInput): PivotEngineInput {
  return {
    ...input,
    assignment: {
      ...input.assignment,
      // Sem alvo deficitário explícito, não existe redução automática da lâmina.
      deficit_irrigation: false,
    },
  };
}

export function computePivotBalanceSeries(input: PivotEngineInput): BalanceDay[] {
  if (!hasCompletePhaseCoverage(input.phases, input)) return [];
  return computePivotBalanceSeriesCore(normalizeOperationalInput(input));
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
