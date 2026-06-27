"use client";

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatNumber } from "@/utils/format";
import type { ChartDataPoint } from "@/modules/dashboard/services";

export function EnergiaPorCulturaChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradEnergia" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1ea85b" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#1ea85b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
        <Tooltip
          formatter={(v: number) => [`${formatNumber(v)} kWh`, "Energia"]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Area type="monotone" dataKey="value" stroke="#1ea85b" strokeWidth={2} fill="url(#gradEnergia)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
