// ============================================================================
// components/climate/EtoAuditView.tsx
// ----------------------------------------------------------------------------
// Renderiza o detalhamento passo a passo do cálculo FAO-56 para um dia:
// Entradas → Variáveis intermediárias → Resultado. Também mostra origem,
// tipo de dado, campos estimados, ausentes e warnings.
// ============================================================================

import type { DiagnosticDailyRow } from "@/modules/weather/diagnostics/climateDiagnosticService";

function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

interface Kv {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}

function KvBlock({ title, rows }: { title: string; rows: Kv[] }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-graphite-500 dark:text-gray-400">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2">
            <span className="text-graphite-500 dark:text-gray-400" title={r.hint}>
              {r.label}
            </span>
            <span className="font-mono tabular-nums text-graphite-900 dark:text-gray-100">
              {r.value}
              {r.unit ? <span className="ml-1 text-graphite-400">{r.unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EtoAuditView({ row }: { row: DiagnosticDailyRow }) {
  const inputs: Kv[] = [
    { label: "Temperatura mín.", value: fmt(row.tMinC, 1), unit: "°C" },
    { label: "Temperatura máx.", value: fmt(row.tMaxC, 1), unit: "°C" },
    { label: "Temperatura média", value: fmt(row.tMeanC, 1), unit: "°C" },
    { label: "UR mín.", value: fmt(row.rhMinPct, 0), unit: "%" },
    { label: "UR máx.", value: fmt(row.rhMaxPct, 0), unit: "%" },
    { label: "UR média", value: fmt(row.rhMeanPct, 0), unit: "%" },
    { label: "Vento 10 m", value: fmt(row.wind10mMs, 2), unit: "m/s" },
    { label: "Vento 2 m (usado)", value: fmt(row.wind2mMs, 2), unit: "m/s" },
    { label: "Radiação solar", value: fmt(row.solarRadiationMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "Pressão", value: fmt(row.surfacePressureKpa, 2), unit: "kPa" },
    { label: "Chuva", value: fmt(row.precipitationMm, 1), unit: "mm" },
    { label: "Data", value: row.date },
  ];

  const iv = row.intermediateValues;
  const intermediates: Kv[] = [
    { label: "P — pressão atmosférica", value: fmt(iv.atmosphericPressureKpa, 3), unit: "kPa" },
    { label: "γ — psicrométrica", value: fmt(iv.psychrometricConstantKpaC, 4), unit: "kPa/°C" },
    { label: "Δ — inclinação es(T)", value: fmt(iv.saturationSlopeKpaC, 4), unit: "kPa/°C" },
    { label: "es — sat. vapor", value: fmt(iv.saturationVapourPressureKpa, 3), unit: "kPa" },
    { label: "ea — vapor real", value: fmt(iv.actualVapourPressureKpa, 3), unit: "kPa" },
    { label: "VPD", value: fmt(iv.vapourPressureDeficitKpa, 3), unit: "kPa" },
    { label: "Ra — extraterrestre", value: fmt(iv.extraterrestrialRadiationMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "Rso — céu claro", value: fmt(iv.clearSkyRadiationMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "Rns — líquida ondas curtas", value: fmt(iv.netShortwaveRadiationMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "Rnl — líquida ondas longas", value: fmt(iv.netLongwaveRadiationMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "Rn — líquida total", value: fmt(iv.netRadiationMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "G — fluxo calor no solo", value: fmt(iv.soilHeatFluxMjM2Day, 2), unit: "MJ/m²/d" },
    { label: "u2 — vento ajustado", value: fmt(iv.windSpeed2mMs, 2), unit: "m/s" },
  ];

  return (
    <div className="space-y-3 p-3">
      <KvBlock title="Entradas" rows={inputs} />
      <KvBlock title="Intermediários FAO-56" rows={intermediates} />
      <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-500/30 dark:bg-brand-900/20">
        <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
          Resultado
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="text-graphite-500 dark:text-gray-400">ETo Cotrim FAO-56</span>
          <span className="font-mono text-lg font-bold tabular-nums text-brand-700 dark:text-brand-300">
            {fmt(row.etoCotrimMm, 2)}
            <span className="ml-1 text-xs font-normal text-graphite-400">mm/dia</span>
          </span>
          <span className="ml-auto text-[11px] text-graphite-400">
            ETo Open-Meteo <span className="font-mono">{fmt(row.etoOpenMeteoMm, 2)}</span> mm/dia
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white p-3 text-[12.5px] dark:border-white/[0.06] dark:bg-graphite-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-graphite-600 dark:bg-white/[0.08] dark:text-gray-300">
            provider: {row.provider}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-graphite-600 dark:bg-white/[0.08] dark:text-gray-300">
            tipo: {row.dataType}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-graphite-600 dark:bg-white/[0.08] dark:text-gray-300">
            qualidade: {row.qualityStatus}
          </span>
        </div>
        {row.estimatedFields.length > 0 && (
          <p className="mt-2">
            <span className="font-semibold text-amber-700 dark:text-amber-300">Estimados:</span>{" "}
            <span className="font-mono text-graphite-700 dark:text-gray-300">
              {row.estimatedFields.join(", ")}
            </span>
          </p>
        )}
        {row.missingFields.length > 0 && (
          <p className="mt-1">
            <span className="font-semibold text-red-700 dark:text-red-300">Ausentes:</span>{" "}
            <span className="font-mono text-graphite-700 dark:text-gray-300">
              {row.missingFields.join(", ")}
            </span>
          </p>
        )}
        {row.warnings.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11.5px] text-graphite-500 dark:text-gray-400">
            {row.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
