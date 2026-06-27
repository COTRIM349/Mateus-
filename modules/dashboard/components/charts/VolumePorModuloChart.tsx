"use client";

import {
  Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";
import { formatNumber } from "@/utils/format";
import { colors } from "@/constants/design-system";
import type { ChartDataPoint } from "@/modules/dashboard/services";

export function VolumePorModuloChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors.chart[i % colors.chart.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => [`${formatNumber(v)} m³`, "Volume"]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
