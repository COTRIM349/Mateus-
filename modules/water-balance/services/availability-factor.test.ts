import { describe, it, expect } from "vitest";
import { availabilityFactor, cropGroupByName } from "./availability-factor";

describe("availabilityFactor — Tabela 2 (Doorenbos & Kassam, 1979)", () => {
  it("valores exatos da tabela", () => {
    expect(availabilityFactor(1, 2)).toBe(0.5);
    expect(availabilityFactor(4, 5)).toBe(0.6);   // soja/grupo 4, ETm 5
    expect(availabilityFactor(3, 10)).toBe(0.3);
    expect(availabilityFactor(2, 6)).toBe(0.35);
    expect(availabilityFactor(4, 2)).toBe(0.875);
  });

  it("interpola linearmente entre colunas de ETm", () => {
    // grupo 4: ETm 4 → 0,70; ETm 5 → 0,60; meio (4,5) → 0,65
    expect(availabilityFactor(4, 4.5)).toBeCloseTo(0.65, 3);
    // grupo 3: ETm 6 → 0,45; ETm 7 → 0,425; meio (6,5) → 0,4375 (arredondado 0,438)
    expect(availabilityFactor(3, 6.5)).toBeCloseTo(0.438, 3);
  });

  it("limita ETm aos extremos da tabela [2,10]", () => {
    expect(availabilityFactor(4, 1)).toBe(0.875);   // < 2 → coluna 2
    expect(availabilityFactor(4, 20)).toBe(0.4);    // > 10 → coluna 10
  });
});

describe("cropGroupByName — rodapés da Tabela 2", () => {
  it("classifica culturas conhecidas", () => {
    expect(cropGroupByName("Soja")).toBe(4);
    expect(cropGroupByName("SOJA BMX ATAQUE I2X")).toBe(4);
    expect(cropGroupByName("Milho")).toBe(4);
    expect(cropGroupByName("Cana-de-açúcar")).toBe(4);
    expect(cropGroupByName("Feijão")).toBe(3);
    expect(cropGroupByName("Trigo")).toBe(3);
    expect(cropGroupByName("Tomate")).toBe(2);
    expect(cropGroupByName("Batata")).toBe(1);
  });

  it("retorna null para cultura não listada", () => {
    expect(cropGroupByName("Cevada")).toBeNull();
    expect(cropGroupByName("")).toBeNull();
    expect(cropGroupByName(null)).toBeNull();
  });
});
