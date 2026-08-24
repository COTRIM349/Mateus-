import { describe, expect, it } from "vitest";
import { prepareForWaterBalance, type WeatherReadingRow } from "./weather.service";

function reading(et0: number | null): WeatherReadingRow {
  return {
    id: "w1",
    station_id: "s1",
    date: "2026-08-21",
    temp_max: 32,
    temp_min: 18,
    temp_mean: 25,
    humidity: 55,
    wind_speed: 2,
    solar_radiation: 20,
    precipitation: 0,
    sunshine: null,
    et0_calculated: et0,
  };
}

describe("prepareForWaterBalance", () => {
  it("não transforma ETo ausente em zero", () => {
    expect(prepareForWaterBalance(reading(null))).toBeNull();
  });

  it("preserva ETo válida, inclusive zero medido/calculado explicitamente", () => {
    expect(prepareForWaterBalance(reading(5.2))?.et0).toBe(5.2);
    expect(prepareForWaterBalance(reading(0))?.et0).toBe(0);
  });
});
