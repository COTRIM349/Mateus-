import { describe, expect, it } from "vitest";
import {
  classifyWaterStatus,
  calculateHydricZoneBounds,
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

  it("marca incompleto sem CAD ou ARM válidos e não depende da AFD para a cor do dashboard", () => {
    expect(classifyWaterStatus({ armMm: 40, cadMm: 0, afdMm: 20 })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: null, cadMm: cad, afdMm: afd })).toBe("incompleto");
    expect(classifyWaterStatus({ armMm: 95, cadMm: cad, afdMm: 0 })).toBe("capacidade_campo");
  });

  it("azul a partir de 95% da CC", () => {
    expect(classifyWaterStatus({ armMm: 95, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("capacidade_campo");
    expect(classifyWaterStatus({ armMm: 100, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("capacidade_campo");
    expect(classifyWaterStatus({ armMm: 94.99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .not.toBe("capacidade_campo");
  });

  it("verde entre 90% e menos de 95% da CC", () => {
    expect(classifyWaterStatus({ armMm: 90, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("boa_umidade");
    expect(classifyWaterStatus({ armMm: 94.99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("boa_umidade");
  });

  it("amarelo entre 85% e menos de 90% da CC", () => {
    expect(classifyWaterStatus({ armMm: 85, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("atencao");
    expect(classifyWaterStatus({ armMm: 89.99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("atencao");
  });

  it("vermelho entre 70% e menos de 85% da CC", () => {
    expect(classifyWaterStatus({ armMm: 70, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("deficit_hidrico");
    expect(classifyWaterStatus({ armMm: 84.99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("deficit_hidrico");
  });

  it("preto abaixo de 70% da CC", () => {
    expect(classifyWaterStatus({ armMm: 69.99, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("critico");
    expect(classifyWaterStatus({ armMm: 0, cadMm: cad, afdMm: afd, safetyMoistureMm: safety }))
      .toBe("critico");
  });

  it("respeita limiares parametrizados", () => {
    expect(
      classifyWaterStatus({
        armMm: 80,
        cadMm: cad,
        afdMm: afd,
        safetyMoistureMm: safety,
        thresholds: {
          ...MAP_HYDRIC_THRESHOLDS,
          blueCcRatio: 0.8,
          comfortableCcRatio: 0.7,
          attentionCcRatio: 0.6,
          criticalCcRatio: 0.5,
        },
      }),
    ).toBe("capacidade_campo");
  });

  it("mantém a ordem e a paleta das cinco faixas", () => {
    expect(MAP_HYDRIC_NO_IRRIGATE).toEqual(["capacidade_campo", "boa_umidade", "atencao"]);
    expect(MAP_HYDRIC_NEED_IRRIGATE).toEqual(["deficit_hidrico", "critico"]);
    expect(MAP_HYDRIC_LEGEND_ORDER).toHaveLength(5);
    expect(MAP_HYDRIC_STATUS_CONFIG.capacidade_campo.color).toBe(MAP_HYDRIC_COLORS.blue);
    expect(MAP_HYDRIC_STATUS_CONFIG.boa_umidade.color).toBe(MAP_HYDRIC_COLORS.green);
    expect(MAP_HYDRIC_STATUS_CONFIG.atencao.color).toBe(MAP_HYDRIC_COLORS.yellow);
    expect(MAP_HYDRIC_STATUS_CONFIG.deficit_hidrico.color).toBe(MAP_HYDRIC_COLORS.red);
    expect(MAP_HYDRIC_STATUS_CONFIG.critico.color).toBe(MAP_HYDRIC_COLORS.black);
    expect(MAP_HYDRIC_STATUS_CONFIG.critico.label).toBe("Crítico");
  });
});

describe("faixas do reservatório variam com o fator F da cultura e a ETc diária", () => {
  it("mantém as faixas AFD/CRA do gráfico independentes das cores do dashboard", () => {
    // Pivô 06: CTA=84,4 mm; F=0,571 => CRA=48,1924 mm.
    const cta = 84.4;
    const cra = cta * 0.571;
    const bounds = calculateHydricZoneBounds({ ctaMm: cta, craMm: cra });
    expect(bounds).not.toBeNull();
    expect(bounds!.factorF).toBeCloseTo(0.571, 4);
    expect(bounds!.attentionAbs).toBeCloseTo(50.66532, 3);
    expect(bounds!.safetyAbs).toBeCloseTo(36.2076, 3);
    expect(bounds!.attentionAbs).toBeLessThan(bounds!.ccAbs);
    expect(bounds!.safetyAbs).toBeLessThan(bounds!.attentionAbs);
  });

  it("move ambas as faixas quando F ou CTA varia de um dia para outro", () => {
    const ontem = calculateHydricZoneBounds({ ctaMm: 84.4, craMm: 84.4 * 0.40, pmpMm: 10 });
    const hoje = calculateHydricZoneBounds({ ctaMm: 84.4, craMm: 84.4 * 0.571, pmpMm: 10 });
    const proximaFase = calculateHydricZoneBounds({ ctaMm: 100, craMm: 100 * 0.571, pmpMm: 10 });
    expect(ontem?.attentionAbs).toBeGreaterThan(hoje!.attentionAbs);
    expect(ontem?.safetyAbs).toBeGreaterThan(hoje!.safetyAbs);
    expect(hoje?.attentionAbs).not.toBe(proximaFase?.attentionAbs);
    expect(hoje?.safetyAbs).not.toBe(proximaFase?.safetyAbs);
    expect(hoje?.ccAbs).toBe(94.4);
  });

  it("não cria faixas artificiais para CTA ou CRA ausentes/inválidas", () => {
    expect(calculateHydricZoneBounds({ ctaMm: 84.4, craMm: 0 })).toBeNull();
    expect(calculateHydricZoneBounds({ ctaMm: 0, craMm: 0 })).toBeNull();
    expect(calculateHydricZoneBounds({ ctaMm: 84.4, craMm: 90 })).toBeNull();
    expect(calculateHydricZoneBounds({ ctaMm: NaN, craMm: 30 })).toBeNull();
  });
});
