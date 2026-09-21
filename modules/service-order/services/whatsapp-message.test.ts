import { describe, expect, it } from "vitest";
import { buildRecommendation } from "./os-calculations";
import { normalizeServiceOrder, type RawServiceOrder } from "./os-parsing";
import { buildWhatsappMessage } from "./whatsapp-message";

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

describe("buildWhatsappMessage", () => {
  it("inclui os campos essenciais da OS", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()));
    const msg = buildWhatsappMessage(rec);

    expect(msg).toContain("ORDEM DE SERVIÇO 33284");
    expect(msg).toContain("PULVERIZACAO HERBICIDAS");
    expect(msg).toContain("FAZENDA KARITEL");
    expect(msg).toContain("PIVO 24");
    expect(msg).toContain("Quadrante 24");
    expect(msg).toContain("150,00 ha");
    expect(msg).toContain("AURORA - CARFENTRAZONA");
    expect(msg).toContain("21/09/2026");
  });

  it("mostra dose pequena em mL/ha", () => {
    const msg = buildWhatsappMessage(buildRecommendation(normalizeServiceOrder(rawOrder())));
    // 0,066 L/ha = 66 mL/ha
    expect(msg).toContain("66 mL/ha");
  });

  it("inclui a seção de calda quando há taxa", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()), {
      applicationRate: 100,
      tankCapacity: 3000,
    });
    const msg = buildWhatsappMessage(rec);
    expect(msg).toContain("CALDA");
    expect(msg).toContain("15.000 L");
  });

  it("lista avisos de conferência quando existem", () => {
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
    const msg = buildWhatsappMessage(rec);
    expect(msg).toContain("CONFERIR ANTES DE APLICAR");
  });
});
