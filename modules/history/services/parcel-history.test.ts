import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_HISTORY_FILTERS,
  HISTORY_COST_PENDING_NOTE,
  filterHistoricParcels,
  summarizeClosedCycle,
  type HistoricParcelRow,
} from "./parcel-history";

function row(overrides: Partial<HistoricParcelRow> = {}): HistoricParcelRow {
  return {
    id: "soja-26",
    name: "Pivô 31 · Soja · 2026/27",
    pivot_id: "pivot-31",
    module_id: "mod-a",
    season_id: "safra-26",
    culture_id: "soy",
    planting_date: "2026-10-15",
    closed_at: "2027-02-20T12:00:00.000Z",
    status: "encerrada",
    active: false,
    ...overrides,
  };
}

describe("filtro do histórico operacional (Etapa I)", () => {
  const rows = [
    row(),
    row({
      id: "algodao-27",
      name: "Pivô 31 · Algodão · 2027",
      culture_id: "cotton",
      season_id: "safra-27",
      planting_date: "2027-12-01",
      closed_at: "2028-07-15T12:00:00.000Z",
    }),
    row({
      id: "ativa",
      status: "ativa",
      active: true,
      closed_at: null,
    }),
  ];

  it("ignora parcela ativa — só histórico", () => {
    const list = filterHistoricParcels(rows, EMPTY_HISTORY_FILTERS);
    expect(list.map((r) => r.id)).toEqual(["soja-26", "algodao-27"]);
  });

  it("filtra por safra, módulo, pivô, parcela e cultura", () => {
    expect(filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, cultureId: "cotton" }).map((r) => r.id))
      .toEqual(["algodao-27"]);
    expect(filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, seasonId: "safra-26" }).map((r) => r.id))
      .toEqual(["soja-26"]);
    expect(filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, parcelId: "soja-26" }).map((r) => r.id))
      .toEqual(["soja-26"]);
    expect(filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, pivotId: "outro" })).toEqual([]);
    expect(filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, moduleId: "mod-a" })).toHaveLength(2);
  });

  it("filtra por período (sobreposição do ciclo)", () => {
    expect(
      filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, periodFrom: "2028-01-01", periodTo: "2028-03-01" }).map((r) => r.id),
    ).toEqual(["algodao-27"]);
    expect(
      filterHistoricParcels(rows, { ...EMPTY_HISTORY_FILTERS, periodFrom: "2026-11-01", periodTo: "2027-01-31" }).map((r) => r.id),
    ).toEqual(["soja-26"]);
  });
});

describe("resumo do ciclo encerrado", () => {
  it("soma água dos eventos e não inventa custo/energia", () => {
    const summary = summarizeClosedCycle({
      events: [
        { depth_mm: 12, volume_m3: 9600 },
        { depth_mm: 8, volume_m3: 6400 },
      ],
      sensoryCount: 3,
      yieldKgHa: 4200,
    });
    expect(summary.total_water_applied_mm).toBe(20);
    expect(summary.total_volume_m3).toBe(16000);
    expect(summary.irrigation_count).toBe(2);
    expect(summary.sensory_count).toBe(3);
    expect(summary.yield_kg_ha).toBe(4200);
    expect(summary.energy_kwh).toBeNull();
    expect(summary.cost).toBeNull();
    expect(summary.cost_pending).toBe(true);
    expect(HISTORY_COST_PENDING_NOTE.toLowerCase()).toMatch(/não inventar/);
  });

  it("exibe energia/custo só se já estiverem gravados", () => {
    const summary = summarizeClosedCycle({
      events: [],
      sensoryCount: 0,
      storedEnergyKwh: 1200,
      storedCost: 850,
    });
    expect(summary.energy_kwh).toBe(1200);
    expect(summary.cost).toBe(850);
    expect(summary.cost_pending).toBe(false);
  });
});

describe("tela de histórico", () => {
  it("é área própria com filtros e sem apagar ciclo", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/historico/page.tsx"), "utf8");
    expect(src).toContain("Histórico operacional");
    expect(src).toContain("filtro_safra");
    expect(src).toContain("filtro_modulo");
    expect(src).toContain("filtro_cultura");
    expect(src).toContain("Módulo");
    expect(src).not.toContain(".delete()");
    expect(src).not.toContain("tarifa");
  });

  it("menu aponta para /historico", () => {
    const src = readFileSync(join(process.cwd(), "config/navigation.ts"), "utf8");
    expect(src).toContain('href: "/historico"');
  });

  it("encerramento grava data e snapshot; lançamentos exigem parcela ativa", () => {
    const close = readFileSync(join(process.cwd(), "app/(app)/vinculacao/page.tsx"), "utf8");
    const irr = readFileSync(join(process.cwd(), "app/(app)/lancamentos/irrigacao/page.tsx"), "utf8");
    const sen = readFileSync(join(process.cwd(), "app/(app)/lancamentos/sensorial-solo/page.tsx"), "utf8");
    expect(close).toContain("closed_at");
    expect(close).toContain("snapshotCycleWater");
    expect(close).toContain("validateParcelClose");
    expect(irr).toContain("assertParcelAcceptsOperationalLaunch");
    expect(sen).toContain("assertParcelAcceptsOperationalLaunch");
  });
});
