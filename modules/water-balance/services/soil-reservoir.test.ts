import { describe, expect, it } from "vitest";
import {
  dtaFromGravimetricPercent,
  dtaFromVolumetric,
  ksFromDrMm,
  summarizeSoilReservoir,
} from "./soil-reservoir";
import { assessBalanceReadiness } from "./balance-readiness";

describe("soil-reservoir", () => {
  it("DTA gravimétrico 12,4% / 6,3% · Da 1,82 → 1,11 mm/cm", () => {
    expect(dtaFromGravimetricPercent(12.4, 6.3, 1.82)).toBe(1.1102);
  });

  it("CAD 66,61 mm em % em peso sem converter para volumétrico", () => {
    const layers = [
      { depth_start: 0, depth_end: 20, field_capacity: 12.4, wilting_point: 6.3, bulk_density: 1.82 },
      { depth_start: 20, depth_end: 40, field_capacity: 12.2, wilting_point: 6.1, bulk_density: 1.82 },
      { depth_start: 40, depth_end: 60, field_capacity: 12.2, wilting_point: 6.1, bulk_density: 1.82 },
    ];
    const s = summarizeSoilReservoir({
      fieldCapacity: 12.4,
      wiltingPoint: 6.3,
      effectiveDepthM: 0.6,
      rootDepthM: 0.6,
      pFactor: 0.5,
      layers,
      moistureUnit: "gravimetric_percent",
      bulkDensity: 1.82,
    });
    expect(s.cadMm).toBe(66.61);
    expect(s.afdMm).toBe(33.31);
    expect(s.layers[0].exploredCm).toBe(20);
  });

  it("CAD 66,61 mm com Z=60 cm e três camadas de 20 cm (m³/m³)", () => {
    const layers = [
      { depth_start: 0, depth_end: 20, field_capacity: 0.22568, wilting_point: 0.11466, bulk_density: 1.82 },
      { depth_start: 20, depth_end: 40, field_capacity: 0.22204, wilting_point: 0.11102, bulk_density: 1.82 },
      { depth_start: 40, depth_end: 60, field_capacity: 0.22568, wilting_point: 0.11466, bulk_density: 1.82 },
    ];
    const s = summarizeSoilReservoir({
      fieldCapacity: 0.38,
      wiltingPoint: 0.18,
      effectiveDepthM: 1.2,
      rootDepthM: 0.6,
      pFactor: 0.5,
      layers,
    });
    expect(s.cadMm).toBe(66.61);
    expect(s.afdMm).toBe(33.31);
    expect(s.layers.length).toBe(3);
    expect(s.layers[0].cadMm).toBe(22.2);
  });

  it("Ks com CAD 47,6 · AFD 23,8 · Dr 27,2 ≈ 0,86", () => {
    expect(ksFromDrMm(47.6, 23.8, 27.2)).toBe(0.857);
  });

  it("DTA volumétrico = diferença × 10", () => {
    expect(dtaFromVolumetric(0.38, 0.18)).toBe(2);
  });
});

describe("balance-readiness", () => {
  it("bloqueia sem clima aprovado", () => {
    const r = assessBalanceReadiness({
      hasAssignment: true,
      hasCulture: true,
      hasSoil: true,
      phaseCount: 4,
      soilUsable: true,
      layerCount: 3,
      totalDaysInRange: 7,
      approvedClimateDays: 0,
      missingClimateSample: ["2026-08-01"],
    });
    expect(r.ready).toBe(false);
    expect(r.blockingCount).toBeGreaterThan(0);
  });

  it("avisa o dia corrente sem bloquear", () => {
    const r = assessBalanceReadiness({
      hasAssignment: true,
      hasCulture: true,
      hasSoil: true,
      phaseCount: 4,
      soilUsable: true,
      layerCount: 3,
      totalDaysInRange: 6,
      approvedClimateDays: 5,
      missingClimateSample: ["2026-08-29"],
      openClimateMissing: ["2026-08-29"],
    });
    expect(r.ready).toBe(true);
    expect(r.items.find((i) => i.id === "climate")?.level).toBe("warn");
  });

  it("libera quando todos os requisitos ok", () => {
    const r = assessBalanceReadiness({
      hasAssignment: true,
      hasCulture: true,
      hasSoil: true,
      phaseCount: 4,
      soilUsable: true,
      layerCount: 3,
      totalDaysInRange: 7,
      approvedClimateDays: 7,
      missingClimateSample: [],
    });
    expect(r.ready).toBe(true);
    expect(r.blockingCount).toBe(0);
  });
});
