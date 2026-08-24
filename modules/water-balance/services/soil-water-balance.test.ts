import { describe, expect, it } from "vitest";
import {
  ARM_FORMULA,
  BALANCE_UNITS,
  applyDailySoilBalance,
  initialArmFromMoisture,
  moisturePercentOfFieldCapacity,
  moisturePctCcForDisplay,
  pmpPctCcForDisplay,
  profileCcPmp,
  safetyMoistureMm,
  safetyPercentOfFieldCapacity,
  safetyPctCcForDisplay,
  scaleArmToNewCad,
  usdaScsEffectiveRain,
  PE_METHOD,
} from "./soil-water-balance";

describe("unidades do balanço", () => {
  it("separa mm, cm³/cm³ e % da CC", () => {
    expect(BALANCE_UNITS.cad).toBe("mm");
    expect(BALANCE_UNITS.arm).toBe("mm");
    expect(BALANCE_UNITS.fieldCapacity).toBe("cm³/cm³");
    expect(BALANCE_UNITS.moisturePctCc).toContain("% da CC");
    expect(ARM_FORMULA).toContain("P_arm");
    expect(PE_METHOD).toContain("diário");
  });
});

describe("inicialização do ARM", () => {
  it("inicia em CAD quando há confirmação explícita de capacidade de campo", () => {
    expect(initialArmFromMoisture({
      cadMm: 54,
      thetaCc: 0.3,
      thetaPmp: 0.12,
      bulkDensity: 1.3,
      moisturePct: null,
      unit: null,
      isFieldCapacity: true,
    })).toBe(54);
  });

  it("converte % da CC para água disponível, sem assumir ARM/CAD", () => {
    const arm = initialArmFromMoisture({
      cadMm: 54,
      thetaCc: 0.3,
      thetaPmp: 0.12,
      bulkDensity: 1.3,
      moisturePct: 70,
      unit: "field_capacity_fraction",
      isFieldCapacity: false,
    });
    // theta=0,21; fração disponível=(0,21-0,12)/(0,30-0,12)=0,5
    expect(arm).toBe(27);
  });

  it("não inventa ARM quando não existe condição inicial confiável", () => {
    expect(initialArmFromMoisture({
      cadMm: 54,
      thetaCc: 0.3,
      thetaPmp: 0.12,
      bulkDensity: 1.3,
      moisturePct: null,
      unit: null,
      isFieldCapacity: false,
    })).toBeNull();
  });
});

describe("exibição % da CC", () => {
  it("usa valor persistido quando existe", () => {
    expect(moisturePctCcForDisplay(70, 27, 54)).toBe(70);
    expect(safetyPctCcForDisplay(70, 54, 27)).toBe(70);
  });

  it("PMP é θPMP/θCC", () => {
    expect(pmpPctCcForDisplay(0.3, 0.12)).toBe(40);
  });
});

describe("umidade de segurança", () => {
  it("é CAD − AFD", () => {
    expect(safetyMoistureMm(54, 27)).toBe(27);
    expect(safetyPercentOfFieldCapacity(0.3, 0.12, 0.5)).toBe(70);
  });
});

describe("moisturePercentOfFieldCapacity", () => {
  it("ARM=CAD → 100% CC; ARM=0 → PMP/CC", () => {
    expect(moisturePercentOfFieldCapacity(54, 54, 0.3, 0.12)).toBe(100);
    expect(moisturePercentOfFieldCapacity(0, 54, 0.3, 0.12)).toBe(40);
  });
});

describe("scaleArmToNewCad", () => {
  it("preserva fração quando CAD muda", () => {
    expect(scaleArmToNewCad(27, 54, 108)).toBe(54);
    expect(scaleArmToNewCad(50, 54, 40)).toBe(37.04);
  });
});

describe("chuva diária + CAD", () => {
  it("alias legado não aplica mais fórmula mensal USDA-SCS", () => {
    expect(usdaScsEffectiveRain(10)).toBe(10);
  });

  it("perde ETc e não deixa ARM negativo", () => {
    const day = applyDailySoilBalance({ armStart: 54, cad: 54, precipitation: 0, effectiveIrrigation: 0, etc: 5 });
    expect(day.arm).toBe(49);
    expect(day.deficit).toBe(5);
  });

  it("chuva acima do espaço vira excesso", () => {
    const day = applyDailySoilBalance({ armStart: 50, cad: 54, precipitation: 20, effectiveIrrigation: 0, etc: 2 });
    expect(day.arm).toBe(54);
    expect(day.surplus).toBe(14);
    expect(day.pe).toBe(6);
  });

  it("irrigação efetiva entra diretamente no ARM", () => {
    const dry = applyDailySoilBalance({ armStart: 20, cad: 54, precipitation: 0, effectiveIrrigation: 0, etc: 5 });
    const irrigated = applyDailySoilBalance({ armStart: 20, cad: 54, precipitation: 0, effectiveIrrigation: 15, etc: 5 });
    expect(irrigated.arm).toBe(dry.arm + 15);
  });
});

describe("profileCcPmp", () => {
  it("faz média ponderada das camadas até Z", () => {
    const { fieldCapacity, wiltingPoint } = profileCcPmp(
      { field_capacity: 0.3, wilting_point: 0.12 },
      [
        { depth_start: 0, depth_end: 20, field_capacity: 0.3, wilting_point: 0.12 },
        { depth_start: 20, depth_end: 40, field_capacity: 0.2, wilting_point: 0.1 },
      ],
      0.3,
    );
    expect(fieldCapacity).toBeCloseTo(0.2667, 3);
    expect(wiltingPoint).toBeCloseTo(0.1133, 3);
  });
});
