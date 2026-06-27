"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, Table, type Column, ChartCard } from "@/components/ui";
import {
  type ApportionmentResult,
  type ApportionmentInput,
  type ApportionmentMethod,
  calculateApportionment,
  aggregateApportionmentByCulture,
  aggregateApportionmentByModule,
  APPORTIONMENT_METHOD_CONFIG,
} from "@/modules/energy/services";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ── Demo Data ──────────────────────────────────────────────────────────

const DEMO_ITEMS: ApportionmentInput[] = [
  { pivotId: "p1", pivotName: "Pivô Central 1", cultureId: "c1", cultureName: "Soja", seasonId: "s1", moduleName: "Módulo A", pumpHouseId: "ph1", costCenter: "CC-Irrigação", area: 120, volumeM3: 48000, hours: 180 },
  { pivotId: "p2", pivotName: "Pivô Central 2", cultureId: "c1", cultureName: "Soja", seasonId: "s1", moduleName: "Módulo A", pumpHouseId: "ph1", costCenter: "CC-Irrigação", area: 95, volumeM3: 38500, hours: 155 },
  { pivotId: "p3", pivotName: "Pivô Leste 1", cultureId: "c2", cultureName: "Milho", seasonId: "s1", moduleName: "Módulo B", pumpHouseId: "ph2", costCenter: "CC-Irrigação", area: 80, volumeM3: 35200, hours: 140 },
  { pivotId: "p4", pivotName: "Pivô Leste 2", cultureId: "c2", cultureName: "Milho", seasonId: "s1", moduleName: "Módulo B", pumpHouseId: "ph2", costCenter: "CC-Irrigação", area: 110, volumeM3: 44000, hours: 165 },
  { pivotId: "p5", pivotName: "Pivô Norte 1", cultureId: "c3", cultureName: "Feijão", seasonId: "s1", moduleName: "Módulo C", pumpHouseId: "ph3", costCenter: "CC-Irrigação", area: 65, volumeM3: 22750, hours: 110 },
  { pivotId: "p6", pivotName: "Pivô Sul 1", cultureId: "c4", cultureName: "Algodão", seasonId: "s1", moduleName: "Módulo A", pumpHouseId: "ph1", costCenter: "CC-Irrigação", area: 140, volumeM3: 56000, hours: 200 },
];

const DEMO_TOTAL_KWH = 42850;
const DEMO_TOTAL_COST = 19825.40;

const PIE_COLORS = ["#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4"];

const TABS = [
  { id: "pivot", label: "Por Pivô" },
  { id: "cultura", label: "Por Cultura" },
  { id: "modulo", label: "Por Módulo" },
  { id: "comparativo", label: "Comparativo" },
];

// ── Page ────────────────────────────────────────────────────────────────

export default function RateioPage() {
  const [activeTab, setActiveTab] = useState("pivot");
  const [method, setMethod] = useState<ApportionmentMethod>("volume");

  const results = useMemo(
    () => calculateApportionment(DEMO_TOTAL_KWH, DEMO_TOTAL_COST, DEMO_ITEMS, method),
    [method]
  );

  const byCulture = useMemo(() => aggregateApportionmentByCulture(results), [results]);
  const byModule = useMemo(() => aggregateApportionmentByModule(results), [results]);

  const totalArea = DEMO_ITEMS.reduce((s, i) => s + i.area, 0);
  const totalVolume = DEMO_ITEMS.reduce((s, i) => s + i.volumeM3, 0);

  const metrics = [
    { id: "kwh", title: "Energia Total", value: `${DEMO_TOTAL_KWH.toLocaleString("pt-BR")} kWh`, description: "Período selecionado" },
    { id: "cost", title: "Custo Total", value: `R$ ${DEMO_TOTAL_COST.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, description: "A ser rateado" },
    { id: "pivots", title: "Pivôs", value: String(DEMO_ITEMS.length), description: `${totalArea.toFixed(0)} ha total` },
    { id: "area", title: "Área Irrigada", value: `${totalArea.toFixed(0)} ha`, description: `${totalVolume.toLocaleString("pt-BR")} m³ total` },
    { id: "kwhha", title: "kWh/ha (médio)", value: (DEMO_TOTAL_KWH / totalArea).toFixed(1), description: `R$ ${(DEMO_TOTAL_COST / totalArea).toFixed(2)}/ha` },
    { id: "method", title: "Método de Rateio", value: APPORTIONMENT_METHOD_CONFIG[method].label, description: APPORTIONMENT_METHOD_CONFIG[method].description },
  ];

  return (
    <div>
      <PageHeader titulo="Rateio de Custos" descricao="Rateio automático de energia por pivô, cultura, safra e módulo" />

      <div className="mt-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {metrics.map((m) => (
            <StatCard key={m.id} metric={m} />
          ))}
        </div>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Método de Rateio</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(APPORTIONMENT_METHOD_CONFIG) as [ApportionmentMethod, { label: string; description: string }][]).map(
              ([key, conf]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                    method === key
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-graphite-700 dark:text-gray-300 dark:hover:bg-graphite-600"
                  }`}
                >
                  <div className="font-semibold">{conf.label}</div>
                  <div className="mt-0.5 text-[10px] opacity-80">{conf.description}</div>
                </button>
              )
            )}
          </div>
        </Card>

        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "pivot" && <PivotTab results={results} />}
        {activeTab === "cultura" && <CulturaTab results={byCulture} />}
        {activeTab === "modulo" && <ModuloTab results={byModule} />}
        {activeTab === "comparativo" && (
          <ComparativoTab results={results} byCulture={byCulture} byModule={byModule} />
        )}
      </div>
    </div>
  );
}

// ── Pivot Tab ──────────────────────────────────────────────────────────

function PivotTab({ results }: { results: ApportionmentResult[] }) {
  const columns: Column<ApportionmentResult>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivotName}</span> },
    { header: "Cultura", render: (r) => r.cultureName },
    { header: "Módulo", render: (r) => r.moduleName },
    { header: "Área (ha)", render: (r) => r.area.toFixed(1), align: "right" },
    { header: "Volume (m³)", render: (r) => r.volumeM3.toLocaleString("pt-BR"), align: "right" },
    { header: "% Rateio", render: (r) => (
      <div className="flex items-center gap-2">
        <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-graphite-700">
          <div className="h-full bg-brand-500" style={{ width: `${r.sharePct}%` }} />
        </div>
        <span className="text-xs">{r.sharePct.toFixed(1)}%</span>
      </div>
    )},
    { header: "kWh", render: (r) => r.apportionedKwh.toLocaleString("pt-BR"), align: "right" },
    { header: "Custo (R$)", render: (r) => r.apportionedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: "right" },
    { header: "kWh/ha", render: (r) => r.kwhPerHa.toFixed(1), align: "right" },
    { header: "R$/ha", render: (r) => r.costPerHa.toFixed(2), align: "right" },
    { header: "R$/m³", render: (r) => r.costPerM3.toFixed(3), align: "right" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Rateio por Pivô</h3>
        <Table columns={columns} data={results} getKey={(r) => r.pivotId} />
      </Card>

      <ChartCard title="Distribuição de Custo por Pivô" subtitle="R$ rateado para cada pivô">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={results} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="pivotName" tick={{ fontSize: 10 }} width={120} />
            <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
            <Bar dataKey="apportionedCost" name="Custo (R$)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Cultura Tab ────────────────────────────────────────────────────────

function CulturaTab({ results }: { results: ApportionmentResult[] }) {
  const columns: Column<ApportionmentResult>[] = [
    { header: "Cultura", render: (r) => <span className="font-medium">{r.cultureName}</span> },
    { header: "Área (ha)", render: (r) => r.area.toFixed(1), align: "right" },
    { header: "Volume (m³)", render: (r) => r.volumeM3.toLocaleString("pt-BR"), align: "right" },
    { header: "% Rateio", render: (r) => `${r.sharePct.toFixed(1)}%`, align: "right" },
    { header: "kWh", render: (r) => r.apportionedKwh.toLocaleString("pt-BR"), align: "right" },
    { header: "Custo (R$)", render: (r) => r.apportionedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: "right" },
    { header: "kWh/ha", render: (r) => r.kwhPerHa.toFixed(1), align: "right" },
    { header: "R$/ha", render: (r) => r.costPerHa.toFixed(2), align: "right" },
    { header: "kWh/m³", render: (r) => r.kwhPerM3.toFixed(3), align: "right" },
    { header: "R$/m³", render: (r) => r.costPerM3.toFixed(3), align: "right" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Rateio por Cultura</h3>
        <Table columns={columns} data={results} getKey={(r) => r.cultureId} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Custo por Cultura" subtitle="Distribuição percentual">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={results}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="apportionedCost"
                nameKey="cultureName"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {results.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Eficiência por Cultura" subtitle="R$/ha por cultura">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={results}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="cultureName" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="costPerHa" name="R$/ha" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ── Módulo Tab ─────────────────────────────────────────────────────────

function ModuloTab({ results }: { results: ApportionmentResult[] }) {
  const columns: Column<ApportionmentResult>[] = [
    { header: "Módulo", render: (r) => <span className="font-medium">{r.moduleName}</span> },
    { header: "Área (ha)", render: (r) => r.area.toFixed(1), align: "right" },
    { header: "Volume (m³)", render: (r) => r.volumeM3.toLocaleString("pt-BR"), align: "right" },
    { header: "% Rateio", render: (r) => `${r.sharePct.toFixed(1)}%`, align: "right" },
    { header: "kWh", render: (r) => r.apportionedKwh.toLocaleString("pt-BR"), align: "right" },
    { header: "Custo (R$)", render: (r) => r.apportionedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: "right" },
    { header: "kWh/ha", render: (r) => r.kwhPerHa.toFixed(1), align: "right" },
    { header: "R$/ha", render: (r) => r.costPerHa.toFixed(2), align: "right" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Rateio por Módulo</h3>
        <Table columns={columns} data={results} getKey={(r) => r.moduleName} />
      </Card>

      <ChartCard title="Comparação entre Módulos" subtitle="kWh e Custo por módulo">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={results}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="moduleName" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="apportionedKwh" name="kWh" fill="#3b82f6" yAxisId="left" />
            <Bar dataKey="apportionedCost" name="Custo (R$)" fill="#f59e0b" yAxisId="right" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Comparativo Tab ────────────────────────────────────────────────────

function ComparativoTab({
  results,
  byCulture,
  byModule,
}: {
  results: ApportionmentResult[];
  byCulture: ApportionmentResult[];
  byModule: ApportionmentResult[];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Análise Comparativa de Eficiência</h3>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((r, i) => (
            <div key={r.pivotId} className="rounded-xl border border-gray-200 p-4 dark:border-graphite-700">
              <h4 className="mb-1 text-sm font-semibold text-graphite-900 dark:text-white">{r.pivotName}</h4>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{r.cultureName} — {r.moduleName}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Custo rateado:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">
                    R$ {r.apportionedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Participação:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">{r.sharePct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">R$/ha:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">R$ {r.costPerHa.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">kWh/m³:</span>
                  <span className="font-medium text-graphite-900 dark:text-white">{r.kwhPerM3.toFixed(3)}</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Participação</div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-graphite-700">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${r.sharePct}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="R$/ha por Cultura" subtitle="Eficiência energética por cultura">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCulture}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="cultureName" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
              <Bar dataKey="costPerHa" name="R$/ha" fill="#22c55e" radius={[4, 4, 0, 0]}>
                {byCulture.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="R$/ha por Módulo" subtitle="Eficiência energética por módulo">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byModule}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="moduleName" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
              <Bar dataKey="costPerHa" name="R$/ha" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {byModule.map((_, i) => (
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
