import { roundTo, clamp, sum } from "@/utils/math";
import { CV_TO_KW } from "@/constants/agronomic";
import type { EnergyCalculationInput } from "@/types/domain/energy";

// ── Tariff Types ───────────────────────────────────────────────────────

export type TariffType = "verde" | "azul" | "convencional";
export type TariffPeriod = "ponta" | "fora_ponta" | "reservado";
export type ApportionmentMethod = "volume" | "area" | "hours" | "equal" | "custom";

export interface TariffConfig {
  tariffType: TariffType;
  ratePeak: number;
  rateOffPeak: number;
  rateReserved: number;
  demandRate: number;
  peakStart: number;
  peakEnd: number;
  contractedDemandKw: number;
}

// ── Consumption Types ──────────────────────────────────────────────────

export interface ConsumptionInput {
  pivotId: string;
  pivotName: string;
  pumpHouseId: string;
  pumpHouseName: string;
  cultureName: string;
  cultureId: string;
  seasonId: string;
  moduleName: string;
  area: number;
  pumpPowerCv: number;
  pumpPowerKw: number;
  motorEfficiency: number;
  operatingHours: number;
  volumeM3: number;
  depthMm: number;
  startTime: string;
  endTime: string;
  date: string;
}

export interface ConsumptionResult {
  pivotId: string;
  pivotName: string;
  pumpHouseId: string;
  pumpHouseName: string;
  cultureName: string;
  cultureId: string;
  seasonId: string;
  moduleName: string;
  area: number;
  date: string;
  operatingHours: number;
  powerKw: number;
  totalKwh: number;
  peakKwh: number;
  offPeakKwh: number;
  costPeak: number;
  costOffPeak: number;
  costTotal: number;
  demandKw: number;
  volumeM3: number;
  depthMm: number;
  kwhPerM3: number;
  kwhPerMm: number;
  kwhPerHa: number;
  costPerM3: number;
  costPerMm: number;
  costPerHa: number;
}

// ── Demand Types ───────────────────────────────────────────────────────

export interface DemandAnalysis {
  contractedDemandKw: number;
  measuredDemandKw: number;
  peakDemandKw: number;
  demandMarginKw: number;
  demandMarginPct: number;
  exceedsContracted: boolean;
  penaltyRisk: number;
  projectedDemandKw: number;
  demandTrend: "subindo" | "estavel" | "descendo";
  riskLevel: "critico" | "alto" | "moderado" | "baixo" | "confortavel";
}

// ── Aggregated Types ───────────────────────────────────────────────────

export interface AggregatedConsumption {
  groupKey: string;
  groupLabel: string;
  totalKwh: number;
  totalCost: number;
  totalVolumeM3: number;
  totalAreaHa: number;
  totalHours: number;
  kwhPerM3: number;
  kwhPerMm: number;
  kwhPerHa: number;
  costPerM3: number;
  costPerMm: number;
  costPerHa: number;
  peakKwh: number;
  offPeakKwh: number;
  peakCost: number;
  offPeakCost: number;
  peakPct: number;
  itemCount: number;
}

// ── Apportionment Types ────────────────────────────────────────────────

export interface ApportionmentInput {
  pivotId: string;
  pivotName: string;
  cultureId: string;
  cultureName: string;
  seasonId: string;
  moduleName: string;
  pumpHouseId: string;
  costCenter: string;
  area: number;
  volumeM3: number;
  hours: number;
}

export interface ApportionmentResult {
  pivotId: string;
  pivotName: string;
  cultureId: string;
  cultureName: string;
  seasonId: string;
  moduleName: string;
  pumpHouseId: string;
  costCenter: string;
  area: number;
  volumeM3: number;
  totalKwh: number;
  totalCost: number;
  apportionedKwh: number;
  apportionedCost: number;
  sharePct: number;
  kwhPerHa: number;
  costPerHa: number;
  kwhPerM3: number;
  costPerM3: number;
}

// ── Simulation Types ───────────────────────────────────────────────────

export interface EnergySimulation {
  name: string;
  description: string;
  totalKwh: number;
  totalCost: number;
  peakKwh: number;
  offPeakKwh: number;
  peakCost: number;
  offPeakCost: number;
  savingsKwh: number;
  savingsCost: number;
  savingsPct: number;
  demandKw: number;
  exceedsContracted: boolean;
}

// ── Suggestion Types ───────────────────────────────────────────────────

export interface EnergySuggestion {
  type: "horario" | "potencia" | "operacao" | "economia" | "demanda";
  title: string;
  description: string;
  estimatedSavings: number;
  estimatedSavingsPct: number;
  impact: "alto" | "medio" | "baixo";
  actionable: boolean;
}

// ── Core Calculation: Consumption ──────────────────────────────────────

export function calculateConsumption(
  input: ConsumptionInput,
  tariff: TariffConfig
): ConsumptionResult {
  const eff = input.motorEfficiency > 0 ? input.motorEfficiency : 0.85;
  const powerKw = input.pumpPowerKw > 0
    ? input.pumpPowerKw
    : (input.pumpPowerCv * CV_TO_KW) / eff;

  const totalKwh = roundTo(powerKw * input.operatingHours, 2);

  const { peakKwh, offPeakKwh } = splitPeakOffPeak(
    totalKwh, input.startTime, input.endTime, tariff
  );

  const costPeak = roundTo(peakKwh * tariff.ratePeak, 2);
  const costOffPeak = roundTo(offPeakKwh * tariff.rateOffPeak, 2);
  const costTotal = roundTo(costPeak + costOffPeak, 2);
  const demandKw = roundTo(powerKw, 1);

  const kwhPerM3 = input.volumeM3 > 0 ? roundTo(totalKwh / input.volumeM3, 4) : 0;
  const kwhPerMm = input.depthMm > 0 ? roundTo(totalKwh / input.depthMm, 2) : 0;
  const kwhPerHa = input.area > 0 ? roundTo(totalKwh / input.area, 2) : 0;
  const costPerM3 = input.volumeM3 > 0 ? roundTo(costTotal / input.volumeM3, 4) : 0;
  const costPerMm = input.depthMm > 0 ? roundTo(costTotal / input.depthMm, 2) : 0;
  const costPerHa = input.area > 0 ? roundTo(costTotal / input.area, 2) : 0;

  return {
    pivotId: input.pivotId,
    pivotName: input.pivotName,
    pumpHouseId: input.pumpHouseId,
    pumpHouseName: input.pumpHouseName,
    cultureName: input.cultureName,
    cultureId: input.cultureId,
    seasonId: input.seasonId,
    moduleName: input.moduleName,
    area: input.area,
    date: input.date,
    operatingHours: input.operatingHours,
    powerKw,
    totalKwh,
    peakKwh,
    offPeakKwh,
    costPeak,
    costOffPeak,
    costTotal,
    demandKw,
    volumeM3: input.volumeM3,
    depthMm: input.depthMm,
    kwhPerM3,
    kwhPerMm,
    kwhPerHa,
    costPerM3,
    costPerMm,
    costPerHa,
  };
}

// ── Peak/Off-peak Split ────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function splitPeakOffPeak(
  totalKwh: number,
  startTime: string,
  endTime: string,
  tariff: TariffConfig
): { peakKwh: number; offPeakKwh: number } {
  if (!startTime || !endTime || startTime === "—") {
    return { peakKwh: 0, offPeakKwh: totalKwh };
  }

  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const peakStartMins = tariff.peakStart * 60;
  const peakEndMins = tariff.peakEnd * 60;

  const totalMins = endMins > startMins ? endMins - startMins : (1440 - startMins) + endMins;
  if (totalMins === 0) return { peakKwh: 0, offPeakKwh: totalKwh };

  let peakMins = 0;
  for (let m = startMins; m < startMins + totalMins; m++) {
    const minute = m % 1440;
    if (minute >= peakStartMins && minute < peakEndMins) peakMins++;
  }

  const peakRatio = peakMins / totalMins;
  return {
    peakKwh: roundTo(totalKwh * peakRatio, 2),
    offPeakKwh: roundTo(totalKwh * (1 - peakRatio), 2),
  };
}

// ── Batch Consumption ──────────────────────────────────────────────────

export function calculateBatchConsumption(
  inputs: ConsumptionInput[],
  tariff: TariffConfig
): ConsumptionResult[] {
  return inputs.map((input) => calculateConsumption(input, tariff));
}

// ── Aggregation Engine ─────────────────────────────────────────────────

export function aggregateByPivot(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(results, (r) => r.pivotId, (r) => r.pivotName);
}

export function aggregateByPumpHouse(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(results, (r) => r.pumpHouseId, (r) => r.pumpHouseName);
}

export function aggregateByCulture(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(results, (r) => r.cultureId, (r) => r.cultureName);
}

export function aggregateByModule(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(results, (r) => r.moduleName, (r) => r.moduleName);
}

export function aggregateBySeason(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(results, (r) => r.seasonId, (r) => `Safra ${r.seasonId.slice(0, 8)}`);
}

export function aggregateByDate(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(results, (r) => r.date, (r) => r.date);
}

export function aggregateByWeek(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(
    results,
    (r) => getWeekKey(r.date),
    (r) => `Semana ${getWeekKey(r.date)}`
  );
}

export function aggregateByMonth(results: ConsumptionResult[]): AggregatedConsumption[] {
  return aggregateBy(
    results,
    (r) => r.date.slice(0, 7),
    (r) => formatMonth(r.date.slice(0, 7))
  );
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function formatMonth(ym: string): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = ym.split("-");
  return `${months[parseInt(m, 10) - 1]}/${y}`;
}

function aggregateBy(
  results: ConsumptionResult[],
  keyFn: (r: ConsumptionResult) => string,
  labelFn: (r: ConsumptionResult) => string
): AggregatedConsumption[] {
  const groups: Record<string, ConsumptionResult[]> = {};
  const labels: Record<string, string> = {};

  for (const r of results) {
    const key = keyFn(r);
    if (!groups[key]) {
      groups[key] = [];
      labels[key] = labelFn(r);
    }
    groups[key].push(r);
  }

  return Object.entries(groups).map(([key, items]) => {
    const totalKwh = sum(items.map((i) => i.totalKwh));
    const totalCost = sum(items.map((i) => i.costTotal));
    const totalVolumeM3 = sum(items.map((i) => i.volumeM3));
    const totalDepthMm = sum(items.map((i) => i.depthMm));
    const totalAreaHa = sum(items.map((i) => i.area));
    const uniqueAreas = new Set(items.map((i) => i.pivotId));
    const avgAreaHa = totalAreaHa / Math.max(1, uniqueAreas.size);
    const totalHours = sum(items.map((i) => i.operatingHours));
    const peakKwh = sum(items.map((i) => i.peakKwh));
    const offPeakKwh = sum(items.map((i) => i.offPeakKwh));
    const peakCost = sum(items.map((i) => i.costPeak));
    const offPeakCost = sum(items.map((i) => i.costOffPeak));

    return {
      groupKey: key,
      groupLabel: labels[key],
      totalKwh: roundTo(totalKwh, 1),
      totalCost: roundTo(totalCost, 2),
      totalVolumeM3: roundTo(totalVolumeM3, 0),
      totalAreaHa: roundTo(avgAreaHa, 1),
      totalHours: roundTo(totalHours, 1),
      kwhPerM3: totalVolumeM3 > 0 ? roundTo(totalKwh / totalVolumeM3, 4) : 0,
      kwhPerMm: totalDepthMm > 0 ? roundTo(totalKwh / totalDepthMm, 2) : 0,
      kwhPerHa: avgAreaHa > 0 ? roundTo(totalKwh / avgAreaHa, 2) : 0,
      costPerM3: totalVolumeM3 > 0 ? roundTo(totalCost / totalVolumeM3, 4) : 0,
      costPerMm: totalDepthMm > 0 ? roundTo(totalCost / totalDepthMm, 2) : 0,
      costPerHa: avgAreaHa > 0 ? roundTo(totalCost / avgAreaHa, 2) : 0,
      peakKwh: roundTo(peakKwh, 1),
      offPeakKwh: roundTo(offPeakKwh, 1),
      peakCost: roundTo(peakCost, 2),
      offPeakCost: roundTo(offPeakCost, 2),
      peakPct: totalKwh > 0 ? roundTo((peakKwh / totalKwh) * 100, 1) : 0,
      itemCount: items.length,
    };
  });
}

// ── Farm Totals ────────────────────────────────────────────────────────

export interface FarmEnergyTotals {
  totalKwh: number;
  totalCost: number;
  totalVolumeM3: number;
  totalHours: number;
  peakKwh: number;
  offPeakKwh: number;
  peakCost: number;
  offPeakCost: number;
  demandCost: number;
  kwhPerM3: number;
  kwhPerMm: number;
  kwhPerHa: number;
  costPerM3: number;
  costPerMm: number;
  costPerHa: number;
  peakPct: number;
  avgDailyCost: number;
  projectedMonthlyCost: number;
  pivotCount: number;
}

export function calculateFarmTotals(
  results: ConsumptionResult[],
  contractedDemandKw: number,
  demandRate: number,
  daysInPeriod: number
): FarmEnergyTotals {
  const totalKwh = sum(results.map((r) => r.totalKwh));
  const totalCost = sum(results.map((r) => r.costTotal));
  const totalVolumeM3 = sum(results.map((r) => r.volumeM3));
  const totalDepthMm = sum(results.map((r) => r.depthMm));
  const totalHours = sum(results.map((r) => r.operatingHours));
  const uniquePivots = new Set(results.map((r) => r.pivotId));
  const totalArea = sum(
    Array.from(uniquePivots).map((pid) => {
      const pivot = results.find((r) => r.pivotId === pid);
      return pivot?.area ?? 0;
    })
  );
  const peakKwh = sum(results.map((r) => r.peakKwh));
  const offPeakKwh = sum(results.map((r) => r.offPeakKwh));
  const peakCost = sum(results.map((r) => r.costPeak));
  const offPeakCost = sum(results.map((r) => r.costOffPeak));
  const demandCost = roundTo(contractedDemandKw * demandRate, 2);

  const avgDailyCost = daysInPeriod > 0 ? roundTo((totalCost + demandCost) / daysInPeriod, 2) : 0;
  const projectedMonthlyCost = roundTo(avgDailyCost * 30, 2);

  return {
    totalKwh: roundTo(totalKwh, 1),
    totalCost: roundTo(totalCost, 2),
    totalVolumeM3: roundTo(totalVolumeM3, 0),
    totalHours: roundTo(totalHours, 1),
    peakKwh: roundTo(peakKwh, 1),
    offPeakKwh: roundTo(offPeakKwh, 1),
    peakCost: roundTo(peakCost, 2),
    offPeakCost: roundTo(offPeakCost, 2),
    demandCost,
    kwhPerM3: totalVolumeM3 > 0 ? roundTo(totalKwh / totalVolumeM3, 4) : 0,
    kwhPerMm: totalDepthMm > 0 ? roundTo(totalKwh / totalDepthMm, 2) : 0,
    kwhPerHa: totalArea > 0 ? roundTo(totalKwh / totalArea, 2) : 0,
    costPerM3: totalVolumeM3 > 0 ? roundTo(totalCost / totalVolumeM3, 4) : 0,
    costPerMm: totalDepthMm > 0 ? roundTo(totalCost / totalDepthMm, 2) : 0,
    costPerHa: totalArea > 0 ? roundTo(totalCost / totalArea, 2) : 0,
    peakPct: totalKwh > 0 ? roundTo((peakKwh / totalKwh) * 100, 1) : 0,
    avgDailyCost,
    projectedMonthlyCost,
    pivotCount: uniquePivots.size,
  };
}

// ── Demand Analysis ────────────────────────────────────────────────────

export function analyzeDemand(
  results: ConsumptionResult[],
  tariff: TariffConfig,
  historicalPeaks: number[]
): DemandAnalysis {
  const maxDemand = results.length > 0
    ? Math.max(...results.map((r) => r.demandKw))
    : 0;

  const sumDemand = sum(results.map((r) => r.demandKw));
  const measuredDemand = results.length > 0 ? sumDemand / results.length : 0;

  const allPeaks = [...historicalPeaks, maxDemand].filter((p) => p > 0);
  const trend = determineTrend(allPeaks);

  const projected = allPeaks.length >= 2
    ? roundTo(allPeaks[allPeaks.length - 1] + (allPeaks[allPeaks.length - 1] - allPeaks[allPeaks.length - 2]) * 0.5, 1)
    : maxDemand;

  const margin = tariff.contractedDemandKw - maxDemand;
  const marginPct = tariff.contractedDemandKw > 0
    ? (margin / tariff.contractedDemandKw) * 100
    : 100;

  const exceedsContracted = maxDemand > tariff.contractedDemandKw && tariff.contractedDemandKw > 0;
  const excessKw = exceedsContracted ? maxDemand - tariff.contractedDemandKw : 0;
  const penaltyRisk = exceedsContracted
    ? roundTo(excessKw * tariff.demandRate * 3, 2)
    : 0;

  let riskLevel: DemandAnalysis["riskLevel"];
  if (exceedsContracted) riskLevel = "critico";
  else if (marginPct < 5) riskLevel = "alto";
  else if (marginPct < 15) riskLevel = "moderado";
  else if (marginPct < 30) riskLevel = "baixo";
  else riskLevel = "confortavel";

  return {
    contractedDemandKw: tariff.contractedDemandKw,
    measuredDemandKw: roundTo(measuredDemand, 1),
    peakDemandKw: roundTo(maxDemand, 1),
    demandMarginKw: roundTo(margin, 1),
    demandMarginPct: roundTo(marginPct, 1),
    exceedsContracted,
    penaltyRisk,
    projectedDemandKw: roundTo(Math.max(0, projected), 1),
    demandTrend: trend,
    riskLevel,
  };
}

function determineTrend(values: number[]): "subindo" | "estavel" | "descendo" {
  if (values.length < 2) return "estavel";
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const change = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  if (change > 5) return "subindo";
  if (change < -5) return "descendo";
  return "estavel";
}

// ── Apportionment Engine ───────────────────────────────────────────────

export function calculateApportionment(
  totalKwh: number,
  totalCost: number,
  items: ApportionmentInput[],
  method: ApportionmentMethod
): ApportionmentResult[] {
  if (items.length === 0) return [];

  const shares = computeShares(items, method);
  const totalShares = sum(shares);

  return items.map((item, i) => {
    const sharePct = totalShares > 0 ? (shares[i] / totalShares) * 100 : 0;
    const apportionedKwh = totalShares > 0 ? (shares[i] / totalShares) * totalKwh : 0;
    const apportionedCost = totalShares > 0 ? (shares[i] / totalShares) * totalCost : 0;

    return {
      pivotId: item.pivotId,
      pivotName: item.pivotName,
      cultureId: item.cultureId,
      cultureName: item.cultureName,
      seasonId: item.seasonId,
      moduleName: item.moduleName,
      pumpHouseId: item.pumpHouseId,
      costCenter: item.costCenter,
      area: item.area,
      volumeM3: item.volumeM3,
      totalKwh: roundTo(totalKwh, 1),
      totalCost: roundTo(totalCost, 2),
      apportionedKwh: roundTo(apportionedKwh, 1),
      apportionedCost: roundTo(apportionedCost, 2),
      sharePct: roundTo(sharePct, 1),
      kwhPerHa: item.area > 0 ? roundTo(apportionedKwh / item.area, 2) : 0,
      costPerHa: item.area > 0 ? roundTo(apportionedCost / item.area, 2) : 0,
      kwhPerM3: item.volumeM3 > 0 ? roundTo(apportionedKwh / item.volumeM3, 4) : 0,
      costPerM3: item.volumeM3 > 0 ? roundTo(apportionedCost / item.volumeM3, 4) : 0,
    };
  });
}

function computeShares(items: ApportionmentInput[], method: ApportionmentMethod): number[] {
  switch (method) {
    case "volume":
      return items.map((i) => i.volumeM3);
    case "area":
      return items.map((i) => i.area);
    case "hours":
      return items.map((i) => i.hours);
    case "equal":
      return items.map(() => 1);
    case "custom":
      return items.map((i) => i.volumeM3);
  }
}

export function aggregateApportionmentByCulture(results: ApportionmentResult[]): ApportionmentResult[] {
  const groups: Record<string, ApportionmentResult[]> = {};
  for (const r of results) {
    if (!groups[r.cultureId]) groups[r.cultureId] = [];
    groups[r.cultureId].push(r);
  }
  return Object.values(groups).map((items) => ({
    ...items[0],
    area: sum(items.map((i) => i.area)),
    volumeM3: sum(items.map((i) => i.volumeM3)),
    apportionedKwh: roundTo(sum(items.map((i) => i.apportionedKwh)), 1),
    apportionedCost: roundTo(sum(items.map((i) => i.apportionedCost)), 2),
    sharePct: roundTo(sum(items.map((i) => i.sharePct)), 1),
    kwhPerHa: (() => {
      const totalArea = sum(items.map((i) => i.area));
      const totalKwh = sum(items.map((i) => i.apportionedKwh));
      return totalArea > 0 ? roundTo(totalKwh / totalArea, 2) : 0;
    })(),
    costPerHa: (() => {
      const totalArea = sum(items.map((i) => i.area));
      const cost = sum(items.map((i) => i.apportionedCost));
      return totalArea > 0 ? roundTo(cost / totalArea, 2) : 0;
    })(),
    kwhPerM3: (() => {
      const totalVol = sum(items.map((i) => i.volumeM3));
      const kwh = sum(items.map((i) => i.apportionedKwh));
      return totalVol > 0 ? roundTo(kwh / totalVol, 4) : 0;
    })(),
    costPerM3: (() => {
      const totalVol = sum(items.map((i) => i.volumeM3));
      const cost = sum(items.map((i) => i.apportionedCost));
      return totalVol > 0 ? roundTo(cost / totalVol, 4) : 0;
    })(),
  }));
}

export function aggregateApportionmentByModule(results: ApportionmentResult[]): ApportionmentResult[] {
  const groups: Record<string, ApportionmentResult[]> = {};
  for (const r of results) {
    if (!groups[r.moduleName]) groups[r.moduleName] = [];
    groups[r.moduleName].push(r);
  }
  return Object.values(groups).map((items) => ({
    ...items[0],
    area: sum(items.map((i) => i.area)),
    volumeM3: sum(items.map((i) => i.volumeM3)),
    apportionedKwh: roundTo(sum(items.map((i) => i.apportionedKwh)), 1),
    apportionedCost: roundTo(sum(items.map((i) => i.apportionedCost)), 2),
    sharePct: roundTo(sum(items.map((i) => i.sharePct)), 1),
    kwhPerHa: (() => {
      const a = sum(items.map((i) => i.area));
      return a > 0 ? roundTo(sum(items.map((i) => i.apportionedKwh)) / a, 2) : 0;
    })(),
    costPerHa: (() => {
      const a = sum(items.map((i) => i.area));
      return a > 0 ? roundTo(sum(items.map((i) => i.apportionedCost)) / a, 2) : 0;
    })(),
    kwhPerM3: (() => {
      const v = sum(items.map((i) => i.volumeM3));
      return v > 0 ? roundTo(sum(items.map((i) => i.apportionedKwh)) / v, 4) : 0;
    })(),
    costPerM3: (() => {
      const v = sum(items.map((i) => i.volumeM3));
      return v > 0 ? roundTo(sum(items.map((i) => i.apportionedCost)) / v, 4) : 0;
    })(),
  }));
}

// ── Simulation Engine ──────────────────────────────────────────────────

export function simulateEnergyScenarios(
  baseResults: ConsumptionResult[],
  tariff: TariffConfig
): EnergySimulation[] {
  const baseTotalKwh = sum(baseResults.map((r) => r.totalKwh));
  const baseTotalCost = sum(baseResults.map((r) => r.costTotal));
  const basePeakKwh = sum(baseResults.map((r) => r.peakKwh));
  const baseOffPeakKwh = sum(baseResults.map((r) => r.offPeakKwh));
  const basePeakCost = sum(baseResults.map((r) => r.costPeak));
  const baseOffPeakCost = sum(baseResults.map((r) => r.costOffPeak));
  const baseDemand = baseResults.length > 0 ? Math.max(...baseResults.map((r) => r.demandKw)) : 0;

  const scenarios: EnergySimulation[] = [];

  // Scenario 1: Irrigate now (base)
  scenarios.push({
    name: "Operação atual",
    description: "Manter operação como está programada",
    totalKwh: roundTo(baseTotalKwh, 1),
    totalCost: roundTo(baseTotalCost, 2),
    peakKwh: roundTo(basePeakKwh, 1),
    offPeakKwh: roundTo(baseOffPeakKwh, 1),
    peakCost: roundTo(basePeakCost, 2),
    offPeakCost: roundTo(baseOffPeakCost, 2),
    savingsKwh: 0,
    savingsCost: 0,
    savingsPct: 0,
    demandKw: roundTo(baseDemand, 1),
    exceedsContracted: baseDemand > tariff.contractedDemandKw && tariff.contractedDemandKw > 0,
  });

  // Scenario 2: Move all to off-peak
  const allOffPeakCost = roundTo(baseTotalKwh * tariff.rateOffPeak, 2);
  scenarios.push({
    name: "Tudo fora de ponta",
    description: "Deslocar todas irrigações para horário fora de ponta",
    totalKwh: roundTo(baseTotalKwh, 1),
    totalCost: allOffPeakCost,
    peakKwh: 0,
    offPeakKwh: roundTo(baseTotalKwh, 1),
    peakCost: 0,
    offPeakCost: allOffPeakCost,
    savingsKwh: 0,
    savingsCost: roundTo(baseTotalCost - allOffPeakCost, 2),
    savingsPct: baseTotalCost > 0 ? roundTo(((baseTotalCost - allOffPeakCost) / baseTotalCost) * 100, 1) : 0,
    demandKw: roundTo(baseDemand, 1),
    exceedsContracted: false,
  });

  // Scenario 3: Reduce power (70%)
  const reducedKwh = roundTo(baseTotalKwh * 0.7, 1);
  const reducedCost = roundTo(baseTotalCost * 0.7, 2);
  scenarios.push({
    name: "Reduzir potência (70%)",
    description: "Operar em potência reduzida, aumentando tempo de irrigação",
    totalKwh: reducedKwh,
    totalCost: reducedCost,
    peakKwh: roundTo(basePeakKwh * 0.7, 1),
    offPeakKwh: roundTo(baseOffPeakKwh * 0.7, 1),
    peakCost: roundTo(basePeakCost * 0.7, 2),
    offPeakCost: roundTo(baseOffPeakCost * 0.7, 2),
    savingsKwh: roundTo(baseTotalKwh - reducedKwh, 1),
    savingsCost: roundTo(baseTotalCost - reducedCost, 2),
    savingsPct: baseTotalCost > 0 ? roundTo(30, 1) : 0,
    demandKw: roundTo(baseDemand * 0.7, 1),
    exceedsContracted: baseDemand * 0.7 > tariff.contractedDemandKw && tariff.contractedDemandKw > 0,
  });

  // Scenario 4: Reduce depth (80%)
  const depthReducedKwh = roundTo(baseTotalKwh * 0.8, 1);
  const depthReducedCost = roundTo(baseTotalCost * 0.8, 2);
  scenarios.push({
    name: "Reduzir lâmina (80%)",
    description: "Aplicar 80% da lâmina recomendada",
    totalKwh: depthReducedKwh,
    totalCost: depthReducedCost,
    peakKwh: roundTo(basePeakKwh * 0.8, 1),
    offPeakKwh: roundTo(baseOffPeakKwh * 0.8, 1),
    peakCost: roundTo(basePeakCost * 0.8, 2),
    offPeakCost: roundTo(baseOffPeakCost * 0.8, 2),
    savingsKwh: roundTo(baseTotalKwh - depthReducedKwh, 1),
    savingsCost: roundTo(baseTotalCost - depthReducedCost, 2),
    savingsPct: baseTotalCost > 0 ? roundTo(20, 1) : 0,
    demandKw: roundTo(baseDemand, 1),
    exceedsContracted: baseDemand > tariff.contractedDemandKw && tariff.contractedDemandKw > 0,
  });

  // Scenario 5: More pump houses (distribute load)
  const distributedDemand = roundTo(baseDemand * 0.6, 1);
  scenarios.push({
    name: "Distribuir carga",
    description: "Operar mais casas de bomba simultaneamente, reduzindo demanda individual",
    totalKwh: roundTo(baseTotalKwh, 1),
    totalCost: roundTo(baseTotalCost, 2),
    peakKwh: roundTo(basePeakKwh, 1),
    offPeakKwh: roundTo(baseOffPeakKwh, 1),
    peakCost: roundTo(basePeakCost, 2),
    offPeakCost: roundTo(baseOffPeakCost, 2),
    savingsKwh: 0,
    savingsCost: 0,
    savingsPct: 0,
    demandKw: distributedDemand,
    exceedsContracted: distributedDemand > tariff.contractedDemandKw && tariff.contractedDemandKw > 0,
  });

  // Scenario 6: Fewer pump houses (concentrate)
  const concentratedDemand = roundTo(baseDemand * 1.4, 1);
  const fewerCost = roundTo(baseTotalCost * 0.95, 2);
  scenarios.push({
    name: "Concentrar operação",
    description: "Menos casas de bomba, maior utilização individual",
    totalKwh: roundTo(baseTotalKwh, 1),
    totalCost: fewerCost,
    peakKwh: roundTo(basePeakKwh, 1),
    offPeakKwh: roundTo(baseOffPeakKwh, 1),
    peakCost: roundTo(basePeakCost * 0.95, 2),
    offPeakCost: roundTo(baseOffPeakCost * 0.95, 2),
    savingsKwh: 0,
    savingsCost: roundTo(baseTotalCost - fewerCost, 2),
    savingsPct: baseTotalCost > 0 ? roundTo(((baseTotalCost - fewerCost) / baseTotalCost) * 100, 1) : 0,
    demandKw: concentratedDemand,
    exceedsContracted: concentratedDemand > tariff.contractedDemandKw && tariff.contractedDemandKw > 0,
  });

  return scenarios;
}

// ── Intelligence: Suggestions ──────────────────────────────────────────

export function generateEnergySuggestions(
  results: ConsumptionResult[],
  tariff: TariffConfig,
  demand: DemandAnalysis
): EnergySuggestion[] {
  const suggestions: EnergySuggestion[] = [];
  const baseCost = sum(results.map((r) => r.costTotal));
  const peakKwh = sum(results.map((r) => r.peakKwh));
  const totalKwh = sum(results.map((r) => r.totalKwh));
  const peakCost = sum(results.map((r) => r.costPeak));

  // 1. Peak hour avoidance
  const peakPct = totalKwh > 0 ? (peakKwh / totalKwh) * 100 : 0;
  if (peakPct > 10) {
    const potentialSavings = roundTo(peakKwh * (tariff.ratePeak - tariff.rateOffPeak), 2);
    suggestions.push({
      type: "horario",
      title: "Deslocar irrigação para fora de ponta",
      description: `${peakPct.toFixed(0)}% do consumo está em horário de ponta. Deslocando para fora de ponta, economia de R$ ${potentialSavings.toFixed(2)}/período.`,
      estimatedSavings: potentialSavings,
      estimatedSavingsPct: baseCost > 0 ? roundTo((potentialSavings / baseCost) * 100, 1) : 0,
      impact: potentialSavings > baseCost * 0.15 ? "alto" : potentialSavings > baseCost * 0.05 ? "medio" : "baixo",
      actionable: true,
    });
  }

  // 2. Demand risk
  if (demand.riskLevel === "critico" || demand.riskLevel === "alto") {
    suggestions.push({
      type: "demanda",
      title: "Risco de ultrapassagem de demanda",
      description: `Demanda de pico: ${demand.peakDemandKw.toFixed(0)} kW vs contratada: ${demand.contractedDemandKw.toFixed(0)} kW. Margem: ${demand.demandMarginPct.toFixed(0)}%. ${demand.exceedsContracted ? `Multa estimada: R$ ${demand.penaltyRisk.toFixed(2)}` : "Recomendado escalonar operações."}`,
      estimatedSavings: demand.penaltyRisk,
      estimatedSavingsPct: baseCost > 0 ? roundTo((demand.penaltyRisk / baseCost) * 100, 1) : 0,
      impact: "alto",
      actionable: true,
    });
  }

  // 3. Pump house optimization
  const byPump = aggregateByPumpHouse(results);
  const underutilized = byPump.filter((p) => p.totalHours < 4 && p.totalKwh > 0);
  if (underutilized.length > 1) {
    suggestions.push({
      type: "operacao",
      title: "Consolidar casas de bomba",
      description: `${underutilized.length} casas de bomba com baixa utilização (<4h). Consolidar operações pode reduzir custo fixo de demanda.`,
      estimatedSavings: roundTo(tariff.demandRate * underutilized.length * 10, 2),
      estimatedSavingsPct: 3,
      impact: "medio",
      actionable: true,
    });
  }

  // 4. Best irrigation time
  const bestHourStart = tariff.peakEnd;
  const bestHourEnd = tariff.peakStart;
  suggestions.push({
    type: "horario",
    title: "Melhor horário para irrigar",
    description: `Horário ideal: ${bestHourStart}:00 às ${bestHourEnd}:00 (fora de ponta). Tarifa: R$ ${tariff.rateOffPeak.toFixed(4)}/kWh vs R$ ${tariff.ratePeak.toFixed(4)}/kWh na ponta.`,
    estimatedSavings: peakCost > 0 ? roundTo(peakCost * 0.5, 2) : 0,
    estimatedSavingsPct: peakCost > 0 && baseCost > 0 ? roundTo((peakCost * 0.5 / baseCost) * 100, 1) : 0,
    impact: peakCost > baseCost * 0.1 ? "alto" : "baixo",
    actionable: true,
  });

  // 5. Cost projection
  if (baseCost > 0) {
    const avgDailyCost = results.length > 0 ? baseCost / new Set(results.map((r) => r.date)).size : 0;
    suggestions.push({
      type: "economia",
      title: "Projeção de custo mensal",
      description: `Custo médio diário: R$ ${avgDailyCost.toFixed(2)}. Projeção mensal: R$ ${(avgDailyCost * 30).toFixed(2)}. Inclua demanda contratada: R$ ${(tariff.contractedDemandKw * tariff.demandRate).toFixed(2)}/mês.`,
      estimatedSavings: 0,
      estimatedSavingsPct: 0,
      impact: "baixo",
      actionable: false,
    });
  }

  return suggestions;
}

// ── Hourly Cost Profile ────────────────────────────────────────────────

export interface HourlyCostProfile {
  hour: number;
  label: string;
  rate: number;
  isPeak: boolean;
  period: TariffPeriod;
}

export function buildHourlyCostProfile(tariff: TariffConfig): HourlyCostProfile[] {
  const profile: HourlyCostProfile[] = [];
  for (let h = 0; h < 24; h++) {
    const isPeak = h >= tariff.peakStart && h < tariff.peakEnd;
    profile.push({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      rate: isPeak ? tariff.ratePeak : tariff.rateOffPeak,
      isPeak,
      period: isPeak ? "ponta" : "fora_ponta",
    });
  }
  return profile;
}

// ── Config ─────────────────────────────────────────────────────────────

export const TARIFF_TYPE_CONFIG: Record<TariffType, { label: string; description: string }> = {
  verde:        { label: "Verde",        description: "Demanda única, consumo ponta/fora" },
  azul:         { label: "Azul",         description: "Demanda ponta/fora, consumo ponta/fora" },
  convencional: { label: "Convencional", description: "Tarifa única sem diferenciação" },
};

export const DEMAND_RISK_CONFIG: Record<DemandAnalysis["riskLevel"], { label: string; bgClass: string }> = {
  critico:     { label: "Crítico",     bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  alto:        { label: "Alto",        bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  moderado:    { label: "Moderado",    bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  baixo:       { label: "Baixo",       bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  confortavel: { label: "Confortável", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

export const APPORTIONMENT_METHOD_CONFIG: Record<ApportionmentMethod, { label: string; description: string }> = {
  volume: { label: "Por Volume",    description: "Proporcionalmente ao volume consumido (m³)" },
  area:   { label: "Por Área",      description: "Proporcionalmente à área irrigada (ha)" },
  hours:  { label: "Por Horas",     description: "Proporcionalmente às horas de operação" },
  equal:  { label: "Igualitário",   description: "Dividido igualmente entre todos" },
  custom: { label: "Personalizado", description: "Percentuais definidos manualmente" },
};

// ── Legacy API (used by shared/data/mock-pivots.ts) ────────────────────

export function calculateEnergy(input: EnergyCalculationInput): number {
  const eff = input.motorEfficiency > 0 ? input.motorEfficiency : 0.85;
  const powerKW = (input.pumpPower * CV_TO_KW) / eff;
  return roundTo(powerKW * input.irrigationTime, 0);
}

export function calculateEnergyCost(
  consumptionKWh: number,
  tariffRate: number
): number {
  return roundTo(consumptionKWh * tariffRate, 2);
}
