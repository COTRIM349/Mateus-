import { describe, it, expect } from "vitest";
import {
  calculateETc,
  calculateDynamicCAD,
  calculateDynamicAFD,
  adjustDepletionFactor,
  calculateNetDepth,
  calculateGrossDepth,
  calculateVolume,
  calculateIrrigationTime,
  determineWaterStatus,
  calculateDailyBalance,
  simulateBalance,
  calculateSummary,
  calculateInitialStorage,
  validateBalanceInput,
  type DayInput,
} from "./water-balance.service";
import { calculateEffectivePrecipitation } from "@/modules/weather/services/weather.service";

// Testes do motor de balanço hídrico (FAO-56). Não alteram fórmulas —
// apenas fixam o comportamento esperado das funções puras do motor.

describe("calculateETc (ETc = ET0 × Kc)", () => {
  it("multiplica ET0 por Kc", () => {
    expect(calculateETc(5, 1.0)).toBe(5);
    expect(calculateETc(5, 1.2)).toBe(6);
    expect(calculateETc(4.3, 0.85)).toBe(3.66);
  });
  it("nunca retorna negativo", () => {
    expect(calculateETc(-5, 1)).toBe(0);
    expect(calculateETc(5, -1)).toBe(0);
  });
});

describe("calculateDynamicCAD (FAO-56 eq. 82)", () => {
  it("usa a profundidade radicular quando menor que a efetiva do solo", () => {
    // (0.30 - 0.15) × 0.5 × 1000 = 75 mm
    expect(calculateDynamicCAD(0.3, 0.15, 0.5, 0.6)).toBe(75);
  });
  it("limita a profundidade à efetiva do solo", () => {
    // z = min(0.8, 0.6) = 0.6 → 0.15 × 0.6 × 1000 = 90 mm
    expect(calculateDynamicCAD(0.3, 0.15, 0.8, 0.6)).toBe(90);
  });
  it("não retorna negativo quando PMP > CC", () => {
    expect(calculateDynamicCAD(0.15, 0.3, 0.5, 0.6)).toBe(0);
  });
});

describe("calculateDynamicAFD (AFD = CAD × p)", () => {
  it("multiplica CAD pelo fator de depleção", () => {
    expect(calculateDynamicAFD(75, 0.5)).toBe(37.5);
  });
  it("faz clamp do fator entre 0 e 1", () => {
    expect(calculateDynamicAFD(75, 1.5)).toBe(75);
    expect(calculateDynamicAFD(75, -0.2)).toBe(0);
  });
});

describe("adjustDepletionFactor (FAO-56 eq. 84)", () => {
  it("mantém o fator quando ETc = 5", () => {
    expect(adjustDepletionFactor(0.5, 5)).toBe(0.5);
  });
  it("aumenta p quando ETc < 5", () => {
    // 0.5 + 0.04 × (5 - 3) = 0.58
    expect(adjustDepletionFactor(0.5, 3)).toBe(0.58);
  });
  it("faz clamp entre 0.1 e 0.8", () => {
    expect(adjustDepletionFactor(0.5, 50)).toBe(0.1);
    expect(adjustDepletionFactor(0.5, -10)).toBe(0.8);
  });
});

describe("cálculos de irrigação", () => {
  it("lâmina líquida = CAD - ARM (mínimo 0)", () => {
    expect(calculateNetDepth(75, 45)).toBe(30);
    expect(calculateNetDepth(75, 80)).toBe(0);
  });
  it("lâmina bruta = líquida / eficiência", () => {
    expect(calculateGrossDepth(30, 0.85)).toBe(35.29);
  });
  it("lâmina bruta é 0 quando eficiência <= 0 (guarda)", () => {
    expect(calculateGrossDepth(30, 0)).toBe(0);
    expect(calculateGrossDepth(30, -0.5)).toBe(0);
  });
  it("volume (m³) = lâmina bruta × área × 10", () => {
    expect(calculateVolume(35.29, 100)).toBe(35290);
  });
  it("tempo (h) = volume / vazão, com guarda para vazão <= 0", () => {
    expect(calculateIrrigationTime(35290, 200)).toBe(176.45);
    expect(calculateIrrigationTime(35290, 0)).toBe(0);
  });
});

describe("determineWaterStatus", () => {
  const cad = 75;
  const afd = 37.5; // stressThreshold = cad - afd = 37.5
  it("deficit_critico quando CAD <= 0", () => {
    expect(determineWaterStatus(0, 0, 0)).toBe("deficit_critico");
  });
  it("saturado quando ARM >= CAD", () => {
    expect(determineWaterStatus(75, cad, afd)).toBe("saturado");
    expect(determineWaterStatus(80, cad, afd)).toBe("saturado");
  });
  it("ideal quando ARM >= limite de estresse", () => {
    expect(determineWaterStatus(40, cad, afd)).toBe("ideal");
    expect(determineWaterStatus(37.5, cad, afd)).toBe("ideal");
  });
  it("atencao quando 0.3 <= ARM/CAD < limite", () => {
    expect(determineWaterStatus(30, cad, afd)).toBe("atencao"); // ratio 0.4
  });
  it("deficit quando 0.1 <= ARM/CAD < 0.3", () => {
    expect(determineWaterStatus(15, cad, afd)).toBe("deficit"); // ratio 0.2
  });
  it("deficit_critico quando ARM/CAD < 0.1", () => {
    expect(determineWaterStatus(5, cad, afd)).toBe("deficit_critico"); // ratio 0.066
  });
});

describe("calculateEffectivePrecipitation (USDA-SCS)", () => {
  it("retorna 0 para precipitação <= 0", () => {
    expect(calculateEffectivePrecipitation(0)).toBe(0);
    expect(calculateEffectivePrecipitation(-5)).toBe(0);
  });
  it("aplica a fórmula quadrática até 250 mm", () => {
    // (10 × (125 - 2)) / 125 = 9.84
    expect(calculateEffectivePrecipitation(10)).toBe(9.84);
    // (250 × (125 - 50)) / 125 = 150
    expect(calculateEffectivePrecipitation(250)).toBe(150);
  });
  it("aplica a fórmula linear acima de 250 mm", () => {
    // 125 + 0.1 × 300 = 155
    expect(calculateEffectivePrecipitation(300)).toBe(155);
  });
});

describe("calculateDailyBalance (integração)", () => {
  const base = {
    et0: 5,
    precipitation: 0,
    irrigationApplied: 0,
    previousStoredWater: 50,
    fieldCapacity: 0.3,
    wiltingPoint: 0.15,
    rootDepth: 0.5,
    effectiveSoilDepth: 0.6,
    kc: 1.0,
    depletionFactor: 0.5,
    pivotEfficiency: 0.85,
    pivotArea: 100,
    pivotFlowRate: 200,
  };

  it("ARM(t) = ARM(t-1) + Pe + Irrig - ETc", () => {
    const r = calculateDailyBalance(base);
    expect(r.etc).toBe(5);
    expect(r.cad).toBe(75);
    expect(r.afd).toBe(37.5);
    expect(r.storedWater).toBe(45); // 50 + 0 + 0 - 5
    expect(r.waterStatus).toBe("ideal");
    expect(r.deficit).toBe(0);
  });

  it("captura excedente acima da capacidade de campo (surplus) e limita ARM à CAD", () => {
    // precip 20 → Pe = 19.36; 74 + 19.36 - 5 = 88.36 > 75 → surplus 13.36
    const r = calculateDailyBalance({ ...base, previousStoredWater: 74, precipitation: 20 });
    expect(r.effectivePrecipitation).toBe(19.36);
    expect(r.storedWater).toBe(75);
    expect(r.surplus).toBe(13.36);
  });

  it("nunca deixa ARM abaixo de zero", () => {
    const r = calculateDailyBalance({ ...base, previousStoredWater: 3 });
    expect(r.storedWater).toBe(0);
    expect(r.waterStatus).toBe("deficit_critico");
  });

  it("calcula déficit quando ARM abaixo do limite de estresse", () => {
    const r = calculateDailyBalance({ ...base, previousStoredWater: 40, et0: 6 });
    // etc 6; stored 40-6=34; stressThreshold=75-afd; deficit = threshold - 34 (>0)
    expect(r.deficit).toBeGreaterThan(0);
  });
});

describe("simulateBalance (continuidade multi-dia)", () => {
  const days: DayInput[] = [
    { date: "2025-01-01", et0: 5, precipitation: 0, irrigationApplied: 0, kc: 1, rootDepth: 0.5, depletionFactor: 0.5, phase: "ini" },
    { date: "2025-01-02", et0: 5, precipitation: 0, irrigationApplied: 0, kc: 1, rootDepth: 0.5, depletionFactor: 0.5, phase: "ini" },
    { date: "2025-01-03", et0: 5, precipitation: 10, irrigationApplied: 0, kc: 1, rootDepth: 0.5, depletionFactor: 0.5, phase: "ini" },
  ];
  it("encadeia o ARM de um dia para o próximo", () => {
    const rows = simulateBalance(days, 75, 0.3, 0.15, 0.6, 0.85, 100, 200);
    expect(rows).toHaveLength(3);
    expect(rows[0].storedWater).toBe(70); // 75 - 5
    expect(rows[1].storedWater).toBe(65); // 70 - 5
    // dia 3: 65 + Pe(10)=9.84 - 5 = 69.84
    expect(rows[2].storedWater).toBe(69.84);
    expect(rows[2].date).toBe("2025-01-03");
    expect(rows[2].phase).toBe("ini");
  });
});

describe("calculateSummary", () => {
  it("retorna zeros para lista vazia", () => {
    const s = calculateSummary([]);
    expect(s.days).toBe(0);
    expect(s.totalETc).toBe(0);
  });
  it("agrega totais e contadores corretamente", () => {
    const rows = simulateBalance(
      [
        { date: "d1", et0: 5, precipitation: 0, irrigationApplied: 0, kc: 1, rootDepth: 0.5, depletionFactor: 0.5, phase: "x" },
        { date: "d2", et0: 5, precipitation: 20, irrigationApplied: 0, kc: 1, rootDepth: 0.5, depletionFactor: 0.5, phase: "x" },
      ],
      75, 0.3, 0.15, 0.6, 0.85, 100, 200,
    );
    const s = calculateSummary(rows);
    expect(s.days).toBe(2);
    expect(s.totalETc).toBe(10);
    expect(s.totalPrecipitation).toBe(20);
    expect(s.minStoredWater).toBeLessThanOrEqual(s.avgStoredWater);
  });
});

describe("calculateInitialStorage", () => {
  it("inicia na fração da CAD informada", () => {
    expect(calculateInitialStorage(0.3, 0.15, 0.5, 0.6)).toBe(75); // 100% CAD
    expect(calculateInitialStorage(0.3, 0.15, 0.5, 0.6, 0.5)).toBe(37.5); // 50%
  });
});

describe("validateBalanceInput", () => {
  const ok = { fieldCapacity: 0.3, wiltingPoint: 0.15, effectiveSoilDepth: 0.6, pivotEfficiency: 0.85, pivotArea: 100, pivotFlowRate: 200 };
  it("não acusa problemas em input válido", () => {
    expect(validateBalanceInput(ok)).toHaveLength(0);
  });
  it("acusa CC <= PMP", () => {
    const issues = validateBalanceInput({ ...ok, fieldCapacity: 0.1 });
    expect(issues.some((i) => i.field === "field_capacity")).toBe(true);
  });
  it("acusa eficiência fora de (0,1]", () => {
    expect(validateBalanceInput({ ...ok, pivotEfficiency: 0 }).some((i) => i.field === "efficiency")).toBe(true);
    expect(validateBalanceInput({ ...ok, pivotEfficiency: 1.2 }).some((i) => i.field === "efficiency")).toBe(true);
  });
  it("acusa área e vazão não positivas", () => {
    expect(validateBalanceInput({ ...ok, pivotArea: 0 }).some((i) => i.field === "area")).toBe(true);
    expect(validateBalanceInput({ ...ok, pivotFlowRate: -1 }).some((i) => i.field === "flow_rate")).toBe(true);
  });
});
