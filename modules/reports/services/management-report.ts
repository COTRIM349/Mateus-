/**
 * Relatório de manejo de irrigação (Etapa K / §29).
 *
 * Linha diária a partir do balanço real + evento de irrigação + nota sensorial.
 * ETP só entra quando existir no dado — não inventar.
 * Nota sensorial permanece 1–10; nunca vira % da CC.
 * ARM é mm; % da CC é volumétrico. Não misturar com ARM/CAD.
 */

import { roundTo } from "@/utils/math";
import {
  moisturePercentOfFieldCapacity,
  moisturePctCcForDisplay,
  pmpPctCcForDisplay,
  safetyMoistureMm,
  safetyPctCcForDisplay,
} from "@/modules/water-balance/services/soil-water-balance";
import { resolveSensoryNote } from "@/modules/soil/services/sensory-note";
import { eventDateKey } from "@/modules/irrigation/services/irrigation-event";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";

export const MANAGEMENT_UNITS = {
  eto: "mm/d",
  etp: "mm/d",
  etc: "mm/d",
  kc: "adimensional",
  ks: "adimensional",
  kl: "adimensional",
  ky: "adimensional",
  rain: "mm",
  effectiveRain: "mm",
  irrigation: "mm (lâmina bruta)",
  recommendedDepth: "mm (lâmina bruta recomendada)",
  appliedDepth: "mm (lâmina bruta aplicada)",
  cc: "cm³/cm³",
  pmp: "cm³/cm³",
  cad: "mm",
  afd: "mm",
  arm: "mm",
  safetyMoisture: "mm",
  moisturePctCc: "% da CC (volumétrico)",
  sensoryNote: "nota 1–10 (adimensional)",
  rootDepth: "m",
  dae: "dias",
} as const;

export const ETP_PENDING_NOTE =
  "ETP só aparece quando existir no dado climático — não inventar a partir da ETo.";

export const SENSORY_NOT_CONVERTED_TO_PCT_CC = true;

export interface ManagementWeather {
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
  rh: number | null;
  wind: number | null;
  rad: number | null;
  /** ETP/ETp só se o dado existir. Nunca copiar ETo. */
  etp: number | null;
}

export interface ManagementReportRow {
  date: string;
  pivotId: string;
  pivotName: string;
  parcelId: string | null;
  parcelName: string | null;
  cultureId: string | null;
  cultureName: string | null;
  phase: string;
  dae: number | null;
  etoMm: number;
  etpMm: number | null;
  etcMm: number;
  kc: number;
  ks: number | null;
  kl: number | null;
  ky: number | null;
  rainMm: number;
  effectiveRainMm: number;
  irrigationGrossMm: number;
  effectiveIrrigationMm: number;
  recommendedGrossMm: number;
  fieldCapacity: number | null;
  wiltingPoint: number | null;
  cadMm: number;
  afdMm: number;
  armMm: number;
  safetyMoistureMm: number;
  moisturePctCc: number;
  safetyPctCc: number;
  pmpPctCc: number;
  surplusMm: number;
  etcPotentialMm: number | null;
  rootDepthM: number;
  sensoryNote: number | null;
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
  rh: number | null;
  wind: number | null;
  rad: number | null;
}

export interface StoredBalanceForReport {
  date: string;
  pivot_crop_assignment_id: string;
  et0: number;
  kc: number;
  etc: number;
  precipitation: number;
  effective_precipitation: number;
  applied_depth: number;
  effective_irrigation?: number | null;
  cad: number;
  afd: number;
  soil_storage: number;
  gross_depth: number;
  net_depth?: number;
  surplus?: number | null;
  ks?: number | null;
  kl?: number | null;
  ky?: number | null;
  field_capacity?: number | null;
  wilting_point?: number | null;
  safety_moisture_mm?: number | null;
  moisture_pct_cc?: number | null;
  safety_pct_cc?: number | null;
  phase?: string | null;
  dae?: number | null;
  root_depth?: number | null;
  etc_potential?: number | null;
}

export interface AssignmentForReport {
  id: string;
  pivot_id: string;
  name?: string | null;
  culture_id?: string | null;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface EventForReport {
  started_at: string;
  depth_mm: number;
  pivot_id: string;
  parcel_id?: string | null;
  energy_kwh?: number | null;
  cost?: number | null;
  volume_m3?: number;
  operating_hours?: number | null;
}

export interface SensoryForReport {
  reading_date: string;
  pivot_id: string;
  parcel_id?: string | null;
  note?: number | null;
  layer_1_note?: number | null;
  layer_2_note?: number | null;
  layer_3_note?: number | null;
}

export interface ManagementReportFilters {
  periodFrom: string;
  periodTo: string;
  pivotId: string;
  parcelId: string;
  cultureId: string;
}

export const EMPTY_MANAGEMENT_FILTERS: ManagementReportFilters = {
  periodFrom: "",
  periodTo: "",
  pivotId: "",
  parcelId: "",
  cultureId: "",
};

export interface ManagementBuildInput {
  balances: StoredBalanceForReport[];
  assignments: AssignmentForReport[];
  pivots: NamedRef[];
  cultures: NamedRef[];
  events: EventForReport[];
  sensory: SensoryForReport[];
  weatherByDate?: Record<string, Partial<ManagementWeather>>;
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

function sumAppliedByPivotDate(events: EventForReport[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ev of events) {
    const key = `${ev.pivot_id}|${eventDateKey(ev.started_at)}`;
    map.set(key, roundTo((map.get(key) ?? 0) + Math.max(ev.depth_mm, 0), 2));
  }
  return map;
}

function sensoryByPivotDate(rows: SensoryForReport[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const note = resolveSensoryNote(r);
    if (note == null) continue;
    map.set(`${r.pivot_id}|${ymd(r.reading_date)}`, note);
  }
  return map;
}

export function buildManagementRows(input: ManagementBuildInput): ManagementReportRow[] {
  const pivotName = new Map(input.pivots.map((p) => [p.id, p.name]));
  const cultureName = new Map(input.cultures.map((c) => [c.id, c.name]));
  const assignmentById = new Map(input.assignments.map((a) => [a.id, a]));
  const applied = sumAppliedByPivotDate(input.events);
  const notes = sensoryByPivotDate(input.sensory);

  const rows: ManagementReportRow[] = [];
  for (const b of input.balances) {
    const asg = assignmentById.get(b.pivot_crop_assignment_id);
    const pivotId = asg?.pivot_id ?? "";
    const wx = input.weatherByDate?.[b.date];
    const eventMm = pivotId ? applied.get(`${pivotId}|${b.date}`) : undefined;
    const irrigation = eventMm != null ? eventMm : (b.applied_depth ?? 0);
    const cc = b.field_capacity ?? null;
    const pmp = b.wilting_point ?? null;
    const cad = b.cad ?? 0;
    const afd = b.afd ?? 0;
    const arm = b.soil_storage ?? 0;
    const moisture = b.moisture_pct_cc != null && Number.isFinite(b.moisture_pct_cc)
      ? b.moisture_pct_cc
      : (cc != null && pmp != null
        ? moisturePercentOfFieldCapacity(arm, cad, cc, pmp)
        : moisturePctCcForDisplay(null, arm, cad));

    rows.push({
      date: b.date,
      pivotId,
      pivotName: pivotName.get(pivotId) ?? "—",
      parcelId: asg?.id ?? null,
      parcelName: asg?.name ?? null,
      cultureId: asg?.culture_id ?? null,
      cultureName: asg?.culture_id ? (cultureName.get(asg.culture_id) ?? null) : null,
      phase: b.phase ?? "—",
      dae: b.dae ?? null,
      etoMm: b.et0,
      etpMm: wx?.etp != null && Number.isFinite(wx.etp) ? wx.etp : null,
      etcMm: b.etc,
      kc: b.kc,
      ks: b.ks ?? null,
      kl: b.kl ?? null,
      ky: b.ky ?? null,
      rainMm: b.precipitation ?? 0,
      effectiveRainMm: b.effective_precipitation ?? 0,
      irrigationGrossMm: irrigation,
      effectiveIrrigationMm: b.effective_irrigation != null && Number.isFinite(b.effective_irrigation)
        ? b.effective_irrigation
        : irrigation,
      recommendedGrossMm: b.gross_depth ?? 0,
      fieldCapacity: cc,
      wiltingPoint: pmp,
      cadMm: cad,
      afdMm: afd,
      armMm: arm,
      safetyMoistureMm: b.safety_moisture_mm ?? safetyMoistureMm(cad, afd),
      moisturePctCc: moisture,
      safetyPctCc: safetyPctCcForDisplay(b.safety_pct_cc, cad, afd),
      pmpPctCc: pmpPctCcForDisplay(cc, pmp),
      surplusMm: b.surplus ?? 0,
      etcPotentialMm: b.etc_potential != null && Number.isFinite(b.etc_potential) ? b.etc_potential : null,
      rootDepthM: b.root_depth ?? 0,
      sensoryNote: pivotId ? (notes.get(`${pivotId}|${b.date}`) ?? null) : null,
      tmax: wx?.tmax ?? null,
      tmin: wx?.tmin ?? null,
      tmean: wx?.tmean ?? null,
      rh: wx?.rh ?? null,
      wind: wx?.wind ?? null,
      rad: wx?.rad ?? null,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.pivotName.localeCompare(b.pivotName));
}

export function managementRowFromBalance(
  r: DailyBalanceRow,
  extras: {
    sensoryNote?: number | null;
    weather?: Partial<ManagementWeather>;
    pivotId?: string;
    pivotName?: string;
    parcelId?: string | null;
    parcelName?: string | null;
    cultureId?: string | null;
    cultureName?: string | null;
  } = {},
): ManagementReportRow {
  const cad = r.cad;
  const afd = r.afd;
  const arm = r.storedWater;
  const cc = r.fieldCapacity ?? null;
  const pmp = r.wiltingPoint ?? null;
  return {
    date: r.date,
    pivotId: extras.pivotId ?? r.pivotId ?? "",
    pivotName: extras.pivotName ?? r.pivotName ?? "—",
    parcelId: extras.parcelId ?? r.parcelId ?? null,
    parcelName: extras.parcelName ?? r.parcelName ?? null,
    cultureId: extras.cultureId ?? r.cultureId ?? null,
    cultureName: extras.cultureName ?? r.cultureName ?? null,
    phase: r.phase,
    dae: r.dae ?? null,
    etoMm: r.et0,
    etpMm: extras.weather?.etp != null && Number.isFinite(extras.weather.etp) ? extras.weather.etp : null,
    etcMm: r.etc,
    kc: r.kc,
    ks: r.ks ?? null,
    kl: r.kl ?? null,
    ky: r.ky ?? null,
    rainMm: r.precipitation,
    effectiveRainMm: r.effectivePrecipitation,
    irrigationGrossMm: r.irrigationApplied,
    effectiveIrrigationMm: r.effectiveIrrigation ?? r.irrigationApplied,
    recommendedGrossMm: r.grossDepth,
    fieldCapacity: cc,
    wiltingPoint: pmp,
    cadMm: cad,
    afdMm: afd,
    armMm: arm,
    safetyMoistureMm: r.safetyMoistureMm ?? safetyMoistureMm(cad, afd),
    moisturePctCc: moisturePctCcForDisplay(r.moisturePctCc, arm, cad),
    safetyPctCc: safetyPctCcForDisplay(r.safetyPctCc, cad, afd),
    pmpPctCc: pmpPctCcForDisplay(cc, pmp),
    surplusMm: r.surplus ?? 0,
    etcPotentialMm: r.etcPotential != null && Number.isFinite(r.etcPotential) ? r.etcPotential : null,
    rootDepthM: r.rootDepth,
    sensoryNote: extras.sensoryNote ?? null,
    tmax: extras.weather?.tmax ?? null,
    tmin: extras.weather?.tmin ?? null,
    tmean: extras.weather?.tmean ?? null,
    rh: extras.weather?.rh ?? null,
    wind: extras.weather?.wind ?? null,
    rad: extras.weather?.rad ?? null,
  };
}

export function matchesManagementFilters(
  row: ManagementReportRow,
  filters: ManagementReportFilters,
): boolean {
  if (filters.periodFrom && row.date < filters.periodFrom) return false;
  if (filters.periodTo && row.date > filters.periodTo) return false;
  if (filters.pivotId && row.pivotId !== filters.pivotId) return false;
  if (filters.parcelId && row.parcelId !== filters.parcelId) return false;
  if (filters.cultureId && row.cultureId !== filters.cultureId) return false;
  return true;
}

export function filterManagementRows(
  rows: ManagementReportRow[],
  filters: ManagementReportFilters,
): ManagementReportRow[] {
  return rows.filter((row) => matchesManagementFilters(row, filters));
}

export const MANAGEMENT_CSV_COLUMNS: Array<{ key: keyof ManagementReportRow; header: string }> = [
  { key: "date", header: "Data" },
  { key: "pivotName", header: "Pivô" },
  { key: "parcelName", header: "Parcela" },
  { key: "cultureName", header: "Cultura" },
  { key: "phase", header: "Fase" },
  { key: "dae", header: "DAP" },
  { key: "etoMm", header: "ETo (mm/d)" },
  { key: "etpMm", header: "ETP (mm/d)" },
  { key: "etcMm", header: "ETc (mm/d)" },
  { key: "kc", header: "Kc" },
  { key: "ks", header: "Ks" },
  { key: "kl", header: "KL" },
  { key: "rainMm", header: "Chuva (mm)" },
  { key: "effectiveRainMm", header: "Chuva efetiva (mm)" },
  { key: "irrigationGrossMm", header: "Irrigação aplicada (mm)" },
  { key: "recommendedGrossMm", header: "Lâmina recomendada (mm)" },
  { key: "fieldCapacity", header: "CC (cm³/cm³)" },
  { key: "wiltingPoint", header: "PMP (cm³/cm³)" },
  { key: "cadMm", header: "CAD (mm)" },
  { key: "afdMm", header: "AFD (mm)" },
  { key: "armMm", header: "ARM (mm)" },
  { key: "safetyMoistureMm", header: "Umidade de segurança (mm)" },
  { key: "moisturePctCc", header: "% da CC" },
  { key: "sensoryNote", header: "Nota sensorial (1–10)" },
];

export function exportManagementCsv(rows: ManagementReportRow[]): string {
  const headers = MANAGEMENT_CSV_COLUMNS.map((c) => c.header).join(";");
  const lines = rows.map((row) =>
    MANAGEMENT_CSV_COLUMNS.map((c) => {
      const val = row[c.key];
      if (val == null) return "";
      if (typeof val === "number") return String(val).replace(".", ",");
      return String(val);
    }).join(";"),
  );
  return "\uFEFF" + [headers, ...lines].join("\n");
}

export function hasEtp(rows: ManagementReportRow[]): boolean {
  return rows.some((r) => r.etpMm != null && Number.isFinite(r.etpMm));
}

export function chartRowsForEntity(rows: ManagementReportRow[]): ManagementReportRow[] {
  if (rows.length === 0) return [];
  const pivotId = rows[0].pivotId;
  const samePivot = rows.filter((r) => r.pivotId === pivotId);
  const parcelId = samePivot[0]?.parcelId;
  if (parcelId) {
    const sameParcel = samePivot.filter((r) => r.parcelId === parcelId);
    if (sameParcel.length > 0) return sameParcel;
  }
  return samePivot;
}
