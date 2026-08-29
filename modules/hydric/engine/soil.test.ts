import { describe, it, expect } from "vitest";
import {
  calculateDTA,
  calculateLayerCTA,
  resolveRootLayers,
  calculateCTA,
  calculateCRA,
  calculateRootZoneStorage,
  calculateKsFromDepletion,
  type SoilLayerInput,
} from "./soil";

// ═══════════════════════════════════════════════════════════════════════════
//  TESTE DOURADO (spec-2 §38) — números exatos do prompt
// ═══════════════════════════════════════════════════════════════════════════

describe("Teste dourado §38 — solo 3 camadas em % peso, raiz 60 cm", () => {
  const layers: SoilLayerInput[] = [
    { thicknessCm: 20, fieldCapacity: 12.4, wiltingPoint: 6.3, bulkDensity: 1.82, unit: "weight_pct" },
    { thicknessCm: 20, fieldCapacity: 12.2, wiltingPoint: 6.1, bulkDensity: 1.82, unit: "weight_pct" },
    { thicknessCm: 20, fieldCapacity: 12.2, wiltingPoint: 6.1, bulkDensity: 1.82, unit: "weight_pct" },
  ];

  it("DTA camada 1 ≈ 1,1102 mm/cm", () => {
    const dta = calculateDTA(12.4, 6.3, 1.82, "weight_pct");
    expect(dta).toBeCloseTo(1.1102, 4);
  });

  it("CTA camada 1 ≈ 22,20 mm", () => {
    const dta = calculateDTA(12.4, 6.3, 1.82, "weight_pct")!;
    expect(calculateLayerCTA(dta, 20)).toBeCloseTo(22.204, 2);
  });

  it("CTA camadas 2 e 3 ≈ 22,20 mm cada", () => {
    const dta = calculateDTA(12.2, 6.1, 1.82, "weight_pct")!;
    expect(calculateLayerCTA(dta, 20)).toBeCloseTo(22.204, 2);
  });

  it("CTA total ≈ 66,61 mm (raiz alcança as 3 camadas)", () => {
    const resolved = resolveRootLayers(layers, 60);
    const { value } = calculateCTA(resolved);
    expect(value).toBeCloseTo(66.61, 1);
  });

  it("CRA ≈ 33,31 mm com FD = 0,50", () => {
    const resolved = resolveRootLayers(layers, 60);
    const cta = calculateCTA(resolved).value!;
    expect(calculateCRA(cta, 0.5)).toBeCloseTo(33.31, 1);
  });

  it("Ks ≈ 0,80 com Dr = 40 mm", () => {
    const resolved = resolveRootLayers(layers, 60);
    const cta = calculateCTA(resolved).value!;
    const cra = calculateCRA(cta, 0.5);
    const ks = calculateKsFromDepletion(cta, cra, 40);
    expect(ks).toBeCloseTo(0.80, 2);
  });
});

// ── DTA por unidade (spec-2 §3) ─────────────────────────────────────────────

describe("calculateDTA — fórmula muda por unidade", () => {
  it("% peso aplica densidade: ((CC−PMP)×Da)/10", () => {
    expect(calculateDTA(12.4, 6.3, 1.82, "weight_pct")).toBeCloseTo(1.1102, 4);
  });
  it("% volumétrico NÃO aplica densidade: (CC−PMP)/10", () => {
    expect(calculateDTA(30, 15, null, "volumetric_pct")).toBeCloseTo(1.5, 4);
  });
  it("m³/m³: (CC−PMP)×10", () => {
    expect(calculateDTA(0.30, 0.15, null, "m3_m3")).toBeCloseTo(1.5, 4);
  });
  it("% peso sem densidade → null (dado obrigatório ausente)", () => {
    expect(calculateDTA(12.4, 6.3, null, "weight_pct")).toBeNull();
    expect(calculateDTA(12.4, 6.3, 0, "weight_pct")).toBeNull();
  });
});

// ── Raiz parcial em camada (spec-2 §4 — não somar camada não alcançada) ─────

describe("resolveRootLayers — exploração parcial", () => {
  const layers: SoilLayerInput[] = [
    { thicknessCm: 20, fieldCapacity: 12.4, wiltingPoint: 6.3, bulkDensity: 1.82, unit: "weight_pct" },
    { thicknessCm: 20, fieldCapacity: 12.2, wiltingPoint: 6.1, bulkDensity: 1.82, unit: "weight_pct" },
    { thicknessCm: 20, fieldCapacity: 12.2, wiltingPoint: 6.1, bulkDensity: 1.82, unit: "weight_pct" },
  ];

  it("raiz 50 cm → camada 3 explora só 10 cm", () => {
    const r = resolveRootLayers(layers, 50);
    expect(r[0].exploredCm).toBe(20);
    expect(r[1].exploredCm).toBe(20);
    expect(r[2].exploredCm).toBe(10);
  });

  it("CTA com raiz 50 cm ≈ 22,2 + 22,2 + 11,1 = 55,5 mm", () => {
    const r = resolveRootLayers(layers, 50);
    const cta = calculateCTA(r).value!;
    expect(cta).toBeCloseTo(55.51, 1);
  });

  it("raiz 60 cm não infla além das 3 camadas (não usa 80+)", () => {
    const r = resolveRootLayers(layers, 100);
    expect(r[2].exploredCm).toBe(20); // capado na espessura real
    expect(calculateCTA(r).value).toBeCloseTo(66.61, 1);
  });
});

// ── CTA bloqueia quando falta dado obrigatório (spec-2 §1) ──────────────────

describe("calculateCTA — dado ausente bloqueia (não vira 0)", () => {
  it("camada explorada sem densidade em base peso → CTA null + missing", () => {
    const layers: SoilLayerInput[] = [
      { thicknessCm: 20, fieldCapacity: 12.4, wiltingPoint: 6.3, bulkDensity: null, unit: "weight_pct" },
    ];
    const r = resolveRootLayers(layers, 20);
    const { value, missing } = calculateCTA(r);
    expect(value).toBeNull();
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]).toMatch(/Densidade aparente/);
  });

  it("camada NÃO explorada sem dado não bloqueia (ignorada)", () => {
    const layers: SoilLayerInput[] = [
      { thicknessCm: 20, fieldCapacity: 12.4, wiltingPoint: 6.3, bulkDensity: 1.82, unit: "weight_pct" },
      { thicknessCm: 20, fieldCapacity: 12.2, wiltingPoint: 6.1, bulkDensity: null, unit: "weight_pct" },
    ];
    const r = resolveRootLayers(layers, 20); // raiz só na camada 1
    const { value } = calculateCTA(r);
    expect(value).toBeCloseTo(22.204, 2);
  });
});

// ── ARM e Ks (spec-2 §8, §11) ───────────────────────────────────────────────

describe("armazenamento e Ks", () => {
  it("ARM = CTA − Dr, limitado a [0, CTA]", () => {
    expect(calculateRootZoneStorage(66.6, 27.5)).toBeCloseTo(39.1, 1);
    expect(calculateRootZoneStorage(66.6, 100)).toBe(0);
    expect(calculateRootZoneStorage(66.6, -5)).toBe(66.6);
  });
  it("Ks = 1 quando Dr ≤ CRA", () => {
    expect(calculateKsFromDepletion(66.6, 33.3, 20)).toBe(1);
    expect(calculateKsFromDepletion(66.6, 33.3, 33.3)).toBe(1);
  });
  it("Ks < 1 quando Dr > CRA", () => {
    expect(calculateKsFromDepletion(66.6, 33.3, 40)).toBeCloseTo(0.799, 2);
    expect(calculateKsFromDepletion(66.6, 33.3, 66.6)).toBe(0);
  });
});
