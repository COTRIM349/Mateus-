import { describe, expect, it } from "vitest";
import { buildOpenMeteo30MinUrl, OPEN_METEO_15M_VARIABLES } from "./openMeteo30Min";

const location = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

describe("buildOpenMeteo30MinUrl", () => {
  it("consulta por coordenada exata e transporta timestamps em UTC", () => {
    const url = new URL(buildOpenMeteo30MinUrl(location, {
      pastSteps15Min: 8,
      forecastSteps15Min: 16,
    }));

    expect(url.searchParams.get("latitude")).toBe("-12.5");
    expect(url.searchParams.get("longitude")).toBe("-45.5");
    expect(url.searchParams.get("timezone")).toBe("UTC");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("past_minutely_15")).toBe("8");
    expect(url.searchParams.get("forecast_minutely_15")).toBe("16");

    const variables = url.searchParams.get("minutely_15")?.split(",") ?? [];
    expect(variables).toEqual([...OPEN_METEO_15M_VARIABLES]);
    expect(variables).toContain("shortwave_radiation");
    expect(variables).toContain("surface_pressure");
    expect(variables).toContain("dew_point_2m");
  });
});
