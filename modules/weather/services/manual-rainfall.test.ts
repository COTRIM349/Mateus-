import { describe, expect, it } from "vitest";
import {
  MANUAL_RAIN_MAX_MM,
  applyManualRainfallOverride,
  buildManualRainfallInsert,
  effectivePrecipFromManual,
  listManualOverrideDates,
  sumManualRainByDate,
  validateManualRainfallMm,
  validateReadingDate,
} from "./manual-rainfall";

describe("chuva manual — validação", () => {
  it("aceita zero e valores típicos", () => {
    expect(validateManualRainfallMm(0)).toBeNull();
    expect(validateManualRainfallMm(12.5)).toBeNull();
  });

  it("rejeita negativo, NaN e acima do teto", () => {
    expect(validateManualRainfallMm(-1)).toMatch(/negativa/i);
    expect(validateManualRainfallMm(Number.NaN)).toMatch(/Informe/i);
    expect(validateManualRainfallMm(MANUAL_RAIN_MAX_MM + 1)).toMatch(/confira/i);
  });

  it("rejeita data futura e formato inválido", () => {
    expect(validateReadingDate("20-01-01")).toMatch(/AAAA-MM-DD/i);
    expect(validateReadingDate("2099-01-01")).toMatch(/futura/i);
    expect(validateReadingDate("2024-06-15")).toBeNull();
  });
});

describe("chuva manual — payload e Pe", () => {
  it("monta insert com use_in_balance padrão true", () => {
    const row = buildManualRainfallInsert({
      farmId: "farm-1",
      readingDate: "2024-06-15",
      precipitationMm: 18.456,
      notes: "  pluviômetro módulo 2  ",
    });
    expect(row.farm_id).toBe("farm-1");
    expect(row.reading_date).toBe("2024-06-15");
    expect(row.precipitation_mm).toBe(18.46);
    expect(row.use_in_balance).toBe(true);
    expect(row.notes).toBe("pluviômetro módulo 2");
  });

  it("Pe USDA-SCS a partir da chuva manual", () => {
    expect(effectivePrecipFromManual(0)).toBe(0);
    expect(effectivePrecipFromManual(25)).toBeGreaterThan(0);
    expect(effectivePrecipFromManual(25)).toBeLessThanOrEqual(25);
  });
});

describe("chuva manual — override no mapa climático", () => {
  it("soma por data só com use_in_balance ativo", () => {
    const map = sumManualRainByDate([
      { reading_date: "2024-06-15", precipitation_mm: 10, use_in_balance: true },
      { reading_date: "2024-06-15T00:00:00", precipitation_mm: 5, use_in_balance: true },
      { reading_date: "2024-06-16", precipitation_mm: 40, use_in_balance: false },
    ]);
    expect(map["2024-06-15"]).toBe(15);
    expect(map["2024-06-16"]).toBeUndefined();
  });

  it("troca só a precipitação e preserva ETo", () => {
    const weather = {
      "2024-06-15": { et0: 5.2, precipitation: 0 },
      "2024-06-16": { et0: 4.8, precipitation: 3 },
    };
    const out = applyManualRainfallOverride(weather, {
      "2024-06-15": 22,
      "2024-06-17": 50, // sem clima → ignorado
    });
    expect(out["2024-06-15"]).toEqual({ et0: 5.2, precipitation: 22 });
    expect(out["2024-06-16"]).toEqual({ et0: 4.8, precipitation: 3 });
    expect(out["2024-06-17"]).toBeUndefined();
  });

  it("lista datas sobrescritas", () => {
    expect(
      listManualOverrideDates(["2024-06-15", "2024-06-16"], { "2024-06-15": 10 }),
    ).toEqual(["2024-06-15"]);
  });
});
