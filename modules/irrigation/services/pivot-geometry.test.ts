import { describe, expect, it } from "vitest";
import { resolvePivotMapGeometry } from "./pivot-geometry";

describe("resolvePivotMapGeometry", () => {
  it("usa última torre + vão quando a torre existe", () => {
    const geo = resolvePivotMapGeometry({
      radiusM: 800,
      lastTowerRadiusM: 673.19,
      overhangM: 16.31,
      latitude: -12.5,
      longitude: -45.8,
    });
    expect(geo.radiusMeters).toBeCloseTo(689.5, 5);
    expect(geo.sheetIncomplete).toBe(false);
  });

  it("cai no raio cadastrado se não houver torre", () => {
    const geo = resolvePivotMapGeometry({
      radiusM: 450,
      lastTowerRadiusM: null,
      overhangM: null,
      latitude: -12.5,
      longitude: -45.8,
    });
    expect(geo.radiusMeters).toBe(450);
    expect(geo.sheetIncomplete).toBe(false);
  });

  it("não inventa raio quando a ficha não tem geometria", () => {
    const geo = resolvePivotMapGeometry({
      radiusM: 0,
      lastTowerRadiusM: null,
      latitude: -12.5,
      longitude: -45.8,
    });
    expect(geo.radiusMeters).toBeNull();
    expect(geo.sheetIncomplete).toBe(true);
    expect(geo.missing).toContain("raio");
  });

  it("sinaliza coordenadas ausentes", () => {
    const geo = resolvePivotMapGeometry({
      radiusM: 400,
      latitude: 0,
      longitude: 0,
    });
    expect(geo.sheetIncomplete).toBe(true);
    expect(geo.missing).toEqual(expect.arrayContaining(["latitude", "longitude"]));
  });
});
