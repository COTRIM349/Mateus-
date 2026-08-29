import { Card } from "@/components/ui";
import type { SoilReservoirSummary } from "@/modules/water-balance/services";

export function SoilReservoirPanel({
  summary,
  drMm,
  ks,
  ky,
  yieldRisk,
}: {
  summary: SoilReservoirSummary | null;
  drMm?: number | null;
  ks?: number | null;
  ky?: number | null;
  yieldRisk?: number | null;
}) {
  if (!summary) return null;

  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-graphite-400 dark:text-gray-500">
        Reservatório de solo (hoje)
      </p>
      <p className="mt-1 text-xs text-graphite-500 dark:text-gray-400">
        DTA → CAD (CTA) → AFD (CRA) · raiz {summary.rootDepthCm.toFixed(0)} cm · FD (p) {summary.pFactor.toFixed(2)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400">DTA</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-graphite-900 dark:text-white">
            {summary.dtaMmPerCm.toFixed(2)}
            <span className="text-xs font-medium text-graphite-400"> mm/cm</span>
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400">CAD (CTA)</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-graphite-900 dark:text-white">
            {summary.cadMm.toFixed(1)}
            <span className="text-xs font-medium text-graphite-400"> mm</span>
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400">AFD (CRA)</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-graphite-900 dark:text-white">
            {summary.afdMm.toFixed(1)}
            <span className="text-xs font-medium text-graphite-400"> mm</span>
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400">Segurança</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-graphite-900 dark:text-white">
            {summary.safetyMm.toFixed(1)}
            <span className="text-xs font-medium text-graphite-400"> mm</span>
          </p>
        </div>
      </div>

      {summary.usesLayers && summary.layers.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-graphite-400 dark:text-gray-500">
                <th className="pb-2 pr-4 font-semibold">Camada</th>
                <th className="pb-2 pr-4 font-semibold">Explorada</th>
                <th className="pb-2 pr-4 font-semibold">DTA</th>
                <th className="pb-2 pr-4 font-semibold">CTA</th>
                <th className="pb-2 font-semibold">ARM*</th>
              </tr>
            </thead>
            <tbody>
              {summary.layers.map((l) => {
                const armTotal = drMm != null ? Math.max(summary.cadMm - drMm, 0) : null;
                const armLayer = armTotal != null && summary.cadMm > 0
                  ? l.cadMm * (armTotal / summary.cadMm)
                  : null;
                return (
                  <tr key={l.label} className="border-t border-gray-100 dark:border-white/[0.06]">
                    <td className="py-2 pr-4 tabular-nums">{l.label}</td>
                    <td className="py-2 pr-4 tabular-nums">{l.exploredCm.toFixed(0)} cm</td>
                    <td className="py-2 pr-4 tabular-nums">{l.dtaMmPerCm.toFixed(2)} mm/cm</td>
                    <td className="py-2 pr-4 tabular-nums">{l.cadMm.toFixed(1)} mm</td>
                    <td className="py-2 tabular-nums">{armLayer != null ? `${armLayer.toFixed(1)} mm` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-graphite-400">
            * ARM por camada é a partição proporcional à CTA (reservatório único FAO-56). Não é um balanço independente por horizonte.
          </p>
        </div>
      )}

      {(drMm != null || ks != null) && (
        <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-4 text-xs dark:border-white/[0.06]">
          {drMm != null && (
            <span>
              Dr (início do dia): <strong className="tabular-nums text-graphite-800 dark:text-white">{drMm.toFixed(1)} mm</strong>
            </span>
          )}
          {ks != null && (
            <span>
              Ks: <strong className="tabular-nums text-graphite-800 dark:text-white">{ks.toFixed(2)}</strong>
            </span>
          )}
          {ky != null && (
            <span>
              Ky: <strong className="tabular-nums text-graphite-800 dark:text-white">{ky.toFixed(2)}</strong>
            </span>
          )}
          {yieldRisk != null && (
            <span>
              Risco produtivo: <strong className="tabular-nums text-graphite-800 dark:text-white">{yieldRisk.toFixed(2)}</strong>
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
