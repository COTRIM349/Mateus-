import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rasEventAxisCeiling, rasEventVerticalPosition } from "./ras-event-axis";

const sample = [
  { rainEffectiveMm: 0, irrigationAppliedMm: 6.22, et0: 4.8 },
  { rainEffectiveMm: 2.5, irrigationAppliedMm: 0, et0: 5.1 },
];

describe("gráfico %CC: eixo da irrigação independente à direita", () => {
  it("usa teto mm legível acima da maior lâmina, preservando o zero", () => {
    const max = rasEventAxisCeiling(sample, {chuva:true, irrigacao:true, eto:true});
    expect(max).toBe(8);
    expect(rasEventVerticalPosition(0, max, 30, 460)).toBe(490);
    expect(rasEventVerticalPosition(max, max, 30, 460)).toBe(30);
    expect(rasEventVerticalPosition(6.22, max, 30, 460)).toBeCloseTo(132.35, 2);
  });

  it("oculta séries sem inventar dados; chuva e ETo usam a mesma escala de eventos", () => {
    expect(rasEventAxisCeiling(sample, {chuva:false, irrigacao:false, eto:true})).toBe(6);
    expect(rasEventAxisCeiling(sample, {chuva:false, irrigacao:false, eto:false})).toBe(2);
  });

  it("os três gráficos têm eixo de eventos em mm desde zero e fontes compartilhadas", () => {
    const source = readFileSync(join(process.cwd(), "components/water-balance/SoilReservoirReferencePanel.tsx"), "utf8");
    expect(source).toContain('id: "mm", title: "Água disponível (mm)"');
    expect(source).toContain('id: "weight", title: "Umidade do solo (% em peso)"');
    expect(source).toContain('id: "cc", title: "Umidade do solo (% da CC)"');
    expect(source).toContain("cards.map(card =>");
    expect(source).toContain("const integratedCc = true;");
    expect(source).toContain("const eventsTop = integratedCc ? t : t + height + 46");
    expect(source).toContain("const eventsHeight = integratedCc ? height : 85");
    expect(source).toContain('rasEventVerticalPosition(mm, eventMax, eventsTop, eventsHeight)');
    expect(source).toContain("height={Math.max(0,eventsBottom-eventY(p.irrigationAppliedMm))}");
    expect(source).toContain("height={Math.max(0,eventsBottom-eventY(p.rainEffectiveMm))}");
    expect(source).toContain('rasDisplayAxisCeiling(displayed, unit)');
  });
});
