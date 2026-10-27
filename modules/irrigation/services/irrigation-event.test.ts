import { describe, expect, it } from "vitest";
import { computePivotBalanceSeries, type PivotEngineInput } from "@/modules/water-balance/services";
import {
  HOURS_FORMULA,
  IRRIGATION_DEPTH_UNIT,
  VOLUME_FORMULA,
  buildIrrigationEventInsert,
  combineStartedAt,
  deriveAppliedVolume,
  deriveDepthFromPercentimeter,
  deriveHoursFromHorimeter,
  deriveOperatingHours,
  deriveOperatingHoursFromPercentimeter,
  eventDateKey,
  sumGrossDepthByDate,
  validateHorimeter,
  validateIrrigationDepth,
  validateOperatingHours,
  validatePercentimeterPct,
} from "./irrigation-event";

describe("fórmulas do evento", () => {
  it("Volume m³ = mm × ha × 10", () => {
    expect(deriveAppliedVolume(5, 80)).toBe(4000);
    expect(VOLUME_FORMULA).toContain("mm");
    expect(IRRIGATION_DEPTH_UNIT).toContain("bruta");
  });

  it("Tempo h legado = volume / vazão", () => {
    expect(deriveOperatingHours(5, 80, 400)).toBe(10);
  });

  it("Tempo operacional segue horas a 100% da tabela do pivô", () => {
    expect(deriveOperatingHoursFromPercentimeter(100, 13.56)).toBe(13.56);
    expect(deriveOperatingHoursFromPercentimeter(50, 13.56)).toBe(27.12);
    expect(deriveOperatingHoursFromPercentimeter(25, 13.56)).toBe(54.24);
    expect(HOURS_FORMULA).toContain("100%");
  });

  it("calcula lâmina pela relação inversa do percentímetro", () => {
    expect(deriveDepthFromPercentimeter(100, 5.26)).toBe(5.26);
    expect(deriveDepthFromPercentimeter(50, 5.26)).toBe(10.52);
    expect(deriveDepthFromPercentimeter(25, 5.26)).toBe(21.04);
  });

  it("valida percentímetro entre 1 e 100%", () => {
    expect(validatePercentimeterPct(80)).toBeNull();
    expect(validatePercentimeterPct(0)).not.toBeNull();
    expect(validatePercentimeterPct(101)).not.toBeNull();
  });

  it("valida horímetro inicial e final", () => {
    expect(validateHorimeter(1234.5, 1248.25)).toBeNull();
    expect(validateHorimeter(1248.25, 1234.5)).not.toBeNull();
    expect(validateHorimeter(1234.5, 1234.5)).not.toBeNull();
    expect(deriveHoursFromHorimeter(1234.5, 1248.25)).toBe(13.75);
  });

  it("rejeita lâmina e horas inválidas", () => {
    expect(validateIrrigationDepth(12)).toBeNull();
    expect(validateIrrigationDepth(0)).not.toBeNull();
    expect(validateOperatingHours(-2)).not.toBeNull();
  });
});

describe("buildIrrigationEventInsert", () => {
  it("grava parcela, lâmina bruta, volume e horas", () => {
    const row = buildIrrigationEventInsert({ pivotId: "p1", parcelId: "a1", dateYmd: "2026-08-20", timeHm: "08:30", depthMm: 12, percentimeterPct: 50, areaHa: 80, flowRateM3h: 400, fullTurnTime100H: 13.56, horimeterInitial: 500.25, horimeterFinal: 513.75, notes: "volta completa" });
    expect(row.depth_mm).toBe(12);
    expect(row.percentimeter_pct).toBe(50);
    expect(row.volume_m3).toBe(9600);
    expect(row.horimeter_initial).toBe(500.25);
    expect(row.horimeter_final).toBe(513.75);
    expect(row.operating_hours).toBe(13.5);
    expect(row.parcel_id).toBe("a1");
    expect(row.started_at).toBe("2026-08-20T08:30:00");
    expect(row.status).toBe("concluida");
  });

  it("respeita horas informadas pelo operador", () => {
    const row = buildIrrigationEventInsert({ pivotId: "p1", parcelId: null, dateYmd: "2026-08-20", timeHm: "06:00", depthMm: 12, areaHa: 80, flowRateM3h: 400, hoursOverride: 10 });
    expect(row.operating_hours).toBe(10);
  });
});

describe("agregação diária", () => {
  it("soma eventos do mesmo dia", () => {
    const map = sumGrossDepthByDate([
      { started_at: "2026-08-20T06:00:00", depth_mm: 8 },
      { started_at: "2026-08-20T18:00:00", depth_mm: 4 },
      { started_at: "2026-08-21T06:00:00", depth_mm: 5 },
    ]);
    expect(map["2026-08-20"]).toBe(12);
    expect(map["2026-08-21"]).toBe(5);
    expect(eventDateKey("2026-08-20T18:00:00Z")).toBe("2026-08-20");
  });
});

describe("evento alimenta o balanço", () => {
  it("I_ef = lâmina bruta × eficiência de aplicação", () => {
    const events = [{ started_at: combineStartedAt("2026-01-01", "06:00"), depth_mm: 20 }];
    const irrigationByDate = sumGrossDepthByDate(events);
    const input: PivotEngineInput = {
      assignment: {
        id: "a1",
        planting_date: "2026-01-01",
        emergence_date: null,
        parameter_mode: "padrao",
        initial_root_depth: null,
        max_root_depth: null,
        irrigation_efficiency: null,
        depletion_factor: 0.5,
        initial_soil_moisture_pct: null,
        initial_moisture_unit: "field_capacity_fraction",
        initial_moisture_is_cc: true,
        deficit_irrigation: false,
        stress_point_irrigation: false,
      },
      culture: { root_depth: 0.3, depletion_factor: 0.5 },
      phases: [{ phase_order: 1, name: "Inicial", days_after_plant: 0, duration_days: 10, kc_start: 1, kc_end: 1, root_depth_start: 0.3, root_depth_end: 0.3, depletion_factor: 0.5 }],
      soil: { field_capacity: 0.3, wilting_point: 0.12, bulk_density: 1.3, effective_depth: 0.6 },
      pivot: { application_efficiency: 0.85, efficiency: 0.85, area: 80, flow_rate: 300 },
      weatherByDate: { "2026-01-01": { et0: 5, precipitation: 0 } },
      irrigationByDate,
      dateStart: "2026-01-01",
      dateEnd: "2026-01-01",
    };
    const day = computePivotBalanceSeries(input)[0];
    expect(day.irrigation).toBe(20);
    expect(day.effectiveIrrigation).toBe(17);
  });
});
