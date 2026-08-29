/**
 * Catálogo do gráfico central de manejo.
 *
 * Mantém a leitura operacional consagrada no Scheduling: séries organizadas em
 * Irrigação, Solo, Cultura e Clima, com seleção individual. A interface não
 * inventa dados: apenas deriva indicadores quando as entradas do motor existem.
 */

import {
  MANAGEMENT_UNITS,
  type ManagementReportRow,
} from "./management-report";

export type ManejoAxis = "pct" | "mm" | "norm" | "marker";
export type ManejoKind = "line" | "dash" | "bar" | "marker";
export type ManejoGroup = "Irrigação" | "Solo" | "Cultura" | "Clima";

export type ManejoSeriesKey =
  | "irrig"
  | "irrigRec"
  | "irrigAcum"
  | "umidade"
  | "cc"
  | "pmp"
  | "seg"
  | "cad"
  | "afd"
  | "arm"
  | "sensorial"
  | "excesso"
  | "dap"
  | "kc"
  | "p"
  | "ks"
  | "kl"
  | "ky"
  | "rootdepth"
  | "fase"
  | "chuva"
  | "etc"
  | "eto"
  | "etp"
  | "tmax"
  | "tmean"
  | "tmin"
  | "rh"
  | "wind"
  | "rad";

export interface ManejoSeriesDef {
  k: ManejoSeriesKey;
  label: string;
  legend?: string;
  color: string;
  kind: ManejoKind;
  axis: ManejoAxis;
  unit: string;
  /** Linha em degrau (FAO-56: umidade de segurança muda com o p da fase). */
  stepped?: boolean;
  norm?: [number, number];
}

/** Paleta do gráfico de manejo (eixo %CC disponível: PM = 0, CC = 100). */
export const MANEJO_COLORS = {
  cc: "#2f6bff",
  seg: "#c0272d",
  umidade: "#8a5a2b",
  pmp: "#111827",
  irrig: "#5ec8d8",
  chuva: "#1e4ea1",
  flag: "#f59e0b",
  excesso: "#dc2626",
} as const;

export const MANEJO_VIEW_OPTIONS = [
  { value: "umidade_cc", label: "Umidade do Solo (%CC)" },
] as const;

export const MANEJO_PRESET_OPTIONS = [
  { value: "padrao", label: "Padrão" },
  { value: "personalizado", label: "Personalizado" },
] as const;

export const MANEJO_GROUPS: { cat: ManejoGroup; items: ManejoSeriesDef[] }[] = [
  {
    cat: "Irrigação",
    items: [
      { k: "irrig", label: "Irrigação", legend: "Irrigação (mm)", color: MANEJO_COLORS.irrig, kind: "bar", axis: "mm", unit: MANAGEMENT_UNITS.irrigation },
      { k: "irrigRec", label: "Irrigação recomendada", color: "#3b82f6", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.recommendedDepth },
      { k: "irrigAcum", label: "Lâmina acumulada", color: "#0e7490", kind: "dash", axis: "mm", unit: MANAGEMENT_UNITS.appliedDepth },
      { k: "excesso", label: "Justificativa de Excesso", legend: "Justificativa de Excesso", color: MANEJO_COLORS.excesso, kind: "marker", axis: "marker", unit: "mm" },
    ],
  },
  {
    cat: "Solo",
    items: [
      { k: "umidade", label: "Umidade", legend: "Umidade (%CC)", color: MANEJO_COLORS.umidade, kind: "line", axis: "pct", unit: "%CC" },
      { k: "cc", label: "CC", legend: "CC (%CC)", color: MANEJO_COLORS.cc, kind: "line", axis: "pct", unit: "%CC" },
      { k: "pmp", label: "PM", legend: "PM (%CC)", color: MANEJO_COLORS.pmp, kind: "line", axis: "pct", unit: "%CC" },
      { k: "seg", label: "Umid Segurança", legend: "Umid Segurança (%CC)", color: MANEJO_COLORS.seg, kind: "line", axis: "pct", unit: "%CC", stepped: true },
      { k: "cad", label: "CTA / CAD — Água Disponível", color: "#a16207", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.cad },
      { k: "afd", label: "CRA / AFD — Limite de manejo", color: "#ca8a04", kind: "dash", axis: "mm", unit: MANAGEMENT_UNITS.afd },
      { k: "arm", label: "ARM — Água armazenada", color: "#eab308", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.arm },
      { k: "sensorial", label: "Flags / nota sensorial", legend: "Flags", color: MANEJO_COLORS.flag, kind: "marker", axis: "marker", unit: MANAGEMENT_UNITS.sensoryNote },
    ],
  },
  {
    cat: "Cultura",
    items: [
      { k: "dap", label: "Dias após plantio (DAP)", color: "#16a34a", kind: "line", axis: "norm", unit: MANAGEMENT_UNITS.dae, norm: [0, 200] },
      { k: "kc", label: "Kc — Coeficiente da cultura", color: "#22c55e", kind: "dash", axis: "norm", unit: MANAGEMENT_UNITS.kc, norm: [0, 1.5] },
      { k: "p", label: "Fator de disponibilidade hídrica (p)", color: "#10b981", kind: "dash", axis: "norm", unit: "adimensional", norm: [0, 1] },
      { k: "ks", label: "Ks — Coeficiente de estresse", color: "#15803d", kind: "line", axis: "norm", unit: MANAGEMENT_UNITS.ks, norm: [0, 1] },
      { k: "kl", label: "KL — Coeficiente de localização", color: "#4ade80", kind: "line", axis: "norm", unit: MANAGEMENT_UNITS.kl, norm: [0, 1.2] },
      { k: "ky", label: "Ky — Sensibilidade produtiva", color: "#65a30d", kind: "dash", axis: "norm", unit: MANAGEMENT_UNITS.ky, norm: [0, 1.5] },
      { k: "rootdepth", label: "Profundidade da raiz (Zr)", color: "#5eaa97", kind: "line", axis: "norm", unit: MANAGEMENT_UNITS.rootDepth, norm: [0, 1.5] },
      { k: "fase", label: "Fases fenológicas", color: "#84cc16", kind: "marker", axis: "marker", unit: "fase" },
    ],
  },
  {
    cat: "Clima",
    items: [
      { k: "chuva", label: "Chuva", legend: "Chuva (mm)", color: MANEJO_COLORS.chuva, kind: "bar", axis: "mm", unit: MANAGEMENT_UNITS.rain },
      { k: "etc", label: "ETc", color: "#22c55e", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.etc },
      { k: "eto", label: "ETo", color: "#166534", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.eto },
      { k: "etp", label: "ETP", color: "#4d7c0f", kind: "dash", axis: "mm", unit: MANAGEMENT_UNITS.etp },
      { k: "tmax", label: "Temperatura máxima", color: "#ef4444", kind: "line", axis: "norm", unit: "°C", norm: [0, 45] },
      { k: "tmean", label: "Temperatura média", color: "#eab308", kind: "line", axis: "norm", unit: "°C", norm: [0, 45] },
      { k: "tmin", label: "Temperatura mínima", color: "#8b5cf6", kind: "line", axis: "norm", unit: "°C", norm: [0, 45] },
      { k: "rh", label: "Umidade relativa", color: "#1e40af", kind: "line", axis: "norm", unit: "%", norm: [0, 100] },
      { k: "wind", label: "Velocidade do vento", color: "#7dd3fc", kind: "line", axis: "norm", unit: "m/s", norm: [0, 15] },
      { k: "rad", label: "Radiação", color: "#f59e0b", kind: "line", axis: "norm", unit: "MJ/m²", norm: [0, 35] },
    ],
  },
];

export const MANEJO_ALL: ManejoSeriesDef[] = MANEJO_GROUPS.flatMap((g) => g.items);

export const MANEJO_CHART_LAYOUT = {
  width: 1280,
  height: 580,
  padL: 56,
  padR: 52,
  padT: 22,
  padB: 92,
  pctMax: 125,
  mmFloor: 75,
  mmStep: 15,
} as const;

/** Padrão visual: umidade, CC, segurança, PM, irrigação e chuva (eixo %CC disponível). */
export const MANEJO_DEFAULT_ON: ManejoSeriesKey[] = [
  "umidade",
  "cc",
  "seg",
  "pmp",
  "irrig",
  "chuva",
  "sensorial",
  "excesso",
];

export function phaseRanges(rows: Array<{ phase: string }>): Array<{ phase: string; start: number; end: number }> {
  const out: Array<{ phase: string; start: number; end: number }> = [];
  for (let i = 0; i < rows.length; i += 1) {
    const last = out[out.length - 1];
    if (!last || last.phase !== rows[i].phase) out.push({ phase: rows[i].phase, start: i, end: i });
    else last.end = i;
  }
  return out;
}

export function initialManejoVisibility(): Record<ManejoSeriesKey, boolean> {
  const on = new Set<ManejoSeriesKey>(MANEJO_DEFAULT_ON);
  return Object.fromEntries(MANEJO_ALL.map((s) => [s.k, on.has(s.k)])) as Record<ManejoSeriesKey, boolean>;
}

export function isDefaultManejoSubset(): boolean {
  return MANEJO_DEFAULT_ON.length < MANEJO_ALL.length;
}

export function visibilityMatchesDefault(visible: Record<ManejoSeriesKey, boolean>): boolean {
  const def = initialManejoVisibility();
  return MANEJO_ALL.every((s) => Boolean(visible[s.k]) === def[s.k]);
}

export function legendLabel(s: ManejoSeriesDef): string {
  return s.legend ?? s.label;
}

/** Água disponível no eixo do gráfico: PM = 0%CC, CC = 100%CC. */
export function availableWaterPct(armMm: number, cadMm: number): number {
  if (!(cadMm > 0) || !Number.isFinite(armMm)) return 0;
  return Math.max(0, Math.min((armMm / cadMm) * 100, 125));
}

export function safetyAvailableWaterPct(safetyMoistureMm: number, cadMm: number): number {
  if (!(cadMm > 0) || !Number.isFinite(safetyMoistureMm)) return 0;
  return Math.max(0, Math.min((safetyMoistureMm / cadMm) * 100, 100));
}

export function mmAxisMax(values: number[], floor = MANEJO_CHART_LAYOUT.mmFloor, step = MANEJO_CHART_LAYOUT.mmStep): number {
  const finite = values.filter((v) => Number.isFinite(v));
  const dataMax = finite.length ? Math.max(0, ...finite) : 0;
  if (dataMax <= floor) return floor;
  return Math.ceil(dataMax / step) * step;
}

export function mmAxisTicks(max: number, step = MANEJO_CHART_LAYOUT.mmStep): number[] {
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function stepAfterPath(pts: ReadonlyArray<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i += 1) {
    d += ` H ${pts[i].x} V ${pts[i].y}`;
  }
  return d;
}

export function formatManejoDate(iso: string): string {
  if (iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function formatPtNumber(value: number, digits = 2): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export interface ManejoKpis {
  daysManaged: number;
  daysPlanted: number | null;
  irrigationMm: number;
  rainMm: number;
  effectiveIrrigationMm: number;
  effectiveIrrigationPct: number | null;
  etpMm: number;
  etcMm: number;
  stressIndexPct: number | null;
}

/**
 * Totais do resultado de manejo. ETp = soma da ETc potencial (sem Ks);
 * índice de stress = (1 − ETc/ETp) × 100.
 */
export function summarizeManejoKpis(rows: ManagementReportRow[]): ManejoKpis {
  const daysManaged = rows.length;
  const lastDae = [...rows].reverse().find((r) => r.dae != null && Number.isFinite(r.dae))?.dae ?? null;
  const irrigationMm = rows.reduce((s, r) => s + Math.max(r.irrigationGrossMm, 0), 0);
  const rainMm = rows.reduce((s, r) => s + Math.max(r.rainMm, 0), 0);
  const effectiveIrrigationMm = rows.reduce((s, r) => s + Math.max(r.effectiveIrrigationMm, 0), 0);
  const etcMm = rows.reduce((s, r) => s + Math.max(r.etcMm, 0), 0);
  const etpMm = rows.reduce((s, r) => s + Math.max(r.etcPotentialMm ?? r.etcMm, 0), 0);
  return {
    daysManaged,
    daysPlanted: lastDae,
    irrigationMm,
    rainMm,
    effectiveIrrigationMm,
    effectiveIrrigationPct: irrigationMm > 0 ? (effectiveIrrigationMm / irrigationMm) * 100 : null,
    etpMm,
    etcMm,
    stressIndexPct: etpMm > 0 ? (1 - etcMm / etpMm) * 100 : null,
  };
}

export function cumulativeIrrigationMm(rows: ManagementReportRow[]): number[] {
  let acc = 0;
  return rows.map((r) => {
    acc += Math.max(r.irrigationGrossMm, 0);
    return acc;
  });
}

export function seriesValue(
  key: ManejoSeriesKey,
  row: ManagementReportRow,
  extras: { cumulativeIrrigation?: number; phaseChanged?: boolean } = {},
): number | null {
  switch (key) {
    case "irrig": return row.irrigationGrossMm;
    case "irrigRec": return row.recommendedGrossMm;
    case "irrigAcum": return extras.cumulativeIrrigation ?? row.irrigationGrossMm;
    case "umidade": return availableWaterPct(row.armMm, row.cadMm);
    case "cc": return 100;
    case "pmp": return 0;
    case "seg": return safetyAvailableWaterPct(row.safetyMoistureMm, row.cadMm);
    case "cad": return row.cadMm;
    case "afd": return row.afdMm;
    case "arm": return row.armMm;
    case "sensorial": return row.sensoryNote;
    case "dap": return row.dae;
    case "kc": return row.kc;
    case "p": return row.cadMm > 0 ? row.afdMm / row.cadMm : null;
    case "ks": return row.ks;
    case "kl": return row.kl;
    case "ky": return row.ky;
    case "rootdepth": return row.rootDepthM;
    case "fase": return extras.phaseChanged ? 1 : null;
    case "excesso": return row.surplusMm > 0 ? row.surplusMm : null;
    case "chuva": return row.rainMm;
    case "etc": return row.etcMm;
    case "eto": return row.etoMm;
    case "etp": return row.etpMm;
    case "tmax": return row.tmax;
    case "tmean": return row.tmean;
    case "tmin": return row.tmin;
    case "rh": return row.rh;
    case "wind": return row.wind;
    case "rad": return row.rad;
  }
}

export function seriesHasData(key: ManejoSeriesKey, rows: ManagementReportRow[]): boolean {
  if (key === "cc" || key === "pmp") return rows.length > 0;
  if (key === "fase") return rows.some((r, i) => i > 0 && r.phase !== rows[i - 1].phase);
  if (key === "excesso") return rows.some((r) => r.surplusMm > 0);
  const cum = key === "irrigAcum" ? cumulativeIrrigationMm(rows) : [];
  return rows.some((r, i) => {
    const v = seriesValue(key, r, {
      cumulativeIrrigation: cum[i],
      phaseChanged: i > 0 && r.phase !== rows[i - 1].phase,
    });
    return v != null && Number.isFinite(v);
  });
}

export function formatSeriesValue(key: ManejoSeriesKey, row: ManagementReportRow, extras: { cumulativeIrrigation?: number } = {}): string {
  const def = MANEJO_ALL.find((s) => s.k === key)!;
  const v = seriesValue(key, row, extras);
  if (v == null || !Number.isFinite(v)) return "—";
  if (key === "sensorial") return `nota ${v}`;
  if (key === "excesso") return `${formatPtNumber(v, 1)} mm`;
  if (key === "kc" || key === "p" || key === "ks" || key === "kl" || key === "ky") return v.toFixed(2);
  if (def.axis === "pct") return `${formatPtNumber(v, 1)} %CC`;
  if (def.axis === "mm") return `${formatPtNumber(v, 1)} mm`;
  if (key === "dap") return `${v.toFixed(0)} d`;
  if (key === "rootdepth") return `${v.toFixed(2)} m`;
  return `${v.toFixed(1)}${def.unit ? ` ${def.unit}` : ""}`;
}
