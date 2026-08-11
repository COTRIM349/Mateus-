"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { ClimateCurrentMetrics } from "./ClimateCurrentMetrics";
import { ClimateForecastPanel } from "./ClimateForecastPanel";
import { ClimateProviderComparison } from "./ClimateProviderComparison";
import { ClimateStatusBar } from "./ClimateStatusBar";
import { ClimateSourceHealth } from "./ClimateSourceHealth";
import { PublicWeatherReferences } from "./PublicWeatherReferences";

export function ClimateDashboard() {
  const { activeFarmId } = useAuth();
  const [data, setData] = useState<ClimateDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeFarmId) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError(null);

    fetch(`/api/climate/dashboard?farmId=${encodeURIComponent(activeFarmId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json() as ClimateDashboardResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in payload && payload.error ? payload.error : "Falha ao carregar os dados climáticos");
        }
        return payload as ClimateDashboardResponse;
      })
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Falha ao carregar os dados climáticos");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeFarmId, reloadKey]);

  if (!activeFarmId) {
    return <MessageCard message="Selecione uma fazenda para visualizar o clima." />;
  }
  if (loading && !data) return <ClimateDashboardSkeleton />;
  if (error && !data) {
    return (
      <Card className="py-12 text-center">
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">
          Tentar novamente
        </button>
      </Card>
    );
  }
  if (!data) return <MessageCard message="Nenhum dado climático disponível." />;

  return (
    <div className="space-y-4">
      <ClimateCurrentMetrics current={data.current} />
      <ClimateForecastPanel daily={data.dailyForecast} hourly={data.hourlyForecast} timezone={data.timezone} today={data.localDate} />
      <details className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-card dark:border-white/[0.06] dark:bg-graphite-800 dark:shadow-dark-card">
        <summary className="cursor-pointer text-xs font-bold text-graphite-700 dark:text-gray-300">Qualidade, fontes e referências climáticas</summary>
        <div className="mt-5 space-y-5">
          <ClimateProviderComparison sources={data.providerComparison} timezone={data.timezone} />
          <ClimateSourceHealth sources={data.sourceHealth} />
          <PublicWeatherReferences references={data.publicReferences} nasaPower={data.nasaPowerReference} />
          <ClimateStatusBar status={data.status} />
        </div>
      </details>
      <p className="text-[10px] leading-relaxed text-graphite-400 dark:text-gray-500">{data.attribution.join(" · ")}</p>
    </div>
  );
}

function MessageCard({ message }: { message: string }) {
  return (
    <Card>
      <p className="py-10 text-center text-sm text-graphite-400 dark:text-gray-500">{message}</p>
    </Card>
  );
}

function ClimateDashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Carregando dados climáticos">
      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1].map((item) => <div key={item} className="h-[420px] animate-pulse rounded-2xl bg-white shadow-card dark:bg-graphite-800" />)}
      </div>
      <div className="h-[380px] animate-pulse rounded-2xl bg-white shadow-card dark:bg-graphite-800" />
    </div>
  );
}
