import { describe, expect, it } from "vitest";
import { isOperationalMeteoblueDate } from "./meteoblue-ingest";

describe("Meteoblue operational date guard", () => {
  const today = "2026-08-23";

  it("aceita hoje e passado dentro da janela", () => {
    expect(isOperationalMeteoblueDate("2026-08-23", today, 7)).toBe(true);
    expect(isOperationalMeteoblueDate("2026-08-17", today, 7)).toBe(true);
  });

  it("rejeita forecast futuro", () => {
    expect(isOperationalMeteoblueDate("2026-08-24", today, 7)).toBe(false);
    expect(isOperationalMeteoblueDate("2026-08-30", today, 7)).toBe(false);
  });

  it("rejeita passado fora da janela", () => {
    expect(isOperationalMeteoblueDate("2026-08-16", today, 7)).toBe(false);
  });
});
