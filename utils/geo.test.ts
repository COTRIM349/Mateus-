import { describe, expect, it } from "vitest";
import { destinationLatLng, radiusFromArea } from "./geo";

describe("destinationLatLng", () => {
  it("1 km para o norte no equador aumenta só a latitude", () => {
    const dest = destinationLatLng(0, 0, 1000, 0);
    expect(dest.lng).toBeCloseTo(0, 6);
    expect(dest.lat).toBeCloseTo((1000 / 6378137) * (180 / Math.PI), 5);
  });

  it("1 km para o leste no equador aumenta só a longitude", () => {
    const dest = destinationLatLng(0, 0, 1000, 90);
    expect(dest.lat).toBeCloseTo(0, 6);
    expect(dest.lng).toBeCloseTo((1000 / 6378137) * (180 / Math.PI), 5);
  });
});

describe("radiusFromArea", () => {
  it("converte hectares em raio sem arredondar para constante", () => {
    expect(radiusFromArea(100 / Math.PI)).toBeCloseTo(1000 / Math.PI, 5);
  });
});
