import { describe, expect, it } from "vitest";
import { calculateWeeklyAvailabilityFactors, mondayOfIsoWeek } from "./weekly-availability-factor";

describe("média semanal do fator F no manejo", () => {
  it("usa segunda a domingo mesmo na virada de ano", () => {
    expect(mondayOfIsoWeek("2026-12-28")).toBe("2026-12-28");
    expect(mondayOfIsoWeek("2027-01-03")).toBe("2026-12-28");
    expect(mondayOfIsoWeek("2027-01-04")).toBe("2027-01-04");
  });

  it("usa a média dos ajustes diários observados e mantém F único na semana", () => {
    const etos = [3, 4, 5, 6, 7, 8, 9];
    const o = etos.map((et0, i) => ({
      date: `2026-08-${String(3 + i).padStart(2, "0")}`, baseP: 0.5, etcPotentialMm: et0,
    }));
    const result = calculateWeeklyAvailabilityFactors(o);
    // p_diário: 0,58;0,54;0,50;0,46;0,42;0,38;0,34 => F médio=0,46
    expect(o.map((day) => result[day.date].factor)).toEqual(Array(7).fill(0.46));
    expect(result["2026-08-06"].meanEtcPotentialMm).toBe(6);
    expect(result["2026-08-06"].sampleDays).toBe(7);
    expect(result["2026-08-06"].weekStart).toBe("2026-08-03");
  });

  it("reinicia a média na segunda seguinte", () => {
    const result = calculateWeeklyAvailabilityFactors([
      { date: "2026-08-09", baseP: 0.5, etcPotentialMm: 8 },
      { date: "2026-08-10", baseP: 0.5, etcPotentialMm: 2 },
    ]);
    expect(result["2026-08-09"].factor).toBe(0.38);
    expect(result["2026-08-10"].factor).toBe(0.62);
  });

  it("para semana em andamento usa somente dias informados, sem inventar dias futuros", () => {
    const result = calculateWeeklyAvailabilityFactors([
      { date: "2026-08-03", baseP: 0.5, etcPotentialMm: 3 },
      { date: "2026-08-04", baseP: 0.5, etcPotentialMm: 7 },
    ]);
    expect(result["2026-08-03"].factor).toBe(0.5);
    expect(result["2026-08-04"].factor).toBe(0.5);
    expect(result["2026-08-03"].sampleDays).toBe(2);
    expect(result["2026-08-05"]).toBeUndefined();
  });

  it("faz média dos fatores ajustados respeitando mudanças de p_base e limites FAO", () => {
    const result = calculateWeeklyAvailabilityFactors([
      { date: "2026-08-03", baseP: 0.5, etcPotentialMm: 5 },
      { date: "2026-08-04", baseP: 0.6, etcPotentialMm: 5 },
      { date: "2026-08-05", baseP: 0.9, etcPotentialMm: 0 },
    ]);
    // 0,50; 0,60; 0,80 (cap) => 0,633.
    // p_base > 0,8 é aceito como base válido, apenas F final é limitado.
    expect(result["2026-08-03"].factor).toBe(0.633);
  });

  it("rejeita datas duplicadas ou ETo/p inválidos", () => {
    expect(() => calculateWeeklyAvailabilityFactors([
      { date: "2026-08-03", baseP: 0.5, etcPotentialMm: 5 },
      { date: "2026-08-03", baseP: 0.5, etcPotentialMm: 6 },
    ])).toThrow();
    expect(() => calculateWeeklyAvailabilityFactors([
      { date: "2026-08-03", baseP: 0.5, etcPotentialMm: -1 },
    ])).toThrow();
  });
});
