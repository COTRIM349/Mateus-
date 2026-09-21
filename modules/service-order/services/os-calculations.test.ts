import { describe, expect, it } from "vitest";
import { buildRecommendation } from "./os-calculations";
import { normalizeServiceOrder, type RawServiceOrder } from "./os-parsing";

function rawOrder(overrides: Partial<RawServiceOrder> = {}): RawServiceOrder {
  return {
    number: "33284",
    date: "21/09/2026",
    team: "EQUIPE DE PULVERIZACAO KARITEL",
    productionPeriod: "SOJA 26/27",
    operationCode: "1040",
    operationDescription: "PULVERIZACAO HERBICIDAS",
    inputs: [
      {
        code: "21800041",
        description: "AURORA - CARFENTRAZONA",
        erpCode: "021800041",
        unit: "LT",
        consumedQuantity: "9,90000",
        packageCapacity: "5,0000",
        packageCount: "2",
        withdrawnQuantity: "10,00000",
        expectedLeftover: "0,1000",
      },
    ],
    farm: "FAZENDA KARITEL",
    pivot: "PIVO 24",
    quadrant: "24",
    area: "150,00",
    ...overrides,
  };
}

describe("buildRecommendation", () => {
  it("calcula a dose por hectare da OS 33284", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()));
    const input = rec.inputs[0];
    // 9,90 L / 150 ha = 0,066 L/ha
    expect(input.doseByArea).toBeCloseTo(0.066, 4);
    expect(input.leftover).toBeCloseTo(0.1, 4);
  });

  it("não gera avisos quando os números batem", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()));
    expect(rec.warnings).toHaveLength(0);
  });

  it("avisa quando a retirada não bate com embalagens", () => {
    const rec = buildRecommendation(
      normalizeServiceOrder(rawOrder({
        inputs: [
          {
            code: "21800041",
            description: "AURORA - CARFENTRAZONA",
            unit: "LT",
            consumedQuantity: "9,90",
            packageCapacity: "5,00",
            packageCount: "2",
            withdrawnQuantity: "12,00", // deveria ser 10
            expectedLeftover: "2,10",
          },
        ],
      })),
    );
    expect(rec.warnings.some((w) => w.level === "atencao")).toBe(true);
  });

  it("marca como crítico quando o consumo excede a retirada", () => {
    const rec = buildRecommendation(
      normalizeServiceOrder(rawOrder({
        inputs: [
          {
            code: "X",
            description: "PRODUTO X",
            unit: "LT",
            consumedQuantity: "12,00",
            packageCapacity: "5,00",
            packageCount: "2",
            withdrawnQuantity: "10,00",
            expectedLeftover: "0",
          },
        ],
      })),
    );
    expect(rec.warnings.some((w) => w.level === "critico")).toBe(true);
  });

  it("gera o plano de calda quando a taxa é informada", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()), {
      applicationRate: 100,
      tankCapacity: 3000,
    });
    expect(rec.calda).not.toBeNull();
    expect(rec.calda?.totalVolume).toBe(15000); // 100 L/ha × 150 ha
    expect(rec.calda?.tanksNeeded).toBe(5); // ceil(15000 / 3000)
  });

  it("não gera plano de calda sem taxa de aplicação", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()));
    expect(rec.calda).toBeNull();
  });
});
