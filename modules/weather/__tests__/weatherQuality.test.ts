import { describe, it, expect } from "vitest";
import { assessDailyWeatherQuality } from "@/modules/weather/quality/weatherQuality";
import type {
  DailyWeatherData,
  WeatherSourceMetadata,
} from "@/modules/weather/types/weatherTypes";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";
import type { ReferenceEtoInput } from "@/modules/weather/calculations/referenceEtoTypes";

// ── Helpers de fábrica ──────────────────────────────────────────────────────

const FIXED_NOW = new Date("2026-01-15T12:00:00Z");

function buildMetadata(overrides?: Partial<WeatherSourceMetadata>): WeatherSourceMetadata {
  return {
    provider: "open_meteo",
    modelName: null,
    dataType: "observed",
    forecastIssuedAt: null,
    validAt: "2026-01-14T12:00:00Z",
    fetchedAt: "2026-01-14T18:00:00Z",
    sourceReference: null,
    qualityStatus: "complete",
    missingFields: [],
    warnings: [],
    ...overrides,
  };
}

function buildDay(overrides?: Partial<DailyWeatherData>): DailyWeatherData {
  return {
    location: {
      id: "loc-1",
      name: "Fazenda Teste",
      latitude: -12.0,
      longitude: -45.0,
      elevationM: 800,
      timezone: "America/Sao_Paulo",
    },
    date: "2026-01-14",
    temperatureMinC: 20,
    temperatureMaxC: 32,
    temperatureMeanC: 26,
    relativeHumidityMinPct: 40,
    relativeHumidityMaxPct: 85,
    relativeHumidityMeanPct: 62,
    precipitationMm: 0,
    precipitationProbabilityPct: 10,
    windSpeed2mMs: 2.1,
    windSpeed10mMs: 2.8,
    windDirectionDeg: 90,
    solarRadiationMjM2Day: 25,
    surfacePressureKpa: 92,
    vapourPressureDeficitKpa: 1.4,
    providerReferenceEtoMm: 5.1,
    internallyCalculatedEtoMm: null,
    metadata: buildMetadata(),
    ...overrides,
  };
}

// ── Qualidade ──────────────────────────────────────────────────────────────

describe("assessDailyWeatherQuality — classificação", () => {
  const opts = {
    essentialFields: [
      "temperatureMinC",
      "temperatureMaxC",
      "windSpeed2mMs",
      "solarRadiationMjM2Day",
      "relativeHumidityMeanPct",
    ] as (keyof DailyWeatherData)[],
    now: FIXED_NOW,
  };

  it("registro completo (todos os campos preenchidos) → status 'complete'", () => {
    const day = buildDay({ internallyCalculatedEtoMm: 5.0 });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("complete");
    expect(r.missingFields).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("#7 · registro com campos NÃO essenciais faltando → 'partial'", () => {
    const day = buildDay({
      precipitationProbabilityPct: null,
      windDirectionDeg: null,
      vapourPressureDeficitKpa: null,
      internallyCalculatedEtoMm: null,
    });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("partial");
    expect(r.missingFields).toEqual(
      expect.arrayContaining([
        "precipitationProbabilityPct",
        "windDirectionDeg",
        "vapourPressureDeficitKpa",
        "internallyCalculatedEtoMm",
      ]),
    );
  });

  it("#8 · registro sem variáveis essenciais → 'missing'", () => {
    const day = buildDay({ solarRadiationMjM2Day: null, windSpeed2mMs: null });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("missing");
    expect(r.missingFields).toEqual(
      expect.arrayContaining(["solarRadiationMjM2Day", "windSpeed2mMs"]),
    );
  });

  it("#4 · umidade acima de 100% → 'invalid' (e o registro NÃO é apagado)", () => {
    const day = buildDay({ relativeHumidityMeanPct: 120 });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("invalid");
    expect(r.warnings.length).toBeGreaterThan(0);
    // Contrato: nunca modificamos o objeto
    expect(day.relativeHumidityMeanPct).toBe(120);
  });

  it("#5 · chuva negativa → 'invalid'", () => {
    const day = buildDay({ precipitationMm: -3 });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("invalid");
  });

  it("temperatura min > max → 'invalid'", () => {
    const day = buildDay({ temperatureMinC: 30, temperatureMaxC: 20 });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("invalid");
  });

  it("#9 · valores suspeitos NÃO são apagados (preserva objeto de entrada)", () => {
    const day = buildDay({ solarRadiationMjM2Day: 500 }); // acima do físico
    const before = { ...day };
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("invalid");
    expect(day).toEqual(before); // input inalterado
  });

  it("#10 · ausência de ETo NÃO vira zero (fica em missingFields)", () => {
    const day = buildDay({ providerReferenceEtoMm: null, internallyCalculatedEtoMm: null });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.missingFields).toEqual(
      expect.arrayContaining(["providerReferenceEtoMm", "internallyCalculatedEtoMm"]),
    );
    // Contrato do objeto: os campos continuam null (nunca 0)
    expect(day.providerReferenceEtoMm).toBeNull();
    expect(day.internallyCalculatedEtoMm).toBeNull();
  });

  it("dado observado antigo → 'stale'", () => {
    const day = buildDay({
      metadata: buildMetadata({
        fetchedAt: "2026-01-10T00:00:00Z", // >5 dias antes de FIXED_NOW
      }),
    });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("stale");
  });

  it("dado observado com validAt no futuro → 'invalid'", () => {
    const day = buildDay({
      metadata: buildMetadata({ validAt: "2027-01-01T00:00:00Z" }),
    });
    const r = assessDailyWeatherQuality(day, opts);
    expect(r.qualityStatus).toBe("invalid");
  });
});

// ── FAO-56: propriedades básicas ────────────────────────────────────────────

function baseEtoInput(overrides?: Partial<ReferenceEtoInput>): ReferenceEtoInput {
  // Cenário quente-seco realista do Cerrado (usado como default)
  return {
    date: "2026-01-14",
    latitude: -12.0,
    elevationM: 800,
    temperatureMinC: 20,
    temperatureMaxC: 34,
    temperatureMeanC: 27,
    relativeHumidityMinPct: 35,
    relativeHumidityMaxPct: 85,
    relativeHumidityMeanPct: 60,
    actualVapourPressureKpa: null,
    windSpeedMs: 2.5,
    windMeasurementHeightM: 2,
    solarRadiationMjM2Day: 24,
    surfacePressureKpa: null, // será estimada a partir de elevationM
    ...overrides,
  };
}

describe("referenceEtoFao56 — propriedades básicas", () => {
  it("#3 · ETo nunca é negativa", () => {
    // Cenário degenerado (baixa Rn): ainda assim clamp em >= 0
    const r = calculateReferenceEtoFao56(
      baseEtoInput({ solarRadiationMjM2Day: 0.5, windSpeedMs: 0.1 }),
    );
    expect(r.etoMmDay === null || r.etoMmDay >= 0).toBe(true);
  });

  it("#4 · ausência de radiação → status 'missing' (ETo null)", () => {
    const r = calculateReferenceEtoFao56(baseEtoInput({ solarRadiationMjM2Day: null }));
    expect(r.etoMmDay).toBeNull();
    expect(r.qualityStatus).toBe("missing");
    expect(r.missingFields).toEqual(expect.arrayContaining(["solarRadiationMjM2Day"]));
  });

  it("#5 · ausência de vento NÃO vira zero (fica missing, ETo null)", () => {
    const r = calculateReferenceEtoFao56(baseEtoInput({ windSpeedMs: null }));
    expect(r.etoMmDay).toBeNull();
    expect(r.qualityStatus).toBe("missing");
    expect(r.missingFields).toEqual(expect.arrayContaining(["windSpeedMs"]));
    // Intermediate wind = null (não foi assumido zero)
    expect(r.intermediateValues.windSpeed2mMs).toBeNull();
  });

  it("#6 · umidade > 100 na entrada é ignorada (cai para caminho de menos precisão)", () => {
    // Passamos RHmin/RHmax inválidos → deve cair para RHmean, e ea vira estimado
    const r = calculateReferenceEtoFao56(
      baseEtoInput({ relativeHumidityMinPct: 150, relativeHumidityMaxPct: 200 }),
    );
    expect(r.etoMmDay).not.toBeNull();
    expect(r.estimatedFields.some((e) => e.field === "actualVapourPressureKpa")).toBe(true);
  });

  it("#7 · latitude e date são usados corretamente no cálculo solar (Ra > 0)", () => {
    const r = calculateReferenceEtoFao56(baseEtoInput());
    expect(r.intermediateValues.extraterrestrialRadiationMjM2Day).not.toBeNull();
    expect(r.intermediateValues.extraterrestrialRadiationMjM2Day! > 0).toBe(true);
  });

  it("#8 · resultado é determinístico para a mesma entrada", () => {
    const input = baseEtoInput();
    const a = calculateReferenceEtoFao56(input);
    const b = calculateReferenceEtoFao56(input);
    expect(a).toEqual(b);
  });

  it("#9 · intermediateValues preenchidos em cálculo completo", () => {
    const r = calculateReferenceEtoFao56(baseEtoInput());
    expect(r.qualityStatus === "complete" || r.qualityStatus === "estimated").toBe(true);
    const iv = r.intermediateValues;
    expect(iv.atmosphericPressureKpa).not.toBeNull();
    expect(iv.psychrometricConstantKpaC).not.toBeNull();
    expect(iv.saturationVapourPressureKpa).not.toBeNull();
    expect(iv.actualVapourPressureKpa).not.toBeNull();
    expect(iv.vapourPressureDeficitKpa).not.toBeNull();
    expect(iv.saturationSlopeKpaC).not.toBeNull();
    expect(iv.extraterrestrialRadiationMjM2Day).not.toBeNull();
    expect(iv.clearSkyRadiationMjM2Day).not.toBeNull();
    expect(iv.netShortwaveRadiationMjM2Day).not.toBeNull();
    expect(iv.netLongwaveRadiationMjM2Day).not.toBeNull();
    expect(iv.netRadiationMjM2Day).not.toBeNull();
    expect(iv.windSpeed2mMs).not.toBeNull();
  });

  it("#10 · estimatedFields identifica cada estimativa (pressão a partir da elevação)", () => {
    const r = calculateReferenceEtoFao56(
      baseEtoInput({ surfacePressureKpa: null, elevationM: 800 }),
    );
    expect(r.estimatedFields.some((e) => e.field === "atmosphericPressureKpa")).toBe(true);
    expect(r.method).toBe("fao_56_pm_estimated");
  });

  it("vento 10 m é convertido para 2 m internamente (com aviso)", () => {
    const r = calculateReferenceEtoFao56(
      baseEtoInput({ windSpeedMs: 5, windMeasurementHeightM: 10 }),
    );
    const factor = 4.87 / Math.log(67.8 * 10 - 5.42);
    expect(r.intermediateValues.windSpeed2mMs).toBeCloseTo(5 * factor, 8);
    expect(r.warnings.some((w) => w.includes("Vento ajustado"))).toBe(true);
  });

  it("vento a 2 m não é reajustado (sem aviso)", () => {
    const r = calculateReferenceEtoFao56(baseEtoInput({ windSpeedMs: 3, windMeasurementHeightM: 2 }));
    expect(r.intermediateValues.windSpeed2mMs).toBe(3);
    expect(r.warnings.some((w) => w.includes("Vento ajustado"))).toBe(false);
  });
});

// ── Validação de paridade: cenários realistas (Etapa 6 comparará contra o
//    calculateET0 atual e contra Open-Meteo/estação — mesmos inputs).
//
//    Nesta etapa apenas validamos que a nova implementação:
//      (a) roda até o fim,
//      (b) devolve ETo dentro de faixas plausíveis conhecidas na literatura
//          para cada cenário,
//      (c) preserva intermediateValues completos.
// ────────────────────────────────────────────────────────────────────────────

describe("referenceEtoFao56 — paridade (3 cenários climáticos)", () => {
  const cenarios = [
    {
      nome: "Cerrado quente e seco (jul/ago, alta demanda)",
      input: baseEtoInput({
        date: "2026-08-15",
        temperatureMinC: 15,
        temperatureMaxC: 33,
        temperatureMeanC: 24,
        relativeHumidityMinPct: 25,
        relativeHumidityMaxPct: 70,
        relativeHumidityMeanPct: 45,
        windSpeedMs: 3.5,
        windMeasurementHeightM: 2,
        solarRadiationMjM2Day: 22,
      }),
      minEsperado: 4.0,
      maxEsperado: 8.0,
    },
    {
      nome: "Cerrado úmido chuvoso (jan, menor demanda)",
      input: baseEtoInput({
        date: "2026-01-20",
        temperatureMinC: 21,
        temperatureMaxC: 28,
        temperatureMeanC: 24.5,
        relativeHumidityMinPct: 65,
        relativeHumidityMaxPct: 95,
        relativeHumidityMeanPct: 82,
        windSpeedMs: 1.2,
        windMeasurementHeightM: 2,
        solarRadiationMjM2Day: 14,
      }),
      minEsperado: 1.8,
      maxEsperado: 4.5,
    },
    {
      nome: "Intermediário (abr/out, transição)",
      input: baseEtoInput({
        date: "2026-04-15",
        temperatureMinC: 18,
        temperatureMaxC: 30,
        temperatureMeanC: 24,
        relativeHumidityMinPct: 45,
        relativeHumidityMaxPct: 88,
        relativeHumidityMeanPct: 66,
        windSpeedMs: 2.0,
        windMeasurementHeightM: 2,
        solarRadiationMjM2Day: 19,
      }),
      minEsperado: 2.8,
      maxEsperado: 6.0,
    },
  ] as const;

  for (const c of cenarios) {
    it(`ETo dentro da faixa esperada — ${c.nome}`, () => {
      const r = calculateReferenceEtoFao56(c.input);
      expect(r.etoMmDay).not.toBeNull();
      expect(r.qualityStatus === "complete" || r.qualityStatus === "estimated").toBe(true);
      const eto = r.etoMmDay as number;
      expect(eto).toBeGreaterThanOrEqual(c.minEsperado);
      expect(eto).toBeLessThanOrEqual(c.maxEsperado);
    });
  }
});
