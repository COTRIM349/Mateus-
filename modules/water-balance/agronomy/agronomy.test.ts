import { describe, expect, it } from "vitest";
import {
  applyDepletionStep,
  calculateAdjustedFd,
  calculateDtaMmPerCm,
  calculateIrrigationRequirement,
  calculateKsFromDr,
  calculateRootZoneStorage,
  classifyAgronomicStatus,
  estimateDaysToCra,
  interpretKs,
  projectWaterBalance,
} from "./index";

/**
 * Exemplo de referência (item 38):
 * 3 camadas de 20 cm, CC/PMP em % em peso, Da 1,82, Zr 60 cm, FD 0,50.
 */
const REF_LAYERS = [
  { depthStartCm: 0, depthEndCm: 20, cc: 12.4, pmp: 6.3, bulkDensity: 1.82 },
  { depthStartCm: 20, depthEndCm: 40, cc: 12.2, pmp: 6.1, bulkDensity: 1.82 },
  { depthStartCm: 40, depthEndCm: 60, cc: 12.2, pmp: 6.1, bulkDensity: 1.82 },
];

describe("DTA por unidade", () => {
  it("% em peso 12,4 / 6,3 · Da 1,82 → 1,1102 mm/cm", () => {
    const dta = calculateDtaMmPerCm({
      cc: 12.4,
      pmp: 6.3,
      bulkDensity: 1.82,
      unit: "gravimetric_percent",
    });
    expect(dta.missing).toEqual([]);
    expect(dta.value).toBeCloseTo(1.1102, 4);
    expect(dta.formula).toContain("Da");
  });

  it("% volumétrica (CC−PMP)/10", () => {
    const dta = calculateDtaMmPerCm({ cc: 22.204, pmp: 11.102, unit: "volumetric_percent" });
    expect(dta.value).toBeCloseTo(1.1102, 4);
  });

  it("m³/m³ (CC−PMP)×10", () => {
    const dta = calculateDtaMmPerCm({ cc: 0.226, pmp: 0.11466, unit: "m3_m3" });
    expect(dta.value).toBeCloseTo(1.1134, 3);
  });

  it("não inventa Da na forma gravimétrica", () => {
    const dta = calculateDtaMmPerCm({ cc: 12.4, pmp: 6.3, unit: "gravimetric_percent" });
    expect(dta.value).toBeNull();
    expect(dta.missing.join(" ")).toMatch(/Da/);
  });
});

describe("CTA / CRA — exemplo de 60 cm", () => {
  it("três camadas · Zr 60 cm · FD 0,50", () => {
    const zone = calculateRootZoneStorage({
      layers: REF_LAYERS,
      unit: "gravimetric_percent",
      zrCm: 60,
      zrMaxCm: 60,
      zrMethod: "cadastro / estádio",
      fd: 0.5,
    });

    expect(zone.layers[0].dta.value).toBeCloseTo(1.1102, 4);
    expect(zone.layers[0].cta.value).toBeCloseTo(22.204, 2);
    expect(zone.layers[1].cta.value).toBeCloseTo(22.204, 2);
    expect(zone.layers[2].cta.value).toBeCloseTo(22.204, 2);
    expect(zone.cta.value).toBeCloseTo(66.61, 2);
    expect(zone.cra.value).toBeCloseTo(33.31, 2);
    expect(zone.missing).toEqual([]);
  });

  it("raiz a 50 cm explora só 10 cm da terceira camada", () => {
    const zone = calculateRootZoneStorage({
      layers: REF_LAYERS,
      unit: "gravimetric_percent",
      zrCm: 50,
      fd: 0.5,
    });
    expect(zone.layers[2].exploredCm).toBe(10);
    expect(zone.layers[2].cta.value).toBeCloseTo(11.102, 2);
    expect(zone.cta.value).toBeCloseTo(55.51, 2);
  });
});

describe("Ks FAO-56", () => {
  it("Dr 40 mm · CTA 66,61 · CRA 33,31 → Ks ≈ 0,80", () => {
    const zone = calculateRootZoneStorage({
      layers: REF_LAYERS,
      unit: "gravimetric_percent",
      zrCm: 60,
      fd: 0.5,
    });
    const ks = calculateKsFromDr({
      ctaMm: zone.cta.value,
      craMm: zone.cra.value,
      drMm: 40,
    });
    expect(ks.value).toBeCloseTo(0.8, 2);
    expect(ks.formula).toContain("CTA − Dr");
    expect(interpretKs(ks.value)).toMatch(/redução potencial da transpiração/i);
  });

  it("Dr ≤ CRA → Ks = 1", () => {
    const ks = calculateKsFromDr({ ctaMm: 66.61, craMm: 33.31, drMm: 20 });
    expect(ks.value).toBe(1);
  });
});

describe("Depleção e drenagem", () => {
  it("chuva que enche além da CC vira DP, Dr não fica negativo", () => {
    const step = applyDepletionStep({
      drStartMm: 10,
      ctaMm: 66.61,
      etcRealMm: 5,
      rainGrossMm: 40,
      effectiveRainMm: 40,
      effectiveIrrigationMm: 0,
      capillaryRiseMm: 0,
    });
    expect(step.drEndMm).toBe(0);
    expect(step.deepPercolationMm).toBeCloseTo(25, 4);
    expect(step.armMm).toBeCloseTo(66.61, 2);
  });
});

describe("FD automático FAO-56", () => {
  it("p_ajustado = p + 0,04×(5−ETc) com limites 0,10–0,80", () => {
    const fd = calculateAdjustedFd({ mode: "auto", pTable: 0.5, etcPotentialMm: 6.1 });
    expect(fd.pOriginal.value).toBe(0.5);
    expect(fd.pAdjusted.value).toBeCloseTo(0.456, 3);
    expect(fd.etcUsedMm.value).toBe(6.1);
  });
});

describe("Irrigação", () => {
  it("LL 25 mm · Ea 0,85 · 150 ha · 300 m³/h", () => {
    const r = calculateIrrigationRequirement({
      drMm: 25,
      efficiency: 0.85,
      areaHa: 150,
      flowRateM3h: 300,
    });
    expect(r.netMm.value).toBeCloseTo(25, 4);
    expect(r.grossMm.value).toBeCloseTo(29.4118, 3);
    expect(r.volumeM3.value).toBeCloseTo(44117.6, 0);
    expect(r.runtimeH.value).toBeCloseTo(147.06, 1);
  });

  it("não inventa vazão", () => {
    const r = calculateIrrigationRequirement({
      drMm: 25,
      efficiency: 0.85,
      areaHa: 150,
      flowRateM3h: null,
    });
    expect(r.runtimeH.value).toBeNull();
    expect(r.runtimeH.missing.join(" ")).toMatch(/vazão/i);
  });
});

describe("Projeção e dias até CRA", () => {
  it("simula até cruzar a CRA", () => {
    const projected = projectWaterBalance({
      drStartMm: 29.7,
      layers: REF_LAYERS,
      unit: "gravimetric_percent",
      days: [
        {
          date: "2026-08-30",
          et0Mm: 5.55,
          rainMm: 0,
          kc: 1.1,
          kl: 1,
          zrCm: 60,
          pTable: 0.5,
          fdMode: "fixed",
          plannedIrrigationGrossMm: 0,
          efficiency: 0.85,
          kind: "forecast",
        },
      ],
    });
    const days = estimateDaysToCra({
      drMm: 29.7,
      craMm: 33.31,
      projected,
      etcFallbackMm: 6.1,
    });
    expect(days.days).toBe(1);
    expect(days.method).toBe("simulacao");
  });
});

describe("Status", () => {
  it("alerta quando Dr se aproxima da CRA", () => {
    expect(classifyAgronomicStatus({ drMm: 29.7, ctaMm: 66.61, craMm: 33.31, ks: 1 })).toBe("alerta");
  });
  it("estresse quando Dr > CRA", () => {
    expect(classifyAgronomicStatus({ drMm: 40, ctaMm: 66.61, craMm: 33.31, ks: 0.8 })).toBe("estresse");
  });
});
