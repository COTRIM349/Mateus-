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
  { ssr: false, loading: () => <div className="flex h-[400px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 dark:border-graphite-700 dark:bg-graphite-800"><p className="text-sm text-gray-400">Carregando mapa...</p></div> }
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Centro de Controle Operacional"
        descricao={activeFarm ? `${activeFarm.name} · Balanço hídrico em tempo real` : "Balanço hídrico da operação"}
      />

      {profile && implantation.foundationComplete && summary && (
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
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {summary.noData} pivô(s) sem dados suficientes para cálculo (vínculo, fases da cultura ou clima ausentes). Complete os cadastros para incluí-los no balanço.
              </p>
            </Card>
          )}

          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "painel" && <PainelTab summary={summary} />}
          {activeTab === "mapa" && <MapaHidricoTab states={states} />}
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.id} metric={k} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Pivôs mais críticos</h3>
          {summary.ranking.length > 0 ? (
            <div className="space-y-2">
              {summary.ranking.slice(0, 8).map((s, i) => (
                <RankRow key={s.pivotId} rank={i + 1} state={s} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sem pivôs com dados de balanço.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">Prioridade de irrigação</h3>
          {summary.priorityList.length > 0 ? (
            <div className="space-y-2">
              {summary.priorityList.map((s, i) => (
                <div key={s.pivotId} className="flex items-center justify-between rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-graphite-900 dark:text-white">{s.pivotName}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{s.cultureName} · {s.current!.phase}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-graphite-900 dark:text-white">{s.current!.recommendedGrossDepth.toFixed(1)} mm</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">déficit {s.current!.deficit.toFixed(1)} mm</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum pivô precisa de irrigação hoje.</p>
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
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-graphite-800">
      <div className="flex items-center gap-3">
        <span className="w-5 text-center text-xs font-bold text-gray-400">{rank}</span>
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conf.color }} />
        <div>
          <span className="text-sm font-medium text-graphite-900 dark:text-white">{state.pivotName}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400">{state.cultureName} · {c.phase}</p>
        </div>
      </div>
      <div className="text-right">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.bgClass}`}>{conf.label}</span>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">depleção {(c.depletion * 100).toFixed(0)}%</p>
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
      <div className="flex flex-wrap gap-4">
        {(["verde", "amarelo", "vermelho", "cinza"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: HYDRIC_STATUS_CONFIG[k].color }} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{HYDRIC_STATUS_CONFIG[k].label}: {counts[k] || 0}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hasCoords ? (
            <PivotMap
              pivots={mapPivots.filter((p) => p.latitude && p.longitude)}
              highlightId={selectedId ?? undefined}
              onSelect={setSelectedId}
              className="h-[520px] w-full rounded-lg border border-gray-200 dark:border-graphite-700"
            />
          ) : (
            <EmptyState
              title="Pivôs sem coordenadas"
              description="Cadastre latitude e longitude nos pivôs para exibi-los no mapa hídrico."
            />
          )}
          {/* seleção também pela lista, caso o pivô não tenha coordenada */}
          <div className="mt-4 flex flex-wrap gap-2">
            {states.map((s) => {
              const conf = HYDRIC_STATUS_CONFIG[s.current?.status ?? "cinza"];
              return (
                <button
                  key={s.pivotId}
                  type="button"
                  onClick={() => setSelectedId(s.pivotId)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                    selectedId === s.pivotId ? "border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/20" : "border-gray-200 dark:border-graphite-700"
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
              <p className="text-sm text-gray-400 dark:text-gray-500">Selecione um pivô no mapa para ver o balanço hídrico detalhado.</p>
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
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-graphite-900 dark:text-white">{state.pivotName}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conf.bgClass}`}>{conf.label}</span>
      </div>

      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{label}</span>
            <span className="font-medium text-graphite-900 dark:text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className={`mt-4 rounded-lg p-3 ${c.shouldIrrigate ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
        <p className={`text-xs font-semibold ${c.shouldIrrigate ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
          {c.shouldIrrigate ? "Irrigar hoje" : "Sem necessidade de irrigação hoje"}
        </p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{c.recommendationReason}</p>
        {c.shouldIrrigate && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-gray-400">Lâmina líquida:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedNetDepth.toFixed(1)} mm</strong></div>
            <div><span className="text-gray-400">Lâmina bruta:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedGrossDepth.toFixed(1)} mm</strong></div>
            <div><span className="text-gray-400">Volume:</span> <strong className="text-graphite-900 dark:text-white">{c.recommendedVolume.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m³</strong></div>
            <div><span className="text-gray-400">Tempo estimado:</span> <strong className="text-graphite-900 dark:text-white">{c.estimatedIrrigationTime.toFixed(1)} h</strong></div>
          </div>
        )}
      </div>

      {state.history.length > 1 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Histórico diário (últimos dias)</h4>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-graphite-700 text-gray-400">
                  <th className="pb-1 pr-2">Data</th>
                  <th className="pb-1 pr-2 text-right">ETc</th>
                  <th className="pb-1 pr-2 text-right">Arm.</th>
                  <th className="pb-1 pr-2 text-right">Déf.</th>
                  <th className="pb-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {state.history.slice(-10).reverse().map((d) => {
                  const dc = HYDRIC_STATUS_CONFIG[d.status];
                  return (
                    <tr key={d.date} className="border-b border-gray-100 dark:border-graphite-800">
                      <td className="py-1 pr-2 text-gray-600 dark:text-gray-300">{d.date.slice(5)}</td>
                      <td className="py-1 pr-2 text-right text-gray-600 dark:text-gray-300">{d.etc.toFixed(1)}</td>
                      <td className="py-1 pr-2 text-right text-gray-600 dark:text-gray-300">{d.storage.toFixed(0)}</td>
                      <td className="py-1 pr-2 text-right text-gray-600 dark:text-gray-300">{d.deficit.toFixed(0)}</td>
                      <td className="py-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dc.color }} /></td>
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
