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
import { deficitPorPivo } from "@/lib/mock-data";

/** Gráfico de barras: déficit hídrico (mm) por pivô. */
export function DeficitPorPivoChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={deficitPorPivo} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
        <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} unit=" mm" />
        <Tooltip
          cursor={{ fill: "rgba(30,168,91,0.06)" }}
          formatter={(v: number) => [`${v} mm`, "Déficit"]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="valor" fill="#1ea85b" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
