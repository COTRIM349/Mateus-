import { describe, it, expect } from "vitest";
import {
  normalizeOpenMeteoDaily,
  normalizeOpenMeteoHourly,
  circularMeanDirection,
  summarizeCompleteness,
  type OpenMeteoDailyPayload,
  type OpenMeteoHourlyPayload,
} from "./normalizeOpenMeteo";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "farm-1",
  name: "Rio do Meio",
  latitude: -12.5,
  longitude: -45.8,
  elevationM: 720,
  timezone: "America/Bahia",
};

describe("normalizeOpenMeteoDaily — unidades e null-preserving", () => {
  const fetchedAt = "2026-08-06T10:00:00.000Z";
  const requestUrl = "https://api.open-meteo.com/v1/forecast?...";

  it("payload diário completo → DailyWeatherData com todas as unidades", () => {
    const payload: OpenMeteoDailyPayload = {
      latitude: -12.5,
      longitude: -45.8,
      elevation: 720,
      timezone: "America/Bahia",
      timezone_abbreviation: "-03",
      utc_offset_seconds: -10800,
      generationtime_ms: 0.123,
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        temperature_2m_mean: [23.9],
        relative_humidity_2m_min: [32],
        relative_humidity_2m_max: [85],
        relative_humidity_2m_mean: [58],
        precipitation_sum: [0],
        precipitation_probability_max: [5],
        shortwave_radiation_sum: [21.5],
        wind_speed_10m_mean: [2.8],
        wind_speed_10m_max: [5.5],
        wind_direction_10m_dominant: [92],
        // API não expõe mean_surface_pressure diário — só min/max
        surface_pressure_min: [934, ],
        surface_pressure_max: [938.8],
        vapour_pressure_deficit_max: [2.7],
        et0_fao_evapotranspiration: [4.62],
      },
    };
    const [day] = normalizeOpenMeteoDaily({ payload, location, requestUrl, fetchedAt });
    // Unidades preservadas
    expect(day.temperatureMinC).toBe(18.4);
    expect(day.temperatureMaxC).toBe(30.1);
    expect(day.relativeHumidityMinPct).toBe(32);
    expect(day.precipitationMm).toBe(0);
    expect(day.solarRadiationMjM2Day).toBe(21.5);
    // Pressão hPa → kPa
    expect(day.surfacePressureKpa).toBeCloseTo(93.64, 5);
    // ETo Open-Meteo preservada
    expect(day.providerReferenceEtoMm).toBe(4.62);
    // ETo interna ainda null (diagnóstico calcula depois)
    expect(day.internallyCalculatedEtoMm).toBeNull();
    // Vento: u10 preservado + u2 derivado
    expect(day.windSpeed10mMs).toBe(2.8);
    expect(day.windSpeed2mMs).toBeCloseTo(2.8 * (4.87 / Math.log(67.8 * 10 - 5.42)), 8);
    // Metadata
    expect(day.metadata.provider).toBe("open_meteo");
    expect(day.metadata.sourceReference).toBe(requestUrl);
    expect(day.metadata.qualityStatus).toBe("complete");
    expect(day.metadata.missingFields).toEqual([]);
  });

  it("null vindo do provider é PRESERVADO como null (nunca zero)", () => {
    const payload: OpenMeteoDailyPayload = {
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [null],
        temperature_2m_max: [null],
        temperature_2m_mean: [null],
        relative_humidity_2m_min: [null],
        relative_humidity_2m_max: [null],
        relative_humidity_2m_mean: [null],
        precipitation_sum: [null],
        precipitation_probability_max: [null],
        shortwave_radiation_sum: [null],
        wind_speed_10m_mean: [null],
        wind_speed_10m_max: [null],
        wind_direction_10m_dominant: [null],
        surface_pressure_min: [null],
        surface_pressure_max: [null],
        vapour_pressure_deficit_max: [null],
        et0_fao_evapotranspiration: [null],
      },
    };
    const [day] = normalizeOpenMeteoDaily({ payload, location, requestUrl, fetchedAt });
    expect(day.temperatureMinC).toBeNull();
    expect(day.precipitationMm).toBeNull();
    expect(day.windSpeed10mMs).toBeNull();
    expect(day.windSpeed2mMs).toBeNull(); // derivado — se u10 é null, u2 é null
    expect(day.solarRadiationMjM2Day).toBeNull();
    expect(day.surfacePressureKpa).toBeNull();
    expect(day.providerReferenceEtoMm).toBeNull();
    expect(day.metadata.qualityStatus).toBe("partial");
    expect(day.metadata.missingFields.length).toBeGreaterThan(0);
  });

  it("data futura → dataType='forecast' + forecastIssuedAt = fetchedAt", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 3);
    const dateStr = future.toISOString().slice(0, 10);
    const payload: OpenMeteoDailyPayload = {
      daily: { time: [dateStr], temperature_2m_min: [10], temperature_2m_max: [20] },
    };
    const [day] = normalizeOpenMeteoDaily({ payload, location, requestUrl, fetchedAt });
    expect(day.metadata.dataType).toBe("forecast");
    expect(day.metadata.forecastIssuedAt).toBe(fetchedAt);
  });

  it("data passada → dataType='observed' + forecastIssuedAt = null", () => {
    const payload: OpenMeteoDailyPayload = {
      daily: { time: ["2020-01-01"], temperature_2m_min: [5], temperature_2m_max: [15] },
    };
    const [day] = normalizeOpenMeteoDaily({ payload, location, requestUrl, fetchedAt });
    expect(day.metadata.dataType).toBe("observed");
    expect(day.metadata.forecastIssuedAt).toBeNull();
  });

  it("vento 10 m preservado e u2 derivado da função central", () => {
    const payload: OpenMeteoDailyPayload = {
      daily: {
        time: ["2026-08-06"],
        wind_speed_10m_mean: [3.6],
      },
    };
    const [day] = normalizeOpenMeteoDaily({ payload, location, requestUrl, fetchedAt });
    expect(day.windSpeed10mMs).toBe(3.6);
    const factor = 4.87 / Math.log(67.8 * 10 - 5.42);
    expect(day.windSpeed2mMs).toBeCloseTo(3.6 * factor, 8);
  });
});

describe("normalizeOpenMeteoHourly — array desigual e W/m²", () => {
  const fetchedAt = "2026-08-06T10:00:00.000Z";
  const requestUrl = "https://api.open-meteo.com/v1/forecast?...";

  it("radiação horária mantida em W/m²", () => {
    const payload: OpenMeteoHourlyPayload = {
      hourly: {
        time: ["2026-08-06T12:00"],
        shortwave_radiation: [850],
      },
    };
    const [h] = normalizeOpenMeteoHourly({ payload, location, requestUrl, fetchedAt });
    expect(h.solarRadiationWm2).toBe(850);
  });

  it("payload com arrays de tamanhos diferentes gera warning explícito", () => {
    const payload: OpenMeteoHourlyPayload = {
      hourly: {
        time: ["2026-08-06T00:00", "2026-08-06T01:00"],
        temperature_2m: [22.1], // len=1, diferente de time (len=2)
      },
    };
    const rows = normalizeOpenMeteoHourly({ payload, location, requestUrl, fetchedAt });
    expect(rows.length).toBe(2);
    expect(rows[0].metadata.warnings.some((w) => w.includes("tamanho ≠ time"))).toBe(true);
    // O índice 1 fica null porque o array não tinha valor lá
    expect(rows[1].temperatureC).toBeNull();
  });

  it("surface_pressure hPa → kPa preservando null", () => {
    const payload: OpenMeteoHourlyPayload = {
      hourly: {
        time: ["2026-08-06T12:00", "2026-08-06T13:00"],
        surface_pressure: [935.2, null],
      },
    };
    const rows = normalizeOpenMeteoHourly({ payload, location, requestUrl, fetchedAt });
    expect(rows[0].surfacePressureKpa).toBeCloseTo(93.52, 5);
    expect(rows[1].surfacePressureKpa).toBeNull();
  });
});

describe("circularMeanDirection — média ponderada pela velocidade", () => {
  it("direção próxima de 0° e 359° não é média aritmética (que daria 180°)", () => {
    const dir = circularMeanDirection([1, 359], [1, 1]);
    // Média circular deve dar próxima de 0°/360° — muito longe de 180°
    expect(dir).not.toBeNull();
    const d = dir as number;
    const distanceToZero = Math.min(d, 360 - d);
    expect(distanceToZero).toBeLessThan(5);
  });

  it("uma componente com peso 0 é ignorada", () => {
    const dir = circularMeanDirection([90, 45], [0, 1]);
    expect(dir).toBeCloseTo(45, 5);
  });

  it("todos os pesos zero → null (nunca vira zero)", () => {
    expect(circularMeanDirection([90, 45], [0, 0])).toBeNull();
    expect(circularMeanDirection([null, null], [1, 1])).toBeNull();
  });
});

describe("summarizeCompleteness — regras 90 / 70 / <70", () => {
  it("22/24 = 91.7% → complete", () => {
    const s = summarizeCompleteness(24, 22);
    expect(s.qualityFromCompleteness).toBe("complete");
    expect(s.completenessPct).toBeCloseTo(91.67, 1);
  });
  it("18/24 = 75% → partial", () => {
    const s = summarizeCompleteness(24, 18);
    expect(s.qualityFromCompleteness).toBe("partial");
  });
  it("10/24 = 41.7% → missing", () => {
    const s = summarizeCompleteness(24, 10);
    expect(s.qualityFromCompleteness).toBe("missing");
  });
});
