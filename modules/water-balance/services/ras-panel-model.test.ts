import { describe, expect, it } from "vitest";
import { buildRasPoint, rasWaterReplenishment, currentWeekStats } from "./ras-panel-model";

const piv06 = {
  date: "2026-10-27",
  cad: 84.36,
  afd: 43.0236,
  storedWater: 42.18,
  rootDepth: 0.6,
  fieldCapacity: 0.24482,
  wiltingPoint: 0.10422,
  et0: 5.8,
  etc: 5.1,
  kc: 1.15,
  factorWeekStart: "2026-10-26",
};

describe("RAS: %CC, %CTA, PMP e F semanal", () => {
  it("não confunde PMP com 0% CC; 0% CTA ainda é 42,6% CC", () => {
    const p = buildRasPoint({ ...piv06, storedWater: 0 });
    expect(p).not.toBeNull();
    expect(p!.pmpPercentCc).toBeCloseTo(42.57, 1);
    expect(p!.ccPercent).toBeCloseTo(p!.pmpPercentCc, 8);
    expect(p!.pmpAbsoluteMm).toBeGreaterThan(0);
  });

  it("na capacidade de campo ARM=CTA e a umidade é 100% CC", () => {
    const p = buildRasPoint({ ...piv06, storedWater: piv06.cad });
    expect(p!.ccPercent).toBe(100);
    expect(p!.armMm).toBe(84.36);
  });

  it("o limite F = 0,51 fica em 70,7% CC, com AFD medida em mm", () => {
    const p = buildRasPoint(piv06);
    expect(p!.f).toBeCloseTo(0.51, 8);
    expect(p!.afdMm).toBeCloseTo(43.02, 1);
    expect(p!.limitPercentCc).toBeCloseTo(70.72, 1);
    expect(p!.ccPercent).toBeGreaterThan(p!.pmpPercentCc);
  });

  it("a água a repor até 100% CC é CTA - ARM, e a bruta considera Ea", () => {
    const r = rasWaterReplenishment(84.36, 20, 0.8, 150, 500);
    expect(r.netMm).toBeCloseTo(64.36, 8);
    expect(r.grossMm).toBeCloseTo(80.45, 8);
    expect(r.volumeM3).toBeCloseTo(120675, 5);
    expect(r.hours).toBeCloseTo(241.35, 4);
  });

  it("não inventa eficiência, vazão ou tempo quando faltam dados", () => {
    const r = rasWaterReplenishment(84.36, 40, null, 150, null);
    expect(r.netMm).toBeCloseTo(44.36, 6);
    expect(r.grossMm).toBeNull();
    expect(r.hours).toBeNull();
  });

  it("ETc e ETo médias consideram apenas os dias medidos da semana de F", () => {
    const rows = [
      { ...piv06, date: "2026-10-25", et0: 9, etc: 7 },
      { ...piv06, date: "2026-10-26", et0: 5, etc: 4 },
      { ...piv06, date: "2026-10-27", et0: 7, etc: 6 },
    ];
    const stats = currentWeekStats(rows);
    expect(stats?.days).toBe(2);
    expect(stats?.etoMean).toBe(6);
    expect(stats?.etcMean).toBe(5);
    expect(stats?.currentKc).toBe(1.15);
    expect(stats?.start).toBe("2026-10-26");
  });

  it("não plota perfil CC/PMP incompleto e não cria valores fictícios", () => {
    expect(buildRasPoint({ ...piv06, fieldCapacity: null })).toBeNull();
    expect(buildRasPoint({ ...piv06, wiltingPoint: 0.5 })).toBeNull();
  });
});
