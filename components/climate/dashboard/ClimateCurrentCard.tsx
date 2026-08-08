import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { ClimateWeatherIcon } from "./ClimateWeatherIcon";
import { conditionLabel, formatNumber } from "./climateFormat";

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.04]">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-[16px] font-extrabold tabular-nums text-graphite-900 dark:text-white">
        {value}{unit ? <span className="ml-1 text-[11px] font-medium text-graphite-400">{unit}</span> : null}
      </p>
    </div>
  );
}

export function ClimateCurrentCard({
  current,
}: {
  current: ClimateDashboardResponse["current"];
}) {
  return (
    <Card className="h-full overflow-hidden p-0">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
        <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">Condições atuais</h2>
        <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Leitura meteorológica mais recente da fazenda</p>
      </div>

      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-900/20">
            <ClimateWeatherIcon condition={current.condition} size={62} />
          </div>
          <div className="min-w-0">
            <p className="text-[38px] font-black leading-none tracking-tight tabular-nums text-graphite-900 dark:text-white">
              {formatNumber(current.temperatureC)}<span className="text-[20px]">°C</span>
            </p>
            <p className="mt-2 text-[13px] font-semibold text-graphite-600 dark:text-gray-300">{conditionLabel(current.condition)}</p>
            <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">
              Mín. {formatNumber(current.tempMinC)}° · Máx. {formatNumber(current.tempMaxC)}°
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Metric label="Umidade" value={formatNumber(current.relativeHumidityPct, 0)} unit="%" />
          <Metric label="Chuva hoje" value={formatNumber(current.precipitationTodayMm)} unit="mm" />
          <Metric
            label="Vento"
            value={formatNumber(current.windSpeed2mMs)}
            unit={`m/s${current.windDirection ? ` · ${current.windDirection}` : ""}`}
          />
          <Metric label="Radiação" value={formatNumber(current.solarRadiationWm2, 0)} unit="W/m²" />
          <Metric label="Pressão" value={formatNumber(current.surfacePressureKpa)} unit="kPa" />
          <Metric label="ETo" value={formatNumber(current.etoTodayMm)} unit="mm" />
        </div>
      </div>
    </Card>
  );
}
