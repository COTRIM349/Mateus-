"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, EmptyState } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { useImplantationStatus, useFarmHydricState } from "@/lib/hooks";
import { ImplantationGuide } from "@/components/onboarding";
import { HydricMapLegend } from "@/components/maps/HydricMapLegend";
import { HydricMapOverlay } from "@/components/maps/HydricMapOverlay";
import { HydricStatusBadge } from "@/components/maps/HydricStatusBadge";
import { countMapStatuses, hydricDemandSummary, hydricMapDates, hydricMapStates, hydricStateId, mapStatusOf, toHydricMapMarkers } from "@/components/maps/hydric-map-markers";
import { formatParcelAngles } from "@/modules/assignment/services/parcel-geometry";
import {
  HYDRIC_STATUS_CONFIG,
  MAP_HYDRIC_COLORS,
  type PivotHydricState,
  type FarmHydricSummary,
} from "@/modules/water-balance/services";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  { ssr: false, loading: () => <div className="flex h-[min(78vh,760px)] min-h-[560px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-white/[0.06] dark:bg-graphite-800"><p className="text-sm text-graphite-400">Carregando mapa...</p></div> }
);

const TABS = [
  { id: "painel", label: "Dashboard Operacional" },
  { id: "mapa", label: "Mapa Hídrico" },
];

// ── Page ──────────────────────────────────────────────────────────────

type DashboardModulePivot = {
  id: string;
  module_id: string | null;
  name: string;
  area: number | null;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  active: boolean;
};

type DashboardModule = {
  id: string;
  name: string;
};

export default function DashboardPage() {
  const { profile, farms, activeFarmId } = useAuth();

  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const [activeTab, setActiveTab] = useState("painel");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("modo") === "painel") {
      setActiveTab("mapa");
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const implantation = useImplantationStatus();
  const { states, summary, loading } = useFarmHydricState();

  if (implantation.loading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
      </div>
    );
  }


  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          titulo="Centro de Controle Operacional"
          descricao={activeFarm ? `${activeFarm.name} · Balanço hídrico em tempo real` : "Balanço hídrico da operação"}
        />
        <button
          type="button"
          onClick={() => setActiveTab("mapa")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 dark:border-brand-500/30 dark:bg-graphite-900 dark:text-brand-300"
        >
          <span className="text-base">⛶</span>
          Modo Painel
        </button>
      </div>

      {profile && implantation.foundationComplete && summary && (
        <Card className="border-brand-200/60 bg-gradient-to-r from-brand-50 to-white dark:border-brand-500/20 dark:from-brand-900/30 dark:to-graphite-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">
                Bom dia, {profile.name.split(" ")[0]}!
              </p>
              <p className="mt-1 text-sm text-graphite-400 dark:text-gray-500">
                {summary.needIrrigationToday} pivô(s) para irrigar hoje · {summary.attention} em atenção · {summary.adequate} adequado(s)
              </p>
            </div>
          </div>
        </Card>
      )}

      {!implantation.foundationComplete ? (
        <ImplantationGuide
          steps={implantation.foundationSteps}
          progress={implantation.progress}
          nextStep={implantation.nextStep}
        />
      ) : !summary || summary.totalPivots === 0 ? (
        <EmptyState
          title="Nenhum pivô para calcular"
          description="Cadastre pivôs e suas vinculações operacionais para visualizar o balanço hídrico."
          actionLabel="Ir para Vinculação"
          onAction={() => { window.location.href = "/vinculacao"; }}
        />
      ) : (
        <>
          {summary.noData > 0 && (
            <Card className="border-amber-100 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-900/10">
              <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-400">
                {summary.noData} pivô(s) sem dados suficientes para cálculo (vínculo, fases da cultura ou clima ausentes). Complete os cadastros para incluí-los no balanço.
              </p>
            </Card>
          )}

          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "painel" && <div className="animate-in"><PainelTab summary={summary} /></div>}
          {activeTab === "mapa" && <div className="animate-in"><DashboardPanelMode states={states} farmName={activeFarm?.name ?? "Fazenda"} activeFarmId={activeFarmId} onExit={() => setActiveTab("painel")} /></div>}
        </>
      )}
    </div>
  );
}


function panelVisual(moisturePctCc: number | null | undefined) {
  const value = moisturePctCc ?? 0;
  if (value >= 95) return { color: "#1877d3", label: "CAP. CAMPO", text: "text-blue-700", bg: "bg-blue-50", ring: "#1877d3" };
  if (value >= 90) return { color: "#16a34a", label: "IDEAL", text: "text-green-700", bg: "bg-green-50", ring: "#16a34a" };
  if (value >= 85) return { color: "#f59e0b", label: "ATENÇÃO", text: "text-amber-700", bg: "bg-amber-50", ring: "#f59e0b" };
  if (value >= 70) return { color: "#ef4444", label: "DÉFICIT", text: "text-red-700", bg: "bg-red-50", ring: "#ef4444" };
  return { color: "#171717", label: "CRÍTICO", text: "text-neutral-800", bg: "bg-neutral-100", ring: "#171717" };
}

function DashboardPanelMode({
  states,
  farmName,
  activeFarmId,
  onExit,
}: {
  states: PivotHydricState[];
  farmName: string;
  activeFarmId: string | null;
  onExit: () => void;
}) {
  const [modulePivots, setModulePivots] = useState<DashboardModulePivot[]>([]);
  const [modules, setModules] = useState<DashboardModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [selectedPivotId, setSelectedPivotId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState("Todos");
  const [viewMode, setViewMode] = useState<"painel" | "lista">("painel");

  useEffect(() => {
    let cancelled = false;

    async function loadModules() {
      if (!activeFarmId) {
        if (!cancelled) {
          setModulePivots([]);
          setModules([]);
          setModulesLoading(false);
        }
        return;
      }

      setModulesLoading(true);
      try {
        const supabase = createClient();
        const [{ data: pivotsData, error: pivotsError }, { data: modulesData, error: modulesError }] = await Promise.all([
          supabase
            .from("pivots")
            .select("id,module_id,name,area,latitude,longitude,radius,active")
            .eq("farm_id", activeFarmId)
            .eq("active", true)
            .order("name", { ascending: true }),
          supabase
            .from("production_modules")
            .select("id,name")
            .eq("farm_id", activeFarmId)
            .in("name", ["M1", "M2", "M3"])
            .order("name", { ascending: true }),
        ]);

        if (pivotsError) throw pivotsError;
        if (modulesError) throw modulesError;

        if (!cancelled) {
          setModulePivots((pivotsData ?? []) as DashboardModulePivot[]);
          setModules((modulesData ?? []) as DashboardModule[]);
        }
      } catch (err) {
        console.error("Falha ao carregar módulos do Dashboard:", err);
        if (!cancelled) {
          setModulePivots([]);
          setModules([]);
        }
      } finally {
        if (!cancelled) setModulesLoading(false);
      }
    }

    void loadModules();
    return () => {
      cancelled = true;
    };
  }, [activeFarmId]);

  const pivotById = useMemo(
    () => new Map(modulePivots.map((pivot) => [pivot.id, pivot])),
    [modulePivots],
  );

  const moduleNameById = useMemo(
    () => new Map(modules.map((module) => [module.id, module.name?.toUpperCase()])),
    [modules],
  );

  const hydricByPivot = useMemo(() => {
    const base = toHydricMapMarkers(states);
    const byPivot = new Map<string, typeof base>();

    for (const marker of base) {
      const state = states.find((s) => hydricStateId(s) === marker.id);
      if (!state) continue;
      const visual = panelVisual(state.current?.moisturePctCc);
      const list = byPivot.get(state.pivotId) ?? [];
      list.push({ ...marker, color: visual.color, statusLabel: visual.label });
      byPivot.set(state.pivotId, list);
    }
    return byPivot;
  }, [states]);

  const selectedPivot = modulePivots.find((pivot) => pivot.id === selectedPivotId) ?? null;
  const selectedState = states.find((state) => state.pivotId === selectedPivotId && state.current)
    ?? states.find((state) => state.pivotId === selectedPivotId)
    ?? null;

  const stateMetrics = useMemo(() => {
    return states
      .filter((state) => state.current)
      .map((state) => {
        const current = state.current!;
        const pivot = pivotById.get(state.pivotId);
        const area = pivot?.area ?? 0;
        const moisture = current.moisturePctCc ?? 0;
        const depth = Math.max(0, current.recommendedGrossDepth ?? 0);
        const volume = depth * area * 10;
        const moduleName = pivot?.module_id ? moduleNameById.get(pivot.module_id) ?? "—" : "—";
        const category = moisture < 85 ? "deficit" : moisture < 90 ? "atencao" : "manejo";

        return {
          state,
          current,
          pivot,
          area,
          moisture,
          depth,
          volume,
          moduleName,
          category,
        };
      })
      .sort((a, b) => a.moisture - b.moisture);
  }, [states, pivotById, moduleNameById]);

  const farmSummary = useMemo(() => {
    const totalArea = modulePivots.reduce((sum, pivot) => sum + (pivot.area ?? 0), 0);
    const managedArea = stateMetrics.reduce((sum, item) => sum + item.area, 0);
    const weightedCc = managedArea > 0
      ? stateMetrics.reduce((sum, item) => sum + item.moisture * item.area, 0) / managedArea
      : 0;
    const irrigating = stateMetrics.filter((item) => item.depth > 0);
    const irrigatingArea = irrigating.reduce((sum, item) => sum + item.area, 0);
    const totalVolume = irrigating.reduce((sum, item) => sum + item.volume, 0);
    const meanDepth = irrigatingArea > 0
      ? irrigating.reduce((sum, item) => sum + item.depth * item.area, 0) / irrigatingArea
      : 0;

    return {
      totalArea,
      weightedCc,
      deficit: stateMetrics.filter((item) => item.category === "deficit").length,
      irrigatingArea,
      totalVolume,
      meanDepth,
    };
  }, [modulePivots, stateMetrics]);

  const moduleCards = useMemo(() => {
    const preferred = ["M1", "M2", "M3"];

    return preferred.map((moduleName) => {
      const module = modules.find((item) => item.name?.toUpperCase() === moduleName);
      const pivots = module ? modulePivots.filter((pivot) => pivot.module_id === module.id) : [];
      const pivotIds = new Set(pivots.map((pivot) => pivot.id));
      const metrics = stateMetrics.filter((item) => pivotIds.has(item.state.pivotId));

      const markers = pivots
        .filter((pivot) => pivot.latitude != null && pivot.longitude != null)
        .flatMap((pivot) => {
          const activeMarkers = hydricByPivot.get(pivot.id);
          if (activeMarkers?.length) return activeMarkers;

          return [{
            id: `module-equipment-${pivot.id}`,
            name: pivot.name,
            latitude: pivot.latitude as number,
            longitude: pivot.longitude as number,
            radiusMeters: pivot.radius,
            active: pivot.active,
            color: MAP_HYDRIC_COLORS.gray,
            statusLabel: "Sem manejo hídrico",
          }];
        });

      const totalArea = pivots.reduce((sum, pivot) => sum + (pivot.area ?? 0), 0);
      const managedArea = metrics.reduce((sum, item) => sum + item.area, 0);
      const weightedCc = managedArea > 0
        ? metrics.reduce((sum, item) => sum + item.moisture * item.area, 0) / managedArea
        : 0;
      const irrigating = metrics.filter((item) => item.depth > 0);
      const irrigatingArea = irrigating.reduce((sum, item) => sum + item.area, 0);
      const totalVolume = irrigating.reduce((sum, item) => sum + item.volume, 0);
      const meanDepth = irrigatingArea > 0
        ? irrigating.reduce((sum, item) => sum + item.depth * item.area, 0) / irrigatingArea
        : 0;

      return {
        name: moduleName,
        pivots,
        markers,
        totalArea,
        weightedCc,
        deficit: metrics.filter((item) => item.category === "deficit").length,
        attention: metrics.filter((item) => item.category === "atencao").length,
        managed: metrics.filter((item) => item.category === "manejo").length,
        irrigatingArea,
        totalVolume,
        meanDepth,
      };
    });
  }, [modules, modulePivots, hydricByPivot, stateMetrics]);

  const priorities = useMemo(
    () => stateMetrics.filter((item) => item.depth > 0 && (moduleFilter === "Todos" || item.moduleName === moduleFilter)).slice(0, 5),
    [stateMetrics, moduleFilter],
  );

  const formatNumber = (value: number, digits = 0) =>
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  return (
    <div className="w-full min-w-0 bg-white text-[#163536]">
      <main className="space-y-4 rounded-2xl border border-[#d7e7e2] bg-white p-3 sm:p-4 lg:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0ebe6] pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#e8f3ed] p-2 text-[#064b32]"><span aria-hidden="true" className="text-2xl">▧</span></div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#064b32] sm:text-2xl">Mapa Hídrico</h1>
              <p className="text-xs text-[#405a55] sm:text-sm">Gestão da umidade do solo e prioridade de irrigação por pivô</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-[#bcd8d1] text-xs font-bold">
              <button type="button" onClick={()=>setViewMode("painel")} className={`px-4 py-2.5 ${viewMode==="painel"?"bg-[#065c38] text-white":"bg-white text-[#075c40]"}`}>▣ Modo Painel</button>
              <button type="button" onClick={()=>setViewMode("lista")} className={`px-4 py-2.5 ${viewMode==="lista"?"bg-[#065c38] text-white":"bg-white text-[#075c40]"}`}>☷ Modo Lista</button>
            </div>
            <label className="sr-only" htmlFor="map-module-filter">Módulo</label>
            <select id="map-module-filter" value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)} className="rounded-lg border border-[#cbded8] bg-white px-2 py-2 text-xs font-semibold text-[#075c40]">
              <option value="Todos">Todos os módulos</option><option value="M1">M1</option><option value="M2">M2</option><option value="M3">M3</option>
            </select>
          </div>
        </header>
        {viewMode === "painel" && <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(205px,0.7fr)]">
          {moduleCards.filter(module=>moduleFilter==="Todos"||module.name===moduleFilter).map((module) => (
            <article
              key={module.name}
              className="min-w-0 overflow-hidden rounded-xl border border-[#d7e7e2] bg-white shadow-[0_3px_12px_rgba(4,74,65,0.07)]"
            >
              <div className="bg-[#065c38] px-3 py-2.5 text-white">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-white/10 px-2 py-1 text-lg font-black text-white">
                      {module.name}
                    </span>
                    <span className="text-[11px] font-semibold text-white/90">
                      {module.pivots.length} pivôs
                    </span>
                    <span className="h-4 w-px bg-white/40" />
                    <span className="text-[11px] font-bold text-white/90">
                      {formatNumber(module.totalArea)} ha
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-white">
                    <span className="inline-block h-7 w-7 rounded-full border-[5px] border-[#57d67e] border-r-white/30" />
                    <span className="text-sm font-black">{formatNumber(module.weightedCc)}%</span>
                    <span className="text-[8px] font-bold text-white/80">CC</span>
                  </div>
                </div>


              </div>

              {modulesLoading ? (
                <div className="flex h-[250px] items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
                </div>
              ) : module.markers.length > 0 ? (
                <PivotMap
                  pivots={module.markers}
                  onSelect={(id) => setSelectedPivotId(id.startsWith("module-equipment-") ? id.slice("module-equipment-".length) : states.find((state) => hydricStateId(state) === id)?.pivotId ?? null)}
                  interactive
                  className="h-[230px] w-full rounded-none border-0 xl:h-[260px]"
                />
              ) : (
                <div className="flex h-[250px] items-center justify-center text-xs text-gray-400">
                  Nenhum pivô com coordenadas em {module.name}.
                </div>
              )}
            </article>
          ))}
          <article className="rounded-xl border border-[#d7e7e2] bg-white p-3 shadow-sm md:col-span-2 xl:col-span-1">
            <h2 className="-mx-1 mb-4 rounded-lg bg-[#065c38] px-3 py-2 text-sm font-bold text-white">Situação dos Pivôs (%CC)</h2>
            <div className="space-y-3">{[
              { label: "≥ 95%", min: 95, max: Infinity, color: "#1877d3" },
              { label: "90–95%", min: 90, max: 95, color: "#16a34a" },
              { label: "82–90%", min: 82, max: 90, color: "#facc15" },
              { label: "70–82%", min: 70, max: 82, color: "#ef4444" },
              { label: "< 70%", min: -Infinity, max: 70, color: "#111827" },
            ].map((band) => {
              const count = stateMetrics.filter((item) => item.moisture >= band.min && item.moisture < band.max).length;
              return <div key={band.label} className="flex items-center gap-2 text-xs"><span className="h-3.5 w-3.5 rounded-full" style={{backgroundColor:band.color}}/><span className="flex-1">{band.label}</span><strong>{count}</strong></div>;
            })}</div>
          </article>
        </section>}

        {viewMode === "lista" && <section className="rounded-xl border border-[#d7e7e2] bg-white p-4"><h2 className="mb-3 text-sm font-bold text-[#064b32]">Pivôs por condição hídrica</h2><div className="space-y-2">{stateMetrics.filter(item=>moduleFilter==="Todos"||item.moduleName===moduleFilter).map(item=><button key={hydricStateId(item.state)} type="button" onClick={()=>setSelectedPivotId(item.state.pivotId)} className="flex w-full items-center justify-between rounded-lg border border-[#e0ebe6] p-3 text-left text-sm hover:bg-[#f0f8f3]"><span className="font-semibold">{item.state.pivotName} · {item.moduleName}</span><span>{formatNumber(item.moisture)}% CC · {formatNumber(item.depth,1)} mm</span></button>)}</div></section>}
        {selectedPivotId && (
          <div className="fixed inset-0 z-[1000] flex justify-end bg-black/40" onClick={() => setSelectedPivotId(null)}>
            <aside role="dialog" aria-modal="true" aria-label="Dados do pivô" className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-[#075c59]">Dados do pivô e da água</h2>
                <button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedPivotId(null)} className="rounded-lg border px-3 py-1 text-sm">Fechar ×</button>
              </div>
              {selectedState ? <PivotDetail state={selectedState} /> : (
                <div className="space-y-3 rounded-xl border p-4 text-sm">
                  <h3 className="font-bold">{selectedPivot?.name ?? "Pivô"}</h3>
                  <p>Módulo: {modules.find((m) => m.id === selectedPivot?.module_id)?.name ?? "—"}</p>
                  <p>Área: {selectedPivot?.area != null ? `${formatNumber(selectedPivot.area)} ha` : "—"}</p>
                  <p className="text-amber-700">Sem manejo hídrico ativo. Não há dados de água disponíveis para este pivô.</p>
                </div>
              )}
              <a href="/balanco-hidrico" className="mt-4 block rounded-lg bg-[#075c59] px-4 py-3 text-center text-sm font-bold text-white">Abrir manejo hídrico</a>
            </aside>
          </div>
        )}

        {viewMode === "painel" && <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.8fr)]">
          <article className="min-w-0 rounded-xl border border-[#d7e7e2] bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-black text-[#064b32]">Situação da Área ({formatNumber(farmSummary.totalArea)} ha)</h2>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: (() => {
                const bands = [
                  { min: 95, max: Infinity, color: "#1877d3" },
                  { min: 90, max: 95, color: "#16a34a" },
                  { min: 82, max: 90, color: "#facc15" },
                  { min: 70, max: 82, color: "#ef4444" },
                  { min: -Infinity, max: 70, color: "#111827" },
                ];
                const area = stateMetrics.reduce((sum, item) => sum + item.area, 0);
                let cumulative = 0;
                const stops = bands.map((band) => {
                  const start = cumulative;
                  cumulative += area > 0 ? stateMetrics.filter(item => item.moisture >= band.min && item.moisture < band.max).reduce((sum, item) => sum + item.area, 0) / area * 100 : 0;
                  return `${band.color} ${start}% ${cumulative}%`;
                });
                return area > 0 ? `conic-gradient(${stops.join(", ")})` : "#e5e7eb";
              })() }}>
                <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl">{formatNumber(farmSummary.weightedCc)}%</strong><span className="text-[10px]">%CC médio</span></div>
              </div>
              <div className="min-w-[150px] flex-1 space-y-2 text-xs">
                {[
                  {label:"Capacidade de campo (≥95%)",min:95,max:Infinity,color:"#1877d3"},
                  {label:"Ideal (90–95%)",min:90,max:95,color:"#16a34a"},
                  {label:"Atenção (82–90%)",min:82,max:90,color:"#facc15"},
                  {label:"Déficit (70–82%)",min:70,max:82,color:"#ef4444"},
                  {label:"Crítico (<70%)",min:-Infinity,max:70,color:"#111827"},
                ].map(band=><div key={band.label} className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded" style={{backgroundColor:band.color}}/><span className="flex-1">{band.label}</span><strong>{formatNumber(stateMetrics.filter(i=>i.moisture>=band.min&&i.moisture<band.max).reduce((a,i)=>a+i.area,0))} ha</strong></div>)}
              </div>
            </div>
          </article>
          <article className="rounded-xl border border-[#d7e7e2] bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#e4efeb] pb-3"><h2 className="text-base font-black text-[#064b32]">Pivôs – Prioridade de Irrigação</h2><a href="/programacao-irrigacao" className="rounded-lg border border-[#065c38] px-3 py-2 text-xs font-bold text-[#065c38]">Ver programação →</a></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-[#065c38] text-white"><tr><th className="p-2">#</th><th className="p-2">Pivô</th><th className="p-2">Módulo</th><th className="p-2">Área (ha)</th><th className="p-2">%CC</th><th className="p-2">Lâmina (mm)</th></tr></thead>
              <tbody>{priorities.map((item, index) => (
                <tr key={hydricStateId(item.state)} onClick={() => setSelectedPivotId(item.state.pivotId)} className="cursor-pointer border-t border-[#e7efec] hover:bg-[#f0f8f5]">
                  <td className="p-2">{index + 1}º</td><td className="p-2 font-bold">{item.state.pivotName}</td><td className="p-2">{item.moduleName}</td><td className="p-2">{formatNumber(item.area, 1)}</td><td className="p-2">{formatNumber(item.moisture)}%</td><td className="p-2">{formatNumber(item.depth, 1)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          </article>
        </section>}
      </main>
    </div>
  );
}

function KpiTile({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="flex min-h-[72px] items-center gap-2.5 rounded-xl border border-[#d7e7e2] bg-white px-3.5 shadow-sm">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-base font-black tracking-tight lg:text-lg">{value}</div>
        <div className="mt-0.5 text-[10px] font-semibold text-gray-500">{label}</div>
      </div>
    </div>
  );
}


// ── Dashboard Operacional (item 16) ───────────────────────────────────

function PainelTab({ summary }: { summary: FarmHydricSummary }) {
  const kpis = [
    { id: "total", title: "Total de Pivôs", value: String(summary.totalPivots), description: "Com cálculo de balanço" },
    { id: "irrigar", title: "Irrigar Hoje", value: String(summary.needIrrigationToday), description: "Déficit ≥ AFD", trend: summary.needIrrigationToday > 0 ? "negative" as const : "positive" as const },
    { id: "atencao", title: "Em Atenção", value: String(summary.attention), description: "Próximo do limite de ação (AFD)", trend: summary.attention > 0 ? "neutral" as const : "positive" as const },
    { id: "adequado", title: "Abaixo do nível de ação", value: String(summary.adequate), description: "Sem acionamento pela AFD; não significa solo na CC", trend: "neutral" as const },
    { id: "area_irrig", title: "Área Total", value: `${summary.totalIrrigatedArea.toFixed(0)} ha`, description: "Sob balanço hídrico" },
    { id: "area_def", title: "Área em Déficit", value: `${summary.areaInDeficit.toFixed(0)} ha`, description: "Fora da condição adequada" },
    { id: "lamina", title: "Lâmina Média", value: `${summary.avgRecommendedDepth.toFixed(1)} mm`, description: "Recomendada (bruta)" },
    { id: "deficit", title: "Déficit Médio", value: `${summary.avgDeficit.toFixed(1)} mm`, description: "Média da fazenda" },
    { id: "volume", title: "Volume Total", value: `${summary.totalRecommendedVolume.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m³`, description: "Água recomendada hoje" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.id} metric={k} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-[13px] font-bold tracking-tight text-[#075c59] dark:text-white">Situação dos pivôs</h3><p className="mb-4 text-xs text-gray-500">Uma orientação por pivô, baseada no limite de manejo. O %CC informa a umidade atual.</p>
          {summary.ranking.length > 0 ? (
            <div className="space-y-2">
              {summary.ranking.slice(0, 8).map((s, i) => (
                <RankRow key={hydricStateId(s)} rank={i + 1} state={s} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-graphite-400 dark:text-gray-500">Sem pivôs com dados de balanço.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-[13px] font-bold tracking-tight text-[#075c59] dark:text-white">Irrigação prioritária</h3><p className="mb-4 text-xs text-gray-500">Pivôs que atingiram o limite de manejo e precisam de ação.</p>
          {summary.priorityList.length > 0 ? (
            <div className="space-y-2">
              {summary.priorityList.map((s, i) => (
                <div key={hydricStateId(s)} className="flex items-center justify-between rounded-xl bg-red-50/80 p-3.5 dark:bg-red-900/10">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-graphite-900 dark:text-white">{s.pivotName}</span>
                      <p className="text-xs text-graphite-400 dark:text-gray-500">{s.cultureName} · {s.current!.phase}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tracking-tight text-graphite-900 dark:text-white">{s.current!.recommendedGrossDepth.toFixed(1)} mm</p>
                    <p className="text-xs text-graphite-400 dark:text-gray-500">déficit {s.current!.deficit.toFixed(1)} mm</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-graphite-400 dark:text-gray-500">Nenhum pivô atingiu o nível de ação pela AFD hoje. Confira também a condição de %CC no mapa.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function RankRow({ rank, state }: { rank: number; state: PivotHydricState }) {
  const c = state.current!;
  const cc = c.moisturePctCc;
  const ccValid = cc != null && Number.isFinite(cc);
  const needsIrrigation = c.status === "vermelho";
  const attention = c.status === "amarelo";
  const lowMoisture = ccValid && cc < 90;
  const action = needsIrrigation
    ? { label: "IRRIGAR", color: "#b91c1c", background: "#fee2e2" }
    : attention || lowMoisture
      ? { label: "MONITORAR", color: "#92400e", background: "#fef3c7" }
      : { label: "ADEQUADO", color: "#166534", background: "#dcfce7" };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50/80 p-3.5 transition-colors duration-100 hover:bg-gray-100/60 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-5 text-center text-xs font-bold text-graphite-300 dark:text-graphite-600">{rank}</span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: action.color }} />
        <div>
          <span className="text-sm font-medium text-graphite-900 dark:text-white">{state.pivotName}</span>
          <p className="text-xs text-graphite-400 dark:text-gray-500">{state.cultureName} · {c.phase}</p>
        </div>
      </div>
      <div className="text-right">
        <span className="inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ color: action.color, backgroundColor: action.background }}>{action.label}</span>
        <p className="mt-1 text-xs text-gray-600">{ccValid ? `${cc.toFixed(0)}% CC` : "CC indisponível"} · depleção {(c.depletion * 100).toFixed(0)}%</p>
      </div>
    </div>
  );
}

// ── Mapa Hídrico (item 17) ────────────────────────────────────────────

function MapaHidricoTab({ states }: { states: PivotHydricState[] }) {
  const dates = useMemo(() => hydricMapDates(states), [states]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(dates[dates.length - 1] ?? null);
  const activeDate = selectedDate ?? dates[dates.length - 1] ?? null;
  const mapStates = hydricMapStates(states);
  const selected = mapStates.find((s) => hydricStateId(s) === selectedId) ?? null;
  const mapPivots = useMemo(() => toHydricMapMarkers(states, activeDate), [states, activeDate]);
  const counts = countMapStatuses(states, activeDate);
  const demand = hydricDemandSummary(states, activeDate);
  const hasCoords = mapPivots.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-card dark:border-white/[0.06]">
      {hasCoords ? (
        <>
          <div className="relative">
            <PivotMap
              pivots={mapPivots}
              highlightId={selectedId ?? undefined}
              onSelect={setSelectedId}
              className="h-[min(72vh,700px)] min-h-[520px] w-full rounded-none border-0"
            />
            {selected ? (
              <HydricMapOverlay onClose={() => setSelectedId(null)}>
                <PivotDetail state={selected} />
              </HydricMapOverlay>
            ) : null}
          </div>
          <HydricMapLegend
            counts={counts}
            dates={dates}
            selectedDate={activeDate}
            onSelectDate={setSelectedDate}
            demand={demand}
          />
        </>
      ) : (
        <EmptyState
          title="Nenhum pivô com parcela ativa"
          description="O mapa hídrico mostra somente equipamentos com parcela em manejo. Cadastre ou reative uma parcela para o pivô voltar ao mapa."
        />
      )}
    </div>
  );
}

function DetailGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-graphite-400 dark:text-gray-500">{title}</h4>
      {rows.map(([label, value], i) => (
        <div key={label} className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs ${i % 2 === 0 ? "bg-gray-50/60 dark:bg-graphite-800/40" : ""}`}>
          <span className="text-graphite-400 dark:text-gray-500">{label}</span>
          <span className="font-medium text-graphite-900 dark:text-white">{value}</span>
        </div>
      ))}
    </section>
  );
}

function PivotDetail({ state }: { state: PivotHydricState }) {
  const c = state.current;
  const mapStatus = mapStatusOf(state);
  const dap = c?.dae ?? (state.plantingDate
    ? Math.max(0, Math.floor((Date.now() - new Date(state.plantingDate + "T12:00:00").getTime()) / 86400000))
    : null);

  if (!c) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-graphite-900 dark:text-white">{state.pivotName}</h3>
        <div className="mt-2">
          <HydricStatusBadge status={mapStatus} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-graphite-400 dark:text-gray-500">
          {state.sheetIncomplete
            ? "Ficha técnica incompleta: cadastre raio ou coordenadas do equipamento para desenhar a geometria real."
            : "Sem dados suficientes para o balanço. Verifique solo, clima e fases da cultura na parcela ativa."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">
          {state.parcelName?.trim() || state.pivotName}
        </h3>
        <HydricStatusBadge status={mapStatus} />
      </div>

      <DetailGroup
        title="Parcela"
        rows={[
          ["Pivô", state.pivotName],
          ["Quadrante", formatParcelAngles(state.startAngleDeg, state.endAngleDeg)],
          ["Cultura", state.cultureName + (state.varietyName ? ` (${state.varietyName})` : "")],
          ["Cultivar", state.varietyName ?? "—"],
          ["Plantio", state.plantingDate ? new Date(state.plantingDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"],
          ["DAP", dap != null ? `${dap} dias` : "—"],
          ["Estádio", c.phase],
          ["Área", `${state.area.toLocaleString("pt-BR")} ha`],
        ]}
      />

      <DetailGroup
        title="Solo"
        rows={[
          ["Perfil", state.soilName ?? "—"],
          ["ARM atual", `${c.storage.toFixed(1)} mm`],
          ["CC", `${c.fieldCapacity.toFixed(3)} cm³/cm³`],
          ["PMP", `${c.wiltingPoint.toFixed(3)} cm³/cm³`],
          ["CAD", `${c.adt.toFixed(1)} mm`],
          ["AFD", `${c.afd.toFixed(1)} mm`],
          ["Umidade atual", `${c.moisturePctCc.toFixed(0)}% CC`],
          ["Umidade de segurança", `${c.safetyPctCc.toFixed(0)}% CC`],
        ]}
      />

      <DetailGroup
        title="Água"
        rows={[
          ["Déficit atual", `${c.deficit.toFixed(1)} mm`],
          ["Irrigação do dia", `${c.irrigation.toFixed(1)} mm`],
          ["Chuva do dia", `${c.precipitation.toFixed(1)} mm`],
          ["ETc", `${c.etc.toFixed(1)} mm`],
          ["ETo", `${c.et0.toFixed(1)} mm`],
          ["Kc", c.kc.toFixed(2)],
          ["Ks", c.ks.toFixed(2)],
        ]}
      />

      <div className={`rounded-xl p-4 ${c.shouldIrrigate ? "bg-red-50/80 dark:bg-red-900/10" : "bg-green-50/80 dark:bg-green-900/10"}`}>
        <p className={`text-xs font-bold ${c.shouldIrrigate ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
          {c.shouldIrrigate ? "Irrigar hoje" : "Sem necessidade de irrigação hoje"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-graphite-500 dark:text-gray-400">{c.recommendationReason}</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
          <div><span className="text-graphite-400">Lâmina sugerida:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedGrossDepth.toFixed(1)} mm</strong></div>
          <div><span className="text-graphite-400">Prioridade:</span> <strong className="text-graphite-900 dark:text-white">{c.shouldIrrigate ? "Alta" : "Baixa"}</strong></div>
        </div>
      </div>
    </Card>
  );
}
