"use client";

import { MAP_HYDRIC_COLORS, type MapHydricStatus } from "@/modules/water-balance/services";
import type { VisionLayer } from "@/modules/vision-map/services";
import { HydricMapLegend } from "@/components/maps/HydricMapLegend";

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-graphite-600 dark:text-gray-300">
      <span
        className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-black/10 dark:ring-white/20"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function DateChips({
  dates,
  selectedDate,
  onSelectDate,
}: {
  dates: string[];
  selectedDate?: string | null;
  onSelectDate: (date: string) => void;
}) {
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-graphite-500 dark:text-gray-400">Acumulado até:</span>
      {dates.map((date) => {
        const active = date === selectedDate;
        const [, month, day] = date.split("-");
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
            {date === today ? "Hoje" : `${day}/${month}`}
          </button>
        );
      })}
    </div>
  );
}

const RAIN_SWATCHES = [
  { color: "#BBDEFB", label: "0 mm" },
  { color: "#64B5F6", label: "< 10 mm" },
  { color: "#1E88E5", label: "10–25 mm" },
  { color: "#0D47A1", label: "≥ 25 mm" },
  { color: MAP_HYDRIC_COLORS.gray, label: "Sem chuva registrada" },
];

const ORBITAL_SWATCHES = [
  { color: MAP_HYDRIC_COLORS.red, label: "< 10% vol." },
  { color: MAP_HYDRIC_COLORS.yellow, label: "10–18% vol." },
  { color: MAP_HYDRIC_COLORS.green, label: "18–28% vol." },
  { color: MAP_HYDRIC_COLORS.blue, label: "≥ 28% vol." },
  { color: MAP_HYDRIC_COLORS.gray, label: "Sem dado orbital" },
];

const COST_SWATCHES = [
  { color: MAP_HYDRIC_COLORS.green, label: "Menor tercil da fazenda" },
  { color: MAP_HYDRIC_COLORS.yellow, label: "Tercil médio" },
  { color: MAP_HYDRIC_COLORS.red, label: "Maior tercil" },
  { color: MAP_HYDRIC_COLORS.gray, label: "Sem custo no período" },
];

export function VisionMapLegend({
  layer,
  counts,
  dates,
  selectedDate,
  onSelectDate,
  demand,
  attribution,
}: {
  layer: VisionLayer;
  counts: Partial<Record<MapHydricStatus, number>>;
  dates?: string[];
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
  demand?: { needing: number; total: number; highestName: string | null };
  attribution?: string | null;
}) {
  if (layer === "manejo") {
    return (
      <HydricMapLegend
        counts={counts}
        dates={dates}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        demand={demand}
      />
    );
  }

  const swatches = layer === "chuva" ? RAIN_SWATCHES : layer === "orbital" ? ORBITAL_SWATCHES : COST_SWATCHES;
  const title =
    layer === "chuva"
      ? "Chuva observada · 7 dias"
      : layer === "orbital"
        ? "Umidade orbital 0–7 cm (não é %CC)"
        : "Custo R$/ha · 30 dias (relativo à fazenda)";

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-graphite-900">
      {layer === "chuva" && dates && dates.length > 0 && onSelectDate ? (
        <DateChips dates={dates} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      ) : null}
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {swatches.map((s) => (
          <Swatch key={s.label} color={s.color} label={s.label} />
        ))}
      </div>
      {attribution ? (
        <p className="mt-2 text-[11px] leading-relaxed text-graphite-400 dark:text-gray-500">{attribution}</p>
      ) : null}
    </div>
  );
}
