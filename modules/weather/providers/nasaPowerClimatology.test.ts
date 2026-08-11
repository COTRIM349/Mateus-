import { describe, expect, it, vi } from "vitest";
import {
  buildNasaPowerClimatologyUrl,
  fetchNasaPowerTemperatureNormal,
  normalizeNasaPowerTemperatureNormal,
} from "./nasaPowerClimatology";

const location = {
  id: "farm",
  name: "Fazenda Karitel",
  latitude: -14.775986,
  longitude: -45.566556,
  elevationM: 853,
  timezone: "America/Sao_Paulo",
};

describe("NASA POWER climatologia", () => {
  it("consulta T2M no ponto exato da estação virtual", () => {
    const url = new URL(buildNasaPowerClimatologyUrl(location));
    expect(url.pathname).toContain("/temporal/climatology/point");
    expect(url.searchParams.get("parameters")).toBe("T2M");
    expect(url.searchParams.get("latitude")).toBe("-14.775986");
    expect(url.searchParams.get("longitude")).toBe("-45.566556");
    expect(url.searchParams.get("site-elevation")).toBe("853");
  });

  it("prioriza a normal anual ANN", () => {
    const result = normalizeNasaPowerTemperatureNormal({
      properties: { parameter: { T2M: { ANN: 24.23, JAN: 25 } } },
      header: { range: "20-year climatology (2001-2020)" },
    });
    expect(result.status).toBe("available");
    expect(result.annualMeanTemperatureC).toBe(24.23);
    expect(result.sourceLabel).toContain("2001-2020");
  });

  it("aceita somente os 12 meses como fallback", () => {
    const values = Object.fromEntries(
      ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
        .map((month, index) => [month, 20 + index]),
    );
    const result = normalizeNasaPowerTemperatureNormal({
      properties: { parameter: { T2M: values } },
    });
    expect(result.status).toBe("available");
    expect(result.annualMeanTemperatureC).toBe(25.5);
  });

  it("falha fechado quando a climatologia está incompleta", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      properties: { parameter: { T2M: { JAN: 25 } } },
    }), { status: 200 }));
    const result = await fetchNasaPowerTemperatureNormal(location, { fetchImpl });
    expect(result.status).toBe("unavailable");
    expect(result.annualMeanTemperatureC).toBeNull();
  });
});
