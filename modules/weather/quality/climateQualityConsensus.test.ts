import { describe, expect, it } from "vitest";
import { buildClimateConsensus, type ConsensusCandidate } from "./climateQualityConsensus";

function c(overrides: Partial<ConsensusCandidate>): ConsensusCandidate {
  return {
    id: crypto.randomUUID(),
    provider: "open_meteo",
    modelName: "model",
    temperatureC: null,
    relativeHumidityPct: null,
    dewPointC: null,
    surfacePressureKpa: null,
    windSpeed10mMs: null,
    windSpeed2mMs: null,
    windDirectionDeg: null,
    solarRadiationWm2: null,
    precipitationMm: null,
    vapourPressureDeficitKpa: null,
    ...overrides,
  };
}

describe("buildClimateConsensus", () => {
  it("rejeita outlier claro de temperatura e usa mediana robusta", () => {
    const result = buildClimateConsensus([
      c({ provider: "open_meteo", temperatureC: 29.2 }),
      c({ provider: "meteoblue", temperatureC: 29.5 }),
      c({ provider: "weatherapi", temperatureC: 29.0 }),
      c({ provider: "met_norway", temperatureC: 36.8 }),
    ]);
    expect(result.fields.temperatureC.value).toBeCloseTo(29.2, 8);
    expect(result.fields.temperatureC.outliers).toContain("met_norway");
    expect(result.fields.temperatureC.providers).toHaveLength(3);
  });

  it("nao calcula media quando chuva e seco entram em conflito", () => {
    const result = buildClimateConsensus([
      c({ provider: "open_meteo", precipitationMm: 0 }),
      c({ provider: "meteoblue", precipitationMm: 0 }),
      c({ provider: "weatherapi", precipitationMm: 12 }),
      c({ provider: "met_norway", precipitationMm: 18 }),
    ]);
    expect(result.fields.precipitationMm.value).toBeNull();
    expect(result.fields.precipitationMm.confidence).toBe("disputed");
    expect(result.disputedFields).toContain("precipitationMm");
  });

  it("mantem fonte unica valida com baixa confianca, sem inventar demais", () => {
    const result = buildClimateConsensus([
      c({ provider: "open_meteo", solarRadiationWm2: 650 }),
      c({ provider: "meteoblue", solarRadiationWm2: null }),
      c({ provider: "weatherapi", solarRadiationWm2: null }),
      c({ provider: "met_norway", solarRadiationWm2: null }),
    ]);
    expect(result.fields.solarRadiationWm2.value).toBe(650);
    expect(result.fields.solarRadiationWm2.confidence).toBe("low");
  });

  it("marca valor fisicamente invalido e nao usa no consenso", () => {
    const result = buildClimateConsensus([
      c({ provider: "open_meteo", relativeHumidityPct: 54 }),
      c({ provider: "weatherapi", relativeHumidityPct: 150 }),
    ]);
    expect(result.fields.relativeHumidityPct.value).toBe(54);
    const invalid = result.fields.relativeHumidityPct.flags.find((f) => f.provider === "weatherapi");
    expect(invalid?.status).toBe("invalid");
  });

  it("nunca assume independencia entre providers", () => {
    const result = buildClimateConsensus([
      c({ provider: "open_meteo", temperatureC: 28 }),
      c({ provider: "met_norway", temperatureC: 28.1 }),
    ]);
    expect(result.independenceAssumed).toBe(false);
    expect(result.warnings.some((w) => w.includes("independencia"))).toBe(true);
  });
});
