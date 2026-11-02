import { describe, expect, it } from "vitest";
import {
  buildDecisionAudit,
  decisionDataQuality,
  decisionSummary,
} from "./central-management-decision";
import type { BalanceDay, PivotHydricState } from "./pivot-engine-v2";

function day(overrides: Partial<BalanceDay> = {}): BalanceDay {
  return {
    date: "2026-11-02",
    dae: 30,
    phase: "Vegetativo",
    kc: 0.85,
    kcAdjusted: 0.85,
    ks: 1,
    kl: 1,
    et0: 6,
    etcPotential: 5.1,
    etc: 5.1,
    etcFormula: "",
    ky: 0.8,
    yieldRisk: 0,
    precipitation: 0,
    effectivePrecipitation: 0,
    peFormula: "",
    irrigation: 0,
    effectiveIrrigation: 0,
    rootDepthEstimated: 0.6,
    rootDepth: 0.6,
    adt: 60,
    afd: 24,
    cadProfileMm: 90,
    craProfileMm: 36,
    storage: 48,
    surplus: 0,
    deficit: 12,
    depletion: 0.2,
    fieldCapacity: 0.3,
    wiltingPoint: 0.15,
    safetyMoistureMm: 36,
    moisturePctCc: 90,
    safetyPctCc: 82,
    balanceFormula: "",
    status: "verde",
    mapStatus: "boa_umidade",
    shouldIrrigate: false,
    recommendedNetDepth: 0,
    recommendedGrossDepth: 0,
    recommendedVolume: 0,
    estimatedIrrigationTime: 0,
    recommendationReason: "",
    ...overrides,
  };
}

function state(overrides: Partial<PivotHydricState> = {}): PivotHydricState {
  const current = day();
  return {
    pivotId: "p1",
    pivotName: "Pivô 01",
    cultureName: "Soja",
    varietyName: "COMBATE IPRO",
    seasonName: "26/27",
    area: 150,
    latitude: -14,
    longitude: -42,
    parcelId: "a1",
    plantingDate: "2026-10-01",
    soilName: "Latossolo",
    radiusMeters: 690,
    sheetIncomplete: false,
    startAngleDeg: null,
    endAngleDeg: null,
    parcelName: null,
    current,
    history: [current],
    initialConditionAssumed: false,
    ...overrides,
  };
}

describe("decisão auditável da Central de Manejo", () => {
  it("marca como completo quando os pré-requisitos operacionais estão presentes", () => {
    expect(decisionDataQuality(state()).level).toBe("completo");
  });

  it("sinaliza atenção quando a condição inicial foi assumida", () => {
    const quality = decisionDataQuality(state({ initialConditionAssumed: true }));
    expect(quality.level).toBe("atencao");
    expect(quality.reasons.join(" ")).toContain("capacidade de campo");
  });

  it("explica uma recomendação de irrigação com CAD, déficit e ETc", () => {
    const current = day({
      storage: 30,
      deficit: 30,
      afd: 24,
      shouldIrrigate: true,
      recommendedGrossDepth: 35.3,
      status: "vermelho",
    });
    const summary = decisionSummary(state({ current, history: [current] }));
    expect(summary.title).toContain("Irrigar");
    expect(summary.detail).toContain("CAD");
    expect(summary.detail).toContain("déficit");
    expect(summary.detail).toContain("ETc");
  });

  it("gera auditoria dos últimos dias em ordem decrescente", () => {
    const history = [
      day({ date: "2026-10-31" }),
      day({ date: "2026-11-01", deficit: 18 }),
      day({ date: "2026-11-02", deficit: 22 }),
    ];
    const audit = buildDecisionAudit(state({ current: history[2], history }), 2);
    expect(audit).toHaveLength(2);
    expect(audit[0].date).toBe("2026-11-02");
    expect(audit[1].date).toBe("2026-11-01");
  });
});
