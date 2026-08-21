import { describe, expect, it } from "vitest";
import { countMapStatuses, hydricMapStates, toHydricMapMarkers } from "./hydric-map-markers";
import type { PivotHydricState } from "@/modules/water-balance/services";

function stub(partial: Partial<PivotHydricState>): PivotHydricState {
  return {
    pivotId: "p1",
    pivotName: "P01",
    farmName: "Fazenda",
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
    current: {
      mapStatus: "boa_umidade",
    } as PivotHydricState["current"],
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
  it("pinta o círculo com a cor sólida do status do motor", () => {
    const markers = toHydricMapMarkers([stub({})]);
    expect(markers).toHaveLength(1);
    expect(markers[0].color).toBe("#4ade80");
    expect(markers[0].radiusMeters).toBe(500);
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
