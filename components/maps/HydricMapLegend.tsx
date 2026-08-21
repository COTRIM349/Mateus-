"use client";

import { useState } from "react";
import {
  MAP_HYDRIC_LEGEND_ORDER,
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
} from "@/modules/water-balance/services";

export function HydricMapLegend({
  counts,
}: {
  counts: Partial<Record<MapHydricStatus, number>>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[500] max-w-[240px]">
      <div className="rounded-2xl border border-white/10 bg-graphite-950/85 px-3 py-2 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300"
        >
          Legenda
          <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-500">
            {open ? "recolher" : "expandir"}
          </span>
        </button>
        {open ? (
          <ul className="mt-2 space-y-1.5">
            {MAP_HYDRIC_LEGEND_ORDER.map((status) => {
              const conf = MAP_HYDRIC_STATUS_CONFIG[status];
              return (
                <li key={status} className="flex items-center gap-2 text-[11px] text-gray-200">
                  <span
                    className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-white/15"
                    style={{ backgroundColor: conf.color }}
                  />
                  <span className="flex-1">{conf.label}</span>
                  <span className="tabular-nums text-gray-500">{counts[status] ?? 0}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
