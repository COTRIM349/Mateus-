import { afterEach, describe, expect, it } from "vitest";
import { buildMeteoblueHourlyUrl, redactMeteoblueKey } from "./meteoblueHourly";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

const location: WeatherLocation = {
  id: "station-1",
  name: "Estacao Virtual",
  latitude: -12.5,
  longitude: -45.5,
  elevationM: 720,
  timezone: "America/Bahia",
};

const originalKey = process.env.METEOBLUE_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.METEOBLUE_API_KEY;
  else process.env.METEOBLUE_API_KEY = originalKey;
});

describe("meteoblueHourly provider", () => {
  it("monta consulta basic-1h por coordenada e nunca exige chave no client", () => {
    process.env.METEOBLUE_API_KEY = "secret-test-key";
    const url = buildMeteoblueHourlyUrl(location);
    expect(url).toContain("/packages/basic-1h");
    expect(url).toContain("lat=-12.5");
    expect(url).toContain("lon=-45.5");
    expect(url).toContain("apikey=secret-test-key");
    expect(url).toContain("tz=UTC");
  });

  it("redige a chave antes de persistir URL de auditoria", () => {
    const safe = redactMeteoblueKey(
      "https://my.meteoblue.com/packages/basic-1h?lat=-12&apikey=super-secret&lon=-45",
    );
    expect(safe).toContain("apikey=***");
    expect(safe).not.toContain("super-secret");
  });

  it("falha explicitamente quando a chave server-only nao existe", () => {
    delete process.env.METEOBLUE_API_KEY;
    expect(() => buildMeteoblueHourlyUrl(location)).toThrow(/METEOBLUE_API_KEY/);
  });
});
