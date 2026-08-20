import { describe, expect, it } from "vitest";
import {
  PIVOT_FORBIDDEN_CROP_FIELDS,
  buildPivotEquipmentRow,
  isForbiddenPivotCropField,
  validatePivotEquipmentInput,
  type PivotEquipmentPayloadInput,
} from "./pivot-equipment";

function sampleInput(
  overrides: Partial<PivotEquipmentPayloadInput> = {},
): PivotEquipmentPayloadInput {
  return {
    farmId: "farm-1",
    name: "Pivô 31",
    code: "P31",
    moduleId: "mod-1",
    manufacturer: "valley",
    model: "8120",
    pivotType: "central",
    area: 86,
    radius: 523,
    lastTowerRadius: 523,
    flowRate: 300,
    servicePressure: 3.2,
    speed100Pct: 150,
    fullTurnTime: 21.9,
    depth100Pct: 7.6,
    minDepthMm: 5,
    maxDepthMm: 15,
    maxOperatingTime: 24,
    pumpPower: 75,
    installedPowerKw: 62.8,
    motorEfficiency: 0.88,
    cuc: 0.85,
    applicationEfficiency: 0.85,
    specificConsumption: 0.21,
    latitude: -15.8,
    longitude: -47.3,
    energyCost: 0.72,
    costPerMm: 1.5,
    soilId: "soil-1",
    towerCount: 8,
    lengthM: 523,
    technicalNotes: "Bomba principal no módulo RDM.",
    waterSource: "reservatorio",
    ...overrides,
  };
}

describe("buildPivotEquipmentRow — ficha técnica sem cultura", () => {
  it("não inclui culture_id, status, cultivar, estádio nem safra", () => {
    const row = buildPivotEquipmentRow(sampleInput());
    const keys = Object.keys(row);

    for (const forbidden of PIVOT_FORBIDDEN_CROP_FIELDS) {
      expect(keys).not.toContain(forbidden);
    }

    expect("culture_id" in row).toBe(false);
    expect("status" in row).toBe(false);
    expect("crop_stage" in row).toBe(false);
    expect("season_id" in row).toBe(false);
    expect("planting_date" in row).toBe(false);
  });

  it("persiste campos técnicos da ficha", () => {
    const row = buildPivotEquipmentRow(sampleInput());
    expect(row.name).toBe("Pivô 31");
    expect(row.area).toBe(86);
    expect(row.flow_rate).toBe(300);
    expect(row.tower_count).toBe(8);
    expect(row.min_depth_mm).toBe(5);
    expect(row.max_depth_mm).toBe(15);
    expect(row.water_source).toBe("reservatorio");
    expect(row.technical_notes).toContain("Bomba");
    expect(row.cuc).toBe(0.85);
    expect(row.efficiency).toBe(0.85);
  });

  it("grava eficiência de aplicação distinta do CUC", () => {
    const row = buildPivotEquipmentRow(
      sampleInput({ cuc: 0.92, applicationEfficiency: 0.8 }),
    );
    expect(row.cuc).toBe(0.92);
    expect(row.efficiency).toBe(0.8);
  });

  it("não copia CUC para eficiência de aplicação", () => {
    const row = buildPivotEquipmentRow(
      sampleInput({ cuc: 0.9, applicationEfficiency: 0.75 }),
    );
    expect(row.efficiency).not.toBe(row.cuc);
  });
});

describe("validatePivotEquipmentInput", () => {
  it("rejeita nome vazio e área zero", () => {
    expect(validatePivotEquipmentInput(sampleInput({ name: "  " }))).toMatch(/nome/i);
    expect(validatePivotEquipmentInput(sampleInput({ area: 0 }))).toMatch(/área/i);
  });

  it("rejeita lâmina mínima maior que a máxima", () => {
    expect(
      validatePivotEquipmentInput(sampleInput({ minDepthMm: 20, maxDepthMm: 10 })),
    ).toMatch(/mínima/i);
  });

  it("aceita ficha válida", () => {
    expect(validatePivotEquipmentInput(sampleInput())).toBeNull();
  });
});

describe("isForbiddenPivotCropField", () => {
  it("marca vínculos agronômicos como proibidos no equipamento", () => {
    expect(isForbiddenPivotCropField("culture_id")).toBe(true);
    expect(isForbiddenPivotCropField("crop_stage")).toBe(true);
    expect(isForbiddenPivotCropField("status")).toBe(true);
    expect(isForbiddenPivotCropField("flow_rate")).toBe(false);
    expect(isForbiddenPivotCropField("soil_id")).toBe(false);
  });
});
