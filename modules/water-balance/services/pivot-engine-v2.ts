// ============================================================================
// MOTOR HÍDRICO OPERACIONAL V2 — FONTE ÚNICA DE VERDADE
// ============================================================================
// Regras centrais:
// 1) ARM é contínuo: parte do balanço persistido anterior OU da umidade inicial.
// 2) Dia sem clima válido não é convertido em ETo/chuva zero: a série é bloqueada.
// 3) CUC não é eficiência de aplicação. O motor usa application_efficiency.
// 4) Chuva diária entra no balanço físico e o excesso acima da CAD é drenagem.
// ============================================================================

import { roundTo } from "@/utils/math";
import { interpolateKc, identifyPhase, type CulturePhase } from "@/modules/culture/services";
import { resolveDaeReferenceDate, computeRootDepth, resolveDepletionFactor } from "@/modules/assignment/services";
import { calculateKs } from "@/modules/assignment/services/parcel-motor-adapter";
import { calculateADTFromLayers, soilProfileIsUsable, type SoilProfileLayer } from "@/modules/soil/services";
import {
  formatEtcFormula,
  ksFunctionForEtc,
  resolveManejoKl,
  resolveKsFunctionName,
  resolvePhaseKy,
  yieldRiskFraction,
} from "./crop-coefficients";
import {
  applyDailySoilBalance,
  initialArmFromMoisture,
  moisturePercentOfFieldCapacity,
  profileCcPmp,
  safetyMoistureMm,
  safetyPercentOfFieldCapacity,
  scaleArmToNewCad,
  type InitialMoistureUnit,
} from "./soil-water-balance";
import { classifyWaterStatus, type MapHydricStatus } from "./map-hydric-status";

export type HydricStatus = "verde" | "amarelo" | "vermelho" | "cinza";

export const HYDRIC_STATUS_CONFIG: Record<HydricStatus, { label: string; color: string; bgClass: string }> = {
  verde: { label: "Adequado", color: "#166534", bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  amarelo: { label: "Alerta", color: "#f97316", bgClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  vermelho: { label: "Prioritário", color: "#dc2626", bgClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  cinza: { label: "Sem dados", color: "#9ca3af", bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
};

export function calculateADT(fieldCapacity: number, wiltingPoint: number, rootDepthMeters: number, effectiveSoilDepthMeters: number): number {
  const z = Math.max(0, Math.min(rootDepthMeters, effectiveSoilDepthMeters));
  return roundTo(Math.max((fieldCapacity - wiltingPoint) * z * 1000, 0), 2);
}

export function calculateAFD(adt: number, depletionFactor: number): number {
  const p = Math.min(Math.max(depletionFactor, 0), 1);
  return roundTo(adt * p, 2);
}

export function classifyHydricStatus(deficit: number, afd: number): HydricStatus {
  if (afd <= 0) return "cinza";
  const ratio = deficit / afd;
  if (ratio < 0.7) return "verde";
  if (ratio < 1) return "amarelo";
  return "vermelho";
}

export interface EngineAssignment {
  id: string;
  planting_date: string;
  emergence_date: string | null;
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: number | null;
  max_root_depth: number | null;
  irrigation_efficiency: number | null;
  depletion_factor: number | null;
  kl_override?: number | null;
  ks_function_override?: string | null;
  initial_soil_moisture_pct?: number | null;
  initial_moisture_unit?: InitialMoistureUnit | null;
  initial_moisture_is_cc?: boolean | null;
  deficit_irrigation?: boolean | null;
  stress_point_irrigation?: boolean | null;
}

export interface EngineCulture {
  root_depth: number | null;
  depletion_factor: number | null;
  kl?: number | null;
  ks_function?: string | null;
  ky?: number | null;
}

export interface EngineSoil {
  field_capacity: number;
  wilting_point: number;
  bulk_density: number;
  effective_depth: number;
  layers?: SoilProfileLayer[];
}

export interface EnginePivot {
  /** Campo novo e explícito. */
  application_efficiency?: number | null;
  /** Legado temporário; usado somente se application_efficiency ainda não existir. */
  efficiency?: number | null;
  area: number;
  flow_rate: number;
}

export interface EngineWeatherDay {
  et0: number;
  precipitation: number;
}

export interface AgronomicDayInput {
  /** Kc potencial diário. Nunca incorporar Ks neste valor. */
  kc: number;
  /** Profundidade radicular resolvida pelo domínio de cultura. */
  rootDepthM: number;
  /** p base resolvido pelo domínio de cultura; o ajuste diário por ETc continua no motor operacional. */
  depletionFractionP: number;
  /** Estádio efetivo (observado prevalece sobre previsto) apenas para rastreabilidade/exibição. */
  stageName?: string | null;
  /** Metadados de origem do conjunto diário. */
  origin?: Record<string, unknown> | null;
}

export interface PivotEngineInput {
  assignment: EngineAssignment;
  culture: EngineCulture;
  phases: CulturePhase[];
  soil: EngineSoil;
  pivot: EnginePivot;
  weatherByDate: Record<string, EngineWeatherDay>;
  irrigationByDate: Record<string, number>;
  dateStart: string;
  dateEnd: string;
  /** ARM ao fim do dia anterior a dateStart. */
  initialStorageMm?: number | null;
  /** CAD correspondente ao ARM persistido anterior. */
  initialCadMm?: number | null;
  /**
   * Parâmetros agronômicos diários rastreáveis.
   * Não contém CAD/CC/PMP: solo permanece responsabilidade do motor hídrico.
   */
  agronomicByDate?: Record<string, AgronomicDayInput>;
}

export interface BalanceDay {
  date: string;
  dae: number;
  phase: string;
  kc: number;
  kcAdjusted: number;
  ks: number;
  kl: number;
  et0: number;
  etcPotential: number;
  etc: number;
  etcFormula: string;
  ky: number | null;
  yieldRisk: number | null;
  precipitation: number;
  effectivePrecipitation: number;
  peFormula: string;
  irrigation: number;
  effectiveIrrigation: number;
  rootDepth: number;
  adt: number;
  afd: number;
  storage: number;
  surplus: number;
  deficit: number;
  depletion: number;
  fieldCapacity: number;
  wiltingPoint: number;
  safetyMoistureMm: number;
  moisturePctCc: number;
  safetyPctCc: number;
  balanceFormula: string;
  status: HydricStatus;
  mapStatus: MapHydricStatus;
  shouldIrrigate: boolean;
  recommendedNetDepth: number;
  recommendedGrossDepth: number;
  recommendedVolume: number;
  estimatedIrrigationTime: number;
  recommendationReason: string;
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return out;
  for (let ms = startMs; ms <= endMs; ms += 86400000) out.push(new Date(ms).toISOString().slice(0, 10));
  return out;
}

export function hasCompleteWeatherSeries(weatherByDate: Record<string, EngineWeatherDay>, start: string, end: string): boolean {
  return dateRange(start, end).every((date) => {
    const w = weatherByDate[date];
    return Boolean(
      w &&
      Number.isFinite(w.et0) && w.et0 >= 0 &&
      Number.isFinite(w.precipitation) && w.precipitation >= 0,
    );
  });
}

function resolveApplicationEfficiency(assignment: EngineAssignment, pivot: EnginePivot): number {
  if (assignment.parameter_mode === "personalizado" && assignment.irrigation_efficiency != null) {
    return assignment.irrigation_efficiency;
  }
  return pivot.application_efficiency ?? pivot.efficiency ?? 0;
}

function buildRecommendation(deficit: number, afd: number, status: HydricStatus, efficiency: number, area: number, flowRate: number, deficitIrrigation = false) {
  if (status === "cinza") return { shouldIrrigate: false, netDepth: 0, grossDepth: 0, volume: 0, time: 0, reason: "Dados insuficientes para cálculo confiável." };
  if (efficiency <= 0 || efficiency > 1) return { shouldIrrigate: false, netDepth: 0, grossDepth: 0, volume: 0, time: 0, reason: "Eficiência de aplicação ausente ou inválida." };

  const shouldIrrigate = afd > 0 && deficit >= afd;
  if (!shouldIrrigate) {
    const ratio = afd > 0 ? Math.round((deficit / afd) * 100) : 0;
    return { shouldIrrigate: false, netDepth: 0, grossDepth: 0, volume: 0, time: 0, reason: status === "amarelo" ? `Déficit em ${ratio}% da AFD. Preparar irrigação e monitorar.` : "Armazenamento adequado. Sem necessidade de irrigação hoje." };
  }

  // Reposição normal retorna à CAD. Em irrigação deficitária, repõe 80% do déficit
  // como regra operacional conservadora até existir alvo específico por fase.
  const targetFraction = deficitIrrigation ? 0.8 : 1;
  const netDepth = roundTo(Math.max(deficit * targetFraction, 0), 2);
  const grossDepth = roundTo(netDepth / efficiency, 2);
  const volume = roundTo(grossDepth * area * 10, 2);
  const time = flowRate > 0 ? roundTo(volume / flowRate, 2) : 0;
  return {
    shouldIrrigate: true,
    netDepth,
    grossDepth,
    volume,
    time,
    reason: `Déficit ${deficit.toFixed(1)} mm atingiu a AFD (${afd.toFixed(1)} mm). Recomendar ${grossDepth.toFixed(1)} mm brutos com Ea ${(efficiency * 100).toFixed(0)}%.`,
  };
}

export function computePivotBalanceSeries(input: PivotEngineInput): BalanceDay[] {
  const { assignment, culture, phases, soil, pivot, weatherByDate, irrigationByDate, dateStart, dateEnd } = input;
  if (!soilProfileIsUsable(soil, soil.layers)) return [];
  if (!hasCompleteWeatherSeries(weatherByDate, dateStart, dateEnd)) return [];

  const dates = dateRange(dateStart, dateEnd);
  if (dates.length === 0) return [];
  const daeRefMs = new Date(`${resolveDaeReferenceDate(assignment)}T00:00:00Z`).getTime();
  const custom = assignment.parameter_mode === "personalizado";
  const efficiency = resolveApplicationEfficiency(assignment, pivot);

  const rows: BalanceDay[] = [];
  let previousStorage: number | null = input.initialStorageMm ?? null;
  let previousCad: number | null = input.initialCadMm ?? null;

  for (const date of dates) {
    const ms = new Date(`${date}T00:00:00Z`).getTime();
    const dae = Math.max(0, Math.floor((ms - daeRefMs) / 86400000));
    const agronomic = input.agronomicByDate?.[date] ?? null;
    const phaseId = phases.length > 0 ? identifyPhase(phases, dae) : null;

    const legacyKc = phases.length > 0 ? interpolateKc(phases, dae) : null;
    const kc = agronomic?.kc ?? legacyKc;
    if (kc == null || !Number.isFinite(kc) || kc < 0 || kc > 2.5) return [];

    const legacyCultureRoot = culture.root_depth
      ?? (phaseId?.phase.root_depth_end ?? phaseId?.phase.root_depth_start ?? 0);
    const rootDepth = agronomic?.rootDepthM ?? computeRootDepth({
      phases,
      dae,
      cultureRootDepth: legacyCultureRoot,
      initialRootDepth: custom ? assignment.initial_root_depth : null,
      maxRootDepth: custom ? assignment.max_root_depth : null,
    });
    if (!Number.isFinite(rootDepth) || rootDepth <= 0) return [];

    const phaseName = agronomic?.stageName ?? phaseId?.phase.name ?? "—";
    const legacyP = culture.depletion_factor ?? phaseId?.phase.depletion_factor ?? null;
    const pFactor = agronomic?.depletionFractionP
      ?? (legacyP == null ? null : resolveDepletionFactor(assignment, phaseId?.phase.depletion_factor, legacyP));
    if (pFactor == null || !Number.isFinite(pFactor) || pFactor <= 0 || pFactor >= 1) return [];
    const adt = soil.layers && soil.layers.length > 0
      ? calculateADTFromLayers(soil.layers, rootDepth)
      : calculateADT(soil.field_capacity, soil.wilting_point, rootDepth, soil.effective_depth);
    if (adt <= 0) return [];
    const afd = calculateAFD(adt, pFactor);
    const { fieldCapacity, wiltingPoint } = profileCcPmp(soil, soil.layers, rootDepth);

    const weather = weatherByDate[date];
    const kl = resolveManejoKl({ parcelOverride: assignment.kl_override, phaseKl: phaseId?.phase.kl, cultureKl: culture.kl });

    let armStart: number;
    if (previousStorage != null) {
      armStart = scaleArmToNewCad(previousStorage, previousCad ?? adt, adt);
    } else {
      const initial = initialArmFromMoisture({
        cadMm: adt,
        thetaCc: fieldCapacity,
        thetaPmp: wiltingPoint,
        bulkDensity: soil.bulk_density,
        moisturePct: assignment.initial_soil_moisture_pct,
        unit: assignment.initial_moisture_unit,
        isFieldCapacity: assignment.initial_moisture_is_cc,
      });
      if (initial == null) return [];
      armStart = initial;
    }

    const startDeficit = Math.max(adt - armStart, 0);
    const startDepletion = startDeficit / adt;
    const ksConfigured = resolveKsFunctionName(assignment.ks_function_override, phaseId?.phase.ks_function, culture.ks_function);
    const ks = roundTo(calculateKs(startDepletion, pFactor, ksFunctionForEtc(ksConfigured), null), 3);
    const etcPotential = roundTo(Math.max(weather.et0 * kc * kl, 0), 2);
    const etc = roundTo(etcPotential * ks, 2);
    const kcAdjusted = roundTo(kc * kl * ks, 3);
    const ky = resolvePhaseKy(phaseId?.phase.ky, culture.ky);
    const yieldRisk = yieldRiskFraction(ky, ks);
    const irrigation = irrigationByDate[date] ?? 0;
    const effectiveIrrigation = efficiency > 0 && efficiency <= 1 ? roundTo(irrigation * efficiency, 2) : 0;

    const step = applyDailySoilBalance({
      armStart,
      cad: adt,
      precipitation: weather.precipitation,
      effectiveIrrigation,
      etc,
    });

    const storage = step.arm;
    const deficit = step.deficit;
    const depletion = roundTo(deficit / adt, 3);
    const safetyMm = safetyMoistureMm(adt, afd);
    const moisturePctCc = moisturePercentOfFieldCapacity(storage, adt, fieldCapacity, wiltingPoint);
    const safetyPctCc = safetyPercentOfFieldCapacity(fieldCapacity, wiltingPoint, pFactor);
    const status = classifyHydricStatus(deficit, afd);
    const mapStatus = classifyWaterStatus({ armMm: storage, cadMm: adt, afdMm: afd, safetyMoistureMm: safetyMm });
    const rec = buildRecommendation(deficit, afd, status, efficiency, pivot.area, pivot.flow_rate, assignment.deficit_irrigation === true);

    rows.push({
      date,
      dae,
      phase: phaseName,
      kc: roundTo(kc, 3),
      kcAdjusted,
      ks,
      kl,
      et0: roundTo(weather.et0, 2),
      etcPotential,
      etc,
      etcFormula: formatEtcFormula(roundTo(weather.et0, 2), roundTo(kc, 3), kl, ks),
      ky,
      yieldRisk,
      precipitation: roundTo(weather.precipitation, 2),
      effectivePrecipitation: step.pe,
      peFormula: step.peFormula,
      irrigation: roundTo(irrigation, 2),
      effectiveIrrigation,
      rootDepth: roundTo(rootDepth, 3),
      adt,
      afd,
      storage,
      surplus: step.surplus,
      deficit,
      depletion,
      fieldCapacity,
      wiltingPoint,
      safetyMoistureMm: safetyMm,
      moisturePctCc,
      safetyPctCc,
      balanceFormula: step.balanceFormula,
      status,
      mapStatus,
      shouldIrrigate: rec.shouldIrrigate,
      recommendedNetDepth: rec.netDepth,
      recommendedGrossDepth: rec.grossDepth,
      recommendedVolume: rec.volume,
      estimatedIrrigationTime: rec.time,
      recommendationReason: rec.reason,
    });
    previousStorage = storage;
    previousCad = adt;
  }
  return rows;
}

export interface PivotHydricState {
  pivotId: string;
  pivotName: string;
  cultureName: string;
  varietyName: string | null;
  seasonName: string | null;
  area: number;
  latitude: number;
  longitude: number;
  parcelId: string | null;
  plantingDate: string | null;
  soilName: string | null;
  radiusMeters: number | null;
  sheetIncomplete: boolean;
  startAngleDeg: number | null;
  endAngleDeg: number | null;
  parcelName: string | null;
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
  parcelId: string | null;
  plantingDate?: string | null;
  soilName?: string | null;
  radiusMeters?: number | null;
  sheetIncomplete?: boolean;
  startAngleDeg?: number | null;
  endAngleDeg?: number | null;
  parcelName?: string | null;
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

export function computeFarmHydricState(states: PivotHydricState[]): FarmHydricSummary {
  const withData = states.filter((s) => s.current && s.current.status !== "cinza");
  const noData = states.filter((s) => !s.current || s.current.status === "cinza");
  const needing = withData.filter((s) => s.current!.shouldIrrigate);
  const attention = withData.filter((s) => !s.current!.shouldIrrigate && s.current!.status === "amarelo");
  const adequate = withData.filter((s) => s.current!.status === "verde");
  const totalIrrigatedArea = withData.reduce((sum, s) => sum + s.area, 0);
  const areaInDeficit = withData.filter((s) => s.current!.status !== "verde").reduce((sum, s) => sum + s.area, 0);
  const avgRecommendedDepth = needing.length ? roundTo(needing.reduce((sum, s) => sum + s.current!.recommendedGrossDepth, 0) / needing.length, 2) : 0;
  const avgDeficit = withData.length ? roundTo(withData.reduce((sum, s) => sum + s.current!.deficit, 0) / withData.length, 2) : 0;
  const totalRecommendedVolume = roundTo(needing.reduce((sum, s) => sum + s.current!.recommendedVolume, 0), 2);
  const ranking = [...withData].sort((a, b) => b.current!.depletion - a.current!.depletion);
  const priorityList = [...needing].sort((a, b) => b.current!.deficit - a.current!.deficit);
  return {
    totalPivots: new Set(states.map((s) => s.pivotId)).size,
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
