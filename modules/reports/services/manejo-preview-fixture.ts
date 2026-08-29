/**
 * Série fictícia só para a prévia visual do gráfico de manejo.
 * Não entra no motor nem em dado operacional da fazenda.
 */
import {
  buildManagementRows,
  type StoredBalanceForReport,
} from "./management-report";
import type { ManagementReportRow } from "./management-report";

function isoFromJan10(offset: number): string {
  const d = new Date(Date.UTC(2026, 0, 10 + offset));
  return d.toISOString().slice(0, 10);
}

function seed(overrides: Partial<StoredBalanceForReport> = {}): StoredBalanceForReport {
  return {
    date: "2026-01-10",
    pivot_crop_assignment_id: "p22a",
    et0: 5,
    kc: 1.05,
    etc: 5.25,
    precipitation: 0,
    effective_precipitation: 0,
    applied_depth: 0,
    cad: 66.61,
    afd: 33.31,
    soil_storage: 50,
    gross_depth: 12,
    ...overrides,
  };
}

export const MANEJO_PREVIEW_TITLE = "Pivô 22 - Algodão 25/26";

export function buildManejoPreviewRows(days = 80): ManagementReportRow[] {
  const cad = 66.61;
  const balances = Array.from({ length: days }, (_, i) => {
    const phase = i < 18 ? "Inicial" : i < 38 ? "Desenvolvimento" : i < 62 ? "Floração" : "Final";
    const p = phase === "Inicial" ? 0.35 : phase === "Desenvolvimento" ? 0.6 : phase === "Floração" ? 0.4 : 0.55;
    const afd = cad * p;
    const irrig = i % 5 === 2 ? 12 : 0;
    const rain = i === 22 ? 48 : i === 41 ? 22 : i === 63 ? 16 : 0;
    const etc = 3.1 + (i % 9) * 0.18;
    let arm = 0.9 * cad - (i % 5) * 5.2 + irrig * 0.9 + Math.min(rain, 14);
    arm = Math.max(10, Math.min(arm, cad));
    return seed({
      date: isoFromJan10(i),
      phase,
      dae: i + 1,
      cad,
      afd,
      soil_storage: arm,
      applied_depth: irrig,
      effective_irrigation: irrig * 0.91,
      precipitation: rain,
      etc,
      etc_potential: etc / 0.932,
      surplus: i === 22 ? 8.4 : 0,
      safety_moisture_mm: cad - afd,
    });
  });

  return buildManagementRows({
    balances,
    assignments: [{ id: "p22a", pivot_id: "p22", name: "Pivô 22", culture_id: "alg" }],
    pivots: [{ id: "p22", name: "Pivô 22" }],
    cultures: [{ id: "alg", name: "Algodão 25/26" }],
    events: [],
    sensory: [
      { reading_date: isoFromJan10(11), pivot_id: "p22", parcel_id: "p22a", note: 7 },
      { reading_date: isoFromJan10(44), pivot_id: "p22", parcel_id: "p22a", note: 5 },
    ],
  });
}
