import { describe, expect, it } from "vitest";
import { computePivotBalanceSeries, type PivotEngineInput } from "./pivot-engine";

/**
 * Piloto agronômico baseado no cadastro real do Pivô 59 em 24/08/2026.
 * A condição foi confirmada em capacidade de campo ao fim de 23/08; portanto
 * o primeiro dia calculado é 24/08. Este teste não acessa banco ou API.
 */
describe("Karitel · Pivô 59 · piloto auditável", () => {
  it("fecha o primeiro dia a partir de CC confirmada sem inventar água", () => {
    const input: PivotEngineInput = {
      assignment: {
        id: "fd8a926c-c653-44aa-9ba6-221132e1f7db",
        planting_date: "2026-08-10",
        emergence_date: "2026-08-10",
        parameter_mode: "padrao",
        initial_root_depth: null,
        max_root_depth: null,
        irrigation_efficiency: null,
        depletion_factor: null,
        kl_override: null,
        ks_function_override: null,
        initial_soil_moisture_pct: null,
        initial_moisture_unit: "field_capacity_fraction",
        initial_moisture_is_cc: true,
        deficit_irrigation: false,
        stress_point_irrigation: false,
      },
      culture: {
        root_depth: 0.5,
        depletion_factor: 0.4,
        kl: 1,
        ks_function: "linear",
        ky: null,
      },
      phases: [
        { phase_order: 1, name: "Inicial", days_after_plant: 0, duration_days: 27, kc_start: 0.35, kc_end: 0.35, root_depth_start: 0.2, root_depth_end: 0.25, depletion_factor: 0.4, kl: 1 },
        { phase_order: 2, name: "Desenvolvimento", days_after_plant: 27, duration_days: 36, kc_start: 0.35, kc_end: 1.1, root_depth_start: 0.25, root_depth_end: 0.5, depletion_factor: 0.4, kl: 1 },
        { phase_order: 3, name: "Meio do ciclo", days_after_plant: 63, duration_days: 45, kc_start: 1.1, kc_end: 1.1, root_depth_start: 0.5, root_depth_end: 0.5, depletion_factor: 0.4, kl: 1 },
        { phase_order: 4, name: "Final", days_after_plant: 108, duration_days: 27, kc_start: 1.1, kc_end: 0.9, root_depth_start: 0.5, root_depth_end: 0.5, depletion_factor: 0.4, kl: 1 },
      ],
      soil: {
        field_capacity: 0.124,
        wilting_point: 0.063,
        bulk_density: 1.82,
        effective_depth: 0.6,
        layers: [
          { depth_start: 0, depth_end: 20, field_capacity: 0.124, wilting_point: 0.063, bulk_density: 1.82 },
          { depth_start: 20, depth_end: 40, field_capacity: 0.124, wilting_point: 0.063, bulk_density: 1.82 },
          { depth_start: 40, depth_end: 60, field_capacity: 0.124, wilting_point: 0.063, bulk_density: 1.82 },
        ],
      },
      pivot: {
        application_efficiency: 0.9,
        efficiency: 0.9,
        area: 144.4,
        flow_rate: 690,
      },
      weatherByDate: {
        "2026-08-24": { et0: 6.28, precipitation: 0 },
      },
      irrigationByDate: {},
      dateStart: "2026-08-24",
      dateEnd: "2026-08-24",
    };

    const rows = computePivotBalanceSeries(input);
    expect(rows).toHaveLength(1);
    const day = rows[0];

    expect(day.dae).toBe(14);
    expect(day.phase).toBe("Inicial");
    expect(day.rootDepth).toBe(0.226);
    expect(day.kc).toBe(0.35);
    expect(day.kl).toBe(1);
    expect(day.ks).toBe(1);
    expect(day.et0).toBe(6.28);
    expect(day.etcPotential).toBe(2.2);
    expect(day.etc).toBe(2.2);
    expect(day.adt).toBe(13.79);
    expect(day.afd).toBe(5.52);
    expect(day.storage).toBe(11.59);
    expect(day.deficit).toBe(2.2);
    expect(day.shouldIrrigate).toBe(false);
    expect(day.recommendedGrossDepth).toBe(0);
  });
});
