import { roundTo, clamp } from "@/utils/math";
import type { WaterStatus } from "@/modules/water-balance/services";

export type OperationalStatus =
  | "irrigar_imediatamente"
  | "irrigar_hoje"
  | "irrigar_amanha"
  | "monitorar"
  | "nao_irrigar";

export type RecommendationPriority =
  | "critica"
  | "alta"
  | "media"
  | "baixa"
  | "sem_necessidade";

export interface PivotContext {
  pivotId: string;
  pivotName: string;
  area: number;
  flowRate: number;
  /** Eficiência de aplicação (Ea), nunca CUC. */
  efficiency: number;
  pivotStatus: string;
  fieldCapacity: number;
  wiltingPoint: number;
  effectiveSoilDepth: number;
  storedWater: number;
  cad: number;
  afd: number;
  deficit: number;
  etc: number;
  et0: number;
  kc: number;
  rootDepth: number;
  depletionFactor: number;
  waterStatus: WaterStatus;
  cropPhase: string;
  daysAfterPlant: number;
  cycleDays: number;
  forecastPrecip: number;
  peakHourStart: number;
  peakHourEnd: number;
  currentHour: number;
  maintenanceBlocked: boolean;
  reservoirAvailable: boolean;
}

export interface Recommendation {
  pivotId: string;
  pivotName: string;
  shouldIrrigate: boolean;
  operationalStatus: OperationalStatus;
  priority: RecommendationPriority;
  priorityScore: number;
  productiveRisk: number;
  netDepth: number;
  grossDepth: number;
  volumeM3: number;
  irrigationTimeH: number;
  currentArm: number;
  currentCad: number;
  currentAfd: number;
  currentDeficit: number;
  currentEtc: number;
  currentKc: number;
  rootDepth: number;
  cropPhase: string;
  depletionFactor: number;
  peakRestricted: boolean;
  recommendedStart: string;
  reason: string;
  observations: string;
}

export interface SimulationScenario {
  name: string;
  description: string;
  irrigationDepth: number;
  projectedArm: number;
  projectedCad: number;
  projectedStatus: WaterStatus;
  projectedDeficit: number;
  projectedRisk: number;
  daysUntilStress: number;
}

/**
 * Sensibilidade hídrica operacional por fase. Mantém chaves genéricas e inclui
 * nomenclaturas usuais de soja e algodão para não reduzir toda fase a 0,5.
 * O valor apenas ORDENA prioridade; não altera ETc, CAD, AFD ou lâmina.
 */
const PHASE_SENSITIVITY: Array<[RegExp, number]> = [
  [/\bR[1-2]\b|flora[cç][aã]o|florescimento/i, 1.0],
  [/\bR[3-4]\b|forma[cç][aã]o de vagens|forma[cç][aã]o de ma[cç][aã]s|ma[cç][aã]s/i, 1.0],
  [/\bR[5-6]\b|enchimento de gr[aã]os|enchimento/i, 0.95],
  [/bot[aã]o|abotoamento/i, 0.85],
  [/emerg[eê]ncia|germina[cç][aã]o|\bVE\b/i, 0.75],
  [/vegetativo|\bV\d+\b/i, 0.6],
  [/\bR7\b|abertura de capulhos|matura[cç][aã]o/i, 0.35],
  [/\bR8\b|colheita/i, 0.1],
];

function getPhaseSensitivity(phase: string): number {
  for (const [pattern, value] of PHASE_SENSITIVITY) {
    if (pattern.test(phase ?? "")) return value;
  }
  return 0.5;
}

function contextIsOperational(ctx: PivotContext): boolean {
  return [
    ctx.area,
    ctx.flowRate,
    ctx.efficiency,
    ctx.storedWater,
    ctx.cad,
    ctx.afd,
    ctx.deficit,
    ctx.etc,
    ctx.et0,
    ctx.kc,
    ctx.rootDepth,
  ].every(Number.isFinite)
    && ctx.area > 0
    && ctx.flowRate > 0
    && ctx.efficiency > 0
    && ctx.efficiency <= 1
    && ctx.cad > 0
    && ctx.afd > 0
    && ctx.storedWater >= 0
    && ctx.storedWater <= ctx.cad + 0.05
    && ctx.et0 > 0
    && ctx.etc > 0;
}

export function calculateProductiveRisk(ctx: PivotContext): number {
  if (ctx.cad <= 0 || ctx.afd <= 0) return 0;
  const afdRatio = Math.max(ctx.deficit, 0) / ctx.afd;
  const sensitivity = getPhaseSensitivity(ctx.cropPhase);
  const stress = clamp(afdRatio, 0, 2) / 2;
  return roundTo(clamp(stress * sensitivity * 100, 0, 100), 1);
}

export function estimateDaysToStress(storedWater: number, cad: number, afd: number, dailyEtc: number): number {
  if (dailyEtc <= 0 || cad <= 0 || afd <= 0) return 999;
  const safetyArm = Math.max(cad - afd, 0);
  const reserve = storedWater - safetyArm;
  if (reserve <= 0) return 0;
  return roundTo(reserve / dailyEtc, 1);
}

export function calculatePriorityScore(ctx: PivotContext): number {
  if (!contextIsOperational(ctx)) return 0;
  const afdRatio = Math.max(ctx.deficit, 0) / ctx.afd;
  const deficitScore = clamp(afdRatio * 70, 0, 100);
  const phaseScore = getPhaseSensitivity(ctx.cropPhase) * 100;
  const riskScore = calculateProductiveRisk(ctx);
  const days = estimateDaysToStress(ctx.storedWater, ctx.cad, ctx.afd, ctx.etc);
  const urgencyScore = days <= 0 ? 100 : days <= 1 ? 80 : days <= 2 ? 55 : days <= 3 ? 30 : 0;
  return roundTo(clamp(deficitScore * 0.45 + phaseScore * 0.2 + riskScore * 0.2 + urgencyScore * 0.15, 0, 100), 1);
}

export function classifyPriority(score: number): RecommendationPriority {
  if (score >= 80) return "critica";
  if (score >= 60) return "alta";
  if (score >= 40) return "media";
  if (score >= 20) return "baixa";
  return "sem_necessidade";
}

export function determineOperationalStatus(
  score: number,
  _waterStatus: WaterStatus,
  daysToStress: number,
  maintenanceBlocked: boolean,
  forecastPrecip: number,
  etc: number,
): OperationalStatus {
  if (maintenanceBlocked) return "nao_irrigar";
  if (forecastPrecip > 0 && etc > 0 && forecastPrecip >= etc * 0.8) return "monitorar";
  if (score >= 80 || daysToStress <= 0) return "irrigar_imediatamente";
  if (score >= 60 || daysToStress <= 1) return "irrigar_hoje";
  if (score >= 40 || daysToStress <= 2) return "irrigar_amanha";
  if (score >= 20) return "monitorar";
  return "nao_irrigar";
}

export function calculateRecommendedStart(
  currentHour: number,
  peakStart: number,
  peakEnd: number,
  irrigationTimeH: number,
  isUrgent: boolean,
): { start: string; peakRestricted: boolean } {
  if (isUrgent && (currentHour < peakStart || currentHour >= peakEnd)) return { start: "Imediatamente", peakRestricted: false };
  if (currentHour >= peakStart && currentHour < peakEnd) {
    if (isUrgent) return { start: "Imediatamente (atenção: horário de ponta)", peakRestricted: true };
    return { start: `Após ${peakEnd}:00`, peakRestricted: true };
  }
  const hoursUntilPeak = peakStart - currentHour;
  if (hoursUntilPeak > 0 && irrigationTimeH > hoursUntilPeak && !isUrgent) return { start: `Após ${peakEnd}:00`, peakRestricted: true };
  return { start: "Agora", peakRestricted: false };
}

function baseRecommendation(ctx: PivotContext, reason: string): Recommendation {
  return {
    pivotId: ctx.pivotId,
    pivotName: ctx.pivotName,
    shouldIrrigate: false,
    operationalStatus: "monitorar",
    priority: "sem_necessidade",
    priorityScore: 0,
    productiveRisk: 0,
    netDepth: 0,
    grossDepth: 0,
    volumeM3: 0,
    irrigationTimeH: 0,
    currentArm: Number.isFinite(ctx.storedWater) ? roundTo(ctx.storedWater, 1) : 0,
    currentCad: Number.isFinite(ctx.cad) ? roundTo(ctx.cad, 1) : 0,
    currentAfd: Number.isFinite(ctx.afd) ? roundTo(ctx.afd, 1) : 0,
    currentDeficit: Number.isFinite(ctx.deficit) ? roundTo(ctx.deficit, 1) : 0,
    currentEtc: Number.isFinite(ctx.etc) ? roundTo(ctx.etc, 1) : 0,
    currentKc: Number.isFinite(ctx.kc) ? roundTo(ctx.kc, 2) : 0,
    rootDepth: Number.isFinite(ctx.rootDepth) ? roundTo(ctx.rootDepth, 2) : 0,
    cropPhase: ctx.cropPhase,
    depletionFactor: Number.isFinite(ctx.depletionFactor) ? ctx.depletionFactor : 0,
    peakRestricted: false,
    recommendedStart: "Aguardar dados",
    reason,
    observations: "Recomendação operacional bloqueada até existir balanço hídrico válido.",
  };
}

export function generateRecommendation(ctx: PivotContext): Recommendation {
  if (!contextIsOperational(ctx)) {
    return baseRecommendation(ctx, "Dados insuficientes para recomendação: é necessário balanço hídrico válido, ETo/ETc calculadas e eficiência de aplicação cadastrada.");
  }

  const score = calculatePriorityScore(ctx);
  const priority = classifyPriority(score);
  const risk = calculateProductiveRisk(ctx);
  const daysToStress = estimateDaysToStress(ctx.storedWater, ctx.cad, ctx.afd, ctx.etc);
  const opStatus = determineOperationalStatus(score, ctx.waterStatus, daysToStress, ctx.maintenanceBlocked, ctx.forecastPrecip, ctx.etc);
  const shouldIrrigate = opStatus === "irrigar_imediatamente" || opStatus === "irrigar_hoje" || opStatus === "irrigar_amanha";

  const netDepth = shouldIrrigate ? roundTo(Math.max(ctx.cad - ctx.storedWater, 0), 2) : 0;
  const grossDepth = shouldIrrigate ? roundTo(netDepth / ctx.efficiency, 2) : 0;
  const volume = shouldIrrigate ? roundTo(grossDepth * ctx.area * 10, 0) : 0;
  const time = shouldIrrigate && ctx.flowRate > 0 ? roundTo(volume / ctx.flowRate, 1) : 0;
  const isUrgent = opStatus === "irrigar_imediatamente";
  const { start, peakRestricted } = calculateRecommendedStart(ctx.currentHour, ctx.peakHourStart, ctx.peakHourEnd, time, isUrgent);

  const afdPct = ctx.afd > 0 ? Math.round((ctx.deficit / ctx.afd) * 100) : 0;
  let reason = `Déficit em ${afdPct}% da AFD na fase ${ctx.cropPhase}.`;
  if (opStatus === "irrigar_imediatamente" || opStatus === "irrigar_hoje") reason += ` Recomenda-se ${grossDepth.toFixed(1)} mm brutos.`;
  else if (opStatus === "irrigar_amanha") reason += " Programar irrigação e acompanhar a evolução do ARM.";
  else if (ctx.forecastPrecip > 0) reason += ` Chuva prevista: ${ctx.forecastPrecip.toFixed(1)} mm; monitorar antes de aplicar.`;
  else reason += " Sem necessidade imediata; manter monitoramento.";

  const notes: string[] = [];
  if (peakRestricted) notes.push(`Horário de ponta: ${ctx.peakHourStart}h–${ctx.peakHourEnd}h`);
  if (getPhaseSensitivity(ctx.cropPhase) >= 0.9) notes.push(`Fase ${ctx.cropPhase} com alta sensibilidade hídrica`);
  if (daysToStress <= 3 && daysToStress > 0) notes.push(`Limite de estresse em ~${daysToStress.toFixed(1)} dia(s)`);

  return {
    pivotId: ctx.pivotId,
    pivotName: ctx.pivotName,
    shouldIrrigate,
    operationalStatus: opStatus,
    priority,
    priorityScore: score,
    productiveRisk: risk,
    netDepth: roundTo(netDepth, 1),
    grossDepth: roundTo(grossDepth, 1),
    volumeM3: volume,
    irrigationTimeH: time,
    currentArm: roundTo(ctx.storedWater, 1),
    currentCad: roundTo(ctx.cad, 1),
    currentAfd: roundTo(ctx.afd, 1),
    currentDeficit: roundTo(ctx.deficit, 1),
    currentEtc: roundTo(ctx.etc, 1),
    currentKc: roundTo(ctx.kc, 2),
    rootDepth: roundTo(ctx.rootDepth, 2),
    cropPhase: ctx.cropPhase,
    depletionFactor: ctx.depletionFactor,
    peakRestricted,
    recommendedStart: start,
    reason,
    observations: notes.join(". "),
  };
}

function waterStatusFromProjection(arm: number, cad: number, afd: number): WaterStatus {
  if (cad <= 0 || afd <= 0) return "ideal";
  const deficit = cad - arm;
  const ratio = deficit / afd;
  if (ratio >= 1.4) return "deficit_critico";
  if (ratio >= 1) return "deficit";
  if (ratio >= 0.7) return "atencao";
  if (ratio >= 0.3) return "ideal";
  return "ideal";
}

export function simulateScenarios(ctx: PivotContext): SimulationScenario[] {
  if (!contextIsOperational(ctx)) return [];
  const baseDepth = Math.max(ctx.cad - ctx.storedWater, 0);
  return [
    buildScenario(ctx, "Irrigar hoje (lâmina completa)", "Reposição até a CAD", baseDepth),
    buildScenario(ctx, "Irrigar hoje (75%)", "Reposição parcial de 75%", baseDepth * 0.75),
    buildScenario(ctx, "Déficit controlado (50%)", "Cenário exploratório; não é recomendação automática", baseDepth * 0.5),
    buildScenario({ ...ctx, storedWater: Math.max(0, ctx.storedWater - ctx.etc) }, "Irrigar amanhã", "Projeção de um dia adicional de consumo", Math.max(0, ctx.cad - Math.max(0, ctx.storedWater - ctx.etc))),
    buildScenario({ ...ctx, storedWater: Math.max(0, ctx.storedWater - 3 * ctx.etc) }, "Não irrigar (3 dias)", "Projeção de três dias sem reposição", 0),
  ];
}

function buildScenario(ctx: PivotContext, name: string, description: string, irrigationDepth: number): SimulationScenario {
  const effectiveIrrigation = Math.max(irrigationDepth, 0) * ctx.efficiency;
  const projectedArm = clamp(ctx.storedWater + effectiveIrrigation - ctx.etc, 0, ctx.cad);
  const projectedDeficit = roundTo(Math.max(ctx.cad - projectedArm, 0), 1);
  const projectedStatus = waterStatusFromProjection(projectedArm, ctx.cad, ctx.afd);
  const daysUntilStress = estimateDaysToStress(projectedArm, ctx.cad, ctx.afd, ctx.etc);
  const projectedRisk = calculateProductiveRisk({ ...ctx, storedWater: projectedArm, deficit: projectedDeficit });
  return {
    name,
    description,
    irrigationDepth: roundTo(irrigationDepth, 1),
    projectedArm: roundTo(projectedArm, 1),
    projectedCad: roundTo(ctx.cad, 1),
    projectedStatus,
    projectedDeficit,
    projectedRisk,
    daysUntilStress: daysUntilStress === 999 ? 999 : Math.max(0, roundTo(daysUntilStress, 1)),
  };
}

export function rankRecommendations(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => b.priorityScore - a.priorityScore);
}

export const OPERATIONAL_STATUS_CONFIG: Record<OperationalStatus, { label: string; bgClass: string; icon: string }> = {
  irrigar_imediatamente: { label: "IRRIGAR AGORA", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: "!!" },
  irrigar_hoje: { label: "IRRIGAR AGORA", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: "!" },
  irrigar_amanha: { label: "PROGRAMAR", bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: "~" },
  monitorar: { label: "MONITORAR", bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: "?" },
  nao_irrigar: { label: "SEM NECESSIDADE", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: "✓" },
};

export const PRIORITY_CONFIG: Record<RecommendationPriority, { label: string; bgClass: string }> = {
  critica: { label: "Crítica", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  alta: { label: "Alta", bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  media: { label: "Média", bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  baixa: { label: "Baixa", bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  sem_necessidade: { label: "Sem Necessidade", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};
