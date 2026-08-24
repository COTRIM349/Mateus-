import { describe, expect, it } from "vitest";
import {
  ARM_FORMULA,
  BALANCE_UNITS,
  PE_METHOD,
  applyDailySoilBalance,
  initialArmFromMoisture,
  moisturePercentOfFieldCapacity,
  safetyMoistureMm,
  safetyPercentOfFieldCapacity,
  scaleArmToNewCad,
  usdaScsEffectiveRain,
} from "./soil-water-balance";

describe("unidades e condição inicial", () => {
  it("separa mm, teor volumétrico e % da CC", () => {
    expect(BALANCE_UNITS.arm).toBe("mm");
    expect(BALANCE_UNITS.fieldCapacity).toBe("cm³/cm³");
    expect(BALANCE_UNITS.moisturePctCc).toContain("% da CC");
    expect(ARM_FORMULA).toContain("P_arm");
    expect(PE_METHOD).toContain("Balanço diário");
  });

  it("CC confirmada inicializa ARM exatamente na CAD", () => {
    expect(initialArmFromMoisture({ cadMm: 54, thetaCc: 0.3, thetaPmp: 0.12, bulkDensity: 1.3, moisturePct: null, unit: "field_capacity_fraction", isFieldCapacity: true })).toBe(54);
  });

  it("sem medição e sem CC confirmada retorna null", () => {
    expect(initialArmFromMoisture({ cadMm: 54, thetaCc: 0.3, thetaPmp: 0.12, bulkDensity: 1.3, moisturePct: null, unit: "field_capacity_fraction", isFieldCapacity: false })).toBeNull();
  });

  it("converte umidade volumétrica e gravimétrica explicitamente", () => {
    const volumetric = initialArmFromMoisture({ cadMm: 54, thetaCc: 0.3, thetaPmp: 0.12, bulkDensity: 1.3, moisturePct: 21, unit: "volume_pct", isFieldCapacity: false });
    const gravimetric = initialArmFromMoisture({ cadMm: 54, thetaCc: 0.3, thetaPmp: 0.12, bulkDensity: 1.5, moisturePct: 14, unit: "weight_pct", isFieldCapacity: false });
    expect(volumetric).toBe(27);
    expect(gravimetric).toBe(27);
  });
});

describe("limites de umidade", () => {
  it("umidade de segurança = CAD − AFD", () => {
    expect(safetyMoistureMm(54, 27)).toBe(27);
  });

  it("%CC usa PMP e CC, não ARM/CAD puro", () => {
    expect(moisturePercentOfFieldCapacity(54, 54, 0.3, 0.12)).toBe(100);
    expect(moisturePercentOfFieldCapacity(0, 54, 0.3, 0.12)).toBe(40);
    expect(safetyPercentOfFieldCapacity(0.3, 0.12, 0.5)).toBe(70);
  });

  it("preserva fração quando a CAD cresce", () => {
    expect(scaleArmToNewCad(25, 50, 60)).toBe(30);
  });
});

describe("balanço diário físico da chuva", () => {
  it("alias legado não reduz chuva diária por equação mensal", () => {
    expect(usdaScsEffectiveRain(10)).toBe(10);
    expect(usdaScsEffectiveRain(-2)).toBe(0);
  });

  it("chuva cabe no espaço da CAD e o restante vira excesso", () => {
    const result = applyDailySoilBalance({ armStart: 50, cad: 54, precipitation: 20, effectiveIrrigation: 0, etc: 2 });
    expect(result.arm).toBe(54);
    expect(result.surplus).toBe(14);
    expect(result.pe).toBe(6);
    expect(result.deficit).toBe(0);
    expect(result.peFormula).toContain("P_arm");
  });

  it("irrigação efetiva entra no ARM e ARM nunca ultrapassa CAD", () => {
    const result = applyDailySoilBalance({ armStart: 30, cad: 54, precipitation: 0, effectiveIrrigation: 17, etc: 5 });
    expect(result.arm).toBe(42);
    expect(result.surplus).toBe(0);
  });
});
