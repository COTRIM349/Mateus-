import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOpenMeteoProvider,
  OPEN_METEO_PROVIDER_NAME,
  OPEN_METEO_FALLBACK_TIMEZONE,
} from "./openMeteoProvider";
import {
  WeatherProviderError,
  WeatherTimeoutError,
  WeatherValidationError,
} from "@/modules/weather/errors/weatherErrors";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "farm-1",
  name: "Rio do Meio",
  latitude: -12.5,
  longitude: -45.8,
  elevationM: 720,
  timezone: "America/Bahia",
};

const dailyPayloadOK = {
  latitude: -12.5,
  longitude: -45.8,
  elevation: 720,
  timezone: "America/Bahia",
  daily: {
    time: ["2026-08-06"],
    temperature_2m_min: [18.4],
    temperature_2m_max: [30.1],
    temperature_2m_mean: [23.9],
    relative_humidity_2m_min: [32],
    relative_humidity_2m_max: [85],
    relative_humidity_2m_mean: [58],
    precipitation_sum: [0],
    precipitation_probability_max: [5],
    shortwave_radiation_sum: [21.5],
    wind_speed_10m_mean: [2.8],
    wind_speed_10m_max: [5.5],
    wind_direction_10m_dominant: [92],
    surface_pressure_min: [934],
    surface_pressure_max: [938.8],
    vapour_pressure_deficit_max: [2.7],
    et0_fao_evapotranspiration: [4.62],
  },
};

function stubFetchOnce(response: Partial<Response> & { jsonBody?: unknown }): void {
  const body = response.jsonBody;
  const ok = response.ok ?? true;
  const status = response.status ?? 200;
  const fake = {
    ok,
    status,
    async json() {
      if (body === undefined) throw new Error("no body");
      return body;
    },
    async text() {
      return body === undefined ? "" : JSON.stringify(body);
    },
  };
  vi.stubGlobal("fetch", vi.fn(async () => fake as unknown as Response));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("openMeteoProvider — construção e URL", () => {
  it("propriedades da interface WeatherProvider", () => {
    const p = createOpenMeteoProvider();
    expect(p.name).toBe(OPEN_METEO_PROVIDER_NAME);
    expect(p.displayName).toBe("Open-Meteo");
    expect(p.attribution.toLowerCase()).toContain("open-meteo");
    expect(p.config.timeoutMs).toBeGreaterThan(0);
    expect(p.config.maxAttempts).toBeLessThanOrEqual(2);
  });

  it("timezone da location é enviado no querystring", async () => {
    stubFetchOnce({ jsonBody: dailyPayloadOK });
    const p = createOpenMeteoProvider();
    await p.fetchDaily(location, { startDate: "2026-08-06", endDate: "2026-08-06" });
    const call = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    const url = call[0];
    expect(url).toContain("timezone=America%2FBahia");
    expect(url).toContain("wind_speed_unit=ms");
    expect(url).toContain("start_date=2026-08-06");
  });

  it("timezone ausente → fallback America/Bahia", async () => {
    stubFetchOnce({ jsonBody: dailyPayloadOK });
    const p = createOpenMeteoProvider();
    await p.fetchDaily(
      { ...location, timezone: "" },
      { startDate: "2026-08-06", endDate: "2026-08-06" },
    );
    const call = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    expect(call[0]).toContain(`timezone=${encodeURIComponent(OPEN_METEO_FALLBACK_TIMEZONE)}`);
  });
});

describe("openMeteoProvider — fluxo de sucesso", () => {
  it("fetchDaily entrega DailyWeatherData normalizado", async () => {
    stubFetchOnce({ jsonBody: dailyPayloadOK });
    const p = createOpenMeteoProvider();
    const rows = await p.fetchDaily(location, {
      startDate: "2026-08-06",
      endDate: "2026-08-06",
    });
    expect(rows.length).toBe(1);
    expect(rows[0].temperatureMaxC).toBe(30.1);
    expect(rows[0].providerReferenceEtoMm).toBe(4.62);
    expect(rows[0].internallyCalculatedEtoMm).toBeNull();
    expect(rows[0].metadata.provider).toBe("open_meteo");
  });

  it("fetchHourly entrega HourlyWeatherData com W/m²", async () => {
    stubFetchOnce({
      jsonBody: {
        hourly: {
          time: ["2026-08-06T12:00", "2026-08-06T13:00"],
          temperature_2m: [26, 27],
          shortwave_radiation: [800, 820],
          wind_speed_10m: [2.5, 2.8],
          surface_pressure: [936, 935],
        },
      },
    });
    const p = createOpenMeteoProvider();
    const rows = await p.fetchHourly(location, {
      startDate: "2026-08-06",
      endDate: "2026-08-06",
    });
    expect(rows.length).toBe(2);
    expect(rows[0].solarRadiationWm2).toBe(800);
    expect(rows[0].surfacePressureKpa).toBeCloseTo(93.6, 5);
    // u2 derivado
    const factor = 4.87 / Math.log(67.8 * 10 - 5.42);
    expect(rows[0].windSpeed2mMs).toBeCloseTo(2.5 * factor, 8);
  });
});

describe("openMeteoProvider — erros tipados e resiliência", () => {
  it("HTTP 404 → WeatherProviderError SEM retry (4xx não-429)", async () => {
    const spy = vi.fn(async () => ({
      ok: false,
      status: 404,
      async text() {
        return "Not Found";
      },
      async json() {
        return {};
      },
    }) as unknown as Response);
    vi.stubGlobal("fetch", spy);
    const p = createOpenMeteoProvider();
    await expect(
      p.fetchDaily(location, { startDate: "2026-08-06", endDate: "2026-08-06" }),
    ).rejects.toBeInstanceOf(WeatherProviderError);
    expect(spy).toHaveBeenCalledTimes(1); // sem retry
  });

  it("HTTP 500 → uma retentativa (maxAttempts=2)", async () => {
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      return {
        ok: false,
        status: 500,
        async text() {
          return "boom";
        },
        async json() {
          return {};
        },
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", spy);
    const p = createOpenMeteoProvider({
      ...createOpenMeteoProvider().config,
      timeoutMs: 500,
    });
    await expect(
      p.fetchDaily(location, { startDate: "2026-08-06", endDate: "2026-08-06" }),
    ).rejects.toBeInstanceOf(WeatherProviderError);
    expect(n).toBe(2);
  });

  it("Payload não-JSON → WeatherValidationError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new Error("Unexpected token in JSON");
        },
        async text() {
          return "not-json";
        },
      }) as unknown as Response),
    );
    const p = createOpenMeteoProvider();
    await expect(
      p.fetchDaily(location, { startDate: "2026-08-06", endDate: "2026-08-06" }),
    ).rejects.toBeInstanceOf(WeatherValidationError);
  });

  it("Timeout de rede → WeatherTimeoutError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit | undefined) => {
        return new Promise<Response>((_, reject) => {
          // Simula abort quando o AbortController for acionado
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              (err as { name?: string }).name = "AbortError";
              reject(err);
            });
          }
        });
      }),
    );
    const p = createOpenMeteoProvider({
      ...createOpenMeteoProvider().config,
      timeoutMs: 30,
      maxAttempts: 1,
    });
    await expect(
      p.fetchDaily(location, { startDate: "2026-08-06", endDate: "2026-08-06" }),
    ).rejects.toBeInstanceOf(WeatherTimeoutError);
  });
});

describe("openMeteoProvider — healthCheck", () => {
  it("200 → status ok", async () => {
    stubFetchOnce({ jsonBody: {} });
    const p = createOpenMeteoProvider();
    const h = await p.healthCheck();
    expect(h.status).toBe("ok");
    expect(h.provider).toBe(OPEN_METEO_PROVIDER_NAME);
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it("erro → status unavailable, sem exceção", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const p = createOpenMeteoProvider();
    const h = await p.healthCheck();
    expect(h.status).toBe("unavailable");
    expect(h.message).toContain("network down");
  });
});
