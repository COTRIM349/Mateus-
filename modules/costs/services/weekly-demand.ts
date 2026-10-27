import { CV_TO_KW } from "@/constants/agronomic";
import { roundTo } from "@/utils/math";

export const WEEK_HOURS = 168;
export const DEMAND_MONTH_HOURS = 720;
export const WEEKLY_DEMAND_FORMULA =
  "Custo demanda semanal = pico semanal kW × tarifa demanda R$/kW × 168/720";

export interface WeeklyDemandOperation {
  pivotId: string;
  pivotName: string;
  moduleName: string;
  date: string;
  installedPowerKw?: number | null;
  specificConsumptionKwhM3?: number | null;
  flowRateM3h?: number | null;
  pumpPowerCv?: number | null;
  motorEfficiency?: number | null;
}

export interface DemandTariffPeriod {
  validFrom: string;
  validTo: string | null;
  demandRate: number;
}

export interface WeeklyDemandAllocation {
  weekStart: string;
  weekEnd: string;
  moduleName: string;
  peakDates: string[];
  peakDemandKw: number;
  demandRate: number | null;
  weeklyDemandCost: number | null;
  pivotId: string;
  pivotName: string;
  pivotPowerAtPeakKw: number;
  sharePct: number;
  apportionedDemandCost: number | null;
}

export function resolvePivotDemandPowerKw(
  pivot: Pick<
    WeeklyDemandOperation,
    "installedPowerKw" | "specificConsumptionKwhM3" | "flowRateM3h" | "pumpPowerCv" | "motorEfficiency"
  >,
): number | null {
  const installed = Number(pivot.installedPowerKw);
  if (Number.isFinite(installed) && installed > 0) return installed;

  const specific = Number(pivot.specificConsumptionKwhM3);
  const flow = Number(pivot.flowRateM3h);
  if (Number.isFinite(specific) && specific > 0 && Number.isFinite(flow) && flow > 0) {
    return specific * flow;
  }

  const cv = Number(pivot.pumpPowerCv);
  if (Number.isFinite(cv) && cv > 0) {
    const etaRaw = Number(pivot.motorEfficiency);
    const eta = Number.isFinite(etaRaw) && etaRaw > 0 ? etaRaw : 0.85;
    return (cv * CV_TO_KW) / eta;
  }

  return null;
}

function addDays(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStartMonday(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00Z`);
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function pickDemandRateForDate(
  tariffs: DemandTariffPeriod[],
  dateYmd: string,
): number | null {
  const matches = tariffs
    .filter((t) => t.validFrom <= dateYmd && (!t.validTo || t.validTo >= dateYmd))
    .filter((t) => Number.isFinite(t.demandRate) && t.demandRate > 0)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return matches[0]?.demandRate ?? null;
}

export function calculateWeeklyDemandApportionment(
  operations: WeeklyDemandOperation[],
  tariffs: DemandTariffPeriod[],
  monthlyHours = DEMAND_MONTH_HOURS,
): WeeklyDemandAllocation[] {
  if (operations.length === 0 || !Number.isFinite(monthlyHours) || monthlyHours <= 0) return [];

  // Um pivô conta uma única vez por dia/módulo, mesmo que existam vários
  // lançamentos no mesmo dia. Demanda é potência simultânea, não energia acumulada.
  const dailyPivot = new Map<string, {
    weekStart: string;
    moduleName: string;
    date: string;
    pivotId: string;
    pivotName: string;
    powerKw: number;
  }>();

  for (const op of operations) {
    const powerKw = resolvePivotDemandPowerKw(op);
    if (powerKw == null || powerKw <= 0 || !op.date || !op.moduleName) continue;
    const ws = weekStartMonday(op.date);
    const key = `${ws}|${op.moduleName}|${op.date}|${op.pivotId}`;
    const current = dailyPivot.get(key);
    // Se a ficha mudou durante o período, conserva o maior valor conhecido
    // daquele pivô no dia, sem duplicar eventos.
    if (!current || powerKw > current.powerKw) {
      dailyPivot.set(key, {
        weekStart: ws,
        moduleName: op.moduleName,
        date: op.date,
        pivotId: op.pivotId,
        pivotName: op.pivotName,
        powerKw,
      });
    }
  }

  type DailyPivotRow = {
    weekStart: string;
    moduleName: string;
    date: string;
    pivotId: string;
    pivotName: string;
    powerKw: number;
  };
  const groups = new Map<string, DailyPivotRow[]>();
  for (const row of Array.from(dailyPivot.values())) {
    const key = `${row.weekStart}|${row.moduleName}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: WeeklyDemandAllocation[] = [];
  const EPS = 1e-6;

  for (const items of Array.from(groups.values())) {
    if (items.length === 0) continue;
    const weekStart = items[0].weekStart;
    const moduleName = items[0].moduleName;
    const byDate = new Map<string, typeof items>();

    for (const item of items) {
      const list = byDate.get(item.date) ?? [];
      list.push(item);
      byDate.set(item.date, list);
    }

    let peakDemandKw = 0;
    const totals = new Map<string, number>();
    for (const [date, rows] of Array.from(byDate.entries())) {
      const total = rows.reduce((sum: number, row: DailyPivotRow) => sum + row.powerKw, 0);
      totals.set(date, total);
      if (total > peakDemandKw) peakDemandKw = total;
    }
    if (peakDemandKw <= 0) continue;

    const peakDates = Array.from(totals.entries())
      .filter(([, total]) => Math.abs(total - peakDemandKw) <= EPS)
      .map(([date]) => date)
      .sort();

    const tariffDate = peakDates[0];
    const demandRate = pickDemandRateForDate(tariffs, tariffDate);
    const weeklyDemandCost = demandRate == null
      ? null
      : peakDemandKw * demandRate * (WEEK_HOURS / monthlyHours);

    // Em empate de pico, usa a participação média do pivô nos dias empatados.
    const contribution = new Map<string, { pivotName: string; kwSum: number }>();
    for (const date of peakDates) {
      for (const row of byDate.get(date) ?? []) {
        const cur = contribution.get(row.pivotId) ?? { pivotName: row.pivotName, kwSum: 0 };
        cur.kwSum += row.powerKw;
        contribution.set(row.pivotId, cur);
      }
    }

    const denom = peakDemandKw * peakDates.length;
    const allocations = Array.from(contribution.entries())
      .map(([pivotId, data]) => {
        const avgPower = data.kwSum / peakDates.length;
        const share = denom > 0 ? data.kwSum / denom : 0;
        return {
          pivotId,
          pivotName: data.pivotName,
          pivotPowerAtPeakKw: avgPower,
          share,
        };
      })
      .sort((a, b) => b.share - a.share);

    let allocatedRounded = 0;
    allocations.forEach((item, index) => {
      let apportioned: number | null = null;
      if (weeklyDemandCost != null) {
        if (index === allocations.length - 1) {
          apportioned = roundTo(roundTo(weeklyDemandCost, 2) - allocatedRounded, 2);
        } else {
          apportioned = roundTo(weeklyDemandCost * item.share, 2);
          allocatedRounded += apportioned;
        }
      }

      out.push({
        weekStart,
        weekEnd: addDays(weekStart, 6),
        moduleName,
        peakDates,
        peakDemandKw: roundTo(peakDemandKw, 2),
        demandRate: demandRate == null ? null : roundTo(demandRate, 6),
        weeklyDemandCost: weeklyDemandCost == null ? null : roundTo(weeklyDemandCost, 2),
        pivotId: item.pivotId,
        pivotName: item.pivotName,
        pivotPowerAtPeakKw: roundTo(item.pivotPowerAtPeakKw, 2),
        sharePct: roundTo(item.share * 100, 2),
        apportionedDemandCost: apportioned,
      });
    });
  }

  return out.sort((a, b) =>
    b.weekStart.localeCompare(a.weekStart) ||
    a.moduleName.localeCompare(b.moduleName) ||
    b.sharePct - a.sharePct
  );
}
