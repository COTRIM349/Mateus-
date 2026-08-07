import { describe, expect, it } from "vitest";
import {
  buildDefaultVirtualStation,
  DEFAULT_VIRTUAL_STATION_PROVIDERS,
  validateVirtualStationLocation,
  VIRTUAL_STATION_PROVIDERS,
  VIRTUAL_STATION_TARGET_RESOLUTION_MINUTES,
} from "./virtualStationV2";

describe("Virtual Station V2", () => {
  it("usa exatamente as quatro fontes definidas para a fase inicial", () => {
    expect(VIRTUAL_STATION_PROVIDERS).toEqual([
      "open_meteo",
      "meteoblue",
      "weatherapi",
      "met_norway",
    ]);
  });

  it("trabalha em shadow mode e alvo de 30 minutos por padrao", () => {
    const station = buildDefaultVirtualStation({
      id: "station-1",
      farmId: "farm-1",
      name: "Estacao Virtual M1",
      latitude: -12.1,
      longitude: -45.2,
      elevationM: 720,
    });

    expect(station.shadowMode).toBe(true);
    expect(station.targetResolutionMinutes).toBe(VIRTUAL_STATION_TARGET_RESOLUTION_MINUTES);
    expect(station.providers).toHaveLength(4);
    expect(station.providers).toEqual(DEFAULT_VIRTUAL_STATION_PROVIDERS);
  });

  it("rejeita coordenadas fora dos limites geograficos", () => {
    const result = validateVirtualStationLocation({
      latitude: 141000,
      longitude: -45,
      elevationM: 700,
      timezone: "America/Bahia",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("latitude"))).toBe(true);
  });

  it("aceita altitude ausente como null; nunca exige zero ficticio", () => {
    const station = buildDefaultVirtualStation({
      id: "station-2",
      farmId: "farm-1",
      name: "Estacao Virtual RDM",
      latitude: -12.5,
      longitude: -45.5,
      elevationM: null,
      timezone: "America/Bahia",
    });

    expect(station.elevationM).toBeNull();
  });
});
