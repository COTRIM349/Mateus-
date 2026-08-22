import { describe, expect, it } from "vitest";
import { computePivotBalanceSeries, type PivotEngineInput } from "@/modules/water-balance/services";
import {
  HOURS_FORMULA,
  IRRIGATION_DEPTH_UNIT,
  VOLUME_FORMULA,
  buildIrrigationEventInsert,
  combineStartedAt,
  deriveAppliedVolume,
  deriveOperatingHours,
  eventDateKey,
  sumGrossDepthByDate,
  validateIrrigationDepth,
  validateOperatingHours,
} from "./irrigation-event";

describe("fórmulas do evento (Etapa H)", () => {
  it("Volume m³ = mm × ha × 10", () => {
    expect(deriveAppliedVolume(5, 80)).toBe(4000);
    expect(VOLUME_FORMULA).toContain("mm");
    expect(IRRIGATION_DEPTH_UNIT).toContain("bruta");
  });

  it("Tempo h = volume / vazão", () => {
    expect(deriveOperatingHours(5, 80, 400)).toBe(10);
    expect(HOURS_FORMULA).toContain("vazão");
  });

  it("rejeita lâmina inválida e não inventa valor", () => {
    expect(validateIrrigationDepth(12)).toBeNull();
    expect(validateIrrigationDepth(0)).not.toBeNull();
    expect(validateIrrigationDepth(-1)).not.toBeNull();
    expect(validateOperatingHours(-2)).not.toBeNull();
  });
});

describe("buildIrrigationEventInsert", () => {
  it("grava lâmina bruta, volume, horas e parcela — sem custo", () => {
    const row = buildIrrigationEventInsert({
      pivotId: "p1",
      parcelId: "a1",
      dateYmd: "2026-08-20",
      timeHm: "08:30",
      depthMm: 12,
      areaHa: 80,
      flowRateM3h: 400,
      notes: "volta completa",
    });
    expect(row.depth_mm).toBe(12);
    expect(row.volume_m3).toBe(9600);
    expect(row.operating_hours).toBe(24);
    expect(row.parcel_id).toBe("a1");
    expect(row.started_at).toBe("2026-08-20T08:30:00");
    expect(row.status).toBe("concluida");
    expect(row.notes).toBe("volta completa");
    expect(row).not.toHaveProperty("cost");
    expect(row).not.toHaveProperty("energy_kwh");
  });

  it("respeita horas informadas pelo operador", () => {
    const row = buildIrrigationEventInsert({
      pivotId: "p1",
      parcelId: null,
      dateYmd: "2026-08-20",
      timeHm: "06:00",
      depthMm: 12,
      areaHa: 80,
      flowRateM3h: 400,
      hoursOverride: 10,
    });
    expect(row.operating_hours).toBe(10);
    expect(row.volume_m3).toBe(9600);
  });
});

describe("sumGrossDepthByDate", () => {
  it("soma eventos do mesmo dia para o motor", () => {
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

describe("evento alimenta o balanço como I bruta", () => {
  it("I_ef = lâmina do evento × eficiência", () => {
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
      },
      culture: { root_depth: 0.3, depletion_factor: 0.5 },
      phases: [],
      soil: {
        field_capacity: 0.3,
        wilting_point: 0.12,
        bulk_density: 1.3,
        effective_depth: 0.6,
      },
      pivot: { application_efficiency: 0.85, area: 80, flow_rate: 300 },
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
