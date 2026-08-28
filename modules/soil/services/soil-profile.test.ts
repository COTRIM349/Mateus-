import { describe, expect, it } from "vitest";
import { calculateLayerCAD } from "./soil.service";
import {
  DEFAULT_CENTER_PIVOT_KL,
  SOIL_UNITS,
  calculateADTFromLayers,
  clipLayersToRootDepth,
  normalizeCcPmpInput,
  normalizeSoilWaterContent,
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

describe("conversão explícita da base de umidade", () => {
  it("converte θg × Da de forma explícita", () => {
    expect(volumetricFromGravimetric(0.2, 1.3)).toBe(0.26);
    expect(normalizeSoilWaterContent(20, "gravimetric_pct", 1.3)).toBe(0.26);
    expect(normalizeSoilWaterContent(0.2, "gravimetric_fraction", 1.3)).toBe(0.26);
  });

  it("não usa densidade aparente quando a entrada já é volumétrica", () => {
    expect(normalizeSoilWaterContent(12.4, "volumetric_pct", 1.82)).toBe(0.124);
    expect(normalizeSoilWaterContent(0.124, "volumetric_fraction", 1.82)).toBe(0.124);
  });

  it("reproduz o exemplo gravimétrico 12,4%/6,3% com Da 1,82", () => {
    const normalized = normalizeCcPmpInput({
      fieldCapacity: 12.4,
      wiltingPoint: 6.3,
      basis: "gravimetric_pct",
      bulkDensity: 1.82,
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.fieldCapacity).toBe(0.2257);
    expect(normalized!.wiltingPoint).toBe(0.1147);
    const cad60 = (normalized!.fieldCapacity - normalized!.wiltingPoint) * 0.6 * 1000;
    expect(cad60).toBeCloseTo(66.6, 1);
  });

  it("bloqueia base gravimétrica sem densidade e relação CC <= PMP", () => {
    expect(normalizeCcPmpInput({
      fieldCapacity: 12.4,
      wiltingPoint: 6.3,
      basis: "gravimetric_pct",
    })).toBeNull();
    expect(normalizeCcPmpInput({
      fieldCapacity: 10,
      wiltingPoint: 12,
      basis: "volumetric_pct",
    })).toBeNull();
  });

  it("rejeita densidade ou umidade inválidas", () => {
    expect(volumetricFromGravimetric(0.2, 0)).toBe(0);
    expect(volumetricFromGravimetric(-0.1, 1.3)).toBe(0);
    expect(normalizeSoilWaterContent(-1, "volumetric_pct")).toBeNull();
  });
});

describe("KL de pivô central", () => {
  it("trata null/undefined como 1", () => {
    expect(resolveLayerKl(null)).toBe(DEFAULT_CENTER_PIVOT_KL);
    expect(resolveLayerKl(undefined)).toBe(1);
    expect(resolveLayerKl(0.6)).toBe(0.6);
  });

  it("pondera pela espessura recortada em Z e usa 1 nas camadas sem KL", () => {
    expect(weightedKlFromLayers(PROFILE, 0.3)).toBe(0.933);
  });

  it("retorna 1 quando não há camadas no intervalo radicular", () => {
    expect(weightedKlFromLayers(PROFILE, 0)).toBe(1);
  });
});

describe("CAD recortada pela profundidade radicular Z", () => {
  it("soma (CC−PMP)×espessura só até Z, sem multiplicar densidade", () => {
    expect(calculateADTFromLayers(PROFILE, 0.3)).toBe(50);
    expect(calculateLayerCAD(PROFILE[0])).toBe(36);
  });

  it("usa o perfil inteiro quando Z cobre todas as camadas", () => {
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
