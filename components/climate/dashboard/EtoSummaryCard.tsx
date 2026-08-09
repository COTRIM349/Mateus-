import { Card } from "@/components/ui/Card";
import type { ClimateDashboardResponse, EtoHistoryPoint } from "@/modules/weather/dashboard/climateDashboard";
import { formatNumber, weekdayLabel } from "./climateFormat";

function EtoSparkline({ history }: { history: EtoHistoryPoint[] }) {
  const width = 420;
  const height = 116;
  const paddingX = 18;
  const paddingY = 18;
  const valid = history.filter((point) => point.etoMm !== null);
  const validValues = valid.map((point) => point.etoMm).filter((value): value is number => value !== null);
  const max = Math.max(6, ...validValues);
  const x = (index: number) => paddingX + (index * (width - paddingX * 2)) / Math.max(1, history.length - 1);
  const y = (value: number) => height - paddingY - (value / max) * (height - paddingY * 2);
  const segments: string[] = [];
  let currentSegment: string[] = [];
  history.forEach((point, index) => {
    if (point.etoMm === null) {
      if (currentSegment.length > 1) segments.push(currentSegment.join(" "));
      currentSegment = [];
      return;
    }
    currentSegment.push(`${x(index)},${y(point.etoMm)}`);
  });
  if (currentSegment.length > 1) segments.push(currentSegment.join(" "));

  return (
    <div>
      <svg role="img" aria-label="Histórico de ETo dos últimos sete dias" viewBox={`0 0 ${width} ${height}`} className="h-[116px] w-full">
        <defs>
          <linearGradient id="eto-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22c55e" stopOpacity="0.24" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line key={fraction} x1={paddingX} x2={width - paddingX} y1={height * fraction} y2={height * fraction} className="stroke-gray-100 dark:stroke-white/[0.06]" />
        ))}
        {segments.map((points) => <polyline key={points} points={points} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
        {history.map((point, index) => point.etoMm === null ? null : (
          <circle key={point.date} cx={x(index)} cy={y(point.etoMm)} r="4" fill="#16a34a" stroke="white" strokeWidth="2" />
        ))}
      </svg>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-graphite-400 dark:text-gray-500">
        {history.map((point) => <span key={point.date}>{weekdayLabel(point.date)}</span>)}
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

export function EtoSummaryCard({ eto }: { eto: ClimateDashboardResponse["eto"] }) {
  return (
    <Card className="h-full overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-[15px] font-extrabold text-graphite-900 dark:text-white">Evapotranspiração de referência</h2>
          <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">ETo · {eto.method}</p>
          <p className="mt-1 text-[10px] text-graphite-400 dark:text-gray-500">{eto.sourceLabel}</p>
        </div>
        <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${eto.quality !== "missing" ? "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"}`}>
          {eto.quality === "provider_model" ? "Fornecida pela API" : "Aguardando dados"}
        </span>
      </div>

      <div className="p-6">
        <div className="flex items-end gap-2">
          <p className="text-[42px] font-black leading-none tracking-tight tabular-nums text-brand-700 dark:text-brand-400">{formatNumber(eto.todayMm)}</p>
          <p className="pb-1 text-[13px] font-semibold text-graphite-400">mm · hoje</p>
        </div>

        <div className="mt-4 rounded-2xl bg-brand-50/50 p-3 dark:bg-brand-900/10">
          <EtoSparkline history={eto.history} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-gray-100 pt-5 sm:grid-cols-4 dark:border-white/[0.06]">
          <SummaryMetric label="Ontem" value={eto.yesterdayMm} />
          <SummaryMetric label="Média 7 dias" value={eto.average7dMm} />
          <SummaryMetric label="Média 30 dias" value={eto.average30dMm} />
          <SummaryMetric label="Acumulado no mês" value={eto.monthTotalMm} />
        </div>
      </div>
    </Card>
  );
}
