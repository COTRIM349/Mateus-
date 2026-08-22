/**
 * Ficha técnica do pivô (Etapa A).
 *
 * O pivô é infraestrutura física permanente. Cultura, cultivar, estádio,
 * safra, Kc e manejo pertencem à PARCELA — nunca ao equipamento.
 */

export const PIVOT_WATER_SOURCES = [
  { value: "rio", label: "Rio" },
  { value: "poco", label: "Poço" },
  { value: "reservatorio", label: "Reservatório" },
  { value: "canal", label: "Canal" },
  { value: "outorga", label: "Outorga" },
  { value: "misto", label: "Misto" },
  { value: "outro", label: "Outro" },
] as const;

export type PivotWaterSource = (typeof PIVOT_WATER_SOURCES)[number]["value"];

export const PIVOT_FORBIDDEN_CROP_FIELDS = [
  "culture_id",
  "cultivar",
  "crop_stage",
  "planting_date",
  "season_id",
  "kc",
  "kc_current",
  "status",
] as const;

export interface PivotEquipmentPayloadInput {
  farmId: string;
  name: string;
  code: string | null;
  moduleId: string | null;
  manufacturer: string | null;
  model: string | null;
  pivotType: string;
  area: number;
  radius: number;
  lastTowerRadius: number | null;
  overhangM: number | null;
  flowRate: number;
  servicePressure: number | null;
  speed100Pct: number | null;
  fullTurnTime: number | null;
  depth100Pct: number | null;
  minDepthMm: number | null;
  maxDepthMm: number | null;
  maxOperatingTime: number | null;
  minNozzleMm: number | null;
  maxNozzleMm: number | null;
  conductionLosses: string | null;
  powerFactor: number | null;
  loadingIndex: number | null;
  aerialPartPct: number | null;
  pumpPower: number;
  installedPowerKw: number | null;
  motorEfficiency: number;
  /** CUC mede uniformidade espacial; não é eficiência de aplicação. */
  cuc: number;
  /** Ea transforma lâmina bruta em água efetivamente aplicada no balanço. */
  applicationEfficiency: number;
  specificConsumption: number | null;
  latitude: number;
  longitude: number;
  energyCost: number | null;
  costPerMm: number | null;
  soilId: string | null;
  towerCount: number | null;
  lengthM: number | null;
  technicalNotes: string | null;
  waterSource: string | null;
}

export type PivotEquipmentRow = {
  farm_id: string;
  name: string;
  code: string | null;
  module_id: string | null;
  manufacturer: string | null;
  model: string | null;
  pivot_type: string;
  area: number;
  radius: number;
  last_tower_radius: number | null;
  overhang_m: number | null;
  flow_rate: number;
  service_pressure: number | null;
  speed_100_pct: number | null;
  full_turn_time: number | null;
  depth_100_pct: number | null;
  min_depth_mm: number | null;
  max_depth_mm: number | null;
  max_operating_time: number | null;
  min_nozzle_mm: number | null;
  max_nozzle_mm: number | null;
  conduction_losses: string | null;
  power_factor: number | null;
  loading_index: number | null;
  aerial_part_pct: number | null;
  pump_power: number;
  installed_power_kw: number | null;
  motor_efficiency: number;
  cuc: number;
  application_efficiency: number;
  /** Compatibilidade temporária: espelha Ea até todos os leitores serem migrados. */
  efficiency: number;
  specific_consumption: number | null;
  latitude: number;
  longitude: number;
  energy_cost: number | null;
  cost_per_mm: number | null;
  soil_id: string | null;
  tower_count: number | null;
  length_m: number | null;
  technical_notes: string | null;
  water_source: string | null;
};

export function isForbiddenPivotCropField(field: string): boolean {
  return (PIVOT_FORBIDDEN_CROP_FIELDS as readonly string[]).includes(field);
}

export function validatePivotEquipmentInput(input: PivotEquipmentPayloadInput): string | null {
  if (!input.name.trim()) return "Informe o nome do pivô (aba Geral).";
  if (input.area <= 0) return "Informe a área irrigada (aba Características).";
  if (input.motorEfficiency < 0.5 || input.motorEfficiency > 1) return "Eficiência do motor deve estar entre 50 e 100%.";
  if (input.cuc < 0 || input.cuc > 1) return "CUC deve estar entre 0 e 100%.";
  if (input.applicationEfficiency <= 0 || input.applicationEfficiency > 1) return "Eficiência de aplicação deve estar entre 1 e 100%.";
  if (input.minDepthMm != null && input.maxDepthMm != null && input.minDepthMm > input.maxDepthMm) return "Lâmina mínima não pode ser maior que a lâmina máxima.";
  if (input.waterSource && !PIVOT_WATER_SOURCES.some((s) => s.value === input.waterSource)) return "Fonte de água inválida.";
  return null;
}

export function buildPivotEquipmentRow(input: PivotEquipmentPayloadInput): PivotEquipmentRow {
  return {
    farm_id: input.farmId,
    name: input.name.trim(),
    code: input.code,
    module_id: input.moduleId,
    manufacturer: input.manufacturer,
    model: input.model,
    pivot_type: input.pivotType || "central",
    area: input.area,
    radius: input.radius,
    last_tower_radius: input.lastTowerRadius,
    overhang_m: input.overhangM,
    flow_rate: input.flowRate,
    service_pressure: input.servicePressure,
    speed_100_pct: input.speed100Pct,
    full_turn_time: input.fullTurnTime,
    depth_100_pct: input.depth100Pct,
    min_depth_mm: input.minDepthMm,
    max_depth_mm: input.maxDepthMm,
    max_operating_time: input.maxOperatingTime,
    min_nozzle_mm: input.minNozzleMm,
    max_nozzle_mm: input.maxNozzleMm,
    conduction_losses: input.conductionLosses,
    power_factor: input.powerFactor,
    loading_index: input.loadingIndex,
    aerial_part_pct: input.aerialPartPct,
    pump_power: input.pumpPower,
    installed_power_kw: input.installedPowerKw,
    motor_efficiency: input.motorEfficiency,
    cuc: input.cuc,
    application_efficiency: input.applicationEfficiency,
    efficiency: input.applicationEfficiency,
    specific_consumption: input.specificConsumption,
    latitude: input.latitude,
    longitude: input.longitude,
    energy_cost: input.energyCost,
    cost_per_mm: input.costPerMm,
    soil_id: input.soilId,
    tower_count: input.towerCount,
    length_m: input.lengthM,
    technical_notes: input.technicalNotes,
    water_source: input.waterSource,
  };
}
