import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { ClimateWeatherIcon } from "./ClimateWeatherIcon";
import { formatNumber, weekdayLabel } from "./climateFormat";

type DailyForecastRow = ClimateDashboardResponse["dailyForecast"][number];

function addIsoDays(dateIso: string, amount: number): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function emptyForecastDay(date: string): DailyForecastRow {
  return {
    id: `ui-missing-${date}`, date, issuedAt: "", condition: "unknown",
    tempMaxC: null, tempMinC: null, relativeHumidityPct: null,
    precipitationMm: null, precipitationProbabilityPct: null,
    precipitationMeteoblueMm: null, precipitationProbabilityMeteobluePct: null,
    solarRadiationMeteoblueMjM2Day: null, etoMm: null, etoMeteoblueMm: null,
    etoOperationalMm: null, etoOperationalSource: null, etoMeteoblueIssuedAt: null,
    etoMeteoblueDeltaMm: null, etoMeteoblueDeltaPct: null,
    etoHargreavesSamaniMm: null, etoAsceEwriMm: null, etoPriestleyTaylorMm: null,
    etoThornthwaiteCamargoMm: null, etoBlaneyCriddleMm: null, etoMakkinkMm: null,
    etoJensenHaiseMm: null, etoTurcMm: null, etoLinacreMm: null,
    etoIvanovMm: null, etoCamargo1971Mm: null, windSpeed2mMs: null,
  };
}

export function ensureSevenForecastCards(days: ClimateDashboardResponse["dailyForecast"], today: string) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addIsoDays(today, index);
    return byDate.get(date) ?? emptyForecastDay(date);
  });
}

function DailyForecast({
  days,
  today,
}: {
  days: ClimateDashboardResponse["dailyForecast"];
  today: string;
}) {
  const sevenDays = ensureSevenForecastCards(days, today);

  return (
    <>
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[1040px] grid-cols-7 gap-3 xl:min-w-0">
      {sevenDays.map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        const isToday = day.date === today;
        return (
          <article key={day.id} className={`relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border px-4 pb-4 pt-5 transition-shadow hover:shadow-lg ${isToday ? "border-brand-300 bg-gradient-to-b from-brand-50/80 to-white shadow-sm ring-1 ring-brand-100 dark:border-brand-700/50 dark:from-brand-900/20 dark:to-graphite-800 dark:ring-brand-800/30" : "border-gray-100 bg-white shadow-sm dark:border-white/[0.06] dark:bg-graphite-800"}`}>
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${isToday ? "bg-brand-600" : "bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-white/10"}`} />
            <div className="text-center">
              <p className={`text-[15px] font-black uppercase tracking-wide ${isToday ? "text-brand-700 dark:text-brand-400" : "text-graphite-900 dark:text-white"}`}>
                {weekdayLabel(day.date)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-graphite-500 dark:text-gray-400">
                {isToday ? "Hoje" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </p>
            </div>

            <div className="mx-auto my-5 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-50 ring-1 ring-amber-100 dark:from-amber-500/10 dark:to-orange-500/5 dark:ring-amber-500/10">
              <ClimateWeatherIcon condition={day.condition} size={54} />
            </div>

            <p className="text-center text-[17px] font-black tabular-nums">
              <span className="text-orange-600">{formatNumber(day.tempMaxC)}°C</span>
              <span className="mx-2 text-graphite-300 dark:text-gray-600">/</span>
              <span className="text-brand-700 dark:text-brand-400">{formatNumber(day.tempMinC)}°C</span>
            </p>

            <div className="mt-5 rounded-xl bg-blue-50/70 px-3 py-3 text-center dark:bg-blue-500/[0.06]">
              <p className="text-[11px] font-extrabold text-blue-700 dark:text-blue-400">Chuva</p>
              <p className="mt-1.5 text-[13px] font-bold tabular-nums text-graphite-700 dark:text-gray-200">
                {formatNumber(day.precipitationProbabilityPct, 0)}% · {formatNumber(day.precipitationMm)} mm
              </p>
            </div>
            <p className="mt-3 text-center text-[11px] font-medium text-graphite-500 dark:text-gray-400">
              Vento {formatNumber(day.windSpeed2mMs)} m/s
            </p>
            <div className="mt-auto rounded-xl border border-brand-100 bg-brand-50/70 px-3 py-3 text-center dark:border-brand-700/20 dark:bg-brand-500/[0.07]">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-400">ETo operacional</p>
              <p className="mt-1 text-[18px] font-black tabular-nums text-brand-800 dark:text-brand-300">
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
    <details className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <summary className="cursor-pointer text-[11px] font-bold text-graphite-600 dark:text-gray-300">
        Ver detalhes: umidade, vento e radiação
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead className="text-graphite-400 dark:text-gray-500"><tr><th className="py-2">Dia</th><th>Umidade</th><th>Vento</th><th>Radiação GHI</th></tr></thead>
          <tbody>{sevenDays.map((day) => <tr key={`detail-${day.id}`} className="border-t border-gray-100 dark:border-white/[0.05]"><td className="py-2 font-bold">{weekdayLabel(day.date)}</td><td>{formatNumber(day.relativeHumidityPct, 0)}%</td><td>{formatNumber(day.windSpeed2mMs)} m/s</td><td>{formatNumber(day.solarRadiationMeteoblueMjM2Day)} MJ/m²/dia</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <details id="eto-audit" className="mt-3 rounded-xl border border-gray-100 px-4 py-3 dark:border-white/[0.06]">
      <summary className="cursor-pointer text-[11px] font-bold text-graphite-600 dark:text-gray-300">Auditoria da ETo</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1640px] text-left text-[10px]">
          <thead className="text-graphite-400 dark:text-gray-500"><tr><th className="py-2">Dia</th><th>Meteoblue FAO</th><th>PM FAO-56</th><th>Diferença</th><th>Hargreaves</th><th>ASCE ETos</th><th>Priestley–Taylor</th><th>Thornthwaite–Camargo</th><th>Blaney–Criddle</th><th>Makkink</th><th>Jensen–Haise</th><th>Turc</th><th>Linacre</th><th>Ivanov</th><th>Camargo 1971</th></tr></thead>
          <tbody>{sevenDays.map((day) => <tr key={`audit-${day.id}`} className="border-t border-gray-100 dark:border-white/[0.05]"><td className="py-2 font-bold">{weekdayLabel(day.date)}</td><td>{formatNumber(day.etoMeteoblueMm)} mm</td><td>{formatNumber(day.etoMm)} mm</td><td>{formatNumber(day.etoMeteoblueDeltaPct, 0)}%</td><td>{formatNumber(day.etoHargreavesSamaniMm)} mm</td><td>{formatNumber(day.etoAsceEwriMm)} mm</td><td>{formatNumber(day.etoPriestleyTaylorMm)} mm</td><td>{formatNumber(day.etoThornthwaiteCamargoMm)} mm</td><td>{formatNumber(day.etoBlaneyCriddleMm)} mm</td><td>{formatNumber(day.etoMakkinkMm)} mm</td><td>{formatNumber(day.etoJensenHaiseMm)} mm</td><td>{formatNumber(day.etoTurcMm)} mm</td><td>{formatNumber(day.etoLinacreMm)} mm</td><td>{formatNumber(day.etoIvanovMm)} mm</td><td>{formatNumber(day.etoCamargo1971Mm)} mm</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <p className="mt-4 text-center text-[10px] text-graphite-400 dark:text-gray-500">Meteoblue Basic + Agro + Solar · atualização 06:15 e 18:15 · modelo em validação</p>
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
  return (
    <Card className="min-h-[600px] overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 xl:flex-row xl:items-center xl:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-[18px] font-black text-graphite-900 dark:text-white">Previsão de 7 dias</h2>
          <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Meteoblue Basic + Agro + Solar · modelo em validação</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-brand-700 px-4 py-2.5 text-[11px] font-extrabold text-white shadow-sm">ETo: Meteoblue FAO</span>
          <span className="rounded-lg border border-amber-300 px-3 py-2 text-[10px] font-bold text-amber-700 dark:border-amber-700 dark:text-amber-300">Sem estação local</span>
          <a href="#eto-audit" className="rounded-lg px-3 py-2 text-[11px] font-extrabold text-graphite-700 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-300 dark:hover:bg-white/[0.05]">Auditoria →</a>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <DailyForecast days={daily} today={today} />
        <details className="mt-3 rounded-xl border border-gray-100 px-4 py-3 dark:border-white/[0.06]">
          <summary className="cursor-pointer text-[11px] font-bold text-graphite-600 dark:text-gray-300">Previsão horária</summary>
          <div className="mt-3"><HourlyForecast hours={hourly} timezone={timezone} /></div>
        </details>
      </div>
    </Card>
  );
}
