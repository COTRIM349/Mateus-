import { describe, expect, it } from "vitest";
import { normalizeWeatherApiHourlyTo30Min } from "./normalizeWeatherApi30Min";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

describe("normalizeWeatherApiHourlyTo30Min", () => {
  it("interpola estado atmosferico e nao inventa chuva sub-horaria", () => {
    const rows = normalizeWeatherApiHourlyTo30Min({
      location,
      fetchedAt: "2026-08-07T10:10:00.000Z",
      requestUrl: "https://api.weatherapi.com/v1/forecast.json?key=***",
      payload: {
        location: { lat: -12.5, lon: -45.5, tz_id: "America/Bahia" },
        forecast: {
          forecastday: [{
            date: "2026-08-07",
            hour: [
              {
                time_epoch: 1786106400,
                temp_c: 26,
                humidity: 60,
                dewpoint_c: 17,
                wind_kph: 7.2,
                wind_degree: 350,
                pressure_mb: 930,
                precip_mm: 1,
              },
              {
                time_epoch: 1786110000,
                temp_c: 30,
                humidity: 50,
                dewpoint_c: 18,
                wind_kph: 14.4,
                wind_degree: 10,
                pressure_mb: 928,
                precip_mm: 0,
              },
            ],
          }],
        },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].temperatureC).toBe(28);
    expect(rows[0].relativeHumidityPct).toBe(55);
    expect(rows[0].dewPointC).toBe(17.5);
    expect(rows[0].windSpeed10mMs).toBeCloseTo(3, 8);
    expect(rows[0].windDirectionDeg).toBeCloseTo(0, 8);
    expect(rows[0].surfacePressureKpa).toBeCloseTo(92.9, 8);
    expect(rows[0].precipitationMm).toBeNull();
    expect(rows[0].solarRadiationWm2).toBeNull();
    expect(rows[0].metadata.dataType).toBe("forecast");
    expect(rows[0].metadata.sourceResolutionMinutes).toBe(60);
    expect(rows[0].metadata.interpolated).toBe(true);
    expect(rows[0].metadata.estimated).toBe(true);
    expect(rows[0].metadata.missingFields).toContain("precipitationMm");
    expect(rows[0].metadata.missingFields).toContain("solarRadiationWm2");
  });
});
