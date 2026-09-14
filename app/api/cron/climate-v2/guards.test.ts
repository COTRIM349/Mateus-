import { describe, expect, it } from "vitest";
import { summarizeDailySelections, validFarmCoordinate } from "./guards";

describe("guardas do cron Climate V2", () => {
  it("aceita apenas coordenadas geográficas finitas", () => {
    expect(validFarmCoordinate(-14.6491, -45.234)).toBe(true);
    expect(validFarmCoordinate(143856.75, 45142.49)).toBe(false);
    expect(validFarmCoordinate(null, -45.234)).toBe(false);
    expect(validFarmCoordinate(Number.NaN, -45.234)).toBe(false);
  });

  it("expõe aprovações automáticas e os bloqueios auditáveis", () => {
    const summary = summarizeDailySelections([
      { date: "2026-09-12", operational_approved: true, reason: "fonte confiável" },
      { date: "2026-09-13", operational_approved: false, reason: "ETo acima do limite" },
      { date: "2026-09-14", operational_approved: false, reason: "sem leitura" },
    ]);
    expect(summary).toEqual({
      selections: 3,
      approved: 1,
      blocked: 2,
      blockedDates: [
        { date: "2026-09-13", reason: "ETo acima do limite" },
        { date: "2026-09-14", reason: "sem leitura" },
      ],
    });
  });

  it("limita a resposta de exceções sem alterar a contagem", () => {
    const summary = summarizeDailySelections([
      { date: "2026-09-13", operational_approved: false, reason: "a" },
      { date: "2026-09-14", operational_approved: false, reason: "b" },
    ], 1);
    expect(summary.blocked).toBe(2);
    expect(summary.blockedDates).toHaveLength(1);
  });
});
