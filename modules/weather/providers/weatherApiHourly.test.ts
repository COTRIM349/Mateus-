import { afterEach, describe, expect, it } from "vitest";
import {
  assertWeatherApiResponseLocation,
  buildWeatherApiHourlyUrl,
  redactWeatherApiKey,
  weatherApiResponseDistanceKm,
} from "./weatherApiHourly";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

const original = process.env.WEATHERAPI_API_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.WEATHERAPI_API_KEY;
  else process.env.WEATHERAPI_API_KEY = original;
});

describe("WeatherAPI provider", () => {
  it("consulta por latitude/longitude e nunca preserva a chave na URL auditavel", () => {
    process.env.WEATHERAPI_API_KEY = "secret-test-key";
    const raw = buildWeatherApiHourlyUrl(location, 3);
    expect(raw).toContain("q=-12.5%2C-45.5");
    expect(raw).toContain("days=3");
    const redacted = redactWeatherApiKey(raw);
    expect(redacted).not.toContain("secret-test-key");
    expect(redacted).toContain("key=***");
  });

  it("falha explicitamente quando a chave nao esta configurada", () => {
    delete process.env.WEATHERAPI_API_KEY;
    expect(() => buildWeatherApiHourlyUrl(location)).toThrow("WEATHERAPI_API_KEY nao configurada");
  });

  it("valida quando a resposta corresponde ao ponto solicitado", () => {
    const payload = { location: { lat: -12.5001, lon: -45.5001 } };
    expect(weatherApiResponseDistanceKm(location, payload)).toBeLessThan(0.1);
    expect(assertWeatherApiResponseLocation(location, payload)).toBeLessThan(0.1);
  });

  it("rejeita resposta deslocada da estacao virtual", () => {
    expect(() => assertWeatherApiResponseLocation(location, {
      location: { lat: 52.52, lon: 13.42 },
    })).toThrow(/distante da estacao virtual/);
  });

  it("rejeita payload sem coordenadas de resposta", () => {
    expect(() => assertWeatherApiResponseLocation(location, {})).toThrow(
      "WeatherAPI nao informou as coordenadas da resposta",
    );
  });
});
