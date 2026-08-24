import { describe, expect, it } from "vitest";
import {
  calculateManagementUrgency,
  computePivotBalanceSeries,
  hasCompletePhaseCoverage,
  normalizeOperationalInput,
} from "./pivot-engine-operational";
import type { PivotEngineInput } from "./pivot-engine-v2";

function baseInput(): PivotEngineInput {
  return {
    assignment: {
      id: "assignment-1",
      planting_date: "2026-01-01",
      emergence_date: "2026-01-01",
      parameter_mode: "padrao",
      initial_root_depth: null,
      max_root_depth: null,
      irrigation_efficiency: null,
      depletion_factor: null,
      initial_soil_moisture_pct: null,
      initial_moisture_unit: "field_capacity_fraction",
      initial_moisture_is_cc: false,
      deficit_irrigation: true,
      stress_point_irrigation: false,
    },
    culture: {
      root_depth: 0.6,
      depletion_factor: 0.5,
      kl: 1,
      ks_function: "linear",
      ky: null,
    },
    phases: [
      {
        phase_order: 1,
        name: "Ciclo",
        days_after_plant: 0,
        duration_days: 30,
        kc_start: 1,
        kc_end: 1,
        root_depth_start: 0.6,
        root_depth_end: 0.6,
        depletion_factor: 0.5,
        kl: 1,
      },
    ],
    soil: {
      field_capacity: 0.2,
      wilting_point: 0.1,
      bulk_density: 1.4,
      effective_depth: 0.6,
    },
    pivot: {
      application_efficiency: 0.8,
      efficiency: 0.8,
      area: 100,
      flow_rate: 500,
    },
    weatherByDate: {
      "2026-01-01": { et0: 0, precipitation: 0 },
    },
    irrigationByDate: {},
    dateStart: "2026-01-01",
    dateEnd: "2026-01-01",
    initialStorageMm: 0,
    initialCadMm: 60,
  };
}

describe("pivot-engine-operational", () => {
  it("não reduz a lâmina automaticamente quando deficit_irrigation está marcado", () => {
    const input = baseInput();
    const normalized = normalizeOperationalInput(input);
    expect(normalized.assignment.deficit_irrigation).toBe(false);
    expect(input.assignment.deficit_irrigation).toBe(true);

    const rows = computePivotBalanceSeries(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].deficit).toBe(60);
    expect(rows[0].recommendedNetDepth).toBe(60);
    expect(rows[0].recommendedGrossDepth).toBe(75);
  });

  it("bloqueia linha do tempo com buraco entre fases", () => {
    const input = baseInput();
    input.phases = [
      { ...input.phases[0], duration_days: 10 },
      {
        ...input.phases[0],
        phase_order: 2,
        name: "Fase 2",
        days_after_plant: 12,
        duration_days: 10,
      },
    ];
    input.dateStart = "2026-01-01";
    input.dateEnd = "2026-01-02";

    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);
    expect(computePivotBalanceSeries(input)).toEqual([]);
  });

  it("bloqueia fase com raiz decrescente ou Kl inválido", () => {
    const input = baseInput();
    input.phases = [{
      ...input.phases[0],
      root_depth_start: 0.5,
      root_depth_end: 0.3,
    }];
    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);

    input.phases = [{
      ...baseInput().phases[0],
      kl: 1.2,
    }];
    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);
  });

  it("calcula margem e dias até a AFD com a demanda potencial atual", () => {
    expect(calculateManagementUrgency({ afd: 30, deficit: 18, etcPotential: 6 })).toEqual({
      remainingToAfdMm: 12,
      afdUsedPct: 60,
      daysToAfd: 2,
      atOrBeyondAfd: false,
    });

    expect(calculateManagementUrgency({ afd: 30, deficit: 31, etcPotential: 6 })).toEqual({
      remainingToAfdMm: 0,
      afdUsedPct: 103.3,
      daysToAfd: 0,
      atOrBeyondAfd: true,
    });
  });
});
