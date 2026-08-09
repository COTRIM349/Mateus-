"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { ClimateCurrentCard } from "./ClimateCurrentCard";
import { ClimateForecastPanel } from "./ClimateForecastPanel";
import { ClimateStatusBar } from "./ClimateStatusBar";
import { EtoSummaryCard } from "./EtoSummaryCard";
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
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
        <ClimateCurrentCard current={data.current} />
        <EtoSummaryCard eto={data.eto} />
      </div>
      <ClimateForecastPanel daily={data.dailyForecast} hourly={data.hourlyForecast} timezone={data.timezone} today={data.localDate} />
      <PublicWeatherReferences references={data.publicReferences} />
      <ClimateStatusBar status={data.status} />
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
