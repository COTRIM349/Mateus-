"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, EmptyState } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useImplantationStatus, useFarmHydricState } from "@/lib/hooks";
import { ImplantationGuide } from "@/components/onboarding";
import { HydricStatusBadge } from "@/components/maps/HydricStatusBadge";
import { VisionMapPanel } from "@/components/maps/VisionMapPanel";
import { hydricMapDates, hydricMapStates, hydricStateId, mapStatusOf } from "@/components/maps/hydric-map-markers";
import { formatParcelAngles } from "@/modules/assignment/services/parcel-geometry";
import {
  HYDRIC_STATUS_CONFIG,
  type PivotHydricState,
  type FarmHydricSummary,
} from "@/modules/water-balance/services";

const TABS = [
  { id: "painel", label: "Dashboard Operacional" },
  { id: "mapa", label: "Mapa Vision" },
];

// ── Page ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { profile, farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const [activeTab, setActiveTab] = useState("painel");

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
      <PageHeader
        titulo="Centro de Controle Operacional"
        descricao={activeFarm ? `${activeFarm.name} · Balanço hídrico em tempo real` : "Balanço hídrico da operação"}
      />

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
          {activeTab === "mapa" && <div className="animate-in"><MapaHidricoTab states={states} /></div>}
        </>
      )}
    </div>
  );
}

// ── Dashboard Operacional (item 16) ───────────────────────────────────

function PainelTab({ summary }: { summary: FarmHydricSummary }) {
  const kpis = [
    { id: "total", title: "Total de Pivôs", value: String(summary.totalPivots), description: "Com cálculo de balanço" },
    { id: "irrigar", title: "Irrigar Hoje", value: String(summary.needIrrigationToday), description: "Déficit ≥ AFD", trend: summary.needIrrigationToday > 0 ? "negative" as const : "positive" as const },
    { id: "atencao", title: "Em Atenção", value: String(summary.attention), description: "70–100% da AFD", trend: summary.attention > 0 ? "neutral" as const : "positive" as const },
    { id: "adequado", title: "Sem Necessidade", value: String(summary.adequate), description: "Armazenamento adequado", trend: "positive" as const },
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
          <h3 className="mb-5 text-[13px] font-bold tracking-tight text-graphite-900 dark:text-white">Pivôs mais críticos</h3>
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
          <h3 className="mb-5 text-[13px] font-bold tracking-tight text-graphite-900 dark:text-white">Prioridade de irrigação</h3>
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
            <p className="text-sm text-graphite-400 dark:text-gray-500">Nenhum pivô precisa de irrigação hoje.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function RankRow({ rank, state }: { rank: number; state: PivotHydricState }) {
  const c = state.current!;
  const conf = HYDRIC_STATUS_CONFIG[c.status];
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-50/80 p-3.5 transition-colors duration-100 hover:bg-gray-100/60 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
      <div className="flex items-center gap-3">
        <span className="w-5 text-center text-xs font-bold text-graphite-300 dark:text-graphite-600">{rank}</span>
        <div className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-graphite-900" style={{ backgroundColor: conf.color }} />
        <div>
          <span className="text-sm font-medium text-graphite-900 dark:text-white">{state.pivotName}</span>
          <p className="text-xs text-graphite-400 dark:text-gray-500">{state.cultureName} · {c.phase}</p>
        </div>
      </div>
      <div className="text-right">
        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${conf.bgClass}`}>{conf.label}</span>
        <p className="mt-0.5 text-xs text-graphite-400 dark:text-gray-500">depleção {(c.depletion * 100).toFixed(0)}%</p>
      </div>
    </div>
  );
}

// ── Mapa Hídrico (item 17) ────────────────────────────────────────────

function MapaHidricoTab({ states }: { states: PivotHydricState[] }) {
  const dates = useMemo(() => hydricMapDates(states), [states]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(dates[dates.length - 1] ?? null);
  const mapStates = hydricMapStates(states);
  const selected = mapStates.find((s) => hydricStateId(s) === selectedId) ?? null;

  return (
    <VisionMapPanel
      states={states}
      selectedId={selectedId}
      onSelect={setSelectedId}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      overlay={selected ? <PivotDetail state={selected} /> : null}
    />
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
