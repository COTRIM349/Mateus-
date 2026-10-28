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

  it("mostra chuva efetiva, chuva registrada, irrigação bruta/efetiva e ETo diária nas datas corretas", () => {
    const row = {
      ...piv06, date: "2026-10-26", et0: 6.25,
      precipitation: 18, effectivePrecipitation: 13.7,
      irrigationApplied: 22, effectiveIrrigation: 17.6,
    };
    const point = buildRasPoint(row);
    expect(point).not.toBeNull();
    expect(point!.date).toBe("2026-10-26");
    expect(point!.rainRecordedMm).toBe(18);
    expect(point!.rainEffectiveMm).toBe(13.7);
    expect(point!.irrigationAppliedMm).toBe(22);
    expect(point!.irrigationEffectiveMm).toBe(17.6);
    expect(point!.et0).toBe(6.25);
    expect(point!.f).toBeCloseTo(.51, 8);
  });

  it("não cria chuva ou irrigação em dias sem lançamento, mantendo a ETo diária", () => {
    const point = buildRasPoint({ ...piv06, et0: 4.81 });
    expect(point!.rainRecordedMm).toBe(0);
    expect(point!.rainEffectiveMm).toBe(0);
    expect(point!.irrigationAppliedMm).toBe(0);
    expect(point!.irrigationEffectiveMm).toBe(0);
    expect(point!.et0).toBe(4.81);
  });

  it("respeita diferenças entre chuva manual bruta e efetiva, irrigação realizada e F semanal", () => {
    const rows = [
      { ...piv06, date: "2026-10-26", et0: 4, precipitation: 13, effectivePrecipitation: 10,
        irrigationApplied: 0, effectiveIrrigation: 0 },
      { ...piv06, date: "2026-10-27", et0: 7, precipitation: 0, effectivePrecipitation: 0,
        irrigationApplied: 25, effectiveIrrigation: 20 },
    ];
    const points = rows.map(buildRasPoint);
    expect(points.map(p => p?.f)).toEqual([.51,.51]);
    expect(points[0]?.rainEffectiveMm).toBe(10);
    expect(points[0]?.irrigationAppliedMm).toBe(0);
    expect(points[1]?.rainEffectiveMm).toBe(0);
    expect(points[1]?.irrigationAppliedMm).toBe(25);
    expect(points.map(p => p?.et0)).toEqual([4,7]);
  });
});
