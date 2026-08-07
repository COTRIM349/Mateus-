import { describe, expect, it } from "vitest";
import {
  buildMetNorwayHourlyUrl,
  metNorwayUserAgent,
} from "./metNorwayHourly";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.512345,
  longitude: -45.543219,
  elevationM: 721.4,
  timezone: "America/Bahia",
};

describe("MET Norway Locationforecast provider", () => {
  it("arredonda coordenadas e envia altitude inteira na URL", () => {
    const url = new URL(buildMetNorwayHourlyUrl(location));
    expect(url.searchParams.get("lat")).toBe("-12.5123");
    expect(url.searchParams.get("lon")).toBe("-45.5432");
    expect(url.searchParams.get("altitude")).toBe("721");
  });

  it("possui identificacao de aplicacao mesmo sem env configurada", () => {
    expect(metNorwayUserAgent().length).toBeGreaterThan(10);
    expect(metNorwayUserAgent()).toContain("CotrimIrrigacaoPro");
  });
});
