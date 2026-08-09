"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { ClimateWeatherIcon } from "./ClimateWeatherIcon";
import { formatNumber, weekdayLabel } from "./climateFormat";

function DailyForecast({
  days,
  today,
}: {
  days: ClimateDashboardResponse["dailyForecast"];
  today: string;
}) {
  if (days.length === 0) {
    return <EmptyForecast message="A previsão diária ainda não está disponível para esta fazenda." />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        const isToday = day.date === today;
        return (
          <article key={day.id} className={`rounded-2xl border p-4 ${isToday ? "border-brand-200 bg-brand-50/40 dark:border-brand-700/40 dark:bg-brand-900/10" : "border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800"}`}>
            <div className="text-center">
              <p className={`text-[13px] font-extrabold uppercase ${isToday ? "text-brand-700 dark:text-brand-400" : "text-graphite-800 dark:text-white"}`}>
                {isToday ? "Hoje" : weekdayLabel(day.date)}
              </p>
              <p className="mt-0.5 text-[10px] text-graphite-400 dark:text-gray-500">
                {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </p>
            </div>

            <div className="my-3 flex justify-center">
              <ClimateWeatherIcon condition={day.condition} size={48} />
            </div>

            <p className="text-center text-[15px] font-extrabold tabular-nums">
              <span className="text-red-500">{formatNumber(day.tempMaxC)}°</span>
              <span className="mx-1 text-graphite-300">/</span>
              <span className="text-blue-500">{formatNumber(day.tempMinC)}°</span>
            </p>

            <dl className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-[11px] dark:border-white/[0.06]">
              <ForecastMetric label="Umidade" value={`${formatNumber(day.relativeHumidityPct, 0)}%`} />
              <ForecastMetric label="Chuva" value={`${formatNumber(day.precipitationMm)} mm`} tone="blue" />
              <ForecastMetric label="Probabilidade" value={`${formatNumber(day.precipitationProbabilityPct, 0)}%`} />
              <ForecastMetric label="ETo PM" value={`${formatNumber(day.etoMm)} mm`} tone="green" />
              <ForecastMetric label="ETo HS" value={`${formatNumber(day.etoHargreavesSamaniMm)} mm`} tone="amber" />
              <ForecastMetric label="Vento" value={`${formatNumber(day.windSpeed2mMs)} m/s`} />
            </dl>
            <details className="mt-3 border-t border-gray-100 pt-2 dark:border-white/[0.06]">
              <summary className="cursor-pointer text-[10px] font-bold text-graphite-500 dark:text-gray-400">
                Outros métodos de ETo
              </summary>
              <dl className="mt-2 space-y-1.5 text-[10px]">
                <ForecastMetric label="ASCE ETos" value={`${formatNumber(day.etoAsceEwriMm)} mm`} />
                <ForecastMetric label="Priestley-Taylor" value={`${formatNumber(day.etoPriestleyTaylorMm)} mm`} />
                <ForecastMetric label="Thornthwaite-Camargo" value={`${formatNumber(day.etoThornthwaiteCamargoMm)} mm`} />
              </dl>
            </details>
          </article>
        );
      })}
    </div>
  );
}

function ForecastMetric({ label, value, tone }: { label: string; value: string; tone?: "blue" | "green" | "amber" }) {
  const valueColor = tone === "blue"
    ? "text-blue-600 dark:text-blue-400"
    : tone === "green"
      ? "text-brand-700 dark:text-brand-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
      : "text-graphite-800 dark:text-gray-200";
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-graphite-400 dark:text-gray-500">{label}</dt>
      <dd className={`font-bold tabular-nums ${valueColor}`}>{value}</dd>
    </div>
  );
}

function HourlyForecast({
  hours,
  timezone,
}: {
  hours: ClimateDashboardResponse["hourlyForecast"];
  timezone: string;
}) {
  if (hours.length === 0) {
    return <EmptyForecast message="A previsão horária será exibida após o próximo ciclo climático." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[12px]">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wide text-graphite-400 dark:text-gray-500">
            <th className="border-b border-gray-100 px-3 py-3 dark:border-white/[0.06]">Horário</th>
            <th className="border-b border-gray-100 px-3 py-3 dark:border-white/[0.06]">Condição</th>
            <th className="border-b border-gray-100 px-3 py-3 dark:border-white/[0.06]">Temperatura</th>
            <th className="border-b border-gray-100 px-3 py-3 dark:border-white/[0.06]">Umidade</th>
            <th className="border-b border-gray-100 px-3 py-3 dark:border-white/[0.06]">Chuva</th>
            <th className="border-b border-gray-100 px-3 py-3 dark:border-white/[0.06]">Vento</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour.intervalStart} className="text-graphite-700 dark:text-gray-200">
              <td className="border-b border-gray-50 px-3 py-3 font-bold tabular-nums dark:border-white/[0.04]">
                {new Date(hour.intervalStart).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="border-b border-gray-50 px-3 py-3 dark:border-white/[0.04]">
                <ClimateWeatherIcon condition={hour.condition} size={30} />
                <span className="sr-only">{hour.condition}</span>
              </td>
              <td className="border-b border-gray-50 px-3 py-3 font-semibold tabular-nums dark:border-white/[0.04]">{formatNumber(hour.temperatureC)}°C</td>
              <td className="border-b border-gray-50 px-3 py-3 tabular-nums dark:border-white/[0.04]">{formatNumber(hour.relativeHumidityPct, 0)}%</td>
              <td className="border-b border-gray-50 px-3 py-3 tabular-nums text-blue-600 dark:border-white/[0.04] dark:text-blue-400">{formatNumber(hour.precipitationMm)} mm</td>
              <td className="border-b border-gray-50 px-3 py-3 tabular-nums dark:border-white/[0.04]">{formatNumber(hour.windSpeed2mMs)} m/s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyForecast({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-[12px] text-graphite-400 dark:border-white/[0.08] dark:text-gray-500">
      {message}
    </div>
  );
}

export function ClimateForecastPanel({
  daily,
  hourly,
  timezone,
  today,
}: {
  daily: ClimateDashboardResponse["dailyForecast"];
  hourly: ClimateDashboardResponse["hourlyForecast"];
  timezone: string;
  today: string;
}) {
  const [mode, setMode] = useState<"daily" | "hourly">("daily");

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">Previsão</h2>
          <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Estimativas Open-Meteo · não validadas por estação física local</p>
        </div>
        <div className="flex w-fit rounded-xl bg-gray-100 p-1 dark:bg-white/[0.05]" aria-label="Intervalo da previsão">
          {(["daily", "hourly"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={`rounded-lg px-4 py-2 text-[11px] font-bold transition-colors ${mode === item ? "bg-white text-brand-700 shadow-sm dark:bg-graphite-700 dark:text-brand-400" : "text-graphite-400 hover:text-graphite-700 dark:text-gray-500 dark:hover:text-gray-300"}`}
            >
              {item === "daily" ? "Diária" : "Horária"}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        {mode === "daily" ? <DailyForecast days={daily} today={today} /> : <HourlyForecast hours={hourly} timezone={timezone} />}
      </div>
    </Card>
  );
}
