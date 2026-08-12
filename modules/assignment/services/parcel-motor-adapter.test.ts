import { describe, it, expect } from "vitest";
import {
  resolveKl,
  resolveKsFunction,
  resolveItnFraction,
  applyKlToKc,
  applyItnToDepth,
  calculateKs,
  shouldIrrigateAtStressPoint,
} from "./parcel-motor-adapter";

// ── resolveKl ──────────────────────────────────────────────────────────────

describe("resolveKl — cadeia override parcela > cultura > default 1.0", () => {
  it("override da parcela vence", () => {
    expect(resolveKl({ kl_override: 0.7 }, { kl: 0.9 })).toBe(0.7);
  });
  it("sem override, usa Kl da cultura", () => {
    expect(resolveKl({ kl_override: null }, { kl: 0.85 })).toBe(0.85);
  });
  it("sem nada, retorna 1.0 (pivô central)", () => {
    expect(resolveKl({ kl_override: null }, { kl: null })).toBe(1.0);
  });
  it("valores zero ou negativos são ignorados", () => {
    expect(resolveKl({ kl_override: 0 }, { kl: 0.9 })).toBe(0.9);
    expect(resolveKl({ kl_override: -1 }, { kl: null })).toBe(1.0);
  });
});

// ── resolveKsFunction ──────────────────────────────────────────────────────

describe("resolveKsFunction — cadeia parcela > fase > cultura > linear", () => {
  it("override da parcela vence", () => {
    const r = resolveKsFunction(
      { ks_function_override: "exponential" },
      { ks_function: "sigmoid" },
      { ks_function: "none" },
    );
    expect(r).toBe("exponential");
  });
  it("sem parcela, usa fase", () => {
    const r = resolveKsFunction(
      { ks_function_override: null },
      { ks_function: "sigmoid" },
      { ks_function: "none" },
    );
    expect(r).toBe("sigmoid");
  });
  it("sem parcela e fase, usa cultura", () => {
    const r = resolveKsFunction(
      { ks_function_override: null },
      null,
      { ks_function: "exponential" },
    );
    expect(r).toBe("exponential");
  });
  it("nada preenchido → linear (padrão FAO-56)", () => {
    expect(resolveKsFunction({ ks_function_override: null }, null, { ks_function: null })).toBe("linear");
  });
});

// ── resolveItnFraction ─────────────────────────────────────────────────────

describe("resolveItnFraction", () => {
  it("100% → 1.0", () => {
    expect(resolveItnFraction({ itn_pct: 100 })).toBe(1.0);
  });
  it("80% (irrigação deficitária) → 0.8", () => {
    expect(resolveItnFraction({ itn_pct: 80 })).toBeCloseTo(0.8);
  });
  it("null → 1.0 (default)", () => {
    expect(resolveItnFraction({ itn_pct: null })).toBe(1.0);
    expect(resolveItnFraction(null)).toBe(1.0);
  });
  it("valores negativos ignorados", () => {
    expect(resolveItnFraction({ itn_pct: -20 })).toBe(1.0);
  });
});

// ── applyKlToKc / applyItnToDepth ──────────────────────────────────────────

describe("aplicação de Kl e ITN", () => {
  it("Kc × Kl (gotejamento reduz demanda)", () => {
    expect(applyKlToKc(1.15, 0.6)).toBeCloseTo(0.69);
  });
  it("lâmina × ITN (fase não-crítica reduz reposição)", () => {
    expect(applyItnToDepth(10, 0.7)).toBeCloseTo(7);
  });
});

// ── calculateKs — cada função ──────────────────────────────────────────────

describe("calculateKs — sem estresse (depleção ≤ p)", () => {
  it("linear: Ks = 1 quando depleção ≤ p", () => {
    expect(calculateKs(0.3, 0.5, "linear")).toBe(1);
    expect(calculateKs(0.5, 0.5, "linear")).toBe(1);
  });
  it("todas as funções concordam nessa zona", () => {
    for (const fn of ["linear", "exponential", "sigmoid"] as const) {
      expect(calculateKs(0.3, 0.5, fn)).toBe(1);
    }
  });
});

describe("calculateKs — depleção total (100%)", () => {
  it("linear: Ks = 0 na depleção total", () => {
    expect(calculateKs(1, 0.5, "linear")).toBe(0);
  });
  it("none: sempre 1", () => {
    expect(calculateKs(1, 0.5, "none")).toBe(1);
  });
});

describe("calculateKs — na zona de estresse (p < d < 1)", () => {
  it("linear: decai proporcionalmente entre p e 1", () => {
    // depleção 0.75, p=0.5 → excess = (0.75-0.5)/(1-0.5) = 0.5 → Ks = 0.5
    expect(calculateKs(0.75, 0.5, "linear")).toBeCloseTo(0.5);
  });
  it("exponencial decai mais rápido que linear (mesma condição)", () => {
    const ksLin = calculateKs(0.75, 0.5, "linear");
    const ksExp = calculateKs(0.75, 0.5, "exponential");
    expect(ksExp).toBeLessThan(ksLin);
  });
  it("sigmoid entre 0 e 1 em qualquer ponto", () => {
    const ks = calculateKs(0.7, 0.5, "sigmoid");
    expect(ks).toBeGreaterThan(0);
    expect(ks).toBeLessThan(1);
  });
});

// ── shouldIrrigateAtStressPoint ────────────────────────────────────────────

describe("shouldIrrigateAtStressPoint", () => {
  it("false por padrão (irriga preventivamente)", () => {
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: false }, 0.8, 0.5)).toBe(false);
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: null }, 0.8, 0.5)).toBe(false);
  });
  it("true e depleção ≥ p → deve irrigar", () => {
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: true }, 0.6, 0.5)).toBe(true);
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: true }, 1.0, 0.5)).toBe(true);
  });
  it("true e depleção < p → aguarda", () => {
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: true }, 0.3, 0.5)).toBe(false);
  });
});
