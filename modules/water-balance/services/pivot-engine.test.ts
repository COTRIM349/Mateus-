import { describe, expect, it } from "vitest";
import { calculateADT, computePivotBalanceSeries, type PivotEngineInput } from "./pivot-engine";
import { moisturePercentOfFieldCapacity, safetyMoistureMm } from "./soil-water-balance";

function phases() {
  return [{
    phase_order: 1,
    name: "Inicial",
    days_after_plant: 0,
    duration_days: 30,
    kc_start: 1,
    kc_end: 1,
    root_depth_start: 0.3,
    root_depth_end: 0.3,
    depletion_factor: 0.5,
  }];
}

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
      initial_soil_moisture_pct: null,
      initial_moisture_unit: "field_capacity_fraction",
      initial_moisture_is_cc: true,
      deficit_irrigation: false,
      stress_point_irrigation: false,
    },
    culture: { root_depth: 0.3, depletion_factor: 0.5 },
    phases: phases(),
    soil: { field_capacity: 0.3, wilting_point: 0.12, bulk_density: 1.3, effective_depth: 0.6 },
    pivot: { application_efficiency: 0.85, efficiency: 0.85, area: 80, flow_rate: 300 },
    weatherByDate: { "2026-01-01": { et0: 5, precipitation: 0 } },
    irrigationByDate: {},
    dateStart: "2026-01-01",
    dateEnd: "2026-01-01",
    ...overrides,
  };
}

function weatherDays(start: string, days: number, et0: number) {
  const out: Record<string, { et0: number; precipitation: number }> = {};
  const t0 = new Date(`${start}T12:00:00Z`).getTime();
  for (let i = 0; i < days; i++) {
    const date = new Date(t0 + i * 86400000).toISOString().slice(0, 10);
    out[date] = { et0, precipitation: 0 };
  }
  return out;
}

describe("motor hídrico operacional", () => {
  it("CAD volumétrica não usa densidade aparente", () => {
    expect(calculateADT(0.3, 0.12, 0.3, 0.6)).toBe(54);
  });

  it("bloqueia ausência de fases em vez de assumir Kc=1", () => {
    expect(computePivotBalanceSeries(sampleInput({ phases: [] }))).toHaveLength(0);
  });

  it("bloqueia condição inicial ausente", () => {
    const input = sampleInput();
    input.assignment.initial_moisture_is_cc = false;
    input.assignment.initial_soil_moisture_pct = null;
    expect(computePivotBalanceSeries(input)).toHaveLength(0);
  });

  it("condição inicial confirmada em CC perde ETc no primeiro dia", () => {
    const day = computePivotBalanceSeries(sampleInput())[0];
    expect(day.adt).toBe(54);
    expect(day.storage).toBe(49);
    expect(day.ks).toBe(1);
    expect(day.kl).toBe(1);
    expect(day.etcPotential).toBe(5);
    expect(day.etc).toBe(5);
    expect(day.safetyMoistureMm).toBe(safetyMoistureMm(54, 27));
    expect(day.moisturePctCc).toBe(moisturePercentOfFieldCapacity(49, 54, 0.3, 0.12));
  });

  it("camadas substituem perfil homogêneo no recorte radicular", () => {
    const withLayers = computePivotBalanceSeries(sampleInput({
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
    }));
    expect(withLayers[0].adt).toBe(50);
  });

  it("Ks cai quando Dr supera AFD", () => {
    const input = sampleInput({ weatherByDate: weatherDays("2026-01-01", 10, 8), dateEnd: "2026-01-10" });
    const stressed = computePivotBalanceSeries(input).filter((d) => d.ks < 1);
    expect(stressed.length).toBeGreaterThan(0);
    expect(stressed[0].etc).toBeLessThan(stressed[0].etcPotential);
  });

  it("KL da parcela reduz ETc potencial", () => {
    const full = computePivotBalanceSeries(sampleInput())[0];
    const assignment = { ...sampleInput().assignment, kl_override: 0.6 };
    const localized = computePivotBalanceSeries(sampleInput({ assignment }))[0];
    expect(localized.kl).toBe(0.6);
    expect(localized.etcPotential).toBeCloseTo(full.etcPotential * 0.6, 2);
  });

  it("chuva diária ocupa apenas espaço disponível na CAD e excedente vira surplus", () => {
    const day = computePivotBalanceSeries(sampleInput({
      weatherByDate: { "2026-01-01": { et0: 2, precipitation: 20 } },
    }))[0];
    expect(day.storage).toBe(54);
    expect(day.surplus).toBeGreaterThan(0);
    expect(day.effectivePrecipitation).toBeLessThan(20);
    expect(day.peFormula).toContain("P_arm");
  });

  it("irrigação efetiva usa eficiência de aplicação", () => {
    const wet = computePivotBalanceSeries(sampleInput({ irrigationByDate: { "2026-01-01": 20 } }))[0];
    expect(wet.effectiveIrrigation).toBe(17);
    expect(wet.storage).toBe(54);
  });

  it("preserva fração ARM/CAD quando a raiz cresce", () => {
    const growingPhases = [{
      phase_order: 1,
      name: "Desenvolvimento",
      days_after_plant: 0,
      duration_days: 10,
      kc_start: 0.4,
      kc_end: 0.4,
      root_depth_start: 0.15,
      root_depth_end: 0.45,
      depletion_factor: 0.5,
    }];
    const series = computePivotBalanceSeries(sampleInput({
      culture: { root_depth: 0.45, depletion_factor: 0.5 },
      phases: growingPhases,
      weatherByDate: weatherDays("2026-01-01", 2, 5),
      dateEnd: "2026-01-02",
    }));
    expect(series[1].adt).toBeGreaterThan(series[0].adt);
    expect(series[0].storage / series[0].adt).toBeGreaterThan(0);
  });
});
