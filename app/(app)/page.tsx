"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatCard, Tabs, EmptyState } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useImplantationStatus, useFarmHydricState } from "@/lib/hooks";
import { ImplantationGuide } from "@/components/onboarding";
import { radiusFromArea } from "@/utils/geo";
import {
  HYDRIC_STATUS_CONFIG,
  type PivotHydricState,
  type FarmHydricSummary,
} from "@/modules/water-balance/services";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  { ssr: false, loading: () => <div className="flex h-[400px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-white/[0.06] dark:bg-graphite-800"><p className="text-sm text-graphite-400">Carregando mapa...</p></div> }
);

const TABS = [
  { id: "painel", label: "Dashboard Operacional" },
  { id: "mapa", label: "Mapa Hídrico" },
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
        <Card className="border-brand-100 bg-gradient-to-r from-brand-50 to-white dark:border-brand-800/30 dark:from-brand-900/20 dark:to-graphite-900">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft">
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
          <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Pivôs mais críticos</h3>
          {summary.ranking.length > 0 ? (
            <div className="space-y-2">
              {summary.ranking.slice(0, 8).map((s, i) => (
                <RankRow key={s.pivotId} rank={i + 1} state={s} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-graphite-400 dark:text-gray-500">Sem pivôs com dados de balanço.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Prioridade de irrigação</h3>
          {summary.priorityList.length > 0 ? (
            <div className="space-y-2">
              {summary.priorityList.map((s, i) => (
                <div key={s.pivotId} className="flex items-center justify-between rounded-xl bg-red-50/80 p-3.5 dark:bg-red-900/10">
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = states.find((s) => s.pivotId === selectedId) ?? null;

  const mapPivots = useMemo(
    () =>
      states.map((s) => ({
        id: s.pivotId,
        name: s.pivotName,
        latitude: s.latitude,
        longitude: s.longitude,
        radiusMeters: radiusFromArea(s.area),
        color: HYDRIC_STATUS_CONFIG[s.current?.status ?? "cinza"].color,
      })),
    [states],
  );

  // contagem por status para a legenda
  const counts = states.reduce<Record<string, number>>((acc, s) => {
    const st = s.current?.status ?? "cinza";
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  const hasCoords = mapPivots.some((p) => p.latitude && p.longitude);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-5 py-4">
        {(["verde", "amarelo", "vermelho", "cinza"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2.5">
            <div className="h-3 w-3 rounded-full ring-2 ring-white dark:ring-graphite-900" style={{ backgroundColor: HYDRIC_STATUS_CONFIG[k].color }} />
            <span className="text-xs font-medium text-graphite-500 dark:text-gray-400">{HYDRIC_STATUS_CONFIG[k].label}: <strong className="text-graphite-900 dark:text-white">{counts[k] || 0}</strong></span>
          </div>
        ))}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hasCoords ? (
            <PivotMap
              pivots={mapPivots.filter((p) => p.latitude && p.longitude)}
              highlightId={selectedId ?? undefined}
              onSelect={setSelectedId}
              className="h-[520px] w-full overflow-hidden rounded-2xl border border-gray-100 shadow-card dark:border-white/[0.06]"
            />
          ) : (
            <EmptyState
              title="Pivôs sem coordenadas"
              description="Cadastre latitude e longitude nos pivôs para exibi-los no mapa hídrico."
            />
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {states.map((s) => {
              const conf = HYDRIC_STATUS_CONFIG[s.current?.status ?? "cinza"];
              return (
                <button
                  key={s.pivotId}
                  type="button"
                  onClick={() => setSelectedId(s.pivotId)}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                    selectedId === s.pivotId
                      ? "border-brand-200 bg-brand-50 text-brand-700 shadow-soft dark:border-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
                      : "border-gray-100 text-graphite-500 hover:border-gray-200 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-400 dark:hover:border-white/[0.12]"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: conf.color }} />
                  {s.pivotName}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          {selected ? (
            <PivotDetail state={selected} />
          ) : (
            <Card className="flex h-full items-center justify-center py-16 text-center">
              <p className="text-sm leading-relaxed text-graphite-400 dark:text-gray-500">Selecione um pivô no mapa para ver o balanço hídrico detalhado.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detalhe do pivô (itens 15 e 17) ───────────────────────────────────

function PivotDetail({ state }: { state: PivotHydricState }) {
  const c = state.current;
  if (!c) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-graphite-900 dark:text-white">{state.pivotName}</h3>
        <p className="mt-2 text-sm leading-relaxed text-graphite-400 dark:text-gray-500">
          Sem dados suficientes para cálculo. Verifique o vínculo operacional, as fases da cultura e as leituras de clima.
        </p>
      </Card>
    );
  }
  const conf = HYDRIC_STATUS_CONFIG[c.status];

  const rows: [string, string][] = [
    ["Cultura", state.cultureName + (state.varietyName ? ` (${state.varietyName})` : "")],
    ["Safra", state.seasonName ?? "—"],
    ["DAE", `${c.dae} dias`],
    ["Fase fenológica", c.phase],
    ["Kc atual", c.kc.toFixed(2)],
    ["ETo", `${c.et0.toFixed(1)} mm`],
    ["ETc", `${c.etc.toFixed(1)} mm`],
    ["Prof. radicular", `${c.rootDepth.toFixed(2)} m`],
    ["ADT", `${c.adt.toFixed(1)} mm`],
    ["AFD", `${c.afd.toFixed(1)} mm`],
    ["Água armazenada", `${c.storage.toFixed(1)} mm`],
    ["Déficit", `${c.deficit.toFixed(1)} mm`],
    ["Depleção", `${(c.depletion * 100).toFixed(0)}%`],
  ];

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">{state.pivotName}</h3>
        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${conf.bgClass}`}>{conf.label}</span>
      </div>

      <div className="space-y-2">
        {rows.map(([label, value], i) => (
          <div key={label} className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs ${i % 2 === 0 ? "bg-gray-50/60 dark:bg-graphite-800/40" : ""}`}>
            <span className="text-graphite-400 dark:text-gray-500">{label}</span>
            <span className="font-medium text-graphite-900 dark:text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className={`mt-5 rounded-xl p-4 ${c.shouldIrrigate ? "bg-red-50/80 dark:bg-red-900/10" : "bg-green-50/80 dark:bg-green-900/10"}`}>
        <p className={`text-xs font-bold ${c.shouldIrrigate ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
          {c.shouldIrrigate ? "Irrigar hoje" : "Sem necessidade de irrigação hoje"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-graphite-500 dark:text-gray-400">{c.recommendationReason}</p>
        {c.shouldIrrigate && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div><span className="text-graphite-400">Lâmina líquida:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedNetDepth.toFixed(1)} mm</strong></div>
            <div><span className="text-graphite-400">Lâmina bruta:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedGrossDepth.toFixed(1)} mm</strong></div>
            <div><span className="text-graphite-400">Volume:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedVolume.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m³</strong></div>
            <div><span className="text-graphite-400">Tempo estimado:</span> <strong className="text-graphite-900 dark:text-white">{c.estimatedIrrigationTime.toFixed(1)} h</strong></div>
          </div>
        )}
      </div>

      {state.history.length > 1 && (
        <div className="mt-5">
          <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">Histórico diário</h4>
          <div className="max-h-48 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[360px] text-left text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.06] text-graphite-400 dark:text-gray-500">
                  <th className="pb-2 pr-2 text-[10px] font-semibold uppercase tracking-wider">Data</th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-semibold uppercase tracking-wider">ETc</th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-semibold uppercase tracking-wider">Arm.</th>
                  <th className="pb-2 pr-2 text-right text-[10px] font-semibold uppercase tracking-wider">Déf.</th>
                  <th className="pb-2 text-[10px] font-semibold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {state.history.slice(-10).reverse().map((d) => {
                  const dc = HYDRIC_STATUS_CONFIG[d.status];
                  return (
                    <tr key={d.date} className="border-b border-gray-50 dark:border-white/[0.04]">
                      <td className="py-1.5 pr-2 text-graphite-500 dark:text-gray-400">{d.date.slice(5)}</td>
                      <td className="py-1.5 pr-2 text-right text-graphite-500 dark:text-gray-400">{d.etc.toFixed(1)}</td>
                      <td className="py-1.5 pr-2 text-right text-graphite-500 dark:text-gray-400">{d.storage.toFixed(0)}</td>
                      <td className="py-1.5 pr-2 text-right text-graphite-500 dark:text-gray-400">{d.deficit.toFixed(0)}</td>
                      <td className="py-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dc.color }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
