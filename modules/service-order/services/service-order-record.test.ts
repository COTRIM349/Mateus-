import { describe, expect, it } from "vitest";
import { buildRecommendation } from "./os-calculations";
import { normalizeServiceOrder, type RawServiceOrder } from "./os-parsing";
import { buildWhatsappMessage } from "./whatsapp-message";
import { buildServiceOrderInsert, orderToRaw } from "./service-order-record";

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

describe("buildServiceOrderInsert", () => {
  it("mapeia a recomendação para a linha da tabela", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()), { applicationRate: 100, tankCapacity: 3000 });
    const msg = buildWhatsappMessage(rec);
    const row = buildServiceOrderInsert("farm-123", rec, msg, "user-1");

    expect(row.farm_id).toBe("farm-123");
    expect(row.os_number).toBe("33284");
    expect(row.os_date).toBe("2026-09-21");
    expect(row.os_farm_name).toBe("FAZENDA KARITEL");
    expect(row.pivot_label).toBe("PIVO 24");
    expect(row.area).toBe(150);
    expect(row.application_rate).toBe(100);
    expect(row.tank_capacity).toBe(3000);
    expect(row.created_by).toBe("user-1");
    expect(row.whatsapp_message).toContain("33284");
    expect(row.order_data.inputs).toHaveLength(1);
  });

  it("deixa calda nula quando não informada", () => {
    const rec = buildRecommendation(normalizeServiceOrder(rawOrder()));
    const row = buildServiceOrderInsert("farm-1", rec, "msg");
    expect(row.application_rate).toBeNull();
    expect(row.tank_capacity).toBeNull();
    expect(row.created_by).toBeNull();
  });
});

describe("orderToRaw", () => {
  it("reabre a OS no formato do formulário (BR)", () => {
    const order = normalizeServiceOrder(rawOrder());
    const raw = orderToRaw(order);

    expect(raw.number).toBe("33284");
    expect(raw.date).toBe("21/09/2026");
    expect(raw.area).toBe("150");
    expect(raw.quadrant).toBe("24");
    expect(raw.inputs?.[0].consumedQuantity).toBe("9,9");
    expect(raw.inputs?.[0].packageCapacity).toBe("5");
  });

  it("roundtrip: normalize(orderToRaw(order)) preserva os números", () => {
    const order = normalizeServiceOrder(rawOrder());
    const back = normalizeServiceOrder(orderToRaw(order));
    expect(back.location.area).toBe(order.location.area);
    expect(back.inputs[0].consumedQuantity).toBe(order.inputs[0].consumedQuantity);
    expect(back.inputs[0].withdrawnQuantity).toBe(order.inputs[0].withdrawnQuantity);
  });
});
