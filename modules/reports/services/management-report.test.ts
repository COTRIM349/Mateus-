import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { moisturePercentOfFieldCapacity } from "@/modules/water-balance/services/soil-water-balance";
import {
  ETP_PENDING_NOTE,
  MANAGEMENT_UNITS,
  SENSORY_NOT_CONVERTED_TO_PCT_CC,
  buildManagementRows,
  exportManagementCsv,
  filterManagementRows,
  type StoredBalanceForReport,
} from "./management-report";
import {
  MANEJO_DEFAULT_ON,
  MANEJO_GROUPS,
  initialManejoVisibility,
  isDefaultManejoSubset,
  seriesValue,
} from "./manejo-chart";
import { groupByParcel, groupByPeriod, summarizeOperational } from "./operational-reports";
import { REPORT_TYPE_CONFIG, calculateReportKPIs } from "./reports.service";

function balance(overrides: Partial<StoredBalanceForReport> = {}): StoredBalanceForReport {
  return {
    date: "2026-08-20",
    pivot_crop_assignment_id: "parcela-soja",
    et0: 5,
    kc: 1.05,
    etc: 5.25,
    precipitation: 12,
    effective_precipitation: 8,
    applied_depth: 0,
    cad: 54,
    afd: 27,
    soil_storage: 40,
    gross_depth: 15,
    ks: 0.9,
    kl: 1,
    ky: 0.85,
    field_capacity: 0.3,
    wilting_point: 0.12,
    phase: "Floração",
    dae: 45,
    root_depth: 0.4,
    ...overrides,
  };
}

describe("relatório de manejo (Etapa K)", () => {
  const rows = buildManagementRows({
    balances: [
      balance(),
      balance({ date: "2026-08-21", applied_depth: 10, soil_storage: 35, precipitation: 0, effective_precipitation: 0 }),
    ],
    assignments: [{ id: "parcela-soja", pivot_id: "p31", name: "Pivô 31 · Soja", culture_id: "soy" }],
    pivots: [{ id: "p31", name: "Pivô 31" }],
    cultures: [{ id: "soy", name: "Soja" }],
    events: [
      { started_at: "2026-08-21T06:00:00", depth_mm: 12, pivot_id: "p31", parcel_id: "parcela-soja", volume_m3: 9600, energy_kwh: 100, cost: 70 },
    ],
    sensory: [
      { reading_date: "2026-08-20", pivot_id: "p31", parcel_id: "parcela-soja", note: 7 },
    ],
  });

  it("traz os campos do relatório de manejo com unidades explícitas", () => {
    const day = rows[0];
    expect(day.etoMm).toBe(5);
    expect(day.etcMm).toBe(5.25);
    expect(day.kc).toBe(1.05);
    expect(day.ks).toBe(0.9);
    expect(day.kl).toBe(1);
    expect(day.rainMm).toBe(12);
    expect(day.effectiveRainMm).toBe(8);
    expect(day.cadMm).toBe(54);
    expect(day.afdMm).toBe(27);
    expect(day.armMm).toBe(40);
    expect(day.safetyMoistureMm).toBe(27);
    expect(day.fieldCapacity).toBe(0.3);
    expect(day.wiltingPoint).toBe(0.12);
    expect(day.recommendedGrossMm).toBe(15);
    expect(MANAGEMENT_UNITS.arm).toBe("mm");
    expect(MANAGEMENT_UNITS.moisturePctCc).toContain("% da CC");
    expect(MANAGEMENT_UNITS.cc).toContain("cm³");
  });

  it("ETP fica nula se o dado climático não existir — não copia ETo", () => {
    expect(rows[0].etpMm).toBeNull();
    expect(rows[0].etpMm).not.toBe(rows[0].etoMm);
    expect(ETP_PENDING_NOTE.toLowerCase()).toMatch(/não inventar/);
  });

  it("usa a lâmina do evento real quando houver irrigação no dia", () => {
    expect(rows[1].irrigationGrossMm).toBe(12);
    expect(rows[1].irrigationGrossMm).not.toBe(10);
  });

  it("nota sensorial 7 permanece nota 7 e não vira 70% da CC", () => {
    expect(SENSORY_NOT_CONVERTED_TO_PCT_CC).toBe(true);
    expect(rows[0].sensoryNote).toBe(7);
    expect(rows[0].sensoryNote).not.toBe(rows[0].moisturePctCc);
    expect(seriesValue("sensorial", rows[0])).toBe(7);
    expect(seriesValue("sensorial", rows[0])).not.toBe(70);
    const pctCc = moisturePercentOfFieldCapacity(40, 54, 0.3, 0.12);
    expect(rows[0].moisturePctCc).toBe(pctCc);
    expect(pctCc).not.toBe(7);
    expect(pctCc).not.toBe(rows[0].sensoryNote! * 10);
  });

  it("não trata ARM/CAD como % da CC", () => {
    expect(rows[0].armMm).toBe(40);
    expect(rows[0].cadMm).toBe(54);
    expect(rows[0].moisturePctCc).not.toBe(50);
    expect(rows[0].moisturePctCc).not.toBe(7);
    expect(MANAGEMENT_UNITS.arm).not.toContain("%");
  });

  it("filtra por período, pivô, parcela e cultura", () => {
    expect(filterManagementRows(rows, {
      periodFrom: "2026-08-21", periodTo: "2026-08-21", pivotId: "", parcelId: "", cultureId: "",
    })).toHaveLength(1);
    expect(filterManagementRows(rows, {
      periodFrom: "", periodTo: "", pivotId: "outro", parcelId: "", cultureId: "",
    })).toHaveLength(0);
    expect(filterManagementRows(rows, {
      periodFrom: "", periodTo: "", pivotId: "", parcelId: "parcela-soja", cultureId: "soy",
    })).toHaveLength(2);
  });

  it("CSV inclui ETo, ETc, Kc, Ks, KL, ARM e sensorial", () => {
    const csv = exportManagementCsv(rows);
    expect(csv).toContain("ETo");
    expect(csv).toContain("ETc");
    expect(csv).toContain("Kc");
    expect(csv).toContain("Ks");
    expect(csv).toContain("KL");
    expect(csv).toContain("ARM (mm)");
    expect(csv).toContain("Nota sensorial");
    expect(csv).toContain("Parcela");
  });
});

describe("gráfico central de manejo", () => {
  it("tem os quatro grupos e não liga todas as séries por padrão", () => {
    expect(MANEJO_GROUPS.map((g) => g.cat)).toEqual(["Irrigação", "Solo", "Cultura", "Clima"]);
    expect(isDefaultManejoSubset()).toBe(true);
    expect(MANEJO_DEFAULT_ON).toEqual(["umidade", "arm", "irrig", "chuva", "etc", "sensorial"]);
    const vis = initialManejoVisibility();
    const on = Object.values(vis).filter(Boolean).length;
    expect(on).toBe(MANEJO_DEFAULT_ON.length);
    expect(on).toBeLessThan(Object.keys(vis).length);
    expect(vis.tmax).toBe(false);
    expect(vis.kc).toBe(false);
  });
});

describe("relatórios operacionais", () => {
  it("agrupa por parcela e não inventa energia/custo", () => {
    const rows = buildManagementRows({
      balances: [balance()],
      assignments: [{ id: "parcela-soja", pivot_id: "p31", name: "Pivô 31 · Soja", culture_id: "soy" }],
      pivots: [{ id: "p31", name: "Pivô 31" }],
      cultures: [{ id: "soy", name: "Soja" }],
      events: [{ started_at: "2026-08-20T08:00:00", depth_mm: 10, pivot_id: "p31", parcel_id: "parcela-soja", volume_m3: 8000 }],
      sensory: [],
    });
    const groups = groupByParcel(rows, [{ started_at: "2026-08-20T08:00:00", depth_mm: 10, pivot_id: "p31", parcel_id: "parcela-soja", volume_m3: 8000 }]);
    expect(groups[0]?.key).toBe("parcela-soja");
    expect(groups[0]?.energyKwh).toBeNull();
    expect(groups[0]?.cost).toBeNull();
    const totals = summarizeOperational(rows, []);
    expect(totals.avgArmMm).toBe(40);
    expect(totals.energyKwh).toBeNull();
  });

  it("diário / semanal / mensal usam o mesmo recorte operacional", () => {
    const rows = buildManagementRows({
      balances: [balance(), balance({ date: "2026-08-27" })],
      assignments: [{ id: "parcela-soja", pivot_id: "p31", name: "Pivô 31 · Soja", culture_id: "soy" }],
      pivots: [{ id: "p31", name: "Pivô 31" }],
      cultures: [{ id: "soy", name: "Soja" }],
      events: [],
      sensory: [],
    });
    expect(groupByPeriod(rows, [], "day")).toHaveLength(2);
    expect(groupByPeriod(rows, [], "week").length).toBeGreaterThanOrEqual(1);
    expect(groupByPeriod(rows, [], "month")[0]?.key).toBe("2026-08");
  });
});

describe("tipos de relatório", () => {
  it("remove o executivo e inclui manejo e por parcela", () => {
    expect(Object.keys(REPORT_TYPE_CONFIG)).toEqual([
      "manejo", "diario", "semanal", "mensal", "por_pivo", "por_parcela", "por_cultura", "energetico", "financeiro",
    ]);
    expect(REPORT_TYPE_CONFIG).not.toHaveProperty("executivo");
  });

  it("KPI não inventa produtividade nem trata ARM como % da CAD", () => {
    const kpis = calculateReportKPIs([
      {
        date: "2026-08-20",
        phase: "F",
        et0: 5, kc: 1, etc: 5,
        precipitation: 0, effectivePrecipitation: 0, irrigationApplied: 10,
        rootDepth: 0.4, cad: 54, afd: 27, storedWater: 27, depletionFactor: 0.5,
        deficit: 27, surplus: 0, netDepth: 10, grossDepth: 12, volumeNeeded: 1000,
        irrigationTime: 2, waterStatus: "atencao", moisturePctCc: 70,
      },
    ], [], 80);
    expect(kpis).not.toHaveProperty("estimatedYield");
    expect(kpis.avgArmMm).toBe(27);
    expect(kpis.avgMoisturePctCc).toBe(70);
    expect(kpis.avgArmMm).not.toBe(50);
    expect(kpis.energyEfficiency).toBeNull();
    expect(kpis.costPerHa).toBeNull();
  });
});

describe("telas de relatórios e gráfico", () => {
  it("página prioriza manejo, parcela e CSV, sem executivo", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/relatorios/page.tsx"), "utf8");
    expect(src).toContain('useState<ReportType>("manejo")');
    expect(src).toContain("filtro_parcela");
    expect(src).toContain("Exportar CSV");
    expect(src).toContain("Gráfico de manejo");
    expect(src).toContain("Sensorial");
    expect(src).toContain("nota 1–10");
    expect(src).toContain("ARM mm");
    expect(src).not.toContain("Prod. estimada");
    expect(src).not.toContain("estimatedYield");
    expect(src).not.toContain('case "executivo"');
    expect(src).not.toContain("energy_consumption");
  });

  it("balanço reusa o gráfico central com o padrão reduzido", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/balanco-hidrico/page.tsx"), "utf8");
    expect(src).toContain("ManejoSeriesPicker");
    expect(src).toContain("initialManejoVisibility");
    expect(src).toContain("managementRowFromBalance");
    expect(src).not.toContain("justexc");
  });
});
