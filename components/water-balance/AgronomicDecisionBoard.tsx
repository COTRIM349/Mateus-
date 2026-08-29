"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import {
  AGRONOMIC_STATUS_CONFIG,
  interpretKs,
  type AgronomicStatus,
  type IrrigationPriority,
} from "@/modules/water-balance/agronomy";

export interface DecisionSnapshot {
  parcelName: string;
  cultureName: string;
  varietyName: string | null;
  plantingDate: string | null;
  dae: number | null;
  phase: string;
  pivotName: string;
  areaHa: number | null;
  et0: number | null;
  kc: number | null;
  etcPotential: number | null;
  etcAdjusted: number | null;
  ks: number | null;
  ksFormula: string | null;
  ksInterpretation: string | null;
  ctaMm: number | null;
  craMm: number | null;
  fd: number | null;
  fdMode: string;
  drMm: number | null;
  armMm: number | null;
  zrCm: number | null;
  zrMethod: string | null;
  rain24h: number | null;
  irrigation24h: number | null;
  netMm: number | null;
  grossMm: number | null;
  volumeM3: number | null;
  runtimeH: number | null;
  daysToCra: number | null;
  daysToCraNote: string | null;
  status: AgronomicStatus;
  priority: IrrigationPriority;
  justification: string;
  missing: string[];
  engineVersion: string;
  calculationMemory: string[];
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const absent = value.startsWith("Dado ausente");
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/[0.06] dark:bg-graphite-900/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400">{label}</p>
      <p className={`mt-1 text-[15px] font-extrabold tabular-nums ${absent ? "text-amber-700 dark:text-amber-400" : "text-graphite-900 dark:text-white"}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-graphite-400">{hint}</p> : null}
    </div>
  );
}

function fmt(value: number | null | undefined, digits: number, unit: string, missing = "valor"): string {
  if (value == null || !Number.isFinite(value)) return `Dado ausente: ${missing}`;
  return `${value.toFixed(digits)} ${unit}`;
}

const PRIORITY_LABEL: Record<IrrigationPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export function AgronomicDecisionBoard({ snapshot }: { snapshot: DecisionSnapshot | null }) {
  const [openMemory, setOpenMemory] = useState(false);
  if (!snapshot) return null;
  const conf = AGRONOMIC_STATUS_CONFIG[snapshot.status];

  return (
    <Card className="mb-4 overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-graphite-400">Motor de decisão agronômica</p>
          <h2 className="mt-0.5 text-lg font-black text-graphite-900 dark:text-white">
            {snapshot.cultureName} — {snapshot.pivotName}
            {snapshot.varietyName ? ` · ${snapshot.varietyName}` : ""}
          </h2>
          <p className="mt-1 text-[11px] text-graphite-500">
            Plantio {snapshot.plantingDate ?? "Dado ausente: data de plantio"} · DAE {snapshot.dae ?? "—"} · {snapshot.phase}
            {snapshot.areaHa != null ? ` · ${snapshot.areaHa} ha` : ""} · Zr {fmt(snapshot.zrCm, 0, "cm", "Zr")} ({snapshot.zrMethod ?? "—"})
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white"
            style={{ backgroundColor: conf.color }}
          >
            {conf.label}
          </span>
          <span className="text-[11px] font-semibold text-graphite-500">
            Prioridade {PRIORITY_LABEL[snapshot.priority]} · {snapshot.engineVersion}
          </span>
        </div>
      </div>

      {snapshot.missing.length > 0 && (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Dado ausente: {snapshot.missing.join(" · ")}
        </p>
      )}

      <div className="grid gap-2 p-4 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="ETo hoje" value={fmt(snapshot.et0, 2, "mm/d", "ETo")} hint="clima operacional" />
        <Metric label="Kc" value={fmt(snapshot.kc, 2, "", "Kc")} hint="cultura / estádio" />
        <Metric label="ETc potencial" value={fmt(snapshot.etcPotential, 2, "mm/d", "ETc pot")} hint="ETo × Kc × KL" />
        <Metric label="Ks" value={fmt(snapshot.ks, 2, "", "Ks")} hint={snapshot.ksFormula ?? undefined} />
        <Metric label="ETc ajustada" value={fmt(snapshot.etcAdjusted, 2, "mm/d", "ETc real")} hint="ETc pot × Ks" />
        <Metric label="CTA / CAD" value={fmt(snapshot.ctaMm, 1, "mm", "CTA")} hint="reservatório total" />
        <Metric label="FD" value={fmt(snapshot.fd != null ? snapshot.fd * 100 : null, 0, "%", "FD")} hint={snapshot.fdMode === "auto" ? "ajustado FAO-56" : "fixo"} />
        <Metric label="CRA / AFD" value={fmt(snapshot.craMm, 1, "mm", "CRA")} hint="CTA × FD" />
        <Metric label="Depleção Dr" value={fmt(snapshot.drMm, 1, "mm", "Dr")} />
        <Metric label="ARM" value={fmt(snapshot.armMm, 1, "mm", "ARM")} hint="CTA − Dr" />
        <Metric label="Chuva 24 h" value={fmt(snapshot.rain24h, 1, "mm", "chuva")} />
        <Metric label="Irrigação 24 h" value={fmt(snapshot.irrigation24h, 1, "mm", "irrigação")} />
      </div>

      <div className="grid gap-3 border-t border-gray-100 px-5 py-4 dark:border-white/[0.06] lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-graphite-400">Recomendação</p>
          <p className="mt-2 text-sm font-semibold text-graphite-800 dark:text-gray-200">{snapshot.justification}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="LL" value={fmt(snapshot.netMm, 1, "mm", "lâmina líquida")} />
            <Metric label="LB" value={fmt(snapshot.grossMm, 1, "mm", "lâmina bruta")} />
            <Metric label="Volume" value={fmt(snapshot.volumeM3, 0, "m³", "volume")} />
            <Metric label="Tempo" value={fmt(snapshot.runtimeH, 1, "h", "vazão do pivô")} />
          </div>
          <p className="mt-3 text-xs text-graphite-500">
            Dias até CRA: {snapshot.daysToCra != null ? snapshot.daysToCra.toFixed(1) : "Dado ausente: previsão"}
            {snapshot.daysToCraNote ? ` — ${snapshot.daysToCraNote}` : ""}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-graphite-400">Ks — interpretação</p>
          <p className="mt-2 text-sm leading-relaxed text-graphite-700 dark:text-gray-300">
            {snapshot.ksInterpretation ?? interpretKs(snapshot.ks)}
          </p>
          <button
            type="button"
            onClick={() => setOpenMemory((v) => !v)}
            className="mt-3 rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-bold text-graphite-700 hover:border-brand-200 dark:border-white/[0.08] dark:text-gray-300"
          >
            {openMemory ? "Ocultar cálculo" : "Ver cálculo"}
          </button>
          {openMemory && (
            <ul className="mt-3 space-y-1 rounded-xl bg-gray-50 p-3 font-mono text-[10px] leading-relaxed text-graphite-600 dark:bg-white/[0.03] dark:text-gray-400">
              {snapshot.calculationMemory.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
