import { describe, expect, it } from "vitest";
import {
  buildSoyLocalPhenologyMarkers,
  resolveSoyLocalPhenologyStage,
} from "./soy-phenology-local-model";

describe("modelo fenológico local da soja", () => {
  it("reproduz COMBATE IPRO da planilha no ciclo reprodutivo", () => {
    const markers = buildSoyLocalPhenologyMarkers({
      emergenceDate: "2026-10-03",
      planningOccupancyDays: 114,
      growthHabit: "indeterminado",
    });
    const byCode = Object.fromEntries(markers.map((marker) => [marker.code, marker.dae]));
    expect(byCode.R1).toBe(40);
    expect(byCode.R5).toBe(66);
    expect(byCode.R8).toBe(101);
  });

  it("usa plastocrono e mês de emergência para Vn", () => {
    const markers = buildSoyLocalPhenologyMarkers({
      emergenceDate: "2026-10-03",
      planningOccupancyDays: 114,
      growthHabit: "indeterminado",
    });
    const byCode = Object.fromEntries(markers.map((marker) => [marker.code, marker.dae]));
    expect(byCode.V4).toBeCloseTo(19.1, 1);
    expect(byCode.V6).toBeCloseTo(27.2, 1);
    expect(resolveSoyLocalPhenologyStage(30, {
      emergenceDate: "2026-10-03",
      planningOccupancyDays: 114,
      growthHabit: "indeterminado",
    })?.code).toBe("V6");
  });

  it("usa plastocrono conservador para semideterminado", () => {
    const markers = buildSoyLocalPhenologyMarkers({
      emergenceDate: "2026-11-05",
      planningOccupancyDays: 120,
      growthHabit: "semideterminado",
    });
    const byCode = Object.fromEntries(markers.map((marker) => [marker.code, marker.dae]));
    expect(byCode.V4).toBeCloseTo(19.9, 1);
    expect(byCode.R8).toBe(107);
  });

  it("calibração cadastrada prevalece sobre o modelo", () => {
    const markers = buildSoyLocalPhenologyMarkers({
      emergenceDate: "2026-10-03",
      planningOccupancyDays: 114,
      growthHabit: "indeterminado",
      registeredMarkers: [{
        code: "R1",
        label: "R1 observado/calibrado",
        dae: 42,
        origin: "calibrado",
      }],
    });
    expect(markers.find((marker) => marker.code === "R1")?.dae).toBe(42);
  });
});
