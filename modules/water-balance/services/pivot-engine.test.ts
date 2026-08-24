import { describe, expect, it } from "vitest";
import { calculateADT, computePivotBalanceSeries, type PivotEngineInput } from "./pivot-engine";
import { moisturePercentOfFieldCapacity, safetyMoistureMm } from "./soil-water-balance";
import { calculateEffectivePrecipitation } from "@/modules/weather/services";

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
    expect(withLayers[0].ks).toBe(1);
    expect(withLayers[0].kl).toBe(1);
    expect(withLayers[0].etc).toBe(withLayers[0].etcPotential);
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

function weatherDays(start: string, days: number, et0: number): Record<string, { et0: number; precipitation: number }> {
  const out: Record<string, { et0: number; precipitation: number }> = {};
  const t0 = new Date(`${start}T00:00:00`).getTime();
  for (let i = 0; i < days; i++) {
    const date = new Date(t0 + i * 86400000).toISOString().slice(0, 10);
    out[date] = { et0, precipitation: 0 };
  }
  return out;
}

describe("computePivotBalanceSeries — Ks, KL e Ky (Etapa E)", () => {
  it("no primeiro dia (solo em CC) Ks=1, KL=1 e ETc = ETo × Kc", () => {
    const series = computePivotBalanceSeries(sampleInput());
    expect(series[0].ks).toBe(1);
    expect(series[0].kl).toBe(1);
    expect(series[0].etcPotential).toBe(5);
    expect(series[0].etc).toBe(5);
    expect(series[0].mapStatus).toBe("boa_umidade");
    expect(series[0].etcFormula).toContain("ETo × Kc × KL × Ks");
  });

  it("após Dr > AFD, Ks cai e a ETc ajustada fica menor que a potencial", () => {
    const series = computePivotBalanceSeries(
      sampleInput({
        weatherByDate: weatherDays("2026-01-01", 10, 8),
        dateEnd: "2026-01-10",
      }),
    );
    const stressed = series.filter((d) => d.ks < 1);
    expect(stressed.length).toBeGreaterThan(0);
    expect(stressed[0].etc).toBeLessThan(stressed[0].etcPotential);
    expect(stressed[0].kcAdjusted).toBeLessThan(stressed[0].kc);
  });

  it("ks_function=none mantém Ks=1 mesmo depletado", () => {
    const series = computePivotBalanceSeries(
      sampleInput({
        culture: { root_depth: 0.3, depletion_factor: 0.5, ks_function: "none" },
        weatherByDate: weatherDays("2026-01-01", 10, 8),
        dateEnd: "2026-01-10",
      }),
    );
    expect(series.every((d) => d.ks === 1)).toBe(true);
  });

  it("Ky não altera a lâmina recomendada nem a ETc (fao33 vira linear no ETc)", () => {
    const base = {
      weatherByDate: weatherDays("2026-01-01", 10, 8),
      dateEnd: "2026-01-10" as const,
    };
    const lowKy = computePivotBalanceSeries(
      sampleInput({
        ...base,
        culture: { root_depth: 0.3, depletion_factor: 0.5, ky: 0.2, ks_function: "fao33" },
      }),
    );
    const highKy = computePivotBalanceSeries(
      sampleInput({
        ...base,
        culture: { root_depth: 0.3, depletion_factor: 0.5, ky: 1.5, ks_function: "fao33" },
      }),
    );
    const lastLo = lowKy[lowKy.length - 1];
    const lastHi = highKy[highKy.length - 1];
    expect(lastLo.etc).toBe(lastHi.etc);
    expect(lastLo.recommendedNetDepth).toBe(lastHi.recommendedNetDepth);
    expect(lastLo.ks).toBe(lastHi.ks);
    expect(lastHi.yieldRisk).toBeGreaterThan(lastLo.yieldRisk ?? 0);
  });

  it("KL da parcela reduz ETc potencial; default continua 1", () => {
    const full = computePivotBalanceSeries(sampleInput());
    const localized = computePivotBalanceSeries(
      sampleInput({
        assignment: {
          ...sampleInput().assignment,
          kl_override: 0.6,
        },
      }),
    );
    expect(full[0].kl).toBe(1);
    expect(localized[0].kl).toBe(0.6);
    expect(localized[0].etcPotential).toBeCloseTo(full[0].etcPotential * 0.6, 2);
  });
});

describe("computePivotBalanceSeries — núcleo do solo (Etapa F)", () => {
  it("dia 1: ARM começa na CAD, perde ETc e umidade de segurança = CAD − AFD", () => {
    const day = computePivotBalanceSeries(sampleInput())[0];
    expect(day.adt).toBe(54);
    expect(day.storage).toBe(49);
    expect(day.safetyMoistureMm).toBe(safetyMoistureMm(54, 27));
    expect(day.safetyMoistureMm).toBe(27);
    expect(day.moisturePctCc).toBe(moisturePercentOfFieldCapacity(49, 54, 0.3, 0.12));
    expect(day.moisturePctCc).not.toBeCloseTo((49 / 54) * 100, 0);
    expect(day.balanceFormula).toContain("ARM");
  });

  it("Pe USDA-SCS é limitada pelo espaço até a CAD", () => {
    const day = computePivotBalanceSeries(
      sampleInput({
        weatherByDate: { "2026-01-01": { et0: 2, precipitation: 20 } },
      }),
    )[0];
    expect(day.storage).toBe(54);
    expect(day.surplus).toBeGreaterThan(0);
    expect(day.effectivePrecipitation).toBeLessThan(20);
    expect(day.effectivePrecipitation).toBeLessThanOrEqual(calculateEffectivePrecipitation(20));
    expect(day.peFormula).toContain("USDA-SCS");
  });

  it("irrigação efetiva (bruta × eficiência) entra no ARM", () => {
    const dry = computePivotBalanceSeries(sampleInput())[0];
    const wet = computePivotBalanceSeries(
      sampleInput({ irrigationByDate: { "2026-01-01": 20 } }),
    )[0];
    expect(wet.effectiveIrrigation).toBe(17);
    expect(wet.storage).toBeGreaterThan(dry.storage);
    expect(wet.storage).toBe(54);
    expect(wet.surplus).toBeGreaterThan(0);
  });

  it("preserva a fração ARM/CAD quando a raiz (e a CAD) cresce", () => {
    const phases = [
      {
        phase_order: 1,
        name: "Desenvolvimento",
        days_after_plant: 0,
        duration_days: 10,
        kc_start: 0.4,
        kc_end: 0.4,
        root_depth_start: 0.15,
        root_depth_end: 0.45,
        depletion_factor: 0.5,
      },
    ];
    const series = computePivotBalanceSeries(
      sampleInput({
        culture: { root_depth: 0.45, depletion_factor: 0.5 },
        phases,
        weatherByDate: weatherDays("2026-01-01", 2, 5),
        dateEnd: "2026-01-02",
      }),
    );
    expect(series[1].adt).toBeGreaterThan(series[0].adt);
    // dia 0: CAD 27, ETc 2 → ARM 25; dia 1 CAD 32,4 → ARM inicial 30; ETc 2 → 28
    expect(series[0].adt).toBe(27);
    expect(series[0].storage).toBe(25);
    expect(series[1].adt).toBe(32.4);
    expect(series[1].storage).toBe(28);
  });
});

