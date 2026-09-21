import { describe, expect, it } from "vitest";
import { buildRecommendation } from "./os-calculations";
import { normalizeServiceOrder, type RawServiceOrder } from "./os-parsing";
import { buildFichaHtml } from "./ficha-html";

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

describe("buildFichaHtml", () => {
  it("gera um documento HTML com os dados da OS", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()), { applicationRate: 100, tankCapacity: 3000 });
    const html = buildFichaHtml(rec);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("OS 33284");
    expect(html).toContain("PULVERIZACAO HERBICIDAS");
    expect(html).toContain("FAZENDA KARITEL");
    expect(html).toContain("66 mL/ha");
    expect(html).toContain("Calda");
  });

  it("escapa HTML dos campos de texto", () => {
    const rec = buildRecommendation(
      normalizeServiceOrder(rawOrder({ farm: "FAZENDA <b>X</b>" })),
    );
    const html = buildFichaHtml(rec);
    expect(html).toContain("FAZENDA &lt;b&gt;X&lt;/b&gt;");
    expect(html).not.toContain("FAZENDA <b>X</b>");
  });
});
