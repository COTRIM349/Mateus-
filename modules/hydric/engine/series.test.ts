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

describe("computeSeries — dia bloqueado bloqueia downstream (correção Codex)", () => {
  it("ETo null no meio bloqueia os dias seguintes até re-âncora", () => {
    const days: SeriesDayInput[] = [
      { date: "2026-08-01", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-02", eto: null, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-03", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
    ];
    const s = computeSeries(days, fixed, 66.6);
    expect(s[1].computed).toBe(false); // dado ausente
    // dia 3 NÃO retoma do estado pré-lacuna (evita omitir fluxos do dia 2)
    expect(s[2].computed).toBe(false);
    expect(s[2].missing.join(" ")).toMatch(/re-âncora|interrompida/i);
  });

  it("re-âncora explícita retoma a série após a lacuna", () => {
    const days: SeriesDayInput[] = [
      { date: "2026-08-01", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-02", eto: null, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-03", eto: 6, kc: 1.0, rootDepthM: 0.6, rainfall: 0, irrigationGross: 0, segment: "realizado", anchorArm: 55 },
    ];
    const s = computeSeries(days, fixed, 66.6);
    expect(s[2].computed).toBe(true); // re-ancorado
  });
});

describe("computeSeries — crescimento radicular não cria depleção artificial", () => {
  it("dobrar a raiz aumenta a CAD e o ARM (água nova disponível, não déficit)", () => {
    // Solo cheio a 20 cm (ARM = CAD_20). No dia 2 a raiz vai a 40 cm.
    const cad20 = 22.204; // 1 camada de 20 cm do solo dourado
    const days: SeriesDayInput[] = [
      { date: "2026-08-01", eto: 0, kc: 1.0, rootDepthM: 0.2, rainfall: 0, irrigationGross: 0, segment: "realizado" },
      { date: "2026-08-02", eto: 0, kc: 1.0, rootDepthM: 0.4, rainfall: 0, irrigationGross: 0, segment: "realizado" },
    ];
    const s = computeSeries(days, fixed, cad20); // começa cheio a 20 cm
    // Dia 1: ARM ≈ CAD_20 (cheio). Dia 2: CAD dobra, Dr preservado (0) →
    // ARM cresce, %ARM permanece alto (não cai para ~50%).
    expect(s[0].pctArm!).toBeGreaterThan(95);
    expect(s[1].pctArm!).toBeGreaterThan(95);
    expect(s[1].cad!).toBeGreaterThan(s[0].cad!);
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
