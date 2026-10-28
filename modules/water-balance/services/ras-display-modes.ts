/**
 * Três leituras de UM único balanço diário FAO-56.
 * NÃO modifica o motor: ARM/CTA/AFD permanecem em mm de água disponível.
 * CC e PMP são frações volumétricas já normalizadas no cadastro.
 *
 * %peso = 100 × (volume de água / massa de solo seco relativa).
 * Em perfil estratificado: soma(theta_i × espessura_i) /
 *                         soma(Ds_i × espessura_i).
 * O motor guarda um ARM agregado, não um sensor por camada. Portanto, a
 * conversão por camada distribui a mesma fração ARM/CTA em cada horizonte;
 * trata-se de uma equivalência calculada, não de leitura gravimétrica medida.
 */
import type { RasPoint } from "./ras-panel-model";
import type { SoilProfileLayer } from "@/modules/soil/services/soil-profile";
import { clipLayersToRootDepth } from "@/modules/soil/services/soil-profile";

export type RasDisplayUnit = "cc" | "mm" | "weight";

export interface RasDisplayPoint {
  date: string;
  current: number;
  capacity: number;
  safety: number;
  pmp: number;
}

const safe = (value: number) => Number.isFinite(value);
const usableDensity = (density: number | null | undefined): density is number =>
  density != null && safe(density) && density > 0 && density <= 2.65;

function gravimetricProfile(
  point: RasPoint,
  soilLayers: SoilProfileLayer[],
  bulkDensity: number | null | undefined,
): { current: number; capacity: number; safety: number; pmp: number } | null {
  if (!safe(point.rootDepth) || point.rootDepth <= 0 || point.ctaMm <= 0) return null;

  // Mesmo denominador da disponibilidade diária do motor.
  const remaining = Math.min(Math.max(point.armMm / point.ctaMm, 0), 1);
  const safetyRemaining = Math.min(Math.max(1 - point.afdMm / point.ctaMm, 0), 1);

  if (soilLayers.length > 0) {
    const clipped = clipLayersToRootDepth(soilLayers, point.rootDepth)
      .sort((a, b) => a.depth_start - b.depth_start);
    let coveredCm = 0;
    let massWeight = 0, ccWater = 0, pmpWater = 0;
    for (const layer of clipped) {
      // Não completar lacunas de amostragem nem adivinhar densidade ausente.
      if (!usableDensity(layer.bulk_density)
          || !safe(layer.field_capacity) || !safe(layer.wilting_point)
          || layer.field_capacity <= layer.wilting_point
          || layer.wilting_point < 0 || layer.field_capacity > 1
          || layer.depth_start > coveredCm + 0.01
          || layer.depth_end <= layer.depth_start) return null;
      const thickness = layer.depth_end - layer.depth_start;
      ccWater += layer.field_capacity * thickness;
      pmpWater += layer.wilting_point * thickness;
      massWeight += layer.bulk_density * thickness;
      coveredCm = layer.depth_end;
    }
    if (massWeight <= 0 || coveredCm < point.rootDepth * 100 - 0.01) return null;
    const pmp = 100 * pmpWater / massWeight;
    const delta = 100 * (ccWater - pmpWater) / massWeight;
    return {
      current: pmp + delta * remaining,
      capacity: pmp + delta,
      safety: pmp + delta * safetyRemaining,
      pmp,
    };
  }

  if (!usableDensity(bulkDensity)
      || !safe(point.fieldCapacity) || !safe(point.wiltingPoint)
      || point.fieldCapacity <= point.wiltingPoint
      || point.fieldCapacity > 1 || point.wiltingPoint < 0) return null;
  const pmp = 100 * point.wiltingPoint / bulkDensity;
  const delta = 100 * (point.fieldCapacity - point.wiltingPoint) / bulkDensity;
  return {
    current: pmp + delta * remaining,
    capacity: pmp + delta,
    safety: pmp + delta * safetyRemaining,
    pmp,
  };
}

/** Retorna null para %peso quando o solo não possui densidade válida. */
export function rasDisplayPoint(
  point: RasPoint,
  unit: RasDisplayUnit,
  soilLayers: SoilProfileLayer[] = [],
  bulkDensity: number | null | undefined = null,
): RasDisplayPoint | null {
  if (unit === "cc") return {
    date: point.date, current: point.ccPercent, capacity: 100,
    safety: point.limitPercentCc, pmp: point.pmpPercentCc,
  };
  if (unit === "mm") return {
    date: point.date, current: point.armMm, capacity: point.ctaMm,
    safety: Math.max(0, point.ctaMm - point.afdMm), pmp: 0,
  };
  const weight = gravimetricProfile(point, soilLayers, bulkDensity);
  return weight == null ? null : { date: point.date, ...weight };
}

export function rasDisplaySeries(
  points: RasPoint[],
  unit: RasDisplayUnit,
  soilLayers: SoilProfileLayer[] = [],
  bulkDensity: number | null | undefined = null,
): RasDisplayPoint[] | null {
  const series = points.map((point) => rasDisplayPoint(point, unit, soilLayers, bulkDensity));
  // Não ocultar silenciosamente datas quando faltar densidade em uma camada.
  return series.some((value) => value == null) ? null : series as RasDisplayPoint[];
}

export const RAS_UNITS: Record<RasDisplayUnit, { name: string; axis: string; digits: number }> = {
  cc: { name: "Umidade do Solo (%CC)", axis: "% CC", digits: 1 },
  mm: { name: "Água disponível (ARM mm)", axis: "mm", digits: 1 },
  weight: { name: "Umidade do Solo (% em peso)", axis: "% peso", digits: 2 },
};
