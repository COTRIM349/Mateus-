import { describe, expect, it } from "vitest";
import {
  calculateReferenceEtoHargreavesSamani,
  extraterrestrialRadiationDaily,
} from "./referenceEtoHargreavesSamani";

describe("Hargreaves-Samani 1985", () => {
  it("calcula Ra e ETo diaria para a coordenada da fazenda", () => {
    const radiation = extraterrestrialRadiationDaily("2026-08-08", -14.775986);
    const result = calculateReferenceEtoHargreavesSamani({
      date: "2026-08-08",
      latitude: -14.775986,
      temperatureMinC: 19,
      temperatureMaxC: 33.7,
    });

    expect(radiation).toBeCloseTo(30.1197, 3);
    expect(result.etoMmDay).toBeCloseTo(4.7844, 3);
    expect(result.qualityStatus).toBe("estimated");
    expect(result.formulaVersion).toBe("hs-1985-v1");
  });

  it("preserva ausencia de temperatura sem inventar valor", () => {
    const result = calculateReferenceEtoHargreavesSamani({
      date: "2026-08-08",
      latitude: -14.775986,
      temperatureMinC: null,
      temperatureMaxC: 33,
    });

    expect(result.etoMmDay).toBeNull();
    expect(result.qualityStatus).toBe("missing");
    expect(result.missingFields).toContain("temperatureMinC");
  });

  it("rejeita maxima menor que minima", () => {
    const result = calculateReferenceEtoHargreavesSamani({
      date: "2026-08-08",
      latitude: -14.775986,
      temperatureMinC: 30,
      temperatureMaxC: 20,
    });

    expect(result.etoMmDay).toBeNull();
    expect(result.qualityStatus).toBe("invalid");
  });
});
