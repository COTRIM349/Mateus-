import { describe, expect, it } from "vitest";
import { calculateLayerCAD } from "./soil.service";
import {
  DEFAULT_CENTER_PIVOT_KL,
  SOIL_UNITS,
  calculateADTFromLayers,
  cadAfdFromMoistureUnit,
  clipLayersToRootDepth,
  resolveLayerKl,
  soilProfileIsUsable,
  volumetricFromGravimetric,
  weightedKlFromLayers,
  type SoilProfileLayer,
} from "./soil-profile";

const PROFILE: SoilProfileLayer[] = [
  { depth_start: 0, depth_end: 20, field_capacity: 0.3, wilting_point: 0.12, kl: null },
  { depth_start: 20, depth_end: 40, field_capacity: 0.28, wilting_point: 0.14, kl: 0.8 },
  { depth_start: 40, depth_end: 60, field_capacity: 0.26, wilting_point: 0.15, kl: 0.7 },
];

describe("unidades do perfil", () => {
  it("documenta CC/PMP volumétricos, Da em g/cm³ e CAD em mm", () => {
    expect(SOIL_UNITS.fieldCapacity).toBe("cm³/cm³");
    expect(SOIL_UNITS.wiltingPoint).toBe("cm³/cm³");
    expect(SOIL_UNITS.bulkDensity).toBe("g/cm³");
    expect(SOIL_UNITS.cad).toBe("mm");
    expect(SOIL_UNITS.kl).toContain("0–1");
  });
});

describe("volumetricFromGravimetric", () => {
  it("converte θg × Da de forma explícita (nunca silenciosa)", () => {
    expect(volumetricFromGravimetric(0.2, 1.3)).toBe(0.26);
  });

  it("rejeita densidade ou umidade inválidas", () => {
    expect(volumetricFromGravimetric(0.2, 0)).toBe(0);
    expect(volumetricFromGravimetric(-0.1, 1.3)).toBe(0);
  });
});

describe("KL de pivô central", () => {
  it("trata null/undefined como 1", () => {
    expect(resolveLayerKl(null)).toBe(DEFAULT_CENTER_PIVOT_KL);
    expect(resolveLayerKl(undefined)).toBe(1);
    expect(resolveLayerKl(0.6)).toBe(0.6);
  });

  it("pondera pela espessura recortada em Z e usa 1 nas camadas sem KL", () => {
    // Z = 0,30 m → 0–20 (KL=1) + 20–30 (KL=0,8) → (20×1 + 10×0,8) / 30 = 0,933
    expect(weightedKlFromLayers(PROFILE, 0.3)).toBe(0.933);
  });

  it("retorna 1 quando não há camadas no intervalo radicular", () => {
    expect(weightedKlFromLayers(PROFILE, 0)).toBe(1);
  });
});

describe("CAD recortada pela profundidade radicular Z", () => {
  it("soma (CC−PMP)×espessura só até Z, sem multiplicar densidade", () => {
    // 0–20: (0,30−0,12)×0,20×1000 = 36
    // 20–30: (0,28−0,14)×0,10×1000 = 14
    // 40–60 ignorada
    expect(calculateADTFromLayers(PROFILE, 0.3)).toBe(50);
    expect(calculateLayerCAD(PROFILE[0])).toBe(36);
  });

  it("usa o perfil inteiro quando Z cobre todas as camadas", () => {
    // 36 + (0,14)×0,20×1000=28 + (0,11)×0,20×1000=22 → 86
    expect(calculateADTFromLayers(PROFILE, 0.6)).toBe(86);
  });

  it("não inventa água abaixo da última camada", () => {
    expect(calculateADTFromLayers(PROFILE, 1.2)).toBe(86);
  });

  it("corta a camada que contém Z e descarta as abaixo", () => {
    const clipped = clipLayersToRootDepth(PROFILE, 0.3);
    expect(clipped).toHaveLength(2);
    expect(clipped[1].depth_start).toBe(20);
    expect(clipped[1].depth_end).toBe(30);
  });

  it("não mistura CAD homogênea com camadas quando o perfil é usável", () => {
    expect(
      soilProfileIsUsable(
        { field_capacity: 0.1, wilting_point: 0.1, effective_depth: 0 },
        PROFILE,
      ),
    ).toBe(true);
    expect(
      soilProfileIsUsable({
        field_capacity: 0.3,
        wilting_point: 0.12,
        effective_depth: 0.6,
      }),
    ).toBe(true);
    expect(
      soilProfileIsUsable({
        field_capacity: 0.3,
        wilting_point: 0.12,
        effective_depth: 0,
      }),
    ).toBe(false);
  });
});

describe("cadAfdFromMoistureUnit", () => {
  it("grava % em peso e aplica Da só na DTA", () => {
    const r = cadAfdFromMoistureUnit({
      cc: 12.4,
      pmp: 6.3,
      bulkDensity: 1.82,
      depthStartCm: 0,
      depthEndCm: 20,
      unit: "gravimetric_percent",
    });
    expect(r.missing).toEqual([]);
    expect(r.cadMm).toBeCloseTo(22.204, 2);
  });
});
