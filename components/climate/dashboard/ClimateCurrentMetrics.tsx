import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { formatNumber } from "./climateFormat";

type MetricTone = "orange" | "blue" | "green";

function MetricIcon({ kind, tone }: { kind: "temperature" | "humidity" | "wind" | "rain"; tone: MetricTone }) {
  const toneClass = tone === "orange" ? "text-orange-600" : tone === "green" ? "text-brand-700" : "text-blue-600";
  const backgroundClass = tone === "orange" ? "bg-orange-50" : tone === "green" ? "bg-brand-50" : "bg-blue-50";

  return (
    <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${backgroundClass} ${toneClass} dark:bg-white/[0.06]`}>
      <svg aria-hidden="true" width="38" height="38" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
        {kind === "temperature" ? <><path d="M20 8a4 4 0 0 1 8 0v20a9 9 0 1 1-8 0V8Z" /><path d="M24 17v16" /></> : null}
        {kind === "humidity" ? <path d="M24 5C15 18 11 24 11 31a13 13 0 0 0 26 0c0-7-4-13-13-26Z" /> : null}
        {kind === "wind" ? <><path d="M6 17h24c8 0 8-10 1-10-4 0-6 2-6 5" /><path d="M6 25h31c8 0 8 11 1 11-4 0-6-2-6-5" /><path d="M6 33h15" /></> : null}
        {kind === "rain" ? <><path d="M10 27h27a7 7 0 0 0 .4-14A11 11 0 0 0 17 16a8 8 0 0 0-7 11Z" /><path d="m16 34-2 6m11-6-2 6m11-6-2 6" /></> : null}
      </svg>
    </span>
  );
}

function MetricCard({ label, value, unit, detail, tone, kind }: { label: string; value: string; unit: string; detail: string; tone: MetricTone; kind: "temperature" | "humidity" | "wind" | "rain" }) {
  const valueClass = tone === "orange" ? "text-orange-600" : tone === "green" ? "text-brand-700 dark:text-brand-400" : "text-blue-600 dark:text-blue-400";
  const accentClass = tone === "orange" ? "before:bg-orange-500" : tone === "green" ? "before:bg-brand-600" : "before:bg-blue-500";

  return (
    <article className={`relative flex min-h-[138px] items-center gap-5 overflow-hidden rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-card before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${accentClass} dark:border-white/[0.06] dark:bg-graphite-800 dark:shadow-dark-card`}>
      <MetricIcon kind={kind} tone={tone} />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-graphite-500 dark:text-gray-400">{label}</p>
        <p className={`mt-1 whitespace-nowrap text-[30px] font-black leading-none tracking-tight tabular-nums ${valueClass}`}>
          {value}<span className="ml-1 text-[17px] font-bold">{unit}</span>
        </p>
        <p className="mt-3 text-[11px] text-graphite-400 dark:text-gray-500">{detail}</p>
      </div>
    </article>
  );
}

export function ClimateCurrentMetrics({ current }: { current: ClimateDashboardResponse["current"] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Temperatura" value={formatNumber(current.temperatureC)} unit="°C" detail="Atual" tone="orange" kind="temperature" />
      <MetricCard label="Umidade" value={formatNumber(current.relativeHumidityPct, 0)} unit="%" detail="Atual" tone="blue" kind="humidity" />
      <MetricCard label="Vento" value={formatNumber(current.windSpeed2mMs)} unit="m/s" detail={current.windDirection ? `Direção ${current.windDirection}` : "Velocidade a 2 m"} tone="green" kind="wind" />
      <MetricCard label="Chuva hoje" value={formatNumber(current.precipitationTodayMm)} unit="mm" detail="Acumulado" tone="blue" kind="rain" />
    </section>
  );
}
