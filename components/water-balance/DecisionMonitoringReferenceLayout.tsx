"use client";

import {
  calculateManagementUrgency, moisturePctCcForDisplay,
  type DailyBalanceRow,
  type calculateSummary,
} from "@/modules/water-balance/services";

type Summary = ReturnType<typeof calculateSummary>;

type Props = {
  rows: DailyBalanceRow[];
  summary: Summary;
  pivotName: string;
  cultureName: string;
  seasonName: string | null;
  onOpenHistory: () => void;
};

const fmt = (number: number, digits = 1) =>
  number.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtDay = (iso: string) => iso ? iso.split("-").reverse().join("/") : "—";

function Metric({
  label, value, note, accent = "text-slate-900", symbol,
}: { label: string; value: string; note: string; accent?: string; symbol?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-emerald-100 bg-white px-3 py-3 shadow-[0_2px_12px_rgba(17,79,56,.06)]">
      <p className="truncate text-[11px] font-semibold text-slate-500" title={label}>{label}</p>
      <p className={`mt-1 break-words text-[clamp(16px,1.18vw,22px)] font-extrabold leading-tight tabular-nums ${accent}`} title={value}>
        {symbol && <span className="mr-1" aria-hidden="true">{symbol}</span>}{value}
      </p>
      <p className="mt-1 truncate text-[11px] text-slate-500" title={note}>{note}</p>
    </div>
  );
}

function PanelHeader({ icon, title, description, action }: {
  icon: string; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/75 px-4 py-3 text-emerald-950">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-[23px] text-emerald-700" aria-hidden="true">{icon}</span>
        <div>
          <h3 className="text-[18px] font-extrabold leading-snug">{title}</h3>
          <p className="text-[12px] text-slate-600">{description}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

export function DecisionMonitoringReferenceLayout({
  rows, summary, pivotName, cultureName, seasonName, onOpenHistory,
}: Props) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-white p-8 text-center text-slate-600">
        O histórico da safra será apresentado quando o balanço hídrico estiver calculado.
      </div>
    );
  }

  const last = rows[rows.length - 1];
  const sevenDays = rows.slice(-7);
  const priorSeven = rows.slice(-14, -7);
  const avg = (arr: DailyBalanceRow[], fn: (r: DailyBalanceRow) => number) =>
    arr.length ? arr.reduce((sum, row) => sum + fn(row), 0) / arr.length : null;
  const etoAvg = avg(sevenDays, row => row.et0);
  const etoPrev = avg(priorSeven, row => row.et0);
  const etcAvg = avg(sevenDays, row => row.etc);
  const percentDelta = etoAvg != null && etoPrev != null && etoPrev > 0
    ? ((etoAvg / etoPrev) - 1) * 100 : null;
  const status = last.waterStatus;
  const needsWater = status === "deficit" || status === "deficit_critico" || last.grossDepth > 0.05;
  const isAttention = status === "atencao";
  const statusLabel = needsWater ? "Irrigar" : isAttention ? "Atenção" : status === "saturado" ? "Capacidade de campo" : "Sem necessidade";
  const statusColor = needsWater ? "text-rose-700" : isAttention ? "text-amber-700" : "text-emerald-700";
  const urgency = calculateManagementUrgency({
    afd: last.afd, deficit: last.deficit, etcPotential: last.etcPotential ?? last.etc,
  });
  const timeToLimit = urgency.atOrBeyondAfd ? "Limite atingido"
    : urgency.daysToAfd == null ? "Indisponível"
      : urgency.daysToAfd < 1 ? "< 1 dia" : `${fmt(urgency.daysToAfd)} dias`;
  const percentCC = moisturePctCcForDisplay(last.moisturePctCc, last.storedWater, last.cad);
  const appliedRain = [...rows].reverse().find(r => r.precipitation > 0);
  const appliedIrrigation = [...rows].reverse().find(r => r.irrigationApplied > 0);
  const risk = needsWater ? "Alta" : isAttention ? "Média" : "Baixa";
  const historicalCritical = summary.daysInCritical;
  const actionMessage = needsWater ? "Há necessidade de reposição de água."
    : isAttention ? "O solo está próximo do limite de manejo."
      : "No momento não há necessidade de irrigação.";
  const actionDescription = needsWater
    ? "Confira a lâmina recomendada e a disponibilidade hidráulica antes de programar."
    : isAttention ? "Acompanhe a evolução da umidade e a demanda da cultura."
      : "A umidade está em nível adequado para o estádio atual da cultura.";
  const gross = needsWater ? Math.max(0, last.grossDepth) : 0;
  const net = needsWater ? Math.max(0, last.netDepth) : 0;

  return (
    <section className="space-y-3" aria-label="Decisão e monitoramento da safra">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
        <Metric label="Situação atual" value={statusLabel} note={needsWater ? "Necessita reposição" : "Condição do solo"} accent={statusColor} symbol="◈" />
        <Metric label="ARM" value={`${fmt(last.storedWater)} mm`} note={`${fmt(percentCC,0)}% da CC`} accent="text-slate-900" />
        <Metric label="CRA / AFD" value={`${fmt(last.afd)} mm`} note={`F semanal: ${last.cad > 0 ? fmt(last.afd / last.cad,2) : "—"}`} />
        <Metric label="CTA" value={`${fmt(last.cad)} mm`} note="Capacidade total disponível" />
        <Metric label="ETo média (7 dias)" value={etoAvg == null ? "—" : `${fmt(etoAvg)} mm/dia`} note={percentDelta == null ? "Últimos 7 dias disponíveis" : `${percentDelta > 0 ? "+" : ""}${fmt(percentDelta,0)}% vs. 7 dias anteriores`} accent="text-amber-700" />
        <Metric label="ETc média (7 dias)" value={etcAvg == null ? "—" : `${fmt(etcAvg)} mm/dia`} note="Consumo médio da cultura" />
        <Metric label="Kc atual" value={fmt(last.kc,2)} note={last.phase || "Fase não informada"} />
        <Metric label="Dias até o limite" value={timeToLimit} note={urgency.atOrBeyondAfd ? "CRA atingida" : `${fmt(urgency.remainingToAfdMm)} mm de margem`} accent={needsWater ? "text-rose-700" : "text-slate-900"} />
        <Metric label="Prioridade" value={risk} note={needsWater ? "Irrigação necessária" : "Sob monitoramento"} accent={statusColor} symbol="≡" />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <article className="min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white text-slate-800 shadow-[0_3px_16px_rgba(17,79,56,.07)]">
          <PanelHeader icon="◉" title="Recomendação de irrigação"
            description="Com base no balanço hídrico, clima e estádio da cultura."
            action={<span className={`rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[12px] font-bold ${statusColor}`}>{statusLabel}</span>} />
          <div className="space-y-3 p-4 text-slate-800">
            <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${needsWater ? "border-rose-200 bg-rose-50" : isAttention ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[19px] font-extrabold text-white ${needsWater ? "bg-rose-600" : isAttention ? "bg-amber-600" : "bg-emerald-600"}`} aria-hidden="true">
                {needsWater ? "!" : "✓"}
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-slate-900">{actionMessage}</p>
                <p className="mt-0.5 text-[13px] text-slate-600">{actionDescription}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 divide-emerald-100 sm:grid-cols-4 sm:divide-x">
              {[
                { label:"Lâmina líquida", value:`${fmt(net)} mm` },
                { label:"Lâmina bruta", value:`${fmt(gross)} mm` },
                { label:"Tempo estimado", value:needsWater && last.irrigationTime > 0 ? `${fmt(last.irrigationTime)} h` : "0 h" },
                { label:"Urgência", value:risk },
              ].map(item=>(
                <div key={item.label} className="min-w-0 px-2 py-2 first:pl-0">
                  <p className="text-[12px] text-slate-500">{item.label}</p>
                  <p className="mt-1 text-[18px] font-extrabold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

          </div>
        </article>

        <article className="min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white text-slate-800 shadow-[0_3px_16px_rgba(17,79,56,.07)]">
          <PanelHeader icon="▥" title="Monitoramento da safra"
            description="Condições atuais, eventos realizados e principais indicadores."
            action={<button type="button" onClick={onOpenHistory} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100">Ver histórico completo ↓</button>} />
          <div className="grid gap-3 p-4 text-slate-800 md:grid-cols-[.92fr_1fr]">
            <div className="divide-y divide-emerald-100">
              {[
                { icon:"☁", label:"Última chuva", value:appliedRain ? `${fmt(appliedRain.precipitation)} mm` : "Sem registro", note:appliedRain ? fmtDay(appliedRain.date) : "Lançamentos manuais" },
                { icon:"▦", label:"Última irrigação", value:appliedIrrigation ? `${fmt(appliedIrrigation.irrigationApplied)} mm` : "Sem registro", note:appliedIrrigation ? fmtDay(appliedIrrigation.date) : "Eventos realizados" },
                { icon:"◈", label:"Estádio da cultura", value:last.phase || "Não informado", note:`${cultureName} · DAE ${last.dae ?? "—"}` },
                { icon:"◉", label:"Índice de estresse", value:summary.days ? `${fmt(summary.daysInDeficit / summary.days * 100, 0)}%` : "—", note:"Dias em déficit na safra" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-7 shrink-0 text-center text-[21px] text-emerald-600" aria-hidden="true">{item.icon}</span>
                  <p className="min-w-0 flex-1 text-[12px] font-medium text-slate-600">{item.label}</p>
                  <div className="min-w-0 text-right">
                    <p className="max-w-[165px] truncate text-[14px] font-extrabold text-slate-900" title={item.value}>{item.value}</p>
                    <p className="text-[11px] text-slate-500">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="rounded-lg bg-emerald-50/70 p-3">
                <p className="mb-2 text-[13px] font-bold text-emerald-950">Alertas e ocorrências</p>
                <div className={`rounded-lg border px-3 py-3 ${needsWater ? "border-rose-200 bg-rose-50" : isAttention ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <p className={`text-[13px] font-extrabold ${needsWater ? "text-rose-800" : isAttention ? "text-amber-800" : "text-emerald-800"}`}>
                    {needsWater ? "Ação de irrigação necessária" : isAttention ? "Monitorar limite de manejo" : "Sem alerta de irrigação no momento"}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-600">{actionDescription}</p>
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50/70 p-3">
                <p className="text-[13px] font-bold text-emerald-950">Observações da safra</p>
                <p className="mt-1 text-[12px] text-slate-600">
                  {historicalCritical > 0
                    ? `${historicalCritical} dia(s) de déficit crítico registrados no histórico. Situação atual: ${statusLabel.toLowerCase()}.`
                    : "Nenhuma ocorrência de déficit crítico registrada nesta safra."}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{pivotName} · Safra {seasonName ?? "em andamento"}</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
