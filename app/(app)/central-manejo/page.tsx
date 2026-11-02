"use client";

/**
 * Central de Manejo — visão de decisão hídrica de TODA a fazenda.
 *
 * Reúne, em uma tela, o mapa hídrico operacional, os KPIs da fazenda, a fila de
 * irrigação priorizada e os alertas. Só entram pivôs com parcela ativa (regra
 * do `useFarmHydricState`). Nada é inventado: cada número vem do motor FAO-56
 * (via `states[].current`) ou é "—" quando o dado não existe.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useFarmHydricState } from "@/lib/hooks";
import { countMapStatuses, hydricMapDates, hydricStateId, toHydricMapMarkers } from "@/components/maps/hydric-map-markers";
import { formatParcelAngles } from "@/modules/assignment/services/parcel-geometry";
import {
  buildDecisionAudit,
  calculateManagementUrgency,
  decisionDataQuality,
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
  type PivotHydricState,
  type BalanceDay,
} from "@/modules/water-balance/services";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-[#1A2638] dark:bg-[#08111F]">
        <p className="text-sm text-graphite-400 dark:text-[#7F8DA3]">Carregando mapa...</p>
      </div>
    ),
  },
);

const fmtNum = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");

// autonomia (dias até a AFD) de um dia de balanço
function autonomyDays(c: BalanceDay): number | null {
  const u = calculateManagementUrgency({ afd: c.afd, deficit: c.deficit, etcPotential: c.etcPotential ?? c.etc });
  if (u.atOrBeyondAfd) return 0;
  return u.daysToAfd;
}

export default function CentralDeManejoPage() {
  const router = useRouter();
  const { farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const { states, summary, loading, error, errorMessage, refresh } = useFarmHydricState();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [auditStateId, setAuditStateId] = useState<string | null>(null);

  const dates = useMemo(() => hydricMapDates(states), [states]);
  // Se a data escolhida não existir no conjunto atual (ex.: troca de fazenda),
  // cai para a mais recente em vez de renderizar tudo como incompleto.
  const activeDate = (selectedDate && dates.includes(selectedDate)) ? selectedDate : (dates[dates.length - 1] ?? null);
  const mapPivots = useMemo(() => toHydricMapMarkers(states, activeDate), [states, activeDate]);
  const mapCounts = countMapStatuses(states, activeDate);

  const withData = states.filter((s) => s.current && s.current.status !== "cinza");
  const distinctPivots = new Set(states.map((s) => s.pivotId)).size;
  const managedArea = states.reduce((a, s) => a + (s.area ?? 0), 0);
  const pivotsNeeding = new Set(withData.filter((s) => s.current!.shouldIrrigate).map((s) => s.pivotId)).size;
  // "Próximas 24 h" = ainda dentro do limite mas chegando lá; exclui os que já
  // passaram do limite pela condição de AFD do motor (atOrBeyondAfd) — não por
  // shouldIrrigate, que pode ser false por eficiência ausente mesmo com Dr≥AFD.
  const pivots24h = new Set(withData.filter((s) => {
    const c = s.current!;
    const u = calculateManagementUrgency({ afd: c.afd, deficit: c.deficit, etcPotential: c.etcPotential ?? c.etc });
    return !u.atOrBeyondAfd && u.daysToAfd != null && u.daysToAfd < 1;
  }).map((s) => s.pivotId)).size;
  const qualityByState = useMemo(
    () => new Map(states.map((state) => [hydricStateId(state), decisionDataQuality(state)])),
    [states],
  );
  const completeDataCount = states.filter(
    (state) => qualityByState.get(hydricStateId(state))?.level === "completo",
  ).length;
  const reliability = states.length > 0 ? Math.round((completeDataCount / states.length) * 100) : null;
  const avgEto = withData.length > 0
    ? withData.reduce((sum, s) => sum + (s.current?.et0 ?? 0), 0) / withData.length
    : null;
  const avgKc = withData.length > 0
    ? withData.reduce((sum, s) => sum + (s.current?.kc ?? 0), 0) / withData.length
    : null;
  const avgEtc = withData.length > 0
    ? withData.reduce((sum, s) => sum + (s.current?.etc ?? 0), 0) / withData.length
    : null;
  const avgFd = withData.length > 0
    ? withData.reduce((sum, s) => sum + (s.current?.afd && s.current?.adt ? s.current.afd / s.current.adt : 0), 0) / withData.length
    : null;

  // Fila de irrigação priorizada (regra do spec):
  // 1) abaixo do limite → 2) menor autonomia → 3) maior sensibilidade (Ky) →
  // 4) maior ETc → 5) maior lâmina. Parcelas sem dado vão para o fim.
  const fila = useMemo(() => {
    return [...states].sort((a, b) => {
      const ca = a.current, cb = b.current;
      if (!ca && !cb) return 0;
      if (!ca) return 1;
      if (!cb) return -1;
      const belowA = ca.shouldIrrigate ? 0 : 1;
      const belowB = cb.shouldIrrigate ? 0 : 1;
      if (belowA !== belowB) return belowA - belowB;
      const autoA = autonomyDays(ca) ?? Infinity;
      const autoB = autonomyDays(cb) ?? Infinity;
      if (autoA !== autoB) return autoA - autoB;
      const kyA = ca.ky ?? 0, kyB = cb.ky ?? 0;
      if (kyA !== kyB) return kyB - kyA;
      if (ca.etc !== cb.etc) return cb.etc - ca.etc;
      return cb.recommendedGrossDepth - ca.recommendedGrossDepth;
    });
  }, [states]);

  const selectedAuditState = useMemo(() => {
    const requested = auditStateId
      ? states.find((state) => hydricStateId(state) === auditStateId)
      : null;
    return requested ?? fila.find((state) => state.current && state.current.status !== "cinza") ?? fila[0] ?? null;
  }, [auditStateId, fila, states]);
  const auditRows = useMemo(
    () => selectedAuditState ? buildDecisionAudit(selectedAuditState, 7) : [],
    [selectedAuditState],
  );

  // Passa também o parcelId — em pivô setorizado, cada linha é uma parcela
  // distinta; sem isso o destino abriria a parcela mais recente do pivô.
  const openPivot = (s: PivotHydricState) => {
    const q = new URLSearchParams({ pivot: s.pivotId });
    if (s.parcelId) q.set("parcel", s.parcelId);
    router.push(`/balanco-hidrico?${q.toString()}`);
  };

  // Alertas derivados do estado da fazenda
  const alerts = useMemo(() => {
    const out: { sev: "hi" | "md" | "lo"; title: string; desc: string }[] = [];
    // Conta PIVÔS distintos (states tem uma linha por parcela/setor).
    const distinct = (list: PivotHydricState[]) => new Set(list.map((s) => s.pivotId));
    const names = (list: PivotHydricState[]) => Array.from(new Map(list.map((s) => [s.pivotId, s.pivotName])).values());

    const critical = withData.filter((s) => s.current!.shouldIrrigate);
    if (critical.length > 0) {
      const nm = names(critical);
      out.push({ sev: "hi", title: `${distinct(critical).size} pivô(s) abaixo do limite de manejo`, desc: nm.slice(0, 4).join(", ") + (nm.length > 4 ? "…" : "") });
    }
    const lowAuto = withData.filter((s) => { const a = autonomyDays(s.current!); return !s.current!.shouldIrrigate && a != null && a < 1.5; });
    if (lowAuto.length > 0) {
      out.push({ sev: "md", title: `${distinct(lowAuto).size} pivô(s) com baixa autonomia`, desc: "Autonomia inferior a 1,5 dia — avaliar irrigação em breve." });
    }
    const repro = withData.filter((s) => (s.current!.ky ?? 0) >= 1);
    if (repro.length > 0) {
      out.push({ sev: "md", title: `${distinct(repro).size} pivô(s) em fase sensível`, desc: "Estádio de alta sensibilidade ao déficit (Ky ≥ 1)." });
    }
    const qualityAttention = states.filter(
      (state) => qualityByState.get(hydricStateId(state))?.level === "atencao",
    );
    if (qualityAttention.length > 0) {
      out.push({
        sev: "md",
        title: `${qualityAttention.length} parcela(s) com qualidade de dados em atenção`,
        desc: "Há cálculo disponível, mas existe dado assumido ou cadastro incompleto que merece validação.",
      });
    }
    // Parcelas ativas sem balanço = condição DESCONHECIDA, não "tudo certo".
    const noData = states.length - withData.length;
    if (noData > 0) {
      out.push({ sev: "md", title: `${noData} parcela(s) sem dados hídricos`, desc: "Balanço indisponível (clima, solo ou condição inicial ausente). Situação de irrigação desconhecida." });
    }
    if (out.length === 0) {
      out.push(withData.length > 0
        ? { sev: "lo", title: "Sem alertas ativos", desc: "Nenhum pivô abaixo do limite de manejo no momento." }
        : { sev: "md", title: "Dados hídricos indisponíveis", desc: "Nenhuma parcela ativa com balanço calculado." });
    }
    return out;
  }, [withData, states, qualityByState]);

  if (!activeFarmId) {
    return <PageHeader titulo="Central de Manejo" descricao="Selecione uma fazenda para continuar" />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
      </div>
    );
  }

  const kpis = [
    { label: "Pivôs ativos", value: String(distinctPivots), sub: "com parcela em manejo", icon: "◉" },
    { label: "Área em manejo", value: fmtInt(managedArea), unit: "ha", sub: `${states.length} parcela(s) ativa(s)`, icon: "▦" },
    { label: "Irrigar agora", value: String(pivotsNeeding), sub: "abaixo do limite", tone: pivotsNeeding > 0 ? "text-red-600 dark:text-red-400" : undefined, icon: "↥" },
    { label: "Próximas 24 h", value: String(pivots24h), sub: "atingem o limite", tone: pivots24h > 0 ? "text-orange-600 dark:text-orange-400" : undefined, icon: "◷" },
    { label: "Lâmina média rec.", value: summary ? fmtInt(summary.avgRecommendedDepth) : "—", unit: "mm", sub: "para quem precisa irrigar", icon: "≋" },
    { label: "Confiabilidade", value: reliability != null ? String(reliability) : "—", unit: "%", sub: "parcelas com dados completos", icon: "✓" },
  ];

  const moistureBands: Array<{
    status: MapHydricStatus;
    range: string;
    description: string;
  }> = [
    { status: "capacidade_campo", range: "≥95% CC", description: "Alta umidade" },
    { status: "boa_umidade", range: "90–<95%", description: "Confortável" },
    { status: "atencao", range: "85–<90%", description: "Atenção" },
    { status: "deficit_hidrico", range: "70–<85%", description: "Déficit" },
    { status: "critico", range: "<70%", description: "Crítico" },
  ];

  const totalMapped = moistureBands.reduce((sum, band) => sum + (mapCounts[band.status] ?? 0), 0);
  const totalWithIncomplete = totalMapped + (mapCounts.incompleto ?? 0);

  return (
    <div className="space-y-4 pb-6">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white px-5 py-3.5 shadow-sm dark:border-[#182638] dark:bg-[#07101B]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg font-black text-white shadow-[0_8px_22px_rgba(5,150,105,0.22)]">◉</span>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-graphite-950 dark:text-white sm:text-2xl">Central de Manejo</h1>
                <p className="mt-0.5 text-[12px] text-graphite-500 dark:text-[#93A2B8]">
                  {activeFarm?.name ?? "Fazenda"} · visão hídrica e prioridade operacional da fazenda
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 font-semibold text-graphite-600 shadow-sm dark:border-[#223146] dark:bg-[#0C1725] dark:text-[#B4C0D2]">
              {distinctPivots} pivô(s) ativos
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              {activeDate ? `Atualizado em ${activeDate.split("-").reverse().join("/")}` : "Sem data"}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <Card className="py-16 text-center dark:border-[#1A2638] dark:bg-[#0A1220]">
          <p className="font-semibold text-red-600 dark:text-red-400">Não foi possível carregar o estado hídrico da fazenda.</p>
          <p className="mt-1 text-[13px] text-graphite-500 dark:text-[#9AA8BE]">Falha ao consultar clima, solo ou balanço. Tente recarregar.</p>
          {errorMessage && (
            <p className="mx-auto mt-3 max-w-xl rounded-lg bg-red-50 px-3 py-2 text-[12px] font-mono leading-snug text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-graphite-700 transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
          >
            Recarregar
          </button>
        </Card>
      ) : states.length === 0 ? (
        <Card className="py-16 text-center dark:border-[#1A2638] dark:bg-[#0A1220]">
          <p className="text-graphite-500 dark:text-[#9AA8BE]">Nenhum pivô com parcela ativa nesta fazenda. Cadastre uma parcela para ativar o manejo.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => (
              <Card key={k.label} className="relative overflow-hidden rounded-xl p-3.5 dark:border-[#1A2638] dark:bg-[#0A1220] dark:shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
                <span className="absolute right-3 top-3 text-[18px] font-bold text-emerald-600/18 dark:text-emerald-300/15">{k.icon}</span>
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-graphite-400 dark:text-[#74839A]">{k.label}</p>
                <p className={`mt-2 text-[26px] font-black leading-none tabular-nums ${k.tone ?? "text-graphite-950 dark:text-[#F7FAFF]"}`}>
                  {k.value}{k.unit && <span className="ml-1 text-[12px] font-semibold text-graphite-400 dark:text-[#728096]">{k.unit}</span>}
                </p>
                <p className="mt-2 truncate text-[10.5px] text-graphite-400 dark:text-[#6E7C92]">{k.sub}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,2.05fr)_minmax(360px,0.92fr)]">
            <Card className="overflow-hidden p-0 dark:border-[#1A2638] dark:bg-[#08111F] dark:shadow-[0_20px_54px_rgba(0,0,0,0.36)]">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 pt-3 dark:border-[#162233] dark:bg-[#0A1220]">
                <button type="button" className="rounded-t-lg bg-[#075D53] px-4 py-2 text-[12px] font-extrabold text-white shadow-sm">
                  Mapa hídrico operacional
                </button>
                <button type="button" className="rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-4 py-2 text-[12px] font-bold text-graphite-600 dark:border-[#223146] dark:bg-[#0D1827] dark:text-[#AEB9CB]">
                  Índice por pivô
                </button>
                <span className="ml-auto pb-2 pr-2 text-[10px] font-semibold text-graphite-400 dark:text-[#718096]">
                  {mapPivots.length} área(s) exibida(s)
                </span>
              </div>

              <div className="relative">
                <PivotMap
                  pivots={mapPivots}
                  onSelect={(id) => { const s = states.find((x) => hydricStateId(x) === id); if (s) openPivot(s); }}
                  className="h-[min(54vh,560px)] min-h-[470px] w-full rounded-none border-0"
                />
                <div className="absolute bottom-4 left-4 z-[500] w-[238px] rounded-xl border border-white/70 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#08111F]/95">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-graphite-700 dark:text-white">% da Capacidade de Campo (CC)</p>
                  <div className="mt-2 space-y-1.5">
                    {moistureBands.map((band) => {
                      const conf = MAP_HYDRIC_STATUS_CONFIG[band.status];
                      return (
                        <div key={band.status} className="flex items-center gap-2 text-[10px]">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conf.color }} />
                          <span className="w-[62px] font-bold text-graphite-700 dark:text-[#E8EEF8]">{band.range}</span>
                          <span className="text-graphite-500 dark:text-[#8E9CB1]">{band.description}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {dates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 bg-white px-4 py-2.5 dark:border-[#162233] dark:bg-[#060D17]">
                  <span className="mr-1 text-[10px] font-bold text-graphite-500 dark:text-[#8E9CB1]">Condição no dia:</span>
                  {dates.map((date) => {
                    const active = date === activeDate;
                    const [, month, day] = date.split("-");
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? "bg-emerald-700 text-white" : "bg-gray-100 text-graphite-600 dark:bg-[#111B2A] dark:text-[#A6B3C7]"}`}
                      >
                        {active ? "Hoje" : `${day}/${month}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <div className="flex min-h-[470px] flex-col gap-3">
              <Card className="overflow-hidden p-0 dark:border-[#1A2638] dark:bg-[#0A1220]">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-[#162233]">
                  <p className="text-[13px] font-extrabold text-graphite-900 dark:text-white">Situação hídrica da área</p>
                </div>
                <div className="grid grid-cols-[130px_1fr] items-center gap-3 p-4">
                  {(() => {
                    const counts = moistureBands.map((band) => mapCounts[band.status] ?? 0);
                    const colors = moistureBands.map((band) => MAP_HYDRIC_STATUS_CONFIG[band.status].color);
                    let acc = 0;
                    const stops = counts.map((count, idx) => {
                      const pct = totalMapped > 0 ? (count / totalMapped) * 100 : 0;
                      const start = acc;
                      acc += pct;
                      return `${colors[idx]} ${start}% ${acc}%`;
                    }).filter((_, idx) => counts[idx] > 0);
                    const gradient = stops.length ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#E5E7EB 0 100%)";
                    return (
                      <div className="relative mx-auto h-[118px] w-[118px] rounded-full" style={{ background: gradient }}>
                        <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-[#0A1220]">
                          <span className="text-[21px] font-black text-graphite-950 dark:text-white">{fmtInt(managedArea)}</span>
                          <span className="text-[9px] font-bold text-graphite-400 dark:text-[#728096]">ha total</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    {moistureBands.map((band) => {
                      const count = mapCounts[band.status] ?? 0;
                      const pct = totalMapped > 0 ? Math.round((count / totalMapped) * 100) : 0;
                      const conf = MAP_HYDRIC_STATUS_CONFIG[band.status];
                      return (
                        <div key={band.status} className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2 text-[10.5px]">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conf.color }} />
                          <span className="font-bold text-graphite-700 dark:text-[#E8EEF8]">{band.description} <span className="font-medium text-graphite-400">({band.range})</span></span>
                          <span className="font-black tabular-nums text-graphite-900 dark:text-white">{count}</span>
                          <span className="w-9 text-right font-semibold tabular-nums text-graphite-400">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden p-0 dark:border-[#1A2638] dark:bg-[#0A1220]">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-[#162233]">
                  <p className="text-[13px] font-extrabold text-graphite-900 dark:text-white">Indicadores da safra</p>
                </div>
                <div className="grid grid-cols-4 gap-2 p-3">
                  {[
                    { label: "ETo", value: avgEto == null ? "—" : fmtNum(avgEto), unit: "mm/d" },
                    { label: "Kc", value: avgKc == null ? "—" : fmtNum(avgKc, 2), unit: "atual" },
                    { label: "ETc", value: avgEtc == null ? "—" : fmtNum(avgEtc), unit: "mm/d" },
                    { label: "FD", value: avgFd == null ? "—" : fmtNum(avgFd, 2), unit: "atual" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-emerald-50/60 px-2 py-2 text-center dark:bg-emerald-950/20">
                      <p className="text-[9px] font-bold uppercase tracking-[0.05em] text-emerald-700 dark:text-emerald-300">{item.label}</p>
                      <p className="mt-1 text-[16px] font-black leading-none text-graphite-950 dark:text-white">{item.value}</p>
                      <p className="mt-1 text-[8.5px] text-graphite-400">{item.unit}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="flex-1 overflow-hidden p-0 dark:border-[#1A2638] dark:bg-[#0A1220]">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-[#162233]">
                  <div>
                    <p className="text-[13px] font-extrabold text-graphite-900 dark:text-white">Alertas prioritários</p>
                    <p className="mt-0.5 text-[10.5px] text-graphite-400 dark:text-[#728096]">Pontos que exigem atenção operacional</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{alerts.length}</span>
                </div>
                <div className="space-y-2 p-3">
                  {alerts.slice(0, 4).map((al, i) => {
                    const dot = { hi: "#EF4444", md: "#F59E0B", lo: "#10B981" } as const;
                    return (
                      <div key={i} className="flex gap-3 rounded-xl border border-gray-100 px-3 py-3 dark:border-[#172538] dark:bg-[#091421]">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot[al.sev] }} />
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-bold text-graphite-800 dark:text-[#F3F7FF]">{al.title}</p>
                          <p className="mt-1 text-[10.5px] leading-4 text-graphite-500 dark:text-[#8290A5]">{al.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          <Card className="overflow-hidden p-0 dark:border-[#1A2638] dark:bg-[#08111F] dark:shadow-[0_16px_40px_rgba(0,0,0,0.30)]">
            <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 dark:border-[#162233] dark:bg-[#0A1220] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[14px] font-extrabold text-graphite-900 dark:text-[#F3F7FF]">Pivôs em manejo</p>
                <p className="mt-0.5 text-[10.5px] text-graphite-400 dark:text-[#718096]">Visão técnica resumida para decisão diária.</p>
              </div>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10.5px] font-semibold text-graphite-600 dark:border-[#223146] dark:bg-[#0B1725] dark:text-[#AEB9CB]">
                {fila.length} parcela(s)
              </span>
            </div>
            <div className="max-h-[460px] overflow-auto">
              <table className="w-full min-w-[1280px] text-[12px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-graphite-400 dark:border-[#162233] dark:bg-[#0D1827] dark:text-[#75839A]">
                    <th className="px-4 py-3">Pivô</th>
                    <th className="px-3 py-3">Cultura / cultivar</th>
                    <th className="px-3 py-3 text-right">DAE</th>
                    <th className="px-3 py-3">Estádio</th>
                    <th className="px-3 py-3 text-right">Zr (m)</th>
                    <th className="px-3 py-3 text-right">CAD (mm)</th>
                    <th className="px-3 py-3 text-right">ARM (mm)</th>
                    <th className="px-3 py-3 text-right">% CC</th>
                    <th className="px-3 py-3 text-right">Déficit</th>
                    <th className="px-3 py-3 text-right">Irrigação rec.</th>
                    <th className="px-4 py-3">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {fila.map((s) => {
                    const c = s.current;
                    return (
                      <tr
                        key={hydricStateId(s)}
                        onClick={() => openPivot(s)}
                        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-emerald-50/45 dark:border-[#142235] dark:bg-[#08111F] dark:hover:bg-[#0E1C2D]"
                      >
                        <td className="px-4 py-3">
                          <span className="font-extrabold text-graphite-900 dark:text-[#F3F7FF]">{s.pivotName}</span>
                          {(() => {
                            const sector = s.parcelName
                              ?? (s.startAngleDeg != null && s.endAngleDeg != null ? formatParcelAngles(s.startAngleDeg, s.endAngleDeg) : null);
                            return sector ? <span className="mt-0.5 block text-[10px] font-normal text-graphite-400 dark:text-[#6E7C92]">{sector}</span> : null;
                          })()}
                        </td>
                        <td className="px-3 py-3 text-graphite-600 dark:text-[#9AA8BE]">{s.cultureName}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{c?.dae ?? "—"}</td>
                        <td className="px-3 py-3 font-semibold text-graphite-700 dark:text-[#D8E1ED]">{c?.phase ?? "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{c ? fmtNum(c.rootDepth, 2) : "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{c ? fmtNum(c.adt) : "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{c ? fmtNum(c.storage) : "—"}</td>
                        <td className="px-3 py-3 text-right">
                          {c ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-2 w-14 overflow-hidden rounded-full bg-gray-200 dark:bg-[#162233]">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, c.moisturePctCc ?? 0))}%`, backgroundColor: MAP_HYDRIC_STATUS_CONFIG[c.mapStatus].color }} />
                              </div>
                              <span className="w-9 text-right font-bold tabular-nums">{fmtInt(c.moisturePctCc ?? 0)}%</span>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-red-600 dark:text-red-400">{c ? fmtNum(c.deficit) : "—"}</td>
                        <td className="px-3 py-3 text-right font-black tabular-nums text-graphite-900 dark:text-white">{c ? fmtNum(c.recommendedGrossDepth) : "—"}</td>
                        <td className="px-4 py-3">
                          {c ? (
                            <span className="inline-flex rounded-full px-2.5 py-1 text-[9.5px] font-extrabold" style={{ color: MAP_HYDRIC_STATUS_CONFIG[c.mapStatus].onColor, backgroundColor: MAP_HYDRIC_STATUS_CONFIG[c.mapStatus].color }}>
                              {MAP_HYDRIC_STATUS_CONFIG[c.mapStatus].label}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-graphite-400">Sem dados</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <details className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1A2638] dark:bg-[#08111F]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-[13px] font-extrabold text-graphite-900 dark:text-[#F3F7FF]">Auditoria da decisão · últimos 7 dias</p>
                <p className="mt-0.5 text-[10.5px] text-graphite-400 dark:text-[#718096]">
                  Histórico calculado pelo mesmo motor usado na recomendação atual.
                </p>
              </div>
              <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Ver histórico</span>
            </summary>
            <div className="border-t border-gray-100 px-5 py-4 dark:border-[#162233]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <select
                  aria-label="Selecionar parcela para auditoria"
                  value={selectedAuditState ? hydricStateId(selectedAuditState) : ""}
                  onChange={(event) => setAuditStateId(event.target.value)}
                  className="h-10 min-w-[240px] rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-graphite-700 dark:border-[#26364B] dark:bg-[#0D1827] dark:text-white"
                >
                  {fila.map((state) => (
                    <option key={hydricStateId(state)} value={hydricStateId(state)}>
                      {state.pivotName}{state.parcelName ? ` · ${state.parcelName}` : ""}
                    </option>
                  ))}
                </select>
                {selectedAuditState && (
                  <span className="text-[10.5px] text-graphite-400 dark:text-[#718096]">
                    {selectedAuditState.cultureName}{selectedAuditState.varietyName ? ` · ${selectedAuditState.varietyName}` : ""}
                  </span>
                )}
              </div>
              {auditRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-[11px] text-graphite-400 dark:border-[#26364B] dark:text-[#8290A5]">
                  Sem histórico calculado disponível para esta parcela.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-[9.5px] font-bold uppercase tracking-[0.06em] text-graphite-400 dark:border-[#162233] dark:bg-[#0D1827] dark:text-[#75839A]">
                        <th className="px-3 py-2.5">Data</th>
                        <th className="px-3 py-2.5">Estádio</th>
                        <th className="px-3 py-2.5 text-right">Déficit</th>
                        <th className="px-3 py-2.5 text-right">AFD usada</th>
                        <th className="px-3 py-2.5 text-right">ETc</th>
                        <th className="px-3 py-2.5 text-right">Irrigação</th>
                        <th className="px-3 py-2.5 text-right">Lâmina rec.</th>
                        <th className="px-3 py-2.5">Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((row) => (
                        <tr key={row.date} className="border-b border-gray-50 dark:border-[#142235]">
                          <td className="px-3 py-2.5 font-semibold">{row.date.split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2.5 text-graphite-500 dark:text-[#9AA8BE]">{row.phase} · {row.dae} DAE</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.deficitMm)} mm</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.afdUsedPct, 0)}%</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.etcPotentialMm)} mm</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.irrigationAppliedMm)} mm</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.recommendedGrossDepthMm > 0 ? `${fmtNum(row.recommendedGrossDepthMm)} mm` : "—"}</td>
                          <td className="px-3 py-2.5 font-semibold text-graphite-700 dark:text-[#DCE6F2]">{row.decision}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
