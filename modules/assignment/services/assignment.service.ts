import {
  interpolateRootDepth,
  type CulturePhase,
} from "@/modules/culture/services";

// ── Types ────────────────────────────────────────────────────────────────

export type ParameterMode = "padrao" | "personalizado";

/** Vínculo operacional pivô ↔ safra ↔ cultura ↔ solo (pivot_crop_assignments). */
export interface OperationalAssignment {
  id: string;
  pivot_id: string;
  season_id: string;
  culture_id: string;
  culture_variety_id: string | null;
  soil_id: string;
  crop_stage: string;
  planting_date: string;
  emergence_date: string | null;
  expected_harvest_date: string | null;
  parameter_mode: ParameterMode;
  initial_root_depth: number | null;
  max_root_depth: number | null;
  irrigation_efficiency: number | null;
  depletion_factor: number | null;
  notes: string | null;
  active: boolean;
}

/** Padrões herdados do cadastro da cultura, usados no modo 'padrao'. */
export interface CultureDefaults {
  /** culture.root_depth — profundidade radicular máxima de referência (m) */
  rootDepth: number;
  /** culture.depletion_factor — fator p de referência */
  depletionFactor: number;
}

/** Parâmetros de manejo efetivos após aplicar o modo padrão/personalizado. */
export interface ResolvedManagementParams {
  efficiency: number;
  /** limite inferior do crescimento radicular (m), quando informado */
  initialRootDepth: number | null;
  /** limite superior do crescimento radicular (m) */
  maxRootDepth: number;
}

// ── DAE (dias após emergência/plantio) ───────────────────────────────────

/**
 * Data-base para o cálculo do DAE.
 * Regra atual: usa a data de emergência quando informada; caso contrário, a
 * data de plantio. Centralizado aqui para permitir configurações futuras
 * (ex.: origem por cultura ou por fazenda) sem alterar a estrutura do banco.
 */
export function resolveDaeReferenceDate(
  a: Pick<OperationalAssignment, "emergence_date" | "planting_date">,
): string {
  return a.emergence_date ?? a.planting_date;
}

/** DAE em dias entre a data-base e a data alvo (default: hoje), nunca negativo. */
export function computeDae(referenceDate: string, target: Date = new Date()): number {
  const refMs = new Date(referenceDate + "T00:00:00").getTime();
  const targetMs = new Date(target.toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.max(0, Math.floor((targetMs - refMs) / 86400000));
}

// ── Crescimento radicular ────────────────────────────────────────────────

/**
 * Profundidade radicular efetiva no dia, calculada automaticamente a partir
 * da cultura, das fases fenológicas e do DAE — limitada pelos valores de
 * profundidade inicial e máxima informados no vínculo. O usuário nunca informa
 * a raiz diária: apenas os limites, e o sistema calcula a evolução.
 */
export function computeRootDepth(params: {
  phases: CulturePhase[];
  dae: number;
  cultureRootDepth: number;
  initialRootDepth?: number | null;
  maxRootDepth?: number | null;
}): number {
  const { phases, dae, cultureRootDepth, initialRootDepth, maxRootDepth } = params;
  const base = phases.length > 0 ? interpolateRootDepth(phases, dae) : cultureRootDepth;
  const lower = initialRootDepth ?? 0;
  const upper = maxRootDepth ?? cultureRootDepth;
  // garante lower <= upper mesmo com dados inconsistentes
  const cappedUpper = Math.max(upper, lower);
  return Math.min(Math.max(base, lower), cappedUpper);
}

// ── Resolução dos parâmetros de manejo ───────────────────────────────────

/**
 * Resolve os parâmetros de manejo que não variam por dia (eficiência e limites
 * de raiz) conforme o modo do vínculo:
 * - 'padrao'        → herda da cultura / pivô
 * - 'personalizado' → usa os overrides do vínculo quando presentes
 *
 * O fator p e o Kc variam por fase/DAE e são resolvidos no laço diário do
 * balanço; use {@link resolveDepletionFactor} para o p.
 */
export function resolveManagementParams(
  a: OperationalAssignment,
  cultureDefaults: CultureDefaults,
  pivotEfficiency: number,
): ResolvedManagementParams {
  const custom = a.parameter_mode === "personalizado";
  return {
    efficiency:
      custom && a.irrigation_efficiency != null ? a.irrigation_efficiency : pivotEfficiency,
    initialRootDepth: custom ? a.initial_root_depth : null,
    maxRootDepth:
      custom && a.max_root_depth != null ? a.max_root_depth : cultureDefaults.rootDepth,
  };
}

/**
 * Fator de depleção (p) efetivo para o dia. No modo personalizado, o override
 * do vínculo tem prioridade; caso contrário usa-se o p da fase corrente e,
 * em último caso, o p padrão da cultura.
 */
export function resolveDepletionFactor(
  a: OperationalAssignment,
  phaseDepletionFactor: number | null | undefined,
  cultureDepletionFactor: number,
): number {
  if (a.parameter_mode === "personalizado" && a.depletion_factor != null) {
    return a.depletion_factor;
  }
  return phaseDepletionFactor ?? cultureDepletionFactor;
}
