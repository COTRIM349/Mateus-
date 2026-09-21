import { describe, expect, it } from "vitest";
import {
  ServiceOrderParseError,
  normalizeServiceOrder,
  normalizeUnit,
  parseBrazilianDate,
  parseBrazilianNumber,
  type RawServiceOrder,
} from "./os-parsing";

// OS real do exemplo (TOTVS cfgcen-011, OS 33284).
function rawOrder(overrides: Partial<RawServiceOrder> = {}): RawServiceOrder {
  return {
    number: "33284",
    date: "21/09/2026 13.33.43",
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

describe("parseBrazilianNumber", () => {
  it("trata vírgula como decimal", () => {
    expect(parseBrazilianNumber("9,90000")).toBe(9.9);
    expect(parseBrazilianNumber("0,1000")).toBe(0.1);
    expect(parseBrazilianNumber("150,00")).toBe(150);
  });

  it("trata ponto como milhar quando há vírgula", () => {
    expect(parseBrazilianNumber("1.234,56")).toBe(1234.56);
    expect(parseBrazilianNumber("10.000,00")).toBe(10000);
  });

  it("trata ponto como decimal quando não há vírgula", () => {
    expect(parseBrazilianNumber("0.066")).toBe(0.066);
  });

  it("ignora símbolos de unidade e espaços", () => {
    expect(parseBrazilianNumber(" 9,90 LT ")).toBe(9.9);
  });

  it("aceita number direto", () => {
    expect(parseBrazilianNumber(150)).toBe(150);
  });

  it("retorna null para entrada inválida", () => {
    expect(parseBrazilianNumber("")).toBeNull();
    expect(parseBrazilianNumber(null)).toBeNull();
    expect(parseBrazilianNumber("abc")).toBeNull();
    expect(parseBrazilianNumber("-")).toBeNull();
  });
});

describe("normalizeUnit", () => {
  it("reconhece unidades conhecidas", () => {
    expect(normalizeUnit("LT")).toBe("LT");
    expect(normalizeUnit(" kg ")).toBe("KG");
  });

  it("usa UN como fallback", () => {
    expect(normalizeUnit("xyz")).toBe("UN");
    expect(normalizeUnit(null)).toBe("UN");
  });
});

describe("parseBrazilianDate", () => {
  it("converte DD/MM/AAAA para ISO", () => {
    expect(parseBrazilianDate("21/09/2026 13.33.43")).toBe("2026-09-21");
    expect(parseBrazilianDate("01/01/2027")).toBe("2027-01-01");
  });

  it("retorna null para formato desconhecido", () => {
    expect(parseBrazilianDate("2026-09-21")).toBeNull();
    expect(parseBrazilianDate(null)).toBeNull();
  });
});

describe("normalizeServiceOrder", () => {
  it("normaliza a OS 33284 do exemplo", () => {
    const os = normalizeServiceOrder(rawOrder());

    expect(os.number).toBe("33284");
    expect(os.date).toBe("2026-09-21");
    expect(os.operation.code).toBe("1040");
    expect(os.location.farm).toBe("FAZENDA KARITEL");
    expect(os.location.quadrant).toBe("24");
    expect(os.location.area).toBe(150);

    expect(os.inputs).toHaveLength(1);
    const input = os.inputs[0];
    expect(input.description).toBe("AURORA - CARFENTRAZONA");
    expect(input.unit).toBe("LT");
    expect(input.consumedQuantity).toBe(9.9);
    expect(input.packageCapacity).toBe(5);
    expect(input.packageCount).toBe(2);
    expect(input.withdrawnQuantity).toBe(10);
    expect(input.expectedLeftover).toBe(0.1);
  });

  it("lança erro apontando o campo ausente", () => {
    expect(() => normalizeServiceOrder(rawOrder({ number: "" }))).toThrow(ServiceOrderParseError);
    expect(() => normalizeServiceOrder(rawOrder({ area: "" }))).toThrow(/área/i);
  });

  it("lança erro quando não há insumos", () => {
    expect(() => normalizeServiceOrder(rawOrder({ inputs: [] }))).toThrow(/insumo/i);
  });

  it("quadrante ausente vira null", () => {
    const os = normalizeServiceOrder(rawOrder({ quadrant: "" }));
    expect(os.location.quadrant).toBeNull();
  });
});
