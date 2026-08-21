import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CV_TO_KW } from "@/constants/agronomic";
import {
  COST_FORMULA,
  COST_PER_MM_HA_FORMULA,
  ENERGY_FORMULA,
  MISSING_TARIFF,
  aggregatePricedEvents,
  deriveEventCost,
  deriveEventEnergy,
  eventCostIndicators,
  pickTariffForDate,
  priceIrrigationEvent,
  snapshotCycleEnergyCost,
  type PricedEventRow,
} from "./event-cost";

const tariff = {
  ratePeak: 2.1,
  rateOffPeak: 0.7,
  peakStart: 18,
  peakEnd: 21,
};

describe("energia do evento (Etapa J)", () => {
  it("E = (Pot CV × 0,7355 / η) × h", () => {
    const e = deriveEventEnergy({
      operatingHours: 10,
      volumeM3: 4000,
      pumpPowerCv: 100,
      motorEfficiency: 0.9,
    });
    expect(e.source).toBe("pump_power");
    expect(e.energyKwh).toBe(roundish((100 * CV_TO_KW / 0.9) * 10));
    expect(ENERGY_FORMULA).toContain("0,7355");
  });

  it("prefere consumo específico kWh/m³ × volume", () => {
    const e = deriveEventEnergy({
      operatingHours: 10,
      volumeM3: 4000,
      pumpPowerCv: 100,
      motorEfficiency: 0.9,
      specificConsumptionKwhM3: 0.25,
    });
    expect(e.source).toBe("specific_consumption");
    expect(e.energyKwh).toBe(1000);
  });

  it("sem potência nem específico, energia fica nula", () => {
    const e = deriveEventEnergy({ operatingHours: 10, volumeM3: 4000 });
    expect(e.energyKwh).toBeNull();
    expect(e.pendingReason).toMatch(/energia/);
  });
});

describe("custo do evento", () => {
  it("C = E × tarifa, sem inventar tarifa", () => {
    const withTariff = deriveEventCost({
      energyKwh: 100,
      startedAt: "2026-08-20T08:00:00",
      operatingHours: 2,
      tariff,
    });
    expect(withTariff.cost).toBe(70);
    expect(withTariff.offPeakKwh).toBe(100);
    expect(COST_FORMULA).toContain("kWh");

    const none = deriveEventCost({
      energyKwh: 100,
      startedAt: "2026-08-20T08:00:00",
      operatingHours: 2,
      tariff: null,
      pivotEnergyCostReaisPerKwh: null,
    });
    expect(none.cost).toBeNull();
    expect(none.pendingReason).toBe(MISSING_TARIFF);
  });

  it("usa R$/kWh da ficha quando não há tarifa da fazenda", () => {
    const priced = deriveEventCost({
      energyKwh: 50,
      startedAt: "2026-08-20T08:00:00",
      operatingHours: 2,
      tariff: null,
      pivotEnergyCostReaisPerKwh: 0.8,
    });
    expect(priced.cost).toBe(40);
    expect(priced.tariffRate).toBe(0.8);
  });

  it("rateia ponta / fora de ponta no horário do evento", () => {
    const priced = deriveEventCost({
      energyKwh: 100,
      startedAt: "2026-08-20T17:00:00",
      operatingHours: 2,
      tariff,
    });
    expect(priced.peakKwh).toBe(50);
    expect(priced.offPeakKwh).toBe(50);
    expect(priced.cost).toBe(roundish(50 * 2.1 + 50 * 0.7));
  });
});

describe("indicadores", () => {
  it("R$/evento, R$/m³, R$/mm/ha e R$/ha", () => {
    const ind = eventCostIndicators({ cost: 160, volumeM3: 8000, depthMm: 10, areaHa: 80 });
    expect(ind.costPerEvent).toBe(160);
    expect(ind.costPerM3).toBe(0.02);
    expect(ind.costPerHa).toBe(2);
    expect(ind.costPerMmHa).toBe(0.2);
    expect(COST_PER_MM_HA_FORMULA).toContain("mm");
  });
});

describe("priceIrrigationEvent", () => {
  it("fecha a cadeia volume → horas → energia → tarifa → custo", () => {
    const priced = priceIrrigationEvent({
      operatingHours: 10,
      volumeM3: 4000,
      depthMm: 5,
      areaHa: 80,
      pumpPowerCv: 100,
      motorEfficiency: 0.9,
      startedAt: "2026-08-20T08:00:00",
      tariff,
    });
    expect(priced.energy_kwh).toBeGreaterThan(0);
    expect(priced.cost).toBeGreaterThan(0);
    expect(priced.indicators.costPerEvent).toBe(priced.cost);
    expect(priced.pendingReason).toBeNull();
  });
});

describe("pickTariffForDate", () => {
  it("escolhe a tarifa vigente mais recente", () => {
    const picked = pickTariffForDate(
      [
        { id: "old", valid_from: "2025-01-01", valid_to: "2025-12-31", rate_peak: 1, rate_off_peak: 0.4, peak_start: 18, peak_end: 21 },
        { id: "now", valid_from: "2026-01-01", valid_to: null, rate_peak: 2, rate_off_peak: 0.7, peak_start: 18, peak_end: 21 },
      ],
      "2026-08-20",
    );
    expect(picked?.id).toBe("now");
    expect(pickTariffForDate([], "2026-08-20")).toBeNull();
  });
});

describe("agregação operacional", () => {
  const rows: PricedEventRow[] = [
    {
      id: "e1", pivotId: "p31", pivotName: "Pivô 31", parcelId: "soja", parcelName: "Soja",
      cultureId: "soy", cultureName: "Soja", seasonId: "s26", seasonName: "2026/27",
      startedAt: "2026-11-01T08:00:00", depthMm: 10, volumeM3: 8000, areaHa: 80, energyKwh: 100, cost: 70,
    },
    {
      id: "e2", pivotId: "p31", pivotName: "Pivô 31", parcelId: "soja", parcelName: "Soja",
      cultureId: "soy", cultureName: "Soja", seasonId: "s26", seasonName: "2026/27",
      startedAt: "2026-11-08T08:00:00", depthMm: 8, volumeM3: 6400, areaHa: 80, energyKwh: 80, cost: 56,
    },
    {
      id: "e3", pivotId: "p12", pivotName: "Pivô 12", parcelId: "alg", parcelName: "Algodão",
      cultureId: "cot", cultureName: "Algodão", seasonId: "s26", seasonName: "2026/27",
      startedAt: "2026-12-01T08:00:00", depthMm: 12, volumeM3: 7200, areaHa: 60, energyKwh: 90, cost: 80,
    },
  ];

  it("agrupa por pivô, parcela, cultura e safra", () => {
    const byPivot = aggregatePricedEvents(rows, "pivot");
    expect(byPivot.find((g) => g.key === "p31")?.totalCost).toBe(126);
    expect(byPivot.find((g) => g.key === "p31")?.eventCount).toBe(2);
    expect(aggregatePricedEvents(rows, "parcel").find((g) => g.key === "alg")?.totalCost).toBe(80);
    expect(aggregatePricedEvents(rows, "culture").find((g) => g.key === "soy")?.totalCost).toBe(126);
    expect(aggregatePricedEvents(rows, "season")[0]?.totalCost).toBe(206);
  });
});

describe("snapshot no encerramento", () => {
  it("soma energia e custo dos eventos — não inventa se vazios", () => {
    expect(snapshotCycleEnergyCost([{ depth_mm: 10 } as never])).toEqual({
      total_energy_kwh: null,
      total_cost: null,
    });
    expect(snapshotCycleEnergyCost([
      { energy_kwh: 10, cost: 7 },
      { energy_kwh: 5, cost: 3.5 },
    ])).toEqual({ total_energy_kwh: 15, total_cost: 10.5 });
  });
});

describe("tela de custos", () => {
  it("substitui o empty state e mostra indicadores do evento", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/custos/page.tsx"), "utf8");
    expect(src).not.toContain("EmptyState");
    expect(src).toContain("R$/evento");
    expect(src).toContain("R$/m³");
    expect(src).toContain("R$/mm/ha");
    expect(src).toContain("priceIrrigationEvent");
  });
});

function roundish(n: number): number {
  return Math.round(n * 100) / 100;
}
