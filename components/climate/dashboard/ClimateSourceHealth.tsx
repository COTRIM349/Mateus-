import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";
import { formatRelativeUpdate } from "./climateFormat";

const STATUS_LABELS: Record<ClimateDashboardResponse["sourceHealth"][number]["status"], string> = {
  active: "Ativa",
  delayed: "Atrasada",
  credential_required: "Falta credencial",
  unavailable: "Indisponível",
};

function statusClasses(status: ClimateDashboardResponse["sourceHealth"][number]["status"]): string {
  if (status === "active") return "bg-emerald-500";
  if (status === "delayed") return "bg-amber-500";
  if (status === "credential_required") return "bg-orange-500";
  return "bg-gray-300 dark:bg-gray-600";
}

export function ClimateSourceHealth({
  sources,
}: {
  sources: ClimateDashboardResponse["sourceHealth"];
}) {
  return (
    <section aria-labelledby="climate-source-health-title">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 id="climate-source-health-title" className="text-sm font-extrabold text-graphite-900 dark:text-white">
            Fontes climáticas
          </h2>
          <p className="text-[10px] text-graphite-400 dark:text-gray-500">Cada fonte tem uma função; referências externas não alteram a ETo.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {sources.map((source) => (
          <div key={source.provider} className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm dark:border-white/[0.06] dark:bg-graphite-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold text-graphite-800 dark:text-gray-100">{source.label}</p>
              <span className="flex items-center gap-1.5 text-[9px] font-bold text-graphite-500 dark:text-gray-400">
                <span className={`h-1.5 w-1.5 rounded-full ${statusClasses(source.status)}`} />
                {STATUS_LABELS[source.status]}
              </span>
            </div>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{source.role}</p>
            <p className="mt-1 truncate text-[10px] text-graphite-500 dark:text-gray-400" title={source.message}>
              {source.status === "active" ? formatRelativeUpdate(source.updatedAt) : source.message}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
