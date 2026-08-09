import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse, EtoHistoryPoint } from "@/modules/weather/dashboard/climateDashboard";
import { formatNumber, weekdayLabel } from "./climateFormat";

function EtoSparkline({
  penmanMonteith,
  hargreavesSamani,
}: {
  penmanMonteith: EtoHistoryPoint[];
  hargreavesSamani: EtoHistoryPoint[];
}) {
  const width = 420;
  const height = 116;
  const paddingX = 18;
  const paddingY = 18;
  const valid = [...penmanMonteith, ...hargreavesSamani].filter((point) => point.etoMm !== null);
  const validValues = valid.map((point) => point.etoMm).filter((value): value is number => value !== null);
  const max = Math.max(6, ...validValues);
  const x = (index: number) => paddingX + (index * (width - paddingX * 2)) / Math.max(1, penmanMonteith.length - 1);
  const y = (value: number) => height - paddingY - (value / max) * (height - paddingY * 2);
  const segments = (history: EtoHistoryPoint[]) => {
    const result: string[] = [];
    let current: string[] = [];
    history.forEach((point, index) => {
      if (point.etoMm === null) {
        if (current.length > 1) result.push(current.join(" "));
        current = [];
        return;
      }
      current.push(`${x(index)},${y(point.etoMm)}`);
    });
    if (current.length > 1) result.push(current.join(" "));
    return result;
  };

  return (
    <div>
      <svg role="img" aria-label="Comparação da ETo pelos métodos Penman-Monteith e Hargreaves-Samani nos últimos sete dias" viewBox={`0 0 ${width} ${height}`} className="h-[116px] w-full">
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line key={fraction} x1={paddingX} x2={width - paddingX} y1={height * fraction} y2={height * fraction} className="stroke-gray-100 dark:stroke-white/[0.06]" />
        ))}
        {segments(penmanMonteith).map((points) => <polyline key={`pm-${points}`} points={points} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
        {segments(hargreavesSamani).map((points) => <polyline key={`hs-${points}`} points={points} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
        {penmanMonteith.map((point, index) => point.etoMm === null ? null : (
          <circle key={`pm-${point.date}`} cx={x(index)} cy={y(point.etoMm)} r="3.5" fill="#16a34a" stroke="white" strokeWidth="2" />
        ))}
        {hargreavesSamani.map((point, index) => point.etoMm === null ? null : (
          <circle key={`hs-${point.date}`} cx={x(index)} cy={y(point.etoMm)} r="3.5" fill="#f59e0b" stroke="white" strokeWidth="2" />
        ))}
      </svg>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-graphite-400 dark:text-gray-500">
        {penmanMonteith.map((point) => <span key={point.date}>{weekdayLabel(point.date)}</span>)}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-[14px] font-extrabold tabular-nums text-graphite-900 dark:text-white">
        {formatNumber(value)} <span className="text-[10px] font-medium text-graphite-400">mm</span>
      </p>
    </div>
  );
}

function DiagnosticMethod({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2.5 dark:border-white/[0.06]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-graphite-700 dark:text-gray-200">{label}</p>
        <p className="shrink-0 text-[13px] font-extrabold tabular-nums text-graphite-900 dark:text-white">
          {formatNumber(value)} <span className="text-[9px] font-medium text-graphite-400">mm</span>
        </p>
      </div>
      <p className="mt-1 text-[9px] leading-relaxed text-graphite-400 dark:text-gray-500">{note}</p>
    </div>
  );
}

export function EtoSummaryCard({ eto }: { eto: ClimateDashboardResponse["eto"] }) {
  return (
    <Card className="h-full overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">Evapotranspiração de referência</h2>
          <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Oito métodos exibidos separadamente</p>
        </div>
        <span className="w-fit rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          {eto.quality === "model_unvalidated" ? "Estimativa não validada" : "Aguardando dados"}
        </span>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Penman-Monteith FAO-56</p>
            <p className="mt-2 text-[30px] font-black leading-none tabular-nums text-emerald-800 dark:text-emerald-200">{formatNumber(eto.todayMm)} <span className="text-[11px] font-semibold">mm</span></p>
            <p className="mt-2 text-[9px] text-emerald-700/75 dark:text-emerald-300/75">Open-Meteo</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-500/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Hargreaves-Samani</p>
            <p className="mt-2 text-[30px] font-black leading-none tabular-nums text-amber-800 dark:text-amber-200">{formatNumber(eto.hargreavesSamani.todayMm)} <span className="text-[11px] font-semibold">mm</span></p>
            <p className="mt-2 text-[9px] text-amber-700/75 dark:text-amber-300/75">Cotrim · Tmin/Tmax do Open-Meteo</p>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] font-semibold text-graphite-500 dark:text-gray-400">
          Diferença HS − PM: {eto.comparison.deltaTodayMm !== null && eto.comparison.deltaTodayMm > 0 ? "+" : ""}{formatNumber(eto.comparison.deltaTodayMm, 2)} mm
          {eto.comparison.deltaTodayPct === null ? "" : ` (${eto.comparison.deltaTodayPct > 0 ? "+" : ""}${formatNumber(eto.comparison.deltaTodayPct, 1)}%)`}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <DiagnosticMethod
            label="ASCE-EWRI ETos"
            value={eto.asceEwri.todayMm}
            note="Superfície curta; no passo diário é alinhado ao FAO-56."
          />
          <DiagnosticMethod
            label="Priestley-Taylor"
            value={eto.priestleyTaylor.todayMm}
            note="Saldo de radiação calculado · α 1,26."
          />
          <DiagnosticMethod
            label="Thornthwaite-Camargo"
            value={eto.thornthwaiteCamargo.todayMm}
            note={eto.thornthwaiteCamargo.climatologyStatus === "available"
              ? `Normal anual NASA POWER: ${formatNumber(eto.thornthwaiteCamargo.climatologicalAnnualMeanTemperatureC)}°C.`
              : "Aguardando normal anual NASA POWER; sem valor inventado."}
          />
          <DiagnosticMethod
            label="Blaney-Criddle"
            value={eto.blaneyCriddle.todayMm}
            note="Temperatura e fotoperíodo · método originalmente mensal."
          />
          <DiagnosticMethod
            label="Makkink"
            value={eto.makkink.todayMm}
            note="Temperatura e radiação diária · coeficiente 0,61."
          />
          <DiagnosticMethod
            label="Jensen-Haise"
            value={eto.jensenHaise.todayMm}
            note="Forma simplificada · temperatura e radiação diária."
          />
        </div>

        <div className="mt-4 rounded-2xl bg-brand-50/50 p-3 dark:bg-brand-900/10">
          <EtoSparkline penmanMonteith={eto.history} hargreavesSamani={eto.hargreavesSamani.history} />
          <div className="mt-2 flex justify-center gap-4 text-[10px] font-semibold text-graphite-500 dark:text-gray-400"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />PM FAO-56</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Hargreaves-Samani</span></div>
        </div>

        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Comparação diagnóstica. Nenhum método entra automaticamente em irrigação ou balanço hídrico.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-x-5 border-t border-gray-100 pt-5 dark:border-white/[0.06]">
          <SummaryMetric label="Média 7 dias · PM" value={eto.average7dMm} />
          <SummaryMetric label="Média 7 dias · HS" value={eto.hargreavesSamani.average7dMm} />
        </div>
      </div>
    </Card>
  );
}
