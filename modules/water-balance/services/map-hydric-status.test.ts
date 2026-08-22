import { describe, expect, it } from "vitest";
import {
  classifyWaterStatus,
  MAP_HYDRIC_COLORS,
  MAP_HYDRIC_LEGEND_ORDER,
  MAP_HYDRIC_NEED_IRRIGATE,
  MAP_HYDRIC_NO_IRRIGATE,
  MAP_HYDRIC_STATUS_CONFIG,
  MAP_HYDRIC_THRESHOLDS,
} from "./map-hydric-status";

describe("classifyWaterStatus — seis níveis", () => {
  const cad = 100;
  const afd = 50;

  it("marca incompleto sem dados físicos suficientes", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: 0, afdMm: 20 })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: null, cadMm: cad, afdMm: afd })).toBe("incompleto");
  });

  it("azul na capacidade de campo", () => {
    expect(classifyWaterStatus({ armMm: 99, cadMm: cad, afdMm: afd })).toBe("capacidade_campo");
  });

  it("verde escuro em ótima umidade", () => {
    expect(classifyWaterStatus({ armMm: 90, cadMm: cad, afdMm: afd })).toBe("otima_umidade");
  });

  it("verde claro em boa umidade", () => {
    expect(classifyWaterStatus({ armMm: 72, cadMm: cad, afdMm: afd })).toBe("boa_umidade");
  });

  it("laranja perto da AFD", () => {
    expect(classifyWaterStatus({ armMm: 58, cadMm: cad, afdMm: afd })).toBe("alerta");
  });

  it("vermelho quando AFD foi ultrapassada", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: cad, afdMm: afd })).toBe("atencao");
  });

  it("preto em esgotamento severo", () => {
    expect(classifyWaterStatus({ armMm: 5, cadMm: cad, afdMm: afd })).toBe("deficit_hidrico");
  });

  it("respeita limiar parametrizado da CC", () => {
    expect(classifyWaterStatus({
      armMm: 90,
      cadMm: cad,
      afdMm: afd,
      thresholds: { ...MAP_HYDRIC_THRESHOLDS, fieldCapacityRatio: 0.9 },
    })).toBe("capacidade_campo");
  });

  it("mantém a paleta operacional solicitada", () => {
    expect(MAP_HYDRIC_NO_IRRIGATE).toEqual(["capacidade_campo", "otima_umidade", "boa_umidade", "incompleto"]);
    expect(MAP_HYDRIC_NEED_IRRIGATE).toEqual(["alerta", "atencao", "deficit_hidrico"]);
    expect(MAP_HYDRIC_LEGEND_ORDER).toHaveLength(6);
    expect(MAP_HYDRIC_STATUS_CONFIG.capacidade_campo.color).toBe(MAP_HYDRIC_COLORS.blue);
    expect(MAP_HYDRIC_STATUS_CONFIG.otima_umidade.color).toBe(MAP_HYDRIC_COLORS.darkGreen);
    expect(MAP_HYDRIC_STATUS_CONFIG.boa_umidade.color).toBe(MAP_HYDRIC_COLORS.lightGreen);
    expect(MAP_HYDRIC_STATUS_CONFIG.alerta.color).toBe(MAP_HYDRIC_COLORS.orange);
    expect(MAP_HYDRIC_STATUS_CONFIG.atencao.color).toBe(MAP_HYDRIC_COLORS.red);
    expect(MAP_HYDRIC_STATUS_CONFIG.deficit_hidrico.color).toBe(MAP_HYDRIC_COLORS.black);
  });
});
