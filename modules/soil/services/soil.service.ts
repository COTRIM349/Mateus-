import { roundTo } from "@/utils/math";

// ── Types ─────────────────────────────────────────────────────────────────

export type SoilTexture =
  | "arenoso"
  | "franco-arenoso"
  | "franco"
  | "franco-argiloso"
  | "argiloso"
  | "muito-argiloso";

export interface SoilParams {
  field_capacity: number;
  wilting_point: number;
  effective_depth: number;
  depletion_factor?: number;
}

export interface LayerParams {
  depth_start: number;
  depth_end: number;
  field_capacity: number;
  wilting_point: number;
  depletion_factor?: number;
}

export interface SoilValidation {
  field: string;
  level: "error" | "warning";
  message: string;
}

// ── Texture validation ───────────────────────────────────────────────────

const VALID_TEXTURES: SoilTexture[] = [
  "arenoso",
  "franco-arenoso",
  "franco",
  "franco-argiloso",
  "argiloso",
  "muito-argiloso",
];

const TEXTURE_DENSITY_RANGES: Record<SoilTexture, [number, number]> = {
  "arenoso":          [1.40, 1.80],
  "franco-arenoso":   [1.30, 1.70],
  "franco":           [1.20, 1.60],
  "franco-argiloso":  [1.10, 1.50],
  "argiloso":         [1.00, 1.45],
  "muito-argiloso":   [0.90, 1.35],
};

const TEXTURE_CC_RANGES: Record<SoilTexture, [number, number]> = {
  "arenoso":          [0.06, 0.18],
  "franco-arenoso":   [0.10, 0.25],
  "franco":           [0.18, 0.35],
  "franco-argiloso":  [0.25, 0.40],
  "argiloso":         [0.30, 0.45],
  "muito-argiloso":   [0.35, 0.55],
};

export function isValidTexture(texture: string): texture is SoilTexture {
  return VALID_TEXTURES.includes(texture as SoilTexture);
}

export function inferTextureFromGranulometry(
  sand: number,
  silt: number,
  clay: number
): SoilTexture {
  if (clay >= 60) return "muito-argiloso";
  if (clay >= 35) return "argiloso";
  if (clay >= 25 && sand < 45) return "franco-argiloso";
  if (sand >= 70) return "arenoso";
  if (sand >= 50) return "franco-arenoso";
  return "franco";
}

// ── CAD / AFD calculations ───────────────────────────────────────────────

export function calculateCAD(params: SoilParams): number {
  const { field_capacity, wilting_point, effective_depth } = params;
  return roundTo((field_capacity - wilting_point) * effective_depth * 1000, 2);
}

export function calculateAFD(cad: number, depletionFactor: number = 0.5): number {
  return roundTo(cad * depletionFactor, 2);
}

export function calculateMaxStorage(params: SoilParams): number {
  return roundTo(params.field_capacity * params.effective_depth * 1000, 2);
}

// ── Layer calculations ───────────────────────────────────────────────────

export function calculateLayerDepthM(layer: LayerParams): number {
  return (layer.depth_end - layer.depth_start) / 100;
}

export function calculateLayerCAD(layer: LayerParams): number {
  const depthM = calculateLayerDepthM(layer);
  return roundTo((layer.field_capacity - layer.wilting_point) * depthM * 1000, 2);
}

export function calculateLayerAFD(layer: LayerParams): number {
  const cad = calculateLayerCAD(layer);
  return roundTo(cad * (layer.depletion_factor ?? 0.5), 2);
}

export function calculateLayerAvailableWater(layer: LayerParams): number {
  const depthM = calculateLayerDepthM(layer);
  return roundTo((layer.field_capacity - layer.wilting_point) * depthM * 1000, 2);
}

export function calculateLayerMaxStorage(layer: LayerParams): number {
  const depthM = calculateLayerDepthM(layer);
  return roundTo(layer.field_capacity * depthM * 1000, 2);
}

export function calculateTotalCADFromLayers(layers: LayerParams[]): number {
  return roundTo(layers.reduce((sum, l) => sum + calculateLayerCAD(l), 0), 2);
}

export function calculateTotalAFDFromLayers(
  layers: LayerParams[],
  depletionFactor: number = 0.5
): number {
  const totalCAD = calculateTotalCADFromLayers(layers);
  return roundTo(totalCAD * depletionFactor, 2);
}

// ── Validations ──────────────────────────────────────────────────────────

export function validateSoil(soil: {
  texture: string;
  field_capacity: number;
  wilting_point: number;
  bulk_density: number;
  sand_pct: number;
  silt_pct: number;
  clay_pct: number;
  effective_depth: number;
  infiltration_rate: number;
}): SoilValidation[] {
  const issues: SoilValidation[] = [];

  if (!isValidTexture(soil.texture)) {
    issues.push({ field: "texture", level: "error", message: "Classe textural inválida" });
  }

  if (soil.field_capacity <= soil.wilting_point) {
    issues.push({ field: "field_capacity", level: "error", message: "Capacidade de campo deve ser maior que o PMP" });
  }

  if (soil.bulk_density <= 0) {
    issues.push({ field: "bulk_density", level: "error", message: "Densidade deve ser positiva" });
  }

  const granSum = soil.sand_pct + soil.silt_pct + soil.clay_pct;
  if (granSum > 0 && (granSum < 99.5 || granSum > 100.5)) {
    issues.push({ field: "sand_pct", level: "error", message: `Soma granulométrica deve ser 100% (atual: ${roundTo(granSum, 1)}%)` });
  }

  if (soil.effective_depth <= 0) {
    issues.push({ field: "effective_depth", level: "error", message: "Profundidade efetiva deve ser positiva" });
  }

  if (soil.infiltration_rate < 0) {
    issues.push({ field: "infiltration_rate", level: "error", message: "Taxa de infiltração não pode ser negativa" });
  }

  if (isValidTexture(soil.texture) && soil.bulk_density > 0) {
    const [dMin, dMax] = TEXTURE_DENSITY_RANGES[soil.texture];
    if (soil.bulk_density < dMin || soil.bulk_density > dMax) {
      issues.push({
        field: "bulk_density",
        level: "warning",
        message: `Densidade ${soil.bulk_density} fora do esperado para ${soil.texture} (${dMin}–${dMax} g/cm³)`,
      });
    }
  }

  if (isValidTexture(soil.texture) && soil.field_capacity > 0) {
    const [ccMin, ccMax] = TEXTURE_CC_RANGES[soil.texture];
    if (soil.field_capacity < ccMin || soil.field_capacity > ccMax) {
      issues.push({
        field: "field_capacity",
        level: "warning",
        message: `CC ${soil.field_capacity} fora do esperado para ${soil.texture} (${ccMin}–${ccMax})`,
      });
    }
  }

  return issues;
}

export function validateLayers(
  layers: { depth_start: number; depth_end: number; field_capacity: number; wilting_point: number }[]
): SoilValidation[] {
  const issues: SoilValidation[] = [];

  if (layers.length === 0) {
    return issues;
  }

  const sorted = [...layers].sort((a, b) => a.depth_start - b.depth_start);

  for (let i = 0; i < sorted.length; i++) {
    const layer = sorted[i];

    if (layer.depth_end <= layer.depth_start) {
      issues.push({
        field: `layer_${i}`,
        level: "error",
        message: `Camada ${layer.depth_start}–${layer.depth_end} cm: fim deve ser maior que início`,
      });
    }

    if (layer.field_capacity <= layer.wilting_point) {
      issues.push({
        field: `layer_${i}_cc`,
        level: "error",
        message: `Camada ${layer.depth_start}–${layer.depth_end} cm: CC deve ser maior que PMP`,
      });
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (layer.depth_start < prev.depth_end) {
        issues.push({
          field: `layer_${i}_overlap`,
          level: "error",
          message: `Camada ${layer.depth_start}–${layer.depth_end} cm sobrepõe a camada ${prev.depth_start}–${prev.depth_end} cm`,
        });
      }
      if (layer.depth_start > prev.depth_end) {
        issues.push({
          field: `layer_${i}_gap`,
          level: "warning",
          message: `Intervalo sem cobertura entre ${prev.depth_end} cm e ${layer.depth_start} cm`,
        });
      }
    }
  }

  return issues;
}
