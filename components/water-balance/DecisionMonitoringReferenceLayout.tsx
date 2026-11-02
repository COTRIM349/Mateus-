"use client";

import {
  calculateAnticipatoryDecision, calculateManagementUrgency, moisturePctCcForDisplay,
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
  areaHa: number | null;
  flowRateM3h: number | null;
  efficiencyPercent: number | null;
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
  rows, summary, pivotName, cultureName, seasonName, areaHa, flowRateM3h, efficiencyPercent, onOpenHistory,
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
  const urgency = calculateManagementUrgency({
    afd: last.afd, deficit: last.deficit, etcPotential: last.etcPotential ?? last.etc,
  });
  const anticipatory = calculateAnticipatoryDecision({
    cadMm: last.cad,
    armMm: last.storedWater,
    afdMm: last.afd,
    etcPotentialMmDay: last.etcPotential ?? last.etc,
    areaHa,
    flowRateM3h,
    efficiencyFraction: efficiencyPercent != null && efficiencyPercent > 0 ? efficiencyPercent / 100 : null,
  });
  const statusLabel = anticipatory.level === "critico" ? "Crítico"
    : anticipatory.level === "prioridade" ? "Irrigar prioritariamente"
      : anticipatory.level === "programar" ? "Programar irrigação"
        : anticipatory.level === "monitorar" ? "Monitorar"
          : "Confortável";
  const statusColor = anticipatory.level === "critico" || anticipatory.level === "prioridade"
    ? "text-rose-700"
    : anticipatory.level === "programar" || anticipatory.level === "monitorar"
      ? "text-amber-700"
      : "text-emerald-700";
  const timeToLimit = urgency.atOrBeyondAfd ? "Limite atingido"
    : urgency.daysToAfd == null ? "Indisponível"
      : urgency.daysToAfd < 1 ? "< 1 dia" : `${fmt(urgency.daysToAfd)} dias`;
  const percentCC = moisturePctCcForDisplay(last.moisturePctCc, last.storedWater, last.cad);
  const appliedRain = [...rows].reverse().find(r => r.precipitation > 0);
  const appliedIrrigation = [...rows].reverse().find(r => r.irrigationApplied > 0);
  const historicalCritical = summary.daysInCritical;
  const risk = anticipatory.level === "critico" ? "Crítica"
    : anticipatory.level === "prioridade" ? "Muito alta"
      : anticipatory.level === "programar" ? "Alta"
        : anticipatory.level === "monitorar" ? "Média"
          : "Baixa";
  const actionMessage = anticipatory.level === "critico"
    ? "O limite de manejo já foi ultrapassado."
    : anticipatory.level === "prioridade"
      ? "O limite de manejo foi atingido: irrigar com prioridade."
      : anticipatory.level === "programar"
        ? "Programar irrigação antes de atingir o limite."
        : anticipatory.level === "monitorar"
          ? "A margem hídrica está diminuindo: intensificar o monitoramento."
          : "Há folga hídrica e operacional no momento.";
  const actionDescription = anticipatory.level === "programar"
    ? `Restam ${anticipatory.daysToAfd == null ? "—" : fmt(anticipatory.daysToAfd)} dia(s) até a AFD, enquanto a reposição estimada até a CC exige ${anticipatory.applicationHoursToCc == null ? "—" : fmt(anticipatory.applicationHoursToCc)} h de operação.`
    : anticipatory.level === "prioridade" || anticipatory.level === "critico"
      ? "A planta entrou na faixa de maior risco hídrico; priorize a operação e acompanhe a recuperação do ARM."
      : anticipatory.level === "monitorar"
        ? `A AFD ainda não foi atingida. Margem atual: ${fmt(anticipatory.remainingToAfdMm)} mm.`
        : "A AFD ainda possui margem suficiente em relação ao tempo operacional do pivô.";
  const gross = anticipatory.level === "programar" || anticipatory.level === "prioridade" || anticipatory.level === "critico"
    ? (anticipatory.grossDepthToCcMm ?? 0)
    : 0;
  const decisionNeedsAction = anticipatory.level === "programar" || anticipatory.level === "prioridade" || anticipatory.level === "critico";
  const decisionNeedsAttention = anticipatory.level === "monitorar" || anticipatory.level === "programar";

  return (
    <section className="space-y-3" aria-label="Decisão e monitoramento da safra">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
        <Metric label="Situação atual" value={statusLabel} note={decisionNeedsAction ? "Antecipação operacional" : "Condição hídrica"} accent={statusColor} symbol="◈" />
        <Metric label="ARM" value={`${fmt(last.storedWater)} mm`} note={`${fmt(percentCC,0)}% da CC`} accent="text-slate-900" />
        <Metric label="CRA / AFD" value={`${fmt(last.afd)} mm`} note={`F semanal: ${last.cad > 0 ? fmt(last.afd / last.cad,2) : "—"}`} />
        <Metric label="CTA" value={`${fmt(last.cad)} mm`} note="Capacidade total disponível" />
        <Metric label="ETo média (7 dias)" value={etoAvg == null ? "—" : `${fmt(etoAvg)} mm/dia`} note={percentDelta == null ? "Últimos 7 dias disponíveis" : `${percentDelta > 0 ? "+" : ""}${fmt(percentDelta,0)}% vs. 7 dias anteriores`} accent="text-amber-700" />
        <Metric label="ETc média (7 dias)" value={etcAvg == null ? "—" : `${fmt(etcAvg)} mm/dia`} note="Consumo médio da cultura" />
        <Metric label="Kc atual" value={fmt(last.kc,2)} note={last.phase || "Fase não informada"} />
        <Metric label="Dias até o limite" value={timeToLimit} note={urgency.atOrBeyondAfd ? "CRA/AFD atingida" : `${fmt(urgency.remainingToAfdMm)} mm de margem`} accent={anticipatory.level === "critico" || anticipatory.level === "prioridade" ? "text-rose-700" : "text-slate-900"} />
        <Metric label="Tempo para repor CC" value={anticipatory.applicationHoursToCc == null ? "—" : `${fmt(anticipatory.applicationHoursToCc)} h`} note={anticipatory.grossDepthToCcMm == null ? "Dados operacionais incompletos" : `${fmt(anticipatory.grossDepthToCcMm)} mm brutos`} accent={anticipatory.level === "programar" ? "text-amber-700" : "text-slate-900"} />
        <Metric label="Prioridade" value={risk} note={anticipatory.operationalMarginDays == null ? "Sem margem operacional calculável" : `Margem operacional: ${fmt(anticipatory.operationalMarginDays)} d`} accent={statusColor} symbol="≡" />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <article className="min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white text-slate-800 shadow-[0_3px_16px_rgba(17,79,56,.07)]">
          <PanelHeader icon="◉" title="Recomendação de irrigação"
            description="Com base no balanço hídrico, clima e estádio da cultura."
            action={<span className={`rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[12px] font-bold ${statusColor}`}>{statusLabel}</span>} />
          <div className="space-y-3 p-4 text-slate-800">
            <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${anticipatory.level === "critico" || anticipatory.level === "prioridade" ? "border-rose-200 bg-rose-50" : decisionNeedsAttention ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[19px] font-extrabold text-white ${anticipatory.level === "critico" || anticipatory.level === "prioridade" ? "bg-rose-600" : decisionNeedsAttention ? "bg-amber-500" : "bg-emerald-600"}`} aria-hidden="true">
                {decisionNeedsAction ? "!" : anticipatory.level === "monitorar" ? "•" : "✓"}
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-slate-900">{actionMessage}</p>
                <p className="mt-0.5 text-[13px] text-slate-600">{actionDescription}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 divide-emerald-100 sm:grid-cols-4 sm:divide-x">
              {[
                { label:"Déficit até CC", value:`${fmt(anticipatory.deficitToCcNetMm)} mm` },
                { label:"Lâmina bruta p/ CC", value:decisionNeedsAction ? `${fmt(gross)} mm` : "—" },
                { label:"Tempo de aplicação", value:decisionNeedsAction && anticipatory.applicationHoursToCc != null ? `${fmt(anticipatory.applicationHoursToCc)} h` : "—" },
                { label:"Margem operacional", value:anticipatory.operationalMarginDays == null ? "—" : `${fmt(anticipatory.operationalMarginDays)} d` },
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
                { icon:"◉", label:"Histórico de déficit", value:summary.days ? `${fmt(summary.daysInDeficit / summary.days * 100, 0)}%` : "—", note:"Percentual de dias da safra" },
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
                <div className={`rounded-lg border px-3 py-3 ${anticipatory.level === "critico" || anticipatory.level === "prioridade" ? "border-rose-200 bg-rose-50" : decisionNeedsAttention ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <p className={`text-[13px] font-extrabold ${anticipatory.level === "critico" || anticipatory.level === "prioridade" ? "text-rose-800" : decisionNeedsAttention ? "text-amber-800" : "text-emerald-800"}`}>
                    {anticipatory.level === "critico" ? "Déficit hídrico crítico"
                      : anticipatory.level === "prioridade" ? "Irrigação prioritária"
                        : anticipatory.level === "programar" ? "Programar irrigação agora"
                          : anticipatory.level === "monitorar" ? "Monitorar margem até a AFD"
                            : "Sem alerta operacional no momento"}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-600">{actionDescription}</p>
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50/70 p-3">
                <p className="text-[13px] font-bold text-emerald-950">Observações da safra</p>
                <p className="mt-1 text-[12px] text-slate-600">
                  {historicalCritical > 0
                    ? `${historicalCritical} dia(s) de déficit crítico registrados no histórico. Decisão atual: ${statusLabel.toLowerCase()}.`
                    : `Nenhuma ocorrência de déficit crítico registrada nesta safra. Decisão atual: ${statusLabel.toLowerCase()}.`}
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
