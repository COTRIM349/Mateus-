import { describe, it, expect } from "vitest";
import {
  computeDailyBalanceV4,
  calculateKs,
  classifyState,
  effectiveRainfall,
  adjustP,
  type SoilLayerCanonical,
} from "./hydricEngineV4";

// Camadas canônicas (volumétricas) equivalentes ao solo do teste dourado.
// DTA peso 1,1102 mm/cm ⇒ ΔθVol = 0,11102 cm³/cm³ por camada de 20 cm.
const layers: SoilLayerCanonical[] = [
  { topM: 0.0, bottomM: 0.2, thetaCC: 0.31102, thetaPMP: 0.20000 },
  { topM: 0.2, bottomM: 0.4, thetaCC: 0.31102, thetaPMP: 0.20000 },
  { topM: 0.4, bottomM: 0.6, thetaCC: 0.31102, thetaPMP: 0.20000 },
];

describe("computeDailyBalanceV4 — bloqueio por dado ausente (spec §2)", () => {
  const baseOk = {
    eto: 6, kc: 1.1, rootDepthM: 0.6, effectiveSoilDepthM: 0.6,
    layers, pBase: 0.5, rainfall: 0, irrigationGross: 0,
    applicationEfficiency: 0.85, previousArm: 66.6, mode: "single" as const,
  };

  it("ETo null → não computa, lista requisito faltante", () => {
    const r = computeDailyBalanceV4({ ...baseOk, eto: null });
    expect(r.computed).toBe(false);
    expect(r.missing.join(" ")).toMatch(/ETo/);
    expect(r.state).toBe("indisponivel");
  });

  it("Chuva null → bloqueia (não assume 0)", () => {
    const r = computeDailyBalanceV4({ ...baseOk, rainfall: null });
    expect(r.computed).toBe(false);
    expect(r.missing.join(" ")).toMatch(/Chuva/);
  });

  it("chuva=0 explícito é válido (0 real ≠ ausente)", () => {
    const r = computeDailyBalanceV4({ ...baseOk, rainfall: 0 });
    expect(r.computed).toBe(true);
    expect(r.effectiveRain).toBe(0);
  });
});

describe("computeDailyBalanceV4 — cenário SOJA R5 (spec-2 §44)", () => {
  // CTA ≈ 66,6 mm; ARM inicial 39,1 ⇒ Dr 27,5. ETo 5,6 Kc 1,1.
  const r = computeDailyBalanceV4({
    eto: 5.6, kc: 1.1, kl: 1, rootDepthM: 0.6, effectiveSoilDepthM: 0.6,
    layers, pBase: 0.5, rainfall: 0, irrigationGross: 0,
    applicationEfficiency: 0.85, previousArm: 39.1, mode: "single",
  });

  it("computa e CTA ≈ 66,6 mm", () => {
    expect(r.computed).toBe(true);
    expect(r.cad).toBeCloseTo(66.6, 0);
  });

  it("ETc potencial = ETo × Kc ≈ 6,16 mm", () => {
    expect(r.etcPotential).toBeCloseTo(6.16, 1);
  });

  it("Dr inicial 27,5 ≤ AFD ⇒ Ks = 1 (sem estresse)", () => {
    expect(r.ks).toBe(1);
  });

  it("ETc real = potencial quando Ks=1", () => {
    expect(r.etcReal).toBeCloseTo(r.etcPotential!, 2);
  });

  it("estado nunca é 'critico' nem 'indisponivel' quando Ks=1 e há dados", () => {
    // O dia pode terminar 'abaixo_seguranca' se a ETc consumida ultrapassar
    // a AFD (Ks=1 é do INÍCIO do dia); o que não pode é crítico/indisponível.
    expect(r.state).not.toBe("critico");
    expect(r.state).not.toBe("indisponivel");
  });
});

describe("computeDailyBalanceV4 — Ks reduz ETc sob estresse (correção vs legado)", () => {
  it("Dr > AFD ⇒ Ks < 1 ⇒ ETc real < ETc potencial", () => {
    const r = computeDailyBalanceV4({
      eto: 6, kc: 1.1, rootDepthM: 0.6, effectiveSoilDepthM: 0.6,
      layers, pBase: 0.5, rainfall: 0, irrigationGross: 0,
      applicationEfficiency: 0.85, previousArm: 26.6, // Dr ≈ 40
      mode: "single",
    });
    // Com p ajustado pela FAO-56 (ETc alta ⇒ p menor ⇒ AFD menor), Ks fica
    // MAIS restritivo que o 0.80 do teste estático §38 (que usa FD fixo 0.5).
    // Aqui p_adj ≈ 0.436 ⇒ Ks ≈ 0.71. O invariante é Ks<1 e ETc_real<potencial.
    expect(r.ks!).toBeLessThan(1);
    expect(r.ks!).toBeCloseTo(0.71, 1);
    expect(r.etcReal!).toBeLessThan(r.etcPotential!);
  });
});

describe("computeDailyBalanceV4 — chuva forte gera drenagem, não água negativa", () => {
  it("chuva grande ⇒ ARM cap em CAD + percolação", () => {
    const r = computeDailyBalanceV4({
      eto: 5, kc: 1.0, rootDepthM: 0.6, effectiveSoilDepthM: 0.6,
      layers, pBase: 0.5, rainfall: 80, irrigationGross: 0,
      applicationEfficiency: 0.85, previousArm: 60, mode: "single",
      effectiveRainRule: { kind: "full" },
    });
    expect(r.arm).toBeLessThanOrEqual(r.cad!);
    expect(r.deepPercolation!).toBeGreaterThan(0);
    expect(r.dr!).toBeGreaterThanOrEqual(0);
  });
});

describe("funções puras auxiliares", () => {
  it("adjustP FAO-56 eq.84 e limites [0.1, 0.8]", () => {
    expect(adjustP(0.5, 5)).toBeCloseTo(0.5, 3);   // ETc=5 ⇒ sem ajuste
    expect(adjustP(0.5, 3)).toBeCloseTo(0.58, 2);  // ETc baixa ⇒ p sobe
    expect(adjustP(0.5, 15)).toBe(0.1);            // ETc alta ⇒ satura no mín
  });

  it("calculateKs limites", () => {
    expect(calculateKs(66.6, 20, 33.3, 0.5)).toBe(1);
    expect(calculateKs(66.6, 40, 33.3, 0.5)).toBeCloseTo(0.8, 1);
    expect(calculateKs(66.6, 66.6, 33.3, 0.5)).toBe(0);
  });

  it("effectiveRainfall por regra", () => {
    expect(effectiveRainfall(10, { kind: "fixed_fraction", fraction: 0.8 })).toBeCloseTo(8);
    expect(effectiveRainfall(10, { kind: "threshold", abstractionMm: 3 })).toBeCloseTo(7);
    expect(effectiveRainfall(10, { kind: "full" })).toBe(10);
    expect(effectiveRainfall(0, { kind: "full" })).toBe(0);
  });
});

// ── Correções de revisão (Codex) ────────────────────────────────────────────

describe("classifyState — estado 'alerta' é alcançável (correção Codex)", () => {
  it("Dr logo acima da AFD cai em 'alerta', não pula pra abaixo_seguranca", () => {
    // CAD 66,6; AFD 33,3 (p 0,5). Dr = 45 (> AFD, < AFD+(CAD-AFD)/2=49,95).
    const state = classifyState(true, 66.6, 66.6 - 45, 33.3, 0.7);
    expect(state).toBe("alerta");
  });
  it("Dr bem acima da AFD cai em abaixo_seguranca/critico", () => {
    const state = classifyState(true, 66.6, 66.6 - 60, 33.3, 0.2);
    expect(["abaixo_seguranca", "critico"]).toContain(state);
  });
});

describe("modo dual exige Ke (correção Codex)", () => {
  const layersDual: SoilLayerCanonical[] = [
    { topM: 0, bottomM: 0.6, thetaCC: 0.31102, thetaPMP: 0.2 },
  ];
  it("dual sem Ke → bloqueia com requisito de Ke", () => {
    const r = computeDailyBalanceV4({
      eto: 6, kc: 0.9, rootDepthM: 0.6, effectiveSoilDepthM: 0.6,
      layers: layersDual, pBase: 0.5, rainfall: 0, irrigationGross: 0,
      applicationEfficiency: 0.85, previousArm: 60, mode: "dual", ke: null,
    });
    expect(r.computed).toBe(false);
    expect(r.missing.join(" ")).toMatch(/Ke/);
  });
  it("dual com Ke computa", () => {
    const r = computeDailyBalanceV4({
      eto: 6, kc: 0.9, rootDepthM: 0.6, effectiveSoilDepthM: 0.6,
      layers: layersDual, pBase: 0.5, rainfall: 0, irrigationGross: 0,
      applicationEfficiency: 0.85, previousArm: 60, mode: "dual", ke: 0.15,
    });
    expect(r.computed).toBe(true);
  });
});
