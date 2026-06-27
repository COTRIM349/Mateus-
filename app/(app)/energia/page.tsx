"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, Table, type Column, ChartCard } from "@/components/ui";
import {
  type ConsumptionResult,
  type TariffConfig,
  type DemandAnalysis,
  type AggregatedConsumption,
  type EnergySimulation,
  type EnergySuggestion,
  type HourlyCostProfile,
  type FarmEnergyTotals,
  calculateConsumption,
  calculateFarmTotals,
  aggregateByPivot,
  aggregateByPumpHouse,
  aggregateByCulture,
  aggregateByModule,
  aggregateByDate,
  aggregateByMonth,
  analyzeDemand,
  simulateEnergyScenarios,
  generateEnergySuggestions,
  buildHourlyCostProfile,
  DEMAND_RISK_CONFIG,
  TARIFF_TYPE_CONFIG,
} from "@/modules/energy/services";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";

// ── Demo Data ──────────────────────────────────────────────────────────

const DEMO_TARIFF: TariffConfig = {
  tariffType: "verde",
  ratePeak: 1.2845,
  rateOffPeak: 0.4523,
  rateReserved: 0.32,
  demandRate: 42.5,
  peakStart: 18,
  peakEnd: 21,
  contractedDemandKw: 500,
};

function generateDemoConsumption(): ConsumptionResult[] {
  const pivots = [
    { id: "p1", name: "Pivô Central 1", pump: "ph1", pumpName: "CB-01", culture: "Soja", cultureId: "c1", module: "Módulo A", area: 120, power: 150 },
    { id: "p2", name: "Pivô Central 2", pump: "ph1", pumpName: "CB-01", culture: "Soja", cultureId: "c1", module: "Módulo A", area: 95, power: 120 },
    { id: "p3", name: "Pivô Leste 1", pump: "ph2", pumpName: "CB-02", culture: "Milho", cultureId: "c2", module: "Módulo B", area: 80, power: 100 },
    { id: "p4", name: "Pivô Leste 2", pump: "ph2", pumpName: "CB-02", culture: "Milho", cultureId: "c2", module: "Módulo B", area: 110, power: 130 },
    { id: "p5", name: "Pivô Norte 1", pump: "ph3", pumpName: "CB-03", culture: "Feijão", cultureId: "c3", module: "Módulo C", area: 65, power: 85 },
    { id: "p6", name: "Pivô Sul 1", pump: "ph1", pumpName: "CB-01", culture: "Algodão", cultureId: "c4", module: "Módulo A", area: 140, power: 160 },
  ];

  const results: ConsumptionResult[] = [];
  const baseDate = new Date("2025-06-01");

  for (let day = 0; day < 30; day++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];

    for (const p of pivots) {
      if (Math.random() < 0.35) continue;

      const hours = 3 + Math.random() * 8;
      const vol = p.area * (2 + Math.random() * 4) * 10;
      const depth = (vol / (p.area * 10));
      const startH = Math.random() < 0.7 ? 5 + Math.floor(Math.random() * 10) : 18 + Math.floor(Math.random() * 3);
      const endH = Math.min(23, startH + Math.ceil(hours));

      results.push(
        calculateConsumption(
          {
            pivotId: p.id,
            pivotName: p.name,
            pumpHouseId: p.pump,
            pumpHouseName: p.pumpName,
            cultureName: p.culture,
            cultureId: p.cultureId,
            seasonId: "s1",
            moduleName: p.module,
            area: p.area,
            pumpPowerCv: p.power,
            pumpPowerKw: 0,
            motorEfficiency: 0.85,
            operatingHours: roundTo2(hours),
            volumeM3: roundTo2(vol),
            depthMm: roundTo2(depth),
            startTime: `${String(startH).padStart(2, "0")}:00`,
            endTime: `${String(endH).padStart(2, "0")}:00`,
            date: dateStr,
          },
          DEMO_TARIFF
        )
      );
    }
  }

  return results;
}

function roundTo2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Tabs ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "centro", label: "Centro de Energia" },
  { id: "consumo", label: "Consumo" },
  { id: "demanda", label: "Demanda" },
  { id: "simulacoes", label: "Simulações" },
  { id: "inteligencia", label: "Inteligência" },
];

const PIE_COLORS = ["#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── Page ────────────────────────────────────────────────────────────────

export default function EnergiaPage() {
  const [activeTab, setActiveTab] = useState("centro");
  const [viewMode, setViewMode] = useState<"pivot" | "pump" | "culture" | "module">("pivot");

  const consumption = useMemo(() => generateDemoConsumption(), []);

  const farmTotals = useMemo(
    () => calculateFarmTotals(consumption, DEMO_TARIFF.contractedDemandKw, DEMO_TARIFF.demandRate, 30),
    [consumption]
  );

  const demand = useMemo(
    () => analyzeDemand(consumption, DEMO_TARIFF, [420, 435, 460, 480]),
    [consumption]
  );

  const simulations = useMemo(
    () => simulateEnergyScenarios(consumption, DEMO_TARIFF),
    [consumption]
  );

  const suggestions = useMemo(
    () => generateEnergySuggestions(consumption, DEMO_TARIFF, demand),
    [consumption, demand]
  );

  const hourlyCost = useMemo(() => buildHourlyCostProfile(DEMO_TARIFF), []);

  const aggregated = useMemo(() => {
    switch (viewMode) {
      case "pivot": return aggregateByPivot(consumption);
      case "pump": return aggregateByPumpHouse(consumption);
      case "culture": return aggregateByCulture(consumption);
      case "module": return aggregateByModule(consumption);
    }
  }, [consumption, viewMode]);

  const dailyAgg = useMemo(() => aggregateByDate(consumption), [consumption]);
  const monthlyAgg = useMemo(() => aggregateByMonth(consumption), [consumption]);
  const cultureAgg = useMemo(() => aggregateByCulture(consumption), [consumption]);

  return (
    <div>
      <PageHeader titulo="Centro de Energia" descricao="Gestão energética completa para irrigação" />

      <div className="mt-6 space-y-6">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "centro" && (
          <CentroTab
            totals={farmTotals}
            demand={demand}
            dailyAgg={dailyAgg}
            cultureAgg={cultureAgg}
            hourlyCost={hourlyCost}
          />
        )}

        {activeTab === "consumo" && (
          <ConsumoTab
            aggregated={aggregated}
            viewMode={viewMode}
            setViewMode={setViewMode}
            monthlyAgg={monthlyAgg}
          />
        )}

        {activeTab === "demanda" && (
          <DemandaTab demand={demand} dailyAgg={dailyAgg} />
        )}

        {activeTab === "simulacoes" && (
          <SimulacoesTab simulations={simulations} />
        )}

        {activeTab === "inteligencia" && (
          <InteligenciaTab suggestions={suggestions} />
        )}
      </div>
    </div>
  );
}

// ── Centro Tab ─────────────────────────────────────────────────────────

function CentroTab({
  totals,
  demand,
  dailyAgg,
  cultureAgg,
  hourlyCost,
}: {
  totals: FarmEnergyTotals;
  demand: DemandAnalysis;
  dailyAgg: AggregatedConsumption[];
  cultureAgg: AggregatedConsumption[];
  hourlyCost: HourlyCostProfile[];
}) {
  const metrics = [
    { id: "kwh", title: "Consumo Total", value: `${totals.totalKwh.toLocaleString("pt-BR")} kWh`, description: `${totals.pivotCount} pivôs operando`, variation: `${totals.peakPct.toFixed(0)}% ponta`, trend: totals.peakPct > 20 ? "negative" as const : "positive" as const },
    { id: "cost", title: "Custo Total", value: `R$ ${totals.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, description: "Consumo + demanda", variation: `R$ ${totals.avgDailyCost.toFixed(2)}/dia`, trend: "neutral" as const },
    { id: "volume", title: "Volume Irrigado", value: `${totals.totalVolumeM3.toLocaleString("pt-BR")} m³`, description: `${totals.totalHours.toFixed(0)}h de operação`, variation: `${totals.kwhPerM3.toFixed(3)} kWh/m³`, trend: "neutral" as const },
    { id: "demand", title: "Demanda de Pico", value: `${demand.peakDemandKw.toFixed(0)} kW`, description: `Contratada: ${demand.contractedDemandKw.toFixed(0)} kW`, variation: `Margem: ${demand.demandMarginPct.toFixed(0)}%`, trend: demand.demandMarginPct > 15 ? "positive" as const : "negative" as const },
    { id: "proj", title: "Custo Mensal Previsto", value: `R$ ${totals.projectedMonthlyCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, description: "Projeção 30 dias", variation: `+ R$ ${totals.demandCost.toFixed(2)} demanda`, trend: "neutral" as const },
    { id: "eff", title: "Eficiência Energética", value: `${totals.kwhPerHa.toFixed(1)} kWh/ha`, description: `R$ ${totals.costPerHa.toFixed(2)}/ha`, variation: `R$ ${totals.costPerMm.toFixed(2)}/mm`, trend: "neutral" as const },
  ];

  const riskConf = DEMAND_RISK_CONFIG[demand.riskLevel];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-graphite-900 dark:text-white">Risco de Demanda:</span>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${riskConf.bgClass}`}>
          {riskConf.label}
        </span>
        {demand.exceedsContracted && (
          <span className="text-xs text-red-600 dark:text-red-400">
            Multa estimada: R$ {demand.penaltyRisk.toFixed(2)}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Consumo Diário" subtitle="kWh por dia (ponta vs fora de ponta)">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyAgg.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => v.toFixed(1)} />
              <Legend />
              <Bar dataKey="offPeakKwh" name="Fora Ponta" fill="#22c55e" stackId="kwh" />
              <Bar dataKey="peakKwh" name="Ponta" fill="#ef4444" stackId="kwh" />
              <Line dataKey="totalCost" name="Custo (R$)" stroke="#f59e0b" yAxisId={0} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consumo por Cultura" subtitle="Distribuição de energia entre culturas">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={cultureAgg}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="totalKwh"
                nameKey="groupLabel"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {cultureAgg.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toFixed(1)} kWh`} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Perfil Tarifário Horário" subtitle="Custo por hora do dia">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyCost}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(4)}/kWh`} />
              <Bar dataKey="rate" name="Tarifa" fill="#3b82f6">
                {hourlyCost.map((entry, i) => (
                  <Cell key={i} fill={entry.isPeak ? "#ef4444" : "#22c55e"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Custo Diário Acumulado" subtitle="R$/dia ao longo do período">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyAgg.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
              <Area dataKey="totalCost" name="Custo" fill="#3b82f6" fillOpacity={0.2} stroke="#3b82f6" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Indicadores de Eficiência</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            { label: "kWh/m³", value: totals.kwhPerM3.toFixed(3) },
            { label: "kWh/mm", value: totals.kwhPerMm.toFixed(2) },
            { label: "kWh/ha", value: totals.kwhPerHa.toFixed(1) },
            { label: "R$/m³", value: totals.costPerM3.toFixed(3) },
            { label: "R$/ha", value: totals.costPerHa.toFixed(2) },
          ].map((ind) => (
            <div key={ind.label} className="rounded-lg bg-gray-50 p-3 text-center dark:bg-graphite-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">{ind.label}</p>
              <p className="mt-1 text-lg font-bold text-graphite-900 dark:text-white">{ind.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Consumo Tab ────────────────────────────────────────────────────────

function ConsumoTab({
  aggregated,
  viewMode,
  setViewMode,
  monthlyAgg,
}: {
  aggregated: AggregatedConsumption[];
  viewMode: string;
  setViewMode: (v: "pivot" | "pump" | "culture" | "module") => void;
  monthlyAgg: AggregatedConsumption[];
}) {
  const columns: Column<AggregatedConsumption>[] = [
    { header: "Agrupamento", render: (r) => <span className="font-medium">{r.groupLabel}</span> },
    { header: "kWh", render: (r) => r.totalKwh.toLocaleString("pt-BR"), align: "right" },
    { header: "Custo (R$)", render: (r) => r.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: "right" },
    { header: "Volume (m³)", render: (r) => r.totalVolumeM3.toLocaleString("pt-BR"), align: "right" },
    { header: "Horas", render: (r) => r.totalHours.toFixed(1), align: "right" },
    { header: "Ponta %", render: (r) => <span className={r.peakPct > 20 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>{r.peakPct.toFixed(1)}%</span>, align: "right" },
    { header: "kWh/m³", render: (r) => r.kwhPerM3.toFixed(3), align: "right" },
    { header: "kWh/ha", render: (r) => r.kwhPerHa.toFixed(1), align: "right" },
    { header: "R$/ha", render: (r) => r.costPerHa.toFixed(2), align: "right" },
    { header: "R$/m³", render: (r) => r.costPerM3.toFixed(3), align: "right" },
  ];

  const viewOptions: { value: "pivot" | "pump" | "culture" | "module"; label: string }[] = [
    { value: "pivot", label: "Por Pivô" },
    { value: "pump", label: "Por Casa de Bomba" },
    { value: "culture", label: "Por Cultura" },
    { value: "module", label: "Por Módulo" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-graphite-900 dark:text-white">Visualizar:</span>
        {viewOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setViewMode(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === opt.value
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-graphite-700 dark:text-gray-300 dark:hover:bg-graphite-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">
          Consumo {viewOptions.find((v) => v.value === viewMode)?.label}
        </h3>
        <Table columns={columns} data={aggregated} getKey={(r) => r.groupKey} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Comparação de Consumo" subtitle={`kWh ${viewOptions.find((v) => v.value === viewMode)?.label}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={aggregated}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => v.toFixed(1)} />
              <Legend />
              <Bar dataKey="offPeakKwh" name="Fora Ponta" fill="#22c55e" stackId="kwh" />
              <Bar dataKey="peakKwh" name="Ponta" fill="#ef4444" stackId="kwh" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consumo Mensal" subtitle="Evolução mensal de consumo e custo">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyAgg}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="totalKwh" name="kWh" fill="#3b82f6" yAxisId="left" />
              <Line dataKey="totalCost" name="Custo (R$)" stroke="#f59e0b" yAxisId="right" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ── Demanda Tab ────────────────────────────────────────────────────────

function DemandaTab({
  demand,
  dailyAgg,
}: {
  demand: DemandAnalysis;
  dailyAgg: AggregatedConsumption[];
}) {
  const riskConf = DEMAND_RISK_CONFIG[demand.riskLevel];
  const trendLabel = demand.demandTrend === "subindo" ? "Subindo" : demand.demandTrend === "descendo" ? "Descendo" : "Estável";

  const demandMetrics = [
    { id: "contracted", title: "Demanda Contratada", value: `${demand.contractedDemandKw.toFixed(0)} kW`, description: "Contrato vigente" },
    { id: "measured", title: "Demanda Medida", value: `${demand.measuredDemandKw.toFixed(0)} kW`, description: "Média do período" },
    { id: "peak", title: "Pico de Demanda", value: `${demand.peakDemandKw.toFixed(0)} kW`, description: "Máxima registrada", variation: demand.exceedsContracted ? "EXCEDE" : "OK", trend: demand.exceedsContracted ? "negative" as const : "positive" as const },
    { id: "margin", title: "Folga de Demanda", value: `${demand.demandMarginKw.toFixed(0)} kW`, description: `${demand.demandMarginPct.toFixed(1)}% de margem`, variation: riskConf.label, trend: demand.demandMarginPct > 15 ? "positive" as const : "negative" as const },
    { id: "projection", title: "Projeção", value: `${demand.projectedDemandKw.toFixed(0)} kW`, description: `Tendência: ${trendLabel}` },
    { id: "penalty", title: "Risco de Multa", value: demand.penaltyRisk > 0 ? `R$ ${demand.penaltyRisk.toFixed(2)}` : "Sem risco", description: demand.exceedsContracted ? "Ultrapassagem detectada" : "Dentro do contrato", trend: demand.penaltyRisk > 0 ? "negative" as const : "positive" as const },
  ];

  const demandChart = dailyAgg.map((d) => ({
    ...d,
    estimatedDemandKw: d.totalHours > 0 ? roundTo2(d.totalKwh / d.totalHours) : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {demandMetrics.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Indicador de Demanda</h3>
        <div className="relative h-8 overflow-hidden rounded-full bg-gray-200 dark:bg-graphite-700">
          <div
            className={`h-full transition-all ${demand.exceedsContracted ? "bg-red-500" : demand.demandMarginPct < 15 ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${Math.min(100, (demand.peakDemandKw / Math.max(1, demand.contractedDemandKw)) * 100)}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold text-white">
            <span>0 kW</span>
            <span>{demand.contractedDemandKw.toFixed(0)} kW (contratada)</span>
          </div>
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Pico: {demand.peakDemandKw.toFixed(0)} kW</span>
          <span>Utilização: {demand.contractedDemandKw > 0 ? ((demand.peakDemandKw / demand.contractedDemandKw) * 100).toFixed(0) : 0}%</span>
        </div>
      </Card>

      <ChartCard title="Demanda Estimada Diária" subtitle="kW médio por dia vs contratada">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={demandChart.slice(-30)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} interval={4} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => `${v.toFixed(0)} kW`} />
            <Legend />
            <Bar dataKey="estimatedDemandKw" name="Demanda (kW)" fill="#3b82f6" />
            <ReferenceLine y={demand.contractedDemandKw} stroke="#ef4444" strokeDasharray="5 5" label={{ value: "Contratada", position: "right", fill: "#ef4444", fontSize: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Simulações Tab ─────────────────────────────────────────────────────

function SimulacoesTab({ simulations }: { simulations: EnergySimulation[] }) {
  const base = simulations[0];

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Cenários de Otimização Energética</h3>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Compare diferentes estratégias operacionais para otimizar o custo energético da irrigação.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {simulations.map((sim, i) => (
            <div
              key={sim.name}
              className={`rounded-xl border p-4 ${
                i === 0
                  ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20"
                  : sim.savingsCost > 0
                    ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20"
                    : "border-gray-200 bg-white dark:border-graphite-700 dark:bg-graphite-800"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-graphite-900 dark:text-white">{sim.name}</h4>
                {i === 0 && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">
                    Atual
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{sim.description}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Consumo:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">{sim.totalKwh.toLocaleString("pt-BR")} kWh</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Custo:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">R$ {sim.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Ponta/Fora:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">{sim.peakKwh.toFixed(0)} / {sim.offPeakKwh.toFixed(0)} kWh</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Demanda:</span>
                  <span className={`font-medium ${sim.exceedsContracted ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    {sim.demandKw.toFixed(0)} kW {sim.exceedsContracted ? "(EXCEDE)" : ""}
                  </span>
                </div>
              </div>

              {sim.savingsCost > 0 && (
                <div className="mt-3 rounded-lg bg-green-100 p-2 text-center dark:bg-green-900/30">
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                    Economia: R$ {sim.savingsCost.toFixed(2)} ({sim.savingsPct.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <ChartCard title="Comparação de Cenários" subtitle="Custo total por cenário">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={simulations}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
            <Legend />
            <Bar dataKey="peakCost" name="Custo Ponta" fill="#ef4444" stackId="cost" />
            <Bar dataKey="offPeakCost" name="Custo Fora Ponta" fill="#22c55e" stackId="cost" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Inteligência Tab ───────────────────────────────────────────────────

function InteligenciaTab({ suggestions }: { suggestions: EnergySuggestion[] }) {
  const impactColors = {
    alto: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20",
    medio: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20",
    baixo: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20",
  };

  const impactBadge = {
    alto: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medio: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    baixo: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };

  const typeLabels = {
    horario: "Horário",
    potencia: "Potência",
    operacao: "Operação",
    economia: "Economia",
    demanda: "Demanda",
  };

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-graphite-900 dark:text-white">Sugestões Inteligentes</h3>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Recomendações automáticas para otimizar o custo energético da sua irrigação.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {suggestions.map((sug, i) => (
          <div key={i} className={`rounded-xl border p-4 ${impactColors[sug.impact]}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-graphite-700 dark:text-gray-300">
                  {typeLabels[sug.type]}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${impactBadge[sug.impact]}`}>
                  Impacto {sug.impact}
                </span>
              </div>
              {sug.actionable && (
                <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Acionável</span>
              )}
            </div>

            <h4 className="mb-2 text-sm font-semibold text-graphite-900 dark:text-white">{sug.title}</h4>
            <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">{sug.description}</p>

            {sug.estimatedSavings > 0 && (
              <div className="flex items-center gap-3 rounded-lg bg-white/60 p-2 dark:bg-graphite-800/60">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Economia estimada</p>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">
                    R$ {sug.estimatedSavings.toFixed(2)}
                  </p>
                </div>
                {sug.estimatedSavingsPct > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Redução</p>
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">
                      {sug.estimatedSavingsPct.toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Resumo de Otimização</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <p className="text-xs text-gray-500 dark:text-gray-400">Economia potencial total</p>
            <p className="mt-1 text-lg font-bold text-green-600 dark:text-green-400">
              R$ {suggestions.reduce((s, sug) => s + sug.estimatedSavings, 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <p className="text-xs text-gray-500 dark:text-gray-400">Sugestões acionáveis</p>
            <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">
              {suggestions.filter((s) => s.actionable).length}
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
            <p className="text-xs text-gray-500 dark:text-gray-400">Impacto alto</p>
            <p className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">
              {suggestions.filter((s) => s.impact === "alto").length}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
