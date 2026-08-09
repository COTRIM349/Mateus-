import { describe, expect, it } from "vitest";
import {
  buildEtoSummary,
  climateCondition,
  haversineDistanceKm,
  selectLatestOfficialForecastPerDay,
  windDirectionLabel,
  type ClimateForecastInput,
  type ClimateReadingInput,
} from "./climateDashboard";

function reading(date: string, eto: number | null, importedAt = `${date}T20:00:00Z`): ClimateReadingInput {
  return {
    date,
    temp_max: 31,
    temp_min: 20,
    temp_mean: 25,
    humidity: 60,
    wind_speed: 2,
    solar_radiation: 20,
    precipitation: 0,
    et0_calculated: eto,
    imported_at: importedAt,
  };
}

function forecast(overrides: Partial<ClimateForecastInput>): ClimateForecastInput {
  return {
    id: "forecast",
    issued_at: "2026-08-08T12:00:00Z",
    target_date: "2026-08-09",
    temp_max: 31,
    temp_min: 20,
    humidity: 60,
    wind_speed: 2,
    solar_radiation: 20,
    precipitation: 0,
    precipitation_probability: 10,
    et0_calculated: 5,
    ...overrides,
  };
}

describe("climate dashboard data contract", () => {
  it("resume somente ETo calculada e preserva dias ausentes", () => {
    const summary = buildEtoSummary([
      reading("2026-08-06", 4),
      reading("2026-08-07", 5),
      reading("2026-08-08", null),
    ], "2026-08-08");

    expect(summary.todayMm).toBeNull();
    expect(summary.yesterdayMm).toBe(5);
    expect(summary.average7dMm).toBe(4.5);
    expect(summary.monthTotalMm).toBe(9);
    expect(summary.history.at(-1)).toEqual({
      date: "2026-08-08",
      etoMm: null,
      quality: "missing",
    });
  });

  it("usa a emissao mais recente com ETo oficial e ignora ETo ausente", () => {
    const selected = selectLatestOfficialForecastPerDay([
      forecast({ id: "old", issued_at: "2026-08-08T10:00:00Z", et0_calculated: 4.8 }),
      forecast({ id: "missing", issued_at: "2026-08-08T13:00:00Z", et0_calculated: null }),
      forecast({ id: "new", issued_at: "2026-08-08T12:00:00Z", et0_calculated: 5.2 }),
    ]);

    expect(selected.map((row) => row.id)).toEqual(["new"]);
  });

  it("converte direcao do vento para quadrante brasileiro", () => {
    expect(windDirectionLabel(0)).toBe("N");
    expect(windDirectionLabel(90)).toBe("L");
    expect(windDirectionLabel(225)).toBe("SO");
    expect(windDirectionLabel(null)).toBeNull();
  });

  it("classifica a condicao sem transformar dado ausente em chuva", () => {
    expect(climateCondition(null, null)).toBe("unknown");
    expect(climateCondition(0.4, 35)).toBe("partly_cloudy");
    expect(climateCondition(5, 10)).toBe("rain");
  });

  it("calcula a distância da fazenda até a estação pública", () => {
    const distance = haversineDistanceKm(
      -14.775986,
      -45.566556,
      -14.08916666,
      -46.36638888,
    );

    expect(distance).toBeCloseTo(115.1, 1);
  });
});
