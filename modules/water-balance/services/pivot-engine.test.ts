import { describe, expect, it } from "vitest";
import { calculateADT, computePivotBalanceSeries, type PivotEngineInput } from "./pivot-engine";

function sampleInput(overrides: Partial<PivotEngineInput> = {}): PivotEngineInput {
  return {
    assignment: {
      id: "a1",
      planting_date: "2026-01-01",
      emergence_date: null,
      parameter_mode: "padrao",
      initial_root_depth: null,
      max_root_depth: null,
      irrigation_efficiency: null,
      depletion_factor: 0.5,
    },
    culture: { root_depth: 0.3, depletion_factor: 0.5 },
    phases: [],
    soil: {
      field_capacity: 0.3,
      wilting_point: 0.12,
      bulk_density: 1.3,
      effective_depth: 0.6,
    },
    pivot: { efficiency: 0.85, area: 80, flow_rate: 300 },
    weatherByDate: { "2026-01-01": { et0: 5, precipitation: 0 } },
    irrigationByDate: {},
    dateStart: "2026-01-01",
    dateEnd: "2026-01-01",
    ...overrides,
  };
}

describe("calculateADT homogêneo", () => {
  it("usa (CC−PMP)×min(Z, profundidade efetiva)×1000 sem densidade", () => {
    expect(calculateADT(0.3, 0.12, 0.3, 0.6)).toBe(54);
  });
});

describe("computePivotBalanceSeries — camadas", () => {
  it("recorte em Z substitui o perfil homogêneo quando há camadas", () => {
    const withLayers = computePivotBalanceSeries(
      sampleInput({
        soil: {
          field_capacity: 0.3,
          wilting_point: 0.12,
          bulk_density: 1.3,
          effective_depth: 0.6,
          layers: [
            { depth_start: 0, depth_end: 20, field_capacity: 0.3, wilting_point: 0.12 },
            { depth_start: 20, depth_end: 40, field_capacity: 0.28, wilting_point: 0.14 },
            { depth_start: 40, depth_end: 60, field_capacity: 0.26, wilting_point: 0.15 },
          ],
        },
      }),
    );
    const homogeneous = computePivotBalanceSeries(sampleInput());

    expect(homogeneous[0].adt).toBe(54);
    expect(withLayers[0].adt).toBe(50);
    expect(withLayers[0].rootDepth).toBe(0.3);
  });

  it("cai no cálculo homogêneo quando a lista de camadas está vazia", () => {
    const series = computePivotBalanceSeries(
      sampleInput({
        soil: {
          field_capacity: 0.3,
          wilting_point: 0.12,
          bulk_density: 1.3,
          effective_depth: 0.6,
          layers: [],
        },
      }),
    );
    expect(series[0].adt).toBe(54);
  });
});
