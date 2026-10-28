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

describe("motor hídrico V2 - estabilização", () => {
  it("usa condição inicial explícita e mantém continuidade entre dias", () => {
    const rows = computePivotBalanceSeries(baseInput());
    expect(rows).toHaveLength(2);
    expect(rows[0].adt).toBe(54);
    expect(rows[0].storage).toBe(49);
    expect(rows[1].storage).toBe(44);
  });

  it("usa ARM persistido anterior em vez de reiniciar na CAD", () => {
    const rows = computePivotBalanceSeries(baseInput({ initialStorageMm: 30, initialCadMm: 54 }));
    expect(rows[0].storage).toBe(25);
  });

  it("bloqueia série com lacuna climática em vez de converter para zero", () => {
    const weather = { "2026-08-01": { et0: 5, precipitation: 0 } };
    expect(computePivotBalanceSeries(baseInput({ weatherByDate: weather }))).toHaveLength(0);
    expect(hasCompleteWeatherSeries(weather, "2026-08-01", "2026-08-02")).toBe(false);
  });

  it("não inicia balanço sem seed nem umidade inicial confiável", () => {
    const input = baseInput();
    input.assignment.initial_moisture_is_cc = false;
    input.assignment.initial_soil_moisture_pct = null;
    expect(computePivotBalanceSeries(input)).toHaveLength(0);
  });

  it("usa eficiência de aplicação explícita", () => {
    const rows = computePivotBalanceSeries(baseInput({ irrigationByDate: { "2026-08-01": 20 } }));
    expect(rows[0].effectiveIrrigation).toBe(17);
  });

  it("chuva diária é limitada pela CAD e excesso vira surplus", () => {
    const rows = computePivotBalanceSeries(baseInput({
      weatherByDate: {
        "2026-08-01": { et0: 2, precipitation: 20 },
        "2026-08-02": { et0: 2, precipitation: 0 },
      },
    }));
    expect(rows[0].storage).toBe(54);
    expect(rows[0].surplus).toBeGreaterThan(0);
    expect(rows[0].effectivePrecipitation).toBeLessThan(20);
  });

  it("bloqueia cultura sem fases", () => {
    const input = baseInput({ phases: [] });
    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);
  });

  it("bloqueia lacuna ou DAE fora da cobertura das fases", () => {
    const input = baseInput({ phases: [
      { phase_order: 1, name: "Inicial", days_after_plant: 0, duration_days: 1, kc_start: 0.5, kc_end: 0.5, root_depth_start: 0.2, root_depth_end: 0.2, depletion_factor: 0.5 },
      { phase_order: 2, name: "Vegetativo", days_after_plant: 3, duration_days: 10, kc_start: 0.8, kc_end: 1, root_depth_start: 0.3, root_depth_end: 0.5, depletion_factor: 0.5 },
    ] });
    expect(hasCompletePhaseCoverage(input.phases, input)).toBe(false);
  });
});

describe("módulo de irrigação sem Kl", () => {
  it("independe do Kl informado em parcela, cultura ou fase, inclusive no F semanal", () => {
    const noKl = computePivotBalanceSeries(baseInput());
    const withKl = computePivotBalanceSeries(baseInput({
      assignment: { ...baseInput().assignment, kl_override: 0.2 },
      culture: { ...baseInput().culture, kl: 0.35 },
      phases: baseInput().phases.map(p => ({ ...p, kl: 0.4 })),
    }));
    expect(withKl).toHaveLength(noKl.length);
    expect(withKl.map(r => r.etcPotential)).toEqual(noKl.map(r => r.etcPotential));
    expect(withKl.map(r => r.etc)).toEqual(noKl.map(r => r.etc));
    expect(withKl.map(r => r.factorWeekStart)).toEqual(noKl.map(r => r.factorWeekStart));
    expect(withKl.map(r => r.afd)).toEqual(noKl.map(r => r.afd));
    expect(withKl.map(r => r.storage)).toEqual(noKl.map(r => r.storage));
    expect(withKl.every(r => r.kl === 1)).toBe(true);
    expect(withKl.every(r => r.etcFormula.includes("ETo × Kc × Ks") && !r.etcFormula.includes("KL"))).toBe(true);
  });
});

describe("crescimento radicular diário e limite de absorção conhecido do Pivô 06", () => {
  it("usa a Zr da curva aprovada, calcula CTA/CRA diária e nunca supera os 60 cm cadastrados", () => {
    // CC/PMP já convertidos de % em peso usando Ds=1,85.
    // Cada camada de 20 cm tem DTA=1,406 mm/cm e CTA=28,12 mm.
    const layers = [
      { depth_start: 0, depth_end: 20, field_capacity: 0.2461, wilting_point: 0.1055 },
      { depth_start: 20, depth_end: 40, field_capacity: 0.2442, wilting_point: 0.1036 },
      { depth_start: 40, depth_end: 60, field_capacity: 0.2442, wilting_point: 0.1036 },
    ];
    const input = baseInput({
      assignment: { ...baseInput().assignment, emergence_date: "2026-08-01" },
      culture: { root_depth: 1.30, depletion_factor: 0.5 },
      soil: { field_capacity: 0.2448, wilting_point: 0.1042, bulk_density: 1.85, effective_depth: 0.6, layers },
      weatherByDate: {
        "2026-08-01": { et0: 4, precipitation: 0 },
        "2026-08-02": { et0: 6, precipitation: 0 },
        "2026-08-03": { et0: 5, precipitation: 0 },
      },
      dateEnd: "2026-08-03",
      agronomicByDate: {
        "2026-08-01": { rootDepthM: 0.20, kc: 1 },
        "2026-08-02": { rootDepthM: 0.40, kc: 1 },
        "2026-08-03": { rootDepthM: 1.00, kc: 1 }, // raiz chega abaixo da amostragem
      },
    });
    const rows = computePivotBalanceSeries(input);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.dae)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.rootDepthEstimated)).toEqual([0.2, 0.4, 1]);
    expect(rows.map((r) => r.rootDepth)).toEqual([0.2, 0.4, 0.6]);
    expect(rows.map((r) => r.adt)).toEqual([28.12, 56.24, 84.36]);
    // Sábado/domingo usam a média semanal: p(4)=0,54, p(6)=0,46 => F=0,50.
    // Segunda inicia outra semana: p(5)=0,50.
    expect(rows.map((r) => r.afd)).toEqual([14.06, 28.12, 42.18]);
    expect(rows.map((r) => r.factorWeekStart)).toEqual(["2026-07-27", "2026-07-27", "2026-08-03"]);
    expect(rows.map((r) => r.factorWeekSampleDays)).toEqual([2, 2, 1]);
    expect(rows.every((r) => r.cadProfileMm === 84.36)).toBe(true);
  });

  it("também desenvolve Zr por DAE a partir das fases quando não há curva aprovada", () => {
    const input = baseInput({
      assignment: { ...baseInput().assignment, emergence_date: "2026-08-01" },
      culture: { root_depth: 0.60, depletion_factor: 0.5 },
      phases: [{
        phase_order: 1, name: "Vegetativo", days_after_plant: 0, duration_days: 10,
        kc_start: 0.8, kc_end: 0.8, root_depth_start: 0.15, root_depth_end: 0.55,
        depletion_factor: 0.5,
      }],
      dateEnd: "2026-08-03",
      weatherByDate: {
        "2026-08-01": { et0: 5, precipitation: 0 },
        "2026-08-02": { et0: 5, precipitation: 0 },
        "2026-08-03": { et0: 5, precipitation: 0 },
      },
    });
    const rows = computePivotBalanceSeries(input);
    expect(rows).toHaveLength(3);
    expect(rows[0].rootDepth).toBeLessThan(rows[1].rootDepth);
    expect(rows[1].rootDepth).toBeLessThan(rows[2].rootDepth);
    expect(rows[0].adt).toBeLessThan(rows[1].adt);
    expect(rows[1].adt).toBeLessThan(rows[2].adt);
  });
});

describe("fator F médio semanal dentro do motor hídrico", () => {
  it("usa F constante por semana, enquanto ETo, ETc e ARM continuam diários", () => {
    const weather: PivotEngineInput["weatherByDate"] = {};
    for (let i = 0; i < 8; i++) {
      const date = `2026-08-${String(i + 3).padStart(2, "0")}`;
      weather[date] = { et0: i < 7 ? 3 + i : 2, precipitation: 0 };
    }
    const rows = computePivotBalanceSeries(baseInput({
      assignment: { ...baseInput().assignment, planting_date: "2026-08-03", emergence_date: "2026-08-03" },
      dateStart: "2026-08-03",
      dateEnd: "2026-08-10",
      phases: [
        { phase_order: 1, name: "Inicial", days_after_plant: 0, duration_days: 10,
          kc_start: 1, kc_end: 1, root_depth_start: 0.3, root_depth_end: 0.3, depletion_factor: 0.5 },
      ],
      weatherByDate: weather,
    }));
    expect(rows).toHaveLength(8);
    expect(rows.slice(0, 7).map((r) => r.afd / r.adt)).toEqual(Array(7).fill(0.46));
    expect(rows[7].afd / rows[7].adt).toBeCloseTo(0.62, 3);
    expect(rows.map((r) => r.etcPotential)).toEqual([3, 4, 5, 6, 7, 8, 9, 2]);
    expect(rows[0].storage).toBeGreaterThan(rows[1].storage);
    expect(rows[0].factorWeekSampleDays).toBe(7);
    expect(rows[7].factorWeekSampleDays).toBe(1);
    expect(rows[0].etcPotentialWeeklyMean).toBe(6);
  });
});
