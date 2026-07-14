"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, Table, type Column, EmptyState } from "@/components/ui";
import { formatBRL, formatNumber, formatPercent, formatDate } from "@/utils/format";
import { roundTo, sum } from "@/utils/math";
import { useAuth } from "@/components/providers";
import { useCrud, useRecharts } from "@/lib/hooks";
import {
  type DailyBalanceRow,
  calculateSummary,
  WATER_STATUS_CONFIG,
} from "@/modules/water-balance/services";
import {
  type Recommendation,
  rankRecommendations,
  OPERATIONAL_STATUS_CONFIG,
  PRIORITY_CONFIG,
} from "@/modules/recommendation/services";
import {
  type ConsumptionResult,
  calculateFarmTotals,
  aggregateByPivot,
  aggregateByCulture,
  aggregateByModule,
  aggregateByDate,
} from "@/modules/energy/services";
import {
  type ReportType,
  type ExportFormat,
  type HistoryDimension,
  type AuditAction,
  type AuditLogEntry,
  type ReportKPIs,
  REPORT_TYPE_CONFIG,
  EXPORT_FORMAT_CONFIG,
  AUDIT_ACTION_CONFIG,
  HISTORY_DIMENSION_CONFIG,
  REPORT_STATUS_CONFIG,
  calculateReportKPIs,
  calculatePeriodSummary,
} from "@/modules/reports/services";

// ── Types ──────────────────────────────────────────────────────────────

interface WaterBalanceRecord {
  id: string;
  farm_id: string;
  pivot_id: string;
  date: string;
  phase: string;
  et0: number;
  kc: number;
  etc: number;
  precipitation: number;
  effective_precipitation: number;
  irrigation_applied: number;
  root_depth: number;
  cad: number;
  afd: number;
  stored_water: number;
  depletion_factor: number;
  deficit: number;
  surplus: number;
  net_depth: number;
  gross_depth: number;
  volume_needed: number;
  irrigation_time: number;
  water_status: string;
}

interface EnergyConsumptionRecord {
  id: string;
  farm_id: string;
  pivot_id: string;
  pivot_name: string | null;
  pump_house_id: string | null;
  pump_house_name: string | null;
  culture_name: string | null;
  culture_id: string | null;
  season_id: string | null;
  module_name: string | null;
  area: number;
  date: string;
  operating_hours: number;
  power_kw: number;
  total_kwh: number;
  peak_kwh: number;
  off_peak_kwh: number;
  cost_peak: number;
  cost_off_peak: number;
  cost_total: number;
  demand_kw: number;
  volume_m3: number;
  depth_mm: number;
}

interface RecommendationRecord {
  id: string;
  farm_id: string;
  pivot_id: string;
  pivot_name: string | null;
  should_irrigate: boolean;
  operational_status: string;
  priority: string;
  priority_score: number;
  productive_risk: number;
  net_depth: number;
  gross_depth: number;
  volume_m3: number;
  irrigation_time_h: number;
  current_arm: number;
  current_cad: number;
  current_afd: number;
  current_deficit: number;
  current_etc: number;
  current_kc: number;
  root_depth: number;
  crop_phase: string;
  depletion_factor: number;
  peak_restricted: boolean;
  recommended_start: string | null;
  reason: string;
  observations: string | null;
}

interface PivotRecord {
  id: string;
  farm_id: string;
  name: string;
  area: number;
  status: string;
}

// ── Converters ─────────────────────────────────────────────────────────

function toBalanceRow(r: WaterBalanceRecord, pivotName: string): DailyBalanceRow {
  return {
    date: r.date,
    phase: r.phase,
    pivotId: r.pivot_id,
    pivotName,
    et0: r.et0,
    kc: r.kc,
    etc: r.etc,
    precipitation: r.precipitation,
    effectivePrecipitation: r.effective_precipitation,
    irrigationApplied: r.irrigation_applied,
    rootDepth: r.root_depth,
    cad: r.cad,
    afd: r.afd,
    storedWater: r.stored_water,
    depletionFactor: r.depletion_factor,
    deficit: r.deficit,
    surplus: r.surplus,
    netDepth: r.net_depth,
    grossDepth: r.gross_depth,
    volumeNeeded: r.volume_needed,
    irrigationTime: r.irrigation_time,
    waterStatus: r.water_status as DailyBalanceRow["waterStatus"],
  };
}

function toConsumptionResult(r: EnergyConsumptionRecord): ConsumptionResult {
  return {
    pivotId: r.pivot_id,
    pivotName: r.pivot_name ?? "—",
    pumpHouseId: r.pump_house_id ?? "",
    pumpHouseName: r.pump_house_name ?? "",
    cultureName: r.culture_name ?? "",
    cultureId: r.culture_id ?? "",
    seasonId: r.season_id ?? "",
    moduleName: r.module_name ?? "",
    area: r.area,
    date: r.date,
    operatingHours: r.operating_hours,
    powerKw: r.power_kw,
    totalKwh: r.total_kwh,
    peakKwh: r.peak_kwh,
    offPeakKwh: r.off_peak_kwh,
    costPeak: r.cost_peak,
    costOffPeak: r.cost_off_peak,
    costTotal: r.cost_total,
    demandKw: r.demand_kw,
    volumeM3: r.volume_m3,
    depthMm: r.depth_mm,
    kwhPerM3: r.volume_m3 > 0 ? r.total_kwh / r.volume_m3 : 0,
    kwhPerMm: r.depth_mm > 0 ? r.total_kwh / r.depth_mm : 0,
    kwhPerHa: r.area > 0 ? r.total_kwh / r.area : 0,
    costPerM3: r.volume_m3 > 0 ? r.cost_total / r.volume_m3 : 0,
    costPerMm: r.depth_mm > 0 ? r.cost_total / r.depth_mm : 0,
    costPerHa: r.area > 0 ? r.cost_total / r.area : 0,
  };
}

function toRecommendation(r: RecommendationRecord): Recommendation {
  return {
    pivotId: r.pivot_id,
    pivotName: r.pivot_name ?? "—",
    shouldIrrigate: r.should_irrigate,
    operationalStatus: r.operational_status as Recommendation["operationalStatus"],
    priority: r.priority as Recommendation["priority"],
    priorityScore: r.priority_score,
    productiveRisk: r.productive_risk,
    netDepth: r.net_depth,
    grossDepth: r.gross_depth,
    volumeM3: r.volume_m3,
    irrigationTimeH: r.irrigation_time_h,
    currentArm: r.current_arm,
    currentCad: r.current_cad,
    currentAfd: r.current_afd,
    currentDeficit: r.current_deficit,
    currentEtc: r.current_etc,
    currentKc: r.current_kc,
    rootDepth: r.root_depth,
    cropPhase: r.crop_phase,
    depletionFactor: r.depletion_factor,
    peakRestricted: r.peak_restricted,
    recommendedStart: r.recommended_start ?? "—",
    reason: r.reason,
    observations: r.observations ?? "",
  };
}

// ── Chart colors ──────────────────────────────────────────────────────

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

// ── Main component ───────────────────────────────────────────────────

const TABS = [
  { id: "relatorios", label: "Relatórios" },
  { id: "historico", label: "Histórico" },
  { id: "indicadores", label: "Indicadores" },
  { id: "auditoria", label: "Auditoria" },
];

export default function RelatoriosPage() {
  const { activeFarmId } = useAuth();
  const [activeTab, setActiveTab] = useState("relatorios");
  const [selectedReportType, setSelectedReportType] = useState<ReportType>("diario");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [historyDimension, setHistoryDimension] = useState<HistoryDimension>("irrigacao");

  const { data: rawBalances, loading: loadingBalances } = useCrud<WaterBalanceRecord>({
    table: "water_balances",
    orderBy: "date",
    ascending: false,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: rawEnergy, loading: loadingEnergy } = useCrud<EnergyConsumptionRecord>({
    table: "energy_consumption",
    orderBy: "date",
    ascending: false,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: rawRecommendations, loading: loadingRecs } = useCrud<RecommendationRecord>({
    table: "irrigation_recommendations",
    orderBy: "created_at",
    ascending: false,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: rawAuditLog, loading: loadingAudit } = useCrud<AuditLogEntry>({
    table: "audit_log",
    orderBy: "created_at",
    ascending: false,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: pivots, loading: loadingPivots } = useCrud<PivotRecord>({
    table: "pivots",
    filters: { farm_id: activeFarmId ?? null },
  });

  const pivotNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of pivots) map[p.id] = p.name;
    return map;
  }, [pivots]);

  const balanceRows = useMemo(() => rawBalances.map((r) => toBalanceRow(r, pivotNameMap[r.pivot_id] ?? "—")), [rawBalances, pivotNameMap]);
  const energyResults = useMemo(() => rawEnergy.map(toConsumptionResult), [rawEnergy]);
  const recommendations = useMemo(() => rawRecommendations.map(toRecommendation), [rawRecommendations]);

  const loading = loadingBalances || loadingEnergy || loadingRecs || loadingAudit || loadingPivots;
  const hasAnyData = balanceRows.length > 0 || energyResults.length > 0 || recommendations.length > 0;

  const totalArea = useMemo(() => {
    const pivotAreas: Record<string, number> = {};
    for (const r of energyResults) pivotAreas[r.pivotId] = r.area;
    if (Object.keys(pivotAreas).length === 0) {
      for (const p of pivots) pivotAreas[p.id] = p.area;
    }
    return sum(Object.values(pivotAreas));
  }, [energyResults, pivots]);

  const kpis = useMemo(
    () => hasAnyData ? calculateReportKPIs(balanceRows, energyResults, totalArea) : null,
    [balanceRows, energyResults, totalArea, hasAnyData]
  );

  const farmTotals = useMemo(() => {
    if (energyResults.length === 0) return null;
    const days = new Set(energyResults.map((r) => r.date)).size || 1;
    return calculateFarmTotals(energyResults, 0, 0, days);
  }, [energyResults]);

  const byPivot = useMemo(() => energyResults.length > 0 ? aggregateByPivot(energyResults) : [], [energyResults]);
  const byCulture = useMemo(() => energyResults.length > 0 ? aggregateByCulture(energyResults) : [], [energyResults]);
  const balanceSummary = useMemo(() => balanceRows.length > 0 ? calculateSummary(balanceRows) : null, [balanceRows]);
  const recharts = useRecharts();

  if (loading || !recharts) {
    return (
      <div>
        <PageHeader titulo="Relatórios Inteligentes" descricao="Relatórios, histórico, indicadores e auditoria" />
        <div className="mt-8 flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" />
        </div>
      </div>
    );
  }

  if (!hasAnyData && rawAuditLog.length === 0) {
    return (
      <div>
        <PageHeader titulo="Relatórios Inteligentes" descricao="Relatórios, histórico, indicadores e auditoria" />
        <div className="mt-6">
          <EmptyState
            title="Nenhum dado disponível para relatórios"
            description="Os relatórios serão gerados automaticamente a partir dos registros operacionais. Cadastre pivôs e registre dados de irrigação, balanço hídrico e consumo energético para gerar relatórios completos."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader titulo="Relatórios Inteligentes" descricao="Relatórios, histórico, indicadores e auditoria" />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "relatorios" && (
          <div className="animate-in"><TabRelatorios
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
          /></div>
        )}
        {activeTab === "historico" && (
          <div className="animate-in"><TabHistorico
            dimension={historyDimension}
            onChangeDimension={setHistoryDimension}
            balanceRows={balanceRows}
            energyResults={energyResults}
            recommendations={recommendations}
          /></div>
        )}
        {activeTab === "indicadores" && (
          <div className="animate-in"><TabIndicadores kpis={kpis} farmTotals={farmTotals} balanceSummary={balanceSummary} byPivot={byPivot} byCulture={byCulture} /></div>
        )}
        {activeTab === "auditoria" && <div className="animate-in"><TabAuditoria auditLog={rawAuditLog} /></div>}
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
  farmTotals: ReturnType<typeof calculateFarmTotals> | null;
  kpis: ReportKPIs | null;
  balanceSummary: ReturnType<typeof calculateSummary> | null;
  byPivot: ReturnType<typeof aggregateByPivot>;
  byCulture: ReturnType<typeof aggregateByCulture>;
  recommendations: Recommendation[];
}) {
  const reportTypes = Object.entries(REPORT_TYPE_CONFIG) as Array<[ReportType, typeof REPORT_TYPE_CONFIG[ReportType]]>;
  const formats = Object.entries(EXPORT_FORMAT_CONFIG) as Array<[ExportFormat, typeof EXPORT_FORMAT_CONFIG[ExportFormat]]>;
  const config = REPORT_TYPE_CONFIG[selectedType];

  const hasData = (farmTotals !== null || balanceSummary !== null || recommendations.length > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {reportTypes.map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onSelectType(key)}
            className={`rounded-xl border p-4 text-left transition-all ${
              selectedType === key
                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                : "border-gray-100 hover:border-gray-300 dark:border-graphite-700/50 dark:hover:border-graphite-600"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                selectedType === key
                  ? "bg-brand-500 text-white"
                  : "bg-gray-50/80 text-gray-600 dark:bg-graphite-800/60 dark:text-gray-500"
              }`}>
                {cfg.icon}
              </span>
              <span className="text-sm font-semibold text-graphite-900 dark:text-white">{cfg.label}</span>
            </div>
            <p className="text-xs text-graphite-400 dark:text-gray-500">{cfg.description}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-graphite-900 dark:text-white">{config.label}</h3>
            <p className="text-sm text-graphite-400 dark:text-gray-500">{config.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl border border-gray-100 dark:border-graphite-700/50">
              {formats.map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onSelectFormat(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                    selectedFormat === key
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50/80 dark:text-gray-500 dark:hover:bg-graphite-800/60"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <button
              disabled={!hasData}
              className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Gerar Relatório
            </button>
          </div>
        </div>
      </Card>

      {hasData ? (
        <Card>
          <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">
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
      ) : (
        <EmptyState
          title="Sem dados para pré-visualização"
          description="Registre dados operacionais (balanço hídrico, consumo energético, recomendações) para visualizar relatórios."
        />
      )}
    </div>
  );
}

function ReportPreview({
  type, farmTotals, kpis, balanceSummary, byPivot, byCulture, recommendations,
}: {
  type: ReportType;
  farmTotals: ReturnType<typeof calculateFarmTotals> | null;
  kpis: ReportKPIs | null;
  balanceSummary: ReturnType<typeof calculateSummary> | null;
  byPivot: ReturnType<typeof aggregateByPivot>;
  byCulture: ReturnType<typeof aggregateByCulture>;
  recommendations: Recommendation[];
}) {
  const { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } = useRecharts()!;
  if (!farmTotals && !balanceSummary && recommendations.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sem dados disponíveis para este tipo de relatório.</p>;
  }

  switch (type) {
    case "diario":
    case "por_pivo":
      if (!farmTotals || byPivot.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-400">Sem dados de consumo energético por pivô.</p>;
      }
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKPI label="Pivôs operando" value={`${byPivot.length}`} />
            <MiniKPI label="Volume total" value={`${formatNumber(farmTotals.totalVolumeM3)} m³`} />
            <MiniKPI label="Energia" value={`${formatNumber(farmTotals.totalKwh)} kWh`} />
            <MiniKPI label="Custo total" value={formatBRL(farmTotals.totalCost)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-graphite-700/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-graphite-400">Pivô</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-graphite-400">kWh</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-graphite-400">Custo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-graphite-400">m³</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-graphite-400">Horas</th>
                </tr>
              </thead>
              <tbody>
                {byPivot.slice(0, 10).map((p) => (
                  <tr key={p.groupKey} className="border-b border-gray-100/80 dark:border-graphite-800/60">
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
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MiniKPI label="Registros" value={`${balanceSummary?.days ?? 0}`} />
            <MiniKPI label="Precipitação" value={`${formatNumber(balanceSummary?.totalPrecipitation ?? 0, 1)} mm`} />
            <MiniKPI label="ETc total" value={`${formatNumber(balanceSummary?.totalETc ?? 0, 1)} mm`} />
            <MiniKPI label="Dias em déficit" value={`${balanceSummary?.daysInDeficit ?? 0}`} />
            <MiniKPI label="Custo total" value={formatBRL(farmTotals?.totalCost ?? 0)} />
          </div>
          {byCulture.length > 0 && (
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
          )}
        </div>
      );

    case "por_cultura":
      if (byCulture.length === 0) {
        return <p className="py-8 text-center text-sm text-gray-400">Sem dados de consumo por cultura.</p>;
      }
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {byCulture.map((c) => (
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
    case "financeiro":
      if (!farmTotals) {
        return <p className="py-8 text-center text-sm text-gray-400">Sem dados energéticos/financeiros.</p>;
      }
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MiniKPI label="Total kWh" value={formatNumber(farmTotals.totalKwh)} />
            <MiniKPI label="Ponta" value={`${formatPercent(farmTotals.peakPct)}`} />
            <MiniKPI label="Custo total" value={formatBRL(farmTotals.totalCost)} />
            <MiniKPI label="kWh/m³" value={formatNumber(farmTotals.kwhPerM3, 4)} />
            <MiniKPI label="R$/ha" value={formatNumber(farmTotals.costPerHa, 2)} />
          </div>
          {byPivot.length > 0 && (
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
          )}
        </div>
      );

    case "executivo":
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKPI label="Efic. irrigação" value={kpis ? formatPercent(kpis.irrigationEfficiency) : "—"} />
            <MiniKPI label="ARM médio" value={kpis ? formatPercent(kpis.avgArm) : "—"} />
            <MiniKPI label="Custo/ha" value={kpis ? `R$ ${formatNumber(kpis.costPerHa, 2)}` : "—"} />
            <MiniKPI label="Prod. estimada" value={kpis ? `${formatNumber(kpis.estimatedYield)} sc` : "—"} />
          </div>
          {recommendations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-graphite-400 dark:text-gray-500">Top 5 — Prioridade</p>
              {rankRecommendations(recommendations).slice(0, 5).map((r) => (
                <div key={r.pivotId} className="flex items-center justify-between border-b border-gray-100/80 py-2 dark:border-graphite-800/60">
                  <span className="text-sm text-graphite-900 dark:text-white">{r.pivotName}</span>
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${PRIORITY_CONFIG[r.priority].bgClass}`}>
                    {PRIORITY_CONFIG[r.priority].label} ({r.priorityScore.toFixed(0)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 dark:border-graphite-700/50">
      <p className="text-xs text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="text-lg font-bold tracking-tight text-graphite-900 dark:text-white">{value}</p>
    </div>
  );
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
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {dimensions.map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onChangeDimension(key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              dimension === key
                ? "bg-brand-500 text-white"
                : "bg-gray-50/80 text-gray-600 hover:bg-gray-200 dark:bg-graphite-800/60 dark:text-gray-500 dark:hover:bg-graphite-600"
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-5">
          <h3 className="text-lg font-semibold tracking-tight text-graphite-900 dark:text-white">
            {HISTORY_DIMENSION_CONFIG[dimension].label}
          </h3>
          <p className="text-sm text-graphite-400 dark:text-gray-500">
            {HISTORY_DIMENSION_CONFIG[dimension].description}
          </p>
        </div>

        {dimension === "irrigacao" && <HistoricoIrrigacao balanceRows={balanceRows} />}
        {dimension === "recomendacao" && <HistoricoRecomendacoes recommendations={recommendations} />}
        {dimension === "agua" && <HistoricoAgua balanceRows={balanceRows} />}
        {dimension === "energia" && <HistoricoEnergia energyResults={energyResults} />}
        {dimension === "custo" && <HistoricoCusto energyResults={energyResults} />}
        {dimension === "clima" && (
          <EmptyState title="Sem dados climáticos" description="Os dados climáticos serão exibidos a partir dos registros das estações meteorológicas cadastradas." />
        )}
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
      .map((b) => ({
        date: b.date,
        pivot: b.pivotName ?? "—",
        phase: b.phase,
        depth: b.irrigationApplied,
        armPct: b.cad > 0 ? roundTo((b.storedWater / b.cad) * 100, 1) : 0,
        deficit: b.deficit,
        etc: b.etc,
        status: b.waterStatus,
      }));
  }, [balanceRows]);

  if (irrigated.length === 0) {
    return <EmptyState title="Sem registros de irrigação" description="Nenhum registro de irrigação encontrado. Os dados aparecerão aqui conforme as irrigações forem registradas." />;
  }

  const columns: Column<IrrigRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivot}</span> },
    { header: "Fase", render: (r) => r.phase },
    { header: "Lâmina (mm)", render: (r) => formatNumber(r.depth, 1), align: "right" },
    { header: "ARM%", render: (r) => formatPercent(r.armPct), align: "right" },
    { header: "Déficit", render: (r) => formatNumber(r.deficit, 1), align: "right" },
    { header: "ETc", render: (r) => formatNumber(r.etc, 1), align: "right" },
    { header: "Status", render: (r) => (
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.bgClass ?? ""}`}>
        {WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.label ?? r.status}
      </span>
    )},
  ];

  return <Table columns={columns} data={irrigated} getKey={(r) => `${r.date}-${r.pivot}`} />;
}

function HistoricoRecomendacoes({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return <EmptyState title="Sem recomendações" description="As recomendações de irrigação serão listadas aqui conforme forem geradas pelo sistema." />;
  }

  const ranked = useMemo(() => rankRecommendations(recommendations), [recommendations]);

  const columns: Column<Recommendation>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivotName}</span> },
    { header: "Prioridade", render: (r) => (
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${PRIORITY_CONFIG[r.priority].bgClass}`}>
        {PRIORITY_CONFIG[r.priority].label}
      </span>
    )},
    { header: "Score", render: (r) => formatNumber(r.priorityScore, 1), align: "right" },
    { header: "Status", render: (r) => (
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${OPERATIONAL_STATUS_CONFIG[r.operationalStatus].bgClass}`}>
        {OPERATIONAL_STATUS_CONFIG[r.operationalStatus].label}
      </span>
    )},
    { header: "Lâmina (mm)", render: (r) => formatNumber(r.grossDepth, 1), align: "right" },
    { header: "Volume (m³)", render: (r) => formatNumber(r.volumeM3), align: "right" },
    { header: "Motivo", render: (r) => <span className="max-w-xs truncate text-xs text-graphite-400">{r.reason}</span> },
  ];

  return <Table columns={columns} data={ranked} getKey={(r) => r.pivotId} />;
}

interface WaterRow { date: string; pivot: string; et0: number; etc: number; precip: number; irrig: number; arm: number; cad: number; armPct: number; deficit: number; status: string }

function HistoricoAgua({ balanceRows }: { balanceRows: DailyBalanceRow[] }) {
  if (balanceRows.length === 0) {
    return <EmptyState title="Sem dados de balanço hídrico" description="Os dados do balanço hídrico serão exibidos conforme forem registrados." />;
  }

  const waterData = useMemo(() => {
    return balanceRows.slice(0, 50).map((b) => ({
      date: b.date,
      pivot: b.pivotName ?? "—",
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
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.bgClass ?? ""}`}>
        {WATER_STATUS_CONFIG[r.status as keyof typeof WATER_STATUS_CONFIG]?.label ?? r.status}
      </span>
    )},
  ];

  return <Table columns={columns} data={waterData} getKey={(r) => `${r.date}-${r.pivot}`} />;
}

function HistoricoEnergia({ energyResults }: { energyResults: ConsumptionResult[] }) {
  if (energyResults.length === 0) {
    return <EmptyState title="Sem dados energéticos" description="Os registros de consumo energético serão exibidos aqui conforme forem registrados." />;
  }

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
  if (energyResults.length === 0) {
    return <EmptyState title="Sem dados de custo" description="Os registros de custo serão exibidos aqui conforme forem registrados." />;
  }

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

// ── Tab: Indicadores ──────────────────────────────────────────────────

function TabIndicadores({
  kpis, farmTotals, balanceSummary, byPivot, byCulture,
}: {
  kpis: ReportKPIs | null;
  farmTotals: ReturnType<typeof calculateFarmTotals> | null;
  balanceSummary: ReturnType<typeof calculateSummary> | null;
  byPivot: ReturnType<typeof aggregateByPivot>;
  byCulture: ReturnType<typeof aggregateByCulture>;
}) {
  const { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } = useRecharts()!;
  if (!kpis || (!farmTotals && !balanceSummary)) {
    return <EmptyState title="Sem indicadores disponíveis" description="Registre dados operacionais para visualizar indicadores de desempenho." />;
  }

  const kpiCards = [
    { id: "irrig_eff", title: "Eficiência de Irrigação", value: formatPercent(kpis.irrigationEfficiency), description: "ETc / Irrigação aplicada", trend: kpis.irrigationEfficiency > 75 ? "positive" as const : "negative" as const },
    { id: "energy_eff", title: "Eficiência Energética", value: `${formatNumber(kpis.energyEfficiency, 4)} kWh/m³`, description: "Consumo por volume aplicado" },
    { id: "water_applied", title: "Água Aplicada", value: `${formatNumber(kpis.totalWaterApplied, 1)} mm`, description: "Total de irrigação no período" },
    { id: "etc_total", title: "ETc Total", value: `${formatNumber(kpis.totalETc, 1)} mm`, description: "Evapotranspiração da cultura" },
    { id: "arm_avg", title: "ARM Médio", value: formatPercent(kpis.avgArm), description: "Armazenamento médio", trend: kpis.avgArm > 60 ? "positive" as const : "negative" as const },
    { id: "deficit_avg", title: "Déficit Médio", value: `${formatNumber(kpis.avgDeficit, 1)} mm`, description: "Déficit hídrico médio" },
    { id: "cost_ha", title: "Custo por ha", value: `R$ ${formatNumber(kpis.costPerHa, 2)}`, description: "Custo por hectare irrigado" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </div>

      {balanceSummary && (
        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-tight text-graphite-400 dark:text-gray-500">Resumo do Período</h4>
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
            {farmTotals && (
              <>
                <SummaryRow label="Energia total" value={`${formatNumber(farmTotals.totalKwh)} kWh`} />
                <SummaryRow label="Custo total" value={formatBRL(farmTotals.totalCost)} />
              </>
            )}
          </div>
        </Card>
      )}

      {byPivot.length > 0 && (
        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-tight text-graphite-400 dark:text-gray-500">Indicadores por Pivô</h4>
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
      )}
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100/80 py-2 dark:border-graphite-800/60">
      <span className="text-sm text-gray-600 dark:text-gray-500">{label}</span>
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

  if (auditLog.length === 0) {
    return <EmptyState title="Sem registros de auditoria" description="Os registros de auditoria aparecerão aqui conforme as ações forem realizadas na plataforma." />;
  }

  const columns: Column<AuditLogEntry>[] = [
    { header: "Data/Hora", render: (r) => (
      <span className="text-xs text-gray-600 dark:text-gray-500">
        {new Date(r.createdAt).toLocaleString("pt-BR")}
      </span>
    )},
    { header: "Usuário", render: (r) => <span className="font-medium text-graphite-900 dark:text-white">{r.userName}</span> },
    { header: "Ação", render: (r) => (
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${AUDIT_ACTION_CONFIG[r.action].bgClass}`}>
        {AUDIT_ACTION_CONFIG[r.action].label}
      </span>
    )},
    { header: "Entidade", render: (r) => (
      <div>
        <span className="text-xs uppercase text-graphite-400 dark:text-gray-500">{r.entityType}</span>
        <p className="text-sm text-graphite-900 dark:text-white">{r.entityName}</p>
      </div>
    )},
    { header: "Alterações", render: (r) => {
      const keys = Object.keys(r.changes);
      if (keys.length === 0) return <span className="text-xs text-gray-400">—</span>;
      return (
        <div className="max-w-xs">
          {keys.slice(0, 2).map((k) => (
            <p key={k} className="truncate text-xs text-graphite-400 dark:text-gray-500">
              <span className="font-medium">{k}:</span> {String((r.changes[k] as Record<string, unknown>).from)} → {String((r.changes[k] as Record<string, unknown>).to)}
            </p>
          ))}
          {keys.length > 2 && <p className="text-xs text-gray-400">+{keys.length - 2} mais</p>}
        </div>
      );
    }},
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {actions.slice(0, 6).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterAction(filterAction === key ? "all" : key)}
            className={`rounded-xl border p-3 text-center transition-all ${
              filterAction === key
                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                : "border-gray-100 hover:border-gray-300 dark:border-graphite-700/50 dark:hover:border-graphite-600"
            }`}
          >
            <p className="text-lg font-bold tracking-tight text-graphite-900 dark:text-white">{actionStats[key] ?? 0}</p>
            <p className="text-xs text-graphite-400 dark:text-gray-500">{cfg.label}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-graphite-900 dark:text-white">Log de Auditoria</h3>
            <p className="text-sm text-graphite-400 dark:text-gray-500">
              {filtered.length} registro(s) {filterAction !== "all" ? `— filtrado por: ${AUDIT_ACTION_CONFIG[filterAction].label}` : ""}
            </p>
          </div>
          {filterAction !== "all" && (
            <button
              onClick={() => setFilterAction("all")}
              className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50/80 dark:border-graphite-600 dark:text-gray-500 dark:hover:bg-graphite-800/60"
            >
              Limpar filtro
            </button>
          )}
        </div>
        <Table columns={columns} data={filtered} getKey={(r) => r.id} />
      </Card>
    </div>
  );
}
