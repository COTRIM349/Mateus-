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
  color: string;
  kind: ManejoKind;
  axis: ManejoAxis;
  unit: string;
  norm?: [number, number];
}

export const MANEJO_GROUPS: { cat: ManejoGroup; items: ManejoSeriesDef[] }[] = [
  {
    cat: "Irrigação",
    items: [
      { k: "irrig", label: "Irrigação realizada", color: "#14b8c9", kind: "bar", axis: "mm", unit: MANAGEMENT_UNITS.irrigation },
      { k: "irrigRec", label: "Irrigação recomendada", color: "#3b82f6", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.recommendedDepth },
      { k: "irrigAcum", label: "Lâmina acumulada", color: "#0e7490", kind: "dash", axis: "mm", unit: MANAGEMENT_UNITS.appliedDepth },
    ],
  },
  {
    cat: "Solo",
    items: [
      { k: "umidade", label: "Umidade (% da CC)", color: "#8a5a2b", kind: "line", axis: "pct", unit: MANAGEMENT_UNITS.moisturePctCc },
      { k: "cc", label: "CC — Capacidade de Campo", color: "#2f6bff", kind: "line", axis: "pct", unit: MANAGEMENT_UNITS.moisturePctCc },
      { k: "pmp", label: "PMP — Ponto de Murcha", color: "#111827", kind: "line", axis: "pct", unit: MANAGEMENT_UNITS.moisturePctCc },
      { k: "seg", label: "Umidade de segurança", color: "#c0272d", kind: "line", axis: "pct", unit: MANAGEMENT_UNITS.moisturePctCc },
      { k: "cad", label: "CAD — Água Disponível", color: "#a16207", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.cad },
      { k: "afd", label: "CRA / AFD — Limite de manejo", color: "#ca8a04", kind: "dash", axis: "mm", unit: MANAGEMENT_UNITS.afd },
      { k: "arm", label: "ARM — Água armazenada", color: "#eab308", kind: "line", axis: "mm", unit: MANAGEMENT_UNITS.arm },
      { k: "sensorial", label: "Nota sensorial de campo", color: "#a855f7", kind: "marker", axis: "marker", unit: MANAGEMENT_UNITS.sensoryNote },
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
      { k: "chuva", label: "Chuva", color: "#2f6bff", kind: "bar", axis: "mm", unit: MANAGEMENT_UNITS.rain },
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
  height: 560,
} as const;

export const MANEJO_DEFAULT_ON: ManejoSeriesKey[] = [
  "umidade",
  "cc",
  "seg",
  "arm",
  "irrig",
  "chuva",
  "etc",
  "sensorial",
  "fase",
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
    case "umidade": return row.moisturePctCc;
    case "cc": return 100;
    case "pmp": return row.pmpPctCc;
    case "seg": return row.safetyPctCc;
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
  if (key === "cc") return rows.length > 0;
  if (key === "fase") return rows.some((r, i) => i > 0 && r.phase !== rows[i - 1].phase);
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
  if (key === "kc" || key === "p" || key === "ks" || key === "kl" || key === "ky") return v.toFixed(2);
  if (def.axis === "pct") return `${v.toFixed(0)}% da CC`;
  if (def.axis === "mm") return `${v.toFixed(1)} mm`;
  if (key === "dap") return `${v.toFixed(0)} d`;
  if (key === "rootdepth") return `${v.toFixed(2)} m`;
  return `${v.toFixed(1)}${def.unit ? ` ${def.unit}` : ""}`;
}
