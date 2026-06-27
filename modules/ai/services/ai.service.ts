/**
 * Service da Cotrim AI.
 *
 * Nesta etapa, a IA retorna recomendações fixas (sem chamada externa).
 * Futuramente este service fará interface com o modelo de IA real.
 */

import type { PivotIrrigationRecommendation } from "@/types/domain/pivot";

export interface AIRecommendation {
  summary: string;
  prioritizedPivots: string[];
  deferredPivots: Array<{ id: string; reason: string; safeHours: number }>;
  generatedAt: Date;
}

/**
 * Gera uma recomendação simulada com base nas métricas dos pivôs.
 */
export function generateRecommendation(
  recommendations: PivotIrrigationRecommendation[],
): AIRecommendation {
  const highPriority = recommendations
    .filter((r) => r.priority === "alta")
    .sort((a, b) => b.productiveRisk - a.productiveRisk);

  const lowPriority = recommendations
    .filter((r) => r.priority === "baixa" && r.deficit < 5)
    .sort((a, b) => a.deficit - b.deficit);

  const prioritizedIds = highPriority.map((r) => r.pivotId);
  const deferred = lowPriority.map((r) => ({
    id: r.pivotId,
    reason: `Baixo déficit (${r.deficit.toFixed(1)} mm)`,
    safeHours: Math.round((5 - r.deficit) * 8),
  }));

  const priorityNames = prioritizedIds.join(", ");
  const deferredNames = deferred.map((d) => d.id).join(", ");

  let summary = "";
  if (prioritizedIds.length > 0) {
    summary += `Priorizar ${priorityNames}. Eles apresentam maior déficit hídrico e maior risco produtivo.`;
  }
  if (deferred.length > 0) {
    summary += ` Adiar ${deferredNames} por 24 horas é seguro devido ao baixo déficit.`;
  }
  if (!summary) {
    summary = "Todos os pivôs estão dentro dos parâmetros normais de operação.";
  }

  return {
    summary: summary.trim(),
    prioritizedPivots: prioritizedIds,
    deferredPivots: deferred,
    generatedAt: new Date(),
  };
}
