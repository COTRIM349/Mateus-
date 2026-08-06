import { describe, it, expect } from "vitest";
import {
  CLIMATE_SPEC_VERSION,
  CLIMATE_SPECIFICATION,
  COMPLETENESS_THRESHOLDS,
  DEFAULT_TIMEZONE,
  ETO_BLOCKING_RULES,
  ETO_ESSENTIAL_FIELDS,
  ETO_ESTIMABLE_FIELDS,
  KNOWN_DIVERGENCES,
  MAX_AGE,
  OFFICIAL_ETO_FIELD,
  OFFICIAL_ETO_METHOD,
  OFFICIAL_UNITS,
  PHYSICAL_RANGES,
  PROVIDER_ETO_ALLOWED_USES,
  PROVIDER_ETO_FIELD,
  PROVIDER_ETO_FORBIDDEN_USES,
  SOURCE_PRIORITY,
  WATER_BALANCE_CONTRACT,
} from "./climateSpecification";
import { DEFAULT_PHYSICAL_RANGES } from "@/modules/weather/quality/weatherQuality";
import { OPEN_METEO_FALLBACK_TIMEZONE } from "@/modules/weather/providers/openMeteoProvider";

// ── Versão ──────────────────────────────────────────────────────────────────

describe("Climate Specification — versão e integridade", () => {
  it("versão segue o formato SemVer x.y.z", () => {
    expect(CLIMATE_SPEC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CLIMATE_SPEC_VERSION).toBe("1.0.0");
  });
  it("snapshot CLIMATE_SPECIFICATION expõe todas as seções obrigatórias", () => {
    expect(CLIMATE_SPECIFICATION.version).toBe(CLIMATE_SPEC_VERSION);
    expect(CLIMATE_SPECIFICATION.officialUnits).toBe(OFFICIAL_UNITS);
    expect(CLIMATE_SPECIFICATION.defaultTimezone).toBe(DEFAULT_TIMEZONE);
    expect(CLIMATE_SPECIFICATION.physicalRanges).toBe(PHYSICAL_RANGES);
    expect(CLIMATE_SPECIFICATION.eto.essentialFields).toBe(ETO_ESSENTIAL_FIELDS);
    expect(CLIMATE_SPECIFICATION.sourcePriority).toBe(SOURCE_PRIORITY);
  });
});

// ── Unidades oficiais ──────────────────────────────────────────────────────

describe("Climate Specification — unidades oficiais", () => {
  it("todas as unidades exigidas estão declaradas com string não-vazia", () => {
    const required = [
      "temperature", "humidity", "precipitation", "probability",
      "windSpeed", "windDirection", "solarRadiationHourly",
      "solarRadiationDaily", "pressure", "vpd", "eto", "elevation",
      "coordinates",
    ] as const;
    for (const k of required) {
      const v = OFFICIAL_UNITS[k];
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
  it("radiação horária = W/m² e diária = MJ/m²/dia (sem dupla conversão)", () => {
    expect(OFFICIAL_UNITS.solarRadiationHourly).toBe("W/m²");
    expect(OFFICIAL_UNITS.solarRadiationDaily).toBe("MJ/m²/dia");
  });
});

// ── Faixas físicas: reaproveitamento (sem duplicação) ──────────────────────

describe("Climate Specification — faixas físicas reaproveitam DEFAULT_PHYSICAL_RANGES", () => {
  it("PHYSICAL_RANGES é REFERÊNCIA (mesma instância) de DEFAULT_PHYSICAL_RANGES", () => {
    // Garantia de "single source of truth": alterar em weatherQuality
    // propaga automaticamente na spec.
    expect(PHYSICAL_RANGES).toBe(DEFAULT_PHYSICAL_RANGES);
  });
});

// ── Completude / idades ────────────────────────────────────────────────────

describe("Climate Specification — completude e idades", () => {
  it("limites de completude são 0.9 (complete) e 0.7 (partial)", () => {
    expect(COMPLETENESS_THRESHOLDS.complete).toBe(0.9);
    expect(COMPLETENESS_THRESHOLDS.partial).toBe(0.7);
    expect(COMPLETENESS_THRESHOLDS.complete).toBeGreaterThan(
      COMPLETENESS_THRESHOLDS.partial,
    );
  });
  it("idade máxima observada e previsão são positivas e finitas", () => {
    expect(MAX_AGE.observedHours).toBeGreaterThan(0);
    expect(MAX_AGE.forecastHours).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_AGE.observedHours)).toBe(true);
    expect(Number.isFinite(MAX_AGE.forecastHours)).toBe(true);
  });
});

// ── Timezone ───────────────────────────────────────────────────────────────

describe("Climate Specification — timezone fallback", () => {
  it("DEFAULT_TIMEZONE = America/Bahia", () => {
    expect(DEFAULT_TIMEZONE).toBe("America/Bahia");
  });
  it("DEFAULT_TIMEZONE reaproveita a constante do openMeteoProvider (single source of truth)", () => {
    expect(DEFAULT_TIMEZONE).toBe(OPEN_METEO_FALLBACK_TIMEZONE);
  });
});

// ── ETo oficial × provider ─────────────────────────────────────────────────

describe("Climate Specification — política oficial de ETo", () => {
  it("ETo oficial = FAO-56 Penman-Monteith interno", () => {
    expect(OFFICIAL_ETO_METHOD).toBe("fao_56_penman_monteith");
    expect(OFFICIAL_ETO_FIELD).toBe("internallyCalculatedEtoMm");
    expect(PROVIDER_ETO_FIELD).toBe("providerReferenceEtoMm");
  });
  it("providerEto é permitido apenas para diagnóstico, comparação e auditoria", () => {
    expect(PROVIDER_ETO_ALLOWED_USES).toEqual([
      "diagnostic",
      "ui_comparison",
      "audit",
    ]);
  });
  it("providerEto é PROIBIDO no balanço hídrico e na recomendação", () => {
    expect(PROVIDER_ETO_FORBIDDEN_USES).toEqual([
      "water_balance",
      "irrigation_recommendation",
    ]);
  });
  it("ETO_ESSENTIAL_FIELDS contém as variáveis mínimas do FAO-56", () => {
    const essential = new Set<string>(ETO_ESSENTIAL_FIELDS);
    expect(essential.has("temperatureMinC")).toBe(true);
    expect(essential.has("temperatureMaxC")).toBe(true);
    expect(essential.has("solarRadiationMjM2Day")).toBe(true);
    expect(essential.has("windSpeed2mMs")).toBe(true);
    expect(essential.has("relativeHumidityMeanPct")).toBe(true);
  });
  it("ETO_ESTIMABLE_FIELDS não intersecta os essenciais 'não-estimáveis'", () => {
    // temperaturas min/max e Rs não podem ser estimadas — só medidas.
    const estimable = new Set<string>(ETO_ESTIMABLE_FIELDS);
    expect(estimable.has("temperatureMinC")).toBe(false);
    expect(estimable.has("temperatureMaxC")).toBe(false);
    expect(estimable.has("solarRadiationMjM2Day")).toBe(false);
  });
});

// ── Regras de bloqueio ─────────────────────────────────────────────────────

describe("Climate Specification — regras de bloqueio de ETo", () => {
  it("todas as regras têm as chaves obrigatórias", () => {
    for (const r of ETO_BLOCKING_RULES) {
      expect(typeof r.when).toBe("string");
      expect(r.when.length).toBeGreaterThan(0);
      expect(typeof r.block).toBe("boolean");
    }
  });
  it("existe pelo menos uma regra que BLOQUEIA por Rs ausente", () => {
    const rules = ETO_BLOCKING_RULES.filter(
      (r) => r.when.includes("solarRadiationMjM2Day") && r.block,
    );
    expect(rules.length).toBeGreaterThan(0);
  });
  it("existe pelo menos uma regra que NÃO bloqueia mas degrada (estimativa)", () => {
    expect(ETO_BLOCKING_RULES.some((r) => r.block === false)).toBe(true);
  });
});

// ── Prioridade de fontes ───────────────────────────────────────────────────

describe("Climate Specification — matriz de prioridade de fontes", () => {
  it("categorias exigidas presentes na matriz", () => {
    const required = [
      "temperature", "humidity", "precipitationObserved",
      "precipitationForecast", "wind", "radiation", "pressure", "eto",
    ] as const;
    for (const k of required) {
      expect(SOURCE_PRIORITY[k]).toBeDefined();
    }
  });
  it("estação da fazenda tem prioridade máxima em temperature/humidity/wind quando presente", () => {
    expect(SOURCE_PRIORITY.temperature[0]).toBe("farm_station");
    expect(SOURCE_PRIORITY.humidity[0]).toBe("farm_station");
    expect(SOURCE_PRIORITY.wind[0]).toBe("farm_station");
  });
  it("ETo NÃO tem fontes externas — provedores nunca substituem o motor interno", () => {
    expect(SOURCE_PRIORITY.eto.length).toBe(0);
  });
  it("cada provedor listado é um WeatherProviderName válido", () => {
    const valid = new Set([
      "open_meteo", "meteoblue", "nasa_power", "meteostat",
      "noaa", "farm_station", "manual",
    ]);
    for (const list of Object.values(SOURCE_PRIORITY)) {
      for (const p of list) {
        expect(valid.has(p)).toBe(true);
      }
    }
  });
  it("sem duplicatas dentro de uma mesma categoria", () => {
    for (const [k, list] of Object.entries(SOURCE_PRIORITY)) {
      const set = new Set(list);
      expect(set.size, `categoria ${k} tem duplicata`).toBe(list.length);
    }
  });
});

// ── Contrato com o balanço hídrico ─────────────────────────────────────────

describe("Climate Specification — contrato futuro com o balanço hídrico", () => {
  it("balanço só pode consumir a ETo INTERNA", () => {
    expect(WATER_BALANCE_CONTRACT.allowedEtoSource).toBe(OFFICIAL_ETO_FIELD);
  });
  it("balanço exige metadados de origem e qualidade", () => {
    expect(WATER_BALANCE_CONTRACT.requiresOriginMetadata).toBe(true);
    expect(WATER_BALANCE_CONTRACT.requiresQualityMetadata).toBe(true);
  });
  it("marcador connectedInEtapa é null (ainda não conectado)", () => {
    expect(WATER_BALANCE_CONTRACT.connectedInEtapa).toBeNull();
  });
});

// ── Divergências conhecidas ────────────────────────────────────────────────

describe("Climate Specification — divergências conhecidas C1/C2/C3", () => {
  it("as 3 divergências identificadas na Etapa 4 estão documentadas", () => {
    const ids = KNOWN_DIVERGENCES.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["C1", "C2", "C3"]));
  });
  it("cada divergência tem plano de correção (não fica indefinido)", () => {
    for (const d of KNOWN_DIVERGENCES) {
      expect(d.toFixIn.length).toBeGreaterThan(0);
      expect(d.specDecision.length).toBeGreaterThan(0);
    }
  });
});

// ── Garantias meta ────────────────────────────────────────────────────────

describe("Climate Specification — meta-garantias", () => {
  it("nenhuma API de provedor aparece como ETo oficial em nenhuma seção", () => {
    // O único campo com nome de ETo oficial é internallyCalculatedEtoMm.
    expect(OFFICIAL_ETO_FIELD).not.toBe(PROVIDER_ETO_FIELD);
    // Os provedores externos não aparecem na lista de fontes de ETo.
    expect(SOURCE_PRIORITY.eto).not.toContain("open_meteo");
    expect(SOURCE_PRIORITY.eto).not.toContain("meteoblue");
    expect(SOURCE_PRIORITY.eto).not.toContain("nasa_power");
  });
  it("faixas físicas essenciais existem e são coerentes (min < max)", () => {
    for (const [k, r] of Object.entries(PHYSICAL_RANGES)) {
      expect(r.min, `${k}.min < max`).toBeLessThan(r.max);
    }
  });
});
