import { describe, expect, it } from "vitest";
import { auditRasGraph } from "./ras-chart-audit";
import { buildRasPoint } from "./ras-panel-model";
import { rasDisplaySeries } from "./ras-display-modes";
import type { DailyBalanceRow } from "./water-balance.service";

const base: DailyBalanceRow = {
  date:"2026-10-27", phase:"Vegetativo", rootDepth:.6,
  et0:5, kc:1, etc:5, etcPotential:5, ks:1,
  precipitation:0, effectivePrecipitation:0, irrigationApplied:0, effectiveIrrigation:0,
  fieldCapacity:.2, wiltingPoint:.1,
  cad:60, afd:30, storedWater:55, depletionFactor:.5,
  deficit:5, surplus:0, netDepth:5, grossDepth:5.55, volumeNeeded:100,
  irrigationTime:1, waterStatus:"ideal"
};
const pts = [buildRasPoint(base)!];

describe("auditoria dos dados do gráfico", () => {
  it("confere valores reais, eventos e as três escalas do mesmo balanço", () => {
    for (const unit of ["cc","mm","weight"] as const) {
      const series = rasDisplaySeries(pts, unit, [], 1.5);
      expect(auditRasGraph([base],pts,series,unit)).toMatchObject({passed:true,checkedDays:1,issues:[]});
    }
  });
  it("aponta incoerências em ARM, ETc e data sem escondê-las", () => {
    const broken = {...base, storedWater:71, etcPotential:3};
    const report = auditRasGraph([broken],pts,rasDisplaySeries(pts,"mm"),"mm");
    expect(report.passed).toBe(false);
    expect(report.issues.map(x=>x.field)).toContain("ARM");
    expect(report.issues.map(x=>x.field)).toContain("ETc potencial");
    expect(report.issues.map(x=>x.field)).toContain("Reservatório");
  });
  it("informa falta de densidade no gráfico gravimétrico", () => {
    const report = auditRasGraph([base],pts,null,"weight");
    expect(report.issues.some(x=>x.field==="Densidade")).toBe(true);
  });
  it("detecta ruptura do balanço entre datas sem atribuir valores fictícios", () => {
    const later = {...base,date:"2026-10-28",storedWater:54,precipitation:0,irrigationApplied:0};
    const series=[...pts,buildRasPoint(later)!];
    const report=auditRasGraph([base,later],series,rasDisplaySeries(series,"cc"),"cc");
    expect(report.issues.some(x=>x.field==="Balanço diário")).toBe(true);
  });
});
