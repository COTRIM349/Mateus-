import { describe, expect, it } from "vitest";
import {
  DRAWING_KIND_CONFIG,
  geometryFromLatLngs,
  mapDbDrawing,
  validateDrawingForKind,
  validateDrawingGeometry,
} from "../geojson-drawing";

describe("geojson-drawing", () => {
  it("kinds cobrem talhão, canal, cerca, estrada, reservatório e anotação", () => {
    expect(Object.keys(DRAWING_KIND_CONFIG).sort()).toEqual([
      "anotacao",
      "canal",
      "cerca",
      "estrada",
      "reservatorio",
      "talhao",
    ]);
  });

  it("talhão e reservatório exigem polígono fechado com ≥3 vértices", () => {
    expect(
      validateDrawingForKind("talhao", {
        type: "Polygon",
        coordinates: [
          [
            [-49.3, -16.7],
            [-49.2, -16.7],
            [-49.2, -16.6],
            [-49.3, -16.7],
          ],
        ],
      }).ok,
    ).toBe(true);
    expect(
      validateDrawingForKind("talhao", {
        type: "LineString",
        coordinates: [
          [-49.3, -16.7],
          [-49.2, -16.6],
        ],
      }).ok,
    ).toBe(false);
  });

  it("canal, cerca e estrada exigem linha com ≥2 pontos", () => {
    expect(
      validateDrawingForKind("canal", {
        type: "LineString",
        coordinates: [
          [-49.3, -16.7],
          [-49.2, -16.6],
        ],
      }).ok,
    ).toBe(true);
    expect(
      validateDrawingForKind("cerca", {
        type: "Point",
        coordinates: [-49.3, -16.7],
      }).ok,
    ).toBe(false);
  });

  it("anotação é um ponto", () => {
    expect(
      validateDrawingForKind("anotacao", {
        type: "Point",
        coordinates: [-49.3, -16.7],
      }).ok,
    ).toBe(true);
    expect(validateDrawingGeometry({ type: "Point", coordinates: [-49.3, -16.7] }).error).toBeNull();
  });

  it("geometryFromLatLngs fecha polígono e rejeita incompleto", () => {
    const poly = geometryFromLatLngs("polygon", [
      { lat: -16.7, lng: -49.3 },
      { lat: -16.7, lng: -49.2 },
      { lat: -16.6, lng: -49.2 },
    ]);
    expect(poly?.type).toBe("Polygon");
    expect((poly as { coordinates: number[][][] }).coordinates[0]).toHaveLength(4);
    expect(geometryFromLatLngs("polygon", [{ lat: 0, lng: 0 }])).toBeNull();
    expect(
      geometryFromLatLngs("polyline", [
        { lat: -16.7, lng: -49.3 },
        { lat: -16.6, lng: -49.2 },
      ])?.type,
    ).toBe("LineString");
    expect(geometryFromLatLngs("marker", [{ lat: -16.7, lng: -49.3 }])?.type).toBe("Point");
  });

  it("mapDbDrawing ignora kind ou geometria inválidos", () => {
    expect(
      mapDbDrawing({
        id: "1",
        farm_id: "f",
        name: "Talhão 1",
        kind: "talhao",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-49.3, -16.7],
              [-49.2, -16.7],
              [-49.2, -16.6],
              [-49.3, -16.7],
            ],
          ],
        },
        color: "#8BC34A",
        notes: null,
      })?.name,
    ).toBe("Talhão 1");
    expect(
      mapDbDrawing({
        id: "2",
        farm_id: "f",
        name: "X",
        kind: "telemetria",
        geometry: { type: "Point", coordinates: [-49.3, -16.7] },
        color: null,
        notes: null,
      }),
    ).toBeNull();
  });
});
