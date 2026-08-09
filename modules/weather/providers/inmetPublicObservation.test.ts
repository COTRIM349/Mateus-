import { describe, expect, it, vi } from "vitest";
import {
  buildInmetObservationUrl,
  fetchLatestInmetObservation,
  inmetObservedAt,
  normalizeInmetObservation,
} from "./inmetPublicObservation";

describe("INMET public observations", () => {
  it("interpreta data e hora do INMET como UTC", () => {
    expect(inmetObservedAt("2026-08-08", "1200")).toBe("2026-08-08T12:00:00.000Z");
    expect(inmetObservedAt("2026-08-08", "2400")).toBe("2026-08-09T00:00:00.000Z");
  });

  it("descarta sentinelas e valores fisicamente inválidos", () => {
    const result = normalizeInmetObservation({
      DT_MEDICAO: "2026-08-08",
      HR_MEDICAO: "1800",
      TEM_INS: "26,4",
      UMD_INS: "9999",
      CHUVA: "-1",
      VEN_VEL: "2.1",
      VEN_DIR: "400",
      PRE_INS: "905.2",
    }, new Date("2026-08-08T19:00:00Z"));

    expect(result).toMatchObject({
      status: "available",
      temperatureC: 26.4,
      relativeHumidityPct: null,
      precipitationMm: null,
      windSpeedMs: 2.1,
      windDirectionDeg: null,
      pressureKpa: 90.52,
      completenessPct: 60,
    });
  });

  it("não consulta a rede nem inventa dados sem token", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await fetchLatestInmetObservation("A017", { fetchImpl });

    expect(result.status).toBe("token_required");
    expect(result.temperatureC).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("usa o endpoint autenticado sem expor o token na resposta", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([
      {
        DT_MEDICAO: "2026-08-08",
        HR_MEDICAO: "1700",
        TEM_INS: "25.1",
        UMD_INS: "44",
        CHUVA: "0",
        VEN_VEL: "1.3",
        VEN_DIR: "90",
        PRE_INS: "914.2",
      },
    ]), { status: 200 }));
    const result = await fetchLatestInmetObservation("A017", {
      token: "segredo",
      now: new Date("2026-08-08T18:00:00Z"),
      fetchImpl,
    });

    expect(result.status).toBe("available");
    expect(result.temperatureC).toBe(25.1);
    expect(fetchImpl).toHaveBeenCalledWith(
      buildInmetObservationUrl("A017", "2026-08-07", "2026-08-08", "segredo"),
      expect.any(Object),
    );
    expect(JSON.stringify(result)).not.toContain("segredo");
  });
});

