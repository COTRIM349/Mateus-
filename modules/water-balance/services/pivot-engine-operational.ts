// ============================================================================
// GUARDA OPERACIONAL DO MOTOR HÍDRICO V2 — FAO-56 Kc simples
// ============================================================================
// Fonte operacional do manejo: valida fases, ajusta diariamente o fator p pela
// demanda potencial, bloqueia entradas incompletas e impede regras arbitrárias
// de redução da lâmina.
// ============================================================================

export * from "./pivot-engine-v2";

import { resolveDaeReferenceDate, resolveDepletionFactor } from "@/modules/assignment/services";
import { identifyPhase, interpolateKc, type CulturePhase } from "@/modules/culture/services";
import { soilProfileIsUsable } from "@/modules/soil/services";
import { resolveManejoKl } from "./crop-coefficients";
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

export type OperationalBlockCode =
  | "invalid_period"
  | "invalid_phase_coverage"
  | "invalid_soil_profile"
  | "missing_weather"
  | "invalid_weather";

export interface OperationalInputDiagnosis {
  operational: boolean;
  code: OperationalBlockCode | null;
  message: string | null;
  date: string | null;
}

export class OperationalInputError extends Error {
  readonly diagnosis: OperationalInputDiagnosis;

  constructor(diagnosis: OperationalInputDiagnosis) {
    super(diagnosis.message ?? "Balanço hídrico bloqueado por entrada operacional inválida.");
    this.name = "OperationalInputError";
    this.diagnosis = diagnosis;
  }
}

/**
 * Diagnóstico puro das pré-condições operacionais do motor. A tela pode usar
 * esta função para explicar por que uma parcela foi bloqueada sem transformar
 * ausência de dado em zero nem adivinhar parâmetros agronômicos.
 */
export function diagnoseOperationalInput(input: PivotEngineInput): OperationalInputDiagnosis {
  const dates = dateRange(input.dateStart, input.dateEnd);
  if (dates.length === 0) {
    return {
      operational: false,
      code: "invalid_period",
      message: "Período inválido: verifique as datas inicial e final do balanço.",
      date: null,
    };
  }

  if (!hasCompletePhaseCoverage(input.phases, input)) {
    return {
      operational: false,
      code: "invalid_phase_coverage",
      message: "Fases da cultura incompletas ou inválidas para o período: revise Kc, duração, raiz, fator p e KL.",
      date: null,
    };
  }

  if (!soilProfileIsUsable(input.soil, input.soil.layers)) {
    return {
      operational: false,
      code: "invalid_soil_profile",
      message: "Perfil de solo inválido para o balanço: revise capacidade de campo, PMP, profundidade efetiva e camadas.",
      date: null,
    };
  }

  for (const date of dates) {
    const weather = input.weatherByDate[date];
    if (!weather) {
      return {
        operational: false,
        code: "missing_weather",
        message: `Clima operacional ausente em ${date}: o balanço não assume ETo ou chuva iguais a zero.`,
        date,
      };
    }
    if (
      !Number.isFinite(weather.et0) || weather.et0 < 0 ||
      !Number.isFinite(weather.precipitation) || weather.precipitation < 0
    ) {
      return {
        operational: false,
        code: "invalid_weather",
        message: `Clima operacional inválido em ${date}: revise ETo e precipitação aprovadas.`,
        date,
      };
    }
  }

  return { operational: true, code: null, message: null, date: null };
}

/**
 * FAO-56: p_adj = p_table + 0,04 × (5 − ETc), com p_tab tabelado para ETc≈5.
 * Usa ETc potencial (antes de Ks), evitando circularidade quando já há estresse.
 */
export function adjustDepletionFactorForDemand(baseP: number, etcPotentialMmDay: number): number {
  const safeBase = Number.isFinite(baseP) ? baseP : 0.5;
  const safeEtc = Number.isFinite(etcPotentialMmDay) ? Math.max(etcPotentialMmDay, 0) : 5;
  const adjusted = safeBase + 0.04 * (5 - safeEtc);
  return Math.round(Math.min(Math.max(adjusted, 0.1), 0.8) * 1000) / 1000;
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

export interface ManagementUrgency {
  /** Quanto ainda pode ser depletado antes de atingir a AFD. */
  remainingToAfdMm: number;
  /** Percentual da AFD já consumido pela depleção atual. */
  afdUsedPct: number;
  /** Estimativa sem chuva/irrigação usando ETc potencial atual. 0 = limite já atingido. */
  daysToAfd: number | null;
  atOrBeyondAfd: boolean;
}

/**
 * Traduz o estado do balanço em informação operacional de Scheduling.
 * Não é previsão meteorológica: mantém a demanda potencial atual constante e
 * assume ausência de nova chuva/irrigação apenas para estimar urgência.
 */
export function calculateManagementUrgency(
  day: Pick<BalanceDay, "afd" | "deficit" | "etcPotential">,
): ManagementUrgency {
  const afd = Math.max(Number(day.afd) || 0, 0);
  const depletion = Math.max(Number(day.deficit) || 0, 0);
  const etcPotential = Math.max(Number(day.etcPotential) || 0, 0);
  const remainingToAfdMm = Math.max(afd - depletion, 0);
  const afdUsedPct = afd > 0 ? Math.min(Math.max((depletion / afd) * 100, 0), 999) : 0;
  const atOrBeyondAfd = afd > 0 && depletion >= afd;
  const daysToAfd = atOrBeyondAfd
    ? 0
    : etcPotential > 0
      ? remainingToAfdMm / etcPotential
      : null;

  return {
    remainingToAfdMm: Math.round(remainingToAfdMm * 100) / 100,
    afdUsedPct: Math.round(afdUsedPct * 10) / 10,
    daysToAfd: daysToAfd == null ? null : Math.round(daysToAfd * 100) / 100,
    atOrBeyondAfd,
  };
}

/**
 * Executa o núcleo V2 dia a dia para permitir que p seja recalculado com a
 * demanda daquele dia, preservando ARM e CAD do dia anterior. O núcleo continua
 * responsável por Ks, ETc, balanço, chuva, irrigação e recomendação.
 */
export function computePivotBalanceSeries(input: PivotEngineInput): BalanceDay[] {
  const diagnosis = diagnoseOperationalInput(input);
  if (!diagnosis.operational) throw new OperationalInputError(diagnosis);

  const normalized = normalizeOperationalInput(input);
  const dates = dateRange(normalized.dateStart, normalized.dateEnd);
  const referenceMs = new Date(`${resolveDaeReferenceDate(normalized.assignment)}T00:00:00Z`).getTime();
  if (!Number.isFinite(referenceMs)) return [];

  const result: BalanceDay[] = [];
  let previousStorage: number | null = normalized.initialStorageMm ?? null;
  let previousCad: number | null = normalized.initialCadMm ?? null;

  for (const date of dates) {
    const weather = normalized.weatherByDate[date];
    if (!weather || !Number.isFinite(weather.et0) || weather.et0 < 0 || !Number.isFinite(weather.precipitation) || weather.precipitation < 0) {
      return [];
    }

    const dateMs = new Date(`${date}T00:00:00Z`).getTime();
    const dae = Math.max(0, Math.floor((dateMs - referenceMs) / 86_400_000));
    const phase = identifyPhase(normalized.phases, dae)?.phase ?? null;
    if (!phase) return [];

    const kc = interpolateKc(normalized.phases, dae);
    const kl = resolveManejoKl({
      parcelOverride: normalized.assignment.kl_override,
      phaseKl: phase.kl,
      cultureKl: normalized.culture.kl,
    });
    const etcPotential = Math.max(weather.et0 * kc * kl, 0);
    const baseP = resolveDepletionFactor(
      normalized.assignment,
      phase.depletion_factor,
      normalized.culture.depletion_factor,
    );
    const adjustedP = adjustDepletionFactorForDemand(baseP, etcPotential);

    const dailyPhases = normalized.phases.map((item) =>
      item.phase_order === phase.phase_order
        ? { ...item, depletion_factor: adjustedP }
        : item,
    );

    const dailyAssignment = normalized.assignment.parameter_mode === "personalizado" && normalized.assignment.depletion_factor != null
      ? { ...normalized.assignment, depletion_factor: adjustedP }
      : normalized.assignment;

    const daily = computePivotBalanceSeriesCore({
      ...normalized,
      assignment: dailyAssignment,
      phases: dailyPhases,
      dateStart: date,
      dateEnd: date,
      initialStorageMm: previousStorage,
      initialCadMm: previousCad,
    });
    if (daily.length !== 1) return [];

    const row = daily[0];
    result.push(row);
    previousStorage = row.storage;
    previousCad = row.adt;
  }

  return result;
}

export function computePivotCurrentState(identity: PivotIdentity, input: PivotEngineInput): PivotHydricState {
  let history: BalanceDay[] = [];
  try {
    history = computePivotBalanceSeries(input);
  } catch (error) {
    if (!(error instanceof OperationalInputError)) throw error;
  }

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
