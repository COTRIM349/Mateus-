import { describe, expect, it } from "vitest";
import { calculateKs } from "@/modules/assignment/services/parcel-motor-adapter";
import {
  DEFAULT_CENTER_PIVOT_KL,
  computeKsForBalance,
  formatEtcFormula,
  ksFunctionForEtc,
  resolveManejoKl,
  resolvePhaseKy,
  yieldRiskFraction,
} from "./crop-coefficients";

describe("KL do manejo", () => {
  it("pivô central sem override usa 1", () => {
    expect(resolveManejoKl({})).toBe(DEFAULT_CENTER_PIVOT_KL);
    expect(resolveManejoKl({ parcelOverride: null, cultureKl: null })).toBe(1);
  });

  it("parcela > fase > cultura", () => {
    expect(resolveManejoKl({ parcelOverride: 0.7, phaseKl: 0.8, cultureKl: 0.9 })).toBe(0.7);
    expect(resolveManejoKl({ parcelOverride: null, phaseKl: 0.8, cultureKl: 0.9 })).toBe(0.8);
    expect(resolveManejoKl({ cultureKl: 0.9 })).toBe(0.9);
  });
});

describe("Ks do ETc (sem Ky na lâmina)", () => {
  it("fao33 cai para linear FAO-56 no ETc", () => {
    expect(ksFunctionForEtc("fao33")).toBe("linear");
    expect(ksFunctionForEtc("none")).toBe("none");
  });

  it("Ks = 1 enquanto Dr ≤ AFD (depleção ≤ p)", () => {
    expect(computeKsForBalance({ depletionFraction: 0.4, p: 0.5 })).toBe(1);
  });

  it("FAO-56: depleção 0,75 e p=0,5 → Ks = 0,5", () => {
    expect(computeKsForBalance({ depletionFraction: 0.75, p: 0.5 })).toBe(0.5);
    expect(calculateKs(0.75, 0.5, "linear")).toBeCloseTo(0.5);
  });
});

describe("Ky — risco produtivo, não lâmina", () => {
  it("risco = Ky × (1 − Ks); nulo sem Ky", () => {
    expect(yieldRiskFraction(1, 0.5)).toBe(0.5);
    expect(yieldRiskFraction(0.8, 1)).toBe(0);
    expect(yieldRiskFraction(null, 0.5)).toBeNull();
  });

  it("Ky da fase vence o da cultura", () => {
    expect(resolvePhaseKy(1.0, 0.4)).toBe(1.0);
    expect(resolvePhaseKy(null, 0.4)).toBe(0.4);
    expect(resolvePhaseKy(null, null)).toBeNull();
  });

  it("a fórmula de ETc deixa Ks e KL explícitos", () => {
    expect(formatEtcFormula(5, 1.15, 1, 0.8)).toContain("ETo × Kc × KL × Ks");
    expect(formatEtcFormula(5, 1.15, 1, 0.8)).toContain("0.8");
  });
});
