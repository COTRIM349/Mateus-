import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ALLOWED_DIAGNOSTIC_DAYS,
  computeSummary,
  runClimateDiagnostic,
  type DiagnosticDailyRow,
} from "./climateDiagnosticService";

// ── Mocks Supabase ─────────────────────────────────────────────────────────
type QueryStep = {
  select?: (cols: string) => QueryStep;
  eq?: (col: string, v: unknown) => QueryStep;
  in?: (col: string, v: unknown[]) => QueryStep;
  gte?: (col: string, v: unknown) => QueryStep;
  lte?: (col: string, v: unknown) => QueryStep;
  order?: (col: string, opts: unknown) => QueryStep;
  limit?: (n: number) => QueryStep;
  maybeSingle?: () => Promise<{ data: unknown; error: null }>;
  then?: undefined;
};

function chain(finalData: unknown): QueryStep {
  const step: QueryStep = {};
  const self = step as unknown as Record<string, unknown>;
  const ret = () => step;
  self.select = ret;
  self.eq = ret;
  self.in = ret;
  self.gte = ret;
  self.lte = ret;
  self.order = ret;
  self.limit = ret;
  self.maybeSingle = async () => ({ data: finalData, error: null });
  // permitir `await` na cadeia (retorna { data, error })
  (self as unknown as { then: (cb: (v: { data: unknown; error: null }) => unknown) => unknown }).then =
    (cb) => cb({ data: finalData, error: null });
  return step;
}

function makeSupabaseMock(byTable: Record<string, unknown>): unknown {
  return {
    from(table: string) {
      return chain(byTable[table] ?? null);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

// ── computeSummary — unidades independentes de Supabase ────────────────────
describe("computeSummary — Bias/MAE/RMSE", () => {
  it("Bias / MAE / RMSE com 3 pares", () => {
    const rows = [
      { etoCotrimMm: 5, etoOpenMeteoMm: 4.5 },
      { etoCotrimMm: 6, etoOpenMeteoMm: 6 },
      { etoCotrimMm: 4, etoOpenMeteoMm: 5 },
    ] as DiagnosticDailyRow[];
    const s = computeSummary(rows);
    expect(s.n).toBe(3);
    expect(s.bias).toBeCloseTo((0.5 + 0 + -1) / 3, 6);
    expect(s.mae).toBeCloseTo((0.5 + 0 + 1) / 3, 6);
    expect(s.rmse).toBeCloseTo(Math.sqrt((0.25 + 0 + 1) / 3), 6);
  });
  it("ignora pares incompletos (null em qualquer lado)", () => {
    const rows = [
      { etoCotrimMm: 5, etoOpenMeteoMm: null },
      { etoCotrimMm: null, etoOpenMeteoMm: 4 },
      { etoCotrimMm: 3, etoOpenMeteoMm: 3 },
    ] as DiagnosticDailyRow[];
    const s = computeSummary(rows);
    expect(s.n).toBe(1);
    expect(s.bias).toBe(0);
  });
  it("zero pares → todas as métricas null (nunca zero)", () => {
    const s = computeSummary([]);
    expect(s.n).toBe(0);
    expect(s.bias).toBeNull();
    expect(s.mae).toBeNull();
    expect(s.rmse).toBeNull();
    expect(s.averageEtoCotrimMm).toBeNull();
    expect(s.averageEtoOpenMeteoMm).toBeNull();
  });
  it("conta dias com diferença significativa (|Δ|>0.5 OU |Δ%|>10)", () => {
    const rows = [
      { etoCotrimMm: 5, etoOpenMeteoMm: 4.4 }, // Δ=0.6 → signif
      { etoCotrimMm: 5, etoOpenMeteoMm: 5.05 }, // Δ%~1 → não
      { etoCotrimMm: 4.6, etoOpenMeteoMm: 4 }, // Δ%=15 → signif
    ] as DiagnosticDailyRow[];
    const s = computeSummary(rows);
    expect(s.daysWithSignificantDiff).toBe(2);
  });
});

// ── runClimateDiagnostic — validações e rejeições ──────────────────────────
describe("runClimateDiagnostic — validações", () => {
  it("período diferente de 7/14/30 rejeitado", async () => {
    const sb = makeSupabaseMock({});
    const r = await runClimateDiagnostic(sb as never, {
      farmId: "farm-x",
      // @ts-expect-error — testando bordas
      days: 15,
    });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.status).toBe(400);
    }
  });

  it("farm inexistente → 403 fazenda inacessível", async () => {
    // Fazenda não retorna registro (RLS típica)
    const sb = makeSupabaseMock({ farms: null });
    const r = await runClimateDiagnostic(sb as never, { farmId: "no", days: 7 });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.status).toBe(403);
      expect(r.error).toContain("inacessível");
    }
  });

  it("fazenda sem coordenadas → 400 com mensagem amigável (não chama Open-Meteo)", async () => {
    const sb = makeSupabaseMock({
      farms: { id: "f1", name: "F", latitude: null, longitude: null, altitude: null, timezone: "America/Bahia" },
      weather_stations: null,
    });
    const r = await runClimateDiagnostic(sb as never, { farmId: "f1", days: 7 });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.status).toBe(400);
      expect(r.error).toContain("sem coordenadas");
    }
  });

  it("fazenda com latitude fora de [-90,90] → 400 com mensagem amigável", async () => {
    // Reproduz o bug real reportado: FAZENDA KARITEL com latitude=141000
    const sb = makeSupabaseMock({
      farms: {
        id: "karitel",
        name: "FAZENDA KARITEL",
        latitude: 141000,
        longitude: -45,
        altitude: 700,
        timezone: "America/Bahia",
      },
      weather_stations: null,
    });
    const r = await runClimateDiagnostic(sb as never, { farmId: "karitel", days: 7 });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.status).toBe(400);
      expect(r.error).toContain("KARITEL");
      expect(r.error).toContain("coordenadas inválidas");
      expect(r.error).toContain("141000");
      // NÃO deve mencionar HTTP 400 da Open-Meteo — validamos antes de chamar
      expect(r.error).not.toContain("Open-Meteo");
    }
  });

  it("longitude fora de [-180,180] → 400", async () => {
    const sb = makeSupabaseMock({
      farms: {
        id: "f2",
        name: "F2",
        latitude: -12,
        longitude: 500,
        altitude: 700,
        timezone: "America/Bahia",
      },
      weather_stations: null,
    });
    const r = await runClimateDiagnostic(sb as never, { farmId: "f2", days: 7 });
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.status).toBe(400);
  });

  it("ALLOWED_DIAGNOSTIC_DAYS = [7, 14, 30]", () => {
    expect(ALLOWED_DIAGNOSTIC_DAYS).toEqual([7, 14, 30]);
  });
});

// ── Fluxo end-to-end com Open-Meteo mockada ────────────────────────────────
describe("runClimateDiagnostic — fluxo completo com mock da API", () => {
  it("compõe rows com ETo Cotrim + Open-Meteo + Sistema (null quando ausente)", async () => {
    // Mock global fetch para openMeteoProvider
    const payload = {
      daily: {
        time: ["2026-08-01", "2026-08-02"],
        temperature_2m_min: [18, 19],
        temperature_2m_max: [30, 31],
        temperature_2m_mean: [24, 25],
        relative_humidity_2m_min: [30, 35],
        relative_humidity_2m_max: [85, 88],
        relative_humidity_2m_mean: [55, 60],
        precipitation_sum: [0, 1.2],
        precipitation_probability_max: [10, 20],
        shortwave_radiation_sum: [22, 20],
        wind_speed_10m_mean: [3.0, 2.5],
        wind_speed_10m_max: [5, 4.5],
        wind_direction_10m_dominant: [90, 100],
        surface_pressure_min: [935, 934],
        surface_pressure_max: [940, 939],
        vapour_pressure_deficit_max: [2.5, 2.4],
        et0_fao_evapotranspiration: [5.2, 4.8],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => "",
      }) as unknown as Response),
    );

    // Supabase: fazenda com coords, uma estação, 1 leitura antiga
    const sb = makeSupabaseMock({
      farms: {
        id: "f1", name: "Rio do Meio",
        latitude: -12.5, longitude: -45.8,
        altitude: 700, timezone: "America/Bahia",
      },
      weather_stations: {
        id: "s1", name: "Virtual", latitude: -12.5, longitude: -45.8,
        altitude: 700, timezone: "America/Bahia",
      },
      weather_readings: [
        { date: "2026-08-01", et0_calculated: 5.1, origin: "open_meteo" },
        // 2026-08-02 ausente na base → currentSystemEtoMm deve ser null
      ],
    });
    // A cadeia .in/.gte/.lte em weather_readings devolve o array, mas nosso
    // mock genérico só devolve o "finalData" da cadeia principal — para as
    // stations, funciona. Para readings, tratamos com um segundo mock.
    (sb as { from: (t: string) => unknown }).from = (table: string) => {
      if (table === "farms") return chain({
        id: "f1", name: "Rio do Meio",
        latitude: -12.5, longitude: -45.8,
        altitude: 700, timezone: "America/Bahia",
      });
      if (table === "weather_stations") return chain([{ id: "s1", name: "Virtual", latitude: -12.5, longitude: -45.8, altitude: 700, timezone: "America/Bahia" }]);
      if (table === "weather_readings") return chain([
        { date: "2026-08-01", et0_calculated: 5.1, origin: "open_meteo" },
      ]);
      return chain(null);
    };
    // O primeiro from(weather_stations) usa .maybeSingle(); resolveLocation
    // usa .limit(1).maybeSingle() na estação. O mock genérico devolve
    // o array — para a resolveLocation queremos objeto único.
    // Ajustamos: farms.maybeSingle → objeto; weather_stations.maybeSingle → primeiro elemento.
    const origFrom = (sb as { from: (t: string) => unknown }).from;
    (sb as { from: (t: string) => unknown }).from = (table: string) => {
      const step = origFrom(table) as { maybeSingle: () => Promise<unknown> };
      if (table === "weather_stations") {
        const originalMaybe = step.maybeSingle.bind(step);
        (step as { maybeSingle: () => Promise<unknown> }).maybeSingle = async () => {
          const r = (await originalMaybe()) as { data: unknown[] | null };
          const first = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
          return { data: first, error: null };
        };
      }
      return step;
    };

    const r = await runClimateDiagnostic(sb as never, { farmId: "f1", days: 7 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.rows.length).toBe(2);
    // Dia 01: tudo presente
    expect(r.rows[0].etoCotrimMm).not.toBeNull();
    expect(r.rows[0].etoOpenMeteoMm).toBe(5.2);
    expect(r.rows[0].currentSystemEtoMm).toBe(5.1);
    expect(r.rows[0].absoluteDifferenceMm).not.toBeNull();
    // Dia 02: sem leitura antiga → null (nunca zero)
    expect(r.rows[1].currentSystemEtoMm).toBeNull();
    // Summary: 2 pares Cotrim+Open-Meteo
    expect(r.summary.n).toBe(2);
    // Variáveis brutas propagadas
    expect(r.rows[0].tMinC).toBe(18);
    expect(r.rows[0].wind10mMs).toBe(3);
    expect(r.rows[0].wind2mMs).not.toBeNull();
  });
});

// ── Regra crítica — nada de ETo virar zero ─────────────────────────────────
describe("Regra crítica — Shadow Mode", () => {
  it("null NUNCA é convertido para zero em nenhum campo do row (fabricado)", () => {
    const row: DiagnosticDailyRow = {
      date: "2026-08-01",
      etoCotrimMm: null,
      etoOpenMeteoMm: null,
      currentSystemEtoMm: null,
      absoluteDifferenceMm: null,
      percentageDifferencePct: null,
      tMinC: null, tMaxC: null, tMeanC: null,
      rhMinPct: null, rhMaxPct: null, rhMeanPct: null,
      wind10mMs: null, wind2mMs: null,
      solarRadiationMjM2Day: null,
      surfacePressureKpa: null, vpdKpa: null,
      precipitationMm: null,
      qualityStatus: "missing",
      dataType: "observed",
      provider: "open_meteo",
      estimatedFields: [],
      missingFields: [],
      warnings: [],
      intermediateValues: {
        atmosphericPressureKpa: null,
        psychrometricConstantKpaC: null,
        saturationVapourPressureKpa: null,
        actualVapourPressureKpa: null,
        vapourPressureDeficitKpa: null,
        saturationSlopeKpaC: null,
        extraterrestrialRadiationMjM2Day: null,
        clearSkyRadiationMjM2Day: null,
        netShortwaveRadiationMjM2Day: null,
        netLongwaveRadiationMjM2Day: null,
        netRadiationMjM2Day: null,
        soilHeatFluxMjM2Day: null,
        windSpeed2mMs: null,
      },
    };
    // O contrato do tipo já é number | null; garantimos que o objeto passa
    // pelo cálculo do summary sem substituição silenciosa
    const s = computeSummary([row]);
    expect(s.n).toBe(0);
    expect(s.bias).toBeNull();
  });
});
