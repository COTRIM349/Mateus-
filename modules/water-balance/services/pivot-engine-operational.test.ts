import { describe, expect, it } from "vitest";
import {
  adjustDepletionFactorForDemand,
  calculateManagementUrgency,
  computePivotBalanceSeries,
  computePivotCurrentState,
  diagnoseOperationalInput,
  hasCompletePhaseCoverage,
  normalizeOperationalInput,
  OperationalInputError,
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

  it("ajusta p diariamente pela ETc potencial conforme FAO-56", () => {
    expect(adjustDepletionFactorForDemand(0.5, 5)).toBe(0.5);
    expect(adjustDepletionFactorForDemand(0.5, 7)).toBe(0.42);
    expect(adjustDepletionFactorForDemand(0.5, 2)).toBe(0.62);
    expect(adjustDepletionFactorForDemand(0.1, 20)).toBe(0.1);
    expect(adjustDepletionFactorForDemand(0.8, 0)).toBe(0.8);
  });

  it("usa p ajustado na AFD do dia", () => {
    const input = baseInput();
    input.initialStorageMm = 60;
    input.weatherByDate["2026-01-01"] = { et0: 7, precipitation: 0 };
    const rows = computePivotBalanceSeries(input);
    expect(rows).toHaveLength(1);
    // CAD=60; p=0,50+0,04*(5-7)=0,42 -> AFD=25,2 mm
    expect(rows[0].adt).toBe(60);
    expect(rows[0].afd).toBe(25.2);
    expect(rows[0].etcPotential).toBe(7);
  });

  it("bloqueia linha do tempo com buraco entre fases e expõe o motivo à execução operacional", () => {
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
    expect(diagnoseOperationalInput(input)).toMatchObject({
      operational: false,
      code: "invalid_phase_coverage",
    });
    expect(() => computePivotBalanceSeries(input)).toThrow(OperationalInputError);
    expect(() => computePivotBalanceSeries(input)).toThrow(/Fases da cultura incompletas ou inválidas/);
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

  it("explica bloqueio quando clima operacional está ausente ou inválido", () => {
    const missing = baseInput();
    missing.weatherByDate = {};
    expect(diagnoseOperationalInput(missing)).toEqual({
      operational: false,
      code: "missing_weather",
      message: "Clima operacional ausente em 2026-01-01: o balanço não assume ETo ou chuva iguais a zero.",
      date: "2026-01-01",
    });
    expect(() => computePivotBalanceSeries(missing)).toThrow(/Clima operacional ausente em 2026-01-01/);

    const invalid = baseInput();
    invalid.weatherByDate["2026-01-01"] = { et0: -1, precipitation: 0 };
    expect(diagnoseOperationalInput(invalid)).toMatchObject({
      operational: false,
      code: "invalid_weather",
      date: "2026-01-01",
    });
    expect(() => computePivotBalanceSeries(invalid)).toThrow(/Clima operacional inválido em 2026-01-01/);
  });

  it("explica bloqueio quando o perfil de solo não é operacional", () => {
    const input = baseInput();
    input.soil.field_capacity = 0.08;
    input.soil.wilting_point = 0.1;
    expect(diagnoseOperationalInput(input)).toMatchObject({
      operational: false,
      code: "invalid_soil_profile",
    });
    expect(() => computePivotBalanceSeries(input)).toThrow(/Perfil de solo inválido/);
  });

  it("mantém estado agregado seguro e vazio quando a parcela está bloqueada", () => {
    const input = baseInput();
    input.weatherByDate = {};
    const state = computePivotCurrentState({ id: "p1", name: "Pivô 1" }, input);
    expect(state.current).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("confirma diagnóstico operacional quando as pré-condições estão completas", () => {
    expect(diagnoseOperationalInput(baseInput())).toEqual({
      operational: true,
      code: null,
      message: null,
      date: null,
    });
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
