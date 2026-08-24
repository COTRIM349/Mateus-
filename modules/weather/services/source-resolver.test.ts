import { describe, expect, it } from "vitest";
import { rankClimateCandidate, type CandidateReading } from "./source-resolver";

function candidate(overrides: Partial<CandidateReading>): CandidateReading {
  return {
    reading_id: "r",
    station_id: "s",
    station_name: "Fonte",
    source_priority: 5,
    data_quality: "ok",
    data_kind: "model_estimate",
    imported_at: "2026-08-23T12:00:00Z",
    origin: "test",
    et0_calculated: 5,
    precipitation: 0,
    ...overrides,
  };
}

describe("seleção climática operacional", () => {
  it("prefere fonte ok mesmo quando sua prioridade numérica é menor", () => {
    const degradedPriority2 = candidate({ station_id: "p2", source_priority: 2, data_quality: "degraded" });
    const okPriority5 = candidate({ station_id: "p5", source_priority: 5, data_quality: "ok" });
    const sorted = [degradedPriority2, okPriority5].sort(rankClimateCandidate);
    expect(sorted[0].station_id).toBe("p5");
  });

  it("entre duas fontes ok respeita a prioridade da estação", () => {
    const priority5 = candidate({ station_id: "p5", source_priority: 5 });
    const priority2 = candidate({ station_id: "p2", source_priority: 2 });
    const sorted = [priority5, priority2].sort(rankClimateCandidate);
    expect(sorted[0].station_id).toBe("p2");
  });

  it("em empate de qualidade e prioridade prefere dado observado", () => {
    const model = candidate({ station_id: "model", source_priority: 2, data_kind: "model_estimate" });
    const observed = candidate({ station_id: "obs", source_priority: 2, data_kind: "observed" });
    const sorted = [model, observed].sort(rankClimateCandidate);
    expect(sorted[0].station_id).toBe("obs");
  });
});
