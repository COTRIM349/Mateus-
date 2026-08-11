import { describe, expect, it, vi } from "vitest";
import {
  buildNasaPowerDailyUrl,
  fetchLatestNasaPowerDaily,
  normalizeNasaPowerDaily,
  type NasaPowerDailyPayload,
} from "./nasaPowerDaily";

const location = {
  id: "farm",
  name: "Fazenda Karitel",
  latitude: -14.775986,
  longitude: -45.566556,
  elevationM: 853,
  timezone: "America/Sao_Paulo",
};

function payload(): NasaPowerDailyPayload {
  return {
    properties: {
      parameter: {
        T2M: { "20260801": 26.4 },
        RH2M: { "20260801": 52 },
        PRECTOTCORR: { "20260801": 0 },
        WS10M: { "20260801": 2.4 },
        PS: { "20260801": 91.2 },
        ALLSKY_SFC_SW_DWN: { "20260801": 5.5 },
      },
    },
    parameters: {
      ALLSKY_SFC_SW_DWN: { units: "kW-hr/m^2/day" },
    },
  };
}

describe("NASA POWER daily reference", () => {
  it("monta uma consulta diária no ponto e corrige a pressão pela altitude", () => {
    const url = new URL(buildNasaPowerDailyUrl(
      location,
      new Date("2026-08-08T12:00:00.000Z"),
    ));

    expect(url.searchParams.get("start")).toBe("20260725");
    expect(url.searchParams.get("end")).toBe("20260807");
    expect(url.searchParams.get("latitude")).toBe("-14.775986");
    expect(url.searchParams.get("site-elevation")).toBe("853");
    expect(url.searchParams.get("parameters")).toContain("ALLSKY_SFC_SW_DWN");
  });

  it("normaliza unidades sem transformar ausência em zero", () => {
    const result = normalizeNasaPowerDaily(
      payload(),
      new Date("2026-08-08T12:00:00.000Z"),
    );

    expect(result.status).toBe("available");
    expect(result.precipitationMm).toBe(0);
    expect(result.solarRadiationDailyMjM2).toBeCloseTo(19.8, 6);
    expect(result.completenessPct).toBe(100);
  });

  it("não inventa radiação quando a unidade não vem identificada", () => {
    const raw = payload();
    delete raw.parameters;
    const result = normalizeNasaPowerDaily(
      raw,
      new Date("2026-08-08T12:00:00.000Z"),
    );

    expect(result.solarRadiationDailyMjM2).toBeNull();
    expect(result.completenessPct).toBe(83);
  });

  it("retorna indisponível em erro HTTP sem lançar no dashboard", async () => {
    const fetchImpl = vi.fn(async () => new Response("erro", { status: 503 }));
    const result = await fetchLatestNasaPowerDaily(location, { fetchImpl });

    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("503");
  });
});
