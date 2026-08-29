import { describe, it, expect } from "vitest";
import { computeSeries, daysToReachAfd, type SeriesDayInput, type SeriesFixedParams } from "./series";
import type { SoilLayerCanonical } from "./hydricEngineV4";

const layers: SoilLayerCanonical[] = [
  { topM: 0.0, bottomM: 0.2, thetaCC: 0.31102, thetaPMP: 0.20000 },
  { topM: 0.2, bottomM: 0.4, thetaCC: 0.31102, thetaPMP: 0.20000 },
  { topM: 0.4, bottomM: 0.6, thetaCC: 0.31102, thetaPMP: 0.20000 },
];

const fixed: SeriesFixedParams = {
  effectiveSoilDepthM: 0.6,
  layers,
  pBase: 0.5,
  applicationEfficiency: 0.85,
  mode: "single",
};

describe("computeSeries — encadeia ARM dia a dia", () => {
  const days: SeriesDayInput[] = [
    { date: "2026-08-01", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
    { date: "2026-08-02", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
    { date: "2026-08-03", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
  ];

  it("ARM decresce a cada dia seco", () => {
    const s = computeSeries(days, fixed, 66.6);
    expect(s[0].arm!).toBeGreaterThan(s[1].arm!);
    expect(s[1].arm!).toBeGreaterThan(s[2].arm!);
  });

  it("Dr acumula (soma das ETc reais)", () => {
    const s = computeSeries(days, fixed, 66.6);
    // Sem chuva/irrigação: Dr_final ≈ Σ ETc_real
    const somaEtc = s.reduce((a, d) => a + (d.etcReal ?? 0), 0);
    expect(s[2].dr!).toBeCloseTo(somaEtc, 1);
  });
});

describe("computeSeries — chuva reabastece o perfil", () => {
  it("chuva no dia 2 reduz o Dr", () => {
    const days: SeriesDayInput[] = [
      { date: "2026-08-01", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-02", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 20, irrigationGross: 0, segment: "realizado" },
    ];
    const s = computeSeries(days, fixed, 40);
    expect(s[1].dr!).toBeLessThan(s[0].dr!);
  });
});

describe("computeSeries — dia bloqueado mantém ARM anterior", () => {
  it("ETo null no meio não zera o encadeamento", () => {
    const days: SeriesDayInput[] = [
      { date: "2026-08-01", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-02", eto: null, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-03", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
    ];
    const s = computeSeries(days, fixed, 66.6);
    expect(s[1].computed).toBe(false);
    // dia 3 usa o ARM do dia 1 (dia 2 não avançou)
    expect(s[2].computed).toBe(true);
    expect(s[2].arm!).toBeLessThan(s[0].arm!);
  });
});

describe("daysToReachAfd — simulação (spec-2 §27)", () => {
  it("retorna o índice do dia em que Dr ≥ AFD", () => {
    const days: SeriesDayInput[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-08-0${i + 1}`, eto: 6, kc: 1.1, rootDepthM: 0.6,
      rainfall: 0, irrigationGross: 0, segment: "previsto" as const,
    }));
    const s = computeSeries(days, fixed, 66.6);
    const d = daysToReachAfd(s);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThanOrEqual(0);
  });
});
