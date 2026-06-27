"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, Table, type Column, ChartCard } from "@/components/ui";
import { useAuth } from "@/components/providers";
import {
  type WaterStatus,
  type DailyBalanceRow,
  calculateDailyBalance,
  calculateSummary,
  WATER_STATUS_CONFIG,
} from "@/modules/water-balance/services";
import {
  type Recommendation,
  type PivotContext,
  type OperationalStatus,
  generateRecommendation,
  rankRecommendations,
  OPERATIONAL_STATUS_CONFIG,
  PRIORITY_CONFIG,
} from "@/modules/recommendation/services";
import {
  type ScheduleSlot,
  type DailySchedule,
  generateDailySchedule,
  SLOT_STATUS_CONFIG,
} from "@/modules/scheduling/services";
import {
  type ConsumptionResult,
  type TariffConfig,
  calculateConsumption,
  calculateFarmTotals,
  aggregateByPivot,
  aggregateByCulture,
  analyzeDemand,
} from "@/modules/energy/services";
import { roundTo } from "@/utils/math";
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

// ── Demo Tariff ────────────────────────────────────────────────────────

const TARIFF: TariffConfig = {
  tariffType: "verde",
  ratePeak: 1.2845,
  rateOffPeak: 0.4523,
  rateReserved: 0.32,
  demandRate: 42.5,
  peakStart: 18,
  peakEnd: 21,
  contractedDemandKw: 500,
};

// ── Demo Pivots (integrating all engines) ──────────────────────────────

interface DemoPivot {
  id: string;
  name: string;
  module: string;
  culture: string;
  cultureId: string;
  phase: string;
  area: number;
  flowRate: number;
  pumpPowerCv: number;
  efficiency: number;
  status: string;
  fieldCapacity: number;
  wiltingPoint: number;
  effectiveSoilDepth: number;
  storedWater: number;
  et0: number;
  kc: number;
  rootDepth: number;
  depletionFactor: number;
  daysAfterPlant: number;
  cycleDays: number;
  forecastPrecip: number;
  pumpHouseId: string;
  pumpHouseName: string;
}

const DEMO_PIVOTS: DemoPivot[] = [
  { id: "p1", name: "Pivô 14", module: "Módulo RDM", culture: "Soja", cultureId: "c1", phase: "Floração", area: 92, flowRate: 120, pumpPowerCv: 150, efficiency: 0.85, status: "irrigando", fieldCapacity: 0.35, wiltingPoint: 0.18, effectiveSoilDepth: 600, storedWater: 18, et0: 6.2, kc: 1.15, rootDepth: 0.5, depletionFactor: 0.5, daysAfterPlant: 65, cycleDays: 120, forecastPrecip: 0, pumpHouseId: "ph1", pumpHouseName: "CB-01" },
  { id: "p2", name: "Pivô 126", module: "Módulo M1", culture: "Milho", cultureId: "c2", phase: "Enchimento", area: 110, flowRate: 130, pumpPowerCv: 175, efficiency: 0.82, status: "irrigando", fieldCapacity: 0.33, wiltingPoint: 0.16, effectiveSoilDepth: 550, storedWater: 22, et0: 5.8, kc: 1.1, rootDepth: 0.55, depletionFactor: 0.55, daysAfterPlant: 80, cycleDays: 130, forecastPrecip: 0, pumpHouseId: "ph1", pumpHouseName: "CB-01" },
  { id: "p3", name: "Pivô 31", module: "Módulo M2", culture: "Algodão", cultureId: "c3", phase: "Vegetativo", area: 88, flowRate: 110, pumpPowerCv: 125, efficiency: 0.84, status: "alerta", fieldCapacity: 0.36, wiltingPoint: 0.19, effectiveSoilDepth: 700, storedWater: 12, et0: 6.5, kc: 0.8, rootDepth: 0.35, depletionFactor: 0.45, daysAfterPlant: 40, cycleDays: 160, forecastPrecip: 5, pumpHouseId: "ph2", pumpHouseName: "CB-02" },
  { id: "p4", name: "Pivô 58", module: "Módulo M1", culture: "Soja", cultureId: "c1", phase: "Vegetativo", area: 76, flowRate: 105, pumpPowerCv: 100, efficiency: 0.86, status: "irrigando", fieldCapacity: 0.34, wiltingPoint: 0.17, effectiveSoilDepth: 580, storedWater: 30, et0: 5.5, kc: 0.8, rootDepth: 0.3, depletionFactor: 0.5, daysAfterPlant: 30, cycleDays: 120, forecastPrecip: 0, pumpHouseId: "ph2", pumpHouseName: "CB-02" },
  { id: "p5", name: "Pivô 77", module: "Módulo RDM", culture: "Milho", cultureId: "c2", phase: "Floração", area: 64, flowRate: 95, pumpPowerCv: 100, efficiency: 0.85, status: "irrigando", fieldCapacity: 0.32, wiltingPoint: 0.15, effectiveSoilDepth: 500, storedWater: 14, et0: 6.0, kc: 1.15, rootDepth: 0.5, depletionFactor: 0.55, daysAfterPlant: 70, cycleDays: 130, forecastPrecip: 0, pumpHouseId: "ph1", pumpHouseName: "CB-01" },
  { id: "p6", name: "Pivô 89", module: "Módulo M2", culture: "Feijão", cultureId: "c4", phase: "Floração", area: 41, flowRate: 70, pumpPowerCv: 60, efficiency: 0.88, status: "irrigando", fieldCapacity: 0.30, wiltingPoint: 0.14, effectiveSoilDepth: 450, storedWater: 10, et0: 5.9, kc: 1.1, rootDepth: 0.4, depletionFactor: 0.45, daysAfterPlant: 50, cycleDays: 90, forecastPrecip: 0, pumpHouseId: "ph3", pumpHouseName: "CB-03" },
  { id: "p7", name: "Pivô 102", module: "Módulo M1", culture: "Algodão", cultureId: "c3", phase: "Maturação", area: 95, flowRate: 115, pumpPowerCv: 130, efficiency: 0.83, status: "parado", fieldCapacity: 0.35, wiltingPoint: 0.18, effectiveSoilDepth: 650, storedWater: 55, et0: 4.8, kc: 0.6, rootDepth: 0.6, depletionFactor: 0.5, daysAfterPlant: 140, cycleDays: 160, forecastPrecip: 12, pumpHouseId: "ph2", pumpHouseName: "CB-02" },
  { id: "p8", name: "Pivô 109", module: "Módulo RDM", culture: "Soja", cultureId: "c1", phase: "Maturação", area: 70, flowRate: 100, pumpPowerCv: 90, efficiency: 0.87, status: "parado", fieldCapacity: 0.33, wiltingPoint: 0.16, effectiveSoilDepth: 520, storedWater: 48, et0: 4.5, kc: 0.5, rootDepth: 0.55, depletionFactor: 0.5, daysAfterPlant: 100, cycleDays: 120, forecastPrecip: 8, pumpHouseId: "ph1", pumpHouseName: "CB-01" },
  { id: "p9", name: "Pivô 133", module: "Módulo M2", culture: "Feijão", cultureId: "c4", phase: "Vegetativo", area: 38, flowRate: 65, pumpPowerCv: 55, efficiency: 0.88, status: "manutencao", fieldCapacity: 0.31, wiltingPoint: 0.15, effectiveSoilDepth: 480, storedWater: 20, et0: 5.5, kc: 0.7, rootDepth: 0.25, depletionFactor: 0.45, daysAfterPlant: 25, cycleDays: 90, forecastPrecip: 0, pumpHouseId: "ph3", pumpHouseName: "CB-03" },
  { id: "p10", name: "Pivô 140", module: "Módulo M1", culture: "Milho", cultureId: "c2", phase: "Vegetativo", area: 83, flowRate: 110, pumpPowerCv: 110, efficiency: 0.85, status: "parado", fieldCapacity: 0.34, wiltingPoint: 0.17, effectiveSoilDepth: 560, storedWater: 35, et0: 5.2, kc: 0.8, rootDepth: 0.3, depletionFactor: 0.55, daysAfterPlant: 35, cycleDays: 130, forecastPrecip: 3, pumpHouseId: "ph2", pumpHouseName: "CB-02" },
];

// ── Generate all engine outputs ────────────────────────────────────────

function buildPivotContext(p: DemoPivot): PivotContext {
  const cad = (p.fieldCapacity - p.wiltingPoint) * p.rootDepth * p.effectiveSoilDepth;
  const pAdj = Math.min(0.8, p.depletionFactor + 0.04 * (5 - p.et0 * p.kc));
  const afd = cad * pAdj;
  return {
    pivotId: p.id,
    pivotName: p.name,
    area: p.area,
    flowRate: p.flowRate,
    efficiency: p.efficiency,
    pivotStatus: p.status,
    fieldCapacity: p.fieldCapacity,
    wiltingPoint: p.wiltingPoint,
    effectiveSoilDepth: p.effectiveSoilDepth,
    storedWater: p.storedWater,
    cad,
    afd,
    deficit: Math.max(0, cad - p.storedWater),
    etc: p.et0 * p.kc,
    et0: p.et0,
    kc: p.kc,
    rootDepth: p.rootDepth,
    depletionFactor: p.depletionFactor,
    waterStatus: getWaterStatus(p.storedWater, cad, afd),
    cropPhase: p.phase,
    daysAfterPlant: p.daysAfterPlant,
    cycleDays: p.cycleDays,
    forecastPrecip: p.forecastPrecip,
    peakHourStart: 18,
    peakHourEnd: 21,
    currentHour: 10,
    maintenanceBlocked: p.status === "manutencao",
    reservoirAvailable: true,
  };
}

function getWaterStatus(stored: number, cad: number, afd: number): WaterStatus {
  if (cad <= 0) return "ideal";
  const ratio = stored / cad;
  if (ratio >= 0.9) return "saturado";
  if (stored >= cad - afd) return "ideal";
  if (ratio >= 0.4) return "atencao";
  if (ratio >= 0.2) return "deficit";
  return "deficit_critico";
}

function generateDemoHistory(): { date: string; arm: number; deficit: number; etc: number; precip: number; irrigated: number; cost: number; energy: number }[] {
  const data: { date: string; arm: number; deficit: number; etc: number; precip: number; irrigated: number; cost: number; energy: number }[] = [];
  const base = new Date("2025-06-01");
  let arm = 45;
  for (let d = 0; d < 30; d++) {
    const date = new Date(base);
    date.setDate(date.getDate() + d);
    const etc = 4 + Math.random() * 3;
    const precip = Math.random() < 0.15 ? 5 + Math.random() * 20 : 0;
    const irrigated = Math.random() < 0.5 ? 5 + Math.random() * 10 : 0;
    arm = Math.max(5, Math.min(80, arm - etc + precip + irrigated));
    const deficit = Math.max(0, 60 - arm);
    const energy = irrigated > 0 ? irrigated * 12 : 0;
    const cost = energy * 0.55;
    data.push({
      date: date.toISOString().split("T")[0],
      arm: roundTo(arm, 1),
      deficit: roundTo(deficit, 1),
      etc: roundTo(etc, 1),
      precip: roundTo(precip, 1),
      irrigated: roundTo(irrigated, 1),
      cost: roundTo(cost, 2),
      energy: roundTo(energy, 1),
    });
  }
  return data;
}

// ── Tabs ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "mapa", label: "Mapa Operacional" },
  { id: "operacoes", label: "Centro de Operações" },
  { id: "indicadores", label: "Indicadores" },
  { id: "graficos", label: "Gráficos" },
];

const PIE_COLORS = ["#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4"];

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  irrigando:   { bg: "bg-green-500",  text: "text-green-700 dark:text-green-400", label: "Irrigando" },
  programado:  { bg: "bg-blue-500",   text: "text-blue-700 dark:text-blue-400", label: "Programado" },
  aguardando:  { bg: "bg-amber-500",  text: "text-amber-700 dark:text-amber-400", label: "Aguardando" },
  alerta:      { bg: "bg-red-500",    text: "text-red-700 dark:text-red-400", label: "Alerta" },
  parado:      { bg: "bg-gray-400",   text: "text-gray-600 dark:text-gray-400", label: "Parado" },
  manutencao:  { bg: "bg-orange-500", text: "text-orange-700 dark:text-orange-400", label: "Manutenção" },
};

// ── Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { profile, farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const [activeTab, setActiveTab] = useState("dashboard");

  const recommendations = useMemo(() => {
    const recs = DEMO_PIVOTS.map((p) => generateRecommendation(buildPivotContext(p)));
    return rankRecommendations(recs);
  }, []);

  const history = useMemo(() => generateDemoHistory(), []);

  const energyResults = useMemo(() => {
    return DEMO_PIVOTS.filter((p) => p.status === "irrigando").map((p) => {
      const rec = recommendations.find((r) => r.pivotId === p.id);
      const hours = rec ? rec.irrigationTimeH : 4;
      const vol = rec ? rec.volumeM3 : p.area * 30;
      const depth = rec ? rec.grossDepth : 8;
      return calculateConsumption({
        pivotId: p.id,
        pivotName: p.name,
        pumpHouseId: p.pumpHouseId,
        pumpHouseName: p.pumpHouseName,
        cultureName: p.culture,
        cultureId: p.cultureId,
        seasonId: "s1",
        moduleName: p.module,
        area: p.area,
        pumpPowerCv: p.pumpPowerCv,
        pumpPowerKw: 0,
        motorEfficiency: 0.85,
        operatingHours: roundTo(hours, 1),
        volumeM3: roundTo(vol, 0),
        depthMm: roundTo(depth, 1),
        startTime: "06:00",
        endTime: `${String(6 + Math.ceil(hours)).padStart(2, "0")}:00`,
        date: new Date().toISOString().split("T")[0],
      }, TARIFF);
    });
  }, [recommendations]);

  const farmTotals = useMemo(
    () => calculateFarmTotals(energyResults, TARIFF.contractedDemandKw, TARIFF.demandRate, 1),
    [energyResults]
  );

  const demand = useMemo(
    () => analyzeDemand(energyResults, TARIFF, [380, 410, 440]),
    [energyResults]
  );

  const totalArea = DEMO_PIVOTS.reduce((s, p) => s + p.area, 0);
  const irrigatingArea = DEMO_PIVOTS.filter((p) => p.status === "irrigando").reduce((s, p) => s + p.area, 0);
  const pendingArea = totalArea - irrigatingArea;

  const irrigatingCount = DEMO_PIVOTS.filter((p) => p.status === "irrigando").length;
  const alertCount = DEMO_PIVOTS.filter((p) => p.status === "alerta").length;
  const maintenanceCount = DEMO_PIVOTS.filter((p) => p.status === "manutencao").length;

  const avgDeficit = recommendations.length > 0
    ? roundTo(recommendations.reduce((s, r) => s + r.currentDeficit, 0) / recommendations.length, 1)
    : 0;
  const avgArm = recommendations.length > 0
    ? roundTo(recommendations.reduce((s, r) => s + r.currentArm, 0) / recommendations.length, 1)
    : 0;

  const totalVolume = recommendations.filter((r) => r.shouldIrrigate).reduce((s, r) => s + r.volumeM3, 0);
  const totalDepth = recommendations.filter((r) => r.shouldIrrigate).reduce((s, r) => s + r.grossDepth, 0);
  const costPerMm = totalDepth > 0 ? roundTo(farmTotals.totalCost / totalDepth, 2) : 0;
  const irrigationEfficiency = irrigatingArea > 0 ? roundTo((irrigatingArea / totalArea) * 100, 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Centro de Controle Operacional"
        descricao={activeFarm ? `${activeFarm.name} · Controle em tempo real` : "Controle em tempo real da operação"}
      />

      {profile && (
        <Card className="border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">
                Bom dia, {profile.name.split(" ")[0]}!
              </p>
              <p className="mt-0.5 text-sm text-brand-700 dark:text-brand-400">
                {irrigatingCount} pivôs irrigando · {alertCount > 0 ? `${alertCount} alerta(s) ativo(s) · ` : ""}{recommendations.filter((r) => r.shouldIrrigate).length} irrigações recomendadas hoje
              </p>
            </div>
          </div>
        </Card>
      )}

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "dashboard" && (
        <DashboardTab
          irrigatingCount={irrigatingCount}
          totalPivots={DEMO_PIVOTS.length}
          totalArea={totalArea}
          irrigatingArea={irrigatingArea}
          pendingArea={pendingArea}
          totalVolume={totalVolume}
          farmTotals={farmTotals}
          costPerMm={costPerMm}
          irrigationEfficiency={irrigationEfficiency}
          avgDeficit={avgDeficit}
          avgArm={avgArm}
          recommendations={recommendations}
          energyResults={energyResults}
          demand={demand}
        />
      )}

      {activeTab === "mapa" && (
        <MapaTab pivots={DEMO_PIVOTS} recommendations={recommendations} />
      )}

      {activeTab === "operacoes" && (
        <OperacoesTab recommendations={recommendations} pivots={DEMO_PIVOTS} />
      )}

      {activeTab === "indicadores" && (
        <IndicadoresTab
          recommendations={recommendations}
          energyResults={energyResults}
          farmTotals={farmTotals}
          history={history}
          avgArm={avgArm}
          avgDeficit={avgDeficit}
        />
      )}

      {activeTab === "graficos" && (
        <GraficosTab history={history} recommendations={recommendations} energyResults={energyResults} />
      )}
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────

function DashboardTab({
  irrigatingCount,
  totalPivots,
  totalArea,
  irrigatingArea,
  pendingArea,
  totalVolume,
  farmTotals,
  costPerMm,
  irrigationEfficiency,
  avgDeficit,
  avgArm,
  recommendations,
  energyResults,
  demand,
}: {
  irrigatingCount: number;
  totalPivots: number;
  totalArea: number;
  irrigatingArea: number;
  pendingArea: number;
  totalVolume: number;
  farmTotals: ReturnType<typeof calculateFarmTotals>;
  costPerMm: number;
  irrigationEfficiency: number;
  avgDeficit: number;
  avgArm: number;
  recommendations: Recommendation[];
  energyResults: ConsumptionResult[];
  demand: ReturnType<typeof analyzeDemand>;
}) {
  const kpiMetrics = [
    { id: "area_irrig", title: "Área Irrigada", value: `${irrigatingArea} ha`, description: `de ${totalArea} ha total`, variation: `${irrigationEfficiency}%`, trend: "positive" as const },
    { id: "area_pend", title: "Área Pendente", value: `${pendingArea} ha`, description: `${totalPivots - irrigatingCount} pivôs parados`, trend: "neutral" as const },
    { id: "agua", title: "Água Aplicada", value: `${totalVolume.toLocaleString("pt-BR")} m³`, description: "Demanda hídrica do dia" },
    { id: "energia", title: "Energia Consumida", value: `${farmTotals.totalKwh.toLocaleString("pt-BR")} kWh`, description: `Pico: ${demand.peakDemandKw.toFixed(0)} kW`, variation: `${farmTotals.peakPct.toFixed(0)}% ponta`, trend: farmTotals.peakPct > 20 ? "negative" as const : "positive" as const },
    { id: "custo", title: "Custo Acumulado", value: `R$ ${farmTotals.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, description: "Custo operacional hoje" },
    { id: "customm", title: "R$/mm", value: `R$ ${costPerMm.toFixed(2)}`, description: "Custo por mm aplicado" },
    { id: "eff_irrig", title: "Efic. Irrigação", value: `${irrigationEfficiency}%`, description: "Área irrigada / total", trend: irrigationEfficiency >= 50 ? "positive" as const : "negative" as const },
    { id: "eff_energy", title: "Efic. Energética", value: `${farmTotals.kwhPerM3.toFixed(3)} kWh/m³`, description: `R$ ${farmTotals.costPerHa.toFixed(2)}/ha` },
  ];

  const cultureEnergy = aggregateByCulture(energyResults);

  const highRisk = [...recommendations].sort((a, b) => b.productiveRisk - a.productiveRisk).slice(0, 3);
  const topConsumers = [...energyResults].sort((a, b) => b.totalKwh - a.totalKwh).slice(0, 3);
  const lateIrrigation = recommendations.filter((r) => r.operationalStatus === "irrigar_imediatamente");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        {kpiMetrics.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <SmartCard
          title="Maior Risco"
          color="red"
          items={highRisk.map((r) => ({
            label: r.pivotName,
            value: `${r.productiveRisk.toFixed(0)}%`,
            sub: r.cropPhase,
          }))}
          emptyText="Sem riscos críticos"
        />
        <SmartCard
          title="Melhor Pivô"
          color="green"
          items={[...recommendations]
            .filter((r) => !r.shouldIrrigate)
            .sort((a, b) => a.productiveRisk - b.productiveRisk)
            .slice(0, 3)
            .map((r) => ({
              label: r.pivotName,
              value: `ARM ${r.currentArm.toFixed(0)} mm`,
              sub: r.cropPhase,
            }))}
          emptyText="Todos necessitam irrigação"
        />
        <SmartCard
          title="Maior Consumo"
          color="amber"
          items={topConsumers.map((r) => ({
            label: r.pivotName,
            value: `${r.totalKwh.toFixed(0)} kWh`,
            sub: `R$ ${r.costTotal.toFixed(2)}`,
          }))}
          emptyText="Sem operações"
        />
        <SmartCard
          title="Economia Possível"
          color="blue"
          items={[{
            label: "Fora de ponta",
            value: `R$ ${(farmTotals.peakCost * 0.6).toFixed(2)}`,
            sub: "Deslocar irrigação",
          }]}
          emptyText="—"
        />
        <SmartCard
          title="Irrigação Atrasada"
          color="red"
          items={lateIrrigation.map((r) => ({
            label: r.pivotName,
            value: r.operationalStatus === "irrigar_imediatamente" ? "URGENTE" : "Hoje",
            sub: `Déficit: ${r.currentDeficit.toFixed(1)} mm`,
          }))}
          emptyText="Tudo em dia"
        />
        <SmartCard
          title="Reservatórios"
          color="blue"
          items={[
            { label: "Reservatório 1", value: "78%", sub: "12.400 m³" },
            { label: "Reservatório 2", value: "65%", sub: "8.200 m³" },
          ]}
          emptyText="—"
        />
        <SmartCard
          title="Casas de Bomba"
          color="green"
          items={[
            { label: "CB-01", value: `${irrigatingCount > 2 ? "3" : "2"} pivôs`, sub: "Operando" },
            { label: "CB-02", value: `${irrigatingCount > 3 ? "2" : "1"} pivô`, sub: "Operando" },
            { label: "CB-03", value: "1 pivô", sub: "Operando" },
          ]}
          emptyText="—"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Status dos Pivôs" subtitle="Distribuição atual">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={Object.entries(
                  DEMO_PIVOTS.reduce<Record<string, number>>((acc, p) => {
                    acc[p.status] = (acc[p.status] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([status, count]) => ({
                  name: STATUS_COLORS[status]?.label ?? status,
                  value: count,
                }))}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="value"
                nameKey="name"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {Object.keys(
                  DEMO_PIVOTS.reduce<Record<string, number>>((acc, p) => {
                    acc[p.status] = (acc[p.status] || 0) + 1;
                    return acc;
                  }, {})
                ).map((status, i) => (
                  <Cell key={status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consumo por Cultura" subtitle="kWh hoje">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cultureEnergy}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="groupLabel" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)} kWh`} />
              <Bar dataKey="totalKwh" name="kWh" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {cultureEnergy.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ── SmartCard Component ────────────────────────────────────────────────

function SmartCard({
  title,
  color,
  items,
  emptyText,
}: {
  title: string;
  color: "red" | "green" | "amber" | "blue";
  items: { label: string; value: string; sub: string }[];
  emptyText: string;
}) {
  const borderColors = {
    red: "border-red-200 dark:border-red-900",
    green: "border-green-200 dark:border-green-900",
    amber: "border-amber-200 dark:border-amber-900",
    blue: "border-blue-200 dark:border-blue-900",
  };
  const headerColors = {
    red: "text-red-700 dark:text-red-400",
    green: "text-green-700 dark:text-green-400",
    amber: "text-amber-700 dark:text-amber-400",
    blue: "text-blue-700 dark:text-blue-400",
  };

  return (
    <div className={`rounded-xl border bg-white p-3 dark:bg-graphite-900 ${borderColors[color]}`}>
      <h4 className={`mb-2 text-xs font-semibold ${headerColors[color]}`}>{title}</h4>
      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-graphite-900 dark:text-white">{item.label}</span>
                <span className="ml-1 text-gray-400 dark:text-gray-500">{item.sub}</span>
              </div>
              <span className="font-semibold text-graphite-900 dark:text-white">{item.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">{emptyText}</p>
      )}
    </div>
  );
}

// ── Mapa Tab ───────────────────────────────────────────────────────────

function MapaTab({
  pivots,
  recommendations,
}: {
  pivots: DemoPivot[];
  recommendations: Recommendation[];
}) {
  const getMapStatus = (p: DemoPivot): string => {
    const rec = recommendations.find((r) => r.pivotId === p.id);
    if (p.status === "manutencao") return "manutencao";
    if (p.status === "alerta") return "alerta";
    if (p.status === "irrigando") return "irrigando";
    if (rec?.operationalStatus === "irrigar_imediatamente" || rec?.operationalStatus === "irrigar_hoje") return "aguardando";
    if (rec?.shouldIrrigate) return "programado";
    return "parado";
  };

  const statusCounts = pivots.reduce<Record<string, number>>((acc, p) => {
    const st = getMapStatus(p);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {Object.entries(STATUS_COLORS).map(([key, conf]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${conf.bg}`} />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {conf.label}: {statusCounts[key] || 0}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {pivots.map((p) => {
          const st = getMapStatus(p);
          const conf = STATUS_COLORS[st] || STATUS_COLORS.parado;
          const rec = recommendations.find((r) => r.pivotId === p.id);
          const waterConf = rec ? WATER_STATUS_CONFIG[getWaterStatus(
            rec.currentArm,
            rec.currentCad,
            rec.currentAfd
          )] : null;

          return (
            <Card key={p.id} className="relative overflow-hidden">
              <div className={`absolute left-0 top-0 h-full w-1 ${conf.bg}`} />
              <div className="pl-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-graphite-900 dark:text-white">{p.name}</h4>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.bg} text-white`}>
                    {conf.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{p.module} · {p.culture}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{p.phase} · {p.area} ha</p>

                {rec && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400 dark:text-gray-500">ARM:</span>
                      <span className="font-medium text-graphite-900 dark:text-white">{rec.currentArm.toFixed(1)} mm</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400 dark:text-gray-500">Déficit:</span>
                      <span className="font-medium text-graphite-900 dark:text-white">{rec.currentDeficit.toFixed(1)} mm</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400 dark:text-gray-500">ETc:</span>
                      <span className="font-medium text-graphite-900 dark:text-white">{rec.currentEtc.toFixed(1)} mm/dia</span>
                    </div>
                    {waterConf && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 dark:text-gray-500">Status:</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${waterConf.bgClass}`}>
                          {waterConf.label}
                        </span>
                      </div>
                    )}
                    {rec.shouldIrrigate && (
                      <div className="mt-1 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        {rec.grossDepth.toFixed(1)} mm · {rec.volumeM3.toFixed(0)} m³ · {rec.irrigationTimeH.toFixed(1)}h
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Operações Tab ──────────────────────────────────────────────────────

function OperacoesTab({
  recommendations,
  pivots,
}: {
  recommendations: Recommendation[];
  pivots: DemoPivot[];
}) {
  const irrigating = recommendations.filter((r) => {
    const p = pivots.find((pv) => pv.id === r.pivotId);
    return p?.status === "irrigando";
  });

  const queue = recommendations.filter((r) => {
    const p = pivots.find((pv) => pv.id === r.pivotId);
    return r.shouldIrrigate && p?.status !== "irrigando" && p?.status !== "manutencao";
  });

  const completed = recommendations.filter((r) => !r.shouldIrrigate && r.priorityScore < 20);

  const criticalAlerts = recommendations.filter(
    (r) => r.operationalStatus === "irrigar_imediatamente" || r.productiveRisk > 70
  );

  const aiRecs = recommendations
    .filter((r) => r.shouldIrrigate)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard metric={{ id: "queue", title: "Fila de Irrigação", value: String(queue.length), description: "Aguardando início" }} />
        <StatCard metric={{ id: "running", title: "Em Andamento", value: String(irrigating.length), description: "Irrigando agora" }} />
        <StatCard metric={{ id: "done", title: "Concluídas", value: String(completed.length), description: "Sem necessidade" }} />
        <StatCard metric={{ id: "alerts", title: "Alertas Críticos", value: String(criticalAlerts.length), description: "Requerem atenção", trend: criticalAlerts.length > 0 ? "negative" : "positive" }} />
      </div>

      {criticalAlerts.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20">
          <h3 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">Alertas Críticos</h3>
          <div className="space-y-2">
            {criticalAlerts.map((r) => (
              <div key={r.pivotId} className="flex items-center justify-between rounded-lg bg-white/60 p-3 dark:bg-graphite-800/60">
                <div>
                  <span className="text-sm font-medium text-graphite-900 dark:text-white">{r.pivotName}</span>
                  <p className="text-xs text-red-600 dark:text-red-400">{r.reason}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CONFIG[r.priority].bgClass}`}>
                    {PRIORITY_CONFIG[r.priority].label}
                  </span>
                  <p className="mt-1 text-xs text-gray-500">Risco: {r.productiveRisk.toFixed(0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Fila de Irrigação</h3>
          {queue.length > 0 ? (
            <div className="space-y-2">
              {queue.map((r, i) => (
                <div key={r.pivotId} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-graphite-800">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-graphite-900 dark:text-white">{r.pivotName}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.cropPhase} · {r.grossDepth.toFixed(1)} mm · {r.irrigationTimeH.toFixed(1)}h</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OPERATIONAL_STATUS_CONFIG[r.operationalStatus].bgClass}`}>
                    {OPERATIONAL_STATUS_CONFIG[r.operationalStatus].label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma irrigação na fila</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Irrigações em Andamento</h3>
          {irrigating.length > 0 ? (
            <div className="space-y-2">
              {irrigating.map((r) => (
                <div key={r.pivotId} className="flex items-center justify-between rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                  <div>
                    <span className="text-sm font-medium text-graphite-900 dark:text-white">{r.pivotName}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {r.grossDepth.toFixed(1)} mm · {r.volumeM3.toFixed(0)} m³ · {r.irrigationTimeH.toFixed(1)}h
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                    Irrigando
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum pivô irrigando</p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Recomendações da IA</h3>
        <div className="space-y-2">
          {aiRecs.map((r) => (
            <div key={r.pivotId} className="flex items-start justify-between rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-graphite-900 dark:text-white">{r.pivotName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_CONFIG[r.priority].bgClass}`}>
                    {PRIORITY_CONFIG[r.priority].label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{r.reason}</p>
                {r.observations && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500">{r.observations}</p>
                )}
              </div>
              <div className="ml-4 text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">{r.grossDepth.toFixed(1)} mm · {r.volumeM3.toFixed(0)} m³</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{r.irrigationTimeH.toFixed(1)}h · {r.recommendedStart}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Indicadores Tab ────────────────────────────────────────────────────

function IndicadoresTab({
  recommendations,
  energyResults,
  farmTotals,
  history,
  avgArm,
  avgDeficit,
}: {
  recommendations: Recommendation[];
  energyResults: ConsumptionResult[];
  farmTotals: ReturnType<typeof calculateFarmTotals>;
  history: ReturnType<typeof generateDemoHistory>;
  avgArm: number;
  avgDeficit: number;
}) {
  const lastWeek = history.slice(-7);
  const lastMonth = history;

  const weeklyEnergy = lastWeek.reduce((s, d) => s + d.energy, 0);
  const weeklyWater = lastWeek.reduce((s, d) => s + d.irrigated, 0);
  const weeklyCost = lastWeek.reduce((s, d) => s + d.cost, 0);
  const monthlyEnergy = lastMonth.reduce((s, d) => s + d.energy, 0);
  const monthlyWater = lastMonth.reduce((s, d) => s + d.irrigated, 0);
  const monthlyCost = lastMonth.reduce((s, d) => s + d.cost, 0);

  const dailyEnergy = farmTotals.totalKwh;
  const dailyWater = recommendations.filter((r) => r.shouldIrrigate).reduce((s, r) => s + r.volumeM3, 0);
  const dailyCost = farmTotals.totalCost;

  const avgEtc = recommendations.length > 0
    ? roundTo(recommendations.reduce((s, r) => s + r.currentEtc, 0) / recommendations.length, 1)
    : 0;

  const indicators = [
    { group: "Consumo Diário", items: [
      { label: "Energia", value: `${dailyEnergy.toLocaleString("pt-BR")} kWh` },
      { label: "Água", value: `${dailyWater.toLocaleString("pt-BR")} m³` },
      { label: "Custo", value: `R$ ${dailyCost.toFixed(2)}` },
    ]},
    { group: "Consumo Semanal", items: [
      { label: "Energia", value: `${weeklyEnergy.toFixed(0)} kWh` },
      { label: "Água (mm)", value: `${weeklyWater.toFixed(1)} mm` },
      { label: "Custo", value: `R$ ${weeklyCost.toFixed(2)}` },
    ]},
    { group: "Consumo Mensal", items: [
      { label: "Energia", value: `${monthlyEnergy.toFixed(0)} kWh` },
      { label: "Água (mm)", value: `${monthlyWater.toFixed(1)} mm` },
      { label: "Custo", value: `R$ ${monthlyCost.toFixed(2)}` },
    ]},
    { group: "Indicadores Hídricos", items: [
      { label: "ARM Médio", value: `${avgArm.toFixed(1)} mm` },
      { label: "Déficit Médio", value: `${avgDeficit.toFixed(1)} mm` },
      { label: "ETc Média", value: `${avgEtc.toFixed(1)} mm/dia` },
    ]},
    { group: "Eficiência", items: [
      { label: "kWh/m³", value: farmTotals.kwhPerM3.toFixed(3) },
      { label: "kWh/ha", value: farmTotals.kwhPerHa.toFixed(1) },
      { label: "R$/ha", value: `R$ ${farmTotals.costPerHa.toFixed(2)}` },
    ]},
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {indicators.map((group) => (
          <Card key={group.group}>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group.group}</h4>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
                  <span className="text-sm font-semibold text-graphite-900 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Ranking de Prioridade por Pivô</h3>
        <Table
          columns={[
            { header: "#", render: (_r, ) => <span>{recommendations.indexOf(_r) + 1}</span>, align: "center" as const },
            { header: "Pivô", render: (r: Recommendation) => <span className="font-medium">{r.pivotName}</span> },
            { header: "Fase", render: (r: Recommendation) => r.cropPhase },
            { header: "Score", render: (r: Recommendation) => <span className="font-semibold">{r.priorityScore.toFixed(0)}</span>, align: "right" as const },
            { header: "Prioridade", render: (r: Recommendation) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CONFIG[r.priority].bgClass}`}>{PRIORITY_CONFIG[r.priority].label}</span> },
            { header: "ARM (mm)", render: (r: Recommendation) => r.currentArm.toFixed(1), align: "right" as const },
            { header: "Déficit (mm)", render: (r: Recommendation) => r.currentDeficit.toFixed(1), align: "right" as const },
            { header: "ETc (mm)", render: (r: Recommendation) => r.currentEtc.toFixed(1), align: "right" as const },
            { header: "Risco (%)", render: (r: Recommendation) => <span className={r.productiveRisk > 50 ? "text-red-600 dark:text-red-400" : ""}>{r.productiveRisk.toFixed(0)}%</span>, align: "right" as const },
            { header: "Status", render: (r: Recommendation) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OPERATIONAL_STATUS_CONFIG[r.operationalStatus].bgClass}`}>{OPERATIONAL_STATUS_CONFIG[r.operationalStatus].label}</span> },
          ] satisfies Column<Recommendation>[]}
          data={recommendations}
          getKey={(r) => r.pivotId}
        />
      </Card>
    </div>
  );
}

// ── Gráficos Tab ───────────────────────────────────────────────────────

function GraficosTab({
  history,
  recommendations,
  energyResults,
}: {
  history: ReturnType<typeof generateDemoHistory>;
  recommendations: Recommendation[];
  energyResults: ConsumptionResult[];
}) {
  const pivotData = recommendations.map((r) => ({
    name: r.pivotName,
    arm: r.currentArm,
    cad: r.currentCad,
    deficit: r.currentDeficit,
    etc: r.currentEtc,
    risk: r.productiveRisk,
  }));

  return (
    <div className="space-y-6 grid gap-6 lg:grid-cols-2">
      <ChartCard title="Evolução do ARM" subtitle="Armazenamento de água no solo (30 dias)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Area dataKey="arm" name="ARM (mm)" fill="#3b82f6" fillOpacity={0.2} stroke="#3b82f6" />
            <ReferenceLine y={60} stroke="#22c55e" strokeDasharray="5 5" label={{ value: "CAD", position: "right", fill: "#22c55e", fontSize: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Evolução do Déficit" subtitle="Déficit hídrico diário (30 dias)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Area dataKey="deficit" name="Déficit (mm)" fill="#ef4444" fillOpacity={0.2} stroke="#ef4444" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Água Aplicada vs ETc vs Chuva" subtitle="Entradas e saídas (30 dias)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="irrigated" name="Irrigado (mm)" fill="#3b82f6" />
            <Bar dataKey="precip" name="Chuva (mm)" fill="#22c55e" />
            <Line dataKey="etc" name="ETc (mm)" stroke="#ef4444" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Energia e Custo Diário" subtitle="kWh e R$ (30 dias)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(v) => v.slice(5)} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="energy" name="Energia (kWh)" fill="#f59e0b" yAxisId="left" />
            <Line dataKey="cost" name="Custo (R$)" stroke="#ef4444" yAxisId="right" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="ARM vs CAD por Pivô" subtitle="Estado hídrico atual">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pivotData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
            <Tooltip />
            <Legend />
            <Bar dataKey="arm" name="ARM (mm)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            <Bar dataKey="cad" name="CAD (mm)" fill="#e5e7eb" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="ETc e Risco por Pivô" subtitle="Demanda evapotranspirativa e risco">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pivotData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="etc" name="ETc (mm/dia)" fill="#22c55e" yAxisId="left" />
            <Line dataKey="risk" name="Risco (%)" stroke="#ef4444" yAxisId="right" dot />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Eficiência Energética por Pivô" subtitle="kWh e custo por pivô operando">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={aggregateByPivot(energyResults)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="groupLabel" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="totalKwh" name="kWh" fill="#3b82f6" />
            <Bar dataKey="totalCost" name="Custo (R$)" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Custo Acumulado" subtitle="R$ acumulado ao longo do período">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={history.reduce<{ date: string; accumulated: number }[]>((acc, d) => {
              const prev = acc.length > 0 ? acc[acc.length - 1].accumulated : 0;
              acc.push({ date: d.date, accumulated: roundTo(prev + d.cost, 2) });
              return acc;
            }, [])}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
            <Area dataKey="accumulated" name="Custo Acumulado" fill="#3b82f6" fillOpacity={0.2} stroke="#3b82f6" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
