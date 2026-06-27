"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { volumePorModulo } from "@/lib/mock-data";
import { formatNumber } from "@/lib/format";

/** Cores por fatia (módulos). */
const cores = ["#1ea85b", "#41c478", "#116b3b"];

/** Gráfico de pizza: volume aplicado (m³) por módulo. */
export function VolumePorModuloChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={volumePorModulo}
          dataKey="valor"
          nameKey="rotulo"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
        >
          {volumePorModulo.map((_, i) => (
            <Cell key={i} fill={cores[i % cores.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => [`${formatNumber(v)} m³`, "Volume"]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Legend
          verticalAlign="bottom"
          height={28}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
