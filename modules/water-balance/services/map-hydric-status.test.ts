import { describe, expect, it } from "vitest";
import {
  classifyWaterStatus,
  MAP_HYDRIC_COLORS,
  MAP_HYDRIC_LEGEND_ORDER,
  MAP_HYDRIC_NEED_IRRIGATE,
  MAP_HYDRIC_NO_IRRIGATE,
  MAP_HYDRIC_STATUS_CONFIG,
} from "./map-hydric-status";

describe("classifyWaterStatus — 6 cores FAO-56", () => {
  const cad = 66.61;
  const afd = 33.31;

  it("marca incompleto sem CAD ou ARM", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: 0, afdMm: 20 })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: null, cadMm: cad, afdMm: afd })).toBe("incompleto");
  });

  it("azul quando Dr ≈ 0 (capacidade de campo)", () => {
    expect(classifyWaterStatus({ armMm: 66.5, cadMm: cad, afdMm: afd })).toBe("capacidade_campo");
  });

  it("verde escuro na ótima umidade", () => {
    expect(classifyWaterStatus({ armMm: 56, cadMm: cad, afdMm: afd })).toBe("otima");
  });

  it("verde claro na boa umidade", () => {
    expect(classifyWaterStatus({ armMm: 46, cadMm: cad, afdMm: afd })).toBe("boa");
  });

  it("laranja no alerta (Dr próximo da CRA)", () => {
    expect(classifyWaterStatus({ armMm: 36.91, cadMm: cad, afdMm: afd })).toBe("alerta");
  });

  it("vermelho no estresse (Dr > CRA, Ks < 1)", () => {
    expect(classifyWaterStatus({ armMm: 26.61, cadMm: cad, afdMm: afd })).toBe("estresse");
  });

  it("preto no déficit severo", () => {
    expect(classifyWaterStatus({ armMm: 10, cadMm: cad, afdMm: afd })).toBe("severo");
  });

  it("agrupa irrigar / não irrigar e paleta de 6 cores", () => {
    expect(MAP_HYDRIC_NO_IRRIGATE).toEqual(["capacidade_campo", "otima", "boa", "incompleto"]);
    expect(MAP_HYDRIC_NEED_IRRIGATE).toEqual(["alerta", "estresse", "severo"]);
    expect(MAP_HYDRIC_LEGEND_ORDER).toHaveLength(6);
    expect(MAP_HYDRIC_STATUS_CONFIG.capacidade_campo.color).toBe(MAP_HYDRIC_COLORS.blue);
    expect(MAP_HYDRIC_STATUS_CONFIG.otima.color).toBe(MAP_HYDRIC_COLORS.darkGreen);
    expect(MAP_HYDRIC_STATUS_CONFIG.boa.color).toBe(MAP_HYDRIC_COLORS.lightGreen);
    expect(MAP_HYDRIC_STATUS_CONFIG.alerta.color).toBe(MAP_HYDRIC_COLORS.orange);
    expect(MAP_HYDRIC_STATUS_CONFIG.estresse.color).toBe(MAP_HYDRIC_COLORS.red);
    expect(MAP_HYDRIC_STATUS_CONFIG.severo.color).toBe(MAP_HYDRIC_COLORS.black);
  });
});
