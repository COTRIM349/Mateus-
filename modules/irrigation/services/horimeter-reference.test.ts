import { describe, expect, it } from "vitest";
import { resolveHorimeterReference } from "./horimeter-reference";

describe("resolveHorimeterReference", () => {
  it("usa a base histórica quando ainda não há lançamento da plataforma", () => {
    expect(resolveHorimeterReference({
      baseValue: 966,
      baseDate: "2026-10-16",
      eventValue: null,
      eventDate: null,
    })).toEqual({
      value: 966,
      date: "2026-10-16",
      source: "historical_base",
    });
  });

  it("usa o último lançamento quando é posterior e não regride o horímetro", () => {
    expect(resolveHorimeterReference({
      baseValue: 966,
      baseDate: "2026-10-16",
      eventValue: 982.4,
      eventDate: "2026-10-27",
    })).toEqual({
      value: 982.4,
      date: "2026-10-27",
      source: "event",
    });
  });

  it("ignora lançamento de teste com horímetro menor que a base histórica", () => {
    expect(resolveHorimeterReference({
      baseValue: 966,
      baseDate: "2026-10-16",
      eventValue: 122,
      eventDate: "2026-10-27",
    })).toEqual({
      value: 966,
      date: "2026-10-16",
      source: "historical_base",
    });
  });

  it("ignora evento anterior à data-base", () => {
    expect(resolveHorimeterReference({
      baseValue: 922,
      baseDate: "2026-10-20",
      eventValue: 1000,
      eventDate: "2026-10-18",
    })).toEqual({
      value: 922,
      date: "2026-10-20",
      source: "historical_base",
    });
  });
});
