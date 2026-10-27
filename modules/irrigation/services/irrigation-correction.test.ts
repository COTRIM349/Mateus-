import { describe, expect, it } from "vitest";
import {
  irrigationDuplicateCounts,
  irrigationDuplicateKey,
  isPossibleDuplicate,
} from "./irrigation-correction";

describe("correção de irrigação duplicada", () => {
  const base = {
    id: "1",
    pivot_id: "p1",
    started_at: "2026-10-27T06:00:00",
    depth_mm: 7.36,
    percentimeter_pct: 70,
    horimeter_initial: 100,
    horimeter_final: 118,
  };

  it("considera iguais eventos com os mesmos dados operacionais no mesmo dia", () => {
    const a = base;
    const b = { ...base, id: "2", started_at: "2026-10-27T18:00:00" };
    expect(irrigationDuplicateKey(a)).toBe(irrigationDuplicateKey(b));

    const counts = irrigationDuplicateCounts([a, b]);
    expect(isPossibleDuplicate(a, counts)).toBe(true);
    expect(isPossibleDuplicate(b, counts)).toBe(true);
  });

  it("não marca como duplicado quando o horímetro é diferente", () => {
    const a = base;
    const b = { ...base, id: "2", horimeter_final: 119 };
    const counts = irrigationDuplicateCounts([a, b]);
    expect(isPossibleDuplicate(a, counts)).toBe(false);
    expect(isPossibleDuplicate(b, counts)).toBe(false);
  });

  it("também funciona para eventos legados sem percentímetro/horímetro", () => {
    const a = { ...base, id: "1", percentimeter_pct: null, horimeter_initial: null, horimeter_final: null };
    const b = { ...a, id: "2" };
    const counts = irrigationDuplicateCounts([a, b]);
    expect(isPossibleDuplicate(a, counts)).toBe(true);
  });
});
