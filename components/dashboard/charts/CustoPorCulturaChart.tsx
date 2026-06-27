"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { custoPorCultura } from "@/lib/mock-data";
import { formatBRL } from "@/lib/format";

/** Gráfico de barras: custo estimado (R$) por cultura. */
export function CustoPorCulturaChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={custoPorCultura} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
        <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          cursor={{ fill: "rgba(30,168,91,0.06)" }}
          formatter={(v: number) => [formatBRL(v), "Custo"]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="valor" fill="#138647" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
