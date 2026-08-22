import { describe, expect, it } from "vitest";
import {
  countMapStatuses,
  hydricDemandSummary,
  hydricMapDates,
  hydricMapStates,
  mapStatusOf,
  toHydricMapMarkers,
} from "./hydric-map-markers";
import {
  MAP_HYDRIC_COLORS,
  type PivotHydricState,
} from "@/modules/water-balance/services";

function stub(partial: Partial<PivotHydricState>): PivotHydricState {
  return {
    pivotId: "p1",
    pivotName: "P01",
    cultureName: "Soja",
    varietyName: null,
    seasonName: null,
    plantingDate: "2026-01-01",
    area: 80,
    latitude: -14.6,
    longitude: -45.2,
    radiusMeters: 500,
    parcelId: "parcela-1",
    soilName: "Latossolo",
    sheetIncomplete: false,
    startAngleDeg: null,
    endAngleDeg: null,
    parcelName: null,
    current: {
      date: "2026-08-21",
      mapStatus: "boa_umidade",
      deficit: 10,
    } as PivotHydricState["current"],
    history: [
      { date: "2026-08-20", mapStatus: "atencao", deficit: 40 } as NonNullable<PivotHydricState["current"]>,
      { date: "2026-08-21", mapStatus: "boa_umidade", deficit: 10 } as NonNullable<PivotHydricState["current"]>,
    ],
    ...partial,
  } as PivotHydricState;
}

describe("hydricMapStates", () => {
  it("omite pivô sem parcela ativa", () => {
    const states = [stub({ parcelId: null }), stub({ pivotId: "p2", parcelId: "ok" })];
    expect(hydricMapStates(states).map((s) => s.pivotId)).toEqual(["p2"]);
  });
});

describe("toHydricMapMarkers", () => {
  it("pinta o círculo com a cor do status do motor", () => {
    const markers = toHydricMapMarkers([stub({})]);
    expect(markers).toHaveLength(1);
    expect(markers[0].color).toBe(MAP_HYDRIC_COLORS.lightGreen);
    expect(markers[0].radiusMeters).toBe(500);
    expect(markers[0].id).toBe("parcela-1");
  });

  it("usa a coordenada do pivô e os ângulos da parcela no quadrante", () => {
    const markers = toHydricMapMarkers([
      stub({
        startAngleDeg: 315,
        endAngleDeg: 360,
        parcelName: "Pivô 29 A1",
      }),
    ]);
    expect(markers[0].latitude).toBe(-14.6);
    expect(markers[0].longitude).toBe(-45.2);
    expect(markers[0].startAngleDeg).toBe(315);
    expect(markers[0].endAngleDeg).toBe(360);
    expect(markers[0].name).toBe("Pivô 29 A1");
  });

  it("recolore pelo dia escolhido no histórico", () => {
    const markers = toHydricMapMarkers([stub({})], "2026-08-20");
    expect(markers[0].color).toBe(MAP_HYDRIC_COLORS.red);
    expect(mapStatusOf(stub({}), "2026-08-20")).toBe("atencao");
  });

  it("não inventa marcador sem coordenada", () => {
    expect(toHydricMapMarkers([stub({ latitude: 0, longitude: 0 })])).toHaveLength(0);
  });
});

describe("countMapStatuses", () => {
  it("conta só parcelas ativas", () => {
    const counts = countMapStatuses([
      stub({ parcelId: null, current: { mapStatus: "atencao" } as PivotHydricState["current"] }),
      stub({ pivotId: "p2", current: { mapStatus: "boa_umidade" } as PivotHydricState["current"] }),
    ]);
    expect(counts.atencao).toBeUndefined();
    expect(counts.boa_umidade).toBe(1);
  });
});

describe("hydricMapDates", () => {
  it("não inclui data futura e limita a 7 dias", () => {
    expect(hydricMapDates([stub({})], "2026-08-21")).toEqual(["2026-08-20", "2026-08-21"]);
    expect(hydricMapDates([stub({})], "2026-08-20")).toEqual(["2026-08-20"]);
  });
});

describe("hydricDemandSummary", () => {
  it("conta condições críticas como demanda", () => {
    const summary = hydricDemandSummary([
      stub({}),
      stub({
        pivotId: "p2",
        pivotName: "P02",
        current: { date: "2026-08-21", mapStatus: "deficit_hidrico", deficit: 80 } as PivotHydricState["current"],
        history: [],
      }),
    ]);
    expect(summary).toEqual({ needing: 1, total: 2, highestName: "P02" });
  });
});
