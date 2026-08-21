import { describe, expect, it } from "vitest";
import {
  classifyWaterStatus,
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
    expect(classifyWaterStatus({ armMm: 100, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("capacidade_campo");
  });

  it("verde escuro na ótima umidade", () => {
    expect(classifyWaterStatus({ armMm: 85, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("otima_umidade");
  });

  it("verde claro na boa umidade (acima da segurança)", () => {
    expect(classifyWaterStatus({ armMm: 60, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("boa_umidade");
  });

  it("laranja no sinal de alerta", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("sinal_alerta");
  });

  it("vermelho em atenção", () => {
    expect(classifyWaterStatus({ armMm: 20, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("atencao");
  });

  it("preto no déficit hídrico", () => {
    expect(classifyWaterStatus({ armMm: 0, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("deficit_hidrico");
    expect(classifyWaterStatus({ armMm: -2, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
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
});
