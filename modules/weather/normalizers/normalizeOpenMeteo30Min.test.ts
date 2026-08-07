import { describe, expect, it } from "vitest";
import { normalizeOpenMeteo15MinTo30Min } from "./normalizeOpenMeteo30Min";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

describe("normalizeOpenMeteo15MinTo30Min", () => {
  it("agrega dois passos de 15 min em uma janela alinhada de 30 min sem inventar zero", () => {
    const rows = normalizeOpenMeteo15MinTo30Min({
      location,
      fetchedAt: "2026-08-07T10:40:00.000Z",
      requestUrl: "https://api.open-meteo.com/example",
      payload: {
        latitude: -12.5,
        longitude: -45.5,
        elevation: 720,
        minutely_15: {
          time: [
            "2026-08-07T10:15",
            "2026-08-07T10:30",
            "2026-08-07T10:45",
            "2026-08-07T11:00",
          ],
          temperature_2m: [26, 28, 29, 30],
          relative_humidity_2m: [60, 56, 54, 52],
          dew_point_2m: [17, 17.5, 18, 18.5],
          precipitation: [0.1, 0.2, 0, 0],
          shortwave_radiation: [500, 600, 650, 700],
          wind_speed_10m: [2, 3, 3, 4],
          wind_direction_10m: [90, 90, 100, 100],
          surface_pressure: [930, 928, 927, 926],
          vapour_pressure_deficit: [1.1, 1.3, 1.4, 1.5],
        },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].intervalStart).toBe("2026-08-07T10:00:00.000Z");
    expect(rows[0].intervalEnd).toBe("2026-08-07T10:30:00.000Z");
    expect(rows[0].temperatureC).toBe(27);
    expect(rows[0].relativeHumidityPct).toBe(58);
    expect(rows[0].precipitationMm).toBeCloseTo(0.3, 8);
    expect(rows[0].solarRadiationWm2).toBe(550);
    expect(rows[0].surfacePressureKpa).toBeCloseTo(92.9, 8);
    expect(rows[0].windSpeed2mMs).not.toBeNull();
    expect(rows[0].metadata.dataType).toBe("estimated");
    expect(rows[0].metadata.interpolated).toBe(true);
    expect(rows[0].metadata.sourceResolutionMinutes).toBe(60);

    expect(rows[1].intervalEnd).toBe("2026-08-07T11:00:00.000Z");
    expect(rows[1].metadata.dataType).toBe("forecast");
    expect(rows[1].metadata.forecastIssuedAt).toBeNull();
  });

  it("mantem variavel ausente como null e degrada qualidade", () => {
    const rows = normalizeOpenMeteo15MinTo30Min({
      location,
      fetchedAt: "2026-08-07T10:40:00.000Z",
      requestUrl: "https://api.open-meteo.com/example",
      payload: {
        minutely_15: {
          time: ["2026-08-07T10:15", "2026-08-07T10:30"],
          temperature_2m: [26, 28],
          relative_humidity_2m: [60, 56],
          precipitation: [0, 0],
          wind_speed_10m: [2, 3],
          surface_pressure: [930, 928],
        },
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].solarRadiationWm2).toBeNull();
    expect(rows[0].metadata.qualityStatus).toBe("partial");
    expect(rows[0].metadata.missingFields).toContain("solarRadiationWm2");
  });
});
