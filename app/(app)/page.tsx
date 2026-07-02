"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, EmptyState } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks/use-crud";
import { radiusFromArea } from "@/utils/geo";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  { ssr: false, loading: () => <div className="flex h-[400px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 dark:border-graphite-700 dark:bg-graphite-800"><p className="text-sm text-gray-400">Carregando mapa...</p></div> }
);

// ── DB interfaces (snake_case) ────────────────────────────────────────

interface PivotRecord {
  id: string;
  farm_id: string;
  module_id: string | null;
  culture_id: string | null;
  name: string;
  code: string | null;
  area: number;
  radius: number;
  flow_rate: number;
  pump_power: number;
  motor_efficiency: number;
  efficiency: number;
  latitude: number;
  longitude: number;
  status: string;
  manufacturer: string | null;
  model: string | null;
  pivot_type: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ReservoirRecord {
  id: string;
  farm_id: string;
  name: string;
  type: string;
  max_capacity: number;
  current_volume: number;
  min_operational_level: number;
  active: boolean;
}

interface PumpHouseRecord {
  id: string;
  farm_id: string;
  name: string;
  max_flow_rate: number;
  max_simultaneous: number;
  power_kw: number;
  status: string;
  active: boolean;
}

interface PumpHousePivotRecord {
  id: string;
  pump_house_id: string;
  pivot_id: string;
  hydraulic_line: string;
  priority_order: number;
}

// ── Tabs ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "mapa", label: "Mapa Operacional" },
  { id: "operacoes", label: "Centro de Operações" },
  { id: "indicadores", label: "Indicadores" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  irrigando:   { bg: "bg-green-500",  text: "text-green-700 dark:text-green-400", label: "Irrigando" },
  alerta:      { bg: "bg-red-500",    text: "text-red-700 dark:text-red-400", label: "Alerta" },
  parado:      { bg: "bg-gray-400",   text: "text-gray-600 dark:text-gray-400", label: "Parado" },
  manutencao:  { bg: "bg-orange-500", text: "text-orange-700 dark:text-orange-400", label: "Manutenção" },
};

const PIE_COLORS = ["#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── Page ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { profile, farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: pivots, loading: loadingPivots } = useCrud<PivotRecord>({
    table: "pivots",
    orderBy: "name",
    ascending: true,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: reservoirs, loading: loadingReservoirs } = useCrud<ReservoirRecord>({
    table: "reservoirs",
    orderBy: "name",
    ascending: true,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: pumpHouses, loading: loadingPumpHouses } = useCrud<PumpHouseRecord>({
    table: "pump_houses",
    orderBy: "name",
    ascending: true,
    filters: { farm_id: activeFarmId ?? null },
  });

  const { data: pumpHousePivots } = useCrud<PumpHousePivotRecord>({
    table: "pump_house_pivots",
    orderBy: "priority_order",
    ascending: true,
  });

  const activePivots = useMemo(() => pivots.filter((p) => p.active), [pivots]);
  const activeReservoirs = useMemo(() => reservoirs.filter((r) => r.active), [reservoirs]);
  const activePumpHouses = useMemo(() => pumpHouses.filter((ph) => ph.active), [pumpHouses]);

  const loading = loadingPivots || loadingReservoirs || loadingPumpHouses;

  const totalArea = useMemo(() => activePivots.reduce((s, p) => s + p.area, 0), [activePivots]);
  const irrigatingPivots = useMemo(() => activePivots.filter((p) => p.status === "irrigando"), [activePivots]);
  const irrigatingArea = useMemo(() => irrigatingPivots.reduce((s, p) => s + p.area, 0), [irrigatingPivots]);
  const alertCount = useMemo(() => activePivots.filter((p) => p.status === "alerta").length, [activePivots]);
  const maintenanceCount = useMemo(() => activePivots.filter((p) => p.status === "manutencao").length, [activePivots]);

  const statusCounts = useMemo(() => {
    return activePivots.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});
  }, [activePivots]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Centro de Controle Operacional"
        descricao={activeFarm ? `${activeFarm.name} · Controle em tempo real` : "Controle em tempo real da operação"}
      />

      {profile && activePivots.length > 0 && (
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
                {irrigatingPivots.length} pivô(s) irrigando · {alertCount > 0 ? `${alertCount} alerta(s) · ` : ""}{activePivots.length} pivôs cadastrados
              </p>
            </div>
          </div>
        </Card>
      )}

      {activePivots.length === 0 ? (
        <EmptyState
          title="Nenhum pivô cadastrado"
          description="Cadastre seus pivôs para visualizar o painel de controle operacional com dados reais da sua fazenda."
          icon={
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
          }
          actionLabel="Ir para Pivôs"
          onAction={() => { window.location.href = "/pivos"; }}
        />
      ) : (
        <>
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "dashboard" && (
            <DashboardTab
              pivots={activePivots}
              irrigatingCount={irrigatingPivots.length}
              totalArea={totalArea}
              irrigatingArea={irrigatingArea}
              alertCount={alertCount}
              maintenanceCount={maintenanceCount}
              statusCounts={statusCounts}
              reservoirs={activeReservoirs}
              pumpHouses={activePumpHouses}
              pumpHousePivots={pumpHousePivots}
            />
          )}

          {activeTab === "mapa" && (
            <MapaTab pivots={activePivots} statusCounts={statusCounts} />
          )}

          {activeTab === "operacoes" && (
            <OperacoesTab
              pivots={activePivots}
              irrigatingCount={irrigatingPivots.length}
              alertCount={alertCount}
              maintenanceCount={maintenanceCount}
            />
          )}

          {activeTab === "indicadores" && (
            <IndicadoresTab
              pivots={activePivots}
              totalArea={totalArea}
              irrigatingArea={irrigatingArea}
              irrigatingCount={irrigatingPivots.length}
              reservoirs={activeReservoirs}
              pumpHouses={activePumpHouses}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── SmartCard Component ───────────────────────────────────────────────

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

// ── Dashboard Tab ─────────────────────────────────────────────────────

function DashboardTab({
  pivots,
  irrigatingCount,
  totalArea,
  irrigatingArea,
  alertCount,
  maintenanceCount,
  statusCounts,
  reservoirs,
  pumpHouses,
  pumpHousePivots,
}: {
  pivots: PivotRecord[];
  irrigatingCount: number;
  totalArea: number;
  irrigatingArea: number;
  alertCount: number;
  maintenanceCount: number;
  statusCounts: Record<string, number>;
  reservoirs: ReservoirRecord[];
  pumpHouses: PumpHouseRecord[];
  pumpHousePivots: PumpHousePivotRecord[];
}) {
  const pendingArea = totalArea - irrigatingArea;
  const irrigationPct = totalArea > 0 ? Math.round((irrigatingArea / totalArea) * 100) : 0;

  const kpiMetrics = [
    { id: "total", title: "Total de Pivôs", value: String(pivots.length), description: `${totalArea.toFixed(0)} ha total` },
    { id: "irrigando", title: "Irrigando", value: String(irrigatingCount), description: `${irrigatingArea.toFixed(0)} ha`, variation: `${irrigationPct}%`, trend: "positive" as const },
    { id: "parados", title: "Parados", value: String(statusCounts["parado"] || 0), description: `${pendingArea.toFixed(0)} ha pendente`, trend: "neutral" as const },
    { id: "alerta", title: "Alertas", value: String(alertCount), description: "Pivôs em alerta", trend: alertCount > 0 ? "negative" as const : "positive" as const },
    { id: "manutencao", title: "Manutenção", value: String(maintenanceCount), description: "Em manutenção", trend: maintenanceCount > 0 ? "negative" as const : "positive" as const },
    { id: "reserv", title: "Reservatórios", value: String(reservoirs.length), description: reservoirs.length > 0 ? "Cadastrados" : "Nenhum cadastrado" },
    { id: "casas", title: "Casas de Bomba", value: String(pumpHouses.length), description: pumpHouses.length > 0 ? "Cadastradas" : "Nenhuma cadastrada" },
    { id: "area", title: "Área Total", value: `${totalArea.toFixed(0)} ha`, description: "Área sob irrigação" },
  ];

  const statusPieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_COLORS[status]?.label ?? status,
    value: count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        {kpiMetrics.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <SmartCard
          title="Pivôs Irrigando"
          color="green"
          items={pivots
            .filter((p) => p.status === "irrigando")
            .slice(0, 5)
            .map((p) => ({
              label: p.name,
              value: `${p.area.toFixed(0)} ha`,
              sub: `${p.flow_rate} m³/h`,
            }))}
          emptyText="Nenhum pivô irrigando"
        />
        <SmartCard
          title="Alertas Ativos"
          color="red"
          items={pivots
            .filter((p) => p.status === "alerta")
            .map((p) => ({
              label: p.name,
              value: "Alerta",
              sub: `${p.area.toFixed(0)} ha`,
            }))}
          emptyText="Sem alertas ativos"
        />
        <SmartCard
          title="Reservatórios"
          color="blue"
          items={reservoirs.map((r) => {
            const pct = r.max_capacity > 0 ? Math.round((r.current_volume / r.max_capacity) * 100) : 0;
            return {
              label: r.name,
              value: `${pct}%`,
              sub: `${r.current_volume.toLocaleString("pt-BR")} m³`,
            };
          })}
          emptyText="Nenhum reservatório cadastrado"
        />
        <SmartCard
          title="Casas de Bomba"
          color="green"
          items={pumpHouses.map((ph) => {
            const linkedCount = pumpHousePivots.filter((php) => php.pump_house_id === ph.id).length;
            return {
              label: ph.name,
              value: `${linkedCount} pivô(s)`,
              sub: ph.status === "ativa" ? "Operando" : ph.status === "manutencao" ? "Manutenção" : "Inativa",
            };
          })}
          emptyText="Nenhuma casa de bomba cadastrada"
        />
      </div>

      {statusPieData.length > 0 && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Distribuição de Status</h3>
          <div className="flex flex-wrap gap-6">
            {statusPieData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.name}: <strong className="text-graphite-900 dark:text-white">{item.value}</strong></span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Mapa Tab ──────────────────────────────────────────────────────────

function MapaTab({
  pivots,
  statusCounts,
}: {
  pivots: PivotRecord[];
  statusCounts: Record<string, number>;
}) {
  const mapPivots = useMemo(
    () =>
      pivots
        .filter((p) => p.latitude && p.longitude)
        .map((p) => ({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
          radiusMeters: radiusFromArea(p.area),
        })),
    [pivots]
  );

  const pivotsWithCoordinates = pivots.filter((p) => p.latitude && p.longitude);

  if (pivotsWithCoordinates.length === 0) {
    return (
      <EmptyState
        title="Sem coordenadas de pivôs"
        description="Os pivôs cadastrados não possuem coordenadas geográficas. Edite os pivôs para adicionar latitude e longitude."
        icon={
          <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        }
      />
    );
  }

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

      <PivotMap pivots={mapPivots} className="h-[500px] w-full rounded-lg border border-gray-200 dark:border-graphite-700" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {pivots.map((p) => {
          const conf = STATUS_COLORS[p.status] || STATUS_COLORS.parado;
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
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{p.area.toFixed(0)} ha · {p.flow_rate} m³/h</p>
                {p.manufacturer && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">{p.manufacturer}{p.model ? ` ${p.model}` : ""}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Operações Tab ─────────────────────────────────────────────────────

function OperacoesTab({
  pivots,
  irrigatingCount,
  alertCount,
  maintenanceCount,
}: {
  pivots: PivotRecord[];
  irrigatingCount: number;
  alertCount: number;
  maintenanceCount: number;
}) {
  const stoppedCount = pivots.filter((p) => p.status === "parado").length;

  const irrigating = pivots.filter((p) => p.status === "irrigando");
  const alerts = pivots.filter((p) => p.status === "alerta");
  const maintenance = pivots.filter((p) => p.status === "manutencao");
  const stopped = pivots.filter((p) => p.status === "parado");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard metric={{ id: "running", title: "Irrigando", value: String(irrigatingCount), description: "Em operação agora" }} />
        <StatCard metric={{ id: "stopped", title: "Parados", value: String(stoppedCount), description: "Aguardando" }} />
        <StatCard metric={{ id: "alerts", title: "Alertas", value: String(alertCount), description: "Requerem atenção", trend: alertCount > 0 ? "negative" : "positive" }} />
        <StatCard metric={{ id: "maint", title: "Manutenção", value: String(maintenanceCount), description: "Em manutenção", trend: maintenanceCount > 0 ? "negative" : "positive" }} />
      </div>

      {alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20">
          <h3 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">Pivôs em Alerta</h3>
          <div className="space-y-2">
            {alerts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/60 p-3 dark:bg-graphite-800/60">
                <div>
                  <span className="text-sm font-medium text-graphite-900 dark:text-white">{p.name}</span>
                  <p className="text-xs text-red-600 dark:text-red-400">{p.area.toFixed(0)} ha · {p.flow_rate} m³/h</p>
                </div>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                  Alerta
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Irrigações em Andamento</h3>
          {irrigating.length > 0 ? (
            <div className="space-y-2">
              {irrigating.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                  <div>
                    <span className="text-sm font-medium text-graphite-900 dark:text-white">{p.name}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {p.area.toFixed(0)} ha · {p.flow_rate} m³/h · {p.pump_power} CV
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                    Irrigando
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum pivô irrigando no momento</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Pivôs Parados</h3>
          {stopped.length > 0 ? (
            <div className="space-y-2">
              {stopped.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-graphite-800">
                  <div>
                    <span className="text-sm font-medium text-graphite-900 dark:text-white">{p.name}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {p.area.toFixed(0)} ha · {p.flow_rate} m³/h
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-graphite-700 dark:text-gray-400">
                    Parado
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Todos os pivôs estão em operação</p>
          )}
        </Card>
      </div>

      {maintenance.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-orange-700 dark:text-orange-400">Em Manutenção</h3>
          <div className="space-y-2">
            {maintenance.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-orange-50 p-3 dark:bg-orange-900/20">
                <div>
                  <span className="text-sm font-medium text-graphite-900 dark:text-white">{p.name}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p.area.toFixed(0)} ha · {p.manufacturer ?? ""}
                  </p>
                </div>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                  Manutenção
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Indicadores Tab ───────────────────────────────────────────────────

function IndicadoresTab({
  pivots,
  totalArea,
  irrigatingArea,
  irrigatingCount,
  reservoirs,
  pumpHouses,
}: {
  pivots: PivotRecord[];
  totalArea: number;
  irrigatingArea: number;
  irrigatingCount: number;
  reservoirs: ReservoirRecord[];
  pumpHouses: PumpHouseRecord[];
}) {
  const irrigationPct = totalArea > 0 ? Math.round((irrigatingArea / totalArea) * 100) : 0;
  const avgArea = pivots.length > 0 ? (totalArea / pivots.length).toFixed(1) : "0";
  const avgFlowRate = pivots.length > 0 ? (pivots.reduce((s, p) => s + p.flow_rate, 0) / pivots.length).toFixed(1) : "0";
  const totalPower = pivots.reduce((s, p) => s + p.pump_power, 0);
  const avgEfficiency = pivots.length > 0 ? (pivots.reduce((s, p) => s + p.efficiency, 0) / pivots.length * 100).toFixed(1) : "0";

  const totalReservoirCapacity = reservoirs.reduce((s, r) => s + r.max_capacity, 0);
  const totalReservoirVolume = reservoirs.reduce((s, r) => s + r.current_volume, 0);
  const reservoirPct = totalReservoirCapacity > 0 ? Math.round((totalReservoirVolume / totalReservoirCapacity) * 100) : 0;

  const totalPumpPower = pumpHouses.reduce((s, ph) => s + ph.power_kw, 0);

  const indicators = [
    {
      group: "Pivôs",
      items: [
        { label: "Total", value: String(pivots.length) },
        { label: "Irrigando", value: `${irrigatingCount} (${irrigationPct}%)` },
        { label: "Área Média", value: `${avgArea} ha` },
        { label: "Vazão Média", value: `${avgFlowRate} m³/h` },
      ],
    },
    {
      group: "Potência",
      items: [
        { label: "Total Pivôs (CV)", value: totalPower.toFixed(0) },
        { label: "Eficiência Média", value: `${avgEfficiency}%` },
        { label: "Casas de Bomba (kW)", value: totalPumpPower.toFixed(0) },
      ],
    },
    {
      group: "Área",
      items: [
        { label: "Área Total", value: `${totalArea.toFixed(0)} ha` },
        { label: "Irrigando", value: `${irrigatingArea.toFixed(0)} ha` },
        { label: "Pendente", value: `${(totalArea - irrigatingArea).toFixed(0)} ha` },
      ],
    },
    {
      group: "Reservatórios",
      items: reservoirs.length > 0
        ? [
            { label: "Total", value: String(reservoirs.length) },
            { label: "Capacidade", value: `${totalReservoirCapacity.toLocaleString("pt-BR")} m³` },
            { label: "Volume Atual", value: `${totalReservoirVolume.toLocaleString("pt-BR")} m³ (${reservoirPct}%)` },
          ]
        : [{ label: "Status", value: "Nenhum cadastrado" }],
    },
    {
      group: "Casas de Bomba",
      items: pumpHouses.length > 0
        ? [
            { label: "Total", value: String(pumpHouses.length) },
            { label: "Potência Total", value: `${totalPumpPower.toFixed(0)} kW` },
            { label: "Ativas", value: String(pumpHouses.filter((ph) => ph.status === "ativa").length) },
          ]
        : [{ label: "Status", value: "Nenhuma cadastrada" }],
    },
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
        <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Detalhamento por Pivô</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-graphite-700">
                <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Pivô</th>
                <th className="pb-2 pr-4 text-right font-semibold text-gray-500 dark:text-gray-400">Área (ha)</th>
                <th className="pb-2 pr-4 text-right font-semibold text-gray-500 dark:text-gray-400">Vazão (m³/h)</th>
                <th className="pb-2 pr-4 text-right font-semibold text-gray-500 dark:text-gray-400">Potência (CV)</th>
                <th className="pb-2 pr-4 text-right font-semibold text-gray-500 dark:text-gray-400">Eficiência</th>
                <th className="pb-2 font-semibold text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {pivots.map((p) => {
                const conf = STATUS_COLORS[p.status] || STATUS_COLORS.parado;
                return (
                  <tr key={p.id} className="border-b border-gray-100 dark:border-graphite-800">
                    <td className="py-2 pr-4 font-medium text-graphite-900 dark:text-white">{p.name}</td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">{p.area.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">{p.flow_rate.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">{p.pump_power.toFixed(0)}</td>
                    <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-300">{(p.efficiency * 100).toFixed(0)}%</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.bg} text-white`}>
                        {conf.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
