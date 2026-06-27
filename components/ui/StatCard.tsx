import { Card } from "./Card";
import { cn } from "@/lib/format";
import type { MetricaDashboard } from "@/lib/types";

/** Cores do indicador de variação conforme a tendência. */
const tendenciaClasse: Record<NonNullable<MetricaDashboard["tendencia"]>, string> = {
  positiva: "text-brand-600",
  negativa: "text-red-600",
  neutra: "text-gray-500",
};

/**
 * Card de métrica do dashboard (ex.: Pivôs ativos, Déficit médio).
 */
export function StatCard({ metrica }: { metrica: MetricaDashboard }) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-500">{metrica.titulo}</p>
      <p className="text-2xl font-bold text-graphite-900">{metrica.valor}</p>
      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-gray-400">{metrica.descricao}</span>
        {metrica.variacao && (
          <span
            className={cn(
              "text-xs font-semibold",
              tendenciaClasse[metrica.tendencia ?? "neutra"],
            )}
          >
            {metrica.variacao}
          </span>
        )}
      </div>
    </Card>
  );
}
