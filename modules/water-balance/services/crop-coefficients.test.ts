import { describe, expect, it } from "vitest";
import { calculateKs } from "@/modules/assignment/services/parcel-motor-adapter";
import {
  DEFAULT_CENTER_PIVOT_KL,
  calculateFao56Ks,
  computeKsForBalance,
  formatEtcFormula,
  interpretFao56Ks,
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
    expect(calculateFao56Ks({ cadMm: 66.61, afdMm: 33.31, drMm: 30 }).ks).toBe(1);
  });

  it("FAO-56: depleção 0,75 e p=0,5 → Ks = 0,5", () => {
    expect(computeKsForBalance({ depletionFraction: 0.75, p: 0.5 })).toBe(0.5);
    expect(calculateKs(0.75, 0.5, "linear")).toBeCloseTo(0.5);
  });

  it("Ks = (CAD − Dr) / (CAD − AFD) quando Dr > AFD", () => {
    const result = calculateFao56Ks({ cadMm: 66.61, afdMm: 33.31, drMm: 40 });
    expect(result.ks).toBeCloseTo((66.61 - 40) / (66.61 - 33.31), 3);
    expect(result.ks).toBeCloseTo(0.799, 3);
    expect(result.stressed).toBe(true);
    expect(result.formula).toContain("CAD − Dr");
    expect(result.formula).not.toContain("(CAD − AFD) / (CAD − Dr)");
  });

  it("não usa o recíproco (CAD − AFD) / (CAD − Dr), que estouraria Ks > 1", () => {
    const result = calculateFao56Ks({ cadMm: 66.61, afdMm: 33.31, drMm: 40 });
    const inverted = (66.61 - 33.31) / (66.61 - 40);
    expect(inverted).toBeGreaterThan(1);
    expect(result.ks).toBeLessThanOrEqual(1);
    expect(result.ks).not.toBeCloseTo(inverted, 2);
  });

  it("Ks = 0 quando Dr atinge a CAD", () => {
    expect(calculateFao56Ks({ cadMm: 60, afdMm: 30, drMm: 60 }).ks).toBe(0);
  });

  it("interpreta Ks = 1 como ausência de limitação hídrica", () => {
    expect(interpretFao56Ks(1)).toContain("não há limitação hídrica");
    expect(interpretFao56Ks(0.8)).toContain("AFD");
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

  it("a fórmula de ETc deixa Ks e Kc explícitos", () => {
    expect(formatEtcFormula(5, 1.15, 1, 0.8)).toContain("ETc_ajustada = Ks × Kc × ETo");
    expect(formatEtcFormula(5, 1.15, 1, 0.8)).toContain("0.8 × 1.15 × 5");
    expect(formatEtcFormula(5, 1.15, 0.6, 0.8)).toContain("KL");
  });
});
