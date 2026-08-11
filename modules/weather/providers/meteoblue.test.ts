import { afterEach, describe, expect, it } from "vitest";
import {
  buildMeteoblueDailyUrl,
  meteoblueGhiToMjM2Day,
  parseMeteoblueDailyPayload,
  redactKey,
} from "./meteoblue";

const originalKey = process.env.METEOBLUE_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.METEOBLUE_API_KEY;
  else process.env.METEOBLUE_API_KEY = originalKey;
});

describe("meteoblue daily Agro provider", () => {
  it("consulta basic-day, agro-day e solar-day com coordenada, altitude e fuso corretos", () => {
    process.env.METEOBLUE_API_KEY = "secret-test-key";
    const url = buildMeteoblueDailyUrl({
      latitude: -14.776019,
      longitude: -45.566547,
      elevationM: 856,
      timezone: "America/Bahia",
    });

    expect(url).toContain("/packages/basic-day_agro-day_solar-day");
    expect(url).toContain("lat=-14.776019");
    expect(url).toContain("lon=-45.566547");
    expect(url).toContain("asl=856");
    expect(url).toContain("tz=America%2FBahia");
    expect(redactKey(url)).not.toContain("secret-test-key");
  });

  it("preserva probabilidade de chuva e converte GHI diário para MJ/m²/dia", () => {
    const [day] = parseMeteoblueDailyPayload({
      units: { ghi_total: "J/cm²" },
      data_day: {
        time: ["2026-08-11"],
        precipitation_probability: [35],
        ghi_total: [2140],
      },
    });

    expect(day.precipitationProbabilityPct).toBe(35);
    expect(day.solarRadiationMjM2Day).toBeCloseTo(21.4);
  });

  it("recusa unidade de radiação desconhecida em vez de gravar valor incorreto", () => {
    expect(meteoblueGhiToMjM2Day(2000, "unknown")).toBeNull();
    expect(meteoblueGhiToMjM2Day(2000, "Wh/m²")).toBeCloseTo(7.2);
    expect(meteoblueGhiToMjM2Day(6165, undefined)).toBeCloseTo(22.194);
    expect(meteoblueGhiToMjM2Day(6165, "J/cm²")).toBeNull();
  });

  it("preserva a ETo FAO fornecida pela Meteoblue sem recalcular", () => {
    const [day] = parseMeteoblueDailyPayload({
      data_day: {
        time: ["2026-08-11"],
        temperature_max: [33.2],
        temperature_min: [19.4],
        windspeed_mean: [18],
        referenceevapotranspiration_fao: [5.7],
        evapotranspiration: [4.8],
        potentialevapotranspiration: [5.9],
      },
    });

    expect(day.referenceEtoFaoMm).toBe(5.7);
    expect(day.evapotranspirationMm).toBe(4.8);
    expect(day.potentialEvapotranspirationMm).toBe(5.9);
    expect(day.windSpeed).toBe(5);
  });

  it("mantem ETo ausente como null em vez de fabricar zero", () => {
    const [day] = parseMeteoblueDailyPayload({
      data_day: { time: ["2026-08-12"] },
    });
    expect(day.referenceEtoFaoMm).toBeNull();
  });
});
