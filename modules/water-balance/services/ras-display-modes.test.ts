import { describe, expect, it } from "vitest";
import { buildRasPoint } from "./ras-panel-model";
import { rasDisplayPoint, rasDisplaySeries, rasDisplayAxisCeiling } from "./ras-display-modes";

const soil = {
  date: "2026-10-28", cad: 60, afd: 30, storedWater: 36, rootDepth: .6,
  fieldCapacity: .20, wiltingPoint: .10, et0: 5, etc: 4, kc: .8,
};
const p = buildRasPoint(soil)!;

describe("RAS: três modos do mesmo armazenamento", () => {
  it("%CC é 80%, com PMP 50% CC, sem transformar PMP em zero", () => {
    const v = rasDisplayPoint(p, "cc")!;
    expect(v.capacity).toBe(100);
    expect(v.pmp).toBe(50);
    expect(v.safety).toBe(75);
    expect(v.current).toBe(80);
  });

  it("ARM mm exibe CTA, limite e reserva diária física", () => {
    const v = rasDisplayPoint(p, "mm")!;
    expect(v).toMatchObject({current: 36, capacity: 60, safety: 30, pmp: 0});
  });

  it("%peso homogêneo usa Ds somente para exibir; mantém o ARM original", () => {
    const v = rasDisplayPoint(p, "weight", [], 1.5)!;
    expect(v.capacity).toBeCloseTo(13.3333333, 4);
    expect(v.pmp).toBeCloseTo(6.6666667, 4);
    expect(v.current).toBeCloseTo(10.6666667, 4);
    expect(v.safety).toBeCloseTo(10, 4);
    expect(p.armMm).toBe(36);
    expect(p.ctaMm).toBe(60);
  });

  it("peso em camadas usa massa seca por camada e raiz do próprio dia", () => {
    const layers = [
      { depth_start: 0, depth_end: 20, field_capacity: .20, wilting_point: .10, bulk_density: 1.4 },
      { depth_start: 20, depth_end: 60, field_capacity: .30, wilting_point: .12, bulk_density: 1.6 },
    ];
    const first = buildRasPoint({...soil, date: "2026-10-27", rootDepth:.2, cad:20, afd:10, storedWater:10})!;
    const second = buildRasPoint({...soil, date: "2026-10-28", rootDepth:.6, cad:92, afd:46, storedWater:46})!;
    const mm = rasDisplaySeries([first, second], "mm", layers)!;
    expect(mm.map(v => v.capacity)).toEqual([20, 92]);
    expect(mm.map(v => v.current)).toEqual([10, 46]);
    const weights = rasDisplaySeries([first, second], "weight", layers)!;
    expect(weights[0].capacity).toBeCloseTo(100 * .2 / 1.4, 4);
    expect(weights[1].capacity).toBeCloseTo(100 * 16 / 92, 4);
    expect(weights[1].pmp).toBeCloseTo(100 * 6.8 / 92, 4);
    expect(weights[1].current).toBeCloseTo(100 * 11.4 / 92, 4);
  });

  it("limita o eixo %CC a exatamente 100%, sem faixa acima da capacidade de campo", () => {
    const series = rasDisplaySeries([p], "cc")!;
    expect(rasDisplayAxisCeiling(series, "cc")).toBe(100);
  });

  it("usa a CAD máxima histórica como teto em mm sem alterar ARM ou raízes", () => {
    const earlier = buildRasPoint({...soil, date: "2026-10-27", cad: 26.7, storedWater: 20, afd: 13.35, rootDepth: .2})!;
    const series = rasDisplaySeries([earlier, p], "mm")!;
    expect(rasDisplayAxisCeiling(series, "mm")).toBe(60);
    expect(series.map(v => v.capacity)).toEqual([26.7, 60]);
    expect(series.map(v => v.current)).toEqual([20, 36]);
  });

  it("limita o eixo de peso à maior CC gravimétrica existente", () => {
    const series = rasDisplaySeries([p], "weight", [], 1.5)!;
    expect(rasDisplayAxisCeiling(series, "weight")).toBeCloseTo(13.33333, 4);
  });

  it("não inventa densidade nem completa lacunas", () => {
    expect(rasDisplayPoint(p, "weight", [], null)).toBeNull();
    expect(rasDisplayPoint(p, "weight", [], 0)).toBeNull();
    expect(rasDisplaySeries([p], "weight", [
      {depth_start:0, depth_end:20, field_capacity:.2, wilting_point:.1, bulk_density:1.5},
      {depth_start:40, depth_end:60, field_capacity:.2, wilting_point:.1, bulk_density:1.6},
    ], 1.5)).toBeNull();
    expect(rasDisplaySeries([p], "weight", [
      {depth_start:0, depth_end:60, field_capacity:.2, wilting_point:.1, bulk_density:null},
    ], 1.5)).toBeNull();
  });
});
