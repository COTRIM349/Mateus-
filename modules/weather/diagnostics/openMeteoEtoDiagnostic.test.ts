import { describe, it, expect, vi, afterEach } from "vitest";
import { runOpenMeteoEtoDiagnostic } from "./openMeteoEtoDiagnostic";
import { createOpenMeteoProvider } from "@/modules/weather/providers/openMeteoProvider";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "farm-rdm",
  name: "Rio do Meio",
  latitude: -12.5,
  longitude: -45.8,
  elevationM: 720,
  timezone: "America/Bahia",
};

const RANGE = { startDate: "2026-08-06", endDate: "2026-08-06" };

function stubDaily(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
      async text() {
        return "";
      },
    }) as unknown as Response),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("openMeteoEtoDiagnostic — comparação Open-Meteo × interna", () => {
  it("payload completo → duas ETo, diff absoluta e percentual calculadas", async () => {
    stubDaily({
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        temperature_2m_mean: [23.9],
        relative_humidity_2m_min: [32],
        relative_humidity_2m_max: [85],
        relative_humidity_2m_mean: [58],
        precipitation_sum: [0],
        shortwave_radiation_sum: [21.5],
        wind_speed_10m_mean: [2.8],
        surface_pressure_min: [934],
        surface_pressure_max: [938.8],
        et0_fao_evapotranspiration: [4.62],
      },
    });
    const provider = createOpenMeteoProvider();
    const res = await runOpenMeteoEtoDiagnostic(provider, location, RANGE);
    expect(res.entries.length).toBe(1);
    const e = res.entries[0];
    expect(e.providerEtoMm).toBe(4.62);
    expect(e.internalEtoMm).not.toBeNull();
    expect(e.internalEtoMm as number).toBeGreaterThan(0);
    // Diff calculada
    expect(e.absoluteDifferenceMm).not.toBeNull();
    expect(e.percentageDifferencePct).not.toBeNull();
    // Sanity: diff plausível (< 2 mm/d em um dia típico)
    expect(e.absoluteDifferenceMm as number).toBeLessThan(2);
    // variavéis usadas incluem os principais
    expect(e.variablesUsed).toEqual(
      expect.arrayContaining([
        "temperatureMinC",
        "temperatureMaxC",
        "windSpeed10mMs",
        "solarRadiationMjM2Day",
        "surfacePressureKpa",
      ]),
    );
  });

  it("providerEto ausente → percentageDifferencePct null (nunca vira 0)", async () => {
    stubDaily({
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        temperature_2m_mean: [23.9],
        relative_humidity_2m_mean: [58],
        shortwave_radiation_sum: [21.5],
        wind_speed_10m_mean: [2.8],
        et0_fao_evapotranspiration: [null],
      },
    });
    const provider = createOpenMeteoProvider();
    const res = await runOpenMeteoEtoDiagnostic(provider, location, RANGE);
    const e = res.entries[0];
    expect(e.providerEtoMm).toBeNull();
    expect(e.absoluteDifferenceMm).toBeNull();
    expect(e.percentageDifferencePct).toBeNull();
    // Interna pode ter sido calculada (RH mean está lá)
  });

  it("radiação ausente → interna null, missingFields inclui solarRadiationMjM2Day", async () => {
    stubDaily({
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        relative_humidity_2m_mean: [58],
        wind_speed_10m_mean: [2.8],
        et0_fao_evapotranspiration: [4.6],
        // sem shortwave_radiation_sum
      },
    });
    const provider = createOpenMeteoProvider();
    const res = await runOpenMeteoEtoDiagnostic(provider, location, RANGE);
    const e = res.entries[0];
    expect(e.internalEtoMm).toBeNull();
    expect(e.inputQualityStatus).toBe("missing");
    expect(e.missingFields).toEqual(expect.arrayContaining(["solarRadiationMjM2Day"]));
  });

  it("vento ausente → interna null (não vira zero)", async () => {
    stubDaily({
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        relative_humidity_2m_mean: [58],
        shortwave_radiation_sum: [21.5],
        // sem wind_speed_10m_mean
      },
    });
    const provider = createOpenMeteoProvider();
    const res = await runOpenMeteoEtoDiagnostic(provider, location, RANGE);
    const e = res.entries[0];
    expect(e.internalEtoMm).toBeNull();
    expect(e.missingFields).toEqual(expect.arrayContaining(["windSpeedMs"]));
  });

  it("pressão ausente → estimada da elevação, marcada em estimatedFields", async () => {
    stubDaily({
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        temperature_2m_mean: [23.9],
        relative_humidity_2m_mean: [58],
        shortwave_radiation_sum: [21.5],
        wind_speed_10m_mean: [2.8],
        et0_fao_evapotranspiration: [4.5],
        // sem surface_pressure_min/max → força estimativa via elevação
      },
    });
    const provider = createOpenMeteoProvider();
    const res = await runOpenMeteoEtoDiagnostic(provider, location, RANGE);
    const e = res.entries[0];
    expect(e.internalEtoMm).not.toBeNull();
    expect(e.estimatedFields.some((f) => f.field === "atmosphericPressureKpa")).toBe(true);
  });

  it("determinismo — mesma entrada, mesma ETo interna (2 execuções)", async () => {
    const payload = {
      daily: {
        time: ["2026-08-06"],
        temperature_2m_min: [18.4],
        temperature_2m_max: [30.1],
        temperature_2m_mean: [23.9],
        relative_humidity_2m_mean: [58],
        shortwave_radiation_sum: [21.5],
        wind_speed_10m_mean: [2.8],
        surface_pressure_min: [934],
        surface_pressure_max: [938.8],
        et0_fao_evapotranspiration: [4.6],
      },
    };
    stubDaily(payload);
    const p = createOpenMeteoProvider();
    const r1 = await runOpenMeteoEtoDiagnostic(p, location, RANGE);
    stubDaily(payload);
    const r2 = await runOpenMeteoEtoDiagnostic(p, location, RANGE);
    expect(r1.entries[0].internalEtoMm).toEqual(r2.entries[0].internalEtoMm);
  });
});
