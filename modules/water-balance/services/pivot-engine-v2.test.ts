import { describe, expect, it } from "vitest";
import {
  computePivotBalanceSeries,
  hasCompleteWeatherSeries,
  type PivotEngineInput,
} from "./pivot-engine-v2";
import { hasCompletePhaseCoverage } from "./pivot-engine-operational";

function baseInput(overrides: Partial<PivotEngineInput> = {}): PivotEngineInput {
  return {
    assignment: {
      id: "a1",
      planting_date: "2026-08-01",
      emergence_date: null,
      parameter_mode: "padrao",
      initial_root_depth: null,
      max_root_depth: null,
      irrigation_efficiency: null,
      depletion_factor: 0.5,
      initial_soil_moisture_pct: null,
      initial_moisture_unit: "field_capacity_fraction",
      initial_moisture_is_cc: true,
      deficit_irrigation: false,
      stress_point_irrigation: false,
    },
    culture: { root_depth: 0.3, depletion_factor: 0.5 },
    phases: [
      {
        phase_order: 1,
        name: "Inicial",
        days_after_plant: 0,
        duration_days: 10,
        kc_start: 1,
        kc_end: 1,
        kcb_start: 0.9,
        kcb_end: 0.9,
        root_depth_start: 0.3,
        root_depth_end: 0.3,
        depletion_factor: 0.5,
      },
    ],
    soil: { field_capacity: 0.3, wilting_point: 0.12, bulk_density: 1.3, effective_depth: 0.6 },
    pivot: { application_efficiency: 0.85, efficiency: 0.9, area: 80, flow_rate: 300 },
    weatherByDate: {
      "2026-08-01": { et0: 5, precipitation: 0 },
      "2026-08-02": { et0: 5, precipitation: 0 },
    },
    irrigationByDate: {},
    dateStart: "2026-08-01",
    dateEnd: "2026-08-02",
    ...overrides,
  };
}

describe("motor hídrico V2 - regressão legada", () => {
  it("usa condição inicial explícita e mantém continuidade entre dias", () => {
    const rows = computePivotBalanceSeries(baseInput());
    expect(rows).toHaveLength(2);
    expect(rows[0].adt).toBe(54);
    expect(rows[0].storage).toBe(49);
    expect(rows[1].storage).toBe(44);
  });

  it("usa ARM persistido anterior em vez de reiniciar na CAD", () => {
    const rows = computePivotBalanceSeries(baseInput({ initialStorageMm: 30, initialCadMm: 54 }));
    expect(rows[0].storage).toBeLessThan(49);
    expect(rows[0].storage).toBe(25);
  });

  it("bloqueia série com lacuna climática em vez de converter para zero", () => {
    const rows = computePivotBalanceSeries(baseInput({ weatherByDate: { "2026-08-01": { et0: 5, precipitation: 0 } } }));
    expect(rows).toHaveLength(0);
    expect(hasCompleteWeatherSeries({ "2026-08-01": { et0: 5, precipitation: 0 } }, "2026-08-01", "2026-08-02")).toBe(false);
  });

  it("não inicia balanço sem seed nem umidade inicial confiável", () => {
    const input = baseInput();
    input.assignment.initial_moisture_is_cc = false;
    input.assignment.initial_soil_moisture_pct = null;
    expect(computePivotBalanceSeries(input)).toHaveLength(0);
  });

  it("usa eficiência de aplicação e não o CUC/legado para irrigação efetiva", () => {
    const rows = computePivotBalanceSeries(baseInput({ irrigationByDate: { "2026-08-01": 20 } }));
    expect(rows[0].effectiveIrrigation).toBe(17);
  });

  it("chuva diária é limitada pela CAD e excesso vira surplus", () => {
    const rows = computePivotBalanceSeries(baseInput({ weatherByDate: { "2026-08-01": { et0: 2, precipitation: 20 }, "2026-08-02": { et0: 2, precipitation: 0 } } }));
    expect(rows[0].storage).toBe(54);
    expect(rows[0].surplus).toBeGreaterThan(0);
    expect(rows[0].effectivePrecipitation).toBeLessThan(20);
  });

  it("guarda V3 bloqueia cultura sem fases", () => {
    const input = baseInput({ phases: [] });
    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);
  });

  it("guarda V3 bloqueia lacuna ou DAE fora da cobertura das fases", () => {
    const input = baseInput({ phases: [
      { phase_order: 1, name: "Inicial", days_after_plant: 0, duration_days: 1, kc_start: 0.5, kc_end: 0.5, kcb_start: 0.15, kcb_end: 0.15, root_depth_start: 0.2, root_depth_end: 0.2, depletion_factor: 0.5 },
      { phase_order: 2, name: "Vegetativo", days_after_plant: 3, duration_days: 10, kc_start: 0.8, kc_end: 1, kcb_start: 0.4, kcb_end: 0.9, root_depth_start: 0.3, root_depth_end: 0.5, depletion_factor: 0.5 },
    ] });
    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);
  });
});
