/**
 * Relatórios operacionais (Etapa K / §29): diário, semanal, mensal,
 * por pivô, por parcela, por cultura, energético e financeiro.
 *
 * Energia e custo vêm do evento real (Etapa J). Sem valor gravado, fica nulo.
 * ARM em mm; umidade em % da CC volumétrico. Sem produtividade inventada.
 */

import { average, roundTo, sum } from "@/utils/math";
import type { ManagementReportRow } from "./management-report";
import type { EventForReport } from "./management-report";
import { eventDateKey } from "@/modules/irrigation/services/irrigation-event";

export type OperationalGrain = "day" | "week" | "month";

export interface OperationalTotals {
  days: number;
  etoMm: number;
  etcMm: number;
  rainMm: number;
  effectiveRainMm: number;
  irrigationMm: number;
  recommendedMm: number;
  avgArmMm: number;
  avgMoisturePctCc: number;
  avgCadMm: number;
  energyKwh: number | null;
  cost: number | null;
  volumeM3: number;
  eventCount: number;
}

export interface OperationalGroupRow {
  key: string;
  label: string;
  extra?: string;
  days: number;
  irrigationMm: number;
  rainMm: number;
  etcMm: number;
  avgArmMm: number;
  avgMoisturePctCc: number;
  energyKwh: number | null;
  cost: number | null;
  volumeM3: number;
  eventCount: number;
}

function isoWeekKey(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodKey(dateYmd: string, grain: OperationalGrain): string {
  if (grain === "day") return dateYmd;
  if (grain === "month") return dateYmd.slice(0, 7);
  return isoWeekKey(dateYmd);
}

function periodLabel(key: string, grain: OperationalGrain): string {
  if (grain === "day") return key;
  if (grain === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y}`;
  }
  return key.replace("-W", " · sem. ");
}

function eventTotals(events: EventForReport[]): { energyKwh: number | null; cost: number | null; volumeM3: number; count: number } {
  let energy = 0;
  let cost = 0;
  let volume = 0;
  let hasE = false;
  let hasC = false;
  for (const e of events) {
    volume += e.volume_m3 ?? 0;
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
    energyKwh: hasE ? roundTo(energy, 2) : null,
    cost: hasC ? roundTo(cost, 2) : null,
    volumeM3: roundTo(volume, 0),
    count: events.length,
  };
}

export function summarizeOperational(
  rows: ManagementReportRow[],
  events: EventForReport[],
): OperationalTotals {
  const ev = eventTotals(events);
  return {
    days: rows.length,
    etoMm: roundTo(sum(rows.map((r) => r.etoMm)), 1),
    etcMm: roundTo(sum(rows.map((r) => r.etcMm)), 1),
    rainMm: roundTo(sum(rows.map((r) => r.rainMm)), 1),
    effectiveRainMm: roundTo(sum(rows.map((r) => r.effectiveRainMm)), 1),
    irrigationMm: roundTo(sum(rows.map((r) => r.irrigationGrossMm)), 1),
    recommendedMm: roundTo(sum(rows.map((r) => r.recommendedGrossMm)), 1),
    avgArmMm: rows.length ? roundTo(average(rows.map((r) => r.armMm)), 1) : 0,
    avgMoisturePctCc: rows.length ? roundTo(average(rows.map((r) => r.moisturePctCc)), 1) : 0,
    avgCadMm: rows.length ? roundTo(average(rows.map((r) => r.cadMm)), 1) : 0,
    energyKwh: ev.energyKwh,
    cost: ev.cost,
    volumeM3: ev.volumeM3,
    eventCount: ev.count,
  };
}

function groupRows(
  rows: ManagementReportRow[],
  events: EventForReport[],
  keyOf: (r: ManagementReportRow) => string,
  labelOf: (r: ManagementReportRow) => string,
  extraOf?: (r: ManagementReportRow) => string | undefined,
): OperationalGroupRow[] {
  const buckets = new Map<string, ManagementReportRow[]>();
  const labels = new Map<string, string>();
  const extras = new Map<string, string>();
  for (const r of rows) {
    const key = keyOf(r) || "—";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
    labels.set(key, labelOf(r));
    if (extraOf) {
      const extra = extraOf(r);
      if (extra) extras.set(key, extra);
    }
  }

  const out: OperationalGroupRow[] = [];
  for (const [key, items] of Array.from(buckets.entries())) {
    const pivotIds = new Set(items.map((i) => i.pivotId));
    const parcelIds = new Set(items.map((i) => i.parcelId).filter(Boolean));
    const dates = new Set(items.map((i) => i.date));
    const groupedEvents = events.filter((e) => {
      const d = eventDateKey(e.started_at);
      if (!dates.has(d)) return false;
      if (parcelIds.size > 0 && e.parcel_id) return parcelIds.has(e.parcel_id);
      return pivotIds.has(e.pivot_id);
    });
    const totals = summarizeOperational(items, groupedEvents);
    out.push({
      key,
      label: labels.get(key) ?? key,
      extra: extras.get(key),
      days: new Set(items.map((i) => i.date)).size,
      irrigationMm: totals.irrigationMm,
      rainMm: totals.rainMm,
      etcMm: totals.etcMm,
      avgArmMm: totals.avgArmMm,
      avgMoisturePctCc: totals.avgMoisturePctCc,
      energyKwh: totals.energyKwh,
      cost: totals.cost,
      volumeM3: totals.volumeM3,
      eventCount: totals.eventCount,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function groupByPeriod(
  rows: ManagementReportRow[],
  events: EventForReport[],
  grain: OperationalGrain,
): OperationalGroupRow[] {
  return groupRows(
    rows,
    events,
    (r) => periodKey(r.date, grain),
    (r) => periodLabel(periodKey(r.date, grain), grain),
  );
}

export function groupByPivot(rows: ManagementReportRow[], events: EventForReport[]): OperationalGroupRow[] {
  return groupRows(rows, events, (r) => r.pivotId, (r) => r.pivotName);
}

export function groupByParcel(rows: ManagementReportRow[], events: EventForReport[]): OperationalGroupRow[] {
  return groupRows(
    rows,
    events,
    (r) => r.parcelId ?? `pivot:${r.pivotId}`,
    (r) => r.parcelName ?? r.pivotName,
    (r) => r.cultureName ?? undefined,
  );
}

export function groupByCulture(rows: ManagementReportRow[], events: EventForReport[]): OperationalGroupRow[] {
  return groupRows(
    rows,
    events,
    (r) => r.cultureId ?? "sem-cultura",
    (r) => r.cultureName ?? "Sem cultura",
  );
}

export function filterEvents(
  events: EventForReport[],
  opts: { periodFrom?: string; periodTo?: string; pivotIds?: Set<string>; parcelIds?: Set<string> },
): EventForReport[] {
  return events.filter((e) => {
    const d = eventDateKey(e.started_at);
    if (opts.periodFrom && d < opts.periodFrom) return false;
    if (opts.periodTo && d > opts.periodTo) return false;
    if (opts.pivotIds && opts.pivotIds.size > 0 && !opts.pivotIds.has(e.pivot_id)) return false;
    if (opts.parcelIds && opts.parcelIds.size > 0) {
      if (!e.parcel_id || !opts.parcelIds.has(e.parcel_id)) return false;
    }
    return true;
  });
}
