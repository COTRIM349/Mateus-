import { describe, expect, it } from "vitest";
import { calculateAnticipatoryDecision } from "./anticipatory-decision";

describe("decisão antecipativa de irrigação", () => {
  it("programa irrigação quando o tempo de aplicação é maior que a janela até a AFD", () => {
    const d = calculateAnticipatoryDecision({
      cadMm: 71.8,
      armMm: 53.8,
      afdMm: 30.9,
      etcPotentialMmDay: 6.8,
      areaHa: 123.7,
      flowRateM3h: 525,
      efficiencyFraction: 0.85,
    });

    expect(d.deficitToCcNetMm).toBe(18);
    expect(d.daysToAfd).toBeCloseTo(1.9, 1);
    expect(d.operationDaysToCc).toBeGreaterThan(d.daysToAfd!);
    expect(d.operationalMarginDays).toBeLessThan(0);
    expect(d.level).toBe("programar");
  });

  it("mantém condição confortável quando há folga operacional suficiente", () => {
    const d = calculateAnticipatoryDecision({
      cadMm: 80,
      armMm: 75,
      afdMm: 32,
      etcPotentialMmDay: 5,
      areaHa: 100,
      flowRateM3h: 800,
      efficiencyFraction: 0.9,
    });

    expect(d.level).toBe("confortavel");
    expect(d.operationalMarginDays).toBeGreaterThan(0);
  });

  it("entra em prioridade ao atingir a AFD e crítico depois de ultrapassá-la", () => {
    expect(calculateAnticipatoryDecision({
      cadMm: 70, armMm: 40, afdMm: 30, etcPotentialMmDay: 5,
      areaHa: 100, flowRateM3h: 500, efficiencyFraction: 0.85,
    }).level).toBe("prioridade");

    expect(calculateAnticipatoryDecision({
      cadMm: 70, armMm: 35, afdMm: 30, etcPotentialMmDay: 5,
      areaHa: 100, flowRateM3h: 500, efficiencyFraction: 0.85,
    }).level).toBe("critico");
  });

  it("não inventa tempo operacional quando faltam vazão ou eficiência", () => {
    const d = calculateAnticipatoryDecision({
      cadMm: 70, armMm: 60, afdMm: 30, etcPotentialMmDay: 5,
      areaHa: 100, flowRateM3h: null, efficiencyFraction: null,
    });
    expect(d.applicationHoursToCc).toBeNull();
    expect(d.operationalMarginDays).toBeNull();
  });
});
