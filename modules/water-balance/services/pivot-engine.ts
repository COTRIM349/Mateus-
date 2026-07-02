// ============================================================================
// MOTOR CENTRAL DO BALANÇO HÍDRICO POR PIVÔ (Fase 3)
// ----------------------------------------------------------------------------
// Única fonte de cálculo do balanço. Funções puras (sem I/O): recebem os dados
// já carregados (vínculo, cultura, fases, solo, pivô, clima, irrigação) e
// produzem a série diária e o estado atual por pivô, além da agregação da
// fazenda para o Dashboard. Dashboard e Mapa apenas visualizam estes
// resultados — não replicam nenhuma regra de negócio.
// ============================================================================

import { roundTo } from "@/utils/math";
import { interpolateKc, identifyPhase, type CulturePhase } from "@/modules/culture/services";
import {
  resolveDaeReferenceDate,
  computeRootDepth,
  resolveDepletionFactor,
} from "@/modules/assignment/services";

// ── Status hídrico (3 níveis + sem dados) ────────────────────────────────

export type HydricStatus = "verde" | "amarelo" | "vermelho" | "cinza";

export const HYDRIC_STATUS_CONFIG: Record<
  HydricStatus,
  { label: string; color: string; bgClass: string }
> = {
  verde:    { label: "Adequado",   color: "#22c55e", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  amarelo:  { label: "Atenção",    color: "#f59e0b", bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  vermelho: { label: "Prioritário", color: "#ef4444", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cinza:    { label: "Sem dados",  color: "#9ca3af", bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
};

// ── Núcleo dos cálculos (fórmulas da Fase 3) ─────────────────────────────

/**
 * Água Disponível Total (mm).
 * ADT = (CC − PMP) × Ds × Z × 10, com Z (profundidade radicular) em cm.
 * field_capacity/wilting_point são frações (cm³/cm³ ou g/g) e Ds em g/cm³.
 * Em unidades consistentes: (CC − PMP) × Ds × Zₘ × 1000.
 */
export function calculateADT(
  fieldCapacity: number,
  wiltingPoint: number,
  bulkDensity: number,
  rootDepthMeters: number,
  effectiveSoilDepthMeters: number,
): number {
  const z = Math.max(0, Math.min(rootDepthMeters, effectiveSoilDepthMeters));
  const adt = (fieldCapacity - wiltingPoint) * bulkDensity * z * 1000;
  return roundTo(Math.max(adt, 0), 2);
}

/** Água Facilmente Disponível (mm). AFD = ADT × p. */
export function calculateAFD(adt: number, depletionFactor: number): number {
  const p = Math.min(Math.max(depletionFactor, 0), 1);
  return roundTo(adt * p, 2);
}

/**
 * Classificação do status hídrico pelo déficit relativo à AFD (item 11):
 * verde < 70% AFD · amarelo 70–100% AFD · vermelho > AFD · cinza sem dados.
 */
export function classifyHydricStatus(deficit: number, afd: number): HydricStatus {
  if (afd <= 0) return "cinza";
  const ratio = deficit / afd;
  if (ratio < 0.7) return "verde";
  if (ratio <= 1) return "amarelo";
  return "vermelho";
}

// ── Tipos de entrada/saída ───────────────────────────────────────────────

export interface EngineAssignment {
  id: string;
  planting_date: string;
  emergence_date: string | null;
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: number | null;
  max_root_depth: number | null;
  irrigation_efficiency: number | null;
  depletion_factor: number | null;
}

export interface EngineCulture {
  root_depth: number;
  depletion_factor: number;
}

export interface EngineSoil {
  field_capacity: number;
  wilting_point: number;
  bulk_density: number;
  effective_depth: number;
}

export interface EnginePivot {
  efficiency: number;
  area: number;
  flow_rate: number;
}

export interface EngineWeatherDay {
  et0: number;
  precipitation: number;
}

export interface PivotEngineInput {
  assignment: EngineAssignment;
  culture: EngineCulture;
  phases: CulturePhase[];
  soil: EngineSoil;
  pivot: EnginePivot;
  /** ET0 e chuva por data (YYYY-MM-DD) */
  weatherByDate: Record<string, EngineWeatherDay>;
  /** lâmina bruta aplicada (mm) por data */
  irrigationByDate: Record<string, number>;
  dateStart: string;
  dateEnd: string;
}

export interface BalanceDay {
  date: string;
  dae: number;
  phase: string;
  kc: number;
  et0: number;
  etc: number;
  precipitation: number;
  effectivePrecipitation: number;
  irrigation: number;
  effectiveIrrigation: number;
  rootDepth: number;
  adt: number;
  afd: number;
  storage: number;
  deficit: number;
  depletion: number;
  status: HydricStatus;
  shouldIrrigate: boolean;
  recommendedNetDepth: number;
  recommendedGrossDepth: number;
  recommendedVolume: number;
  estimatedIrrigationTime: number;
  recommendationReason: string;
}

// ── Recomendação de irrigação (itens 12 e 13) ────────────────────────────

function buildRecommendation(
  deficit: number,
  afd: number,
  status: HydricStatus,
  efficiency: number,
  area: number,
  flowRate: number,
): {
  shouldIrrigate: boolean;
  netDepth: number;
  grossDepth: number;
  volume: number;
  time: number;
  reason: string;
} {
  // lâmina líquida = déficit para retornar à capacidade segura (ADT cheia)
  const netDepth = roundTo(Math.max(deficit, 0), 2);
  const grossDepth = efficiency > 0 ? roundTo(netDepth / efficiency, 2) : 0;
  const volume = roundTo(grossDepth * area * 10, 2); // m³ = mm × ha × 10
  const time = flowRate > 0 ? roundTo(volume / flowRate, 2) : 0;

  // irrigar hoje quando o déficit atingiu a água facilmente disponível
  const shouldIrrigate = afd > 0 && deficit >= afd;

  let reason: string;
  if (status === "cinza") {
    reason = "Dados insuficientes para cálculo (solo, fases ou clima ausentes).";
  } else if (shouldIrrigate) {
    reason = `Déficit de ${netDepth.toFixed(1)} mm atingiu a água facilmente disponível (AFD ${afd.toFixed(1)} mm). Irrigar ${grossDepth.toFixed(1)} mm (bruta).`;
  } else if (status === "amarelo") {
    reason = `Déficit próximo ao limite (${afd > 0 ? Math.round((deficit / afd) * 100) : 0}% da AFD). Monitorar e preparar irrigação.`;
  } else {
    reason = "Armazenamento adequado. Sem necessidade de irrigação hoje.";
  }

  return { shouldIrrigate, netDepth, grossDepth, volume, time, reason };
}

// ── Série diária do balanço (motor) ──────────────────────────────────────

export function computePivotBalanceSeries(input: PivotEngineInput): BalanceDay[] {
  const { assignment, culture, phases, soil, pivot, weatherByDate, irrigationByDate, dateStart, dateEnd } = input;

  const startMs = new Date(dateStart + "T00:00:00").getTime();
  const endMs = new Date(dateEnd + "T00:00:00").getTime();
  const daeRefMs = new Date(resolveDaeReferenceDate(assignment) + "T00:00:00").getTime();

  const custom = assignment.parameter_mode === "personalizado";
  const efficiency =
    custom && assignment.irrigation_efficiency != null ? assignment.irrigation_efficiency : pivot.efficiency;

  const hasSoil = soil.field_capacity > soil.wilting_point && soil.bulk_density > 0;

  // armazenamento inicial: começa na capacidade (ADT cheia) com a raiz do dia inicial
  const rows: BalanceDay[] = [];
  let previousStorage: number | null = null;

  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const dae = Math.max(0, Math.floor((ms - daeRefMs) / 86400000));

    const kc = phases.length > 0 ? interpolateKc(phases, dae) : 1;
    const rootDepth = computeRootDepth({
      phases,
      dae,
      cultureRootDepth: culture.root_depth,
      initialRootDepth: custom ? assignment.initial_root_depth : null,
      maxRootDepth: custom ? assignment.max_root_depth : null,
    });
    const phaseId = phases.length > 0 ? identifyPhase(phases, dae) : null;
    const phaseName = phaseId?.phase.name ?? "—";
    const pFactor = resolveDepletionFactor(assignment, phaseId?.phase.depletion_factor, culture.depletion_factor);

    const adt = hasSoil
      ? calculateADT(soil.field_capacity, soil.wilting_point, soil.bulk_density, rootDepth, soil.effective_depth)
      : 0;
    const afd = calculateAFD(adt, pFactor);

    const weather = weatherByDate[date] ?? { et0: 0, precipitation: 0 };
    const etc = roundTo(Math.max(weather.et0 * kc, 0), 2);

    const irrigation = irrigationByDate[date] ?? 0;
    const effectiveIrrigation = roundTo(irrigation * efficiency, 2);

    // chuva efetiva = chuva registrada (limitada pela capacidade do solo via cap em ADT)
    const effectivePrecipitation = roundTo(Math.max(weather.precipitation, 0), 2);

    // armazenamento anterior: na ausência (primeiro dia) parte da capacidade
    const prev: number = previousStorage ?? adt;
    let storage = prev + effectivePrecipitation + effectiveIrrigation - etc;
    if (adt > 0 && storage > adt) storage = adt; // não ultrapassa ADT
    if (storage < 0) storage = 0;                 // não fica negativo
    storage = roundTo(storage, 2);

    const deficit = adt > 0 ? roundTo(Math.max(adt - storage, 0), 2) : 0;
    const depletion = adt > 0 ? roundTo(deficit / adt, 3) : 0;
    const status: HydricStatus = hasSoil ? classifyHydricStatus(deficit, afd) : "cinza";

    const rec = buildRecommendation(deficit, afd, status, efficiency, pivot.area, pivot.flow_rate);

    rows.push({
      date,
      dae,
      phase: phaseName,
      kc: roundTo(kc, 3),
      et0: roundTo(weather.et0, 2),
      etc,
      precipitation: roundTo(weather.precipitation, 2),
      effectivePrecipitation,
      irrigation: roundTo(irrigation, 2),
      effectiveIrrigation,
      rootDepth: roundTo(rootDepth, 3),
      adt,
      afd,
      storage,
      deficit,
      depletion,
      status,
      shouldIrrigate: rec.shouldIrrigate,
      recommendedNetDepth: rec.netDepth,
      recommendedGrossDepth: rec.grossDepth,
      recommendedVolume: rec.volume,
      estimatedIrrigationTime: rec.time,
      recommendationReason: rec.reason,
    });

    previousStorage = storage;
  }

  return rows;
}

// ── Estado atual do pivô (último dia da série) ───────────────────────────

export interface PivotHydricState {
  pivotId: string;
  pivotName: string;
  cultureName: string;
  varietyName: string | null;
  seasonName: string | null;
  area: number;
  latitude: number;
  longitude: number;
  current: BalanceDay | null;
  history: BalanceDay[];
}

export interface PivotIdentity {
  pivotId: string;
  pivotName: string;
  cultureName: string;
  varietyName: string | null;
  seasonName: string | null;
  area: number;
  latitude: number;
  longitude: number;
}

/** Estado atual = último dia da série calculada (ou null se sem série). */
export function computePivotCurrentState(
  identity: PivotIdentity,
  input: PivotEngineInput,
): PivotHydricState {
  const history = computePivotBalanceSeries(input);
  return {
    ...identity,
    current: history.length > 0 ? history[history.length - 1] : null,
    history,
  };
}

// ── Agregação da fazenda (Dashboard — item 16) ───────────────────────────

export interface FarmHydricSummary {
  totalPivots: number;
  needIrrigationToday: number;
  attention: number;
  adequate: number;
  noData: number;
  totalIrrigatedArea: number;
  areaInDeficit: number;
  avgRecommendedDepth: number;
  avgDeficit: number;
  totalRecommendedVolume: number;
  ranking: PivotHydricState[];
  priorityList: PivotHydricState[];
}

/**
 * Agrega os estados atuais dos pivôs para o Dashboard Operacional. Consome
 * apenas os resultados do motor — nenhuma regra de negócio é recalculada aqui.
 */
export function computeFarmHydricState(states: PivotHydricState[]): FarmHydricSummary {
  const withData = states.filter((s) => s.current && s.current.status !== "cinza");
  const noData = states.filter((s) => !s.current || s.current.status === "cinza");

  const needing = withData.filter((s) => s.current!.shouldIrrigate);
  const attention = withData.filter((s) => !s.current!.shouldIrrigate && s.current!.status === "amarelo");
  const adequate = withData.filter((s) => s.current!.status === "verde");

  const totalIrrigatedArea = withData.reduce((sum, s) => sum + s.area, 0);
  const areaInDeficit = withData
    .filter((s) => s.current!.status !== "verde")
    .reduce((sum, s) => sum + s.area, 0);

  const avgRecommendedDepth = needing.length > 0
    ? roundTo(needing.reduce((sum, s) => sum + s.current!.recommendedGrossDepth, 0) / needing.length, 2)
    : 0;
  const avgDeficit = withData.length > 0
    ? roundTo(withData.reduce((sum, s) => sum + s.current!.deficit, 0) / withData.length, 2)
    : 0;
  const totalRecommendedVolume = roundTo(
    needing.reduce((sum, s) => sum + s.current!.recommendedVolume, 0),
    2,
  );

  // ranking: mais críticos primeiro (maior depleção)
  const ranking = [...withData].sort((a, b) => b.current!.depletion - a.current!.depletion);
  // lista de prioridade: apenas os que precisam irrigar, ordenados por déficit
  const priorityList = [...needing].sort((a, b) => b.current!.deficit - a.current!.deficit);

  return {
    totalPivots: states.length,
    needIrrigationToday: needing.length,
    attention: attention.length,
    adequate: adequate.length,
    noData: noData.length,
    totalIrrigatedArea: roundTo(totalIrrigatedArea, 2),
    areaInDeficit: roundTo(areaInDeficit, 2),
    avgRecommendedDepth,
    avgDeficit,
    totalRecommendedVolume,
    ranking,
    priorityList,
  };
}
