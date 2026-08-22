import { describe, expect, it } from "vitest";
import {
  buildOrbitalMoistureUrl,
  fetchLatestOrbitalHour,
  isValidMapCoordinate,
  latestOrbitalSample,
  parseOrbitalMoistureResponse,
} from "../orbital-moisture";

describe("orbital-moisture", () => {
  it("URL pede umidade 0–7, 7–28 e 28–100 cm — sem inventar sensor", () => {
    const url = buildOrbitalMoistureUrl(-16.678, -49.254);
    expect(url).toContain("soil_moisture_0_to_7cm");
    expect(url).toContain("soil_moisture_7_to_28cm");
    expect(url).toContain("soil_moisture_28_to_100cm");
    expect(url).toContain("latitude=-16.678");
  });

  it("rejeita coordenada 0/0 e fora do WGS84", () => {
    expect(isValidMapCoordinate(0, 0)).toBe(false);
    expect(isValidMapCoordinate(-16.7, -49.3)).toBe(true);
    expect(isValidMapCoordinate(91, 0)).toBe(false);
  });

  it("parse rejeita payload sem hourly", () => {
    expect(parseOrbitalMoistureResponse({ daily: {} })).toEqual([]);
  });

  it("latestOrbitalSample pega a última hora com valor — não inventa", () => {
    const parsed = parseOrbitalMoistureResponse({
      hourly: {
        time: ["2026-08-20T00:00", "2026-08-20T01:00", "2026-08-21T12:00"],
        soil_moisture_0_to_7cm: [0.11, 0.12, 0.19],
        soil_moisture_7_to_28cm: [0.20, 0.21, 0.22],
        soil_moisture_28_to_100cm: [0.25, 0.26, null],
      },
    });
    const latest = latestOrbitalSample(parsed);
    expect(latest?.time).toBe("2026-08-21T12:00");
    expect(latest?.moisture07).toBe(0.19);
    expect(latest?.moisture28100).toBeNull();
  });

  it("latestOrbitalSample retorna null se todas as horas vierem vazias", () => {
    const parsed = parseOrbitalMoistureResponse({
      hourly: {
        time: ["2026-08-20T00:00"],
        soil_moisture_0_to_7cm: [null],
        soil_moisture_7_to_28cm: [null],
        soil_moisture_28_to_100cm: [null],
      },
    });
    expect(latestOrbitalSample(parsed)).toBeNull();
  });

  it("fetchLatestOrbitalHour não chama a rede se a coordenada for inválida", async () => {
    let called = 0;
    const sample = await fetchLatestOrbitalHour(0, 0, async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    });
    expect(called).toBe(0);
    expect(sample).toBeNull();
  });
});
