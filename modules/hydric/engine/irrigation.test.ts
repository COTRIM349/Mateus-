import { describe, it, expect } from "vitest";
import {
  calculateETcPotential,
  calculateETcAdjusted,
  calculateEffectiveRain,
  calculateDepletion,
  calculateIrrigationRequirement,
  calculateGrossDepth,
  calculateIrrigationVolume,
  calculateRuntime,
  calculateDailyCapacity,
  estimateDaysToLimitApprox,
} from "./irrigation";

describe("ETc (spec-2 §15-16)", () => {
  it("potencial = ETo × Kc × Kl", () => {
    expect(calculateETcPotential(6, 1.1)).toBeCloseTo(6.6, 2);
    expect(calculateETcPotential(6, 1.1, 0.6)).toBeCloseTo(3.96, 2);
  });
  it("ajustada = potencial × Ks, guardada separada", () => {
    const pot = calculateETcPotential(6, 1.1);
    expect(calculateETcAdjusted(pot, 0.8)).toBeCloseTo(5.28, 2);
    expect(calculateETcAdjusted(pot, 1)).toBeCloseTo(pot, 2);
  });
});

describe("lâmina / volume / tempo (spec-2 §20-23)", () => {
  it("lâmina líquida = Dr − Dr_alvo", () => {
    expect(calculateIrrigationRequirement(27.5)).toBeCloseTo(27.5);
    expect(calculateIrrigationRequirement(27.5, 5)).toBeCloseTo(22.5);
    expect(calculateIrrigationRequirement(3, 5)).toBe(0);
  });
  it("lâmina bruta = LL / Ea (§21)", () => {
    expect(calculateGrossDepth(25, 0.85)).toBeCloseTo(29.41, 2);
    expect(calculateGrossDepth(25, 0)).toBe(0);
  });
  it("volume = LB × área × 10 (§22)", () => {
    expect(calculateIrrigationVolume(30, 150)).toBe(45000);
  });
  it("tempo = volume / vazão (§23)", () => {
    expect(calculateRuntime(45000, 300)).toBe(150);
    expect(calculateRuntime(45000, 0)).toBe(0);
  });
  it("capacidade diária (§24)", () => {
    expect(calculateDailyCapacity(300, 20, 150)).toBeCloseTo(4, 2);
  });
});

describe("chuva efetiva e depleção (spec-2 §9-10, §18)", () => {
  it("regras de chuva efetiva", () => {
    expect(calculateEffectiveRain(10, { kind: "fixed_fraction", fraction: 0.8 })).toBeCloseTo(8);
    expect(calculateEffectiveRain(10, { kind: "threshold", abstractionMm: 3 })).toBeCloseTo(7);
  });
  it("chuva grande zera Dr e gera drenagem (não água negativa §10)", () => {
    const r = calculateDepletion({
      drPrev: 10, effectiveRain: 40, irrigationEffective: 0,
      capillaryRise: 0, etcReal: 5, cta: 66.6,
    });
    expect(r.drNext).toBe(0);
    expect(r.deepPercolation).toBeCloseTo(25, 0);
  });
  it("Dr não passa da CTA", () => {
    const r = calculateDepletion({
      drPrev: 60, effectiveRain: 0, irrigationEffective: 0,
      capillaryRise: 0, etcReal: 20, cta: 66.6,
    });
    expect(r.drNext).toBe(66.6);
  });
});

describe("dias até o limite (spec-2 §27)", () => {
  it("aproximação (CRA − Dr)/ETc", () => {
    expect(estimateDaysToLimitApprox(33.3, 27.5, 6.1)).toBeCloseTo(0.95, 1);
    expect(estimateDaysToLimitApprox(33.3, 27.5, 0)).toBeNull();
  });
});
