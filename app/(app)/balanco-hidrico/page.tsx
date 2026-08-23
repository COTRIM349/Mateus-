"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ManejoChart, ManejoSeriesPicker } from "@/components/charts/ManejoChart";
import { useFarmHydricState } from "@/lib/hooks";
import {
  initialManejoVisibility,
  managementRowFromBalance,
  type ManejoSeriesKey,
} from "@/modules/reports/services";
import type { DailyBalanceRow, WaterStatus } from "@/modules/water-balance/services";

const TABS = [
  { id: "grafico", label: "Gráfico" },
  { id: "dados", label: "Dados" },
  { id: "decisao", label: "Decisão" },
] as const;

type BalancePanel = (typeof TABS)[number]["id"];

function number(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function datePtBr(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

const STATUS_LABELS: Record<string, string> = {
  capacidade_campo: "Capacidade de campo",
  otima_umidade: "Ótima umidade",
  boa_umidade: "Boa umidade",
  alerta: "Alerta",
  atencao: "Atenção",
  deficit_hidrico: "Déficit hídrico",
  incompleto: "Dados indisponíveis",
};

function waterStatus(status: "verde" | "amarelo" | "vermelho" | "cinza"): WaterStatus {
  if (status === "amarelo") return "atencao";
  if (status === "vermelho") return "deficit_critico";
  return "ideal";
}

export default function BalancoHidricoPage() {
  const { states, summary, loading, refresh } = useFarmHydricState();
  const operationalStates = useMemo(
    () => states.filter((state) => state.parcelId != null),
    [states],
  );
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [activePanel, setActivePanel] = useState<BalancePanel>("grafico");
  const [seriesVisibility, setSeriesVisibility] = useState<Record<ManejoSeriesKey, boolean>>(
    () => initialManejoVisibility(),
  );

  useEffect(() => {
    if (operationalStates.length === 0) {
      setSelectedPivotId("");
      return;
    }
    if (!operationalStates.some((state) => state.pivotId === selectedPivotId)) {
      setSelectedPivotId(operationalStates[0].pivotId);
    }
  }, [operationalStates, selectedPivotId]);

  const selected = operationalStates.find((state) => state.pivotId === selectedPivotId) ?? null;
  const current = selected?.current ?? null;
  const history = selected?.history ?? [];

  const managementRows = useMemo(() => {
    if (!selected) return [];
    return history.map((day) => {
      const legacyRow: DailyBalanceRow = {
        date: day.date,
        phase: day.phase,
        dae: day.dae,
        et0: day.et0,
        kc: day.kc,
        etc: day.etc,
        precipitation: day.precipitation,
        effectivePrecipitation: day.effectivePrecipitation,
        irrigationApplied: day.irrigation,
        rootDepth: day.rootDepth,
        cad: day.adt,
        afd: day.afd,
        storedWater: day.storage,
        depletionFactor: day.depletion,
        deficit: day.deficit,
        surplus: day.surplus,
        netDepth: day.recommendedNetDepth,
        grossDepth: day.recommendedGrossDepth,
        volumeNeeded: day.recommendedVolume,
        irrigationTime: day.estimatedIrrigationTime,
        waterStatus: waterStatus(day.status),
        pivotId: selected.pivotId,
        pivotName: selected.pivotName,
        parcelId: selected.parcelId ?? undefined,
        parcelName: selected.parcelName ?? undefined,
        cultureName: selected.cultureName,
        ks: day.ks,
        kl: day.kl,
        kcAdjusted: day.kcAdjusted,
        etcPotential: day.etcPotential,
        ky: day.ky,
        yieldRisk: day.yieldRisk,
        etcFormula: day.etcFormula,
        effectiveIrrigation: day.effectiveIrrigation,
        fieldCapacity: day.fieldCapacity,
        wiltingPoint: day.wiltingPoint,
        safetyMoistureMm: day.safetyMoistureMm,
        moisturePctCc: day.moisturePctCc,
        safetyPctCc: day.safetyPctCc,
        peFormula: day.peFormula,
        balanceFormula: day.balanceFormula,
      };
      return managementRowFromBalance(legacyRow, {
        pivotId: selected.pivotId,
        pivotName: selected.pivotName,
        parcelId: selected.parcelId,
        parcelName: selected.parcelName,
        cultureName: selected.cultureName,
      });
    });
  }, [history, selected]);

  const totals = useMemo(() => ({
    eto: history.reduce((sum, day) => sum + day.et0, 0),
    etc: history.reduce((sum, day) => sum + day.etc, 0),
    rain: history.reduce((sum, day) => sum + day.precipitation, 0),
    irrigation: history.reduce((sum, day) => sum + day.irrigation, 0),
  }), [history]);

  const toggleSeries = (key: ManejoSeriesKey) => {
    setSeriesVisibility((currentVisibility) => ({
      ...currentVisibility,
      [key]: !currentVisibility[key],
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Balanço Hídrico"
        descricao="Motor operacional V2 — mesma fonte de cálculo usada no mapa e no dashboard"
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-graphite-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block min-w-72 text-sm">
            <span className="mb-1.5 block font-medium text-gray-700 dark:text-gray-300">Pivô / parcela ativa</span>
            <select
              value={selectedPivotId}
              onChange={(e) => setSelectedPivotId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
            >
              {operationalStates.length === 0 ? <option value="">Nenhuma parcela ativa</option> : null}
              {operationalStates.map((state) => (
                <option key={`${state.pivotId}-${state.parcelId}`} value={state.pivotId}>
                  {state.pivotName} · {state.cultureName}{state.parcelName ? ` · ${state.parcelName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.12] dark:text-gray-200 dark:hover:bg-white/[0.05]"
            >
              {loading ? "Atualizando…" : "Atualizar balanço"}
            </button>
            <Link href="/balanco-hidrico/inicializar" className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/10">
              Inicializar ARM
            </Link>
            <Link href="/lancamentos/irrigacao" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
              Lançar irrigação
            </Link>
            <Link href="/lancamentos/chuvas" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Lançar chuva
            </Link>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-white/[0.08]">
        {TABS.map((tab) => (
          <PanelButton
            key={tab.id}
            panel={tab.id}
            active={activePanel === tab.id}
            label={tab.label}
            onSelect={setActivePanel}
          />
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:bg-graphite-800">
          Calculando o estado hídrico validado…
        </div>
      ) : !selected ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
          Não há parcela operacional ativa para calcular. Abra um ciclo em <Link href="/vinculacao" className="font-semibold underline">Parcelas</Link>.
        </div>
      ) : !current ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/40 dark:bg-amber-900/10">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">Dados insuficientes — recomendação bloqueada</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
            O motor V2 não calcula com informação incompleta. Verifique: condição inicial do solo confirmada, fases/Kc cobrindo o DAE atual, perfil de solo válido, eficiência de aplicação e série diária de ETo + chuva aprovada. Parcelas antigas também precisam de um seed V2 confiável.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link href="/balanco-hidrico/inicializar" className="font-semibold text-amber-900 underline dark:text-amber-200">Definir condição inicial</Link>
            <Link href="/vinculacao" className="font-semibold text-amber-900 underline dark:text-amber-200">Revisar parcela</Link>
            <Link href="/culturas" className="font-semibold text-amber-900 underline dark:text-amber-200">Revisar cultura e fases</Link>
            <Link href="/clima" className="font-semibold text-amber-900 underline dark:text-amber-200">Revisar clima</Link>
          </div>
        </div>
      ) : activePanel === "grafico" ? (
        <div className="min-h-[min(72vh,calc(100vh-14rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-graphite-800 lg:flex">
          <ManejoSeriesPicker visible={seriesVisibility} onToggle={toggleSeries} rows={managementRows} />
          <div className="min-w-0 flex-1 p-3">
            <ManejoChart rows={managementRows} visible={seriesVisibility} />
          </div>
        </div>
      ) : activePanel === "dados" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Status hídrico" value={STATUS_LABELS[current.mapStatus] ?? current.mapStatus} detail={current.phase ? `${current.phase} · DAE ${current.dae}` : `DAE ${current.dae}`} />
            <MetricCard label="ARM / CAD" value={`${number(current.storage)} / ${number(current.adt)} mm`} detail={`AFD ${number(current.afd)} mm · déficit ${number(current.deficit)} mm`} />
            <MetricCard label="ETo / ETc" value={`${number(current.et0, 2)} / ${number(current.etc, 2)} mm`} detail={`Kc ${number(current.kc, 2)} · Ks ${number(current.ks, 2)} · Kl ${number(current.kl, 2)}`} />
            <MetricCard label="Água do dia" value={`${number(current.precipitation)} mm chuva`} detail={`${number(current.irrigation)} mm irrigação bruta · ${number(current.effectiveIrrigation)} mm efetiva`} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-graphite-800">
            <h2 className="font-semibold text-gray-900 dark:text-white">Totais do período</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <SmallMetric label="ETo acumulada" value={`${number(totals.eto)} mm`} />
              <SmallMetric label="ETc acumulada" value={`${number(totals.etc)} mm`} />
              <SmallMetric label="Chuva acumulada" value={`${number(totals.rain)} mm`} />
              <SmallMetric label="Irrigação aplicada" value={`${number(totals.irrigation)} mm`} />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-graphite-800">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-white/[0.08]">
              <h2 className="font-semibold text-gray-900 dark:text-white">Dados do balanço</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Somente dias com clima completo, fase válida e continuidade de ARM.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-graphite-900 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Data</th><th className="px-4 py-3 text-right">DAE</th><th className="px-4 py-3">Fase</th>
                    <th className="px-4 py-3 text-right">ETo</th><th className="px-4 py-3 text-right">ETc</th><th className="px-4 py-3 text-right">Chuva</th>
                    <th className="px-4 py-3 text-right">Irrig.</th><th className="px-4 py-3 text-right">ARM</th><th className="px-4 py-3 text-right">Déficit</th><th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {[...history].reverse().map((day) => (
                    <tr key={day.date}>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{datePtBr(day.date)}</td><td className="px-4 py-3 text-right">{day.dae}</td><td className="px-4 py-3">{day.phase}</td>
                      <td className="px-4 py-3 text-right">{number(day.et0, 2)}</td><td className="px-4 py-3 text-right">{number(day.etc, 2)}</td><td className="px-4 py-3 text-right">{number(day.precipitation)}</td>
                      <td className="px-4 py-3 text-right">{number(day.irrigation)}</td><td className="px-4 py-3 text-right font-medium">{number(day.storage)}</td><td className="px-4 py-3 text-right">{number(day.deficit)}</td><td className="px-4 py-3">{STATUS_LABELS[day.mapStatus] ?? day.mapStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-graphite-800 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Decisão de irrigação</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Calculada exclusivamente pelo motor V2 validado.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${current.shouldIrrigate ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"}`}>
                {current.shouldIrrigate ? "IRRIGAR" : "SEM IRRIGAÇÃO"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{current.recommendationReason}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <SmallMetric label="Lâmina líquida" value={`${number(current.recommendedNetDepth)} mm`} />
              <SmallMetric label="Lâmina bruta" value={`${number(current.recommendedGrossDepth)} mm`} />
              <SmallMetric label="Volume" value={`${number(current.recommendedVolume, 0)} m³`} />
              <SmallMetric label="Tempo estimado" value={`${number(current.estimatedIrrigationTime, 1)} h`} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-graphite-800">
            <h2 className="font-semibold text-gray-900 dark:text-white">Rastreabilidade</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Pivô" value={selected.pivotName} /><Row label="Cultura" value={selected.cultureName} /><Row label="Solo" value={selected.soilName ?? "—"} />
              <Row label="Data" value={datePtBr(current.date)} /><Row label="Fórmula ETc" value={current.etcFormula} /><Row label="Balanço" value={current.balanceFormula} />
            </dl>
          </div>
        </div>
      )}

      {summary ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Fazenda: {summary.totalPivots} pivô(s) avaliados · {summary.totalPivots - summary.noData} com balanço válido · {summary.noData} bloqueados por dados incompletos.
        </p>
      ) : null}
    </div>
  );
}

function PanelButton({ panel, active, label, onSelect }: {
  panel: "grafico" | "dados" | "decisao";
  active: boolean;
  label: string;
  onSelect: (panel: BalancePanel) => void;
}) {
  return (
    <button type="button" onClick={() => onSelect(panel)} className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${active ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}>
      {label}
    </button>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-graphite-800"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p></div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]"><p className="text-xs text-gray-500 dark:text-gray-400">{label}</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{value}</p></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd className="break-words text-gray-800 dark:text-gray-200">{value}</dd></div>;
}
