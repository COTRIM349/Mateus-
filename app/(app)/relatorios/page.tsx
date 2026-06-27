"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, Table, type Column } from "@/components/ui";
import { formatBRL, formatNumber, formatPercent, formatDate } from "@/utils/format";
import { roundTo, sum, average } from "@/utils/math";
import {
  type DailyBalanceRow,
  calculateDailyBalance,
  calculateSummary,
  WATER_STATUS_CONFIG,
} from "@/modules/water-balance/services";
import {
  type Recommendation,
  type PivotContext,
  generateRecommendation,
  rankRecommendations,
  OPERATIONAL_STATUS_CONFIG,
  PRIORITY_CONFIG,
} from "@/modules/recommendation/services";
import {
  type ConsumptionResult,
  type TariffConfig,
  calculateConsumption,
  calculateFarmTotals,
  aggregateByPivot,
  aggregateByCulture,
  aggregateByModule,
  aggregateByDate,
  analyzeDemand,
} from "@/modules/energy/services";
import {
  type ReportType,
  type ExportFormat,
  type HistoryDimension,
  type ComparativeDimension,
  type AuditAction,
  type AuditLogEntry,
  type ComparativeRow,
  type ReportKPIs,
  type PeriodSummary,
  REPORT_TYPE_CONFIG,
  EXPORT_FORMAT_CONFIG,
  AUDIT_ACTION_CONFIG,
  HISTORY_DIMENSION_CONFIG,
  REPORT_STATUS_CONFIG,
  calculateReportKPIs,
  calculatePeriodSummary,
  generateComparative,
  exportToCSV,
  generateReportFileName,
} from "@/modules/reports/services";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// ── Mock data ─────────────────────────────────────────────────────────

const MOCK_TARIFF: TariffConfig = {
  tariffType: "verde",
  ratePeak: 0.95,
  rateOffPeak: 0.42,
  rateReserved: 0.35,
  demandRate: 45.0,
  peakStart: 18,
  peakEnd: 21,
  contractedDemandKw: 350,
};

const PIVOT_NAMES = [
  "Pivô Central 1", "Pivô Central 2", "Pivô Central 3", "Pivô Central 4",
  "Pivô Central 5", "Pivô Central 6", "Pivô Central 7", "Pivô Central 8",
];

const CULTURE_NAMES = ["Soja", "Milho", "Algodão", "Feijão"];
const PHASES = ["Vegetativo", "Floração", "Enchimento", "Maturação"];
const MODULE_NAMES = ["Módulo Norte", "Módulo Sul", "Módulo Leste", "Módulo Oeste"];

function buildMockBalanceRows(): DailyBalanceRow[] {
  const rows: DailyBalanceRow[] = [];
  const baseDate = new Date(2026, 5, 1);
  for (let d = 0; d < 30; d++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];
    for (let p = 0; p < PIVOT_NAMES.length; p++) {
      const et0 = 4 + Math.random() * 3;
      const kc = 0.6 + Math.random() * 0.6;
      const etc = roundTo(et0 * kc, 2);
      const precip = Math.random() > 0.7 ? Math.random() * 20 : 0;
      const irrig = d % 3 === p % 3 ? 8 + Math.random() * 10 : 0;
      const cad = 60 + p * 5;
      const storedWater = roundTo(Math.max(5, cad * (0.4 + Math.random() * 0.5) + irrig - etc), 2);
      const afd = roundTo(cad * 0.55, 2);
      const stressThreshold = cad - afd;
      const deficit = storedWater < stressThreshold ? roundTo(stressThreshold - storedWater, 2) : 0;
      const waterStatus =
        storedWater >= cad ? "saturado" as const :
        storedWater >= stressThreshold ? "ideal" as const :
        storedWater / cad >= 0.3 ? "atencao" as const :
        storedWater / cad >= 0.1 ? "deficit" as const :
        "deficit_critico" as const;

      rows.push({
        date: dateStr,
        phase: PHASES[p % PHASES.length],
        et0: roundTo(et0, 2),
        kc: roundTo(kc, 3),
        etc,
        precipitation: roundTo(precip, 1),
        effectivePrecipitation: roundTo(precip * 0.8, 1),
        irrigationApplied: roundTo(irrig, 1),
        rootDepth: 0.4 + p * 0.05,
        cad,
        afd,
        storedWater,
        depletionFactor: 0.55,
        deficit,
        surplus: storedWater > cad ? roundTo(storedWater - cad, 2) : 0,
        netDepth: roundTo(Math.max(0, cad - storedWater), 2),
        grossDepth: roundTo(Math.max(0, (cad - storedWater) / 0.85), 2),
        volumeNeeded: roundTo(Math.max(0, (cad - storedWater) / 0.85 * (50 + p * 10) * 10), 0),
        irrigationTime: roundTo(Math.max(0, (cad - storedWater) / 0.85 * (50 + p * 10) * 10 / 150), 2),
        waterStatus,
      });
    }
  }
  return rows;
}

function buildMockEnergyResults(): ConsumptionResult[] {
  const results: ConsumptionResult[] = [];
  const baseDate = new Date(2026, 5, 1);
  for (let d = 0; d < 30; d++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];
    for (let p = 0; p < PIVOT_NAMES.length; p++) {
      if (d % 3 !== p % 3) continue;
      const area = 50 + p * 10;
      const hours = 4 + Math.random() * 6;
      const powerKw = 75 + p * 15;
      const totalKwh = roundTo(powerKw * hours, 2);
      const peakRatio = Math.random() * 0.3;
      const peakKwh = roundTo(totalKwh * peakRatio, 2);
      const offPeakKwh = roundTo(totalKwh * (1 - peakRatio), 2);
      const costPeak = roundTo(peakKwh * MOCK_TARIFF.ratePeak, 2);
      const costOffPeak = roundTo(offPeakKwh * MOCK_TARIFF.rateOffPeak, 2);
      const costTotal = roundTo(costPeak + costOffPeak, 2);
      const volumeM3 = roundTo(area * 10 * (8 + Math.random() * 10) / 0.85, 0);
      const depthMm = roundTo(volumeM3 / (area * 10), 1);

      results.push({
        pivotId: `pivot-${p + 1}`,
        pivotName: PIVOT_NAMES[p],
        pumpHouseId: `pump-${(p % 2) + 1}`,
        pumpHouseName: `CB ${(p % 2) + 1}`,
        cultureName: CULTURE_NAMES[p % CULTURE_NAMES.length],
        cultureId: `culture-${(p % CULTURE_NAMES.length) + 1}`,
        seasonId: "safra-2026",
        moduleName: MODULE_NAMES[p % MODULE_NAMES.length],
        area,
        date: dateStr,
        operatingHours: roundTo(hours, 1),
        powerKw,
        totalKwh,
        peakKwh,
        offPeakKwh,
        costPeak,
        costOffPeak,
        costTotal,
        demandKw: powerKw,
        volumeM3,
        depthMm,
        kwhPerM3: volumeM3 > 0 ? roundTo(totalKwh / volumeM3, 4) : 0,
        kwhPerMm: depthMm > 0 ? roundTo(totalKwh / depthMm, 2) : 0,
        kwhPerHa: area > 0 ? roundTo(totalKwh / area, 2) : 0,
        costPerM3: volumeM3 > 0 ? roundTo(costTotal / volumeM3, 4) : 0,
        costPerMm: depthMm > 0 ? roundTo(costTotal / depthMm, 2) : 0,
        costPerHa: area > 0 ? roundTo(costTotal / area, 2) : 0,
      });
    }
  }
  return results;
}

function buildMockRecommendations(): Recommendation[] {
  return PIVOT_NAMES.map((name, i) => {
    const score = 20 + Math.random() * 70;
    const priority = score >= 80 ? "critica" as const : score >= 60 ? "alta" as const : score >= 40 ? "media" as const : score >= 20 ? "baixa" as const : "sem_necessidade" as const;
    const status = score >= 80 ? "irrigar_imediatamente" as const : score >= 60 ? "irrigar_hoje" as const : score >= 40 ? "irrigar_amanha" as const : score >= 20 ? "monitorar" as const : "nao_irrigar" as const;
    return {
      pivotId: `pivot-${i + 1}`,
      pivotName: name,
      shouldIrrigate: score >= 40,
      operationalStatus: status,
      priority,
      priorityScore: roundTo(score, 1),
      productiveRisk: roundTo(score * 0.7, 1),
      netDepth: roundTo(5 + Math.random() * 15, 1),
      grossDepth: roundTo(8 + Math.random() * 18, 1),
      volumeM3: roundTo(500 + Math.random() * 2000, 0),
      irrigationTimeH: roundTo(3 + Math.random() * 8, 1),
      currentArm: roundTo(20 + Math.random() * 50, 1),
      currentCad: roundTo(60 + i * 5, 1),
      currentAfd: roundTo(33 + i * 3, 1),
      currentDeficit: roundTo(Math.random() * 15, 1),
      currentEtc: roundTo(3 + Math.random() * 4, 1),
      currentKc: roundTo(0.6 + Math.random() * 0.6, 2),
      rootDepth: roundTo(0.3 + Math.random() * 0.4, 2),
      cropPhase: PHASES[i % PHASES.length],
      depletionFactor: 0.55,
      peakRestricted: Math.random() > 0.7,
      recommendedStart: score >= 60 ? "06:00" : "—",
      reason: `ARM em ${(40 + Math.random() * 40).toFixed(0)}% do CAD.`,
      observations: "",
    };
  });
}

function buildMockAuditLog(): AuditLogEntry[] {
  const actions: AuditAction[] = ["create", "update", "delete", "export", "generate", "approve"];
  const entities = ["Pivô Central 1", "Safra 2026", "Estação Automática", "Cultura Soja", "Programação Diária", "Relatório Mensal", "Tarifa Verde", "Solo Módulo Norte"];
  const entityTypes = ["pivot", "season", "station", "culture", "schedule", "report", "tariff", "soil"];
  const users = ["João Silva", "Maria Souza", "Carlos Oliveira", "Ana Costa"];

  const entries: AuditLogEntry[] = [];
  const baseDate = new Date(2026, 5, 20);

  for (let i = 0; i < 30; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - Math.floor(i / 3));
    date.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));

    const action = actions[i % actions.length];
    const entityIdx = i % entities.length;

    entries.push({
      id: `audit-${i + 1}`,
      farmId: "farm-1",
      userId: `user-${(i % users.length) + 1}`,
      userName: users[i % users.length],
      action,
      entityType: entityTypes[entityIdx],
      entityId: `entity-${entityIdx + 1}`,
      entityName: entities[entityIdx],
      changes: action === "update" ? { campo: { from: "valor antigo", to: "valor novo" } } : {},
      metadata: {},
      ipAddress: `192.168.1.${10 + i}`,
      createdAt: date.toISOString(),
    });
  }
  return entries;
}

// ── Chart colors ──────────────────────────────────────────────────────

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

// ── Main component ───────────────────────────────────────────────────

const TABS = [
  { id: "relatorios", label: "Relatórios" },
  { id: "historico", label: "Histórico" },
  { id: "comparativos", label: "Comparativos" },
  { id: "indicadores", label: "Indicadores" },
  { id: "auditoria", label: "Auditoria" },
];

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState("relatorios");
  const [selectedReportType, setSelectedReportType] = useState<ReportType>("diario");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [historyDimension, setHistoryDimension] = useState<HistoryDimension>("irrigacao");
  const [comparativeDimension, setComparativeDimension] = useState<ComparativeDimension>("pivo");

  const balanceRows = useMemo(() => buildMockBalanceRows(), []);
  const energyResults = useMemo(() => buildMockEnergyResults(), []);
  const recommendations = useMemo(() => buildMockRecommendations(), []);
  const auditLog = useMemo(() => buildMockAuditLog(), []);

  const totalArea = useMemo(() => {
    const pivotAreas: Record<string, number> = {};
    for (const r of energyResults) pivotAreas[r.pivotId] = r.area;
    return sum(Object.values(pivotAreas));
  }, [energyResults]);

  const kpis = useMemo(
    () => calculateReportKPIs(balanceRows, energyResults, totalArea),
    [balanceRows, energyResults, totalArea]
  );

  const farmTotals = useMemo(
    () => calculateFarmTotals(energyResults, MOCK_TARIFF.contractedDemandKw, MOCK_TARIFF.demandRate, 30),
    [energyResults]
  );

  const byPivot = useMemo(() => aggregateByPivot(energyResults), [energyResults]);
  const byCulture = useMemo(() => aggregateByCulture(energyResults), [energyResults]);
  const byModule = useMemo(() => aggregateByModule(energyResults), [energyResults]);
  const byDate = useMemo(() => aggregateByDate(energyResults), [energyResults]);

  const balanceSummary = useMemo(() => calculateSummary(balanceRows), [balanceRows]);

  return (
    <div>
      <PageHeader
        titulo="Relatórios Inteligentes"
        descricao="Relatórios, histórico, comparativos, indicadores e auditoria"
      />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "relatorios" && (
          <TabRelatorios
            selectedType={selectedReportType}
            onSelectType={setSelectedReportType}
            selectedFormat={selectedFormat}
            onSelectFormat={setSelectedFormat}
            farmTotals={farmTotals}
            kpis={kpis}
            balanceSummary={balanceSummary}
            byPivot={byPivot}
            byCulture={byCulture}
            recommendations={recommendations}
          />
        )}
        {activeTab === "historico" && (
          <TabHistorico
            dimension={historyDimension}
            onChangeDimension={setHistoryDimension}
            balanceRows={balanceRows}
            energyResults={energyResults}
            recommendations={recommendations}
          />
        )}
        {activeTab === "comparativos" && (
          <TabComparativos
            dimension={comparativeDimension}
            onChangeDimension={setComparativeDimension}
            balanceRows={balanceRows}
            energyResults={energyResults}
          />
        )}
        {activeTab === "indicadores" && (
          <TabIndicadores kpis={kpis} farmTotals={farmTotals} balanceSummary={balanceSummary} byPivot={byPivot} byCulture={byCulture} />
        )}
        {activeTab === "auditoria" && <TabAuditoria auditLog={auditLog} />}
      </div>
    </div>
  );
}

// ── Tab: Relatórios ───────────────────────────────────────────────────

function TabRelatorios({
  selectedType, onSelectType, selectedFormat, onSelectFormat,
  farmTotals, kpis, balanceSummary, byPivot, byCulture, recommendations,
}: {
  selectedType: ReportType;
  onSelectType: (t: ReportType) => void;
  selectedFormat: ExportFormat;
  onSelectFormat: (f: ExportFormat) => void;
  farmTotals: ReturnType<typeof calculateFarmTotals>;
  kpis: ReportKPIs;
  balanceSummary: ReturnType<typeof calculateSummary>;
  byPivot: ReturnType<typeof aggregateByPivot>;
  byCulture: ReturnType<typeof aggregateByCulture>;
  recommendations: Recommendation[];
}) {
  const reportTypes = Object.entries(REPORT_TYPE_CONFIG) as Array<[ReportType, typeof REPORT_TYPE_CONFIG[ReportType]]>;
  const formats = Object.entries(EXPORT_FORMAT_CONFIG) as Array<[ExportFormat, typeof EXPORT_FORMAT_CONFIG[ExportFormat]]>;
  const config = REPORT_TYPE_CONFIG[selectedType];

  return (
    <div className="space-y-6">
      {/* Report type selector */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {reportTypes.map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onSelectType(key)}
            className={`rounded-lg border p-4 text-left transition-all ${
              selectedType === key
                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                : "border-gray-200 hover:border-gray-300 dark:border-graphite-700 dark:hover:border-graphite-600"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ${
                selectedType === key
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400"
              }`}>
                {cfg.icon}
              </span>
              <span className="text-sm font-semibold text-graphite-900 dark:text-white">{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{cfg.description}</p>
          </button>
        ))}
      </div>

      {/* Format selector + Generate */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-graphite-900 dark:text-white">{config.label}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{config.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 dark:border-graphite-700">
              {formats.map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onSelectFormat(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    selectedFormat === key
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-graphite-800"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <button className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
              Gerar Relatório
            </button>
          </div>
        </div>
      </Card>

      {/* Report preview */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Pré-visualização — {config.label}
        </h3>
        <ReportPreview
          type={selectedType}
          farmTotals={farmTotals}
          kpis={kpis}
          balanceSummary={balanceSummary}
          byPivot={byPivot}
          byCulture={byCulture}
          recommendations={recommendations}
        />
      </Card>

      {/* Recent reports */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Relatórios Recentes
        </h3>
        <RecentReportsTable />
      </Card>
    </div>
  );
}

function ReportPreview({
  type, farmTotals, kpis, balanceSummary, byPivot, byCulture, recommendations,
}: {
  type: ReportType;
  farmTotals: ReturnType<typeof calculateFarmTotals>;
  kpis: ReportKPIs;
  balanceSummary: ReturnType<typeof calculateSummary>;
  byPivot: ReturnType<typeof aggregateByPivot>;
  byCulture: ReturnType<typeof aggregateByCulture>;
  recommendations: Recommendation[];
}) {
  switch (type) {
    case "diario":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKPI label="Pivôs irrigados" value={`${byPivot.length}`} />
            <MiniKPI label="Volume total" value={`${formatNumber(farmTotals.totalVolumeM3)} m³`} />
            <MiniKPI label="Energia" value={`${formatNumber(farmTotals.totalKwh)} kWh`} />
            <MiniKPI label="Custo dia" value={formatBRL(farmTotals.avgDailyCost)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-graphite-700">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Pivô</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">kWh</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Custo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">m³</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Horas</th>
                </tr>
              </thead>
              <tbody>
                {byPivot.slice(0, 5).map((p) => (
                  <tr key={p.groupKey} className="border-b border-gray-100 dark:border-graphite-800">
                    <td className="px-3 py-2 font-medium text-graphite-900 dark:text-white">{p.groupLabel}</td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatNumber(p.totalKwh)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatBRL(p.totalCost)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatNumber(p.totalVolumeM3)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatNumber(p.totalHours, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case "semanal":
    case "mensal":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MiniKPI label="Total irrigações" value={`${balanceSummary.daysInDeficit > 0 ? balanceSummary.days - balanceSummary.daysInDeficit : balanceSummary.days}`} />
            <MiniKPI label="Precipitação" value={`${formatNumber(balanceSummary.totalPrecipitation, 1)} mm`} />
            <MiniKPI label="ETc total" value={`${formatNumber(balanceSummary.totalETc, 1)} mm`} />
            <MiniKPI label="Dias em déficit" value={`${balanceSummary.daysInDeficit}`} />
            <MiniKPI label="Custo total" value={formatBRL(farmTotals.totalCost)} />
          </div>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCulture}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="groupLabel" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="totalCost" name="Custo (R$)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalKwh" name="Energia (kWh)" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    case "por_pivo":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKPI label="Total pivôs" value={`${byPivot.length}`} />
            <MiniKPI label="Energia total" value={`${formatNumber(farmTotals.totalKwh)} kWh`} />
            <MiniKPI label="Custo total" value={formatBRL(farmTotals.totalCost)} />
            <MiniKPI label="kWh/ha médio" value={formatNumber(farmTotals.kwhPerHa, 1)} />
          </div>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPivot} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis dataKey="groupLabel" type="category" tick={{ fontSize: 10 }} width={120} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="costPerHa" name="R$/ha" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    case "por_cultura":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {byCulture.map((c, i) => (
              <MiniKPI key={c.groupKey} label={c.groupLabel} value={formatBRL(c.totalCost)} />
            ))}
          </div>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCulture} dataKey="totalCost" nameKey="groupLabel" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {byCulture.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    case "energetico":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MiniKPI label="Total kWh" value={formatNumber(farmTotals.totalKwh)} />
            <MiniKPI label="Ponta" value={`${formatPercent(farmTotals.peakPct)}`} />
            <MiniKPI label="Custo total" value={formatBRL(farmTotals.totalCost)} />
            <MiniKPI label="kWh/m³" value={formatNumber(farmTotals.kwhPerM3, 4)} />
            <MiniKPI label="R$/mm" value={formatNumber(farmTotals.costPerMm, 2)} />
          </div>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPivot}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="peakKwh" name="Ponta (kWh)" fill="#ef4444" stackId="a" />
                <Bar dataKey="offPeakKwh" name="Fora ponta (kWh)" fill="#22c55e" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    case "financeiro":
      const costBreakdown = [
        { name: "Energia fora ponta", value: farmTotals.offPeakCost },
        { name: "Energia ponta", value: farmTotals.peakCost },
        { name: "Demanda", value: farmTotals.demandCost },
      ];
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKPI label="Custo total" value={formatBRL(farmTotals.totalCost + farmTotals.demandCost)} />
            <MiniKPI label="Custo diário médio" value={formatBRL(farmTotals.avgDailyCost)} />
            <MiniKPI label="Projeção mensal" value={formatBRL(farmTotals.projectedMonthlyCost)} />
            <MiniKPI label="R$/ha" value={formatNumber(farmTotals.costPerHa, 2)} />
          </div>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={costBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  <Cell fill="#22c55e" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      );

    case "executivo":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKPI label="Efic. irrigação" value={formatPercent(kpis.irrigationEfficiency)} />
            <MiniKPI label="ARM médio" value={formatPercent(kpis.avgArm)} />
            <MiniKPI label="Custo/ha" value={`R$ ${formatNumber(kpis.costPerHa, 2)}`} />
            <MiniKPI label="Prod. estimada" value={`${formatNumber(kpis.estimatedYield)} sc`} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Top 5 — Prioridade</p>
              {rankRecommendations(recommendations).slice(0, 5).map((r) => (
                <div key={r.pivotId} className="flex items-center justify-between border-b border-gray-100 py-2 dark:border-graphite-800">
                  <span className="text-sm text-graphite-900 dark:text-white">{r.pivotName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CONFIG[r.priority].bgClass}`}>
                    {PRIORITY_CONFIG[r.priority].label} ({r.priorityScore.toFixed(0)})
                  </span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Custo por Cultura</p>
              {byCulture.map((c) => (
                <div key={c.groupKey} className="flex items-center justify-between border-b border-gray-100 py-2 dark:border-graphite-800">
                  <span className="text-sm text-graphite-900 dark:text-white">{c.groupLabel}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatBRL(c.totalCost)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-graphite-700">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-graphite-900 dark:text-white">{value}</p>
    </div>
  );
}

interface RecentReport {
  id: string;
  type: ReportType;
  name: string;
  format: ExportFormat;
  date: string;
  status: string;
  sizeKb: number;
}

function RecentReportsTable() {
  const recent: RecentReport[] = [
    { id: "1", type: "diario", name: "Relatório Diário — 26/06/2026", format: "pdf", date: "2026-06-26", status: "gerado", sizeKb: 245 },
    { id: "2", type: "semanal", name: "Relatório Semanal — Sem. 25", format: "xlsx", date: "2026-06-22", status: "gerado", sizeKb: 512 },
    { id: "3", type: "energetico", name: "Relatório Energético — Jun/2026", format: "pdf", date: "2026-06-20", status: "gerado", sizeKb: 380 },
    { id: "4", type: "executivo", name: "Relatório Executivo — Jun/2026", format: "pdf", date: "2026-06-15", status: "gerado", sizeKb: 890 },
    { id: "5", type: "mensal", name: "Relatório Mensal — Mai/2026", format: "csv", date: "2026-06-01", status: "gerado", sizeKb: 128 },
  ];

  const columns: Column<RecentReport>[] = [
    { header: "Relatório", render: (r) => (
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
          {REPORT_TYPE_CONFIG[r.type].icon}
        </span>
        <span className="font-medium text-graphite-900 dark:text-white">{r.name}</span>
      </div>
    )},
    { header: "Formato", render: (r) => (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-600 dark:bg-graphite-700 dark:text-gray-400">
        {EXPORT_FORMAT_CONFIG[r.format].label}
      </span>
    ), align: "center" as const },
    { header: "Data", render: (r) => <span className="text-sm text-gray-600 dark:text-gray-400">{formatDate(new Date(r.date))}</span> },
    { header: "Status", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REPORT_STATUS_CONFIG[r.status]?.bgClass ?? ""}`}>
        {REPORT_STATUS_CONFIG[r.status]?.label ?? r.status}
      </span>
    ), align: "center" as const },
    { header: "Tamanho", render: (r) => <span className="text-sm text-gray-600 dark:text-gray-400">{r.sizeKb} KB</span>, align: "right" as const },
    { header: "Ações", render: () => (
      <button className="rounded border border-brand-500 px-3 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:border-brand-400 dark:text-brand-400 dark:hover:bg-brand-900/20">
        Baixar
      </button>
    ), align: "center" as const },
  ];

  return <Table columns={columns} data={recent} getKey={(r) => r.id} />;
}

// ── Tab: Histórico ────────────────────────────────────────────────────

function TabHistorico({
  dimension, onChangeDimension, balanceRows, energyResults, recommendations,
}: {
  dimension: HistoryDimension;
  onChangeDimension: (d: HistoryDimension) => void;
  balanceRows: DailyBalanceRow[];
  energyResults: ConsumptionResult[];
  recommendations: Recommendation[];
}) {
  const dimensions = Object.entries(HISTORY_DIMENSION_CONFIG) as Array<[HistoryDimension, typeof HISTORY_DIMENSION_CONFIG[HistoryDimension]]>;

  return (
    <div className="space-y-6">
      {/* Dimension selector */}
      <div className="flex flex-wrap gap-2">
        {dimensions.map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onChangeDimension(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              dimension === key
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-graphite-700 dark:text-gray-400 dark:hover:bg-graphite-600"
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-graphite-900 dark:text-white">
              {HISTORY_DIMENSION_CONFIG[dimension].label}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {HISTORY_DIMENSION_CONFIG[dimension].description}
            </p>
          </div>
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-graphite-600 dark:text-gray-400 dark:hover:bg-graphite-800">
            Exportar CSV
          </button>
        </div>

        {dimension === "irrigacao" && <HistoricoIrrigacao balanceRows={balanceRows} />}
        {dimension === "recomendacao" && <HistoricoRecomendacoes recommendations={recommendations} />}
        {dimension === "agua" && <HistoricoAgua balanceRows={balanceRows} />}
        {dimension === "energia" && <HistoricoEnergia energyResults={energyResults} />}
        {dimension === "custo" && <HistoricoCusto energyResults={energyResults} />}
        {dimension === "clima" && <HistoricoClima />}
      </Card>
    </div>
  );
}

interface IrrigRow { date: string; pivot: string; phase: string; depth: number; armPct: number; deficit: number; etc: number; status: string }

function HistoricoIrrigacao({ balanceRows }: { balanceRows: DailyBalanceRow[] }) {
  const irrigated = useMemo(() => {
    return balanceRows
      .filter((b) => b.irrigationApplied > 0)
      .slice(0, 50)
      .map((b, i) => ({
        date: b.date,
        pivot: PIVOT_NAMES[i % PIVOT_NAMES.length],
        phase: b.phase,
        depth: b.irrigationApplied,
        armPct: b.cad > 0 ? roundTo((b.storedWater / b.cad) * 100, 1) : 0,
        deficit: b.deficit,
        etc: b.etc,
        status: b.waterStatus,
      }));
  }, [balanceRows]);

  const columns: Column<IrrigRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivot}</span> },
    { header: "Fase", render: (r) => r.phase },
    { header: "Lâmina (mm)", render: (r) => formatNumber(r.depth, 1), align: "right" },
    { header: "ARM%", render: (r) => formatPercent(r.armPct), align: "right" },
    { header: "Déficit", render: (r) => formatNumber(r.deficit, 1), align: "right" },
    { header: "ETc", render: (r) => formatNumber(r.etc, 1), align: "right" },
    { header: "Status", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.bgClass ?? ""}`}>
        {WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.label ?? r.status}
      </span>
    )},
  ];

  return <Table columns={columns} data={irrigated} getKey={(r) => `${r.date}-${r.pivot}`} />;
}

function HistoricoRecomendacoes({ recommendations }: { recommendations: Recommendation[] }) {
  const ranked = useMemo(() => rankRecommendations(recommendations), [recommendations]);

  const columns: Column<Recommendation>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivotName}</span> },
    { header: "Prioridade", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CONFIG[r.priority].bgClass}`}>
        {PRIORITY_CONFIG[r.priority].label}
      </span>
    )},
    { header: "Score", render: (r) => formatNumber(r.priorityScore, 1), align: "right" },
    { header: "Status", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OPERATIONAL_STATUS_CONFIG[r.operationalStatus].bgClass}`}>
        {OPERATIONAL_STATUS_CONFIG[r.operationalStatus].label}
      </span>
    )},
    { header: "Lâmina (mm)", render: (r) => formatNumber(r.grossDepth, 1), align: "right" },
    { header: "Volume (m³)", render: (r) => formatNumber(r.volumeM3), align: "right" },
    { header: "Motivo", render: (r) => <span className="max-w-xs truncate text-xs text-gray-500">{r.reason}</span> },
  ];

  return <Table columns={columns} data={ranked} getKey={(r) => r.pivotId} />;
}

interface WaterRow { date: string; pivot: string; et0: number; etc: number; precip: number; irrig: number; arm: number; cad: number; armPct: number; deficit: number; status: string }

function HistoricoAgua({ balanceRows }: { balanceRows: DailyBalanceRow[] }) {
  const waterData = useMemo(() => {
    return balanceRows.slice(0, 50).map((b, i) => ({
      date: b.date,
      pivot: PIVOT_NAMES[i % PIVOT_NAMES.length],
      et0: b.et0,
      etc: b.etc,
      precip: b.precipitation,
      irrig: b.irrigationApplied,
      arm: b.storedWater,
      cad: b.cad,
      armPct: b.cad > 0 ? roundTo((b.storedWater / b.cad) * 100, 1) : 0,
      deficit: b.deficit,
      status: b.waterStatus,
    }));
  }, [balanceRows]);

  const columns: Column<WaterRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivot}</span> },
    { header: "ET₀", render: (r) => formatNumber(r.et0, 1), align: "right" },
    { header: "ETc", render: (r) => formatNumber(r.etc, 1), align: "right" },
    { header: "Chuva", render: (r) => formatNumber(r.precip, 1), align: "right" },
    { header: "Irrigação", render: (r) => formatNumber(r.irrig, 1), align: "right" },
    { header: "ARM/CAD", render: (r) => `${formatNumber(r.arm, 1)}/${formatNumber(r.cad)}`, align: "right" },
    { header: "ARM%", render: (r) => formatPercent(r.armPct), align: "right" },
    { header: "Status", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.bgClass ?? ""}`}>
        {WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.label ?? r.status}
      </span>
    )},
  ];

  return <Table columns={columns} data={waterData} getKey={(r) => `${r.date}-${r.pivot}`} />;
}

function HistoricoEnergia({ energyResults }: { energyResults: ConsumptionResult[] }) {
  const data = useMemo(() => energyResults.slice(0, 50), [energyResults]);

  const columns: Column<ConsumptionResult>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivotName}</span> },
    { header: "Horas", render: (r) => formatNumber(r.operatingHours, 1), align: "right" },
    { header: "Potência", render: (r) => `${formatNumber(r.powerKw)} kW`, align: "right" },
    { header: "Total kWh", render: (r) => formatNumber(r.totalKwh), align: "right" },
    { header: "Ponta", render: (r) => formatNumber(r.peakKwh), align: "right" },
    { header: "F. Ponta", render: (r) => formatNumber(r.offPeakKwh), align: "right" },
    { header: "Custo", render: (r) => formatBRL(r.costTotal), align: "right" },
    { header: "kWh/m³", render: (r) => formatNumber(r.kwhPerM3, 4), align: "right" },
  ];

  return <Table columns={columns} data={data} getKey={(r) => `${r.date}-${r.pivotId}`} />;
}

interface CostRow { date: string; pivot: string; total: number; peak: number; offPeak: number; perMm: number; perHa: number; perM3: number }

function HistoricoCusto({ energyResults }: { energyResults: ConsumptionResult[] }) {
  const data = useMemo<CostRow[]>(() =>
    energyResults.slice(0, 50).map((r) => ({
      date: r.date,
      pivot: r.pivotName,
      total: r.costTotal,
      peak: r.costPeak,
      offPeak: r.costOffPeak,
      perMm: r.costPerMm,
      perHa: r.costPerHa,
      perM3: r.costPerM3,
    })),
    [energyResults]
  );

  const columns: Column<CostRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivot}</span> },
    { header: "Custo Total", render: (r) => formatBRL(r.total), align: "right" },
    { header: "Ponta", render: (r) => formatBRL(r.peak), align: "right" },
    { header: "Fora Ponta", render: (r) => formatBRL(r.offPeak), align: "right" },
    { header: "R$/mm", render: (r) => formatNumber(r.perMm, 2), align: "right" },
    { header: "R$/ha", render: (r) => formatNumber(r.perHa, 2), align: "right" },
    { header: "R$/m³", render: (r) => formatNumber(r.perM3, 4), align: "right" },
  ];

  return <Table columns={columns} data={data} getKey={(r) => `${r.date}-${r.pivot}`} />;
}

interface ClimaRow { date: string; tempMax: number; tempMin: number; tempMean: number; humidity: number; wind: number; radiation: number; precip: number; et0: number }

function HistoricoClima() {
  const data = useMemo<ClimaRow[]>(() => {
    const rows: ClimaRow[] = [];
    const base = new Date(2026, 5, 1);
    for (let d = 0; d < 30; d++) {
      const date = new Date(base);
      date.setDate(date.getDate() + d);
      rows.push({
        date: date.toISOString().split("T")[0],
        tempMax: roundTo(30 + Math.random() * 8, 1),
        tempMin: roundTo(18 + Math.random() * 5, 1),
        tempMean: roundTo(24 + Math.random() * 5, 1),
        humidity: roundTo(40 + Math.random() * 30, 0),
        wind: roundTo(1 + Math.random() * 4, 1),
        radiation: roundTo(15 + Math.random() * 10, 1),
        precip: Math.random() > 0.7 ? roundTo(Math.random() * 25, 1) : 0,
        et0: roundTo(3.5 + Math.random() * 4, 2),
      });
    }
    return rows;
  }, []);

  const columns: Column<ClimaRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "T.Máx (°C)", render: (r) => formatNumber(r.tempMax, 1), align: "right" },
    { header: "T.Mín (°C)", render: (r) => formatNumber(r.tempMin, 1), align: "right" },
    { header: "T.Méd (°C)", render: (r) => formatNumber(r.tempMean, 1), align: "right" },
    { header: "UR (%)", render: (r) => formatNumber(r.humidity, 0), align: "right" },
    { header: "Vento (m/s)", render: (r) => formatNumber(r.wind, 1), align: "right" },
    { header: "Rad. (MJ)", render: (r) => formatNumber(r.radiation, 1), align: "right" },
    { header: "Chuva (mm)", render: (r) => formatNumber(r.precip, 1), align: "right" },
    { header: "ET₀ (mm)", render: (r) => formatNumber(r.et0, 2), align: "right" },
  ];

  return <Table columns={columns} data={data} getKey={(r) => r.date} />;
}

// ── Tab: Comparativos ─────────────────────────────────────────────────

const COMPARATIVE_DIMENSIONS: Array<{ id: ComparativeDimension; label: string }> = [
  { id: "pivo", label: "Pivôs" },
  { id: "cultura", label: "Culturas" },
  { id: "modulo", label: "Módulos" },
  { id: "periodo", label: "Períodos" },
  { id: "safra", label: "Safras" },
  { id: "casa_bomba", label: "Casas de Bomba" },
  { id: "fazenda", label: "Fazendas" },
];

function TabComparativos({
  dimension, onChangeDimension, balanceRows, energyResults,
}: {
  dimension: ComparativeDimension;
  onChangeDimension: (d: ComparativeDimension) => void;
  balanceRows: DailyBalanceRow[];
  energyResults: ConsumptionResult[];
}) {
  const comparativeData = useMemo<ComparativeRow[]>(() => {
    let items: Array<{ key: string; label: string; balanceRows: DailyBalanceRow[]; energyResults: ConsumptionResult[]; areaHa: number }>;

    switch (dimension) {
      case "pivo":
        items = PIVOT_NAMES.map((name, i) => ({
          key: `pivot-${i + 1}`,
          label: name,
          balanceRows: balanceRows.filter((_, idx) => idx % PIVOT_NAMES.length === i),
          energyResults: energyResults.filter((r) => r.pivotId === `pivot-${i + 1}`),
          areaHa: 50 + i * 10,
        }));
        break;
      case "cultura":
        items = CULTURE_NAMES.map((name, i) => ({
          key: `culture-${i + 1}`,
          label: name,
          balanceRows: balanceRows.filter((_, idx) => idx % CULTURE_NAMES.length === i),
          energyResults: energyResults.filter((r) => r.cultureId === `culture-${i + 1}`),
          areaHa: 100 + i * 30,
        }));
        break;
      case "modulo":
        items = MODULE_NAMES.map((name, i) => ({
          key: name,
          label: name,
          balanceRows: balanceRows.filter((_, idx) => idx % MODULE_NAMES.length === i),
          energyResults: energyResults.filter((r) => r.moduleName === name),
          areaHa: 150 + i * 20,
        }));
        break;
      case "periodo":
        items = [
          { key: "sem1", label: "Semana 1 (01-07)", balanceRows: balanceRows.filter((b) => parseInt(b.date.slice(8, 10)) <= 7), energyResults: energyResults.filter((r) => parseInt(r.date.slice(8, 10)) <= 7), areaHa: 620 },
          { key: "sem2", label: "Semana 2 (08-14)", balanceRows: balanceRows.filter((b) => { const d = parseInt(b.date.slice(8, 10)); return d >= 8 && d <= 14; }), energyResults: energyResults.filter((r) => { const d = parseInt(r.date.slice(8, 10)); return d >= 8 && d <= 14; }), areaHa: 620 },
          { key: "sem3", label: "Semana 3 (15-21)", balanceRows: balanceRows.filter((b) => { const d = parseInt(b.date.slice(8, 10)); return d >= 15 && d <= 21; }), energyResults: energyResults.filter((r) => { const d = parseInt(r.date.slice(8, 10)); return d >= 15 && d <= 21; }), areaHa: 620 },
          { key: "sem4", label: "Semana 4 (22-30)", balanceRows: balanceRows.filter((b) => parseInt(b.date.slice(8, 10)) >= 22), energyResults: energyResults.filter((r) => parseInt(r.date.slice(8, 10)) >= 22), areaHa: 620 },
        ];
        break;
      case "safra":
        items = [
          { key: "2025", label: "Safra 2024/2025", balanceRows: balanceRows.slice(0, Math.floor(balanceRows.length / 2)), energyResults: energyResults.slice(0, Math.floor(energyResults.length / 2)), areaHa: 600 },
          { key: "2026", label: "Safra 2025/2026", balanceRows: balanceRows.slice(Math.floor(balanceRows.length / 2)), energyResults: energyResults.slice(Math.floor(energyResults.length / 2)), areaHa: 620 },
        ];
        break;
      case "casa_bomba":
        items = [
          { key: "cb1", label: "CB 1", balanceRows: balanceRows.filter((_, i) => i % 2 === 0), energyResults: energyResults.filter((r) => r.pumpHouseId === "pump-1"), areaHa: 310 },
          { key: "cb2", label: "CB 2", balanceRows: balanceRows.filter((_, i) => i % 2 === 1), energyResults: energyResults.filter((r) => r.pumpHouseId === "pump-2"), areaHa: 310 },
        ];
        break;
      case "fazenda":
        items = [
          { key: "faz1", label: "Fazenda Principal", balanceRows, energyResults, areaHa: 620 },
        ];
        break;
      default:
        items = [];
    }

    return generateComparative(items);
  }, [dimension, balanceRows, energyResults]);

  return (
    <div className="space-y-6">
      {/* Dimension selector */}
      <div className="flex flex-wrap gap-2">
        {COMPARATIVE_DIMENSIONS.map((d) => (
          <button
            key={d.id}
            onClick={() => onChangeDimension(d.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              dimension === d.id
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-graphite-700 dark:text-gray-400 dark:hover:bg-graphite-600"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Comparative table */}
      <Card>
        <h3 className="mb-4 text-lg font-semibold text-graphite-900 dark:text-white">
          Comparativo por {COMPARATIVE_DIMENSIONS.find((d) => d.id === dimension)?.label}
        </h3>
        <ComparativeTable data={comparativeData} />
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Custo Total</h4>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dimensionLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="totalCost" name="Custo (R$)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Eficiência</h4>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dimensionLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="irrigationEfficiency" name="Efic. Irrigação (%)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgArmPct" name="ARM médio (%)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">R$/mm e R$/ha</h4>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dimensionLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="costPerMm" name="R$/mm" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="costPerHa" name="R$/ha" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Energia e Volume</h4>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dimensionLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="totalEnergyKwh" name="Energia (kWh)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ComparativeTable({ data }: { data: ComparativeRow[] }) {
  const columns: Column<ComparativeRow>[] = [
    { header: "Dimensão", render: (r) => <span className="font-medium text-graphite-900 dark:text-white">{r.dimensionLabel}</span> },
    { header: "Volume (m³)", render: (r) => formatNumber(r.totalVolumeM3), align: "right" },
    { header: "Energia (kWh)", render: (r) => formatNumber(r.totalEnergyKwh), align: "right" },
    { header: "Custo (R$)", render: (r) => formatBRL(r.totalCost), align: "right" },
    { header: "ARM%", render: (r) => formatPercent(r.avgArmPct), align: "right" },
    { header: "Efic. Irrig.", render: (r) => formatPercent(r.irrigationEfficiency), align: "right" },
    { header: "R$/mm", render: (r) => formatNumber(r.costPerMm, 2), align: "right" },
    { header: "R$/ha", render: (r) => formatNumber(r.costPerHa, 2), align: "right" },
    { header: "kWh/mm", render: (r) => formatNumber(r.kwhPerMm, 2), align: "right" },
    { header: "Dias", render: (r) => `${r.days}`, align: "right" },
  ];

  return <Table columns={columns} data={data} getKey={(r) => r.dimensionKey} />;
}

// ── Tab: Indicadores ──────────────────────────────────────────────────

function TabIndicadores({
  kpis, farmTotals, balanceSummary, byPivot, byCulture,
}: {
  kpis: ReportKPIs;
  farmTotals: ReturnType<typeof calculateFarmTotals>;
  balanceSummary: ReturnType<typeof calculateSummary>;
  byPivot: ReturnType<typeof aggregateByPivot>;
  byCulture: ReturnType<typeof aggregateByCulture>;
}) {
  const kpiCards = [
    { id: "irrig_eff", title: "Eficiência de Irrigação", value: formatPercent(kpis.irrigationEfficiency), description: "ETc / Irrigação aplicada", trend: kpis.irrigationEfficiency > 75 ? "positive" as const : "negative" as const },
    { id: "energy_eff", title: "Eficiência Energética", value: `${formatNumber(kpis.energyEfficiency, 4)} kWh/m³`, description: "Consumo por volume aplicado", trend: kpis.energyEfficiency < 0.5 ? "positive" as const : "negative" as const },
    { id: "water_applied", title: "Água Aplicada", value: `${formatNumber(kpis.totalWaterApplied, 1)} mm`, description: "Total de irrigação no período" },
    { id: "etc_total", title: "ETc Total", value: `${formatNumber(kpis.totalETc, 1)} mm`, description: "Evapotranspiração da cultura" },
    { id: "arm_avg", title: "ARM Médio", value: formatPercent(kpis.avgArm), description: "Armazenamento médio", trend: kpis.avgArm > 60 ? "positive" as const : "negative" as const },
    { id: "deficit_avg", title: "Déficit Médio", value: `${formatNumber(kpis.avgDeficit, 1)} mm`, description: "Déficit hídrico médio", trend: kpis.avgDeficit < 5 ? "positive" as const : "negative" as const },
    { id: "energy_mm", title: "Energia por mm", value: `${formatNumber(kpis.energyPerMm, 2)} kWh`, description: "Consumo energético por mm aplicado" },
    { id: "energy_ha", title: "Energia por ha", value: `${formatNumber(kpis.energyPerHa, 2)} kWh`, description: "Consumo energético por hectare" },
    { id: "cost_mm", title: "Custo por mm", value: `R$ ${formatNumber(kpis.costPerMm, 2)}`, description: "Custo por mm de irrigação" },
    { id: "cost_ha", title: "Custo por ha", value: `R$ ${formatNumber(kpis.costPerHa, 2)}`, description: "Custo por hectare irrigado" },
    { id: "yield", title: "Produtividade Estimada", value: `${formatNumber(kpis.estimatedYield)} sc`, description: "Estimativa baseada no ARM médio", trend: "positive" as const },
  ];

  const radarData = [
    { indicator: "Efic. Irrigação", value: Math.min(100, kpis.irrigationEfficiency) },
    { indicator: "ARM Médio", value: Math.min(100, kpis.avgArm) },
    { indicator: "Cobertura Hídrica", value: Math.min(100, balanceSummary.days > 0 ? ((balanceSummary.days - balanceSummary.daysInDeficit) / balanceSummary.days) * 100 : 0) },
    { indicator: "Efic. Energética", value: Math.min(100, kpis.energyEfficiency < 1 ? (1 - kpis.energyEfficiency) * 100 : 20) },
    { indicator: "Custo Otimizado", value: Math.min(100, farmTotals.peakPct < 20 ? 90 : 100 - farmTotals.peakPct) },
    { indicator: "Produtividade", value: Math.min(100, kpis.estimatedYield > 0 ? 75 : 30) },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </div>

      {/* Radar + Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Índice de Desempenho</h4>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#4b5563" />
                <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#6b7280" />
                <Radar name="Desempenho" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Resumo do Período</h4>
          <div className="space-y-3">
            <SummaryRow label="Dias no período" value={`${balanceSummary.days}`} />
            <SummaryRow label="ETc média diária" value={`${formatNumber(balanceSummary.avgETc, 2)} mm/dia`} />
            <SummaryRow label="ETc total" value={`${formatNumber(balanceSummary.totalETc, 1)} mm`} />
            <SummaryRow label="Precipitação total" value={`${formatNumber(balanceSummary.totalPrecipitation, 1)} mm`} />
            <SummaryRow label="Irrigação total" value={`${formatNumber(balanceSummary.totalIrrigation, 1)} mm`} />
            <SummaryRow label="ARM mínimo" value={`${formatNumber(balanceSummary.minStoredWater, 1)} mm`} />
            <SummaryRow label="Déficit máximo" value={`${formatNumber(balanceSummary.maxDeficit, 1)} mm`} />
            <SummaryRow label="Dias em déficit" value={`${balanceSummary.daysInDeficit}`} highlight={balanceSummary.daysInDeficit > 5} />
            <SummaryRow label="Dias em déficit crítico" value={`${balanceSummary.daysInCritical}`} highlight={balanceSummary.daysInCritical > 0} />
            <SummaryRow label="Energia total" value={`${formatNumber(farmTotals.totalKwh)} kWh`} />
            <SummaryRow label="Custo total" value={formatBRL(farmTotals.totalCost)} />
            <SummaryRow label="Custo projetado/mês" value={formatBRL(farmTotals.projectedMonthlyCost)} />
          </div>
        </Card>
      </div>

      {/* Efficiency by pivot */}
      <Card>
        <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Indicadores por Pivô</h4>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byPivot}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <Tooltip />
              <Legend />
              <Bar dataKey="kwhPerMm" name="kWh/mm" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costPerMm" name="R$/mm" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costPerHa" name="R$/ha" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Efficiency by culture */}
      <Card>
        <h4 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Indicadores por Cultura</h4>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCulture}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <Tooltip />
              <Legend />
              <Bar dataKey="kwhPerMm" name="kWh/mm" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costPerMm" name="R$/mm" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costPerHa" name="R$/ha" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 dark:border-graphite-800">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-semibold ${
        highlight ? "text-red-600 dark:text-red-400" : "text-graphite-900 dark:text-white"
      }`}>
        {value}
      </span>
    </div>
  );
}

// ── Tab: Auditoria ────────────────────────────────────────────────────

function TabAuditoria({ auditLog }: { auditLog: AuditLogEntry[] }) {
  const [filterAction, setFilterAction] = useState<AuditAction | "all">("all");

  const filtered = useMemo(() => {
    if (filterAction === "all") return auditLog;
    return auditLog.filter((e) => e.action === filterAction);
  }, [auditLog, filterAction]);

  const actionStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const entry of auditLog) {
      stats[entry.action] = (stats[entry.action] ?? 0) + 1;
    }
    return stats;
  }, [auditLog]);

  const actions = Object.entries(AUDIT_ACTION_CONFIG) as Array<[AuditAction, typeof AUDIT_ACTION_CONFIG[AuditAction]]>;

  const columns: Column<AuditLogEntry>[] = [
    { header: "Data/Hora", render: (r) => (
      <span className="text-xs text-gray-600 dark:text-gray-400">
        {new Date(r.createdAt).toLocaleString("pt-BR")}
      </span>
    )},
    { header: "Usuário", render: (r) => <span className="font-medium text-graphite-900 dark:text-white">{r.userName}</span> },
    { header: "Ação", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AUDIT_ACTION_CONFIG[r.action].bgClass}`}>
        {AUDIT_ACTION_CONFIG[r.action].label}
      </span>
    )},
    { header: "Entidade", render: (r) => (
      <div>
        <span className="text-xs uppercase text-gray-500 dark:text-gray-400">{r.entityType}</span>
        <p className="text-sm text-graphite-900 dark:text-white">{r.entityName}</p>
      </div>
    )},
    { header: "Alterações", render: (r) => {
      const keys = Object.keys(r.changes);
      if (keys.length === 0) return <span className="text-xs text-gray-400">—</span>;
      return (
        <div className="max-w-xs">
          {keys.slice(0, 2).map((k) => (
            <p key={k} className="truncate text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">{k}:</span> {String((r.changes[k] as Record<string, unknown>).from)} → {String((r.changes[k] as Record<string, unknown>).to)}
            </p>
          ))}
          {keys.length > 2 && <p className="text-xs text-gray-400">+{keys.length - 2} mais</p>}
        </div>
      );
    }},
    { header: "IP", render: (r) => <span className="text-xs text-gray-400">{r.ipAddress}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {actions.slice(0, 6).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterAction(filterAction === key ? "all" : key)}
            className={`rounded-lg border p-3 text-center transition-all ${
              filterAction === key
                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                : "border-gray-200 hover:border-gray-300 dark:border-graphite-700 dark:hover:border-graphite-600"
            }`}
          >
            <p className="text-lg font-bold text-graphite-900 dark:text-white">{actionStats[key] ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{cfg.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-graphite-900 dark:text-white">Log de Auditoria</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filtered.length} registro(s) {filterAction !== "all" ? `— filtrado por: ${AUDIT_ACTION_CONFIG[filterAction].label}` : ""}
            </p>
          </div>
          {filterAction !== "all" && (
            <button
              onClick={() => setFilterAction("all")}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-graphite-600 dark:text-gray-400 dark:hover:bg-graphite-800"
            >
              Limpar filtro
            </button>
          )}
        </div>
        <Table columns={columns} data={filtered} getKey={(r) => r.id} />
      </Card>

      {/* Timeline */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Atividade Recente</h3>
        <div className="space-y-3">
          {auditLog.slice(0, 10).map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 border-b border-gray-100 pb-3 dark:border-graphite-800">
              <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${AUDIT_ACTION_CONFIG[entry.action].bgClass}`}>
                {entry.action.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-graphite-900 dark:text-white">
                  <span className="font-medium">{entry.userName}</span>
                  {" "}{AUDIT_ACTION_CONFIG[entry.action].label.toLowerCase()}{" "}
                  <span className="font-medium">{entry.entityName}</span>
                  {" "}({entry.entityType})
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(entry.createdAt).toLocaleString("pt-BR")} — IP: {entry.ipAddress}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
