/**
 * Lâmina, volume, tempo e capacidade diária do pivô.
 * 1 mm em 1 ha = 10 m³. Não inventa área, vazão ou eficiência.
 */

import { missingValue, traced, type TraceableValue } from "./trace";

export const LL_TO_CC_FORMULA = "LL = Dr  (repor até a capacidade de campo)";
export const LL_TO_TARGET_FORMULA = "LL = max(0, Dr − Dr_alvo)";
export const LB_FORMULA = "LB = LL / Ea";
export const VOLUME_FORMULA = "V = LB × Área × 10";
export const TIME_FORMULA = "Tempo = Volume / Vazão";
export const DAILY_CAPACITY_FORMULA = "Lâmina_dia = (Q × horas) / (Área × 10)";

export interface IrrigationRequirement {
  netMm: TraceableValue;
  grossMm: TraceableValue;
  volumeM3: TraceableValue;
  runtimeH: TraceableValue;
  dailyCapacityMm: TraceableValue;
  dailyCapacity24hMm: TraceableValue;
  weeklyCapacityMm: TraceableValue;
  missing: string[];
}

export function calculateIrrigationRequirement(input: {
  drMm: number | null;
  targetDrMm?: number | null;
  efficiency: number | null;
  areaHa: number | null;
  flowRateM3h: number | null;
  availableHours?: number | null;
}): IrrigationRequirement {
  const missing: string[] = [];
  const target = input.targetDrMm ?? 0;

  const net = input.drMm == null || !Number.isFinite(input.drMm)
    ? missingValue(["Dr"], "mm", LL_TO_TARGET_FORMULA, "balanço")
    : traced(Math.max(0, input.drMm - target), "mm", target === 0 ? LL_TO_CC_FORMULA : LL_TO_TARGET_FORMULA, {
        Dr: input.drMm,
        Dr_alvo: target,
      }, "balanço");

  if (input.efficiency == null || !Number.isFinite(input.efficiency) || input.efficiency <= 0 || input.efficiency > 1) {
    missing.push("Ea (eficiência de aplicação, 0–1]");
  }
  if (input.areaHa == null || !Number.isFinite(input.areaHa) || input.areaHa <= 0) {
    missing.push("área do pivô (ha)");
  }

  const gross = net.value != null && input.efficiency != null && input.efficiency > 0 && input.efficiency <= 1
    ? traced(net.value / input.efficiency, "mm", LB_FORMULA, { LL: net.value, Ea: input.efficiency }, "pivô")
    : missingValue([...net.missing, ...(missing.includes("Ea (eficiência de aplicação, 0–1]") ? ["Ea"] : [])], "mm", LB_FORMULA, "pivô");

  const volume = gross.value != null && input.areaHa != null && input.areaHa > 0
    ? traced(gross.value * input.areaHa * 10, "m³", VOLUME_FORMULA, {
        LB: gross.value,
        área_ha: input.areaHa,
      }, "pivô")
    : missingValue([...gross.missing, "área"], "m³", VOLUME_FORMULA, "pivô");

  const runtime = volume.value != null && input.flowRateM3h != null && input.flowRateM3h > 0
    ? traced(volume.value / input.flowRateM3h, "h", TIME_FORMULA, {
        volume_m3: volume.value,
        Q_m3h: input.flowRateM3h,
      }, "pivô")
    : missingValue(
        [...volume.missing, ...(input.flowRateM3h == null || input.flowRateM3h <= 0 ? ["vazão do pivô"] : [])],
        "h",
        TIME_FORMULA,
        "pivô",
      );

  const hours = input.availableHours ?? 24;
  const daily = input.flowRateM3h != null && input.flowRateM3h > 0 && input.areaHa != null && input.areaHa > 0
    ? traced((input.flowRateM3h * hours) / (input.areaHa * 10), "mm", DAILY_CAPACITY_FORMULA, {
        Q: input.flowRateM3h,
        horas: hours,
        área: input.areaHa,
      }, "pivô")
    : missingValue(["vazão", "área"], "mm", DAILY_CAPACITY_FORMULA, "pivô");

  const daily24 = input.flowRateM3h != null && input.flowRateM3h > 0 && input.areaHa != null && input.areaHa > 0
    ? traced((input.flowRateM3h * 24) / (input.areaHa * 10), "mm", DAILY_CAPACITY_FORMULA, {
        Q: input.flowRateM3h,
        horas: 24,
        área: input.areaHa,
      }, "pivô")
    : missingValue(["vazão", "área"], "mm", DAILY_CAPACITY_FORMULA, "pivô");

  const weekly = daily24.value != null
    ? traced(daily24.value * 7, "mm", "Lâmina_semana = lâmina_24h × 7", { mm_24h: daily24.value }, "pivô")
    : missingValue(["lâmina 24 h"], "mm", "Lâmina_semana", "pivô");

  return {
    netMm: net,
    grossMm: gross,
    volumeM3: volume,
    runtimeH: runtime,
    dailyCapacityMm: daily,
    dailyCapacity24hMm: daily24,
    weeklyCapacityMm: weekly,
    missing: Array.from(new Set([...missing, ...net.missing, ...gross.missing, ...volume.missing, ...runtime.missing])),
  };
}
