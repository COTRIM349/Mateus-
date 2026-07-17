"use client";

import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Tabs, EmptyState } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useFarmHydricState } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/utils/cn";
import {
  HYDRIC_STATUS_CONFIG,
  type PivotHydricState,
  type BalanceDay,
} from "@/modules/water-balance/services";

// ── Pivot selector ──────────────────────────────────────────────────────

function PivotSelector({
  states,
  selectedId,
  onSelect,
}: {
  states: PivotHydricState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const sorted = useMemo(() => {
    return [...states].sort((a, b) => {
      const da = a.current?.depletion ?? -1;
      const db = b.current?.depletion ?? -1;
      return db - da;
    });
  }, [states]);

  return (
    <Card className="p-0">
      <div className="border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">
          Selecionar Pivô ({states.length})
        </p>
      </div>
      <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
        {sorted.map((pivot) => {
          const status = pivot.current?.status ?? "cinza";
          const cfg = HYDRIC_STATUS_CONFIG[status];
          const selected = pivot.pivotId === selectedId;

          return (
            <button
              key={pivot.pivotId}
              type="button"
              onClick={() => onSelect(pivot.pivotId)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-gray-50 px-5 py-3 text-left transition-colors last:border-b-0 dark:border-white/[0.03]",
                selected
                  ? "bg-brand-50/80 dark:bg-brand-900/15"
                  : "hover:bg-gray-50/80 dark:hover:bg-white/[0.03]",
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white dark:ring-graphite-800"
                style={{ backgroundColor: cfg.color }}
              />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "truncate text-[13px] font-semibold",
                  selected ? "text-brand-700 dark:text-brand-400" : "text-graphite-800 dark:text-white",
                )}>
                  {pivot.pivotName}
                </p>
                <p className="truncate text-[11px] text-graphite-400 dark:text-gray-500">
                  {pivot.cultureName}
                  {pivot.current ? ` · ${pivot.current.deficit.toFixed(1)} mm déficit` : ""}
                </p>
              </div>
              {pivot.current?.shouldIrrigate && (
                <span className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  IRRIGAR
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── Water bar (ARM visualization) ───────────────────────────────────────

function WaterBar({ day }: { day: BalanceDay }) {
  const armPct = day.adt > 0 ? Math.min((day.storage / day.adt) * 100, 100) : 0;
  const afdPct = day.adt > 0 ? ((day.adt - day.afd) / day.adt) * 100 : 0;
  const cfg = HYDRIC_STATUS_CONFIG[day.status];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-graphite-600 dark:text-gray-400">
          Armazenamento
        </span>
        <span className="font-bold tabular-nums text-graphite-800 dark:text-white">
          {day.storage.toFixed(1)} / {day.adt.toFixed(1)} mm ({armPct.toFixed(0)}%)
        </span>
      </div>
      <div className="relative h-6 overflow-hidden rounded-lg bg-gray-100 dark:bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
          style={{ width: `${armPct}%`, backgroundColor: cfg.color }}
        />
        <div
          className="absolute inset-y-0 border-r-2 border-dashed border-amber-500/50"
          style={{ left: `${afdPct}%` }}
          title={`Limite AFD: ${afdPct.toFixed(0)}%`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-graphite-500 dark:text-gray-400">
          CAD
        </span>
      </div>
      <div className="flex items-center gap-4 text-[10px] text-graphite-400 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
          ARM {armPct.toFixed(0)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full border border-dashed border-amber-500" />
          Limite AFD
        </span>
      </div>
    </div>
  );
}

// ── Summary Tab ─────────────────────────────────────────────────────────

function SummaryTab({ pivot }: { pivot: PivotHydricState }) {
  const day = pivot.current!;
  const status = day.status;
  const cfg = HYDRIC_STATUS_CONFIG[status];

  const metrics = [
    { label: "ARM", value: `${day.storage.toFixed(1)} mm`, desc: "Armazenamento atual" },
    { label: "CAD", value: `${day.adt.toFixed(1)} mm`, desc: "Capacidade de água disponível" },
    { label: "AFD", value: `${day.afd.toFixed(1)} mm`, desc: "Água facilmente disponível" },
    { label: "Déficit", value: `${day.deficit.toFixed(1)} mm`, desc: "Déficit acumulado" },
    { label: "ETo", value: `${day.et0.toFixed(1)} mm`, desc: "Evapotranspiração referência" },
    { label: "ETc", value: `${day.etc.toFixed(1)} mm`, desc: "Evapotranspiração cultura" },
    { label: "Kc", value: day.kc.toFixed(2), desc: "Coeficiente de cultura" },
    { label: "Profundidade raiz", value: `${(day.rootDepth * 100).toFixed(0)} cm`, desc: "Profundidade radicular" },
    { label: "Fase", value: day.phase, desc: `DAE ${day.dae}` },
    { label: "Precipitação", value: `${day.precipitation.toFixed(1)} mm`, desc: `Efetiva: ${day.effectivePrecipitation.toFixed(1)} mm` },
    { label: "Irrigação aplicada", value: `${day.irrigation.toFixed(1)} mm`, desc: `Efetiva: ${day.effectiveIrrigation.toFixed(1)} mm` },
    { label: "Depleção", value: `${(day.depletion * 100).toFixed(0)}%`, desc: "Fração depletada" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-graphite-900 dark:text-white">
              {pivot.pivotName}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold",
                cfg.bgClass,
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {cfg.label}
            </span>
          </div>
          <p className="text-[12px] text-graphite-400 dark:text-gray-500">
            {pivot.cultureName}
            {pivot.varietyName ? ` · ${pivot.varietyName}` : ""}
            {pivot.seasonName ? ` · ${pivot.seasonName}` : ""}
            {" · "}{pivot.area.toFixed(1)} ha
          </p>
        </div>
      </div>

      <WaterBar day={day} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <p className="text-[10px] text-graphite-400 dark:text-gray-500">{m.label}</p>
            <p className="mt-0.5 text-[15px] font-bold tabular-nums text-graphite-800 dark:text-white">
              {m.value}
            </p>
            <p className="text-[9px] text-graphite-400 dark:text-gray-500">{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────

function HistoryTab({ pivot }: { pivot: PivotHydricState }) {
  const recent = useMemo(
    () => [...pivot.history].reverse().slice(0, 14),
    [pivot.history],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wider text-graphite-400 dark:border-white/[0.06] dark:text-gray-500">
            <th className="pb-2 pr-3">Data</th>
            <th className="pb-2 pr-3">DAE</th>
            <th className="pb-2 pr-3">Fase</th>
            <th className="pb-2 pr-3 text-right">ETo</th>
            <th className="pb-2 pr-3 text-right">ETc</th>
            <th className="pb-2 pr-3 text-right">Chuva</th>
            <th className="pb-2 pr-3 text-right">Irrig.</th>
            <th className="pb-2 pr-3 text-right">ARM</th>
            <th className="pb-2 pr-3 text-right">Déf.</th>
            <th className="pb-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((day) => {
            const cfg = HYDRIC_STATUS_CONFIG[day.status];
            return (
              <tr
                key={day.date}
                className="border-b border-gray-50 dark:border-white/[0.03]"
              >
                <td className="py-2 pr-3 font-medium text-graphite-700 dark:text-gray-300">
                  {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </td>
                <td className="py-2 pr-3 tabular-nums text-graphite-500 dark:text-gray-400">{day.dae}</td>
                <td className="py-2 pr-3 text-graphite-500 dark:text-gray-400">{day.phase}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-graphite-600 dark:text-gray-300">{day.et0.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-graphite-600 dark:text-gray-300">{day.etc.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-blue-600 dark:text-blue-400">
                  {day.precipitation > 0 ? day.precipitation.toFixed(1) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-brand-600 dark:text-brand-400">
                  {day.irrigation > 0 ? day.irrigation.toFixed(1) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium text-graphite-700 dark:text-gray-200">{day.storage.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-graphite-500 dark:text-gray-400">{day.deficit.toFixed(1)}</td>
                <td className="py-2 text-center">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: cfg.color }}
                    title={cfg.label}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Decision Panel ──────────────────────────────────────────────────────

function DecisionPanel({
  pivot,
  onApply,
  applying,
  message,
}: {
  pivot: PivotHydricState;
  onApply: (depth: number) => void;
  applying: boolean;
  message: string;
}) {
  const day = pivot.current!;
  const [customDepth, setCustomDepth] = useState("");

  const scenarios = useMemo(() => {
    const base = day.recommendedNetDepth;
    if (base <= 0) return [];
    const efficiency = day.effectiveIrrigation > 0 && day.irrigation > 0
      ? day.effectiveIrrigation / day.irrigation
      : 0.85;

    const makeScenario = (name: string, desc: string, netDepth: number) => {
      const gross = efficiency > 0 ? netDepth / efficiency : netDepth;
      const projectedArm = Math.min(day.adt, day.storage + netDepth);
      const projectedPct = day.adt > 0 ? Math.round((projectedArm / day.adt) * 100) : 0;
      return { name, desc, netDepth, gross, projectedArm, projectedPct };
    };

    return [
      makeScenario("Lâmina completa", "Reposição total até CAD", base),
      makeScenario("75%", "Reposição parcial", base * 0.75),
      makeScenario("50%", "Déficit controlado", base * 0.5),
    ];
  }, [day]);

  const handleApply = (grossDepth: number) => {
    onApply(parseFloat(grossDepth.toFixed(1)));
  };

  if (!day.shouldIrrigate) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/20">
            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-graphite-800 dark:text-white">
              Sem necessidade de irrigação
            </p>
            <p className="text-[12px] text-graphite-400 dark:text-gray-500">
              {day.recommendationReason}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 bg-red-50/30 px-5 py-4 dark:border-white/[0.06] dark:bg-red-900/5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
          Decisão de Irrigação
        </p>
        <p className="mt-1 text-[12px] text-red-600/80 dark:text-red-400/60">
          {day.recommendationReason}
        </p>
      </div>

      <div className="p-5">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <p className="text-[10px] text-graphite-400 dark:text-gray-500">Lâmina líquida</p>
            <p className="text-[16px] font-bold tabular-nums text-graphite-800 dark:text-white">
              {day.recommendedNetDepth.toFixed(1)} mm
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <p className="text-[10px] text-graphite-400 dark:text-gray-500">Lâmina bruta</p>
            <p className="text-[16px] font-bold tabular-nums text-graphite-800 dark:text-white">
              {day.recommendedGrossDepth.toFixed(1)} mm
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <p className="text-[10px] text-graphite-400 dark:text-gray-500">Volume</p>
            <p className="text-[16px] font-bold tabular-nums text-graphite-800 dark:text-white">
              {day.recommendedVolume.toFixed(0)} m³
            </p>
          </div>
        </div>

        {/* Scenarios */}
        {scenarios.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-semibold text-graphite-500 dark:text-gray-400">
              Cenários
            </p>
            <div className="space-y-2">
              {scenarios.map((sc) => (
                <div
                  key={sc.name}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 dark:border-white/[0.06]"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-graphite-800 dark:text-white">
                      {sc.name}
                    </p>
                    <p className="text-[11px] text-graphite-400 dark:text-gray-500">
                      {sc.desc} · ARM → {sc.projectedPct}%
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold tabular-nums text-graphite-700 dark:text-gray-300">
                      {sc.gross.toFixed(1)} mm
                    </span>
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => handleApply(sc.gross)}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-soft transition-colors hover:bg-brand-700 disabled:opacity-50"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom depth */}
        <div className="flex items-end gap-3 border-t border-gray-100 pt-4 dark:border-white/[0.06]">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium text-graphite-500 dark:text-gray-400">
              Lâmina personalizada (mm bruta)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={customDepth}
              onChange={(e) => setCustomDepth(e.target.value)}
              placeholder="Ex: 15.0"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] tabular-nums text-graphite-800 outline-none transition-colors placeholder:text-graphite-300 focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600"
            />
          </div>
          <button
            type="button"
            disabled={applying || !customDepth || parseFloat(customDepth) <= 0}
            onClick={() => handleApply(parseFloat(customDepth))}
            className="rounded-xl bg-brand-600 px-5 py-2 text-[13px] font-semibold text-white shadow-soft transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>

        {message && (
          <p className={cn(
            "mt-3 text-[12px] font-medium",
            message.includes("sucesso")
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400",
          )}>
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

const DETAIL_TABS = [
  { id: "resumo", label: "Resumo" },
  { id: "historico", label: "Histórico" },
];

export default function DecisaoPage() {
  const { farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const { states, loading, refresh } = useFarmHydricState();
  const [selectedPivotId, setSelectedPivotId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("resumo");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");

  const supabase = createClient();

  const selectedPivot = useMemo(
    () => states.find((s) => s.pivotId === selectedPivotId) ?? null,
    [states, selectedPivotId],
  );

  const handleApplyIrrigation = useCallback(
    async (depthMm: number) => {
      if (!selectedPivotId || !selectedPivot) return;
      setApplying(true);
      setMessage("");

      try {
        const area = selectedPivot.area;
        const volumeM3 = depthMm * area * 10;
        const today = new Date().toISOString().slice(0, 10);

        const { error } = await supabase.from("irrigation_events").insert({
          pivot_id: selectedPivotId,
          started_at: today + "T06:00:00",
          depth_mm: depthMm,
          volume_m3: volumeM3,
          status: "concluida",
        } as Record<string, unknown>);

        if (error) throw new Error(error.message);
        setMessage("Irrigação lançada com sucesso");
        refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Erro ao salvar irrigação");
      } finally {
        setApplying(false);
      }
    },
    [selectedPivotId, selectedPivot, supabase, refresh],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
      </div>
    );
  }

  if (states.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Decisão de Irrigação"
          descricao={activeFarm?.name ?? "Operação"}
        />
        <EmptyState
          title="Nenhum pivô cadastrado"
          description="Cadastre pivôs e vincule culturas para utilizar a tela de decisão."
        />
      </div>
    );
  }

  // ── Dados derivados para o resumo e a tabela ──────────────────────────
  const ranked = [...states].sort((a, b) => (b.current?.depletion ?? -1) - (a.current?.depletion ?? -1));
  const needing = states.filter((s) => s.current?.shouldIrrigate);
  const laminaMedia = needing.length > 0
    ? needing.reduce((a, s) => a + (s.current?.recommendedGrossDepth ?? 0), 0) / needing.length
    : 0;
  const areaRec = needing.reduce((a, s) => a + s.area, 0);
  const culturasPrio = Array.from(new Set(needing.map((s) => s.cultureName))).slice(0, 3).join(" · ") || "—";
  const recomendacaoHoje = needing.length === 0
    ? "Sem necessidade"
    : needing.length >= Math.ceil(states.length / 2)
      ? "Irrigação prioritária"
      : "Irrigação moderada";

  const fmtTempo = (h: number | undefined) => {
    if (!h || h <= 0) return "—";
    const H = Math.floor(h);
    const M = Math.round((h - H) * 60);
    return H > 0 ? `${H}h ${M.toString().padStart(2, "0")}min` : `${M}min`;
  };
  const prioridade = (s: PivotHydricState): { label: string; cls: string } => {
    if (s.current?.shouldIrrigate) return { label: "Alta", cls: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" };
    if (s.current?.status === "amarelo") return { label: "Média", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" };
    if (s.current?.status === "verde") return { label: "Baixa", cls: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" };
    return { label: "—", cls: "bg-gray-100 text-graphite-400 dark:bg-white/[0.06] dark:text-gray-500" };
  };

  const summary = [
    { label: "Recomendação para hoje", value: recomendacaoHoje, note: `${needing.length} de ${states.length} pivôs`, accent: needing.length > 0 ? "text-brand-600 dark:text-brand-400" : "text-graphite-800 dark:text-white" },
    { label: "Lâmina recomendada", value: `${laminaMedia.toFixed(1)} mm`, note: "média ponderada" },
    { label: "Área recomendada", value: `${areaRec.toFixed(1)} ha`, note: "a irrigar hoje" },
    { label: "Prioridade", value: culturasPrio, note: "culturas em déficit" },
    { label: "Melhor janela", value: "05:00 – 10:00", note: "menor demanda e vento" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Decisão de Irrigação"
        descricao="Recomendações para hoje e próximos dias"
        acao={
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-graphite-700 shadow-soft transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006 5.3M4 15a8 8 0 0014 3.7" /></svg>
            Atualizar recomendações
          </button>
        }
      />

      {/* Resumo da recomendação */}
      <Card className="p-0">
        <div className="grid grid-cols-2 divide-x divide-gray-100 md:grid-cols-3 lg:grid-cols-5 dark:divide-white/[0.06]">
          {summary.map((s, i) => (
            <div key={i} className="px-5 py-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{s.label}</p>
              <p className={`mt-1.5 truncate text-[17px] font-extrabold tracking-tight ${s.accent ?? "text-graphite-900 dark:text-white"}`}>{s.value}</p>
              <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">{s.note}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Tabela de recomendações por pivô */}
      <Card className="p-0">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Recomendações por pivô</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-graphite-400 dark:border-white/[0.06] dark:text-gray-500">
                <th className="px-6 py-3">Pivô</th>
                <th className="px-3 py-3">Cultura</th>
                <th className="px-3 py-3 text-right">Déficit</th>
                <th className="px-3 py-3 text-right">Lâmina rec.</th>
                <th className="px-3 py-3 text-right">Tempo</th>
                <th className="px-3 py-3 text-center">Prioridade</th>
                <th className="px-6 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s) => {
                const day = s.current;
                const prio = prioridade(s);
                const sel = s.pivotId === selectedPivotId;
                return (
                  <tr
                    key={s.pivotId}
                    className={`cursor-pointer border-b border-gray-50 transition-colors last:border-b-0 dark:border-white/[0.04] ${sel ? "bg-brand-50/50 dark:bg-brand-900/10" : "hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"}`}
                    onClick={() => { setSelectedPivotId(s.pivotId); setMessage(""); setActiveTab("resumo"); }}
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HYDRIC_STATUS_CONFIG[day?.status ?? "cinza"].color }} />
                        <span className="font-semibold text-graphite-800 dark:text-white">{s.pivotName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-graphite-500 dark:text-gray-400">{s.cultureName}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-graphite-700 dark:text-gray-200">{day ? `${day.deficit.toFixed(1)} mm` : "—"}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-graphite-800 dark:text-white">{day && day.shouldIrrigate ? `${day.recommendedGrossDepth.toFixed(1)} mm` : "0,0 mm"}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-graphite-500 dark:text-gray-400">{fmtTempo(day?.shouldIrrigate ? day.estimatedIrrigationTime : 0)}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold ${prio.cls}`}>{prio.label}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {day?.shouldIrrigate ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedPivotId(s.pivotId); setActiveTab("resumo"); setMessage(""); }}
                          className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft transition-colors hover:bg-brand-700"
                        >
                          Recomendar
                        </button>
                      ) : day?.status === "amarelo" ? (
                        <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">Monitorar</span>
                      ) : day?.status === "verde" ? (
                        <span className="text-[12px] font-medium text-green-600 dark:text-green-400">Adequado</span>
                      ) : (
                        <span className="text-[12px] text-graphite-400 dark:text-gray-500">Sem dados</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detalhe do pivô selecionado (abre ao clicar na linha) */}
      {selectedPivot && selectedPivot.current && (
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <Card className="p-5">
            <Tabs tabs={DETAIL_TABS} activeTab={activeTab} onChange={setActiveTab} />
            <div className="mt-4">
              {activeTab === "resumo" && <SummaryTab pivot={selectedPivot} />}
              {activeTab === "historico" && <HistoryTab pivot={selectedPivot} />}
            </div>
          </Card>
          <DecisionPanel
            pivot={selectedPivot}
            onApply={handleApplyIrrigation}
            applying={applying}
            message={message}
          />
        </div>
      )}
    </div>
  );
}
