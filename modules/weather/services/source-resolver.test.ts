import { describe, expect, it } from "vitest";
import {
  candidateCanBeOperationallyApproved,
  candidateHasOperationalValues,
  OPERATIONAL_CLIMATE_LIMITS,
  rankClimateCandidate,
  type CandidateReading,
} from "./source-resolver";

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

  it("rejeita ETo ou chuva ausente/negativa como dado operacional", () => {
    expect(candidateHasOperationalValues(candidate())).toBe(true);
    expect(candidateHasOperationalValues(candidate({ et0_calculated:Number.NaN }))).toBe(false);
    expect(candidateHasOperationalValues(candidate({ precipitation:-1 }))).toBe(false);
  });

  it("não aprova automaticamente valores fisicamente atípicos", () => {
    expect(candidateHasOperationalValues(candidate({
      et0_calculated: OPERATIONAL_CLIMATE_LIMITS.et0Max,
      precipitation: OPERATIONAL_CLIMATE_LIMITS.precipitationMax,
    }))).toBe(true);

    expect(candidateHasOperationalValues(candidate({
      et0_calculated: OPERATIONAL_CLIMATE_LIMITS.et0Max + 0.01,
    }))).toBe(false);

    expect(candidateHasOperationalValues(candidate({
      precipitation: OPERATIONAL_CLIMATE_LIMITS.precipitationMax + 0.01,
    }))).toBe(false);
  });

  it("mantém dados de modelo apenas em diagnóstico, sem aprovação operacional automática", () => {
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "model_estimate" }))).toBe(false);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "historical_grid" }))).toBe(false);
  });

  it("aprova automaticamente apenas dado observado/manual com qualidade ok e faixa física válida", () => {
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "observed" }))).toBe(true);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "manual" }))).toBe(true);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "observed", data_quality: "degraded" }))).toBe(false);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "observed", et0_calculated: 16 }))).toBe(false);
  });
});
