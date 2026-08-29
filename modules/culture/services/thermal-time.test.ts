import { describe, expect, it } from "vitest";
import {
  accumulateDegreeDays,
  bestBaseTemperatureCandidate,
  calculateDailyDegreeDays,
  calculatePhotoperiodHours,
  evaluateBaseTemperatureCandidates,
  summarizeThermalValues,
  totalDegreeDays,
} from "./thermal-time";

describe("calculateDailyDegreeDays", () => {
  it("usa média simples e nunca retorna GD negativo", () => {
    expect(
      calculateDailyDegreeDays(18, 30, { baseTemperatureC: 14 }),
    ).toBe(10);

    expect(
      calculateDailyDegreeDays(8, 12, { baseTemperatureC: 14 }),
    ).toBe(0);
  });

  it("aceita Tmax/Tmin invertidas sem alterar o resultado", () => {
    const a = calculateDailyDegreeDays(18, 30, { baseTemperatureC: 14 });
    const b = calculateDailyDegreeDays(30, 18, { baseTemperatureC: 14 });
    expect(a).toBe(b);
  });

  it("limita temperaturas no método capped", () => {
    expect(
      calculateDailyDegreeDays(20, 40, {
        baseTemperatureC: 15,
        upperTemperatureC: 30,
        method: "simple_mean_capped",
      }),
    ).toBe(10);
  });
});

describe("accumulateDegreeDays", () => {
  const weather = [
    { date: "2026-10-01", tminC: 18, tmaxC: 30 },
    { date: "2026-10-02", tminC: 20, tmaxC: 32 },
  ];

  it("acumula GD dia após dia de forma determinística", () => {
    const result = accumulateDegreeDays(weather, { baseTemperatureC: 14 });
    expect(result[0].degreeDays).toBe(10);
    expect(result[0].accumulatedDegreeDays).toBe(10);
    expect(result[1].degreeDays).toBe(12);
    expect(result[1].accumulatedDegreeDays).toBe(22);
    expect(totalDegreeDays(weather, { baseTemperatureC: 14 })).toBe(22);
  });
});

describe("calculatePhotoperiodHours", () => {
  it("fica próximo de 12 h no equinócio em baixa latitude", () => {
    const hours = calculatePhotoperiodHours("2026-09-22", -12.5);
    expect(hours).toBeGreaterThan(11.7);
    expect(hours).toBeLessThan(12.3);
  });

  it("responde sazonalmente à latitude", () => {
    const summer = calculatePhotoperiodHours("2026-12-21", -15);
    const winter = calculatePhotoperiodHours("2026-06-21", -15);
    expect(summer).toBeGreaterThan(winter);
  });
});

describe("summarizeThermalValues", () => {
  it("calcula estatísticas auditáveis", () => {
    const summary = summarizeThermalValues([100, 110, 120, 130, 140]);
    expect(summary.n).toBe(5);
    expect(summary.mean).toBe(120);
    expect(summary.median).toBe(120);
    expect(summary.min).toBe(100);
    expect(summary.max).toBe(140);
    expect(summary.standardDeviation).toBeGreaterThan(0);
    expect(summary.cvPct).toBeGreaterThan(0);
  });
});

describe("evaluateBaseTemperatureCandidates", () => {
  const samples = [
    {
      id: "a",
      observedDae: 4,
      dailyTemperatures: [
        { date: "2026-01-01", tminC: 18, tmaxC: 30 },
        { date: "2026-01-02", tminC: 18, tmaxC: 30 },
        { date: "2026-01-03", tminC: 18, tmaxC: 30 },
        { date: "2026-01-04", tminC: 18, tmaxC: 30 },
      ],
    },
    {
      id: "b",
      observedDae: 4,
      dailyTemperatures: [
        { date: "2026-02-01", tminC: 19, tmaxC: 31 },
        { date: "2026-02-02", tminC: 19, tmaxC: 31 },
        { date: "2026-02-03", tminC: 19, tmaxC: 31 },
        { date: "2026-02-04", tminC: 19, tmaxC: 31 },
      ],
    },
  ];

  it("ranqueia candidatos sem aprová-los automaticamente", () => {
    const results = evaluateBaseTemperatureCandidates(samples, [12, 14, 16]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.n === 2)).toBe(true);
    expect(bestBaseTemperatureCandidate(results)).not.toBeNull();
    expect(results[0].score).not.toBeNull();
  });
});
