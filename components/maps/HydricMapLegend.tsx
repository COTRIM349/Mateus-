"use client";

import {
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
} from "@/modules/water-balance/services";

function formatChip(date: string, today: string): string {
  if (date === today) return "Hoje";
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function MoistureBand({
  status,
  count,
  reference,
  detail,
}: {
  status: MapHydricStatus;
  count: number;
  reference: string;
  detail: string;
}) {
  const conf = MAP_HYDRIC_STATUS_CONFIG[status];
  return (
    <div className="flex min-w-[118px] items-center gap-2.5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-[10px] font-extrabold shadow-sm ring-1 ring-black/10 dark:border-[#060D17] dark:ring-white/10"
        style={{ backgroundColor: conf.color, color: conf.onColor }}
      >
        {reference}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold leading-tight text-graphite-800 dark:text-[#F3F7FF]">{conf.label}</p>
        <p className="mt-0.5 text-[9.5px] leading-tight text-graphite-400 dark:text-[#68778E]">{detail}</p>
        <p className="mt-0.5 text-[9.5px] font-semibold tabular-nums text-graphite-500 dark:text-[#8E9CB1]">{count} pivô(s)</p>
      </div>
    </div>
  );
}

export function HydricMapLegend({
  counts,
  dates,
  selectedDate,
  onSelectDate,
  demand,
}: {
  counts: Partial<Record<MapHydricStatus, number>>;
  dates?: string[];
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
  demand?: { needing: number; total: number; highestName: string | null };
}) {
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-3 dark:border-[#162233] dark:bg-[#060D17]">
      {dates && dates.length > 0 && onSelectDate ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-graphite-500 dark:text-[#8E9CB1]">
            Condição no dia:
          </span>
          {dates.map((date) => {
            const active = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  active
                    ? "bg-emerald-700 text-white shadow-[0_0_0_1px_rgba(52,211,153,0.18)]"
                    : "bg-gray-100 text-graphite-600 hover:bg-gray-200 dark:bg-[#111B2A] dark:text-[#A6B3C7] dark:ring-1 dark:ring-[#1A2638] dark:hover:bg-[#162235]"
                }`}
              >
                {formatChip(date, today)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-[#68778E]">
            Umidade do solo · % da capacidade de campo
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">
            <MoistureBand status="capacidade_campo" count={counts.capacidade_campo ?? 0} reference="≥95%" detail="Azul · 95 a 100% da CC" />
            <MoistureBand status="boa_umidade" count={counts.boa_umidade ?? 0} reference="90%" detail="Verde · 90 a <95% da CC" />
            <MoistureBand status="atencao" count={counts.atencao ?? 0} reference="85%" detail="Amarelo · 85 a <90% da CC" />
            <MoistureBand status="deficit_hidrico" count={counts.deficit_hidrico ?? 0} reference="70%" detail="Vermelho · 70 a <85% da CC" />
            <MoistureBand status="critico" count={counts.critico ?? 0} reference="<70%" detail="Preto · abaixo de 70% da CC" />
            {(counts.incompleto ?? 0) > 0 && (
              <MoistureBand status="incompleto" count={counts.incompleto ?? 0} reference="—" detail="Dados indisponíveis" />
            )}
          </div>
        </div>

        {demand ? (
          <div className="flex gap-6 text-[12px]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-[#68778E]">
                Maior demanda
              </p>
              <p className="mt-0.5 font-semibold text-graphite-800 dark:text-[#F3F7FF]">
                {demand.highestName ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-[#68778E]">
                Áreas com demanda
              </p>
              <p className="mt-0.5 font-semibold tabular-nums text-graphite-800 dark:text-[#F3F7FF]">
                {demand.needing}/{demand.total}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
