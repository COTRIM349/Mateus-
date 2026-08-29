"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers";
import { Card } from "@/components/ui/Card";
import type { OperationalSelectionSummary } from "@/modules/weather/services/climate-approval";
import { formatNumber, weekdayLabel } from "./climateFormat";

function statusBadge(day: OperationalSelectionSummary["days"][number]) {
  if (day.operationalApproved) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        Operacional
      </span>
    );
  }
  if (day.canApprove) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        Sincronizando…
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const autoSyncAttemptedRef = useRef<string | null>(null);

  const fetchSummary = useCallback(async (): Promise<OperationalSelectionSummary | null> => {
    if (!activeFarmId) return null;
    const res = await fetch(
      `/api/climate/operational-selections?farmId=${encodeURIComponent(activeFarmId)}&pastDays=14`,
      { cache: "no-store" },
    );
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error ?? "Falha ao carregar ETo operacional");
    }
    return payload as OperationalSelectionSummary;
  }, [activeFarmId]);

  const syncClimate = useCallback(async (): Promise<boolean> => {
    if (!activeFarmId) return false;
    setSyncing(true);
    setError(null);
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na sincronização");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [activeFarmId]);

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let data = await fetchSummary();
      const needsSync =
        data != null &&
        (data.missingSelection > 0 || data.pendingApproval > 0);

      if (needsSync && autoSyncAttemptedRef.current !== activeFarmId) {
        autoSyncAttemptedRef.current = activeFarmId;
        const ok = await syncClimate();
        if (ok) {
          data = await fetchSummary();
          setMessage("Clima sincronizado automaticamente para uso operacional.");
        }
      }

      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ETo operacional");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeFarmId, fetchSummary, syncClimate]);

  useEffect(() => {
    autoSyncAttemptedRef.current = null;
    load();
  }, [load]);

  const manualSync = async () => {
    setMessage(null);
    const ok = await syncClimate();
    if (!ok) return;
    try {
      const data = await fetchSummary();
      setSummary(data);
      setMessage("Clima atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao recarregar");
    }
  };

  if (!activeFarmId) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">
              ETo operacional (automática)
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-graphite-400 dark:text-gray-500">
              Após cada sincronização, dias com leitura válida entram automaticamente no balanço
              hídrico e na programação — sem aprovação manual.
            </p>
          </div>
          <button
            type="button"
            onClick={manualSync}
            disabled={syncing || loading}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-graphite-700 shadow-sm hover:border-brand-200 hover:text-brand-700 disabled:opacity-50 dark:border-white/[0.08] dark:bg-graphite-800 dark:text-gray-300"
          >
            {syncing ? "Sincronizando…" : "Atualizar agora"}
          </button>
        </div>
        {summary && (
          <p className="mt-3 text-[11px] font-semibold text-graphite-500 dark:text-gray-400">
            {summary.approvedDays}/{summary.totalDays} dias operacionais · {summary.missingSelection} aguardando
            sincronização
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
        <p className="px-6 py-8 text-center text-sm text-graphite-400">Sem dados operacionais.</p>
      )}
    </Card>
  );
}
