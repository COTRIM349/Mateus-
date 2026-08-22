import { describe, expect, it } from "vitest";
import {
  assessOperationalModel,
  selectOperationalSeason,
  type OperationalParcel,
  type OperationalPivot,
  type OperationalSeason,
} from "./operational-model";

const seasons: OperationalSeason[] = [
  { id: "old", name: "2024/25", startDate: "2024-09-01", active: true },
  { id: "current", name: "2025/26", startDate: "2025-09-01", active: true },
];

const pivots: OperationalPivot[] = [
  { id: "p1", name: "Pivô 01", areaHa: 100, active: true },
  { id: "p2", name: "Pivô 02", areaHa: 80, active: true },
];

function parcel(overrides: Partial<OperationalParcel> = {}): OperationalParcel {
  return {
    id: "parcel-1",
    name: "Talhão Norte",
    pivotId: "p1",
    seasonId: "current",
    cultureId: "soy",
    cultureName: "Soja",
    soilId: "soil",
    plantingDate: "2025-10-10",
    plantedAreaHa: 45,
    startAngleDeg: null,
    endAngleDeg: null,
    status: "ativa",
    active: true,
    ...overrides,
  };
}

describe("modelo operacional", () => {
  it("seleciona a safra ativa mais recente", () => {
    expect(selectOperationalSeason(seasons)).toEqual({
      season: seasons[1],
      activeCount: 2,
    });
  });

  it("fica completo quando todos os pivôs têm parcela válida na safra", () => {
    const result = assessOperationalModel({
      seasons: [seasons[1]],
      pivots,
      parcels: [
        parcel(),
        parcel({
          id: "parcel-2",
          pivotId: "p2",
          name: "Talhão Sul",
          plantedAreaHa: null,
          startAngleDeg: 0,
          endAngleDeg: 180,
        }),
      ],
    });

    expect(result.isComplete).toBe(true);
    expect(result.coveragePct).toBe(100);
    expect(result.totalManagedAreaHa).toBe(85);
    expect(result.gaps).toEqual([]);
  });

  it("lista pendências e mede cobertura sem misturar outras safras", () => {
    const result = assessOperationalModel({
      seasons: [seasons[1]],
      pivots,
      parcels: [parcel({ seasonId: "old" })],
    });

    expect(result.isComplete).toBe(false);
    expect(result.coveragePct).toBe(0);
    expect(result.gaps.filter((gap) => gap.code === "pivot_without_parcel")).toHaveLength(2);
  });

  it("bloqueia ambiguidade de múltiplas safras ativas", () => {
    const result = assessOperationalModel({
      seasons,
      pivots: [pivots[0]],
      parcels: [parcel()],
    });

    expect(result.season?.id).toBe("current");
    expect(result.isComplete).toBe(false);
    expect(result.gaps[0].code).toBe("multiple_active_seasons");
  });

  it("aponta os campos obrigatórios ausentes na parcela", () => {
    const result = assessOperationalModel({
      seasons: [seasons[1]],
      pivots: [pivots[0]],
      parcels: [
        parcel({
          cultureId: null,
          cultureName: null,
          soilId: null,
          plantingDate: null,
          plantedAreaHa: null,
          startAngleDeg: 0,
          endAngleDeg: 0,
        }),
      ],
    });

    expect(result.gaps.map((gap) => gap.code)).toEqual([
      "parcel_without_culture",
      "parcel_without_soil",
      "parcel_without_planting_date",
      "parcel_without_area",
    ]);
  });
});
