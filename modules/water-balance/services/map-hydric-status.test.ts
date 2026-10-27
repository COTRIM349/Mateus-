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

describe("faixas do reservatório variam com o fator F da cultura e a ETc diária", () => {
  it("usa 70% da CRA como início da atenção e 100% como limite para irrigar", () => {
    // Pivô 06: CTA=84,4 mm; F=0,571 => CRA=48,1924 mm.
    const cta = 84.4;
    const cra = cta * 0.571;
    const bounds = calculateHydricZoneBounds({ ctaMm: cta, craMm: cra });
    expect(bounds).not.toBeNull();
    expect(bounds!.factorF).toBeCloseTo(0.571, 4);
    expect(bounds!.attentionAbs).toBeCloseTo(50.66532, 3);
    expect(bounds!.safetyAbs).toBeCloseTo(36.2076, 3);
    expect(classifyWaterStatus({ armMm: bounds!.attentionAbs, cadMm: cta, afdMm: cra }))
      .toBe("atencao");
    expect(classifyWaterStatus({ armMm: bounds!.attentionAbs + 0.01, cadMm: cta, afdMm: cra }))
      .toBe("boa_umidade");
    expect(classifyWaterStatus({ armMm: bounds!.safetyAbs, cadMm: cta, afdMm: cra }))
      .toBe("deficit_hidrico");
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
