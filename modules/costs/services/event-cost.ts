/**
 * Custo do evento real de irrigação (Etapa J).
 *
 * Cadeia: irrigação → volume → horas → energia → tarifa → custo.
 * Sem potência/consumo específico, energia fica nula.
 * Sem tarifa (fazenda ou R$/kWh da ficha), custo fica nulo — não inventar.
 */

import { CV_TO_KW } from "@/constants/agronomic";
import { roundTo } from "@/utils/math";

export const ENERGY_FORMULA = "E kWh = (Pot CV × 0,7355 / η) × Tempo h";
export const ENERGY_SPEC_FORMULA = "E kWh = consumo específico kWh/m³ × volume m³";
export const COST_FORMULA = "Custo R$ = energia kWh × tarifa R$/kWh";
export const COST_PER_MM_HA_FORMULA = "R$/mm/ha = custo R$ / (lâmina mm × área ha)";
export const MOTOR_EFFICIENCY_DEFAULT = 0.85;

export const MISSING_ENERGY =
  "Sem potência nem consumo específico na ficha do pivô — energia não calculada.";
export const MISSING_TARIFF =
  "Sem tarifa da fazenda e sem R$/kWh na ficha do pivô — custo não calculado.";

export type EnergySource = "specific_consumption" | "installed_kw" | "pump_power";

export interface EventEnergyInput {
  operatingHours: number;
  volumeM3: number;
  pumpPowerCv?: number | null;
  installedPowerKw?: number | null;
  motorEfficiency?: number | null;
  specificConsumptionKwhM3?: number | null;
}

export interface EventEnergyResult {
  energyKwh: number | null;
  source: EnergySource | null;
  pendingReason: string | null;
}

export function deriveEventEnergy(input: EventEnergyInput): EventEnergyResult {
  const hours = Number(input.operatingHours);
  const volume = Number(input.volumeM3);
  const spec = input.specificConsumptionKwhM3;
  if (spec != null && spec > 0 && Number.isFinite(volume) && volume > 0) {
    return {
      energyKwh: roundTo(spec * volume, 2),
      source: "specific_consumption",
      pendingReason: null,
    };
  }

  const installed = input.installedPowerKw;
  if (installed != null && installed > 0 && Number.isFinite(hours) && hours > 0) {
    return {
      energyKwh: roundTo(installed * hours, 2),
      source: "installed_kw",
      pendingReason: null,
    };
  }

  const cv = input.pumpPowerCv;
  if (cv != null && cv > 0 && Number.isFinite(hours) && hours > 0) {
    const etaRaw = input.motorEfficiency;
    const eta = etaRaw != null && etaRaw > 0 ? etaRaw : MOTOR_EFFICIENCY_DEFAULT;
    const powerKw = (cv * CV_TO_KW) / eta;
    return {
      energyKwh: roundTo(powerKw * hours, 2),
      source: "pump_power",
      pendingReason: null,
    };
  }

  return { energyKwh: null, source: null, pendingReason: MISSING_ENERGY };
}

export interface FarmTariff {
  id?: string | null;
  ratePeak: number;
  rateOffPeak: number;
  peakStart: number;
  peakEnd: number;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface EventCostInput {
  energyKwh: number | null;
  startedAt: string;
  operatingHours: number;
  tariff: FarmTariff | null;
  pivotEnergyCostReaisPerKwh?: number | null;
}

export interface EventCostResult {
  cost: number | null;
  tariffRate: number | null;
  peakKwh: number | null;
  offPeakKwh: number | null;
  pendingReason: string | null;
}

function hmFromIso(iso: string): string {
  const t = iso.includes("T") ? iso.slice(11, 16) : "";
  return /^\d{2}:\d{2}$/.test(t) ? t : "06:00";
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function splitKwhPeakOffPeak(
  totalKwh: number,
  startHm: string,
  hours: number,
  peakStart: number,
  peakEnd: number,
): { peakKwh: number; offPeakKwh: number } {
  if (!Number.isFinite(hours) || hours <= 0) {
    return { peakKwh: 0, offPeakKwh: totalKwh };
  }
  const startMins = timeToMinutes(startHm);
  const totalMins = Math.round(hours * 60);
  if (totalMins <= 0) return { peakKwh: 0, offPeakKwh: totalKwh };
  const peakStartMins = peakStart * 60;
  const peakEndMins = peakEnd * 60;
  let peakMins = 0;
  for (let m = startMins; m < startMins + totalMins; m++) {
    const minute = ((m % 1440) + 1440) % 1440;
    if (minute >= peakStartMins && minute < peakEndMins) peakMins++;
  }
  const peakRatio = peakMins / totalMins;
  return {
    peakKwh: roundTo(totalKwh * peakRatio, 2),
    offPeakKwh: roundTo(totalKwh * (1 - peakRatio), 2),
  };
}

export function deriveEventCost(input: EventCostInput): EventCostResult {
  if (input.energyKwh == null || !Number.isFinite(input.energyKwh) || input.energyKwh < 0) {
    return {
      cost: null,
      tariffRate: null,
      peakKwh: null,
      offPeakKwh: null,
      pendingReason: input.energyKwh == null ? MISSING_ENERGY : MISSING_TARIFF,
    };
  }

  const tariff = input.tariff;
  const hasTariff =
    tariff != null &&
    Number.isFinite(tariff.rateOffPeak) &&
    tariff.rateOffPeak > 0;

  if (hasTariff && tariff) {
    const split = splitKwhPeakOffPeak(
      input.energyKwh,
      hmFromIso(input.startedAt),
      input.operatingHours,
      tariff.peakStart,
      tariff.peakEnd,
    );
    const cost = roundTo(
      split.peakKwh * tariff.ratePeak + split.offPeakKwh * tariff.rateOffPeak,
      2,
    );
    const blended =
      input.energyKwh > 0 ? roundTo(cost / input.energyKwh, 4) : tariff.rateOffPeak;
    return {
      cost,
      tariffRate: blended,
      peakKwh: split.peakKwh,
      offPeakKwh: split.offPeakKwh,
      pendingReason: null,
    };
  }

  const flat = input.pivotEnergyCostReaisPerKwh;
  if (flat != null && Number.isFinite(flat) && flat > 0) {
    return {
      cost: roundTo(input.energyKwh * flat, 2),
      tariffRate: flat,
      peakKwh: 0,
      offPeakKwh: input.energyKwh,
      pendingReason: null,
    };
  }

  return {
    cost: null,
    tariffRate: null,
    peakKwh: null,
    offPeakKwh: null,
    pendingReason: MISSING_TARIFF,
  };
}

export interface EventIndicators {
  costPerEvent: number | null;
  costPerM3: number | null;
  costPerMmHa: number | null;
  costPerHa: number | null;
}

export function eventCostIndicators(input: {
  cost: number | null;
  volumeM3: number;
  depthMm: number;
  areaHa: number;
}): EventIndicators {
  const cost = input.cost;
  if (cost == null) {
    return { costPerEvent: null, costPerM3: null, costPerMmHa: null, costPerHa: null };
  }
  const volume = input.volumeM3;
  const depthArea = input.depthMm * input.areaHa;
  return {
    costPerEvent: roundTo(cost, 2),
    costPerM3: volume > 0 ? roundTo(cost / volume, 4) : null,
    costPerMmHa: depthArea > 0 ? roundTo(cost / depthArea, 4) : null,
    costPerHa: input.areaHa > 0 ? roundTo(cost / input.areaHa, 2) : null,
  };
}

export interface EventPricingContext extends EventEnergyInput {
  startedAt: string;
  depthMm: number;
  areaHa: number;
  tariff: FarmTariff | null;
  pivotEnergyCostReaisPerKwh?: number | null;
}

export interface PricedEventFields {
  energy_kwh: number | null;
  cost: number | null;
  tariff_rate: number | null;
  energy_source: EnergySource | null;
  pendingReason: string | null;
  indicators: EventIndicators;
}

/** Preço o evento já montado (Etapa H) com energia/tarifa. Não inventa tarifa. */
export function priceIrrigationEvent(ctx: EventPricingContext): PricedEventFields {
  const energy = deriveEventEnergy(ctx);
  const priced = deriveEventCost({
    energyKwh: energy.energyKwh,
    startedAt: ctx.startedAt,
    operatingHours: ctx.operatingHours,
    tariff: ctx.tariff,
    pivotEnergyCostReaisPerKwh: ctx.pivotEnergyCostReaisPerKwh,
  });
  return {
    energy_kwh: energy.energyKwh,
    cost: priced.cost,
    tariff_rate: priced.tariffRate,
    energy_source: energy.source,
    pendingReason: priced.cost == null ? (priced.pendingReason ?? energy.pendingReason) : null,
    indicators: eventCostIndicators({
      cost: priced.cost,
      volumeM3: ctx.volumeM3,
      depthMm: ctx.depthMm,
      areaHa: ctx.areaHa,
    }),
  };
}

export interface TariffRow {
  id: string;
  valid_from: string;
  valid_to: string | null;
  rate_peak: number;
  rate_off_peak: number;
  peak_start: number;
  peak_end: number;
}

export function pickTariffForDate(tariffs: TariffRow[], dateYmd: string): FarmTariff | null {
  const matches = tariffs.filter((t) => {
    if (t.valid_from > dateYmd) return false;
    if (t.valid_to && t.valid_to < dateYmd) return false;
    return true;
  });
  matches.sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const t = matches[0];
  if (!t) return null;
  return {
    id: t.id,
    ratePeak: t.rate_peak,
    rateOffPeak: t.rate_off_peak,
    peakStart: t.peak_start,
    peakEnd: t.peak_end,
    validFrom: t.valid_from,
    validTo: t.valid_to,
  };
}

export type CostGroupBy = "pivot" | "parcel" | "culture" | "season";

export interface PricedEventRow {
  id: string;
  pivotId: string;
  pivotName: string;
  parcelId: string | null;
  parcelName: string | null;
  cultureId: string | null;
  cultureName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  startedAt: string;
  depthMm: number;
  volumeM3: number;
  areaHa: number;
  energyKwh: number | null;
  cost: number | null;
}

export interface CostGroup {
  key: string;
  label: string;
  eventCount: number;
  totalCost: number;
  totalEnergyKwh: number;
  totalVolumeM3: number;
  totalDepthMm: number;
  areaHa: number;
  costPerEvent: number | null;
  costPerM3: number | null;
  costPerMmHa: number | null;
  costPerHa: number | null;
}

export function aggregatePricedEvents(rows: PricedEventRow[], by: CostGroupBy): CostGroup[] {
  const groups = new Map<string, PricedEventRow[]>();
  const labels = new Map<string, string>();
  for (const row of rows) {
    let key = "";
    let label = "—";
    if (by === "pivot") {
      key = row.pivotId;
      label = row.pivotName;
    } else if (by === "parcel") {
      key = row.parcelId ?? `pivot:${row.pivotId}`;
      label = row.parcelName ?? row.pivotName;
    } else if (by === "culture") {
      key = row.cultureId ?? "sem-cultura";
      label = row.cultureName ?? "Sem cultura";
    } else {
      key = row.seasonId ?? "sem-safra";
      label = row.seasonName ?? "Sem safra";
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
    labels.set(key, label);
  }

  const out: CostGroup[] = [];
  for (const [key, items] of Array.from(groups.entries())) {
    let totalCost = 0;
    let totalEnergy = 0;
    let totalVolume = 0;
    let totalDepth = 0;
    const areas = new Map<string, number>();
    for (const i of items) {
      totalCost += i.cost ?? 0;
      totalEnergy += i.energyKwh ?? 0;
      totalVolume += i.volumeM3;
      totalDepth += i.depthMm;
      areas.set(i.pivotId, i.areaHa);
    }
    const areaHa = Array.from(areas.values()).reduce((a, b) => a + b, 0);
    const depthArea = items.reduce((s, i) => s + i.depthMm * i.areaHa, 0);
    out.push({
      key,
      label: labels.get(key) ?? key,
      eventCount: items.length,
      totalCost: roundTo(totalCost, 2),
      totalEnergyKwh: roundTo(totalEnergy, 2),
      totalVolumeM3: roundTo(totalVolume, 0),
      totalDepthMm: roundTo(totalDepth, 2),
      areaHa: roundTo(areaHa, 2),
      costPerEvent: items.length > 0 ? roundTo(totalCost / items.length, 2) : null,
      costPerM3: totalVolume > 0 ? roundTo(totalCost / totalVolume, 4) : null,
      costPerMmHa: depthArea > 0 ? roundTo(totalCost / depthArea, 4) : null,
      costPerHa: areaHa > 0 ? roundTo(totalCost / areaHa, 2) : null,
    });
  }
  return out.sort((a, b) => b.totalCost - a.totalCost);
}

export function snapshotCycleEnergyCost(
  events: Array<{ energy_kwh?: number | null; cost?: number | null }>,
): { total_energy_kwh: number | null; total_cost: number | null } {
  let energy = 0;
  let cost = 0;
  let hasE = false;
  let hasC = false;
  for (const e of events) {
    if (e.energy_kwh != null && Number.isFinite(e.energy_kwh)) {
      energy += e.energy_kwh;
      hasE = true;
    }
    if (e.cost != null && Number.isFinite(e.cost)) {
      cost += e.cost;
      hasC = true;
    }
  }
  return {
    total_energy_kwh: hasE ? roundTo(energy, 2) : null,
    total_cost: hasC ? roundTo(cost, 2) : null,
  };
}
