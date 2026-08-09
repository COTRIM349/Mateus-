import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { formatNumber, formatRelativeUpdate } from "./climateFormat";

function statusDot(status: ClimateDashboardResponse["publicReferences"][number]["status"]): string {
  if (status === "available") return "bg-green-500";
  if (status === "stale") return "bg-amber-500";
  return "bg-gray-300 dark:bg-gray-600";
}

export function PublicWeatherReferences({
  references,
}: {
  references: ClimateDashboardResponse["publicReferences"];
}) {
  if (references.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-[210px]">
          <p className="text-[12px] font-extrabold text-graphite-900 dark:text-white">Referência pública INMET</p>
          <p className="mt-0.5 text-[10px] text-graphite-400 dark:text-gray-500">Comparação externa · não entra no cálculo da ETo</p>
        </div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          {references.map((reference) => (
            <div key={reference.stationId} className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[11px] font-bold text-graphite-700 dark:text-gray-200">
                  {reference.name}
                </p>
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(reference.status)}`} />
              </div>
              <p className="mt-1 text-[10px] text-graphite-400 dark:text-gray-500">
                {reference.distanceKm === null ? "Distância indisponível" : `${formatNumber(reference.distanceKm, 0)} km da fazenda`}
                {reference.elevationDifferenceM === null ? "" : ` · Δ altitude ${formatNumber(reference.elevationDifferenceM, 0)} m`}
              </p>
              {reference.status === "available" || reference.status === "stale" ? (
                <p className="mt-1.5 text-[10px] font-semibold text-graphite-600 dark:text-gray-300">
                  {formatNumber(reference.temperatureC)}°C · UR {formatNumber(reference.relativeHumidityPct, 0)}% · vento {formatNumber(reference.windSpeedMs)} m/s · {formatRelativeUpdate(reference.observedAt)}
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">{reference.message}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

