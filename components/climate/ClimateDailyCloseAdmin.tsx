"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers";

type DailyCloseStatus = "approved" | "review" | "partial" | "blocked";

interface DailyCloseRow {
  date: string;
  status: DailyCloseStatus;
  operationalApproved: boolean;
  completenessPct: number;
  sourceLabel: string | null;
  provider: string | null;
  dataKind: string | null;
  dataQuality: string | null;
  importedAt: string | null;
  selectedAt: string | null;
  fallbackUsed: boolean;
  selectionReason: string | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureMeanC: number | null;
  relativeHumidityPct: number | null;
  windSpeed2mMs: number | null;
  solarRadiationMjM2Day: number | null;
  precipitationMm: number | null;
  etoCalculatedMm: number | null;
  etoProviderMm: number | null;
}

interface DailyCloseResponse {
  farmId: string;
  timezone: string;
  generatedAt: string;
  today: string;
  lastIngestion: {
    provider?: string | null;
    status?: string | null;
    rows_inserted?: number | null;
    rows_updated?: number | null;
    rows_skipped?: number | null;
    error_message?: string | null;
    duration_ms?: number | null;
    created_at?: string | null;
  } | null;
  rows: DailyCloseRow[];
}

const STATUS: Record<DailyCloseStatus, { label: string; className: string }> = {
  approved: {
    label: "Aprovado",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  review: {
    label: "Revisar",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  },
  partial: {
    label: "Parcial",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300",
  },
  blocked: {
    label: "Bloqueado",
    className: "bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-300",
  },
};

function fmt(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits).replace(".", ",");
}

function fmtDate(date: string | null): string {
  if (!date) return "—";
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: date.length === 10 ? undefined : "2-digit",
    minute: date.length === 10 ? undefined : "2-digit",
  }).format(parsed);
}

export function ClimateDailyCloseAdmin() {
  const { activeFarmId } = useAuth();
  const [data, setData] = useState<DailyCloseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeFarmId) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/climate/daily-close?farmId=${encodeURIComponent(activeFarmId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar fechamento climático");
        return payload as DailyCloseResponse;
      })
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Falha ao carregar fechamento climático");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeFarmId, reloadKey]);

  const latest = data?.rows.find((row) => row.etoCalculatedMm !== null) ?? data?.rows[0] ?? null;
  const approvedCount = useMemo(
    () => data?.rows.filter((row) => row.status === "approved").length ?? 0,
    [data],
  );

  if (!activeFarmId) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-graphite-400 dark:border-white/[0.06] dark:bg-graphite-800">Selecione uma fazenda.</div>;
  }

  if (loading && !data) {
    return <div className="h-80 animate-pulse rounded-2xl bg-white shadow-card dark:bg-graphite-800" />;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/[0.08] dark:text-red-300">
        <p className="font-semibold">{error}</p>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]">
        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Fluxo automático do clima</p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
          APIs → normalização → validação física → ETo diária FAO-56 Penman-Monteith → seleção da fonte → fechamento diário.
          A ETo do provedor é mantida somente para comparação e auditoria.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Último fechamento"
          value={latest ? fmtDate(latest.date) : "—"}
          sub={latest ? STATUS[latest.status].label : "Sem dado"}
        />
        <Kpi
          label="ETo FAO-56"
          value={latest?.etoCalculatedMm == null ? "—" : `${fmt(latest.etoCalculatedMm, 2)} mm/dia`}
          sub={latest?.sourceLabel ?? "Fonte não definida"}
        />
        <Kpi
          label="Integridade"
          value={latest ? `${latest.completenessPct}%` : "—"}
          sub="Tmin, Tmax, UR, vento e radiação"
        />
        <Kpi
          label="Dias aprovados"
          value={String(approvedCount)}
          sub="últimos 10 dias"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-white/[0.06]">
          <div>
            <h2 className="font-bold text-graphite-900 dark:text-white">Fechamento climático diário</h2>
            <p className="mt-1 text-xs text-graphite-400">Dados realmente usados no cálculo interno da ETo.</p>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-graphite-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 dark:border-white/[0.08] dark:text-gray-300"
          >
            {loading ? "Atualizando…" : "Atualizar painel"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1380px] text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-graphite-400 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Fonte</th>
                <th className="px-3 py-3">T mín</th>
                <th className="px-3 py-3">T máx</th>
                <th className="px-3 py-3">UR</th>
                <th className="px-3 py-3">Vento 2 m</th>
                <th className="px-3 py-3">Radiação</th>
                <th className="px-3 py-3">Chuva</th>
                <th className="px-3 py-3">ETo Cotrim</th>
                <th className="px-3 py-3">ETo API</th>
                <th className="px-3 py-3">Integridade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {data?.rows.map((row) => (
                <tr key={row.date} className="text-graphite-700 dark:text-gray-300">
                  <td className="whitespace-nowrap px-4 py-3 font-bold">{fmtDate(row.date)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS[row.status].className}`} title={row.selectionReason ?? undefined}>
                      {STATUS[row.status].label}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-3 py-3">
                    <p className="font-semibold">{row.sourceLabel ?? "—"}</p>
                    <p className="mt-0.5 text-[10px] text-graphite-400">{row.provider ?? row.dataKind ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3">{fmt(row.temperatureMinC)} °C</td>
                  <td className="px-3 py-3">{fmt(row.temperatureMaxC)} °C</td>
                  <td className="px-3 py-3">{fmt(row.relativeHumidityPct, 0)}%</td>
                  <td className="px-3 py-3">{fmt(row.windSpeed2mMs)} m/s</td>
                  <td className="px-3 py-3">{fmt(row.solarRadiationMjM2Day, 2)} MJ/m²/d</td>
                  <td className="px-3 py-3">{fmt(row.precipitationMm, 2)} mm</td>
                  <td className="px-3 py-3 font-bold">{fmt(row.etoCalculatedMm, 2)} mm</td>
                  <td className="px-3 py-3">{fmt(row.etoProviderMm, 2)} mm</td>
                  <td className="px-3 py-3">{row.completenessPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-graphite-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-graphite-900 dark:text-white">Última coleta automática</h3>
            <p className="mt-1 text-xs text-graphite-400">
              {data?.lastIngestion?.created_at ? fmtDate(data.lastIngestion.created_at) : "Ainda não registrada"}
              {data?.lastIngestion?.provider ? ` · ${data.lastIngestion.provider}` : ""}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-graphite-800 dark:text-gray-200">{data?.lastIngestion?.status ?? "—"}</p>
            {data?.lastIngestion?.error_message ? <p className="mt-1 max-w-xl text-red-600 dark:text-red-300">{data.lastIngestion.error_message}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-graphite-800">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-graphite-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-graphite-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-graphite-400">{sub}</p>
    </div>
  );
}
