import { describe, expect, it } from "vitest";
import {
  hasValidGeographicCoordinates,
  isCoordinateValueValid,
  isInBrazilBox,
  normalizeCoordText,
  parseCoordinate,
} from "./coord";

describe("coordenadas geográficas", () => {
  it("aceita decimal com vírgula e preserva o hemisfério sul/oeste", () => {
    expect(normalizeCoordText(" -14,6491 ")).toBe("-14.6491");
    expect(parseCoordinate("-14,6491", "latitude")).toMatchObject({
      valid: true,
      value: -14.6491,
      error: null,
    });
  });

  it("rejeita valor DMS colado como se fosse coordenada decimal", () => {
    expect(parseCoordinate("143856.75", "latitude")).toMatchObject({
      valid: false,
      value: 143856.75,
    });
    expect(hasValidGeographicCoordinates(143856.75, 45142.49)).toBe(false);
  });

  it("rejeita null, string, NaN e infinito no guard operacional", () => {
    expect(isCoordinateValueValid(null, "latitude")).toBe(false);
    expect(isCoordinateValueValid("-14.6", "latitude")).toBe(false);
    expect(isCoordinateValueValid(Number.NaN, "latitude")).toBe(false);
    expect(isCoordinateValueValid(Number.POSITIVE_INFINITY, "longitude")).toBe(false);
  });

  it("aceita os limites globais e rejeita valores logo após os limites", () => {
    expect(hasValidGeographicCoordinates(-90, 180)).toBe(true);
    expect(hasValidGeographicCoordinates(-90.0001, 180)).toBe(false);
    expect(hasValidGeographicCoordinates(-14.6491, -180.0001)).toBe(false);
  });

  it("mantém a checagem brasileira separada da validade global", () => {
    const outsideBrazil = parseCoordinate("40.7128", "latitude");
    expect(outsideBrazil.valid).toBe(true);
    expect(outsideBrazil.warning).not.toBeNull();
    expect(isInBrazilBox(-14.6491, -45.234)).toBe(true);
  });
});
