import { describe, it, expect } from "vitest";
import {
  calculateRadiusFromArea,
  calculateFullTurnTime,
  calculateDepth100Pct,
  calculateInstalledPowerKw,
  calculateSpecificConsumption,
  calculateCostPerMm,
  calculatePivotAll,
  checkTypicalRanges,
  calculatePercentimeter,
  calculateIrrigationTime,
  CV_TO_KW,
  M3_PER_MM_HA,
} from "./pivot-calculations";

// Tolerância pra comparar floats
const FLOAT_TOL = 0.01;

// ── calculateRadiusFromArea ─────────────────────────────────────────────────

describe("calculateRadiusFromArea", () => {
  it("86 ha → raio ≈ 523,21 m (caso típico Karitel)", () => {
    const r = calculateRadiusFromArea(86);
    expect(r).toBeCloseTo(523.21, 1);
  });

  it("100 ha → raio ≈ 564,19 m (referência de mesa)", () => {
    const r = calculateRadiusFromArea(100);
    expect(r).toBeCloseTo(564.19, 1);
  });

  it("50 ha → raio ≈ 398,94 m", () => {
    const r = calculateRadiusFromArea(50);
    expect(r).toBeCloseTo(398.94, 1);
  });

  it("null / 0 / negativo → null", () => {
    expect(calculateRadiusFromArea(null)).toBeNull();
    expect(calculateRadiusFromArea(undefined)).toBeNull();
    expect(calculateRadiusFromArea(0)).toBeNull();
    expect(calculateRadiusFromArea(-10)).toBeNull();
  });

  it("NaN e Infinity → null", () => {
    expect(calculateRadiusFromArea(NaN)).toBeNull();
    expect(calculateRadiusFromArea(Infinity)).toBeNull();
  });
});

// ── calculateFullTurnTime ───────────────────────────────────────────────────

describe("calculateFullTurnTime", () => {
  it("raio 523 m, velocidade 150 m/h → tempo ≈ 21,90 h", () => {
    const t = calculateFullTurnTime(523, 150);
    expect(t).toBeCloseTo(21.90, 1);
  });

  it("raio 400 m, velocidade 200 m/h → tempo ≈ 12,57 h", () => {
    const t = calculateFullTurnTime(400, 200);
    expect(t).toBeCloseTo(12.57, 1);
  });

  it("ausência de raio ou velocidade → null", () => {
    expect(calculateFullTurnTime(null, 150)).toBeNull();
    expect(calculateFullTurnTime(500, null)).toBeNull();
    expect(calculateFullTurnTime(null, null)).toBeNull();
  });
});

// ── calculateDepth100Pct ────────────────────────────────────────────────────

describe("calculateDepth100Pct", () => {
  it("300 m³/h × 21,9 h em 86 ha → 7,64 mm", () => {
    const l = calculateDepth100Pct(300, 21.9, 86);
    expect(l).toBeCloseTo(7.64, 1);
  });

  it("250 m³/h × 24 h em 100 ha → 6,00 mm", () => {
    const l = calculateDepth100Pct(250, 24, 100);
    expect(l).toBeCloseTo(6.00, 2);
  });

  it("qualquer campo ausente → null", () => {
    expect(calculateDepth100Pct(null, 20, 86)).toBeNull();
    expect(calculateDepth100Pct(300, null, 86)).toBeNull();
    expect(calculateDepth100Pct(300, 20, null)).toBeNull();
  });
});

// ── calculateInstalledPowerKw ───────────────────────────────────────────────

describe("calculateInstalledPowerKw", () => {
  it("150 CV a 88% de eficiência → 125,37 kW elétricos", () => {
    const kw = calculateInstalledPowerKw(150, 0.88);
    expect(kw).toBeCloseTo(125.37, 1);
  });

  it("100 CV a 92% → 79,95 kW", () => {
    const kw = calculateInstalledPowerKw(100, 0.92);
    expect(kw).toBeCloseTo(79.95, 1);
  });

  it("default de eficiência (0,88) quando não informada", () => {
    const kw = calculateInstalledPowerKw(150);
    expect(kw).toBeCloseTo(125.37, 1);
  });

  it("constante CV_TO_KW = 0,7355", () => {
    expect(CV_TO_KW).toBe(0.7355);
  });

  it("motor efficiency > 1 é rejeitado (safety)", () => {
    expect(calculateInstalledPowerKw(150, 1.5)).toBeNull();
  });

  it("CV ausente → null", () => {
    expect(calculateInstalledPowerKw(null)).toBeNull();
    expect(calculateInstalledPowerKw(0)).toBeNull();
  });
});

// ── calculateSpecificConsumption ────────────────────────────────────────────

describe("calculateSpecificConsumption", () => {
  it("125,4 kW / 300 m³/h → 0,418 kWh/m³", () => {
    const cE = calculateSpecificConsumption(125.4, 300);
    expect(cE).toBeCloseTo(0.418, 3);
  });

  it("80 kW / 200 m³/h → 0,40 kWh/m³ (típico)", () => {
    const cE = calculateSpecificConsumption(80, 200);
    expect(cE).toBeCloseTo(0.40, 3);
  });

  it("qualquer campo ausente → null", () => {
    expect(calculateSpecificConsumption(null, 300)).toBeNull();
    expect(calculateSpecificConsumption(125, null)).toBeNull();
  });
});

// ── calculateCostPerMm ──────────────────────────────────────────────────────

describe("calculateCostPerMm", () => {
  it("0,418 kWh/m³ × R$ 0,72/kWh → R$ 3,01/mm/ha", () => {
    const c = calculateCostPerMm(0.418, 0.72);
    expect(c).toBeCloseTo(3.01, 2);
  });

  it("0,50 kWh/m³ × R$ 1,00/kWh → R$ 5,00/mm/ha", () => {
    const c = calculateCostPerMm(0.50, 1.00);
    expect(c).toBeCloseTo(5.00, 2);
  });

  it("constante M3_PER_MM_HA = 10", () => {
    expect(M3_PER_MM_HA).toBe(10);
  });

  it("ausência de dado → null", () => {
    expect(calculateCostPerMm(null, 0.72)).toBeNull();
    expect(calculateCostPerMm(0.4, null)).toBeNull();
  });
});

// ── calculatePivotAll (motor consolidado) ───────────────────────────────────

describe("calculatePivotAll — cenário Karitel Pivô 05", () => {
  const input = {
    areaHa: 86,
    radiusM: null,          // será auto-calculado
    flowRateM3h: 300,
    velocity100PctMh: 150,
    pumpPowerCv: 150,
    motorEfficiency: 0.88,
    energyCostPerKwh: 0.72,
  };

  const out = calculatePivotAll(input);

  it("raio auto-calculado da área", () => {
    expect(out.radiusM).toBeCloseTo(523.21, 1);
  });

  it("tempo de volta derivado do raio e velocidade", () => {
    expect(out.fullTurnTimeH).toBeCloseTo(21.90, 1);
  });

  it("lâmina a 100% derivada de vazão, tempo, área", () => {
    expect(out.depth100PctMm).toBeCloseTo(7.64, 1);
  });

  it("potência instalada em kW elétricos", () => {
    expect(out.installedPowerKw).toBeCloseTo(125.37, 1);
  });

  it("consumo específico coerente com a bibliografia (0,3-0,5)", () => {
    expect(out.specificConsumptionKwhM3).toBeCloseTo(0.418, 2);
    expect(out.specificConsumptionKwhM3!).toBeGreaterThan(0.15);
    expect(out.specificConsumptionKwhM3!).toBeLessThan(0.80);
  });

  it("custo por mm derivado", () => {
    expect(out.costPerMmReais).toBeCloseTo(3.01, 2);
  });
});

describe("calculatePivotAll — raio manual sobrescreve auto", () => {
  it("quando radiusM é informado, ignora area para raio", () => {
    const out = calculatePivotAll({
      areaHa: 86,
      radiusM: 500,   // manual, ignora 523,26 do cálculo
      flowRateM3h: 300,
      velocity100PctMh: 150,
      pumpPowerCv: 150,
      motorEfficiency: 0.88,
      energyCostPerKwh: 0.72,
    });
    expect(out.radiusM).toBe(500);
    // tempo de volta usa o raio manual
    expect(out.fullTurnTimeH).toBeCloseTo(20.94, 1);
  });
});

describe("calculatePivotAll — cascata quebra corretamente com dado ausente", () => {
  it("sem vazão → depth, consumo e custo ficam null", () => {
    const out = calculatePivotAll({
      areaHa: 86,
      flowRateM3h: null,
      velocity100PctMh: 150,
      pumpPowerCv: 150,
      motorEfficiency: 0.88,
      energyCostPerKwh: 0.72,
    });
    expect(out.radiusM).not.toBeNull();
    expect(out.fullTurnTimeH).not.toBeNull();
    expect(out.depth100PctMm).toBeNull();
    expect(out.installedPowerKw).not.toBeNull();  // não depende de vazão
    expect(out.specificConsumptionKwhM3).toBeNull();
    expect(out.costPerMmReais).toBeNull();
  });

  it("sem custo de energia → só custo/mm fica null", () => {
    const out = calculatePivotAll({
      areaHa: 86,
      flowRateM3h: 300,
      velocity100PctMh: 150,
      pumpPowerCv: 150,
      motorEfficiency: 0.88,
      energyCostPerKwh: null,
    });
    expect(out.specificConsumptionKwhM3).not.toBeNull();
    expect(out.costPerMmReais).toBeNull();
  });
});

// ── checkTypicalRanges ──────────────────────────────────────────────────────

describe("checkTypicalRanges", () => {
  it("valores típicos → sem warnings", () => {
    const w = checkTypicalRanges({
      cuc: 0.87,
      motorEfficiency: 0.88,
      servicePressureBar: 2.5,
      specificConsumptionKwhM3: 0.42,
      costPerKwhReais: 0.72,
      costPerMmReais: 3.0,
      velocity100PctMh: 150,
      fullTurnTimeH: 22,
      depth100PctMm: 6.5,
    });
    expect(w).toHaveLength(0);
  });

  it("CUC muito baixo → warning", () => {
    const w = checkTypicalRanges({ cuc: 0.60 });
    expect(w).toHaveLength(1);
    expect(w[0].field).toBe("cuc");
    expect(w[0].message).toMatch(/fora da faixa típica/);
  });

  it("consumo específico atípico → warning", () => {
    const w = checkTypicalRanges({ specificConsumptionKwhM3: 1.2 });
    expect(w).toHaveLength(1);
    expect(w[0].field).toBe("specificConsumptionKwhM3");
  });

  it("múltiplos valores atípicos → múltiplos warnings", () => {
    const w = checkTypicalRanges({
      cuc: 0.60,
      costPerKwhReais: 3.0,
      specificConsumptionKwhM3: 0.05,
    });
    expect(w).toHaveLength(3);
  });

  it("nulls / undefined → ignorados", () => {
    const w = checkTypicalRanges({
      cuc: null,
      motorEfficiency: undefined,
      servicePressureBar: 2.5,
    });
    expect(w).toHaveLength(0);
  });
});

// ── calculatePercentimeter ──────────────────────────────────────────────────

describe("calculatePercentimeter", () => {
  it("lâmina 100% = 7,64 mm, desejada 5 mm → 152,8% (satura na UI)", () => {
    const p = calculatePercentimeter(5, 7.64);
    expect(p).toBeCloseTo(152.8, 1);
  });

  it("lâmina 100% = 7,64 mm, desejada 10 mm → 76,4%", () => {
    const p = calculatePercentimeter(10, 7.64);
    expect(p).toBeCloseTo(76.4, 1);
  });

  it("lâmina 100% = 6 mm, desejada 6 mm → 100%", () => {
    const p = calculatePercentimeter(6, 6);
    expect(p).toBeCloseTo(100, 1);
  });

  it("ausência de dado → null", () => {
    expect(calculatePercentimeter(null, 7.64)).toBeNull();
    expect(calculatePercentimeter(5, null)).toBeNull();
  });
});

// ── calculateIrrigationTime ─────────────────────────────────────────────────

describe("calculateIrrigationTime", () => {
  it("5 mm em 86 ha com 300 m³/h → 14,33 h", () => {
    const t = calculateIrrigationTime(5, 86, 300);
    expect(t).toBeCloseTo(14.33, 1);
  });

  it("10 mm em 100 ha com 250 m³/h → 40,00 h", () => {
    const t = calculateIrrigationTime(10, 100, 250);
    expect(t).toBeCloseTo(40.00, 1);
  });

  it("consistente com depth100 (lâmina 100% em 1 volta = tempo_volta)", () => {
    // Se aplico exatamente a lâmina de 100%, o tempo deve dar o tempo de volta.
    const areaHa = 86;
    const flow = 300;
    const velocity = 150;
    const radius = calculateRadiusFromArea(areaHa)!;
    const tVolta = calculateFullTurnTime(radius, velocity)!;
    const d100 = calculateDepth100Pct(flow, tVolta, areaHa)!;
    const tIrrig = calculateIrrigationTime(d100, areaHa, flow)!;
    expect(tIrrig).toBeCloseTo(tVolta, 2);
  });
});
