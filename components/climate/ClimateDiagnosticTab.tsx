"use client";
// ============================================================================
// components/climate/ClimateDiagnosticTab.tsx
// ----------------------------------------------------------------------------
// Aba "Diagnóstico" da tela /clima. Shadow Mode — não alimenta balanço.
// Chama POST /api/climate/diagnostic e apresenta:
//   • Banner Shadow Mode
//   • Seletor (fazenda + período 7/14/30)
//   • KPIs (ETo Cotrim / ETo Open-Meteo / Δ média / Qualidade)
//   • Gráfico SVG (3 séries: Cotrim / Open-Meteo / Sistema atual)
//   • Painel Bias / MAE / RMSE / n
//   • Tabela diária com expansão -> EtoAuditView
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShadowModeBanner } from "./ShadowModeBanner";
import { EtoAuditView } from "./EtoAuditView";
import type {
  DiagnosticResponse,
  DiagnosticDailyRow,
  AllowedDiagnosticDays,
} from "@/modules/weather/diagnostics/climateDiagnosticService";

interface FarmOption {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
}

const PERIODS: AllowedDiagnosticDays[] = [7, 14, 30];

const QUALITY_BADGE: Record<string, string> = {
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  estimated: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  stale: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200",
  suspicious: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200",
  missing: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
  invalid: "bg-red-200 text-red-900 dark:bg-red-600/40 dark:text-red-100",
  unavailable: "bg-gray-200 text-gray-800 dark:bg-white/[0.08] dark:text-gray-300",
};

// ── Gráfico SVG (3 séries) ─────────────────────────────────────────────────
function DiagnosticChart({ rows }: { rows: DiagnosticDailyRow[] }) {
  const W = 900;
  const H = 300;
  const M = { top: 16, right: 24, bottom: 40, left: 40 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const n = rows.length;

  const allEtos = rows.flatMap((r) => [
    r.etoCotrimMm,
    r.etoOpenMeteoMm,
    r.currentSystemEtoMm,
  ]).filter((v): v is number => v !== null);
  const maxY = allEtos.length > 0 ? Math.max(8, Math.ceil(Math.max(...allEtos) + 1)) : 8;

  const x = (i: number) => M.left + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => M.top + ih - (v / maxY) * ih;

  function seriesPath(getter: (r: DiagnosticDailyRow) => number | null): string {
    let d = "";
    let started = false;
    rows.forEach((r, i) => {
      const v = getter(r);
      if (v === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${x(i)},${y(v)} `;
      started = true;
    });
    return d;
  }

  const cotrimPath = seriesPath((r) => r.etoCotrimMm);
  const openMeteoPath = seriesPath((r) => r.etoOpenMeteoMm);
  const currentPath = seriesPath((r) => r.currentSystemEtoMm);

  const gridY = [0, maxY / 2, maxY];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[600px] w-full">
        {/* eixos e grid */}
        {gridY.map((v) => (
          <g key={v}>
            <line
              x1={M.left}
              y1={y(v)}
              x2={W - M.right}
              y2={y(v)}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={M.left - 6}
              y={y(v)}
              dy={4}
              textAnchor="end"
              className="fill-graphite-400 text-[10px]"
            >
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* eixo X (labels a cada N/6) */}
        {rows.map((r, i) => {
          const step = Math.max(1, Math.floor(n / 7));
          if (i % step !== 0 && i !== n - 1) return null;
          const label = r.date.slice(5); // MM-DD
          return (
            <text
              key={r.date}
              x={x(i)}
              y={M.top + ih + 16}
              textAnchor="middle"
              className="fill-graphite-400 text-[10px]"
            >
              {label}
            </text>
          );
        })}

        {/* séries */}
        <path d={currentPath} fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3">
          <title>ETo Atual do Sistema (weather_readings.et0_calculated, origin=open_meteo)</title>
        </path>
        <path d={openMeteoPath} fill="none" stroke="#0ea5e9" strokeWidth={2}>
          <title>ETo Open-Meteo (et0_fao_evapotranspiration da API)</title>
        </path>
        <path d={cotrimPath} fill="none" stroke="#059669" strokeWidth={2.4}>
          <title>ETo Cotrim FAO-56 (motor interno, Etapa 2)</title>
        </path>

        {/* pontos */}
        {rows.map((r, i) => (
          <g key={r.date}>
            {r.etoCotrimMm !== null && (
              <circle cx={x(i)} cy={y(r.etoCotrimMm)} r={2.5} fill="#059669" />
            )}
            {r.etoOpenMeteoMm !== null && (
              <circle cx={x(i)} cy={y(r.etoOpenMeteoMm)} r={2.5} fill="#0ea5e9" />
            )}
            {r.currentSystemEtoMm !== null && (
              <circle cx={x(i)} cy={y(r.currentSystemEtoMm)} r={2.5} fill="#9ca3af" />
            )}
          </g>
        ))}

        {/* legenda */}
        <g transform={`translate(${M.left}, ${M.top - 4})`}>
          <g transform="translate(0, 0)">
            <line x1={0} y1={0} x2={20} y2={0} stroke="#059669" strokeWidth={2.4} />
            <text x={26} y={4} className="fill-graphite-600 text-[11px] dark:fill-gray-300">
              ETo Cotrim FAO-56
            </text>
          </g>
          <g transform="translate(160, 0)">
            <line x1={0} y1={0} x2={20} y2={0} stroke="#0ea5e9" strokeWidth={2} />
            <text x={26} y={4} className="fill-graphite-600 text-[11px] dark:fill-gray-300">
              ETo Open-Meteo
            </text>
          </g>
          <g transform="translate(300, 0)">
            <line x1={0} y1={0} x2={20} y2={0} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={26} y={4} className="fill-graphite-600 text-[11px] dark:fill-gray-300">
              ETo Atual do Sistema
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}

// ── Tabela diária com expansão ─────────────────────────────────────────────
function DailyTable({ rows }: { rows: DiagnosticDailyRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-white/[0.06]">
      <table className="w-full min-w-[1200px] text-[12px]">
        <thead className="bg-gray-50 text-[10.5px] font-bold uppercase tracking-wide text-graphite-500 dark:bg-white/[0.03] dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-2 py-2 text-right">Cotrim</th>
            <th className="px-2 py-2 text-right">Open-Meteo</th>
            <th className="px-2 py-2 text-right">Sistema</th>
            <th className="px-2 py-2 text-right">Δ mm</th>
            <th className="px-2 py-2 text-right">Δ %</th>
            <th className="px-2 py-2 text-right">Tmin</th>
            <th className="px-2 py-2 text-right">Tmax</th>
            <th className="px-2 py-2 text-right">Tmed</th>
            <th className="px-2 py-2 text-right">RHmed</th>
            <th className="px-2 py-2 text-right">Vento 10 m</th>
            <th className="px-2 py-2 text-right">Vento 2 m</th>
            <th className="px-2 py-2 text-right">Rs</th>
            <th className="px-2 py-2 text-right">P</th>
            <th className="px-2 py-2 text-right">Chuva</th>
            <th className="px-2 py-2 text-left">Qualidade</th>
            <th className="px-2 py-2 text-left">Estim.</th>
            <th className="px-2 py-2 text-left">Warn</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          {rows.map((r) => {
            const highlight =
              (r.absoluteDifferenceMm !== null &&
                Math.abs(r.absoluteDifferenceMm) > 0.5) ||
              (r.percentageDifferencePct !== null &&
                Math.abs(r.percentageDifferencePct) > 10);
            const isOpen = expanded === r.date;
            return (
              <>
                <tr
                  key={r.date}
                  className={
                    highlight
                      ? "bg-amber-50/60 dark:bg-amber-900/10"
                      : undefined
                  }
                >
                  <td className="px-3 py-2 font-mono">{r.date}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">
                    {fmt(r.etoCotrimMm)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-sky-700 dark:text-sky-300">
                    {fmt(r.etoOpenMeteoMm)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-graphite-500">
                    {fmt(r.currentSystemEtoMm)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmt(r.absoluteDifferenceMm)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {fmtPct(r.percentageDifferencePct)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.tMinC, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.tMaxC, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.tMeanC, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.rhMeanPct, 0)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.wind10mMs)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.wind2mMs)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.solarRadiationMjM2Day)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.surfacePressureKpa)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.precipitationMm, 1)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        QUALITY_BADGE[r.qualityStatus] ?? QUALITY_BADGE.unavailable
                      }`}
                    >
                      {r.qualityStatus}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[10.5px] text-amber-700 dark:text-amber-300">
                    {r.estimatedFields.length > 0 ? r.estimatedFields.join(", ") : "—"}
                  </td>
                  <td className="px-2 py-2 text-[10.5px] text-graphite-500">
                    {r.warnings.length > 0 ? `${r.warnings.length}` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : r.date)}
                      className="text-[11px] font-semibold text-brand-600 hover:underline"
                    >
                      {isOpen ? "fechar" : "abrir"}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${r.date}-detail`} className="bg-gray-50/40 dark:bg-white/[0.02]">
                    <td colSpan={19}>
                      <EtoAuditView row={r} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
export function ClimateDiagnosticTab() {
  const supabase = useMemo(() => createClient(), []);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [farmId, setFarmId] = useState<string>("");
  const [days, setDays] = useState<AllowedDiagnosticDays>(7);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiagnosticResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingFarms(true);
      const { data: rows, error: err } = await supabase
        .from("farms")
        .select("id, name, latitude, longitude, timezone")
        .order("name");
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoadingFarms(false);
        return;
      }
      const list = (rows ?? []) as FarmOption[];
      setFarms(list);
      if (list.length > 0 && !farmId) setFarmId(list[0].id);
      setLoadingFarms(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const run = useCallback(async () => {
    if (!farmId) return;
    setRunning(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/climate/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId, days }),
      });
      const json = (await res.json()) as
        | DiagnosticResponse
        | { error: string };
      if (!res.ok || "error" in json) {
        setError(
          "error" in json ? json.error : `HTTP ${res.status}`,
        );
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [farmId, days]);

  return (
    <div className="space-y-4">
      <ShadowModeBanner />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Select
              label="Fazenda"
              id="diag-farm"
              value={farmId}
              onChange={(e) => setFarmId(e.target.value)}
              options={farms.map((f) => ({ value: f.id, label: f.name }))}
              disabled={loadingFarms || farms.length === 0}
            />
          </div>
          <div className="min-w-[160px]">
            <Select
              label="Período"
              id="diag-days"
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value) as AllowedDiagnosticDays)}
              options={PERIODS.map((p) => ({ value: String(p), label: `${p} dias` }))}
            />
          </div>
          <Button onClick={run} disabled={!farmId || running}>
            {running ? "Executando…" : "Executar diagnóstico"}
          </Button>
          {data?.location && (
            <div className="ml-auto text-right text-[11.5px] leading-tight text-graphite-500 dark:text-gray-400">
              <div>
                <span className="font-semibold">{data.location.name}</span>
              </div>
              <div className="font-mono">
                {data.location.latitude.toFixed(3)}, {data.location.longitude.toFixed(3)}
                {data.location.elevationM !== null &&
                  ` · alt ${Math.round(data.location.elevationM)} m`}
                {" · "}
                {data.location.timezone}
              </div>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-900/20">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">Erro</p>
          <p className="mt-1 text-[12.5px] text-red-700 dark:text-red-300">{error}</p>
        </Card>
      )}

      {data && data.rows.length === 0 && (
        <EmptyState
          title="Nenhum dia retornado"
          description="A Open-Meteo não retornou dias para essa localização e período. Verifique coordenadas e timezone."
        />
      )}

      {data && data.rows.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-graphite-500">
                ETo Cotrim FAO-56
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {fmt(data.summary.averageEtoCotrimMm)}
                <span className="ml-1 text-xs font-normal text-graphite-400">mm/d média</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-graphite-500">
                ETo Open-Meteo
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-sky-700 dark:text-sky-300">
                {fmt(data.summary.averageEtoOpenMeteoMm)}
                <span className="ml-1 text-xs font-normal text-graphite-400">mm/d média</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-graphite-500">
                Diferença média (Bias)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {data.summary.bias === null ? "—" : `${data.summary.bias >= 0 ? "+" : ""}${fmt(data.summary.bias)}`}
                <span className="ml-1 text-xs font-normal text-graphite-400">mm/d</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-graphite-500">
                Dias com Δ significativa
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-700 dark:text-amber-300">
                {data.summary.daysWithSignificantDiff}
                <span className="ml-1 text-xs font-normal text-graphite-400">
                  de {data.summary.n}
                </span>
              </p>
              <p className="mt-0.5 text-[10.5px] text-graphite-400">
                |Δ|&gt;0,5 mm ou |Δ%|&gt;10
              </p>
            </Card>
          </div>

          {/* Gráfico */}
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-graphite-800 dark:text-gray-100">
                Comparação diária de ETo
              </h3>
              <span className="text-[10.5px] text-graphite-400">
                {data.startDate} → {data.endDate}
              </span>
            </div>
            <DiagnosticChart rows={data.rows} />
          </Card>

          {/* Métricas */}
          <Card>
            <h3 className="mb-2 text-sm font-bold text-graphite-800 dark:text-gray-100">
              Divergência (Cotrim × Open-Meteo)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[10.5px] font-bold uppercase text-graphite-500">Bias</p>
                <p className="font-mono text-lg font-bold">{fmt(data.summary.bias)} mm/d</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase text-graphite-500">MAE</p>
                <p className="font-mono text-lg font-bold">{fmt(data.summary.mae)} mm/d</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase text-graphite-500">RMSE</p>
                <p className="font-mono text-lg font-bold">{fmt(data.summary.rmse)} mm/d</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase text-graphite-500">
                  Pares válidos (n)
                </p>
                <p className="font-mono text-lg font-bold">{data.summary.n}</p>
              </div>
            </div>
          </Card>

          {/* Tabela */}
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-graphite-800 dark:text-gray-100">
                Tabela diária
              </h3>
              <span className="text-[10.5px] text-graphite-400">
                Clique em <em>abrir</em> para ver os intermediários FAO-56 do dia.
              </span>
            </div>
            <DailyTable rows={data.rows} />
          </Card>
        </>
      )}

      {!data && !error && !running && (
        <EmptyState
          title="Pronto para diagnosticar"
          description="Escolha a fazenda e o período e clique em Executar diagnóstico. A consulta é sob demanda; nada é gravado no banco."
        />
      )}
    </div>
  );
}
