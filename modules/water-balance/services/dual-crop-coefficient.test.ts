import { describe, expect, it } from "vitest";
import {
  calculateKe,
  calculateKr,
  calculateTEW,
  computeSurfaceEvaporationDay,
  referenceREWByTexture,
} from "./dual-crop-coefficient";

describe("FAO-56 Kc dual", () => {
  it("calcula TEW da camada evaporante", () => {
    expect(calculateTEW(0.124, 0.063, 0.1)).toBeCloseTo(9.25, 2);
  });

  it("usa REW de referência para franco-arenoso", () => {
    expect(referenceREWByTexture("franco-arenoso")).toBe(8);
  });

  it("Kr é 1 enquanto De não ultrapassa REW", () => {
    expect(calculateKr(5, 8, 12)).toBe(1);
    expect(calculateKr(10, 8, 12)).toBeCloseTo(0.5, 3);
  });

  it("Ke respeita limite de Kcmax-Kcb e fração exposta", () => {
    expect(calculateKe(1, 1.2, 0.8, 0.3)).toBeCloseTo(0.36, 3);
  });

  it("chuva/irrigação reduzem a depleção superficial e elevam evaporação", () => {
    const dry = computeSurfaceEvaporationDay({
      phase: { kc_start: 0.15, kc_end: 0.15, kcb_start: 0.15, kcb_end: 0.15 },
      phaseProgress: 0,
      et0Mm: 5,
      precipitationMm: 0,
      effectiveIrrigationMm: 0,
      soil: { field_capacity: 0.124, wilting_point: 0.063, texture: "franco-arenoso" },
      previousDeMm: 9,
    });
    const wet = computeSurfaceEvaporationDay({
      phase: { kc_start: 0.15, kc_end: 0.15, kcb_start: 0.15, kcb_end: 0.15 },
      phaseProgress: 0,
      et0Mm: 5,
      precipitationMm: 8,
      effectiveIrrigationMm: 0,
      soil: { field_capacity: 0.124, wilting_point: 0.063, texture: "franco-arenoso" },
      previousDeMm: 9,
    });
    expect(dry).not.toBeNull();
    expect(wet).not.toBeNull();
    expect(wet!.deEndMm).toBeLessThan(dry!.deEndMm);
  });
});
