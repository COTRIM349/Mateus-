import { describe, expect, it } from "vitest";
import {
  classifyWaterStatus,
  MAP_HYDRIC_LEGEND_ORDER,
  MAP_HYDRIC_NEED_IRRIGATE,
  MAP_HYDRIC_NO_IRRIGATE,
  MAP_HYDRIC_STATUS_CONFIG,
  MAP_HYDRIC_THRESHOLDS,
} from "./map-hydric-status";

describe("classifyWaterStatus", () => {
  const cad = 100;
  const afd = 50;
  const safety = 50;

  it("marca incompleto sem CAD ou ARM", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: 0, afdMm: 20 })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: null, cadMm: cad, afdMm: afd })).toBe("incompleto");
  });

  it("azul quando ARM está na capacidade de campo", () => {
    expect(classifyWaterStatus({ armMm: 99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("capacidade_campo");
  });

  it("verde quando está abaixo da CC e acima da segurança", () => {
    expect(classifyWaterStatus({ armMm: 85, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("boa_umidade");
  });

  it("amarelo abaixo da segurança com água no solo", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("atencao");
  });

  it("vermelho no déficit hídrico", () => {
    expect(classifyWaterStatus({ armMm: 0, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("deficit_hidrico");
  });

  it("respeita limiares parametrizados", () => {
    expect(
      classifyWaterStatus({
        armMm: 90,
        cadMm: cad,
        afdMm: afd,
        safetyMoistureMm: safety,
        thresholds: { ...MAP_HYDRIC_THRESHOLDS, fieldCapacityRatio: 0.9 },
      }),
    ).toBe("capacidade_campo");
  });

  it("agrupa irrigar / não irrigar como nas plataformas de manejo", () => {
    expect(MAP_HYDRIC_NO_IRRIGATE).toEqual(["capacidade_campo", "boa_umidade", "incompleto"]);
    expect(MAP_HYDRIC_NEED_IRRIGATE).toEqual(["atencao", "deficit_hidrico"]);
    expect(MAP_HYDRIC_LEGEND_ORDER).toHaveLength(4);
    expect(MAP_HYDRIC_STATUS_CONFIG.capacidade_campo.color).toBe("#3b82f6");
    expect(MAP_HYDRIC_STATUS_CONFIG.boa_umidade.color).toBe("#22c55e");
    expect(MAP_HYDRIC_STATUS_CONFIG.atencao.color).toBe("#eab308");
    expect(MAP_HYDRIC_STATUS_CONFIG.deficit_hidrico.color).toBe("#ef4444");
  });
});
