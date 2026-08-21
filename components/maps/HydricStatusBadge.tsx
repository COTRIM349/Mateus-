"use client";

import {
  MAP_HYDRIC_STATUS_CONFIG,
  type MapHydricStatus,
} from "@/modules/water-balance/services";

export function HydricStatusBadge({
  status,
  className = "",
}: {
  status: MapHydricStatus;
  className?: string;
}) {
  const conf = MAP_HYDRIC_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold ${className}`}
      style={{ backgroundColor: conf.color, color: conf.onColor }}
    >
      {conf.label}
    </span>
  );
}
