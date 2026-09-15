import { roundTo } from "@/utils/math";
import {
  normalizeCcPmpInput,
  type SoilProfileLayer,
  type SoilWaterContentBasis,
} from "./soil-profile";

export type PivotSoilCcPmpUnit = "gravimetric_pct" | "volumetric_pct";

export interface PivotSoilRegistryRow {
  pivot_id: string;
  soil_class: string | null;
  cc_pmp_unit: PivotSoilCcPmpUnit | null;
}

export interface PivotSoilRegistryLayerRow {
  pivot_id: string;
  layer_number: number;
  thickness_m: number | null;
  field_capacity_pct: number | null;
  wilting_point_pct: number | null;
  bulk_density_g_cm3: number | null;
}

/** Perfil canônico consumido pelo motor hídrico. */
export interface OperationalPivotSoil {
  id: string;
  name: string;
  field_capacity: number;
  wilting_point: number;
  bulk_density: number | null;
  effective_depth: number;
  layers: SoilProfileLayer[];
}

function finitePositive(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * Converte o cadastro físico 1:1 do pivô para o formato do motor.
 *
 * Nenhum valor é estimado: unidade, espessura, CC, PMP e densidade precisam
 * estar informados em todas as camadas. Perfil parcial retorna null e permanece
 * visível como cadastro incompleto, sem gerar uma recomendação hídrica falsa.
 */
export function buildOperationalPivotSoil(
  profile: PivotSoilRegistryRow | null | undefined,
  sourceLayers: PivotSoilRegistryLayerRow[],
): OperationalPivotSoil | null {
  if (!profile?.cc_pmp_unit || sourceLayers.length === 0) return null;

  const basis: SoilWaterContentBasis = profile.cc_pmp_unit;
  const sorted = [...sourceLayers]
    .filter((layer) => layer.pivot_id === profile.pivot_id)
    .sort((a, b) => a.layer_number - b.layer_number);

  if (sorted.length === 0) return null;

  const layers: SoilProfileLayer[] = [];
  let depthStartCm = 0;
  let weightedFieldCapacity = 0;
  let weightedWiltingPoint = 0;
  let weightedBulkDensity = 0;
  let hasCompleteBulkDensity = true;
  let totalThicknessCm = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const layer = sorted[index];
    if (layer.layer_number !== index + 1) return null;
    if (!finitePositive(layer.thickness_m)) return null;
    if (basis.startsWith("gravimetric") && !finitePositive(layer.bulk_density_g_cm3)) return null;
    if (layer.field_capacity_pct == null || layer.wilting_point_pct == null) return null;

    const normalized = normalizeCcPmpInput({
      fieldCapacity: layer.field_capacity_pct,
      wiltingPoint: layer.wilting_point_pct,
      basis,
      bulkDensity: layer.bulk_density_g_cm3,
    });
    if (!normalized) return null;

    const thicknessCm = layer.thickness_m * 100;
    const depthEndCm = depthStartCm + thicknessCm;
    layers.push({
      depth_start: roundTo(depthStartCm, 4),
      depth_end: roundTo(depthEndCm, 4),
      field_capacity: normalized.fieldCapacity,
      wilting_point: normalized.wiltingPoint,
      bulk_density: layer.bulk_density_g_cm3,
      kl: null,
    });

    weightedFieldCapacity += normalized.fieldCapacity * thicknessCm;
    weightedWiltingPoint += normalized.wiltingPoint * thicknessCm;
    if (finitePositive(layer.bulk_density_g_cm3)) {
      weightedBulkDensity += layer.bulk_density_g_cm3 * thicknessCm;
    } else {
      hasCompleteBulkDensity = false;
    }
    totalThicknessCm += thicknessCm;
    depthStartCm = depthEndCm;
  }

  if (totalThicknessCm <= 0) return null;

  return {
    id: profile.pivot_id,
    name: profile.soil_class?.trim() || "Solo do pivô",
    field_capacity: roundTo(weightedFieldCapacity / totalThicknessCm, 4),
    wilting_point: roundTo(weightedWiltingPoint / totalThicknessCm, 4),
    bulk_density: hasCompleteBulkDensity
      ? roundTo(weightedBulkDensity / totalThicknessCm, 4)
      : null,
    effective_depth: roundTo(totalThicknessCm / 100, 4),
    layers,
  };
}
