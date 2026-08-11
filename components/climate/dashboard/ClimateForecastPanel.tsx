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
    <>
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[980px] grid-cols-7 gap-3">
      {days.map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        const isToday = day.date === today;
        return (
          <article key={day.id} className={`flex min-h-[300px] flex-col rounded-2xl border p-4 ${isToday ? "border-brand-200 bg-brand-50/40 dark:border-brand-700/40 dark:bg-brand-900/10" : "border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800"}`}>
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

            <div className="mt-4 border-t border-gray-100 pt-3 text-center dark:border-white/[0.06]">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Chuva</p>
              <p className="mt-1 text-[12px] font-bold tabular-nums text-graphite-700 dark:text-gray-200">
                {formatNumber(day.precipitationProbabilityMeteobluePct, 0)}% · {formatNumber(day.precipitationMeteoblueMm)} mm
              </p>
            </div>
            <div className="mt-auto border-t border-gray-100 pt-3 text-center dark:border-white/[0.06]">
              <p className="text-[10px] font-bold uppercase tracking-wide text-graphite-400 dark:text-gray-500">ETo</p>
              <p className="mt-1 text-[16px] font-extrabold tabular-nums text-brand-700 dark:text-brand-400">
                {formatNumber(day.etoOperationalMm)} mm
              </p>
              {day.etoOperationalSource === "open_meteo_pm_fao56" ? (
                <p className="mt-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">PM FAO-56 · fallback</p>
              ) : null}
            </div>
          </article>
        );
      })}
      </div>
    </div>
    <details className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <summary className="cursor-pointer text-[11px] font-bold text-graphite-600 dark:text-gray-300">
        Ver detalhes: umidade, vento e radiação
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead className="text-graphite-400 dark:text-gray-500"><tr><th className="py-2">Dia</th><th>Umidade</th><th>Vento</th><th>Radiação GHI</th></tr></thead>
          <tbody>{days.map((day) => <tr key={`detail-${day.id}`} className="border-t border-gray-100 dark:border-white/[0.05]"><td className="py-2 font-bold">{weekdayLabel(day.date)}</td><td>{formatNumber(day.relativeHumidityPct, 0)}%</td><td>{formatNumber(day.windSpeed2mMs)} m/s</td><td>{formatNumber(day.solarRadiationMeteoblueMjM2Day)} MJ/m²/dia</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <details className="mt-3 rounded-xl border border-gray-100 px-4 py-3 dark:border-white/[0.06]">
      <summary className="cursor-pointer text-[11px] font-bold text-graphite-600 dark:text-gray-300">Auditoria da ETo</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1640px] text-left text-[10px]">
          <thead className="text-graphite-400 dark:text-gray-500"><tr><th className="py-2">Dia</th><th>Meteoblue FAO</th><th>PM FAO-56</th><th>Diferença</th><th>Hargreaves</th><th>ASCE ETos</th><th>Priestley–Taylor</th><th>Thornthwaite–Camargo</th><th>Blaney–Criddle</th><th>Makkink</th><th>Jensen–Haise</th><th>Turc</th><th>Linacre</th><th>Ivanov</th><th>Camargo 1971</th></tr></thead>
          <tbody>{days.map((day) => <tr key={`audit-${day.id}`} className="border-t border-gray-100 dark:border-white/[0.05]"><td className="py-2 font-bold">{weekdayLabel(day.date)}</td><td>{formatNumber(day.etoMeteoblueMm)} mm</td><td>{formatNumber(day.etoMm)} mm</td><td>{formatNumber(day.etoMeteoblueDeltaPct, 0)}%</td><td>{formatNumber(day.etoHargreavesSamaniMm)} mm</td><td>{formatNumber(day.etoAsceEwriMm)} mm</td><td>{formatNumber(day.etoPriestleyTaylorMm)} mm</td><td>{formatNumber(day.etoThornthwaiteCamargoMm)} mm</td><td>{formatNumber(day.etoBlaneyCriddleMm)} mm</td><td>{formatNumber(day.etoMakkinkMm)} mm</td><td>{formatNumber(day.etoJensenHaiseMm)} mm</td><td>{formatNumber(day.etoTurcMm)} mm</td><td>{formatNumber(day.etoLinacreMm)} mm</td><td>{formatNumber(day.etoIvanovMm)} mm</td><td>{formatNumber(day.etoCamargo1971Mm)} mm</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <p className="mt-4 text-[10px] text-graphite-400 dark:text-gray-500">Meteoblue Basic + Agro + Solar · atualização 06:15 e 18:15 · modelo em validação</p>
    </>
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
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 xl:flex-row xl:items-center xl:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">Previsão de 7 dias</h2>
          <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Meteoblue Basic + Agro + Solar · modelo em validação</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-brand-700 px-3 py-2 text-[10px] font-extrabold text-white">ETo: Meteoblue FAO</span>
          <span className="rounded-lg border border-amber-300 px-3 py-2 text-[10px] font-bold text-amber-700 dark:border-amber-700 dark:text-amber-300">Sem estação local</span>
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
      </div>
      <div className="p-5 sm:p-6">
        {mode === "daily" ? <DailyForecast days={daily} today={today} /> : <HourlyForecast hours={hourly} timezone={timezone} />}
      </div>
    </Card>
  );
}
