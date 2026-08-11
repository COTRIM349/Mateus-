import { describe, expect, it } from "vitest";
import { bypassesUserSession } from "./middleware";

describe("bypassesUserSession", () => {
  it("libera somente o endpoint autenticado do Supabase Cron", () => {
    expect(bypassesUserSession("/api/cron/meteoblue-agro")).toBe(true);
    expect(bypassesUserSession("/api/cron/meteoblue-agro/outro")).toBe(false);
    expect(bypassesUserSession("/api/cron")).toBe(false);
    expect(bypassesUserSession("/clima")).toBe(false);
  });
});
