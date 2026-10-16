import { describe, expect, it } from "vitest";
import { isMissingTableError } from "./errors";

describe("isMissingTableError", () => {
  it("reconhece o código PGRST205 (tabela ausente no schema cache)", () => {
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table 'public.manual_eto_entries' in the schema cache" })).toBe(true);
  });

  it("reconhece pela mensagem quando não há código", () => {
    expect(isMissingTableError({ message: "Could not find the table 'public.x'" })).toBe(true);
  });

  it("não confunde com outros erros", () => {
    expect(isMissingTableError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError("erro")).toBe(false);
    expect(isMissingTableError(new Error("permission denied"))).toBe(false);
  });
});
