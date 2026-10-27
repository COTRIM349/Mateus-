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

describe("classifyWaterStatus", () => {
  const cad = 100;
  const afd = 50;
  const safety = 50;

  it("marca incompleto sem CAD, ARM ou AFD válidos", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: 0, afdMm: 20 })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: null, cadMm: cad, afdMm: afd })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: 90, cadMm: cad, afdMm: 0 })).toBe("incompleto");
  });

  it("verde somente quando ARM está na capacidade de campo", () => {
    expect(classifyWaterStatus({ armMm: 99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("capacidade_campo");
  });

  it("azul abaixo da CC enquanto ainda não há aproximação do limite", () => {
    expect(classifyWaterStatus({ armMm: 85, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("boa_umidade");
  });

  it("amarelo quando consome de 70% até menos de 100% da AFD", () => {
    expect(classifyWaterStatus({ armMm: 60, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("atencao");
  });

  it("vermelho quando o déficit atinge a AFD e existe necessidade de irrigação", () => {
    expect(classifyWaterStatus({ armMm: 50, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("deficit_hidrico");
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

  it("separa atenção de necessidade real de irrigação", () => {
    expect(MAP_HYDRIC_NO_IRRIGATE).toEqual(["capacidade_campo", "boa_umidade", "incompleto"]);
    expect(MAP_HYDRIC_NEED_IRRIGATE).toEqual(["deficit_hidrico"]);
    expect(MAP_HYDRIC_LEGEND_ORDER).toHaveLength(4);
    expect(MAP_HYDRIC_STATUS_CONFIG.capacidade_campo.color).toBe(MAP_HYDRIC_COLORS.green);
    expect(MAP_HYDRIC_STATUS_CONFIG.capacidade_campo.label).toBe("Capacidade de campo");
    expect(MAP_HYDRIC_STATUS_CONFIG.boa_umidade.color).toBe(MAP_HYDRIC_COLORS.blue);
    expect(MAP_HYDRIC_STATUS_CONFIG.atencao.color).toBe(MAP_HYDRIC_COLORS.yellow);
    expect(MAP_HYDRIC_STATUS_CONFIG.deficit_hidrico.color).toBe(MAP_HYDRIC_COLORS.red);
  });
});
