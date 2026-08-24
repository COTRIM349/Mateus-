import { describe, expect, it } from "vitest";
import { candidateHasOperationalValues, rankClimateCandidate, type CandidateReading } from "./source-resolver";

function candidate(overrides: Partial<CandidateReading> = {}): CandidateReading {
  return {
    reading_id: "r1",
    station_id: "s1",
    station_name: "Virtual",
    source_priority: 5,
    data_quality: "ok",
    data_kind: "model_estimate",
    imported_at: "2026-08-24T03:00:00Z",
    origin: "open-meteo",
    et0_calculated: 5.2,
    precipitation: 0,
    ...overrides,
  };
}

describe("source resolver operacional", () => {
  it("qualidade ok vence leitura degradada mesmo com prioridade numérica pior", () => {
    const degradedHighPriority = candidate({ reading_id:"a", source_priority:1, data_quality:"degraded" });
    const okLowerPriority = candidate({ reading_id:"b", source_priority:5, data_quality:"ok" });
    expect([degradedHighPriority, okLowerPriority].sort(rankClimateCandidate)[0].reading_id).toBe("b");
  });

  it("entre leituras ok, prioridade menor vence", () => {
    const p5 = candidate({ reading_id:"a", source_priority:5 });
    const p2 = candidate({ reading_id:"b", source_priority:2 });
    expect([p5, p2].sort(rankClimateCandidate)[0].reading_id).toBe("b");
  });

  it("rejeita ETo ou chuva inválida como dado operacional", () => {
    expect(candidateHasOperationalValues(candidate())).toBe(true);
    expect(candidateHasOperationalValues(candidate({ et0_calculated:Number.NaN }))).toBe(false);
    expect(candidateHasOperationalValues(candidate({ precipitation:-1 }))).toBe(false);
  });
});
