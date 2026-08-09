import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";

export function ClimateValidationNotice({
  validation,
}: {
  validation: ClimateDashboardResponse["validation"];
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/60 dark:bg-amber-900/20" role="status">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">Modo de validação climática</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">{validation.message}</p>
        </div>
        <span className="w-fit shrink-0 rounded-full bg-amber-200 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-900 dark:bg-amber-800 dark:text-amber-100">
          Confiança baixa
        </span>
      </div>
      <p className="mt-2 text-[10px] font-semibold text-amber-800/80 dark:text-amber-300/80">
        Ponto consultado: {validation.latitude?.toFixed(6) ?? "—"}, {validation.longitude?.toFixed(6) ?? "—"}
        {validation.elevationM !== null ? ` · altitude ${validation.elevationM.toFixed(0)} m` : ""}
      </p>
      {(validation.disputedFields.length > 0 || validation.outlierProviders.length > 0) && (
        <p className="mt-2 text-[10px] font-semibold text-amber-800/80 dark:text-amber-300/80">
          Divergências: {validation.disputedFields.join(", ") || "campos sem concordância"}
          {validation.outlierProviders.length > 0 ? ` · fontes discrepantes: ${validation.outlierProviders.join(", ")}` : ""}
        </p>
      )}
    </section>
  );
}
