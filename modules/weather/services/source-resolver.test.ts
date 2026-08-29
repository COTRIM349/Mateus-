import { describe, expect, it } from "vitest";
import {
  candidateCanBeOperationallyApproved,
  candidateHasOperationalValues,
  isTrustedOperationalModelOrigin,
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
    origin: "open_meteo",
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

  it("reconhece modelos homologados e rejeita origem desconhecida", () => {
    expect(isTrustedOperationalModelOrigin("open-meteo")).toBe(true);
    expect(isTrustedOperationalModelOrigin("open_meteo")).toBe(true);
    expect(isTrustedOperationalModelOrigin(" OPEN_METEO ")).toBe(true);
    expect(isTrustedOperationalModelOrigin("meteoblue")).toBe(true);
    expect(isTrustedOperationalModelOrigin("unknown-model")).toBe(false);
  });

  it("aprova Open-Meteo e Meteoblue após quality gate sem tratá-los como observado", () => {
    expect(candidateCanBeOperationallyApproved(candidate({
      data_kind: "model_estimate",
      origin: "open_meteo",
    }))).toBe(true);
    expect(candidateCanBeOperationallyApproved(candidate({
      data_kind: "model_estimate",
      origin: "meteoblue",
    }))).toBe(true);
  });

  it("mantém modelo desconhecido e grade histórica apenas em diagnóstico", () => {
    expect(candidateCanBeOperationallyApproved(candidate({
      data_kind: "model_estimate",
      origin: "unknown-model",
    }))).toBe(false);
    expect(candidateCanBeOperationallyApproved(candidate({
      data_kind: "historical_grid",
      origin: "open_meteo",
    }))).toBe(false);
  });

  it("não aprova modelo virtual degradado ou fora da faixa física", () => {
    expect(candidateCanBeOperationallyApproved(candidate({ data_quality: "degraded" }))).toBe(false);
    expect(candidateCanBeOperationallyApproved(candidate({ et0_calculated: 16 }))).toBe(false);
    expect(candidateCanBeOperationallyApproved(candidate({ precipitation: 201 }))).toBe(false);
  });

  it("continua aprovando dado observado/manual com qualidade ok e faixa física válida", () => {
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "observed", origin: "station" }))).toBe(true);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "manual", origin: "manual" }))).toBe(true);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "observed", data_quality: "degraded" }))).toBe(false);
    expect(candidateCanBeOperationallyApproved(candidate({ data_kind: "observed", et0_calculated: 16 }))).toBe(false);
  });
});
