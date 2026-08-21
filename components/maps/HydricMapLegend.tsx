"use client";

import {
  MAP_HYDRIC_NEED_IRRIGATE,
  MAP_HYDRIC_NO_IRRIGATE,
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
} from "@/modules/water-balance/services";

function formatChip(date: string, today: string): string {
  if (date === today) return "Hoje";
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function Swatch({ status, count }: { status: MapHydricStatus; count: number }) {
  const conf = MAP_HYDRIC_STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-graphite-600 dark:text-gray-300">
      <span
        className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-black/10 dark:ring-white/20"
        style={{ backgroundColor: conf.color }}
      />
      <span>{conf.label}</span>
      <span className="tabular-nums text-graphite-400 dark:text-gray-500">{count}</span>
    </span>
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
    <div className="border-t border-gray-100 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-graphite-900">
      {dates && dates.length > 0 && onSelectDate ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-graphite-500 dark:text-gray-400">
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
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-graphite-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15"
                }`}
              >
                {formatChip(date, today)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">
              Não é preciso irrigar
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {MAP_HYDRIC_NO_IRRIGATE.map((status) => (
                <Swatch key={status} status={status} count={counts[status] ?? 0} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">
              É preciso irrigar
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {MAP_HYDRIC_NEED_IRRIGATE.map((status) => (
                <Swatch key={status} status={status} count={counts[status] ?? 0} />
              ))}
            </div>
          </div>
        </div>

        {demand ? (
          <div className="flex gap-6 text-[12px]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">
                Maior demanda
              </p>
              <p className="mt-0.5 font-semibold text-graphite-800 dark:text-white">
                {demand.highestName ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">
                Áreas com demanda
              </p>
              <p className="mt-0.5 font-semibold tabular-nums text-graphite-800 dark:text-white">
                {demand.needing}/{demand.total}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
