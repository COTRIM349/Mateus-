import { describe, expect, it } from "vitest";
import { calculateEffectivePrecipitation } from "@/modules/weather/services";
import {
  ARM_FORMULA,
  BALANCE_UNITS,
  applyDailySoilBalance,
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
    expect(ARM_FORMULA).toContain("Pe");
    expect(PE_METHOD).toContain("USDA-SCS");
  });
});

describe("exibição % da CC (linhas novas vs. antigas)", () => {
  it("usa o valor persistido quando existe", () => {
    expect(moisturePctCcForDisplay(70, 27, 54)).toBe(70);
    expect(safetyPctCcForDisplay(70, 54, 27)).toBe(70);
  });

  it("PM é θPMP/θCC, não 0% da CAD", () => {
    expect(pmpPctCcForDisplay(0.3, 0.12)).toBe(40);
    expect(pmpPctCcForDisplay(0.3, 0.12)).not.toBe(0);
  });
});

describe("umidade de segurança", () => {
  it("é CAD − AFD em mm (ARM no limite da AFD)", () => {
    expect(safetyMoistureMm(54, 27)).toBe(27);
  });

  it("% da CC no limite usa p e não mistura com % da CAD", () => {
    // θ_seg = 0,12 + 0,5×0,18 = 0,21 → 70% da CC
    expect(safetyPercentOfFieldCapacity(0.3, 0.12, 0.5)).toBe(70);
    // % da CAD no mesmo ponto seria 50
    expect(safetyPercentOfFieldCapacity(0.3, 0.12, 0.5)).not.toBe(50);
  });
});

describe("moisturePercentOfFieldCapacity", () => {
  it("ARM = CAD → 100% da CC; ARM = 0 → PMP/CC", () => {
    expect(moisturePercentOfFieldCapacity(54, 54, 0.3, 0.12)).toBe(100);
    expect(moisturePercentOfFieldCapacity(0, 54, 0.3, 0.12)).toBe(40);
  });

  it("não trata ARM/CAD como % da CC", () => {
    const pctCc = moisturePercentOfFieldCapacity(27, 54, 0.3, 0.12);
    expect(pctCc).toBe(70);
    expect(pctCc).not.toBe(50);
  });
});

describe("scaleArmToNewCad", () => {
  it("preserva a fração quando a CAD cresce com a raiz", () => {
    expect(scaleArmToNewCad(27, 54, 108)).toBe(54);
  });

  it("não inventa água acima da CAD nova nem enche até a CC no recuo", () => {
    // 50/54 da CAD antiga → mesma fração em 40 mm = 37,04 (não 40 = CC)
    expect(scaleArmToNewCad(50, 54, 40)).toBe(37.04);
    expect(scaleArmToNewCad(50, 54, 40)).toBeLessThanOrEqual(40);
    expect(scaleArmToNewCad(60, 54, 40)).toBe(40);
  });
});

describe("chuva efetiva USDA-SCS + CAD", () => {
  it("Pe SCS é ≤ chuva e bate com o legado", () => {
    expect(usdaScsEffectiveRain(10)).toBe(calculateEffectivePrecipitation(10));
    expect(usdaScsEffectiveRain(10)).toBeLessThanOrEqual(10);
    expect(usdaScsEffectiveRain(0)).toBe(0);
  });

  it("ARM começa na CAD, perde ETc e não fica negativo", () => {
    const day = applyDailySoilBalance({
      armStart: 54,
      cad: 54,
      precipitation: 0,
      effectiveIrrigation: 0,
      etc: 5,
    });
    expect(day.arm).toBe(49);
    expect(day.deficit).toBe(5);
    expect(day.pe).toBe(0);
  });

  it("chuva que estoura a CAD vira excedente; Pe retida < chuva bruta", () => {
    const day = applyDailySoilBalance({
      armStart: 50,
      cad: 54,
      precipitation: 20,
      effectiveIrrigation: 0,
      etc: 2,
    });
    expect(day.arm).toBe(54);
    expect(day.surplus).toBeGreaterThan(0);
    expect(day.pe).toBeLessThan(20);
    expect(day.pe).toBeGreaterThan(0);
  });

  it("irrigação efetiva entra no ARM", () => {
    const dry = applyDailySoilBalance({
      armStart: 20,
      cad: 54,
      precipitation: 0,
      effectiveIrrigation: 0,
      etc: 5,
    });
    const irrigated = applyDailySoilBalance({
      armStart: 20,
      cad: 54,
      precipitation: 0,
      effectiveIrrigation: 15,
      etc: 5,
    });
    expect(irrigated.arm).toBe(dry.arm + 15);
  });
});

describe("profileCcPmp", () => {
  it("média ponderada das camadas até Z", () => {
    const { fieldCapacity, wiltingPoint } = profileCcPmp(
      { field_capacity: 0.3, wilting_point: 0.12 },
      [
        { depth_start: 0, depth_end: 20, field_capacity: 0.3, wilting_point: 0.12 },
        { depth_start: 20, depth_end: 40, field_capacity: 0.2, wilting_point: 0.1 },
      ],
      0.3,
    );
    // 20 cm @ 0,30 + 10 cm @ 0,20 → 0,2667
    expect(fieldCapacity).toBeCloseTo(0.2667, 3);
    expect(wiltingPoint).toBeCloseTo(0.1133, 3);
  });
});
