"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers";
import type { ClimateObservabilitySnapshot } from "@/modules/weather/observability/climateObservability.service";

interface StationOption {
  id: string;
  name: string;
  scope_type: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  open_meteo: "Open-Meteo",
  meteoblue: "Meteoblue",
  weatherapi: "WeatherAPI",
  met_norway: "MET Norway",
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fmt(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits).replace(".", ",");
}

function fmtCoordinate(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(6);
}

function statusClass(status: string | null): string {
  if (status === "success" || status === "high" || status === "complete") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (status === "partial" || status === "medium" || status === "estimated") return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  if (status === "failed" || status === "disputed" || status === "invalid") return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  if (status === "low") return "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300";
  return "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300";
}

function StatusBadge({ value }: { value: string | null }) {
  return <span className={`inline-flex rounded-lg px-2 py-1 text-[11px] font-semibold ${statusClass(value)}`}>{value ?? "sem dado"}</span>;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-graphite-800">
      <p className="text-[10px] font-bold uppercase tracking-widest text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-graphite-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}

export function ClimateObservabilityTab() {
  const { activeFarmId } = useAuth();
  const [stations, setStations] = useState<StationOption[]>([]);
  const [stationId, setStationId] = useState("");
  const [hours, setHours] = useState(24);
  const [snapshot, setSnapshot] = useState<ClimateObservabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStations() {
      if (!activeFarmId) {
        setStations([]);
        setStationId("");
        return;
      }
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("virtual_weather_stations")
        .select("id, name, scope_type")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("scope_type", { ascending: true });
      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
        return;
      }
      const rows = (data ?? []) as StationOption[];
      setStations(rows);
      setStationId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
    }
    void loadStations();
    return () => { cancelled = true; };
  }, [activeFarmId]);

  const loadSnapshot = useCallback(async () => {
    if (!stationId) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/climate/v2/observability?virtualStationId=${encodeURIComponent(stationId)}&hours=${hours}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Falha ao carregar observabilidade");
      setSnapshot(json as ClimateObservabilitySnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar observabilidade");
    } finally {
      setLoading(false);
    }
  }, [stationId, hours]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  const latestIntervals = useMemo(() => snapshot?.intervals.slice(0, 24) ?? [], [snapshot]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">CLIMA V2 · Shadow Mode</p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">Observabilidade das quatro APIs, consenso e ETo FAO-56 de 30 min. Estes dados ainda não alimentam o balanço hídrico.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-graphite-800 dark:text-white">
              {stations.length === 0 && <option value="">Sem Estação Virtual</option>}
              {stations.map((station) => <option key={station.id} value={station.id}>{station.name} · {station.scope_type}</option>)}
            </select>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-graphite-800 dark:text-white">
              <option value={6}>6 horas</option><option value={24}>24 horas</option><option value={72}>72 horas</option><option value={168}>7 dias</option>
            </select>
            <button onClick={() => void loadSnapshot()} disabled={loading || !stationId} className="rounded-xl bg-graphite-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-graphite-900">
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/[0.08] dark:text-red-300">{error}</div>}

      {!snapshot && !loading && !error && <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-graphite-400 dark:border-white/[0.08]">Selecione uma Estação Virtual para visualizar o Shadow Mode.</div>}

      {snapshot && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Último ciclo" value={snapshot.summary.lastRunStatus ?? "—"} sub={fmtDate(snapshot.summary.lastRunAt)} />
            <Kpi label="Disponibilidade ETo" value={snapshot.summary.etoAvailabilityPct === null ? "—" : `${fmt(snapshot.summary.etoAvailabilityPct, 0)}%`} sub={`${snapshot.summary.intervalsEvaluated} intervalos avaliados`} />
            <Kpi label="Alta confiança" value={snapshot.summary.highConfidencePct === null ? "—" : `${fmt(snapshot.summary.highConfidencePct, 0)}%`} sub="consenso CLIMA 6" />
            <Kpi label="Disputas" value={String(snapshot.summary.disputedIntervals)} sub="intervalos com conflito" />
            <Kpi label="Com outlier" value={String(snapshot.summary.outlierIntervals)} sub="intervalos com fonte rejeitada" />
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-base font-bold text-graphite-900 dark:text-white">Saúde das fontes</h3><p className="text-xs text-graphite-400">Últimos dados dentro da janela selecionada</p></div></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {snapshot.providers.map((provider) => (
                <div key={provider.provider} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-graphite-800">
                  <div className="flex items-center justify-between gap-2"><p className="font-bold text-graphite-900 dark:text-white">{PROVIDER_LABELS[provider.provider] ?? provider.provider}</p><StatusBadge value={provider.enabled ? (provider.lastError ? "failed" : provider.lastQualityStatus ?? "enabled") : "disabled"} /></div>
                  <dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-graphite-400">Último payload</dt><dd className="font-medium text-graphite-700 dark:text-gray-300">{fmtDate(provider.lastFetchedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Temperatura</dt><dd className="font-medium">{fmt(provider.temperatureC)} °C</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Umidade</dt><dd className="font-medium">{fmt(provider.relativeHumidityPct, 0)}%</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Chuva</dt><dd className="font-medium">{fmt(provider.precipitationMm, 2)} mm</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Vento</dt><dd className="font-medium">{fmt(provider.windSpeed2mMs)} m/s</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Radiação</dt><dd className="font-medium">{fmt(provider.solarRadiationWm2, 0)} W/m²</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Pressão</dt><dd className="font-medium">{fmt(provider.surfacePressureKpa)} kPa</dd></div><div className="flex justify-between gap-3"><dt className="text-graphite-400">Candidatos</dt><dd className="font-medium text-graphite-700 dark:text-gray-300">{provider.rowsInWindow}</dd></div>{provider.provider === "weatherapi" && provider.coordinateDistanceKm !== null ? <div className="flex justify-between gap-3"><dt className="text-graphite-400">Coordenada</dt><dd className="font-medium text-emerald-700 dark:text-emerald-300" title={`${fmtCoordinate(provider.requestLatitude)}, ${fmtCoordinate(provider.requestLongitude)} → ${fmtCoordinate(provider.responseLatitude)}, ${fmtCoordinate(provider.responseLongitude)}`}>validada · {provider.coordinateDistanceKm < 0.05 ? "< 50 m" : `${fmt(provider.coordinateDistanceKm, 2)} km`}</dd></div> : null}</dl>
                  {provider.lastError && <p className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-500/[0.08] dark:text-red-300">{provider.lastError}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800">
            <div className="border-b border-gray-100 p-4 dark:border-white/[0.06]"><h3 className="font-bold text-graphite-900 dark:text-white">Últimos intervalos de 30 minutos</h3><p className="mt-1 text-xs text-graphite-400">Consenso, divergência e ETo Shadow</p></div>
            <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-graphite-400 dark:bg-white/[0.03]"><tr><th className="px-4 py-3">Intervalo</th><th className="px-3 py-3">Confiança</th><th className="px-3 py-3">Fontes</th><th className="px-3 py-3">T °C</th><th className="px-3 py-3">UR %</th><th className="px-3 py-3">Vento</th><th className="px-3 py-3">Radiação</th><th className="px-3 py-3">Chuva</th><th className="px-3 py-3">ETo 30m</th><th className="px-3 py-3">Alertas</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {latestIntervals.map((row) => <tr key={`${row.intervalStart}-${row.intervalEnd}`} className="text-graphite-700 dark:text-gray-300"><td className="whitespace-nowrap px-4 py-3 font-medium">{fmtDate(row.intervalStart)} → {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(row.intervalEnd))}</td><td className="px-3 py-3"><StatusBadge value={row.confidence} /></td><td className="px-3 py-3">{row.sourceCount}</td><td className="px-3 py-3">{fmt(row.temperatureC)}</td><td className="px-3 py-3">{fmt(row.relativeHumidityPct, 0)}</td><td className="px-3 py-3">{fmt(row.windSpeed2mMs)} m/s</td><td className="px-3 py-3">{fmt(row.solarRadiationWm2, 0)} W/m²</td><td className="px-3 py-3">{fmt(row.precipitationMm, 2)}</td><td className="px-3 py-3 font-semibold">{fmt(row.etoMm30Min, 3)} mm</td><td className="px-3 py-3">{row.disputedFields.length > 0 ? `${row.disputedFields.length} disputa(s)` : row.outlierProviders.length > 0 ? `${row.outlierProviders.length} outlier(s)` : "—"}</td></tr>)}
              {latestIntervals.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-graphite-400">Ainda não há intervalos CLIMA 6/7 para esta janela.</td></tr>}
            </tbody></table></div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800">
            <div className="border-b border-gray-100 p-4 dark:border-white/[0.06]"><h3 className="font-bold text-graphite-900 dark:text-white">Execuções do orquestrador</h3></div>
            <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">{snapshot.recentRuns.slice(0, 10).map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs"><div className="flex items-center gap-3"><StatusBadge value={run.status} /><div><p className="font-semibold text-graphite-800 dark:text-gray-200">{fmtDate(run.startedAt)} · {run.triggerType}</p><p className="mt-1 text-graphite-400">{run.consensusCreated} consensos · {run.etoAvailable}/{run.etoCreated} ETo disponíveis</p></div></div><div className="text-right text-graphite-400">{run.durationMs === null ? "—" : `${(run.durationMs / 1000).toFixed(1)} s`}{run.errorMessage && <p className="mt-1 max-w-md text-red-600 dark:text-red-300">{run.errorMessage}</p>}</div></div>)}{snapshot.recentRuns.length === 0 && <div className="p-8 text-center text-sm text-graphite-400">Nenhum ciclo CLIMA 8 registrado.</div>}</div>
          </div>
        </>
      )}
    </div>
  );
}
