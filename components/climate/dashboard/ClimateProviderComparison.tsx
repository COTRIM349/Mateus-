import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { formatNumber } from "./climateFormat";

const STATUS = {
  available: { label: "Completa", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" },
  partial: { label: "Parcial", classes: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300" },
  unavailable: { label: "Sem dado", classes: "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400" },
} as const;

function display(value: number | null, digits = 1, unit = ""): string {
  return value === null ? "—" : `${formatNumber(value, digits)}${unit}`;
}

export function ClimateProviderComparison({
  sources,
  timezone,
}: {
  sources: ClimateDashboardResponse["providerComparison"];
  timezone: string;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
        <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">Comparação direta entre APIs</h2>
        <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Valores separados, sem média e sem transformar ausência em zero.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-[11px]">
          <thead className="bg-gray-50 text-[9px] font-bold uppercase tracking-wide text-graphite-400 dark:bg-white/[0.03] dark:text-gray-500">
            <tr>
              <th className="px-4 py-3">Fonte</th>
              <th className="px-3 py-3">Validade</th>
              <th className="px-3 py-3">Temperatura</th>
              <th className="px-3 py-3">Umidade</th>
              <th className="px-3 py-3">Chuva</th>
              <th className="px-3 py-3">Vento</th>
              <th className="px-3 py-3">Radiação</th>
              <th className="px-3 py-3">Pressão</th>
              <th className="px-4 py-3">Qualidade</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const status = STATUS[source.status];
              return (
                <tr key={source.provider} className="border-t border-gray-100 text-graphite-700 dark:border-white/[0.05] dark:text-gray-300">
                  <td className="px-4 py-3">
                    <p className="font-extrabold text-graphite-900 dark:text-white">{source.label}</p>
                    <p className="mt-0.5 text-[9px] text-graphite-400">{source.estimated ? "modelo estimado" : source.dataType ?? "sem resposta"}{source.interpolated ? " · interpolado" : ""}</p>
                    {source.fetchedAt && <p className="mt-0.5 text-[9px] text-graphite-400">consulta {new Date(source.fetchedAt).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}</p>}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{source.validAt ? new Date(source.validAt).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{display(source.temperatureC, 1, "°C")}</td>
                  <td className="px-3 py-3 tabular-nums">{display(source.relativeHumidityPct, 0, "%")}</td>
                  <td className="px-3 py-3 tabular-nums">{display(source.precipitationMm, 2, " mm")}</td>
                  <td className="px-3 py-3 tabular-nums">{display(source.windSpeed2mMs, 1, " m/s")}</td>
                  <td className="px-3 py-3 tabular-nums">{display(source.solarRadiationWm2, 0, " W/m²")}</td>
                  <td className="px-3 py-3 tabular-nums">{display(source.surfacePressureKpa, 1, " kPa")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${status.classes}`}>{status.label}</span>
                    {source.missingFields.length > 0 && <p className="mt-1 max-w-[180px] text-[9px] text-graphite-400" title={source.missingFields.join(", ")}>{source.missingFields.length} campo(s) ausente(s)</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
