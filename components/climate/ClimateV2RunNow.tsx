"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

export function ClimateV2RunNow() {
  const { activeFarmId } = useAuth();
  const [stationId, setStationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStation() {
      if (!activeFarmId) {
        setStationId("");
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("virtual_weather_stations")
        .select("id")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1);
      if (!cancelled) setStationId((data?.[0]?.id as string | undefined) ?? "");
    }
    void loadStation();
    return () => { cancelled = true; };
  }, [activeFarmId]);

  async function runNow() {
    if (!stationId || busy) return;
    setBusy(true);
    setError("");
    setMessage("Consultando as fontes climáticas e calculando consenso/ETo…");
    try {
      const response = await fetch("/api/climate/v2/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ virtualStationId: stationId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Falha ao executar ciclo climático");
      const result = json.result ?? {};
      const weatherApi = result.providerResults?.weatherapi;
      const weatherApiStatus = weatherApi?.status === "success"
        ? `WeatherAPI ativa (${weatherApi.rowsInserted ?? 0} candidatos)`
        : `WeatherAPI falhou: ${weatherApi?.error ?? "sem resposta"}`;
      setMessage(
        `Ciclo ${result.status ?? "concluído"}: ${weatherApiStatus}. ${result.consensusCreated ?? 0} consensos e ${result.etoAvailable ?? 0} ETo disponíveis. Atualizando painel…`,
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "Falha ao executar ciclo climático");
    } finally {
      setBusy(false);
    }
  }

  if (!activeFarmId || !stationId) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Coleta CLIMA V2</p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Execute manualmente um ciclo para buscar as APIs, gerar candidatos de 30 min, consenso e ETo FAO-56.
          </p>
          {message && <p className="mt-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">{message}</p>}
          {error && <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
        </div>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={busy}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-500 dark:text-emerald-950"
        >
          {busy ? "Executando…" : "Executar ciclo climático agora"}
        </button>
      </div>
    </div>
  );
}
