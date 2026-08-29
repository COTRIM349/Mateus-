import { describe, expect, it } from "vitest";
import {
  calculateAccumulatedDegreeDays,
  calculateAdjustedDepletionFraction,
  calculateAdjustedEtcMm,
  calculateCalibrationStatistics,
  calculateDailyKc,
  calculateDayLengthHours,
  calculateDegreeDay,
  calculateKsFromCad,
  calculatePotentialEtcMm,
  calculateRawAfdMm,
  calculateRootDepthMeters,
  evaluateBaseTemperatureCandidates,
  interpolatePiecewiseLinear,
} from "./agronomic-engine";

describe("agronomic engine", () => {
  it("não permite graus-dia negativos", () => {
    expect(calculateDegreeDay({ tmaxC: 12, tminC: 6, baseTemperatureC: 10 })).toBe(0);
  });

  it("acumula GDA de forma monotônica", () => {
    const one = calculateAccumulatedDegreeDays([
      { tmaxC: 30, tminC: 20, baseTemperatureC: 10 },
    ]);
    const two = calculateAccumulatedDegreeDays([
      { tmaxC: 30, tminC: 20, baseTemperatureC: 10 },
      { tmaxC: 28, tminC: 18, baseTemperatureC: 10 },
    ]);
    expect(two).toBeGreaterThanOrEqual(one);
  });

  it("interpola Kc linearmente e permite patamar", () => {
    const points = [{ x: 0, y: 0.4 }, { x: 10, y: 0.4 }, { x: 20, y: 1.0 }];
    expect(calculateDailyKc(points, 5)).toBe(0.4);
    expect(calculateDailyKc(points, 15)).toBe(0.7);
  });

  it("rejeita pontos duplicados no mesmo X", () => {
    expect(() => interpolatePiecewiseLinear([{ x: 1, y: 0.4 }, { x: 1, y: 0.8 }], 1))
      .toThrow(/duplicados/i);
  });

  it("interpola profundidade radicular sem salto", () => {
    expect(calculateRootDepthMeters([{ x: 0, y: 0.2 }, { x: 20, y: 0.6 }], 10)).toBe(0.4);
  });

  it("calcula fotoperíodo plausível", () => {
    const hours = calculateDayLengthHours(-14.2, "2026-12-21");
    expect(hours).toBeGreaterThan(12);
    expect(hours).toBeLessThan(14);
  });

  it("usa ETc potencial para ajustar p", () => {
    expect(calculateAdjustedDepletionFraction(0.5, 5)).toBe(0.5);
    expect(calculateAdjustedDepletionFraction(0.5, 7)).toBe(0.42);
  });

  it("consome CAD externa para AFD/RAW e Ks", () => {
    const raw = calculateRawAfdMm(60, 0.5);
    expect(raw).toBe(30);
    expect(calculateKsFromCad({ cadMm: 60, depletionMm: 20, p: 0.5 })).toBe(1);
    expect(calculateKsFromCad({ cadMm: 60, depletionMm: 45, p: 0.5 })).toBe(0.5);
  });

  it("mantém Kc e Ks separados na ETc", () => {
    const potential = calculatePotentialEtcMm(6, 1.1);
    const adjusted = calculateAdjustedEtcMm(potential, 0.8);
    expect(potential).toBe(6.6);
    expect(adjusted).toBe(5.28);
  });

  it("calcula estatísticas determinísticas sem Monte Carlo", () => {
    const stats = calculateCalibrationStatistics([100, 110, 120]);
    expect(stats.n).toBe(3);
    expect(stats.mean).toBe(110);
    expect(stats.p50).toBe(110);
  });

  it("avalia Tb candidatas sem aprová-las automaticamente", () => {
    const result = evaluateBaseTemperatureCandidates(
      [
        { dailyTemperatures: [{ tmaxC: 30, tminC: 20 }, { tmaxC: 28, tminC: 18 }] },
        { dailyTemperatures: [{ tmaxC: 29, tminC: 19 }, { tmaxC: 27, tminC: 17 }] },
      ],
      [10, 12],
    );
    expect(result).toHaveLength(2);
    expect(result[0].n).toBe(2);
  });
});
