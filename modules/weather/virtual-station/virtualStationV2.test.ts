import { describe, expect, it } from "vitest";
import {
  buildDefaultVirtualStation,
  DEFAULT_VIRTUAL_STATION_PROVIDERS,
  rankVirtualStationForPivot,
  validateVirtualStationLocation,
  validateVirtualStationScope,
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
    expect(station.scopeType).toBe("farm");
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

  it("valida a forma do escopo espacial", () => {
    expect(validateVirtualStationScope({ scopeType: "farm", moduleId: null, pivotId: null }).valid).toBe(true);
    expect(validateVirtualStationScope({ scopeType: "module", moduleId: "m1", pivotId: null }).valid).toBe(true);
    expect(validateVirtualStationScope({ scopeType: "pivot", moduleId: null, pivotId: "p1" }).valid).toBe(true);
    expect(validateVirtualStationScope({ scopeType: "module", moduleId: null, pivotId: null }).valid).toBe(false);
  });

  it("resolve prioridade espacial pivo > modulo > fazenda", () => {
    const target = { farmId: "farm-1", moduleId: "m1", pivotId: "p1" };
    const farm = buildDefaultVirtualStation({
      id: "s-farm", farmId: "farm-1", name: "Farm", latitude: -12, longitude: -45, elevationM: 700,
    });
    const moduleStation = buildDefaultVirtualStation({
      id: "s-module", farmId: "farm-1", name: "M1", latitude: -12, longitude: -45, elevationM: 700,
      scopeType: "module", moduleId: "m1",
    });
    const pivotStation = buildDefaultVirtualStation({
      id: "s-pivot", farmId: "farm-1", name: "P1", latitude: -12, longitude: -45, elevationM: 700,
      scopeType: "pivot", pivotId: "p1",
    });

    expect(rankVirtualStationForPivot(farm, target)).toBe(100);
    expect(rankVirtualStationForPivot(moduleStation, target)).toBe(200);
    expect(rankVirtualStationForPivot(pivotStation, target)).toBe(300);
  });
});
