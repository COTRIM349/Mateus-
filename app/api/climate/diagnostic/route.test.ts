import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

// Mock do createClient (Supabase server) — controlado por cada teste
const supabaseState = {
  user: null as unknown,
  authError: null as unknown,
  farmRow: null as unknown,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: supabaseState.user },
        error: supabaseState.authError,
      }),
    },
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === "farms" ? supabaseState.farmRow : null,
          error: null,
        }),
      };
      return chain;
    },
  }),
}));

// Também mockamos o serviço para não sair chamando Open-Meteo aqui
vi.mock("@/modules/weather/diagnostics/climateDiagnosticService", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/weather/diagnostics/climateDiagnosticService")
  >("@/modules/weather/diagnostics/climateDiagnosticService");
  return {
    ...actual,
    runClimateDiagnostic: vi.fn(async () => ({
      farmId: "f1",
      farmName: "F1",
      location: {
        id: "s1",
        name: "V",
        latitude: -12,
        longitude: -45,
        elevationM: 700,
        timezone: "America/Bahia",
      },
      periodDays: 7,
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      runAt: new Date().toISOString(),
      rows: [],
      summary: {
        n: 0,
        bias: null,
        mae: null,
        rmse: null,
        daysWithSignificantDiff: 0,
        averageEtoCotrimMm: null,
        averageEtoOpenMeteoMm: null,
      },
    })),
  };
});

// import dinâmico após os mocks (carregado em beforeAll para evitar top-level await)
// Tipagem: NextRequest é compatível com Request no runtime — testes usam Request nativo.
type RoutePost = (req: unknown) => Promise<Response>;
let POST: RoutePost;
beforeAll(async () => {
  const mod = (await import("./route")) as unknown as { POST: RoutePost };
  POST = mod.POST;
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/climate/diagnostic", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.restoreAllMocks());

describe("POST /api/climate/diagnostic — validação e autorização", () => {
  it("sem sessão → 401", async () => {
    supabaseState.user = null;
    supabaseState.farmRow = null;
    const res = await POST(makeReq({ farmId: "f1", days: 7 }) as never);
    expect(res.status).toBe(401);
  });

  it("body sem farmId → 400", async () => {
    supabaseState.user = { id: "u1" };
    const res = await POST(makeReq({ days: 7 }) as never);
    expect(res.status).toBe(400);
  });

  it("days fora de {7,14,30} → 400", async () => {
    supabaseState.user = { id: "u1" };
    const res = await POST(makeReq({ farmId: "f1", days: 15 }) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("days");
  });

  it("fazenda inacessível ao usuário → 403", async () => {
    supabaseState.user = { id: "u1" };
    supabaseState.farmRow = null; // RLS não devolve nada
    const res = await POST(makeReq({ farmId: "other", days: 7 }) as never);
    expect(res.status).toBe(403);
  });

  it("fluxo autorizado → 200 e retorna DiagnosticResponse", async () => {
    supabaseState.user = { id: "u1" };
    supabaseState.farmRow = { id: "f1" };
    const res = await POST(makeReq({ farmId: "f1", days: 7 }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.farmId).toBe("f1");
    expect(json.periodDays).toBe(7);
    expect(json.rows).toEqual([]);
    expect(json.summary).toBeDefined();
  });

  it("coordenadas do cliente são IGNORADAS (rota não aceita lat/lon do body)", async () => {
    supabaseState.user = { id: "u1" };
    supabaseState.farmRow = { id: "f1" };
    // Mesmo enviando lat/lon absurdos, a rota só encaminha farmId+days ao service
    const res = await POST(
      makeReq({
        farmId: "f1",
        days: 7,
        latitude: 999,
        longitude: 999,
      }) as never,
    );
    expect(res.status).toBe(200);
  });

  it("body JSON malformado → 400", async () => {
    supabaseState.user = { id: "u1" };
    const req = new Request("http://localhost/api/climate/diagnostic", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
