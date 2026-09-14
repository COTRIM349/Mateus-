"use client";

/**
 * Painel de Balanço Hídrico v4 — camada de APRESENTAÇÃO (spec-2 §30-31, §44).
 * Recebe um resultado já calculado pelo motor puro (modules/hydric) — NÃO
 * calcula nada aqui. Toda fórmula vive no motor.
 */
import { useState } from "react";
import type { DailyBalanceResultV4 } from "@/modules/hydric/engine/hydricEngineV4";
import { HYDRIC_STATE_CONFIG } from "@/modules/hydric/domain/glossary";

export interface HydricV4Context {
  parcelName: string;
  cultureName: string;
  varietyName?: string | null;
  phase?: string | null;
  dae?: number | null;
  areaHa?: number | null;
  rootDepthCm?: number | null;
  balanceDate: string;
  /** ETo do dia (mm) + natureza para o card e a separação temporal. */
  etoToday?: number | null;
  etoNature?: "observed" | "estimated" | "forecast" | null;
  /** Lâmina líquida/bruta/volume/tempo — recomendação (spec-2 §34). */
  recommendation?: {
    netMm: number | null;
    grossMm: number | null;
    volumeM3: number | null;
    runtimeH: number | null;
    daysToLimit: number | null;
  } | null;
}

function fmt(v: number | null | undefined, dec = 1, unit = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (unit ? ` ${unit}` : "");
}

function Metric({ label, value, unit, hint, emphasis }: {
  label: string; value: string; unit?: string; hint?: string; emphasis?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${emphasis
      ? "border-brand-200 bg-brand-50/40 dark:border-brand-800/40 dark:bg-brand-900/10"
      : "border-gray-100 dark:border-white/[0.06]"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-graphite-900 dark:text-white">
        {value}{unit && <span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-graphite-400 dark:text-gray-500">{hint}</div>}
    </div>
  );
}

export function HydricV4Panel({ ctx, result }: { ctx: HydricV4Context; result: DailyBalanceResultV4 }) {
  const [showMemory, setShowMemory] = useState(false);
  const st = result.state;
  const stateCfg = HYDRIC_STATE_CONFIG[st];

  // Bloqueado por dado ausente (spec §2)
  if (!result.computed) {
    return (
      <div className="space-y-4">
        <Header ctx={ctx} result={result} stateCfg={stateCfg} />
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700/50 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Cálculo oficial bloqueado — dado obrigatório ausente</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-400">
            {result.missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-amber-700/80 dark:text-amber-400/80">
            O motor não assume valores. Preencha os requisitos acima para liberar o cálculo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header ctx={ctx} result={result} stateCfg={stateCfg} />

      {/* Cards principais — demanda + solo (spec-2 §30) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="ETo" value={fmt(ctx.etoToday, 2)} unit="mm" hint={ctx.etoNature === "forecast" ? "prevista" : ctx.etoNature === "estimated" ? "estimada" : "último dia fechado"} />
        <Metric label="ETc potencial" value={fmt(result.etcPotential, 2)} unit="mm" hint="ETo×Kc×Kl" />
        <Metric label="Ks" value={fmt(result.ks, 2)} hint={result.ks === 1 ? "sem estresse" : "estresse hídrico"} emphasis={result.ks != null && result.ks < 1} />
        <Metric label="ETc ajustada" value={fmt(result.etcReal, 2)} unit="mm" hint="×Ks" />
        <Metric label="CAD / CTA" value={fmt(result.cad, 1)} unit="mm" hint="reservatório total" />
        <Metric label="AFD / CRA" value={fmt(result.afd, 1)} unit="mm" hint={`FD ${fmt(result.pAdjusted, 2)}`} />
        <Metric label="Dr (depleção)" value={fmt(result.dr, 1)} unit="mm" emphasis />
        <Metric label="ARM" value={fmt(result.arm, 1)} unit="mm" hint={`${fmt(result.pctArm, 0)}% do CAD`} />
        <Metric label="ARM crítico" value={fmt(result.armCritico, 1)} unit="mm" hint="limite segurança" />
        <Metric label="Drenagem" value={fmt(result.deepPercolation, 1)} unit="mm" hint="percolação" />
        <Metric label="Chuva efetiva" value={fmt(result.effectiveRain, 1)} unit="mm" />
        <Metric label="Irrig. efetiva" value={fmt(result.irrigationEffective, 1)} unit="mm" hint="×Ea" />
      </div>

      {/* Recomendação (spec-2 §34) */}
      {ctx.recommendation && (
        <div className="rounded-xl border border-gray-100 p-4 dark:border-white/[0.06]">
          <p className="mb-3 text-sm font-bold text-brand-700 dark:text-brand-400">Recomendação de irrigação</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Lâmina líquida" value={fmt(ctx.recommendation.netMm, 1)} unit="mm" />
            <Metric label="Lâmina bruta" value={fmt(ctx.recommendation.grossMm, 1)} unit="mm" hint="÷Ea" />
            <Metric label="Volume" value={fmt(ctx.recommendation.volumeM3, 0)} unit="m³" />
            <Metric label="Tempo pivô" value={fmt(ctx.recommendation.runtimeH, 1)} unit="h" />
            <Metric label="Dias até AFD" value={ctx.recommendation.daysToLimit == null ? "—" : fmt(ctx.recommendation.daysToLimit, 1)} hint="≈ aprox." />
          </div>
        </div>
      )}

      {/* Memória de cálculo (spec-2 §31, §40) */}
      <div className="rounded-xl border border-gray-100 dark:border-white/[0.06]">
        <button onClick={() => setShowMemory((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-graphite-800 dark:text-gray-200">
          <span>Ver cálculo (memória e rastreabilidade)</span>
          <span className="text-graphite-400">{showMemory ? "▲" : "▼"}</span>
        </button>
        {showMemory && (
          <div className="border-t border-gray-100 px-4 py-3 dark:border-white/[0.06]">
            <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              <MemRow k="Motor" v={result.engineVersion} />
              <MemRow k="Modo" v={result.mode === "single" ? "Coeficiente único (Kc)" : "Dual (Kcb+Ke)"} />
              <MemRow k="ETc potencial" v={`ETo × Kc × Kl = ${fmt(result.etcPotential, 2)} mm`} />
              <MemRow k="p ajustado (FAO-56 eq.84)" v={fmt(result.pAdjusted, 3)} />
              <MemRow k="AFD" v={`CAD × p = ${fmt(result.cad, 1)} × ${fmt(result.pAdjusted, 2)} = ${fmt(result.afd, 1)} mm`} />
              <MemRow k="Ks" v={result.ks === 1 ? "1 (Dr ≤ AFD)" : `(CAD − Dr)/((1−p)×CAD) = ${fmt(result.ks, 3)}`} />
              <MemRow k="ETc real" v={`ETc pot × Ks = ${fmt(result.etcReal, 2)} mm`} />
              <MemRow k="ARM" v={`clamp(ARM_ant + Pe + Ief − ETc, 0, CAD) = ${fmt(result.arm, 1)} mm`} />
              <MemRow k="Dr" v={`CAD − ARM = ${fmt(result.dr, 1)} mm`} />
              <MemRow k="Drenagem profunda" v={`${fmt(result.deepPercolation, 1)} mm`} />
            </dl>
            <p className="mt-3 text-[10px] text-graphite-400 dark:text-gray-500">
              Ks &lt; 1 significa <b>restrição da transpiração por déficit hídrico</b> — a cultura tem demanda potencial maior, mas o solo limita a água disponível. Não significa "a planta precisa de menos água".
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ ctx, result, stateCfg }: {
  ctx: HydricV4Context;
  result: DailyBalanceResultV4;
  stateCfg: (typeof HYDRIC_STATE_CONFIG)[keyof typeof HYDRIC_STATE_CONFIG];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div>
        <p className="text-sm font-bold text-graphite-900 dark:text-white">{ctx.parcelName}</p>
        <p className="text-xs text-graphite-500 dark:text-gray-400">
          {ctx.cultureName}{ctx.varietyName ? ` · ${ctx.varietyName}` : ""}
          {ctx.phase ? ` · ${ctx.phase}` : ""}
          {ctx.dae != null ? ` · DAE ${ctx.dae}` : ""}
          {ctx.rootDepthCm != null ? ` · raiz ${fmt(ctx.rootDepthCm, 0)} cm` : ""}
          {ctx.areaHa != null ? ` · ${fmt(ctx.areaHa, 1)} ha` : ""}
        </p>
        <p className="mt-0.5 text-[10px] text-graphite-400 dark:text-gray-500">
          Balanço {ctx.balanceDate} · {result.engineVersion}
        </p>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${stateCfg.bgClass}`}>
        <span>{stateCfg.icon}</span>{stateCfg.label}
      </span>
    </div>
  );
}

function MemRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-50 py-1 dark:border-white/[0.04]">
      <dt className="text-graphite-500 dark:text-gray-400">{k}</dt>
      <dd className="text-right font-mono text-graphite-900 dark:text-gray-200">{v}</dd>
    </div>
  );
}
