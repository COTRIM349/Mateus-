import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { formatRelativeUpdate } from "./climateFormat";

export function ClimateStatusBar({ status }: { status: ClimateDashboardResponse["status"] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-gray-100 bg-white px-5 py-3 text-[11px] font-semibold text-graphite-500 shadow-card dark:border-white/[0.06] dark:bg-graphite-800 dark:text-gray-400 dark:shadow-dark-card">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${status.activeSources > 0 ? "bg-green-500" : "bg-amber-500"}`} />
        {status.activeSources} de {status.configuredSources} APIs do modelo respondendo
      </span>
      <span>{status.consensusLabel}</span>
      <span>{status.qualityLabel}</span>
      <span>{status.etoInputSources} {status.etoInputSources === 1 ? "fonte completa" : "fontes completas"} para ETo</span>
      <span>{formatRelativeUpdate(status.updatedAt)}</span>
    </div>
  );
}
