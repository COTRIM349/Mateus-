import { describe, expect, it } from "vitest";
import { calculateReferenceEtoFao56Subdaily } from "./referenceEtoFao56Subdaily";

describe("calculateReferenceEtoFao56Subdaily", () => {
  it("reproduz aproximadamente o Exemplo 19 FAO-56 para 14-15h", () => {
    // FAO-56 Example 19, N'Diaye/Senegal, 1 Oct:
    // T=38 C, RH=52%, u2=3.3 m/s, Rs=2.450 MJ/m2/h, z=8m.
    const result = calculateReferenceEtoFao56Subdaily({
      intervalStart: "2026-10-01T14:00:00.000Z",
      intervalEnd: "2026-10-01T15:00:00.000Z",
      latitude: 16 + 13 / 60,
      longitude: -(16 + 15 / 60),
      elevationM: 8,
      timezone: "Africa/Dakar",
      temperatureC: 38,
      relativeHumidityPct: 52,
      dewPointC: null,
      surfacePressureKpa: null,
      windSpeed2mMs: 3.3,
      solarRadiationWm2: (2.45 * 1_000_000) / 3600,
    });

    expect(result.isDaylight).toBe(true);
    expect(result.intermediate.extraterrestrialRadiationMjM2Interval).toBeCloseTo(3.54, 1);
    expect(result.intermediate.cloudinessRatio).toBeCloseTo(0.92, 1);
    expect(result.etoRateMmH).not.toBeNull();
    expect(result.etoRateMmH!).toBeCloseTo(0.63, 1);
  });

  it("integra a taxa horaria pela duracao real de 30 min", () => {
    const result = calculateReferenceEtoFao56Subdaily({
      intervalStart: "2026-10-01T14:00:00.000Z",
      intervalEnd: "2026-10-01T14:30:00.000Z",
      latitude: 16 + 13 / 60,
      longitude: -(16 + 15 / 60),
      elevationM: 8,
      timezone: "Africa/Dakar",
      temperatureC: 38,
      relativeHumidityPct: 52,
      dewPointC: null,
      surfacePressureKpa: null,
      windSpeed2mMs: 3.3,
      solarRadiationWm2: (2.45 * 1_000_000) / 3600,
    });

    expect(result.etoRateMmH).not.toBeNull();
    expect(result.etoMmInterval).toBeCloseTo(result.etoRateMmH! * 0.5, 10);
  });

  it("nao calcula noite sem razao de nebulosidade herdada", () => {
    const result = calculateReferenceEtoFao56Subdaily({
      intervalStart: "2026-10-01T02:00:00.000Z",
      intervalEnd: "2026-10-01T02:30:00.000Z",
      latitude: 16 + 13 / 60,
      longitude: -(16 + 15 / 60),
      elevationM: 8,
      timezone: "Africa/Dakar",
      temperatureC: 28,
      relativeHumidityPct: 90,
      dewPointC: null,
      surfacePressureKpa: null,
      windSpeed2mMs: 1.9,
      solarRadiationWm2: 0,
    });

    expect(result.isDaylight).toBe(false);
    expect(result.etoMmInterval).toBeNull();
    expect(result.missingFields).toContain("inheritedCloudinessRatio");
  });

  it("calcula noite quando recebe Rs/Rso diurno anterior e usa G=0.5Rn", () => {
    const result = calculateReferenceEtoFao56Subdaily({
      intervalStart: "2026-10-01T02:00:00.000Z",
      intervalEnd: "2026-10-01T02:30:00.000Z",
      latitude: 16 + 13 / 60,
      longitude: -(16 + 15 / 60),
      elevationM: 8,
      timezone: "Africa/Dakar",
      temperatureC: 28,
      relativeHumidityPct: 90,
      dewPointC: null,
      surfacePressureKpa: null,
      windSpeed2mMs: 1.9,
      solarRadiationWm2: 0,
      inheritedCloudinessRatio: 0.8,
    });

    expect(result.isDaylight).toBe(false);
    expect(result.intermediate.cloudinessRatio).toBe(0.8);
    expect(result.cloudinessInherited).toBe(true);
    expect(result.intermediate.netRadiationMjM2H).not.toBeNull();
    expect(result.intermediate.soilHeatFluxMjM2H).toBeCloseTo(
      result.intermediate.netRadiationMjM2H! * 0.5,
      10,
    );
    expect(result.etoMmInterval).not.toBeNull();
  });

  it("preserva null quando falta radiacao", () => {
    const result = calculateReferenceEtoFao56Subdaily({
      intervalStart: "2026-08-07T15:00:00.000Z",
      intervalEnd: "2026-08-07T15:30:00.000Z",
      latitude: -12.5,
      longitude: -45.5,
      elevationM: 720,
      timezone: "America/Bahia",
      temperatureC: 29,
      relativeHumidityPct: 50,
      dewPointC: 17,
      surfacePressureKpa: null,
      windSpeed2mMs: 2,
      solarRadiationWm2: null,
    });

    expect(result.etoMmInterval).toBeNull();
    expect(result.qualityStatus).toBe("missing");
    expect(result.missingFields).toContain("solarRadiationWm2");
  });
});
