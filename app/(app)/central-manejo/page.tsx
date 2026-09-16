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
import { HydricMapLegend } from "@/components/maps/HydricMapLegend";
import { countMapStatuses, hydricDemandSummary, hydricMapDates, hydricStateId, toHydricMapMarkers } from "@/components/maps/hydric-map-markers";
import {
  calculateManagementUrgency,
  HYDRIC_STATUS_CONFIG,
  type PivotHydricState,
  type BalanceDay,
} from "@/modules/water-balance/services";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-white/[0.06] dark:bg-graphite-800">
        <p className="text-sm text-graphite-400">Carregando mapa...</p>
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

type Priority = { label: string; color: string; rank: number };
function priorityOf(c: BalanceDay): Priority {
  const a = autonomyDays(c);
  if (c.status === "cinza") return { label: "Sem dado", color: "#9ca3af", rank: 5 };
  if (c.shouldIrrigate && (a == null || a < 0.5)) return { label: "Crítico", color: "#dc2626", rank: 0 };
  if (c.shouldIrrigate || (a != null && a < 1.5)) return { label: "Alto", color: "#f97316", rank: 1 };
  if (c.status === "amarelo" || (a != null && a < 3)) return { label: "Médio", color: "#eab308", rank: 2 };
  return { label: "Adequado", color: "#16a34a", rank: 3 };
}

export default function CentralDeManejoPage() {
  const router = useRouter();
  const { farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const { states, summary, loading } = useFarmHydricState();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dates = useMemo(() => hydricMapDates(states), [states]);
  const activeDate = selectedDate ?? dates[dates.length - 1] ?? null;
  const mapPivots = useMemo(() => toHydricMapMarkers(states, activeDate), [states, activeDate]);
  const mapCounts = countMapStatuses(states, activeDate);
  const demand = hydricDemandSummary(states, activeDate);

  const withData = states.filter((s) => s.current && s.current.status !== "cinza");
  const distinctPivots = new Set(states.map((s) => s.pivotId)).size;
  const managedArea = states.reduce((a, s) => a + (s.area ?? 0), 0);
  const pivotsNeeding = new Set(withData.filter((s) => s.current!.shouldIrrigate).map((s) => s.pivotId)).size;
  const pivots24h = new Set(withData.filter((s) => { const a = autonomyDays(s.current!); return a != null && a < 1; }).map((s) => s.pivotId)).size;
  const reliability = states.length > 0 ? Math.round((withData.length / states.length) * 100) : null;

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

  const openPivot = (s: PivotHydricState) => router.push(`/balanco-hidrico?pivot=${s.pivotId}`);

  // Alertas derivados do estado da fazenda
  const alerts = useMemo(() => {
    const out: { sev: "hi" | "md" | "lo"; title: string; desc: string }[] = [];
    const critical = withData.filter((s) => s.current!.shouldIrrigate);
    if (critical.length > 0) {
      out.push({ sev: "hi", title: `${critical.length} pivô(s) abaixo do limite de manejo`, desc: critical.slice(0, 4).map((s) => s.pivotName).join(", ") + (critical.length > 4 ? "…" : "") });
    }
    const lowAuto = withData.filter((s) => { const a = autonomyDays(s.current!); return !s.current!.shouldIrrigate && a != null && a < 1.5; });
    if (lowAuto.length > 0) {
      out.push({ sev: "md", title: `${lowAuto.length} pivô(s) com baixa autonomia`, desc: "Autonomia inferior a 1,5 dia — avaliar irrigação em breve." });
    }
    const repro = withData.filter((s) => (s.current!.ky ?? 0) >= 1);
    if (repro.length > 0) {
      out.push({ sev: "md", title: `${repro.length} pivô(s) em fase sensível`, desc: "Estádio de alta sensibilidade ao déficit (Ky ≥ 1)." });
    }
    if (out.length === 0) out.push({ sev: "lo", title: "Sem alertas ativos", desc: "Nenhum pivô abaixo do limite de manejo no momento." });
    return out;
  }, [withData]);

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
    { label: "Pivôs ativos", value: String(distinctPivots), sub: "com parcela em manejo" },
    { label: "Área em manejo", value: fmtInt(managedArea), unit: "ha", sub: `${withData.length} parcela(s) ativa(s)` },
    { label: "Irrigar agora", value: String(pivotsNeeding), sub: "abaixo do limite", tone: pivotsNeeding > 0 ? "text-red-600 dark:text-red-400" : undefined },
    { label: "Próximas 24 h", value: String(pivots24h), sub: "atingem o limite", tone: pivots24h > 0 ? "text-orange-600 dark:text-orange-400" : undefined },
    { label: "Lâmina média rec.", value: summary ? fmtInt(summary.avgRecommendedDepth) : "—", unit: "mm", sub: "para quem precisa irrigar" },
    { label: "Confiabilidade", value: reliability != null ? String(reliability) : "—", unit: "%", sub: "parcelas com dados completos" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader titulo="Central de Manejo" descricao={`${activeFarm?.name ?? "Fazenda"} · decisão hídrica da fazenda`} />

      {states.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="text-graphite-500 dark:text-gray-400">Nenhum pivô com parcela ativa nesta fazenda. Cadastre uma parcela para ativar o manejo.</p>
        </Card>
      ) : (
        <>
          {/* KPIs da fazenda */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => (
              <Card key={k.label} className="p-3.5">
                <p className="truncate text-[11px] font-medium text-graphite-400 dark:text-gray-500">{k.label}</p>
                <p className={`mt-0.5 text-[20px] font-extrabold leading-tight tabular-nums ${k.tone ?? "text-graphite-900 dark:text-white"}`}>
                  {k.value}{k.unit && <span className="ml-0.5 text-[12px] font-semibold text-graphite-400 dark:text-gray-500">{k.unit}</span>}
                </p>
                <p className="mt-0.5 truncate text-[10.5px] text-graphite-400 dark:text-gray-500">{k.sub}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Mapa operacional */}
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <p className="text-[13px] font-bold text-graphite-800 dark:text-white">Mapa operacional</p>
                <span className="hidden text-[11px] text-graphite-400 sm:inline dark:text-gray-500">toque no pivô para abrir o manejo</span>
              </div>
              <PivotMap
                pivots={mapPivots}
                onSelect={(id) => { const s = states.find((x) => hydricStateId(x) === id); if (s) openPivot(s); }}
                className="h-[min(52vh,520px)] min-h-[400px] w-full rounded-none border-0"
              />
              <HydricMapLegend counts={mapCounts} dates={dates} selectedDate={activeDate} onSelectDate={setSelectedDate} demand={demand} />
            </Card>

            {/* Fila de irrigação */}
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <p className="text-[13px] font-bold text-graphite-800 dark:text-white">Fila de irrigação</p>
                <span className="text-[11px] text-graphite-400 dark:text-gray-500">{fila.length} pivô(s) · por prioridade</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wide text-graphite-400 dark:border-white/[0.06] dark:text-gray-500">
                      <th className="px-3 py-2">Pivô</th>
                      <th className="px-2 py-2">Cultura / estádio</th>
                      <th className="px-2 py-2 text-right">AD</th>
                      <th className="px-2 py-2 text-right">Depl.</th>
                      <th className="px-2 py-2 text-right">Ks</th>
                      <th className="px-2 py-2 text-right">ETc</th>
                      <th className="px-2 py-2 text-right">Auton.</th>
                      <th className="px-2 py-2 text-right">Lâmina</th>
                      <th className="px-3 py-2">Prioridade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.map((s) => {
                      const c = s.current;
                      const pr = c ? priorityOf(c) : { label: "Sem dado", color: "#9ca3af", rank: 5 };
                      const a = c ? autonomyDays(c) : null;
                      return (
                        <tr
                          key={hydricStateId(s)}
                          onClick={() => openPivot(s)}
                          className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 dark:border-white/[0.04] dark:hover:bg-white/[0.03]"
                        >
                          <td className="px-3 py-2 font-bold text-graphite-800 dark:text-white">{s.pivotName}</td>
                          <td className="px-2 py-2 text-graphite-500 dark:text-gray-400">
                            {s.cultureName}{c?.phase ? <span className="text-graphite-400 dark:text-gray-500"> · {c.phase}</span> : ""}
                            {c?.dae != null ? <span className="text-graphite-400 dark:text-gray-500"> · {c.dae} DAE</span> : ""}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{c ? `${fmtNum(c.storage)}` : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{c ? fmtNum(c.deficit) : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{c ? fmtNum(c.ks, 2) : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{c ? fmtNum(c.etc) : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: pr.color }}>
                            {a == null ? "—" : a < 0.1 ? "0 d" : `${fmtNum(a)} d`}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{c && c.shouldIrrigate ? `${fmtNum(c.recommendedGrossDepth)}` : "—"}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: pr.color, background: `${pr.color}1a` }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: pr.color }} />{pr.label}
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

          {/* Alertas e decisões */}
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-[13px] font-bold text-graphite-900 dark:text-white">
              <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a1 1 0 00.9 1.5h18.6a1 1 0 00.9-1.5L13.7 3.9a1 1 0 00-1.7 0z" /></svg>
              Alertas e decisões
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {alerts.map((al, i) => {
                const dot = { hi: "bg-red-500", md: "bg-orange-500", lo: "bg-brand-500" } as const;
                return (
                  <div key={i} className="flex gap-2.5 rounded-xl border border-gray-100 p-3 dark:border-white/[0.06]">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[al.sev]}`} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold text-graphite-800 dark:text-white">{al.title}</p>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-graphite-500 dark:text-gray-400">{al.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* rastreabilidade das cores do mapa */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-graphite-400 dark:text-gray-500">
            {(["verde", "amarelo", "vermelho", "cinza"] as const).map((st) => (
              <span key={st} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: HYDRIC_STATUS_CONFIG[st].color }} />
                {HYDRIC_STATUS_CONFIG[st].label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
