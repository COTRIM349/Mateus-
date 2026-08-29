import { describe, expect, it } from "vitest";
import { bypassesUserSession } from "./middleware";

describe("bypassesUserSession", () => {
  it("libera cron autenticado e a prévia visual do gráfico de manejo", () => {
    expect(bypassesUserSession("/api/cron/meteoblue-agro")).toBe(true);
    expect(bypassesUserSession("/api/cron/climate-v2")).toBe(true);
    expect(bypassesUserSession("/preview-manejo")).toBe(true);
    expect(bypassesUserSession("/api/cron/meteoblue-agro/outro")).toBe(false);
    expect(bypassesUserSession("/api/cron")).toBe(false);
    expect(bypassesUserSession("/clima")).toBe(false);
    expect(bypassesUserSession("/balanco-hidrico")).toBe(false);
  });
});
