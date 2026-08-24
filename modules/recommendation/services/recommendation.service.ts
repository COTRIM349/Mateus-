import { roundTo, clamp } from "@/utils/math";
import {
  calculateDynamicCAD,
  calculateDynamicAFD,
  adjustDepletionFactor,
  calculateETc,
  calculateNetDepth,
  calculateGrossDepth,
  calculateVolume,
  calculateIrrigationTime,
  determineWaterStatus,
  type WaterStatus,
} from "@/modules/water-balance/services";

// ── Types ─────────────────────────────────────────────────────────────────

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
  efficiency: number;
  pivotStatus: string;
  // Soil
  fieldCapacity: number;
  wiltingPoint: number;
  effectiveSoilDepth: number;
  // Current balance state
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
  // Culture
  cropPhase: string;
  daysAfterPlant: number;
  cycleDays: number;
  // Operational
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

// ── Phase Sensitivity ───────────────────────────────────────────────────

const PHASE_SENSITIVITY: Record<string, number> = {
  "Germinação": 0.7,
  "Vegetativo": 0.5,
  "Floração": 1.0,
  "Enchimento": 0.9,
  "Maturação": 0.3,
  "Colheita": 0.1,
};

function getPhaseSensitivity(phase: string): number {
  for (const [key, value] of Object.entries(PHASE_SENSITIVITY)) {
    if (phase.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return 0.5;
}

// ── Priority Score Algorithm ────────────────────────────────────────────

// Weighted scoring: higher = more urgent
//   Water deficit severity  (40%)
//   Crop phase sensitivity  (20%)
//   Productive risk         (20%)
//   Time urgency            (20%)
export function calculatePriorityScore(ctx: PivotContext): number {
  const { storedWater, cad, afd, deficit, etc, cropPhase, waterStatus } = ctx;

  if (cad <= 0) return 0;

  // 1. Deficit severity (0-100)
  const armRatio = storedWater / cad;
  const stressThreshold = (cad - afd) / cad;
  let deficitScore: number;
  if (armRatio <= 0.1) deficitScore = 100;
  else if (armRatio <= stressThreshold * 0.5) deficitScore = 85;
  else if (armRatio <= stressThreshold) deficitScore = 60;
  else if (armRatio <= stressThreshold + 0.1) deficitScore = 30;
  else deficitScore = 0;

  // 2. Phase sensitivity (0-100)
  const sensitivity = getPhaseSensitivity(cropPhase);
  const phaseScore = sensitivity * 100;

  // 3. Productive risk (0-100)
  const riskScore = calculateProductiveRisk(ctx);

  // 4. Time urgency: how many days of ETc until stress?
  const waterAboveStress = storedWater - (cad - afd);
  const daysToStress = etc > 0 ? Math.max(0, waterAboveStress / etc) : 999;
  let urgencyScore: number;
  if (daysToStress <= 0) urgencyScore = 100;
  else if (daysToStress <= 1) urgencyScore = 80;
  else if (daysToStress <= 2) urgencyScore = 50;
  else if (daysToStress <= 3) urgencyScore = 25;
  else urgencyScore = 0;

  const score =
    deficitScore * 0.40 +
    phaseScore * 0.20 +
    riskScore * 0.20 +
    urgencyScore * 0.20;

  return roundTo(clamp(score, 0, 100), 1);
}

// ── Productive Risk ─────────────────────────────────────────────────────

export function calculateProductiveRisk(ctx: PivotContext): number {
  const { storedWater, cad, afd, cropPhase, daysAfterPlant, cycleDays } = ctx;

  if (cad <= 0) return 0;

  const armRatio = storedWater / cad;
  const sensitivity = getPhaseSensitivity(cropPhase);

  // Base risk from water status
  let baseRisk: number;
  if (armRatio <= 0.05) baseRisk = 100;
  else if (armRatio <= 0.1) baseRisk = 80;
  else if (armRatio <= 0.2) baseRisk = 60;
  else if (armRatio <= 0.3) baseRisk = 40;
  else if (armRatio < (cad - afd) / cad) baseRisk = 20;
  else baseRisk = 0;

  // Amplify by phase sensitivity
  const risk = baseRisk * (0.5 + 0.5 * sensitivity);

  // Reduce risk if near end of cycle (maturação/colheita)
  const cycleProgress = cycleDays > 0 ? daysAfterPlant / cycleDays : 0;
  const lateSeasonFactor = cycleProgress > 0.85 ? 0.5 : 1.0;

  return roundTo(clamp(risk * lateSeasonFactor, 0, 100), 1);
}

// ── Priority Classification ─────────────────────────────────────────────

export function classifyPriority(score: number): RecommendationPriority {
  if (score >= 80) return "critica";
  if (score >= 60) return "alta";
  if (score >= 40) return "media";
  if (score >= 20) return "baixa";
  return "sem_necessidade";
}

// ── Operational Status ──────────────────────────────────────────────────

export function determineOperationalStatus(
  score: number,
  waterStatus: WaterStatus,
  daysToStress: number,
  maintenanceBlocked: boolean,
  forecastPrecip: number,
  etc: number
): OperationalStatus {
  if (maintenanceBlocked) return "nao_irrigar";

  // Significant rain expected covers ETc
  if (forecastPrecip > etc * 0.8) return "monitorar";

  if (score >= 80 || waterStatus === "deficit_critico") return "irrigar_imediatamente";
  if (score >= 60 || (waterStatus === "deficit" && daysToStress <= 1)) return "irrigar_hoje";
  if (score >= 40 || (waterStatus === "atencao" && daysToStress <= 2)) return "irrigar_amanha";
  if (score >= 20) return "monitorar";
  return "nao_irrigar";
}

// ── Recommended Start Time ──────────────────────────────────────────────

export function calculateRecommendedStart(
  currentHour: number,
  peakStart: number,
  peakEnd: number,
  irrigationTimeH: number,
  isUrgent: boolean
): { start: string; peakRestricted: boolean } {
  // If urgent and not in peak, start now
  if (isUrgent && (currentHour < peakStart || currentHour >= peakEnd)) {
    return { start: "Imediatamente", peakRestricted: false };
  }

  // If currently in peak hours
  if (currentHour >= peakStart && currentHour < peakEnd) {
    if (isUrgent) {
      return { start: "Imediatamente (atenção: horário de ponta)", peakRestricted: true };
    }
    return { start: `Após ${peakEnd}:00`, peakRestricted: true };
  }

  // Can we finish before peak?
  const hoursUntilPeak = peakStart - currentHour;
  if (hoursUntilPeak > 0 && irrigationTimeH > hoursUntilPeak) {
    // Won't finish before peak - start after peak instead
    if (!isUrgent) {
      return { start: `Após ${peakEnd}:00`, peakRestricted: true };
    }
  }

  // Normal start
  if (currentHour < 6) return { start: "06:00", peakRestricted: false };
  return { start: "Agora", peakRestricted: false };
}

// ── Days Until Stress ───────────────────────────────────────────────────

export function estimateDaysToStress(
  storedWater: number,
  cad: number,
  afd: number,
  dailyEtc: number
): number {
  if (dailyEtc <= 0) return 999;
  const stressThreshold = cad - afd;
  const waterAboveStress = storedWater - stressThreshold;
  if (waterAboveStress <= 0) return 0;
  return roundTo(waterAboveStress / dailyEtc, 1);
}

// ── Main Recommendation Engine ──────────────────────────────────────────

export function generateRecommendation(ctx: PivotContext): Recommendation {
  const score = calculatePriorityScore(ctx);
  const priority = classifyPriority(score);
  const risk = calculateProductiveRisk(ctx);
  const daysToStress = estimateDaysToStress(ctx.storedWater, ctx.cad, ctx.afd, ctx.etc);

  const opStatus = determineOperationalStatus(
    score,
    ctx.waterStatus,
    daysToStress,
    ctx.maintenanceBlocked,
    ctx.forecastPrecip,
    ctx.etc
  );

  const shouldIrrigate =
    opStatus === "irrigar_imediatamente" ||
    opStatus === "irrigar_hoje" ||
    opStatus === "irrigar_amanha";

  // Calculate irrigation amounts
  const netDepth = shouldIrrigate ? calculateNetDepth(ctx.cad, ctx.storedWater) : 0;
  const grossDepth = shouldIrrigate ? calculateGrossDepth(netDepth, ctx.efficiency) : 0;
  const volume = shouldIrrigate ? calculateVolume(grossDepth, ctx.area) : 0;
  const time = shouldIrrigate ? calculateIrrigationTime(volume, ctx.flowRate) : 0;

  const isUrgent = opStatus === "irrigar_imediatamente";
  const { start, peakRestricted } = calculateRecommendedStart(
    ctx.currentHour,
    ctx.peakHourStart,
    ctx.peakHourEnd,
    time,
    isUrgent
  );

  // Build reason
  const reason = buildReason(ctx, score, daysToStress, opStatus);
  const observations = buildObservations(ctx, peakRestricted, daysToStress);

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
    volumeM3: roundTo(volume, 0),
    irrigationTimeH: roundTo(time, 1),
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
    observations,
  };
}

// ── Reason Builder ──────────────────────────────────────────────────────

function buildReason(
  ctx: PivotContext,
  score: number,
  daysToStress: number,
  status: OperationalStatus
): string {
  const armPct = ctx.cad > 0 ? ((ctx.storedWater / ctx.cad) * 100).toFixed(0) : "0";

  switch (status) {
    case "irrigar_imediatamente":
      return `ARM em ${armPct}% do CAD. ${ctx.waterStatus === "deficit_critico" ? "Déficit crítico" : "Déficit severo"} na fase ${ctx.cropPhase}. Risco produtivo elevado.`;
    case "irrigar_hoje":
      return `ARM em ${armPct}% do CAD. Estresse hídrico em ~${daysToStress.toFixed(0)} dia(s). Fase ${ctx.cropPhase} requer atenção.`;
    case "irrigar_amanha":
      return `ARM em ${armPct}% do CAD. Estresse previsto em ${daysToStress.toFixed(0)} dias. Irrigação preventiva recomendada.`;
    case "monitorar":
      if (ctx.forecastPrecip > 0) {
        return `ARM em ${armPct}% do CAD. Chuva prevista de ${ctx.forecastPrecip.toFixed(0)} mm pode suprir a demanda.`;
      }
      return `ARM em ${armPct}% do CAD. Situação confortável, monitorar evolução.`;
    case "nao_irrigar":
      if (ctx.maintenanceBlocked) return "Pivô em manutenção. Irrigação bloqueada.";
      return `ARM em ${armPct}% do CAD. Sem necessidade de irrigação.`;
  }
}

function buildObservations(
  ctx: PivotContext,
  peakRestricted: boolean,
  daysToStress: number
): string {
  const notes: string[] = [];

  if (peakRestricted) {
    notes.push(`Horário de ponta: ${ctx.peakHourStart}h–${ctx.peakHourEnd}h`);
  }
  if (ctx.maintenanceBlocked) {
    notes.push("Equipamento em manutenção");
  }
  if (ctx.forecastPrecip > 0) {
    notes.push(`Chuva prevista: ${ctx.forecastPrecip.toFixed(0)} mm`);
  }
  if (daysToStress <= 3 && daysToStress > 0) {
    notes.push(`Estresse hídrico em ~${daysToStress.toFixed(0)} dia(s)`);
  }

  const sensitivity = getPhaseSensitivity(ctx.cropPhase);
  if (sensitivity >= 0.9) {
    notes.push(`Fase ${ctx.cropPhase}: alta sensibilidade ao déficit`);
  }

  return notes.join(". ");
}

// ── Simulation Engine ───────────────────────────────────────────────────

export function simulateScenarios(ctx: PivotContext): SimulationScenario[] {
  const scenarios: SimulationScenario[] = [];

  const baseDepth = calculateNetDepth(ctx.cad, ctx.storedWater);

  // Scenario 1: Irrigate today with full depth
  scenarios.push(buildScenario(ctx, "Irrigar hoje (lâmina completa)", "Reposição total até capacidade de campo", baseDepth));

  // Scenario 2: Irrigate today with 75%
  scenarios.push(buildScenario(ctx, "Irrigar hoje (75%)", "Lâmina reduzida para economia", baseDepth * 0.75));

  // Scenario 3: Irrigate today with 50% (déficit controlado)
  scenarios.push(buildScenario(ctx, "Déficit controlado (50%)", "Lâmina mínima, déficit parcial aceito", baseDepth * 0.5));

  // Scenario 4: Irrigate tomorrow (simulate 1 day without)
  const armAfter1Day = Math.max(0, ctx.storedWater - ctx.etc);
  const cadTomorrow = ctx.cad;
  const depthTomorrow = Math.max(0, cadTomorrow - armAfter1Day);
  scenarios.push(buildScenario(
    { ...ctx, storedWater: armAfter1Day },
    "Irrigar amanhã",
    "Adiar 1 dia, irrigar amanhã com reposição total",
    depthTomorrow
  ));

  // Scenario 5: Don't irrigate (project 3 days)
  let projectedArm = ctx.storedWater;
  for (let d = 0; d < 3; d++) {
    projectedArm = Math.max(0, projectedArm - ctx.etc);
  }
  scenarios.push(buildScenario(
    { ...ctx, storedWater: projectedArm },
    "Não irrigar (3 dias)",
    "Projeção de 3 dias sem irrigação",
    0
  ));

  // Scenario 6: Increase depth (120%)
  scenarios.push(buildScenario(ctx, "Lâmina extra (120%)", "Lâmina aumentada para reserva", baseDepth * 1.2));

  return scenarios;
}

function buildScenario(
  ctx: PivotContext,
  name: string,
  description: string,
  irrigationDepth: number
): SimulationScenario {
  const projectedArm = Math.min(
    ctx.cad,
    Math.max(0, ctx.storedWater + irrigationDepth - ctx.etc)
  );

  const pAdj = adjustDepletionFactor(ctx.depletionFactor, ctx.etc);
  const afd = calculateDynamicAFD(ctx.cad, pAdj);
  const projectedStatus = determineWaterStatus(projectedArm, ctx.cad, afd);
  const stressThreshold = ctx.cad - afd;
  const projectedDeficit = projectedArm < stressThreshold
    ? roundTo(stressThreshold - projectedArm, 1)
    : 0;

  const daysUntilStress = ctx.etc > 0
    ? Math.max(0, roundTo((projectedArm - stressThreshold) / ctx.etc, 1))
    : 999;

  const projectedRisk = calculateProductiveRisk({
    ...ctx,
    storedWater: projectedArm,
    deficit: projectedDeficit,
  });

  return {
    name,
    description,
    irrigationDepth: roundTo(irrigationDepth, 1),
    projectedArm: roundTo(projectedArm, 1),
    projectedCad: roundTo(ctx.cad, 1),
    projectedStatus,
    projectedDeficit,
    projectedRisk: roundTo(projectedRisk, 1),
    daysUntilStress: Math.max(0, roundTo(daysUntilStress, 0)),
  };
}

// ── Ranking ─────────────────────────────────────────────────────────────

export function rankRecommendations(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => b.priorityScore - a.priorityScore);
}

// ── Status Config ───────────────────────────────────────────────────────

export const OPERATIONAL_STATUS_CONFIG: Record<
  OperationalStatus,
  { label: string; bgClass: string; icon: string }
> = {
  irrigar_imediatamente: {
    label: "Irrigar Imediatamente",
    bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: "!!",
  },
  irrigar_hoje: {
    label: "Irrigar Hoje",
    bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: "!",
  },
  irrigar_amanha: {
    label: "Irrigar Amanhã",
    bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: "~",
  },
  monitorar: {
    label: "Monitorar",
    bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "?",
  },
  nao_irrigar: {
    label: "Não Irrigar",
    bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: "✓",
  },
};

export const PRIORITY_CONFIG: Record<
  RecommendationPriority,
  { label: string; bgClass: string }
> = {
  critica: { label: "Crítica", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  alta:    { label: "Alta",    bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  media:   { label: "Média",   bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  baixa:   { label: "Baixa",   bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  sem_necessidade: { label: "Sem Necessidade", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};
