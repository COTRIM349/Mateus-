/**
 * CTA/CAD e CRA/AFD na zona radicular efetiva (Zr).
 * Camada parcialmente explorada usa só a fração com raiz — nunca a espessura total.
 */

import { calculateDtaMmPerCm } from "./dta";
import { missingValue, traced, type MoistureUnit, type TraceableValue } from "./trace";

export const CTA_FORMULA = "CTA_camada = DTA × espessura explorada (cm)";
export const CRA_FORMULA = "CRA = CTA × FD";

export interface AgronomicLayerInput {
  depthStartCm: number;
  depthEndCm: number;
  cc: number | null;
  pmp: number | null;
  bulkDensity?: number | null;
  clayPct?: number | null;
  sandPct?: number | null;
  siltPct?: number | null;
  texture?: string | null;
  infiltrationRate?: number | null;
}

export interface LayerStorageResult {
  label: string;
  depthStartCm: number;
  depthEndCm: number;
  exploredCm: number;
  dta: TraceableValue;
  cta: TraceableValue;
}

export interface RootZoneStorage {
  zrCm: TraceableValue;
  zrMaxCm: TraceableValue;
  zrMethod: string;
  dtaMean: TraceableValue;
  cta: TraceableValue;
  fd: TraceableValue;
  cra: TraceableValue;
  layers: LayerStorageResult[];
  missing: string[];
}

function exploredThicknessCm(layer: AgronomicLayerInput, zrCm: number): number {
  if (zrCm <= layer.depthStartCm) return 0;
  if (layer.depthEndCm <= layer.depthStartCm) return 0;
  return Math.min(layer.depthEndCm, zrCm) - layer.depthStartCm;
}

export function calculateRootZoneStorage(input: {
  layers: AgronomicLayerInput[];
  unit: MoistureUnit;
  zrCm: number | null;
  zrMaxCm?: number | null;
  zrMethod?: string | null;
  fd: number | null;
  homogeneous?: {
    cc: number | null;
    pmp: number | null;
    bulkDensity?: number | null;
    effectiveDepthCm: number | null;
  };
}): RootZoneStorage {
  const missing: string[] = [];
  const zrMethod = input.zrMethod ?? "não informado";

  if (input.zrCm == null || !Number.isFinite(input.zrCm) || input.zrCm <= 0) {
    missing.push("Zr (profundidade radicular efetiva)");
  }
  if (input.fd == null || !Number.isFinite(input.fd)) {
    missing.push("FD (fator de disponibilidade)");
  } else if (input.fd <= 0 || input.fd >= 1) {
    missing.push("FD deve estar em (0, 1)");
  }

  const zrCm = input.zrCm != null && input.zrCm > 0 ? input.zrCm : null;
  const zrTrace = zrCm == null
    ? missingValue(["Zr"], "cm", "Zr = profundidade radicular efetiva", "cultura/parcela")
    : traced(zrCm, "cm", "Zr efetiva no dia", { Zr: zrCm, método: zrMethod }, "cultura/parcela");

  const zrMaxTrace = input.zrMaxCm != null && input.zrMaxCm > 0
    ? traced(input.zrMaxCm, "cm", "Zr máxima cadastrada", { Zr_max: input.zrMaxCm }, "cultura/parcela")
    : missingValue(["Zr máxima"], "cm", "Zr máxima", "cultura");

  const fdTrace = input.fd != null && input.fd > 0 && input.fd < 1
    ? traced(input.fd, "adimensional", "FD = p (fator de disponibilidade de manejo)", { FD: input.fd }, "cultura/fase/parcela")
    : missingValue(["FD"], "adimensional", "FD = p", "cultura/fase/parcela");

  const layerResults: LayerStorageResult[] = [];
  let ctaSum = 0;
  let exploredSum = 0;
  let anyDtaMissing = false;

  const layers = input.layers.length > 0
    ? input.layers
    : input.homogeneous
      ? [{
          depthStartCm: 0,
          depthEndCm: input.homogeneous.effectiveDepthCm ?? 0,
          cc: input.homogeneous.cc,
          pmp: input.homogeneous.pmp,
          bulkDensity: input.homogeneous.bulkDensity,
        }]
      : [];

  if (layers.length === 0) missing.push("perfil de solo (camadas ou homogeneizado)");

  if (zrCm != null) {
    for (const layer of layers) {
      const exploredCm = exploredThicknessCm(layer, zrCm);
      const dta = calculateDtaMmPerCm({
        cc: layer.cc,
        pmp: layer.pmp,
        bulkDensity: layer.bulkDensity,
        unit: input.unit,
        source: `solo ${layer.depthStartCm}–${layer.depthEndCm} cm`,
      });
      const label = `${layer.depthStartCm}–${Math.min(layer.depthEndCm, zrCm)} cm`;
      if (exploredCm <= 0) {
        layerResults.push({
          label: `${layer.depthStartCm}–${layer.depthEndCm} cm (não explorada)`,
          depthStartCm: layer.depthStartCm,
          depthEndCm: layer.depthEndCm,
          exploredCm: 0,
          dta,
          cta: traced(0, "mm", CTA_FORMULA, { explorada_cm: 0 }, "solo"),
        });
        continue;
      }
      if (dta.value == null) {
        anyDtaMissing = true;
        layerResults.push({
          label,
          depthStartCm: layer.depthStartCm,
          depthEndCm: Math.min(layer.depthEndCm, zrCm),
          exploredCm,
          dta,
          cta: missingValue(dta.missing, "mm", CTA_FORMULA, "solo"),
        });
        continue;
      }
      const ctaLayer = dta.value * exploredCm;
      ctaSum += ctaLayer;
      exploredSum += exploredCm;
      layerResults.push({
        label,
        depthStartCm: layer.depthStartCm,
        depthEndCm: Math.min(layer.depthEndCm, zrCm),
        exploredCm,
        dta,
        cta: traced(ctaLayer, "mm", CTA_FORMULA, {
          DTA: dta.value,
          espessura_cm: exploredCm,
        }, "solo"),
      });
    }
  }

  const ctaTrace = zrCm == null || anyDtaMissing || layers.length === 0
    ? missingValue(
        missing.length ? missing : ["DTA/Zr"],
        "mm",
        "CTA = Σ (DTA × cm explorados)",
        "solo + raiz",
      )
    : traced(ctaSum, "mm", "CTA = Σ (DTA × cm explorados)", {
        CTA: ctaSum,
        Zr_cm: zrCm,
        camadas: layerResults.length,
      }, "solo + raiz");

  const dtaMean = ctaTrace.value != null && exploredSum > 0
    ? traced(ctaSum / exploredSum, "mm/cm", "DTA médio = CTA / Zr explorada", {
        CTA: ctaSum,
        cm: exploredSum,
      }, "solo")
    : missingValue(["CTA", "Zr"], "mm/cm", "DTA médio", "solo");

  const craTrace = ctaTrace.value != null && fdTrace.value != null
    ? traced(ctaTrace.value * fdTrace.value, "mm", CRA_FORMULA, {
        CTA: ctaTrace.value,
        FD: fdTrace.value,
      }, "solo + manejo")
    : missingValue(
        [...(ctaTrace.missing.length ? ctaTrace.missing : []), ...(fdTrace.missing.length ? fdTrace.missing : ["FD"])],
        "mm",
        CRA_FORMULA,
        "solo + manejo",
      );

  return {
    zrCm: zrTrace,
    zrMaxCm: zrMaxTrace,
    zrMethod,
    dtaMean,
    cta: ctaTrace,
    fd: fdTrace,
    cra: craTrace,
    layers: layerResults,
    missing: Array.from(new Set([...missing, ...ctaTrace.missing, ...craTrace.missing])),
  };
}
