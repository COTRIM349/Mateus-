import { describe, expect, it } from "vitest";
import type { PivotHydricState } from "@/modules/water-balance/services";
import { MAP_HYDRIC_COLORS } from "@/modules/water-balance/services";
import {
  VISION_LAYER_CONFIG,
  VISION_LAYERS,
  rainAccumulatedMm,
  rainColor,
  orbitalColor,
  costColor,
  costPerHa,
  costSlicesFromEvents,
  toVisionMarkers,
} from "../vision-layers";

function stub(partial: Partial<PivotHydricState> = {}): PivotHydricState {
  return {
    pivotId: "eq1",
    pivotName: "P01",
    cultureName: "Soja",
    varietyName: null,
    seasonName: null,
    plantingDate: "2026-01-01",
    area: 80,
    latitude: -16.7,
    longitude: -49.3,
    radiusMeters: 400,
    parcelId: "parcela-1",
    soilName: "Latossolo",
    sheetIncomplete: false,
    startAngleDeg: null,
    endAngleDeg: null,
    parcelName: "Parcela A",
    current: {
      date: "2026-08-21",
      mapStatus: "atencao",
      precipitation: 4,
      deficit: 20,
    } as PivotHydricState["current"],
    history: [
      { date: "2026-08-15", precipitation: 6, mapStatus: "atencao" } as NonNullable<PivotHydricState["current"]>,
      { date: "2026-08-20", precipitation: 6, mapStatus: "atencao" } as NonNullable<PivotHydricState["current"]>,
      { date: "2026-08-21", precipitation: 4, mapStatus: "atencao" } as NonNullable<PivotHydricState["current"]>,
    ],
    ...partial,
  } as PivotHydricState;
}

describe("vision-layers", () => {
  it("VISION_LAYER_CONFIG cobre manejo, chuva, orbital e custo — sem telemetria", () => {
    expect(VISION_LAYERS).toEqual(["manejo", "chuva", "orbital", "custo"]);
    expect(Object.keys(VISION_LAYER_CONFIG).sort()).toEqual(["chuva", "custo", "manejo", "orbital"]);
  });

  it("chuva 7d soma precipitação do recorte; null se não houver dia no período", () => {
    expect(rainAccumulatedMm(stub(), "2026-08-21")).toBe(16);
    expect(rainAccumulatedMm(stub({ history: [], current: null }), "2026-08-21")).toBeNull();
    const oldOnly = stub({
      current: null,
      history: [{ date: "2026-07-01", precipitation: 40 } as NonNullable<PivotHydricState["current"]>],
    });
    expect(rainAccumulatedMm(oldOnly, "2026-08-21")).toBeNull();
  });

  it("faixas visuais de chuva não inventam recomendação", () => {
    expect(rainColor(null).color).toBe(MAP_HYDRIC_COLORS.gray);
    expect(rainColor(0).color).toBe("#BBDEFB");
    expect(rainColor(9.9).color).toBe("#64B5F6");
    expect(rainColor(24.9).color).toBe("#1E88E5");
    expect(rainColor(25).color).toBe("#0D47A1");
    expect(rainColor(null).label).toBe("Sem chuva registrada");
    expect(rainColor(12.3).label).toBe("12 mm");
  });

  it("orbital usa m³/m³ da camada 0–7 cm — não é %CC", () => {
    expect(orbitalColor(null).color).toBe(MAP_HYDRIC_COLORS.gray);
    expect(orbitalColor(0.09).color).toBe(MAP_HYDRIC_COLORS.red);
    expect(orbitalColor(0.17).color).toBe(MAP_HYDRIC_COLORS.yellow);
    expect(orbitalColor(0.27).color).toBe(MAP_HYDRIC_COLORS.green);
    expect(orbitalColor(0.30).color).toBe(MAP_HYDRIC_COLORS.blue);
    expect(orbitalColor(0.22).label).toBe("22.0% vol.");
    expect(orbitalColor(null).label).toBe("Sem dado orbital");
  });

  it("custo escala relativa (tercis da fazenda) sem limiar inventado", () => {
    expect(costColor(null, [10, 20, 30]).color).toBe(MAP_HYDRIC_COLORS.gray);
    expect(costColor(10, [10, 20, 30, 40, 50, 60]).color).toBe(MAP_HYDRIC_COLORS.green);
    expect(costColor(60, [10, 20, 30, 40, 50, 60]).color).toBe(MAP_HYDRIC_COLORS.red);
    expect(costColor(1234.5, [1234.5]).label).toContain("/ha");
    expect(costPerHa({ key: "p1", costReais: 80, areaHa: 0 })).toBeNull();
    expect(costPerHa({ key: "p1", costReais: 80, areaHa: 10 })).toBe(8);
  });

  it("costSlicesFromEvents soma custo já lançado e ignora evento sem preço", () => {
    const slices = costSlicesFromEvents(
      [
        { parcelId: "parcela-1", pivotId: "eq1", cost: 40 },
        { parcelId: "parcela-1", pivotId: "eq1", cost: 10 },
        { parcelId: null, pivotId: "eq1", cost: 5 },
        { parcelId: "parcela-1", pivotId: "eq1", cost: null },
      ],
      new Map([
        ["parcela-1", 80],
        ["eq1", 80],
      ]),
    );
    const byKey = Object.fromEntries(slices.map((s) => [s.key, s.costReais]));
    expect(byKey["parcela-1"]).toBe(50);
    expect(byKey.eq1).toBe(5);
  });

  it("toVisionMarkers pinta manejo pelo status hídrico e orbital pelo pivotId", () => {
    const manejo = toVisionMarkers([stub()], "manejo");
    expect(manejo[0].color).toBe(MAP_HYDRIC_COLORS.yellow);
    expect(manejo[0].statusLabel).toBe("Umidade de atenção");

    const orb = toVisionMarkers([stub()], "orbital", {
      orbital: [
        {
          pivotId: "eq1",
          sampledAt: "2026-08-21",
          moisture07: 0.12,
          moisture728: 0.2,
          moisture28100: 0.25,
          source: "open_meteo_soil",
        },
      ],
    });
    expect(orb[0].color).toBe(MAP_HYDRIC_COLORS.yellow);
    expect(orb[0].statusLabel).toContain("12.0% vol.");
  });

  it("toVisionMarkers omite pivô sem parcela ativa", () => {
    const markers = toVisionMarkers([stub({ parcelId: null })], "manejo");
    expect(markers).toHaveLength(0);
  });
});
