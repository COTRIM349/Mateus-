import { describe, expect, it } from "vitest";
import { normalizeMetNorwayHourlyTo30Min } from "./normalizeMetNorway30Min";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

describe("normalizeMetNorwayHourlyTo30Min", () => {
  it("interpola estado atmosferico sem inventar chuva, radiacao ou pressao de superficie", () => {
    const rows = normalizeMetNorwayHourlyTo30Min({
      location,
      fetchedAt: "2026-08-07T10:20:00.000Z",
      requestUrl: "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-12.5&lon=-45.5",
      payload: {
        properties: {
          meta: { updated_at: "2026-08-07T09:00:00Z" },
          timeseries: [
            {
              time: "2026-08-07T10:00:00Z",
              data: {
                instant: {
                  details: {
                    air_temperature: 26,
                    dew_point_temperature: 17,
                    relative_humidity: 60,
                    wind_speed: 2,
                    wind_from_direction: 350,
                    air_pressure_at_sea_level: 1015,
                  },
                },
                next_1_hours: { details: { precipitation_amount: 2 } },
              },
            },
            {
              time: "2026-08-07T11:00:00Z",
              data: {
                instant: {
                  details: {
                    air_temperature: 30,
                    dew_point_temperature: 19,
                    relative_humidity: 50,
                    wind_speed: 4,
                    wind_from_direction: 10,
                    air_pressure_at_sea_level: 1014,
                  },
                },
                next_1_hours: { details: { precipitation_amount: 0 } },
              },
            },
          ],
        },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].intervalStart).toBe("2026-08-07T10:00:00.000Z");
    expect(rows[0].intervalEnd).toBe("2026-08-07T10:30:00.000Z");
    expect(rows[0].temperatureC).toBe(28);
    expect(rows[0].dewPointC).toBe(18);
    expect(rows[0].relativeHumidityPct).toBe(55);
    expect(rows[0].windSpeed10mMs).toBe(3);
    expect(rows[0].windDirectionDeg).toBeCloseTo(0, 8);
    expect(rows[0].precipitationMm).toBeNull();
    expect(rows[0].solarRadiationWm2).toBeNull();
    expect(rows[0].surfacePressureKpa).toBeNull();
    expect(rows[0].metadata.sourceResolutionMinutes).toBe(60);
    expect(rows[0].metadata.interpolated).toBe(true);
    expect(rows[0].metadata.estimated).toBe(true);
    expect(rows[0].metadata.qualityStatus).toBe("partial");
    expect(rows[0].metadata.missingFields).not.toContain("dewPointC");
    expect(rows[0].metadata.missingFields).toContain("precipitationMm");
    expect(rows[0].metadata.missingFields).toContain("solarRadiationWm2");
    expect(rows[0].metadata.forecastIssuedAt).toBe("2026-08-07T09:00:00Z");
  });

  it("preserva null quando variavel instantanea estiver ausente", () => {
    const rows = normalizeMetNorwayHourlyTo30Min({
      location,
      fetchedAt: "2026-08-07T09:00:00.000Z",
      requestUrl: "https://api.met.no/example",
      payload: {
        properties: {
          timeseries: [
            { time: "2026-08-07T10:00:00Z", data: { instant: { details: { air_temperature: 26 } } } },
            { time: "2026-08-07T11:00:00Z", data: { instant: { details: { air_temperature: 28 } } } },
          ],
        },
      },
    });

    expect(rows[0].dewPointC).toBeNull();
    expect(rows[0].relativeHumidityPct).toBeNull();
    expect(rows[0].windSpeed10mMs).toBeNull();
    expect(rows[0].metadata.missingFields).toContain("dewPointC");
    expect(rows[0].metadata.missingFields).toContain("relativeHumidityPct");
  });
});
