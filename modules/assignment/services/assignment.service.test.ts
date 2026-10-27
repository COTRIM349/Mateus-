import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMERGENCE_DAYS_AFTER_PLANTING,
  addDaysToYmd,
  computeDae,
  predictEmergenceDate,
  resolveDaeReferenceDate,
} from "./assignment.service";

describe("emergência automática", () => {
  it("considera 6 dias após o plantio por padrão", () => {
    expect(DEFAULT_EMERGENCE_DAYS_AFTER_PLANTING).toBe(6);
    expect(predictEmergenceDate("2026-10-01")).toBe("2026-10-07");
  });

  it("soma dias corretamente ao atravessar mês e ano", () => {
    expect(addDaysToYmd("2026-10-29", 6)).toBe("2026-11-04");
    expect(addDaysToYmd("2026-12-29", 6)).toBe("2027-01-04");
  });

  it("prioriza a emergência observada quando informada", () => {
    expect(
      resolveDaeReferenceDate({
        planting_date: "2026-10-01",
        emergence_date: "2026-10-09",
      }),
    ).toBe("2026-10-09");
  });

  it("usa plantio + 6 dias quando a emergência não foi informada", () => {
    expect(
      resolveDaeReferenceDate({
        planting_date: "2026-10-01",
        emergence_date: null,
      }),
    ).toBe("2026-10-07");
  });

  it("inicia DAE em zero na emergência prevista", () => {
    const reference = resolveDaeReferenceDate({
      planting_date: "2026-10-01",
      emergence_date: null,
    });

    expect(computeDae(reference, new Date("2026-10-06T15:00:00Z"))).toBe(0);
    expect(computeDae(reference, new Date("2026-10-07T15:00:00Z"))).toBe(0);
    expect(computeDae(reference, new Date("2026-10-12T15:00:00Z"))).toBe(5);
  });
});
