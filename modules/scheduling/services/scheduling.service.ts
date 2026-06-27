import { roundTo, clamp } from "@/utils/math";
import type { Recommendation, RecommendationPriority } from "@/modules/recommendation/services";

// ── Types ─────────────────────────────────────────────────────────────────

export type SlotStatus = "agendado" | "executando" | "concluido" | "cancelado" | "bloqueado";
export type ScheduleStatus = "rascunho" | "aprovado" | "executando" | "concluido" | "cancelado";

export interface PumpHouse {
  id: string;
  name: string;
  maxFlowRate: number;
  maxSimultaneous: number;
  powerKw: number;
  status: string;
}

export interface PumpHousePivot {
  pumpHouseId: string;
  pivotId: string;
  hydraulicLine: string;
  priorityOrder: number;
}

export interface EnergyTariff {
  peakStart: number;
  peakEnd: number;
  ratePeak: number;
  rateOffPeak: number;
  demandRate: number;
}

export interface ReservoirState {
  id: string;
  name: string;
  currentVolume: number;
  maxCapacity: number;
  minOperational: number;
  rechargeRate: number;
}

export interface SchedulingConstraints {
  pumpHouses: PumpHouse[];
  pumpHousePivots: PumpHousePivot[];
  tariff: EnergyTariff;
  contractedDemandKw: number;
  reservoirs: ReservoirState[];
  operationalStart: number;
  operationalEnd: number;
  maxDailyHours: number;
}

export interface ScheduleSlot {
  pivotId: string;
  pivotName: string;
  pumpHouseId: string | null;
  pumpHouseName: string;
  sequenceOrder: number;
  startTime: string;
  endTime: string;
  durationH: number;
  netDepth: number;
  grossDepth: number;
  volumeM3: number;
  energyKwh: number;
  cost: number;
  slotStatus: SlotStatus;
  canSimultaneous: boolean;
  simultaneousGroup: number | null;
  hydraulicLine: string;
  deficitIrrigation: boolean;
  justification: string;
  priority: RecommendationPriority;
  productiveRisk: number;
}

export interface DailySchedule {
  scheduleDate: string;
  status: ScheduleStatus;
  slots: ScheduleSlot[];
  totalVolumeM3: number;
  totalEnergyKwh: number;
  totalCost: number;
  totalDurationH: number;
  peakDemandKw: number;
  contractedDemandKw: number;
  pumpUtilization: PumpUtilization[];
  reservoirUsage: ReservoirUsage[];
}

export interface PumpUtilization {
  pumpHouseId: string;
  pumpHouseName: string;
  totalHours: number;
  totalVolumeM3: number;
  pivotsServed: number;
  utilizationPct: number;
  maxSimultaneous: number;
  peakSimultaneous: number;
}

export interface ReservoirUsage {
  reservoirId: string;
  reservoirName: string;
  startVolume: number;
  consumed: number;
  recharged: number;
  endVolume: number;
  capacityPct: number;
}

// ── Time helpers ────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hoursToMinutes(h: number): number {
  return Math.round(h * 60);
}

// ── Energy calculations ─────────────────────────────────────────────────

export function calculateSlotEnergy(
  powerKw: number,
  durationH: number,
  pivotPowerKw: number
): number {
  const effectivePower = pivotPowerKw > 0 ? pivotPowerKw : powerKw;
  return roundTo(effectivePower * durationH, 2);
}

export function calculateSlotCost(
  energyKwh: number,
  startTime: string,
  endTime: string,
  tariff: EnergyTariff
): number {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const peakStartMins = tariff.peakStart * 60;
  const peakEndMins = tariff.peakEnd * 60;

  // Calculate peak and off-peak portions
  let peakMins = 0;
  let offPeakMins = 0;
  const totalMins = endMins > startMins ? endMins - startMins : (1440 - startMins) + endMins;

  for (let m = startMins; m < startMins + totalMins; m++) {
    const minute = m % 1440;
    if (minute >= peakStartMins && minute < peakEndMins) {
      peakMins++;
    } else {
      offPeakMins++;
    }
  }

  const totalMinutes = peakMins + offPeakMins;
  if (totalMinutes === 0) return 0;

  const peakRatio = peakMins / totalMinutes;
  const offPeakRatio = offPeakMins / totalMinutes;

  const cost =
    energyKwh * peakRatio * tariff.ratePeak +
    energyKwh * offPeakRatio * tariff.rateOffPeak;

  return roundTo(cost, 2);
}

// ── Conflict detection ──────────────────────────────────────────────────

interface TimeWindow {
  start: number;
  end: number;
  pivotId: string;
  pumpHouseId: string;
  hydraulicLine: string;
}

function hasConflict(
  newWindow: TimeWindow,
  existing: TimeWindow[],
  constraints: SchedulingConstraints
): { conflict: boolean; reason: string } {
  // Same hydraulic line conflict
  const sameLineConflicts = existing.filter(
    (w) =>
      w.hydraulicLine === newWindow.hydraulicLine &&
      w.pumpHouseId === newWindow.pumpHouseId &&
      w.start < newWindow.end &&
      w.end > newWindow.start
  );

  if (sameLineConflicts.length > 0) {
    return {
      conflict: true,
      reason: `Conflito na linha hidráulica ${newWindow.hydraulicLine}`,
    };
  }

  // Pump house simultaneous limit
  const pumpHouse = constraints.pumpHouses.find((p) => p.id === newWindow.pumpHouseId);
  if (pumpHouse) {
    const simultaneousAtPump = existing.filter(
      (w) =>
        w.pumpHouseId === newWindow.pumpHouseId &&
        w.start < newWindow.end &&
        w.end > newWindow.start
    );

    if (simultaneousAtPump.length >= pumpHouse.maxSimultaneous) {
      return {
        conflict: true,
        reason: `Casa de bomba ${pumpHouse.name}: limite de ${pumpHouse.maxSimultaneous} pivôs simultâneos`,
      };
    }
  }

  return { conflict: false, reason: "" };
}

// ── Scheduling Engine ───────────────────────────────────────────────────

export function generateDailySchedule(
  recommendations: Recommendation[],
  constraints: SchedulingConstraints,
  scheduleDate: string
): DailySchedule {
  const irrigateRecs = recommendations
    .filter((r) => r.shouldIrrigate)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const slots: ScheduleSlot[] = [];
  const windows: TimeWindow[] = [];
  let sequenceOrder = 1;
  let simultaneousGroup = 1;

  const opStartMins = constraints.operationalStart * 60;
  const opEndMins = constraints.operationalEnd * 60;
  const peakStartMins = constraints.tariff.peakStart * 60;
  const peakEndMins = constraints.tariff.peakEnd * 60;

  // Track reservoir consumption
  const reservoirConsumption: Record<string, number> = {};

  // Track pump utilization
  const pumpHourTracker: Record<string, number> = {};

  for (const rec of irrigateRecs) {
    // Find pump house for this pivot
    const pivotPump = constraints.pumpHousePivots.find(
      (pp) => pp.pivotId === rec.pivotId
    );
    const pumpHouse = pivotPump
      ? constraints.pumpHouses.find((p) => p.id === pivotPump.pumpHouseId)
      : null;

    // Skip if pump house in maintenance
    if (pumpHouse && pumpHouse.status === "manutencao") {
      slots.push(buildBlockedSlot(rec, pumpHouse, sequenceOrder++, "Casa de bomba em manutenção"));
      continue;
    }

    // Check reservoir availability
    const availableWater = checkReservoirAvailability(constraints.reservoirs, reservoirConsumption, rec.volumeM3);
    if (!availableWater.available) {
      // Try deficit irrigation (50%)
      if (rec.volumeM3 * 0.5 <= availableWater.remainingVolume) {
        const deficitSlot = buildSlot(
          rec, pumpHouse, pivotPump, sequenceOrder++, constraints, windows, true
        );
        if (deficitSlot) {
          reservoirConsumption["total"] = (reservoirConsumption["total"] ?? 0) + deficitSlot.volumeM3;
          slots.push(deficitSlot);
          continue;
        }
      }
      slots.push(buildBlockedSlot(rec, pumpHouse, sequenceOrder++, `Água insuficiente nos reservatórios (necessário: ${rec.volumeM3.toFixed(0)} m³)`));
      continue;
    }

    // Check energy demand
    const pivotPower = pumpHouse?.powerKw ?? 0;
    const currentPeakDemand = calculateCurrentPeakDemand(slots, constraints.tariff);
    if (
      constraints.contractedDemandKw > 0 &&
      currentPeakDemand + pivotPower > constraints.contractedDemandKw * 1.1
    ) {
      // Try to schedule outside peak
      const offPeakSlot = buildSlot(
        rec, pumpHouse, pivotPump, sequenceOrder++, constraints, windows, false, true
      );
      if (offPeakSlot) {
        reservoirConsumption["total"] = (reservoirConsumption["total"] ?? 0) + offPeakSlot.volumeM3;
        slots.push(offPeakSlot);
        continue;
      }
    }

    // Normal scheduling
    const slot = buildSlot(rec, pumpHouse, pivotPump, sequenceOrder++, constraints, windows, false);
    if (slot) {
      reservoirConsumption["total"] = (reservoirConsumption["total"] ?? 0) + slot.volumeM3;
      slots.push(slot);

      const window: TimeWindow = {
        start: timeToMinutes(slot.startTime),
        end: timeToMinutes(slot.endTime),
        pivotId: rec.pivotId,
        pumpHouseId: pumpHouse?.id ?? "",
        hydraulicLine: slot.hydraulicLine,
      };
      windows.push(window);
    } else {
      slots.push(buildBlockedSlot(rec, pumpHouse, sequenceOrder++, "Sem janela operacional disponível"));
    }
  }

  // Mark simultaneous groups
  markSimultaneousGroups(slots, windows);

  // Calculate totals
  const activeSlots = slots.filter((s) => s.slotStatus !== "bloqueado");
  const totalVolumeM3 = activeSlots.reduce((s, sl) => s + sl.volumeM3, 0);
  const totalEnergyKwh = activeSlots.reduce((s, sl) => s + sl.energyKwh, 0);
  const totalCost = activeSlots.reduce((s, sl) => s + sl.cost, 0);
  const totalDurationH = calculateTotalDuration(activeSlots);
  const peakDemandKw = calculateCurrentPeakDemand(activeSlots, constraints.tariff);

  return {
    scheduleDate,
    status: "rascunho",
    slots,
    totalVolumeM3: roundTo(totalVolumeM3, 0),
    totalEnergyKwh: roundTo(totalEnergyKwh, 1),
    totalCost: roundTo(totalCost, 2),
    totalDurationH: roundTo(totalDurationH, 1),
    peakDemandKw: roundTo(peakDemandKw, 1),
    contractedDemandKw: constraints.contractedDemandKw,
    pumpUtilization: calculatePumpUtilization(activeSlots, constraints.pumpHouses),
    reservoirUsage: calculateReservoirUsage(
      constraints.reservoirs,
      reservoirConsumption,
      totalDurationH
    ),
  };
}

// ── Slot builders ───────────────────────────────────────────────────────

function buildSlot(
  rec: Recommendation,
  pumpHouse: PumpHouse | null | undefined,
  pivotPump: PumpHousePivot | undefined,
  order: number,
  constraints: SchedulingConstraints,
  existingWindows: TimeWindow[],
  deficitMode: boolean,
  avoidPeak: boolean = false
): ScheduleSlot | null {
  const durationMins = hoursToMinutes(
    deficitMode ? rec.irrigationTimeH * 0.5 : rec.irrigationTimeH
  );
  if (durationMins <= 0) return null;

  const hydraulicLine = pivotPump?.hydraulicLine ?? "A";
  const pumpId = pumpHouse?.id ?? "";

  // Find available start time
  const startMins = findAvailableStartTime(
    durationMins,
    pumpId,
    hydraulicLine,
    existingWindows,
    constraints,
    avoidPeak
  );

  if (startMins === null) return null;

  const endMins = startMins + durationMins;
  const startTime = minutesToTime(startMins);
  const endTime = minutesToTime(endMins);
  const durationH = deficitMode ? rec.irrigationTimeH * 0.5 : rec.irrigationTimeH;

  const grossDepth = deficitMode ? rec.grossDepth * 0.5 : rec.grossDepth;
  const netDepth = deficitMode ? rec.netDepth * 0.5 : rec.netDepth;
  const volumeM3 = deficitMode ? rec.volumeM3 * 0.5 : rec.volumeM3;

  const pivotPower = pumpHouse?.powerKw ?? 0;
  const energyKwh = calculateSlotEnergy(pivotPower, durationH, 0);
  const cost = calculateSlotCost(energyKwh, startTime, endTime, constraints.tariff);

  // Build justification
  const justParts: string[] = [];
  justParts.push(`Prioridade ${rec.priority} (score ${rec.priorityScore.toFixed(0)})`);
  justParts.push(`ARM: ${rec.currentArm.toFixed(1)}/${rec.currentCad.toFixed(1)} mm`);
  if (rec.cropPhase) justParts.push(`Fase: ${rec.cropPhase}`);
  if (deficitMode) justParts.push("Irrigação deficitária (50%) por restrição de água");
  if (avoidPeak) justParts.push("Deslocado para fora do horário de ponta");
  if (rec.peakRestricted) justParts.push("Restrição de horário de ponta");

  // Register window
  existingWindows.push({
    start: startMins,
    end: endMins,
    pivotId: rec.pivotId,
    pumpHouseId: pumpId,
    hydraulicLine,
  });

  return {
    pivotId: rec.pivotId,
    pivotName: rec.pivotName,
    pumpHouseId: pumpHouse?.id ?? null,
    pumpHouseName: pumpHouse?.name ?? "—",
    sequenceOrder: order,
    startTime,
    endTime,
    durationH: roundTo(durationH, 1),
    netDepth: roundTo(netDepth, 1),
    grossDepth: roundTo(grossDepth, 1),
    volumeM3: roundTo(volumeM3, 0),
    energyKwh: roundTo(energyKwh, 1),
    cost: roundTo(cost, 2),
    slotStatus: "agendado",
    canSimultaneous: false,
    simultaneousGroup: null,
    hydraulicLine,
    deficitIrrigation: deficitMode,
    justification: justParts.join(". "),
    priority: rec.priority,
    productiveRisk: rec.productiveRisk,
  };
}

function buildBlockedSlot(
  rec: Recommendation,
  pumpHouse: PumpHouse | null | undefined,
  order: number,
  reason: string
): ScheduleSlot {
  return {
    pivotId: rec.pivotId,
    pivotName: rec.pivotName,
    pumpHouseId: pumpHouse?.id ?? null,
    pumpHouseName: pumpHouse?.name ?? "—",
    sequenceOrder: order,
    startTime: "—",
    endTime: "—",
    durationH: 0,
    netDepth: rec.netDepth,
    grossDepth: rec.grossDepth,
    volumeM3: rec.volumeM3,
    energyKwh: 0,
    cost: 0,
    slotStatus: "bloqueado",
    canSimultaneous: false,
    simultaneousGroup: null,
    hydraulicLine: "—",
    deficitIrrigation: false,
    justification: `BLOQUEADO: ${reason}. ${rec.reason}`,
    priority: rec.priority,
    productiveRisk: rec.productiveRisk,
  };
}

// ── Time slot finder ────────────────────────────────────────────────────

function findAvailableStartTime(
  durationMins: number,
  pumpHouseId: string,
  hydraulicLine: string,
  existingWindows: TimeWindow[],
  constraints: SchedulingConstraints,
  avoidPeak: boolean
): number | null {
  const opStart = constraints.operationalStart * 60;
  const opEnd = constraints.operationalEnd * 60;
  const peakStart = constraints.tariff.peakStart * 60;
  const peakEnd = constraints.tariff.peakEnd * 60;

  // Build candidate start times
  const candidates: number[] = [];

  if (avoidPeak) {
    // Before peak
    for (let t = opStart; t + durationMins <= peakStart; t += 15) {
      candidates.push(t);
    }
    // After peak
    for (let t = peakEnd; t + durationMins <= opEnd; t += 15) {
      candidates.push(t);
    }
  } else {
    for (let t = opStart; t + durationMins <= opEnd; t += 15) {
      candidates.push(t);
    }
  }

  for (const startMins of candidates) {
    const endMins = startMins + durationMins;
    const testWindow: TimeWindow = {
      start: startMins,
      end: endMins,
      pivotId: "",
      pumpHouseId,
      hydraulicLine,
    };

    const pumpHouse = constraints.pumpHouses.find((p) => p.id === pumpHouseId);

    // Check hydraulic line conflicts
    const sameLineConflicts = existingWindows.filter(
      (w) =>
        w.hydraulicLine === hydraulicLine &&
        w.pumpHouseId === pumpHouseId &&
        w.start < endMins &&
        w.end > startMins
    );
    if (sameLineConflicts.length > 0) continue;

    // Check pump simultaneous limit
    if (pumpHouse) {
      const simultaneousCount = existingWindows.filter(
        (w) =>
          w.pumpHouseId === pumpHouseId &&
          w.start < endMins &&
          w.end > startMins
      ).length;
      if (simultaneousCount >= pumpHouse.maxSimultaneous) continue;
    }

    return startMins;
  }

  return null;
}

// ── Reservoir checks ────────────────────────────────────────────────────

function checkReservoirAvailability(
  reservoirs: ReservoirState[],
  consumption: Record<string, number>,
  volumeNeeded: number
): { available: boolean; remainingVolume: number } {
  if (reservoirs.length === 0) return { available: true, remainingVolume: Infinity };

  const totalAvailable = reservoirs.reduce(
    (s, r) => s + Math.max(0, r.currentVolume - r.minOperational),
    0
  );
  const alreadyConsumed = consumption["total"] ?? 0;
  const remaining = totalAvailable - alreadyConsumed;

  return {
    available: remaining >= volumeNeeded,
    remainingVolume: Math.max(0, remaining),
  };
}

// ── Demand calculation ──────────────────────────────────────────────────

function calculateCurrentPeakDemand(
  slots: ScheduleSlot[],
  tariff: EnergyTariff
): number {
  const peakStart = tariff.peakStart * 60;
  const peakEnd = tariff.peakEnd * 60;

  let maxDemand = 0;
  for (let t = peakStart; t < peakEnd; t += 15) {
    let demand = 0;
    for (const slot of slots) {
      if (slot.slotStatus === "bloqueado") continue;
      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = timeToMinutes(slot.endTime);
      if (slotStart <= t && slotEnd > t) {
        demand += slot.durationH > 0 ? slot.energyKwh / slot.durationH : 0;
      }
    }
    maxDemand = Math.max(maxDemand, demand);
  }

  return maxDemand;
}

// ── Simultaneous detection ──────────────────────────────────────────────

function markSimultaneousGroups(slots: ScheduleSlot[], windows: TimeWindow[]): void {
  let groupId = 1;
  const assigned = new Set<number>();

  for (let i = 0; i < slots.length; i++) {
    if (slots[i].slotStatus === "bloqueado" || assigned.has(i)) continue;

    const wi = windows.find((w) => w.pivotId === slots[i].pivotId);
    if (!wi) continue;

    const group: number[] = [i];
    for (let j = i + 1; j < slots.length; j++) {
      if (slots[j].slotStatus === "bloqueado" || assigned.has(j)) continue;
      const wj = windows.find((w) => w.pivotId === slots[j].pivotId);
      if (!wj) continue;

      if (wi.start < wj.end && wi.end > wj.start) {
        group.push(j);
      }
    }

    if (group.length > 1) {
      for (const idx of group) {
        slots[idx].canSimultaneous = true;
        slots[idx].simultaneousGroup = groupId;
        assigned.add(idx);
      }
      groupId++;
    }
  }
}

// ── Totals ──────────────────────────────────────────────────────────────

function calculateTotalDuration(slots: ScheduleSlot[]): number {
  if (slots.length === 0) return 0;
  const validSlots = slots.filter((s) => s.startTime !== "—");
  if (validSlots.length === 0) return 0;

  const starts = validSlots.map((s) => timeToMinutes(s.startTime));
  const ends = validSlots.map((s) => timeToMinutes(s.endTime));
  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  return roundTo((latest - earliest) / 60, 1);
}

function calculatePumpUtilization(
  slots: ScheduleSlot[],
  pumpHouses: PumpHouse[]
): PumpUtilization[] {
  return pumpHouses.map((ph) => {
    const phSlots = slots.filter((s) => s.pumpHouseId === ph.id);
    const totalHours = phSlots.reduce((s, sl) => s + sl.durationH, 0);
    const totalVolume = phSlots.reduce((s, sl) => s + sl.volumeM3, 0);
    const maxSimultaneous = Math.max(
      0,
      ...phSlots
        .filter((s) => s.simultaneousGroup !== null)
        .map((s) => s.simultaneousGroup!)
    );

    return {
      pumpHouseId: ph.id,
      pumpHouseName: ph.name,
      totalHours: roundTo(totalHours, 1),
      totalVolumeM3: roundTo(totalVolume, 0),
      pivotsServed: phSlots.length,
      utilizationPct: roundTo((totalHours / 24) * 100, 0),
      maxSimultaneous: ph.maxSimultaneous,
      peakSimultaneous: maxSimultaneous,
    };
  });
}

function calculateReservoirUsage(
  reservoirs: ReservoirState[],
  consumption: Record<string, number>,
  totalHours: number
): ReservoirUsage[] {
  const totalConsumed = consumption["total"] ?? 0;

  return reservoirs.map((r) => {
    const share = reservoirs.length > 0 ? totalConsumed / reservoirs.length : 0;
    const recharged = r.rechargeRate * totalHours;
    const endVolume = Math.max(0, r.currentVolume - share + recharged);

    return {
      reservoirId: r.id,
      reservoirName: r.name,
      startVolume: roundTo(r.currentVolume, 0),
      consumed: roundTo(share, 0),
      recharged: roundTo(recharged, 0),
      endVolume: roundTo(endVolume, 0),
      capacityPct: roundTo(r.maxCapacity > 0 ? (endVolume / r.maxCapacity) * 100 : 0, 0),
    };
  });
}

// ── Schedule validation ─────────────────────────────────────────────────

export interface ScheduleValidation {
  level: "error" | "warning" | "info";
  message: string;
}

export function validateSchedule(
  schedule: DailySchedule,
  constraints: SchedulingConstraints
): ScheduleValidation[] {
  const issues: ScheduleValidation[] = [];

  const blocked = schedule.slots.filter((s) => s.slotStatus === "bloqueado");
  if (blocked.length > 0) {
    issues.push({
      level: "warning",
      message: `${blocked.length} pivô(s) bloqueado(s) por restrições operacionais`,
    });
  }

  if (
    constraints.contractedDemandKw > 0 &&
    schedule.peakDemandKw > constraints.contractedDemandKw
  ) {
    issues.push({
      level: "error",
      message: `Demanda de ponta (${schedule.peakDemandKw.toFixed(0)} kW) excede contratada (${constraints.contractedDemandKw.toFixed(0)} kW)`,
    });
  }

  for (const ru of schedule.reservoirUsage) {
    if (ru.capacityPct < 20) {
      issues.push({
        level: "warning",
        message: `Reservatório ${ru.reservoirName}: nível final projetado em ${ru.capacityPct}%`,
      });
    }
  }

  const deficitSlots = schedule.slots.filter((s) => s.deficitIrrigation);
  if (deficitSlots.length > 0) {
    issues.push({
      level: "info",
      message: `${deficitSlots.length} pivô(s) com irrigação deficitária (50%)`,
    });
  }

  const highRisk = schedule.slots.filter((s) => s.productiveRisk > 60 && s.slotStatus === "bloqueado");
  if (highRisk.length > 0) {
    issues.push({
      level: "error",
      message: `${highRisk.length} pivô(s) com risco alto bloqueado(s) — verificar restrições`,
    });
  }

  if (schedule.totalDurationH > constraints.maxDailyHours) {
    issues.push({
      level: "warning",
      message: `Programação excede ${constraints.maxDailyHours}h de operação diária (${schedule.totalDurationH.toFixed(1)}h)`,
    });
  }

  return issues;
}

// ── Status config ───────────────────────────────────────────────────────

export const SLOT_STATUS_CONFIG: Record<
  SlotStatus,
  { label: string; bgClass: string }
> = {
  agendado:   { label: "Agendado",   bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  executando: { label: "Executando", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  concluido:  { label: "Concluído",  bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
  cancelado:  { label: "Cancelado",  bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  bloqueado:  { label: "Bloqueado",  bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
};

export const SCHEDULE_STATUS_CONFIG: Record<
  ScheduleStatus,
  { label: string; bgClass: string }
> = {
  rascunho:   { label: "Rascunho",   bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
  aprovado:   { label: "Aprovado",   bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  executando: { label: "Executando", bgClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  concluido:  { label: "Concluído",  bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
  cancelado:  { label: "Cancelado",  bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};
