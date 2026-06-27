import { roundTo, sum, average } from "@/utils/math";
import type { DailyBalanceRow, BalanceSummary } from "@/modules/water-balance/services";
import type { Recommendation } from "@/modules/recommendation/services";
import type { ScheduleSlot, DailySchedule } from "@/modules/scheduling/services";
import type {
  ConsumptionResult,
  FarmEnergyTotals,
  AggregatedConsumption,
  DemandAnalysis,
} from "@/modules/energy/services";
import type { WeatherReadingRow } from "@/modules/weather/services";

// ── Report Types ──────────────────────────────────────────────────────

export type ReportType =
  | "diario"
  | "semanal"
  | "mensal"
  | "por_pivo"
  | "por_cultura"
  | "energetico"
  | "financeiro"
  | "executivo";

export type ExportFormat = "pdf" | "xlsx" | "csv";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "export"
  | "generate"
  | "approve"
  | "reject"
  | "login"
  | "logout";

export type HistoryDimension =
  | "irrigacao"
  | "recomendacao"
  | "agua"
  | "energia"
  | "custo"
  | "clima";

export type ComparativeDimension =
  | "periodo"
  | "safra"
  | "cultura"
  | "pivo"
  | "casa_bomba"
  | "modulo"
  | "fazenda";

// ── Report Config ─────────────────────────────────────────────────────

export const REPORT_TYPE_CONFIG: Record<
  ReportType,
  { label: string; description: string; icon: string }
> = {
  diario: {
    label: "Relatório Diário",
    description: "Resumo operacional do dia com irrigações, clima e recomendações",
    icon: "D",
  },
  semanal: {
    label: "Relatório Semanal",
    description: "Consolidação semanal com tendências e comparativos",
    icon: "S",
  },
  mensal: {
    label: "Relatório Mensal",
    description: "Análise completa do mês com indicadores e evolução",
    icon: "M",
  },
  por_pivo: {
    label: "Relatório por Pivô",
    description: "Desempenho individual do pivô com histórico completo",
    icon: "P",
  },
  por_cultura: {
    label: "Relatório por Cultura",
    description: "Indicadores agrupados por cultura com eficiência",
    icon: "C",
  },
  energetico: {
    label: "Relatório Energético",
    description: "Consumo, demanda, rateio e otimização de energia",
    icon: "E",
  },
  financeiro: {
    label: "Relatório Financeiro",
    description: "Custos operacionais, rateio e projeções",
    icon: "F",
  },
  executivo: {
    label: "Relatório Executivo",
    description: "Visão consolidada para diretoria com KPIs estratégicos",
    icon: "X",
  },
};

export const EXPORT_FORMAT_CONFIG: Record<
  ExportFormat,
  { label: string; extension: string; mimeType: string }
> = {
  pdf: { label: "PDF", extension: ".pdf", mimeType: "application/pdf" },
  xlsx: { label: "Excel", extension: ".xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  csv: { label: "CSV", extension: ".csv", mimeType: "text/csv" },
};

export const AUDIT_ACTION_CONFIG: Record<
  AuditAction,
  { label: string; bgClass: string }
> = {
  create:   { label: "Criação",    bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  update:   { label: "Atualização", bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  delete:   { label: "Exclusão",   bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  export:   { label: "Exportação", bgClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  generate: { label: "Geração",    bgClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  approve:  { label: "Aprovação",  bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  reject:   { label: "Rejeição",   bgClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  login:    { label: "Login",      bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
  logout:   { label: "Logout",     bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
};

export const HISTORY_DIMENSION_CONFIG: Record<
  HistoryDimension,
  { label: string; description: string }
> = {
  irrigacao:   { label: "Irrigações",     description: "Histórico de todas as irrigações realizadas" },
  recomendacao: { label: "Recomendações", description: "Histórico de recomendações geradas pela IA" },
  agua:        { label: "Consumo Água",   description: "Histórico de consumo de água por pivô" },
  energia:     { label: "Energia",        description: "Histórico de consumo energético" },
  custo:       { label: "Custos",         description: "Histórico de custos operacionais" },
  clima:       { label: "Climático",      description: "Histórico de dados climáticos" },
};

// ── Audit Log Entry ───────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  farmId: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

// ── Report Data Structures ────────────────────────────────────────────

export interface DailyReportData {
  date: string;
  farmName: string;
  weatherSummary: {
    tempMax: number;
    tempMin: number;
    tempMean: number;
    humidity: number;
    windSpeed: number;
    solarRadiation: number;
    precipitation: number;
    et0: number;
  };
  irrigationSummary: {
    totalPivots: number;
    irrigatedPivots: number;
    totalVolumeM3: number;
    totalDepthMm: number;
    totalAreaHa: number;
    totalHours: number;
    totalEnergyKwh: number;
    totalCost: number;
  };
  pivotDetails: PivotReportRow[];
  recommendations: RecommendationReportRow[];
  alerts: string[];
}

export interface PivotReportRow {
  pivotName: string;
  cultureName: string;
  cropPhase: string;
  armPct: number;
  deficit: number;
  etc: number;
  waterStatus: string;
  irrigated: boolean;
  depthMm: number;
  volumeM3: number;
  durationH: number;
  energyKwh: number;
  cost: number;
}

export interface RecommendationReportRow {
  pivotName: string;
  priority: string;
  score: number;
  status: string;
  reason: string;
  depthMm: number;
  volumeM3: number;
}

export interface WeeklyReportData {
  weekLabel: string;
  periodStart: string;
  periodEnd: string;
  farmName: string;
  weatherAvg: {
    avgTemp: number;
    totalPrecip: number;
    avgET0: number;
    totalET0: number;
    avgHumidity: number;
    avgWind: number;
  };
  irrigationTotals: {
    totalEvents: number;
    totalVolumeM3: number;
    totalDepthMm: number;
    totalHours: number;
    totalEnergyKwh: number;
    totalCost: number;
    avgEfficiency: number;
  };
  dailyBreakdown: DailyBreakdownRow[];
  pivotRanking: PivotRankingRow[];
}

export interface DailyBreakdownRow {
  date: string;
  dayLabel: string;
  pivotsIrrigated: number;
  volumeM3: number;
  energyKwh: number;
  cost: number;
  precipitation: number;
  et0: number;
}

export interface PivotRankingRow {
  rank: number;
  pivotName: string;
  cultureName: string;
  totalVolumeM3: number;
  totalEnergyKwh: number;
  totalCost: number;
  avgArmPct: number;
  avgDeficit: number;
  avgEtc: number;
  efficiencyScore: number;
}

export interface MonthlyReportData {
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  farmName: string;
  kpis: ReportKPIs;
  weeklyEvolution: WeeklyEvolutionRow[];
  cultureBreakdown: CultureBreakdownRow[];
  energyBreakdown: EnergyBreakdownRow[];
  costBreakdown: CostBreakdownRow[];
}

export interface WeeklyEvolutionRow {
  weekLabel: string;
  volumeM3: number;
  energyKwh: number;
  cost: number;
  avgArmPct: number;
  avgDeficit: number;
}

export interface CultureBreakdownRow {
  cultureName: string;
  areaHa: number;
  volumeM3: number;
  depthMm: number;
  energyKwh: number;
  cost: number;
  kwhPerMm: number;
  costPerMm: number;
  costPerHa: number;
}

export interface EnergyBreakdownRow {
  label: string;
  totalKwh: number;
  peakKwh: number;
  offPeakKwh: number;
  peakPct: number;
  totalCost: number;
  kwhPerM3: number;
}

export interface CostBreakdownRow {
  category: string;
  value: number;
  pct: number;
}

// ── KPI Indicators ────────────────────────────────────────────────────

export interface ReportKPIs {
  irrigationEfficiency: number;
  energyEfficiency: number;
  totalWaterApplied: number;
  totalETc: number;
  avgArm: number;
  avgDeficit: number;
  energyPerMm: number;
  energyPerHa: number;
  costPerMm: number;
  costPerHa: number;
  estimatedYield: number;
}

export function calculateReportKPIs(
  balanceRows: DailyBalanceRow[],
  energyResults: ConsumptionResult[],
  totalAreaHa: number
): ReportKPIs {
  const totalIrrigation = sum(balanceRows.map((r) => r.irrigationApplied));
  const totalETc = sum(balanceRows.map((r) => r.etc));
  const avgArm = balanceRows.length > 0
    ? average(balanceRows.map((r) => r.cad > 0 ? (r.storedWater / r.cad) * 100 : 0))
    : 0;
  const avgDeficit = balanceRows.length > 0
    ? average(balanceRows.map((r) => r.deficit))
    : 0;

  const totalKwh = sum(energyResults.map((r) => r.totalKwh));
  const totalCost = sum(energyResults.map((r) => r.costTotal));
  const totalVolumeM3 = sum(energyResults.map((r) => r.volumeM3));
  const totalDepthMm = sum(energyResults.map((r) => r.depthMm));

  const irrigationEfficiency = totalETc > 0 && totalIrrigation > 0
    ? roundTo(Math.min((totalETc / totalIrrigation) * 100, 100), 1)
    : 0;

  const energyEfficiency = totalVolumeM3 > 0
    ? roundTo(totalKwh / totalVolumeM3, 4)
    : 0;

  const energyPerMm = totalDepthMm > 0 ? roundTo(totalKwh / totalDepthMm, 2) : 0;
  const energyPerHa = totalAreaHa > 0 ? roundTo(totalKwh / totalAreaHa, 2) : 0;
  const costPerMm = totalDepthMm > 0 ? roundTo(totalCost / totalDepthMm, 2) : 0;
  const costPerHa = totalAreaHa > 0 ? roundTo(totalCost / totalAreaHa, 2) : 0;

  const yieldFactor = avgArm > 70 ? 1.0 : avgArm > 50 ? 0.85 : avgArm > 30 ? 0.65 : 0.4;
  const estimatedYield = roundTo(totalAreaHa * 60 * yieldFactor, 0);

  return {
    irrigationEfficiency,
    energyEfficiency,
    totalWaterApplied: roundTo(totalIrrigation, 1),
    totalETc: roundTo(totalETc, 1),
    avgArm: roundTo(avgArm, 1),
    avgDeficit: roundTo(avgDeficit, 1),
    energyPerMm,
    energyPerHa,
    costPerMm,
    costPerHa,
    estimatedYield,
  };
}

// ── Report Generators ─────────────────────────────────────────────────

export function generateDailyReport(
  date: string,
  farmName: string,
  weather: WeatherReadingRow | null,
  balanceRows: DailyBalanceRow[],
  recommendations: Recommendation[],
  scheduleSlots: ScheduleSlot[],
  energyResults: ConsumptionResult[]
): DailyReportData {
  const todayBalance = balanceRows.filter((r) => r.date === date);
  const todayEnergy = energyResults.filter((r) => r.date === date);
  const irrigatedSlots = scheduleSlots.filter((s) => s.slotStatus !== "bloqueado" && s.slotStatus !== "cancelado");

  const pivotDetails: PivotReportRow[] = todayBalance.map((b) => {
    const rec = recommendations.find((r) => r.pivotId === b.date);
    const slot = irrigatedSlots.find((s) => s.pivotName === b.phase);
    const energy = todayEnergy.find((e) => e.date === date);

    return {
      pivotName: b.phase,
      cultureName: rec?.cropPhase ?? "—",
      cropPhase: b.phase,
      armPct: b.cad > 0 ? roundTo((b.storedWater / b.cad) * 100, 1) : 0,
      deficit: b.deficit,
      etc: b.etc,
      waterStatus: b.waterStatus,
      irrigated: b.irrigationApplied > 0,
      depthMm: b.irrigationApplied,
      volumeM3: slot?.volumeM3 ?? 0,
      durationH: slot?.durationH ?? 0,
      energyKwh: energy?.totalKwh ?? 0,
      cost: energy?.costTotal ?? 0,
    };
  });

  const recRows: RecommendationReportRow[] = recommendations.map((r) => ({
    pivotName: r.pivotName,
    priority: r.priority,
    score: r.priorityScore,
    status: r.operationalStatus,
    reason: r.reason,
    depthMm: r.grossDepth,
    volumeM3: r.volumeM3,
  }));

  const alerts: string[] = [];
  const criticals = recommendations.filter((r) => r.priority === "critica");
  if (criticals.length > 0) {
    alerts.push(`${criticals.length} pivô(s) em prioridade CRÍTICA`);
  }
  const deficitCriticos = todayBalance.filter((b) => b.waterStatus === "deficit_critico");
  if (deficitCriticos.length > 0) {
    alerts.push(`${deficitCriticos.length} pivô(s) em déficit crítico`);
  }

  return {
    date,
    farmName,
    weatherSummary: weather
      ? {
          tempMax: weather.temp_max,
          tempMin: weather.temp_min,
          tempMean: weather.temp_mean,
          humidity: weather.humidity,
          windSpeed: weather.wind_speed,
          solarRadiation: weather.solar_radiation,
          precipitation: weather.precipitation,
          et0: weather.et0_calculated ?? 0,
        }
      : { tempMax: 0, tempMin: 0, tempMean: 0, humidity: 0, windSpeed: 0, solarRadiation: 0, precipitation: 0, et0: 0 },
    irrigationSummary: {
      totalPivots: todayBalance.length,
      irrigatedPivots: todayBalance.filter((b) => b.irrigationApplied > 0).length,
      totalVolumeM3: sum(irrigatedSlots.map((s) => s.volumeM3)),
      totalDepthMm: sum(todayBalance.map((b) => b.irrigationApplied)),
      totalAreaHa: sum(todayEnergy.map((e) => e.area)),
      totalHours: sum(irrigatedSlots.map((s) => s.durationH)),
      totalEnergyKwh: sum(todayEnergy.map((e) => e.totalKwh)),
      totalCost: sum(todayEnergy.map((e) => e.costTotal)),
    },
    pivotDetails,
    recommendations: recRows,
    alerts,
  };
}

// ── History Data Structures ───────────────────────────────────────────

export interface IrrigationHistoryRow {
  date: string;
  pivotName: string;
  cultureName: string;
  cropPhase: string;
  depthMm: number;
  volumeM3: number;
  durationH: number;
  startTime: string;
  endTime: string;
  armBefore: number;
  armAfter: number;
  deficitBefore: number;
}

export interface RecommendationHistoryRow {
  date: string;
  pivotName: string;
  priority: string;
  score: number;
  operationalStatus: string;
  shouldIrrigate: boolean;
  depthMm: number;
  volumeM3: number;
  reason: string;
  wasExecuted: boolean;
}

export interface WaterHistoryRow {
  date: string;
  pivotName: string;
  et0: number;
  etc: number;
  precipitation: number;
  effectivePrecip: number;
  irrigationApplied: number;
  storedWater: number;
  cad: number;
  armPct: number;
  deficit: number;
  waterStatus: string;
}

export interface EnergyHistoryRow {
  date: string;
  pivotName: string;
  operatingHours: number;
  powerKw: number;
  totalKwh: number;
  peakKwh: number;
  offPeakKwh: number;
  costTotal: number;
  kwhPerM3: number;
  costPerM3: number;
}

export interface CostHistoryRow {
  date: string;
  pivotName: string;
  energyCost: number;
  peakCost: number;
  offPeakCost: number;
  demandCost: number;
  costPerMm: number;
  costPerHa: number;
  costPerM3: number;
}

export interface WeatherHistoryRow {
  date: string;
  tempMax: number;
  tempMin: number;
  tempMean: number;
  humidity: number;
  windSpeed: number;
  solarRadiation: number;
  precipitation: number;
  et0: number;
}

// ── History Generators ────────────────────────────────────────────────

export function generateIrrigationHistory(
  balanceRows: DailyBalanceRow[],
  scheduleSlots: ScheduleSlot[],
  pivotName: string,
  cultureName: string
): IrrigationHistoryRow[] {
  return balanceRows
    .filter((b) => b.irrigationApplied > 0)
    .map((b) => {
      const slot = scheduleSlots.find((s) => s.pivotName === pivotName);
      return {
        date: b.date,
        pivotName,
        cultureName,
        cropPhase: b.phase,
        depthMm: roundTo(b.irrigationApplied, 1),
        volumeM3: slot?.volumeM3 ?? roundTo(b.irrigationApplied * 10, 0),
        durationH: slot?.durationH ?? 0,
        startTime: slot?.startTime ?? "—",
        endTime: slot?.endTime ?? "—",
        armBefore: roundTo(b.storedWater - b.irrigationApplied + b.etc, 1),
        armAfter: roundTo(b.storedWater, 1),
        deficitBefore: roundTo(b.deficit + b.irrigationApplied, 1),
      };
    });
}

export function generateWaterHistory(
  balanceRows: DailyBalanceRow[],
  pivotName: string
): WaterHistoryRow[] {
  return balanceRows.map((b) => ({
    date: b.date,
    pivotName,
    et0: b.et0,
    etc: b.etc,
    precipitation: b.precipitation,
    effectivePrecip: b.effectivePrecipitation,
    irrigationApplied: b.irrigationApplied,
    storedWater: b.storedWater,
    cad: b.cad,
    armPct: b.cad > 0 ? roundTo((b.storedWater / b.cad) * 100, 1) : 0,
    deficit: b.deficit,
    waterStatus: b.waterStatus,
  }));
}

export function generateEnergyHistory(
  results: ConsumptionResult[]
): EnergyHistoryRow[] {
  return results.map((r) => ({
    date: r.date,
    pivotName: r.pivotName,
    operatingHours: r.operatingHours,
    powerKw: roundTo(r.powerKw, 1),
    totalKwh: r.totalKwh,
    peakKwh: r.peakKwh,
    offPeakKwh: r.offPeakKwh,
    costTotal: r.costTotal,
    kwhPerM3: r.kwhPerM3,
    costPerM3: r.costPerM3,
  }));
}

export function generateCostHistory(
  results: ConsumptionResult[],
  demandCostPerDay: number
): CostHistoryRow[] {
  return results.map((r) => ({
    date: r.date,
    pivotName: r.pivotName,
    energyCost: r.costTotal,
    peakCost: r.costPeak,
    offPeakCost: r.costOffPeak,
    demandCost: demandCostPerDay,
    costPerMm: r.costPerMm,
    costPerHa: r.costPerHa,
    costPerM3: r.costPerM3,
  }));
}

export function generateWeatherHistory(
  readings: WeatherReadingRow[]
): WeatherHistoryRow[] {
  return readings.map((r) => ({
    date: r.date,
    tempMax: r.temp_max,
    tempMin: r.temp_min,
    tempMean: r.temp_mean,
    humidity: r.humidity,
    windSpeed: r.wind_speed,
    solarRadiation: r.solar_radiation,
    precipitation: r.precipitation,
    et0: r.et0_calculated ?? 0,
  }));
}

// ── Comparative Analysis ──────────────────────────────────────────────

export interface ComparativeRow {
  dimensionKey: string;
  dimensionLabel: string;
  totalVolumeM3: number;
  totalDepthMm: number;
  totalEnergyKwh: number;
  totalCost: number;
  avgArmPct: number;
  avgDeficit: number;
  avgETc: number;
  irrigationEfficiency: number;
  energyEfficiency: number;
  costPerMm: number;
  costPerHa: number;
  kwhPerMm: number;
  areaHa: number;
  days: number;
}

export function generateComparative(
  items: Array<{
    key: string;
    label: string;
    balanceRows: DailyBalanceRow[];
    energyResults: ConsumptionResult[];
    areaHa: number;
  }>
): ComparativeRow[] {
  return items.map((item) => {
    const totalIrrigation = sum(item.balanceRows.map((r) => r.irrigationApplied));
    const totalETc = sum(item.balanceRows.map((r) => r.etc));
    const avgArmPct = item.balanceRows.length > 0
      ? average(item.balanceRows.map((r) => r.cad > 0 ? (r.storedWater / r.cad) * 100 : 0))
      : 0;
    const avgDeficit = item.balanceRows.length > 0
      ? average(item.balanceRows.map((r) => r.deficit))
      : 0;

    const totalKwh = sum(item.energyResults.map((r) => r.totalKwh));
    const totalCost = sum(item.energyResults.map((r) => r.costTotal));
    const totalVolumeM3 = sum(item.energyResults.map((r) => r.volumeM3));
    const totalDepthMm = sum(item.energyResults.map((r) => r.depthMm));

    return {
      dimensionKey: item.key,
      dimensionLabel: item.label,
      totalVolumeM3: roundTo(totalVolumeM3, 0),
      totalDepthMm: roundTo(totalDepthMm, 1),
      totalEnergyKwh: roundTo(totalKwh, 1),
      totalCost: roundTo(totalCost, 2),
      avgArmPct: roundTo(avgArmPct, 1),
      avgDeficit: roundTo(avgDeficit, 1),
      avgETc: item.balanceRows.length > 0 ? roundTo(totalETc / item.balanceRows.length, 2) : 0,
      irrigationEfficiency: totalETc > 0 && totalIrrigation > 0
        ? roundTo(Math.min((totalETc / totalIrrigation) * 100, 100), 1)
        : 0,
      energyEfficiency: totalVolumeM3 > 0 ? roundTo(totalKwh / totalVolumeM3, 4) : 0,
      costPerMm: totalDepthMm > 0 ? roundTo(totalCost / totalDepthMm, 2) : 0,
      costPerHa: item.areaHa > 0 ? roundTo(totalCost / item.areaHa, 2) : 0,
      kwhPerMm: totalDepthMm > 0 ? roundTo(totalKwh / totalDepthMm, 2) : 0,
      areaHa: item.areaHa,
      days: item.balanceRows.length,
    };
  });
}

// ── CSV Export ─────────────────────────────────────────────────────────

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: Array<{ key: keyof T; header: string }>,
  separator: string = ";"
): string {
  if (data.length === 0) return "";

  const headers = columns.map((c) => c.header).join(separator);
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return "";
        if (typeof val === "number") return String(val).replace(".", ",");
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(separator)
  );

  return [headers, ...rows].join("\n");
}

// ── XLSX-compatible data preparation ──────────────────────────────────

export interface SheetData {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

export function prepareSheetData<T extends Record<string, unknown>>(
  data: T[],
  columns: Array<{ key: keyof T; header: string }>,
  sheetName: string
): SheetData {
  return {
    sheetName,
    headers: columns.map((c) => c.header),
    rows: data.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return "";
        if (typeof val === "number") return val;
        return String(val);
      })
    ),
  };
}

// ── PDF Report Section Builder ────────────────────────────────────────

export interface ReportSection {
  type: "title" | "subtitle" | "table" | "kpi_grid" | "text" | "separator";
  content: string;
  data?: Array<Record<string, unknown>>;
  columns?: Array<{ key: string; header: string; align?: string }>;
  kpis?: Array<{ label: string; value: string; unit?: string }>;
}

export function buildDailyReportSections(report: DailyReportData): ReportSection[] {
  const sections: ReportSection[] = [];

  sections.push({ type: "title", content: `Relatório Diário — ${report.date}` });
  sections.push({ type: "subtitle", content: report.farmName });
  sections.push({ type: "separator", content: "" });

  sections.push({ type: "subtitle", content: "Clima" });
  sections.push({
    type: "kpi_grid",
    content: "",
    kpis: [
      { label: "Temp. Máx.", value: `${report.weatherSummary.tempMax.toFixed(1)}`, unit: "°C" },
      { label: "Temp. Mín.", value: `${report.weatherSummary.tempMin.toFixed(1)}`, unit: "°C" },
      { label: "Umidade", value: `${report.weatherSummary.humidity.toFixed(0)}`, unit: "%" },
      { label: "Precipitação", value: `${report.weatherSummary.precipitation.toFixed(1)}`, unit: "mm" },
      { label: "ET₀", value: `${report.weatherSummary.et0.toFixed(2)}`, unit: "mm/dia" },
      { label: "Radiação", value: `${report.weatherSummary.solarRadiation.toFixed(1)}`, unit: "MJ/m²" },
    ],
  });

  sections.push({ type: "separator", content: "" });
  sections.push({ type: "subtitle", content: "Resumo de Irrigação" });
  sections.push({
    type: "kpi_grid",
    content: "",
    kpis: [
      { label: "Pivôs irrigados", value: `${report.irrigationSummary.irrigatedPivots}/${report.irrigationSummary.totalPivots}` },
      { label: "Volume total", value: `${report.irrigationSummary.totalVolumeM3.toFixed(0)}`, unit: "m³" },
      { label: "Horas de operação", value: `${report.irrigationSummary.totalHours.toFixed(1)}`, unit: "h" },
      { label: "Energia", value: `${report.irrigationSummary.totalEnergyKwh.toFixed(0)}`, unit: "kWh" },
      { label: "Custo", value: `R$ ${report.irrigationSummary.totalCost.toFixed(2)}` },
    ],
  });

  if (report.alerts.length > 0) {
    sections.push({ type: "separator", content: "" });
    sections.push({ type: "subtitle", content: "Alertas" });
    sections.push({ type: "text", content: report.alerts.join("\n") });
  }

  return sections;
}

// ── Summary Statistics ────────────────────────────────────────────────

export interface PeriodSummary {
  label: string;
  totalIrrigations: number;
  totalVolumeM3: number;
  totalDepthMm: number;
  totalEnergyKwh: number;
  totalCost: number;
  avgArmPct: number;
  avgDeficit: number;
  totalPrecipitation: number;
  totalETc: number;
  daysInDeficit: number;
  irrigationEfficiency: number;
}

export function calculatePeriodSummary(
  label: string,
  balanceRows: DailyBalanceRow[],
  energyResults: ConsumptionResult[]
): PeriodSummary {
  const totalIrrigation = sum(balanceRows.map((r) => r.irrigationApplied));
  const totalETc = sum(balanceRows.map((r) => r.etc));
  const totalPrecipitation = sum(balanceRows.map((r) => r.precipitation));

  const avgArmPct = balanceRows.length > 0
    ? average(balanceRows.map((r) => r.cad > 0 ? (r.storedWater / r.cad) * 100 : 0))
    : 0;
  const avgDeficit = balanceRows.length > 0
    ? average(balanceRows.map((r) => r.deficit))
    : 0;

  const daysInDeficit = balanceRows.filter(
    (r) => r.waterStatus === "deficit" || r.waterStatus === "deficit_critico"
  ).length;

  const totalKwh = sum(energyResults.map((r) => r.totalKwh));
  const totalCost = sum(energyResults.map((r) => r.costTotal));
  const totalVolumeM3 = sum(energyResults.map((r) => r.volumeM3));
  const totalDepthMm = sum(energyResults.map((r) => r.depthMm));

  return {
    label,
    totalIrrigations: balanceRows.filter((r) => r.irrigationApplied > 0).length,
    totalVolumeM3: roundTo(totalVolumeM3, 0),
    totalDepthMm: roundTo(totalDepthMm, 1),
    totalEnergyKwh: roundTo(totalKwh, 1),
    totalCost: roundTo(totalCost, 2),
    avgArmPct: roundTo(avgArmPct, 1),
    avgDeficit: roundTo(avgDeficit, 1),
    totalPrecipitation: roundTo(totalPrecipitation, 1),
    totalETc: roundTo(totalETc, 1),
    daysInDeficit,
    irrigationEfficiency: totalETc > 0 && totalIrrigation > 0
      ? roundTo(Math.min((totalETc / totalIrrigation) * 100, 100), 1)
      : 0,
  };
}

// ── File Name Generator ───────────────────────────────────────────────

export function generateReportFileName(
  reportType: ReportType,
  farmName: string,
  periodStart: string,
  periodEnd: string,
  format: ExportFormat
): string {
  const config = EXPORT_FORMAT_CONFIG[format];
  const sanitizedFarm = farmName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const dateRange = periodStart === periodEnd
    ? periodStart
    : `${periodStart}_${periodEnd}`;
  return `relatorio_${reportType}_${sanitizedFarm}_${dateRange}${config.extension}`;
}

// ── Report Status Config ──────────────────────────────────────────────

export const REPORT_STATUS_CONFIG: Record<
  string,
  { label: string; bgClass: string }
> = {
  gerando:  { label: "Gerando",  bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  gerado:   { label: "Gerado",   bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  erro:     { label: "Erro",     bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expirado: { label: "Expirado", bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
};
