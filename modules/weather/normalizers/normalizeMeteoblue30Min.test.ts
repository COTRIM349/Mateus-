import { describe, expect, it } from "vitest";
import { normalizeMeteoblueHourlyTo30Min } from "./normalizeMeteoblue30Min";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

describe("normalizeMeteoblueHourlyTo30Min", () => {
  it("interpola temperatura, UR e vento sem inventar chuva ou radiacao", () => {
    const rows = normalizeMeteoblueHourlyTo30Min({
      location,
      fetchedAt: "2026-08-07T10:20:00.000Z",
      requestUrl: "https://my.meteoblue.com/packages/basic-1h?apikey=***",
      payload: {
        metadata: {
          name: "meteoblue basic",
          modelrun_utc: "2026-08-07T06:00:00Z",
        },
        data_1h: {
          time: ["2026-08-07T10:00", "2026-08-07T11:00"],
          temperature: [26, 30],
          relativehumidity: [60, 50],
          windspeed: [2, 4],
          winddirection: [350, 10],
          precipitation: [1, 0],
          sealevelpressure: [1015, 1014],
        },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].intervalStart).toBe("2026-08-07T10:00:00.000Z");
    expect(rows[0].intervalEnd).toBe("2026-08-07T10:30:00.000Z");
    expect(rows[0].temperatureC).toBe(28);
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
    expect(rows[0].metadata.missingFields).toContain("precipitationMm");
    expect(rows[0].metadata.missingFields).toContain("solarRadiationWm2");
    expect(rows[1].temperatureC).toBe(30);
  });

  it("preserva null quando a variavel horaria esta ausente", () => {
    const rows = normalizeMeteoblueHourlyTo30Min({
      location,
      fetchedAt: "2026-08-07T09:00:00.000Z",
      requestUrl: "https://my.meteoblue.com/packages/basic-1h?apikey=***",
      payload: {
        data_1h: {
          time: ["2026-08-07T10:00", "2026-08-07T11:00"],
          temperature: [26, 28],
        },
      },
    });

    expect(rows[0].relativeHumidityPct).toBeNull();
    expect(rows[0].windSpeed10mMs).toBeNull();
    expect(rows[0].metadata.missingFields).toContain("relativeHumidityPct");
  });
});
