import { describe, expect, it } from "vitest";
import { validFarmCoordinate } from "./guards";

describe("climate-v2 coordinate guard", () => {
  it("aceita coordenadas decimais válidas da Fazenda Karitel", () => {
    expect(validFarmCoordinate(-14.775966667, -45.566452778)).toBe(true);
  });

  it("rejeita coordenadas ausentes", () => {
    expect(validFarmCoordinate(null, -45.5)).toBe(false);
    expect(validFarmCoordinate(-14.7, null)).toBe(false);
  });

  it("rejeita coordenadas fora do intervalo geográfico", () => {
    expect(validFarmCoordinate(143856.75, 45142.49)).toBe(false);
    expect(validFarmCoordinate(91, -45)).toBe(false);
    expect(validFarmCoordinate(-14, -181)).toBe(false);
  });

  it("rejeita NaN e infinito", () => {
    expect(validFarmCoordinate(Number.NaN, -45)).toBe(false);
    expect(validFarmCoordinate(-14, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
