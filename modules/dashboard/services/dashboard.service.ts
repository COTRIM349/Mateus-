/**
 * Service do Dashboard.
 *
 * Agrega métricas dos pivôs e gera os conjuntos de dados para
 * os cards e gráficos. Não faz cálculos agronômicos — delega
 * para os services de irrigação, energia e custos.
 */

import { average, sum, roundTo } from "@/utils/math";
import { formatBRL, formatNumber } from "@/utils/format";
import type { PivotIrrigationRecommendation } from "@/types/domain/pivot";

export interface DashboardMetric {
  id: string;
  title: string;
  value: string;
  description: string;
  variation?: string;
  trend?: "positive" | "negative" | "neutral";
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export function buildDashboardMetrics(
  recs: PivotIrrigationRecommendation[],
): DashboardMetric[] {
  const active = recs.filter((r) => r.status === "irrigando").length;
  const avgDeficit = average(recs.map((r) => r.deficit));
  const avgDepth = average(recs.map((r) => r.recommendedDepth));
  const totalVolume = sum(recs.map((r) => r.volume));
  const totalEnergy = sum(recs.map((r) => r.energy));
  const totalCost = sum(recs.map((r) => r.cost));
  const criticalAlerts = recs.filter(
    (r) => r.status === "alerta" || r.productiveRisk >= 75,
  ).length;
  const avgRisk = Math.round(average(recs.map((r) => r.productiveRisk)));

  return [
    {
      id: "active-pivots",
      title: "Pivôs ativos",
      value: `${active}/${recs.length}`,
      description: "Irrigando neste momento",
      variation: "+2 vs ontem",
      trend: "positive",
    },
    {
      id: "avg-deficit",
      title: "Déficit médio",
      value: `${formatNumber(avgDeficit, 1)} mm`,
      description: "Média entre todos os pivôs",
      variation: "+1,3 mm vs ontem",
      trend: "negative",
    },
    {
      id: "recommended-depth",
      title: "Lâmina recomendada hoje",
      value: `${formatNumber(avgDepth, 1)} mm`,
      description: "Média recomendada para hoje",
      trend: "neutral",
    },
    {
      id: "total-volume",
      title: "Volume necessário",
      value: `${formatNumber(totalVolume)} m³`,
      description: "Demanda hídrica total do dia",
      trend: "neutral",
    },
    {
      id: "total-energy",
      title: "Energia estimada",
      value: `${formatNumber(totalEnergy)} kWh`,
      description: "Consumo previsto para hoje",
      variation: "+4% vs ontem",
      trend: "negative",
    },
    {
      id: "total-cost",
      title: "Custo estimado",
      value: formatBRL(totalCost),
      description: "Custo operacional do dia",
      trend: "neutral",
    },
    {
      id: "critical-alerts",
      title: "Alertas críticos",
      value: `${criticalAlerts}`,
      description: "Pivôs exigindo atenção imediata",
      variation: "+1 vs ontem",
      trend: "negative",
    },
    {
      id: "productive-risk",
      title: "Risco produtivo",
      value: `${avgRisk}%`,
      description: "Índice médio de risco à produção",
      trend: avgRisk >= 50 ? "negative" : "positive",
    },
  ];
}

export function buildDeficitByPivot(
  recs: PivotIrrigationRecommendation[],
): ChartDataPoint[] {
  return recs.map((r) => ({ label: r.pivotId, value: r.deficit }));
}

export function buildCostByCulture(
  recs: PivotIrrigationRecommendation[],
  cultures: readonly string[],
): ChartDataPoint[] {
  return cultures.map((culture) => ({
    label: culture,
    value: roundTo(
      sum(recs.filter((r) => r.cultureName === culture).map((r) => r.cost)),
      0,
    ),
  }));
}

export function buildVolumeByModule(
  recs: PivotIrrigationRecommendation[],
  modules: readonly string[],
): ChartDataPoint[] {
  return modules.map((mod) => ({
    label: mod,
    value: roundTo(
      sum(recs.filter((r) => r.moduleName === mod).map((r) => r.volume)),
      0,
    ),
  }));
}

export function buildEnergyByCulture(
  recs: PivotIrrigationRecommendation[],
  cultures: readonly string[],
): ChartDataPoint[] {
  return cultures.map((culture) => ({
    label: culture,
    value: roundTo(
      sum(recs.filter((r) => r.cultureName === culture).map((r) => r.energy)),
      0,
    ),
  }));
}
