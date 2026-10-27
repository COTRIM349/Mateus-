import { describe, expect, it } from "vitest";
import {
  DEMAND_MONTH_HOURS,
  WEEK_HOURS,
  calculateWeeklyDemandApportionment,
  resolvePivotDemandPowerKw,
  weekStartMonday,
} from "./weekly-demand";

const tariffs = [
  { validFrom: "2026-10-01", validTo: "2026-10-31", demandRate: 17.140238 },
];

describe("weekly-demand", () => {
  it("prioriza potência instalada, igual à Pot(kW) da base operacional", () => {
    expect(resolvePivotDemandPowerKw({
      installedPowerKw: 149.1399744,
      specificConsumptionKwhM3: 0.3185,
      flowRateM3h: 523.8,
      pumpPowerCv: 200,
      motorEfficiency: 0.88,
    })).toBeCloseTo(149.1399744, 6);
  });

  it("identifica semana de segunda a domingo", () => {
    expect(weekStartMonday("2026-10-27")).toBe("2026-10-26");
    expect(weekStartMonday("2026-11-01")).toBe("2026-10-26");
  });

  it("rateia a demanda apenas entre os pivôs que formaram o maior pico semanal", () => {
    const rows = calculateWeeklyDemandApportionment([
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-26", installedPowerKw: 100 },
      { pivotId: "p2", pivotName: "P2", moduleName: "M1", date: "2026-10-26", installedPowerKw: 200 },
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-27", installedPowerKw: 100 },
      { pivotId: "p3", pivotName: "P3", moduleName: "M1", date: "2026-10-27", installedPowerKw: 50 },
    ], tariffs);

    expect(rows).toHaveLength(2);
    expect(rows[0].peakDemandKw).toBe(300);
    expect(rows[0].peakDates).toEqual(["2026-10-26"]);
    expect(new Set(rows.map((r) => r.pivotId))).toEqual(new Set(["p1", "p2"]));

    const weeklyCost = 300 * 17.140238 * (WEEK_HOURS / DEMAND_MONTH_HOURS);
    expect(rows[0].weeklyDemandCost).toBeCloseTo(weeklyCost, 2);
    expect(rows.reduce((s, r) => s + (r.apportionedDemandCost ?? 0), 0))
      .toBeCloseTo(Math.round(weeklyCost * 100) / 100, 2);
    expect(rows.find((r) => r.pivotId === "p2")?.sharePct).toBeCloseTo(66.67, 2);
  });

  it("não duplica potência quando o mesmo pivô tem mais de um evento no mesmo dia", () => {
    const rows = calculateWeeklyDemandApportionment([
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-26", installedPowerKw: 100 },
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-26", installedPowerKw: 100 },
      { pivotId: "p2", pivotName: "P2", moduleName: "M1", date: "2026-10-26", installedPowerKw: 200 },
    ], tariffs);

    expect(rows[0].peakDemandKw).toBe(300);
    expect(rows).toHaveLength(2);
  });

  it("em empate de pico usa participação média dos dias empatados", () => {
    const rows = calculateWeeklyDemandApportionment([
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-26", installedPowerKw: 100 },
      { pivotId: "p2", pivotName: "P2", moduleName: "M1", date: "2026-10-26", installedPowerKw: 200 },
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-27", installedPowerKw: 100 },
      { pivotId: "p3", pivotName: "P3", moduleName: "M1", date: "2026-10-27", installedPowerKw: 200 },
    ], tariffs);

    expect(rows[0].peakDates).toEqual(["2026-10-26", "2026-10-27"]);
    expect(rows.find((r) => r.pivotId === "p1")?.sharePct).toBeCloseTo(33.33, 2);
    expect(rows.find((r) => r.pivotId === "p2")?.sharePct).toBeCloseTo(33.33, 2);
    expect(rows.find((r) => r.pivotId === "p3")?.sharePct).toBeCloseTo(33.33, 2);
  });

  it("não inventa custo de demanda quando não existe tarifa vigente", () => {
    const rows = calculateWeeklyDemandApportionment([
      { pivotId: "p1", pivotName: "P1", moduleName: "M1", date: "2026-10-26", installedPowerKw: 100 },
    ], []);

    expect(rows).toHaveLength(1);
    expect(rows[0].demandRate).toBeNull();
    expect(rows[0].weeklyDemandCost).toBeNull();
    expect(rows[0].apportionedDemandCost).toBeNull();
  });
});
