import { describe, expect, it } from "vitest";
import { calculateET0 } from "./irrigation.service";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";

function dateFromDayOfYear(dayOfYear: number): string {
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOfYear - 1);
  return d.toISOString().slice(0, 10);
}

describe("adaptador legado de ETo", () => {
  it("produz o mesmo valor do motor FAO-56 canônico", () => {
    const input = {
      tempMax: 31.2,
      tempMin: 18.4,
      humidity: 52,
      windSpeed: 2.1,
      solarRadiation: 21.3,
      altitude: 856,
      latitude: -14.775966667,
      dayOfYear: 235,
    };

    const canonical = calculateReferenceEtoFao56({
      date: dateFromDayOfYear(input.dayOfYear),
      latitude: input.latitude,
      elevationM: input.altitude,
      temperatureMinC: input.tempMin,
      temperatureMaxC: input.tempMax,
      temperatureMeanC: (input.tempMin + input.tempMax) / 2,
      relativeHumidityMinPct: null,
      relativeHumidityMaxPct: null,
      relativeHumidityMeanPct: input.humidity,
      actualVapourPressureKpa: null,
      windSpeedMs: input.windSpeed,
      windMeasurementHeightM: 2,
      solarRadiationMjM2Day: input.solarRadiation,
      surfacePressureKpa: null,
    });

    expect(canonical.etoMmDay).not.toBeNull();
    expect(calculateET0(input)).toBeCloseTo(Number(canonical.etoMmDay!.toFixed(2)), 2);
  });

  it("aceita dia 366 sem deslocar a geometria solar", () => {
    const eto = calculateET0({
      tempMax: 29,
      tempMin: 19,
      humidity: 60,
      windSpeed: 1.8,
      solarRadiation: 19,
      altitude: 856,
      latitude: -14.775966667,
      dayOfYear: 366,
    });
    expect(Number.isFinite(eto)).toBe(true);
    expect(eto).toBeGreaterThanOrEqual(0);
  });
});
