import { roundTo, clamp } from "@/utils/math";
import { calculateEffectivePrecipitation } from "@/modules/weather/services";

// ── Types ─────────────────────────────────────────────────────────────────

export type WaterStatus =
  | "saturado"
  | "ideal"
  | "atencao"
  | "deficit"
  | "deficit_critico";

export interface WaterBalanceInput {
  et0: number;
  precipitation: number;
  irrigationApplied: number;
  previousStoredWater: number;
  fieldCapacity: number;
  wiltingPoint: number;
  rootDepth: number;
  effectiveSoilDepth: number;
  kc: number;
  depletionFactor: number;
  pivotEfficiency: number;
  pivotArea: number;
  pivotFlowRate: number;
}

export interface WaterBalanceResult {
  et0: number;
  kc: number;
  etc: number;
  precipitation: number;
  effectivePrecipitation: number;
  irrigationApplied: number;
  rootDepth: number;
  cad: number;
  afd: number;
  storedWater: number;
  depletionFactor: number;
  deficit: number;
  surplus: number;
  netDepth: number;
  grossDepth: number;
  volumeNeeded: number;
  irrigationTime: number;
  waterStatus: WaterStatus;
}

export interface DailyBalanceRow extends WaterBalanceResult {
  date: string;
  phase: string;
  pivotId?: string;
  pivotName?: string;
}

export interface BalanceSummary {
  days: number;
  avgETc: number;
  totalETc: number;
  totalPrecipitation: number;
  totalEffPrecipitation: number;
  totalIrrigation: number;
  avgStoredWater: number;
  minStoredWater: number;
  maxDeficit: number;
  totalSurplus: number;
  daysInDeficit: number;
  daysInCritical: number;
}

export interface BalanceValidation {
  field: string;
  level: "error" | "warning";
  message: string;
}

// ── Core FAO-56 Calculations ────────────────────────────────────────────

// ETc = ET₀ × Kc (FAO-56, eq. 58)
export function calculateETc(et0: number, kc: number): number {
  return roundTo(Math.max(et0 * kc, 0), 2);
}

// CAD with dynamic root depth limited by effective soil depth
// CAD = (CC - PMP) × Z × 1000  (FAO-56, eq. 82)
// CC and PMP in cm³/cm³, Z in meters, result in mm
export function calculateDynamicCAD(
  fieldCapacity: number,
  wiltingPoint: number,
  rootDepth: number,
  effectiveSoilDepth: number
): number {
  const z = Math.min(rootDepth, effectiveSoilDepth);
  const cad = (fieldCapacity - wiltingPoint) * z * 1000;
  return roundTo(Math.max(cad, 0), 2);
}

// AFD = CAD × p  (FAO-56, eq. 83)
export function calculateDynamicAFD(
  cad: number,
  depletionFactor: number
): number {
  return roundTo(cad * clamp(depletionFactor, 0, 1), 2);
}

// p adjusted = p_table + 0.04 × (5 - ETc)  (FAO-56, eq. 84)
export function adjustDepletionFactor(
  baseFactor: number,
  etc: number
): number {
  const adjusted = baseFactor + 0.04 * (5 - etc);
  return roundTo(clamp(adjusted, 0.1, 0.8), 3);
}

// ── Irrigation Calculations ─────────────────────────────────────────────

// Lâmina líquida = CAD - ARM_atual (how much to refill)
export function calculateNetDepth(
  cad: number,
  storedWater: number
): number {
  const net = cad - storedWater;
  return roundTo(Math.max(net, 0), 2);
}

// Lâmina bruta = Lâmina líquida / Eficiência
export function calculateGrossDepth(
  netDepth: number,
  efficiency: number
): number {
  if (efficiency <= 0) return 0;
  return roundTo(netDepth / efficiency, 2);
}

// Volume (m³) = Lâmina bruta (mm) × Área (ha) × 10
export function calculateVolume(
  grossDepth: number,
  areaHa: number
): number {
  return roundTo(grossDepth * areaHa * 10, 2);
}

// Tempo (h) = Volume (m³) / Vazão (m³/h)
export function calculateIrrigationTime(
  volume: number,
  flowRate: number
): number {
  if (flowRate <= 0) return 0;
  return roundTo(volume / flowRate, 2);
}

// ── Water Status ────────────────────────────────────────────────────────

export function determineWaterStatus(
  storedWater: number,
  cad: number,
  afd: number
): WaterStatus {
  if (cad <= 0) return "deficit_critico";

  const stressThreshold = cad - afd;

  if (storedWater >= cad) return "saturado";
  if (storedWater >= stressThreshold) return "ideal";

  const ratio = storedWater / cad;
  if (ratio >= 0.3) return "atencao";
  if (ratio >= 0.1) return "deficit";
  return "deficit_critico";
}

export const WATER_STATUS_CONFIG: Record<
  WaterStatus,
  { label: string; color: string; bgClass: string }
> = {
  saturado:        { label: "Saturado",        color: "#3b82f6", bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  ideal:           { label: "Ideal",           color: "#22c55e", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  atencao:         { label: "Atenção",         color: "#f59e0b", bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  deficit:         { label: "Déficit",         color: "#f97316", bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  deficit_critico: { label: "Déficit Crítico", color: "#ef4444", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

// ── Daily Balance Engine ────────────────────────────────────────────────

export function calculateDailyBalance(
  input: WaterBalanceInput
): WaterBalanceResult {
  const {
    et0,
    precipitation,
    irrigationApplied,
    previousStoredWater,
    fieldCapacity,
    wiltingPoint,
    rootDepth,
    effectiveSoilDepth,
    kc,
    depletionFactor: basePFactor,
    pivotEfficiency,
    pivotArea,
    pivotFlowRate,
  } = input;

  // 1. ETc
  const etc = calculateETc(et0, kc);

  // 2. Adjusted depletion factor (FAO-56 eq. 84)
  const pAdjusted = adjustDepletionFactor(basePFactor, etc);

  // 3. Dynamic CAD/AFD based on current root depth
  const cad = calculateDynamicCAD(
    fieldCapacity,
    wiltingPoint,
    rootDepth,
    effectiveSoilDepth
  );
  const afd = calculateDynamicAFD(cad, pAdjusted);

  // 4. Effective precipitation (USDA SCS)
  const effectivePrecipitation = calculateEffectivePrecipitation(precipitation);

  // 5. Water balance equation
  // ARM(t) = ARM(t-1) + Pe + Irrigação - ETc
  let storedWater =
    previousStoredWater + effectivePrecipitation + irrigationApplied - etc;

  // 6. Surplus (excess above field capacity)
  let surplus = 0;
  if (storedWater > cad) {
    surplus = roundTo(storedWater - cad, 2);
    storedWater = cad;
  }

  // 7. Floor at zero (cannot go below wilting point)
  storedWater = roundTo(Math.max(storedWater, 0), 2);

  // 8. Deficit
  const stressThreshold = cad - afd;
  const deficit = storedWater < stressThreshold
    ? roundTo(stressThreshold - storedWater, 2)
    : 0;

  // 9. Irrigation needs
  const netDepth = calculateNetDepth(cad, storedWater);
  const grossDepth = calculateGrossDepth(netDepth, pivotEfficiency);
  const volumeNeeded = calculateVolume(grossDepth, pivotArea);
  const irrigationTime = calculateIrrigationTime(volumeNeeded, pivotFlowRate);

  // 10. Water status
  const waterStatus = determineWaterStatus(storedWater, cad, afd);

  return {
    et0: roundTo(et0, 2),
    kc: roundTo(kc, 3),
    etc,
    precipitation: roundTo(precipitation, 2),
    effectivePrecipitation: roundTo(effectivePrecipitation, 2),
    irrigationApplied: roundTo(irrigationApplied, 2),
    rootDepth: roundTo(rootDepth, 3),
    cad,
    afd,
    storedWater,
    depletionFactor: pAdjusted,
    deficit,
    surplus,
    netDepth,
    grossDepth,
    volumeNeeded,
    irrigationTime,
    waterStatus,
  };
}

// ── Multi-day Simulation ────────────────────────────────────────────────

export interface DayInput {
  date: string;
  et0: number;
  precipitation: number;
  irrigationApplied: number;
  kc: number;
  rootDepth: number;
  depletionFactor: number;
  phase: string;
}

export function simulateBalance(
  days: DayInput[],
  initialStoredWater: number,
  fieldCapacity: number,
  wiltingPoint: number,
  effectiveSoilDepth: number,
  pivotEfficiency: number,
  pivotArea: number,
  pivotFlowRate: number
): DailyBalanceRow[] {
  const results: DailyBalanceRow[] = [];
  let previousStored = initialStoredWater;

  for (const day of days) {
    const result = calculateDailyBalance({
      et0: day.et0,
      precipitation: day.precipitation,
      irrigationApplied: day.irrigationApplied,
      previousStoredWater: previousStored,
      fieldCapacity,
      wiltingPoint,
      rootDepth: day.rootDepth,
      effectiveSoilDepth,
      kc: day.kc,
      depletionFactor: day.depletionFactor,
      pivotEfficiency,
      pivotArea,
      pivotFlowRate,
    });

    results.push({ ...result, date: day.date, phase: day.phase });
    previousStored = result.storedWater;
  }

  return results;
}

// ── Summary ─────────────────────────────────────────────────────────────

export function calculateSummary(rows: DailyBalanceRow[]): BalanceSummary {
  if (rows.length === 0) {
    return {
      days: 0, avgETc: 0, totalETc: 0, totalPrecipitation: 0,
      totalEffPrecipitation: 0, totalIrrigation: 0, avgStoredWater: 0,
      minStoredWater: 0, maxDeficit: 0, totalSurplus: 0,
      daysInDeficit: 0, daysInCritical: 0,
    };
  }

  const totalETc = rows.reduce((s, r) => s + r.etc, 0);
  const totalPrecipitation = rows.reduce((s, r) => s + r.precipitation, 0);
  const totalEffPrecipitation = rows.reduce((s, r) => s + r.effectivePrecipitation, 0);
  const totalIrrigation = rows.reduce((s, r) => s + r.irrigationApplied, 0);
  const avgStoredWater = rows.reduce((s, r) => s + r.storedWater, 0) / rows.length;
  const minStoredWater = Math.min(...rows.map((r) => r.storedWater));
  const maxDeficit = Math.max(...rows.map((r) => r.deficit));
  const totalSurplus = rows.reduce((s, r) => s + r.surplus, 0);
  const daysInDeficit = rows.filter((r) => r.waterStatus === "deficit" || r.waterStatus === "deficit_critico").length;
  const daysInCritical = rows.filter((r) => r.waterStatus === "deficit_critico").length;

  return {
    days: rows.length,
    avgETc: roundTo(totalETc / rows.length, 2),
    totalETc: roundTo(totalETc, 2),
    totalPrecipitation: roundTo(totalPrecipitation, 2),
    totalEffPrecipitation: roundTo(totalEffPrecipitation, 2),
    totalIrrigation: roundTo(totalIrrigation, 2),
    avgStoredWater: roundTo(avgStoredWater, 2),
    minStoredWater: roundTo(minStoredWater, 2),
    maxDeficit: roundTo(maxDeficit, 2),
    totalSurplus: roundTo(totalSurplus, 2),
    daysInDeficit,
    daysInCritical,
  };
}

// ── Initial Storage ─────────────────────────────────────────────────────

// Start at field capacity (common assumption after planting irrigation)
export function calculateInitialStorage(
  fieldCapacity: number,
  wiltingPoint: number,
  rootDepth: number,
  effectiveSoilDepth: number,
  fractionOfCAD: number = 1.0
): number {
  const cad = calculateDynamicCAD(fieldCapacity, wiltingPoint, rootDepth, effectiveSoilDepth);
  return roundTo(cad * clamp(fractionOfCAD, 0, 1), 2);
}

// ── Validation ──────────────────────────────────────────────────────────

export function validateBalanceInput(input: {
  fieldCapacity: number;
  wiltingPoint: number;
  effectiveSoilDepth: number;
  pivotEfficiency: number;
  pivotArea: number;
  pivotFlowRate: number;
}): BalanceValidation[] {
  const issues: BalanceValidation[] = [];

  if (input.fieldCapacity <= input.wiltingPoint) {
    issues.push({ field: "field_capacity", level: "error", message: "Capacidade de campo deve ser maior que PMP" });
  }
  if (input.effectiveSoilDepth <= 0) {
    issues.push({ field: "effective_depth", level: "error", message: "Profundidade efetiva do solo deve ser positiva" });
  }
  if (input.pivotEfficiency <= 0 || input.pivotEfficiency > 1) {
    issues.push({ field: "efficiency", level: "error", message: "Eficiência do pivô deve estar entre 0 e 1" });
  }
  if (input.pivotArea <= 0) {
    issues.push({ field: "area", level: "error", message: "Área do pivô deve ser positiva" });
  }
  if (input.pivotFlowRate <= 0) {
    issues.push({ field: "flow_rate", level: "error", message: "Vazão do pivô deve ser positiva" });
  }

  return issues;
}
