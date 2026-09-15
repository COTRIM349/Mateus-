import { describe, expect, it } from "vitest";
import {
  buildOperationalPivotSoil,
  type PivotSoilRegistryLayerRow,
  type PivotSoilRegistryRow,
} from "./pivot-soil-operational";

const profile = (overrides: Partial<PivotSoilRegistryRow> = {}): PivotSoilRegistryRow => ({
  pivot_id: "pivot-1",
  soil_class: "Franco-Arenoso",
  cc_pmp_unit: "gravimetric_pct",
  ...overrides,
});

const layer = (
  layerNumber: number,
  overrides: Partial<PivotSoilRegistryLayerRow> = {},
): PivotSoilRegistryLayerRow => ({
  pivot_id: "pivot-1",
  layer_number: layerNumber,
  thickness_m: 0.2,
  field_capacity_pct: 12,
  wilting_point_pct: 5,
  bulk_density_g_cm3: 1.8,
  ...overrides,
});

describe("buildOperationalPivotSoil", () => {
  it("converte percentuais gravimétricos e monta as profundidades", () => {
    const result = buildOperationalPivotSoil(profile(), [
      layer(2, { field_capacity_pct: 13, wilting_point_pct: 6 }),
      layer(1),
    ]);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Franco-Arenoso");
    expect(result?.effective_depth).toBe(0.4);
    expect(result?.layers).toEqual([
      expect.objectContaining({ depth_start: 0, depth_end: 20, field_capacity: 0.216, wilting_point: 0.09 }),
      expect.objectContaining({ depth_start: 20, depth_end: 40, field_capacity: 0.234, wilting_point: 0.108 }),
    ]);
    expect(result?.field_capacity).toBe(0.225);
    expect(result?.wilting_point).toBe(0.099);
    expect(result?.bulk_density).toBe(1.8);
  });

  it("aceita percentuais volumétricos sem exigir nem aplicar densidade", () => {
    const result = buildOperationalPivotSoil(
      profile({ cc_pmp_unit: "volumetric_pct" }),
      [layer(1, { field_capacity_pct: 30, wilting_point_pct: 12, bulk_density_g_cm3: null })],
    );

    expect(result?.field_capacity).toBe(0.3);
    expect(result?.wilting_point).toBe(0.12);
    expect(result?.bulk_density).toBeNull();
  });

  it("não inventa dados para perfil incompleto", () => {
    expect(buildOperationalPivotSoil(profile({ cc_pmp_unit: null }), [layer(1)])).toBeNull();
    expect(buildOperationalPivotSoil(profile(), [layer(1, { bulk_density_g_cm3: null })])).toBeNull();
    expect(buildOperationalPivotSoil(profile(), [layer(2)])).toBeNull();
    expect(buildOperationalPivotSoil(profile(), [])).toBeNull();
  });
});
