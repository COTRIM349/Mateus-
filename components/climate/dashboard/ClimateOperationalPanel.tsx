"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { Card } from "@/components/ui/Card";
import type { OperationalSelectionSummary } from "@/modules/weather/services/climate-approval";
import { formatNumber, weekdayLabel } from "./climateFormat";

function statusBadge(day: OperationalSelectionSummary["days"][number]) {
  if (day.operationalApproved) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        Aprovado
      </span>
    );
  }
  if (day.canApprove) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        Pendente
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-graphite-500 dark:bg-white/[0.06] dark:text-gray-400">
      Sem dado
    </span>
  );
}

export function ClimateOperationalPanel() {
  const { activeFarmId } = useAuth();
  const [summary, setSummary] = useState<OperationalSelectionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/climate/operational-selections?farmId=${encodeURIComponent(activeFarmId)}&pastDays=14`,
        { cache: "no-store" },
      );
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar aprovações");
      }
      setSummary(payload as OperationalSelectionSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar aprovações");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeFarmId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const syncClimate = async () => {
    if (!activeFarmId) return;
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/climate/sync-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmId: activeFarmId,
          pastDays: 14,
          forecastDays: 7,
          ensureVirtual: true,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha na sincronização");
      }
      setMessage("Clima sincronizado. Revise os dias pendentes e aprove para liberar o balanço.");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na sincronização");
    } finally {
      setSyncing(false);
    }
  };

  const approvePending = async () => {
    if (!activeFarmId || !summary) return;
    const dates = summary.days.filter((d) => d.canApprove && !d.operationalApproved).map((d) => d.date);
    if (dates.length === 0) {
      setMessage("Nenhum dia pendente com ETo válida.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/climate/operational-selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId: activeFarmId, action: "approve", dates }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao aprovar");
      }
      const updated = (payload.updated as string[] | undefined)?.length ?? 0;
      const skipped = (payload.skipped as Array<{ date: string }> | undefined)?.length ?? 0;
      setMessage(`${updated} dia(s) aprovado(s).${skipped > 0 ? ` ${skipped} ignorado(s).` : ""}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar");
    } finally {
      setActing(false);
    }
  };

  const approveToday = async () => {
    if (!activeFarmId || !summary) return;
    const today = summary.days[summary.days.length - 1];
    if (!today?.canApprove) {
      setMessage("Hoje não tem leitura com ETo válida — sincronize primeiro.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/climate/operational-selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId: activeFarmId, action: "approve", dates: [today.date] }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao aprovar");
      }
      setMessage("ETo de hoje aprovada para uso operacional.");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar");
    } finally {
      setActing(false);
    }
  };

  if (!activeFarmId) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">
              Aprovação operacional da ETo
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-graphite-400 dark:text-gray-500">
              O balanço hídrico e a programação só usam dias com leitura aprovada explicitamente.
              Estimativas de modelo ficam em validação até você liberar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={syncClimate}
              disabled={syncing || acting}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-graphite-700 shadow-sm hover:border-brand-200 hover:text-brand-700 disabled:opacity-50 dark:border-white/[0.08] dark:bg-graphite-800 dark:text-gray-300"
            >
              {syncing ? "Sincronizando…" : "Sincronizar clima"}
            </button>
            <button
              type="button"
              onClick={approveToday}
              disabled={acting || syncing}
              className="rounded-xl bg-brand-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Aprovar hoje
            </button>
            <button
              type="button"
              onClick={approvePending}
              disabled={acting || syncing}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Aprovar pendentes
            </button>
          </div>
        </div>
        {summary && (
          <p className="mt-3 text-[11px] font-semibold text-graphite-500 dark:text-gray-400">
            {summary.approvedDays}/{summary.totalDays} dias aprovados · {summary.pendingApproval} pendente(s) ·{" "}
            {summary.missingSelection} sem seleção
          </p>
        )}
      </div>

      {error && (
        <p className="px-6 py-3 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
      )}
      {message && (
        <p className="px-6 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">{message}</p>
      )}

      {loading && !summary ? (
        <div className="h-48 animate-pulse bg-gray-50 dark:bg-white/[0.02]" />
      ) : summary ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-graphite-400 dark:bg-white/[0.03] dark:text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Estação</th>
                <th className="px-4 py-2.5">ETo</th>
                <th className="px-4 py-2.5">Chuva</th>
                <th className="px-4 py-2.5">Qualidade</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {summary.days.map((day) => (
                <tr key={day.date} className="text-graphite-700 dark:text-gray-300">
                  <td className="px-4 py-2.5 font-semibold">
                    {weekdayLabel(day.date)} · {day.date.slice(5)}
                  </td>
                  <td className="px-4 py-2.5">{day.stationName ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {day.etoMm != null ? `${formatNumber(day.etoMm)} mm` : "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {day.precipitationMm != null ? `${formatNumber(day.precipitationMm)} mm` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {day.dataQuality ?? "—"}
                    {day.fallbackUsed ? " · fallback" : ""}
                  </td>
                  <td className="px-4 py-2.5">{statusBadge(day)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-8 text-center text-sm text-graphite-400">Sem dados de aprovação.</p>
      )}
    </Card>
  );
}
