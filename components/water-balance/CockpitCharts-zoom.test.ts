import { describe, expect, it } from "vitest";
import { reservoirAxisRange } from "@/modules/water-balance/services/reservoir-axis-range";

const bounds = [
  { attention: 72, safety: 62 },
  { attention: 65, safety: 49 },
  { attention: 70, safety: 56 },
];
const water = [11, 9, 13, 18];

describe("zoom vertical no reservatório de água do solo", () => {
  it("mantém escala original na visão completa", () => {
    expect(reservoirAxisRange({ zoom: "total", max: 110, bounds, water }))
      .toEqual({ min: 0, max: 110 });
  });

  it("destaca a faixa amarela da CRA sem alterar seus limites", () => {
    const r = reservoirAxisRange({ zoom: "atencao", max: 110, bounds, water });
    expect(r.min).toBeGreaterThan(0);
    expect(r.min).toBeLessThan(49);
    expect(r.max).toBeGreaterThan(72);
    expect(r.max).toBeLessThan(110);
  });

  it("mostra maior detalhe da curva ARM quando está abaixo da atenção", () => {
    const r = reservoirAxisRange({ zoom: "arm", max: 110, bounds, water });
    expect(r.min).toBeGreaterThanOrEqual(0);
    expect(r.min).toBeLessThan(9);
    expect(r.max).toBeGreaterThan(18);
    expect(r.max).toBeLessThan(49);
  });

  it("retorna escala completa quando dados para zoom são ausentes", () => {
    expect(reservoirAxisRange({ zoom: "atencao", max: 110, bounds: [], water: [] }))
      .toEqual({ min: 0, max: 110 });
  });
});
