import { describe, expect, it } from "vitest";
import {
  inheritedCloudinessCutoff,
  MAX_INHERITED_CLOUDINESS_AGE_HOURS,
} from "./fao56-30m-shadow.service";

describe("ETo 30 min cloudiness inheritance", () => {
  it("limita a heranca da nebulosidade ao periodo recente", () => {
    expect(MAX_INHERITED_CLOUDINESS_AGE_HOURS).toBe(36);
    expect(inheritedCloudinessCutoff("2026-08-08T22:30:00.000Z")).toBe(
      "2026-08-07T10:30:00.000Z",
    );
  });

  it("rejeita timestamp de referencia invalido", () => {
    expect(() => inheritedCloudinessCutoff("invalido")).toThrow(
      "Intervalo de referencia invalido",
    );
  });
});
