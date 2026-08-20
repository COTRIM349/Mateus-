import { describe, expect, it } from "vitest";
import { identifyPhase, validatePhases } from "./culture.service";
import {
  ALGODAO_CYCLE_DAYS,
  ALGODAO_PHASE_TEMPLATE,
  SOJA_CYCLE_DAYS,
  SOJA_PHASE_TEMPLATE,
  buildPhasesFromTemplate,
  daysAfterPlanting,
  inferCultureKind,
  rebuildPhaseTimeline,
  scalePhaseDurations,
  totalPhaseDuration,
  validateManagementDates,
} from "./culture-phases";

describe("inferCultureKind", () => {
  it("reconhece soja pelo nome, não pelo grupo", () => {
    expect(inferCultureKind("Soja")).toBe("soja");
    expect(inferCultureKind("Soja RR TMG")).toBe("soja");
    expect(inferCultureKind("Glycine max")).toBe("soja");
  });

  it("reconhece algodão com acento e não trata toda fibra como algodão", () => {
    expect(inferCultureKind("Algodão")).toBe("algodao");
    expect(inferCultureKind("Algodao herbáceo")).toBe("algodao");
    expect(inferCultureKind("Gossypium hirsutum")).toBe("algodao");
    expect(inferCultureKind("Sisal")).toBe("outro");
    expect(inferCultureKind("Milho")).toBe("outro");
  });
});

describe("modelos soja e algodão", () => {
  it("soja tem 6 fases com nomes e chaves do cadastro", () => {
    expect(SOJA_PHASE_TEMPLATE).toHaveLength(6);
    expect(SOJA_PHASE_TEMPLATE.map((p) => p.name)).toEqual([
      "Emergência",
      "Vegetativo",
      "Florescimento",
      "Formação de vagens",
      "Enchimento de grãos",
      "Maturação",
    ]);
    expect(SOJA_PHASE_TEMPLATE.map((p) => p.phase_key)).toEqual([
      "emergencia",
      "vegetativo",
      "florescimento",
      "formacao_vagens",
      "enchimento_graos",
      "maturacao",
    ]);
    expect(totalPhaseDuration(SOJA_PHASE_TEMPLATE)).toBe(SOJA_CYCLE_DAYS);
  });

  it("algodão tem 7 fases com nomes e chaves do cadastro", () => {
    expect(ALGODAO_PHASE_TEMPLATE).toHaveLength(7);
    expect(ALGODAO_PHASE_TEMPLATE.map((p) => p.name)).toEqual([
      "Emergência",
      "Vegetativo",
      "Botões",
      "Florescimento",
      "Formação de maçãs",
      "Enchimento",
      "Maturação",
    ]);
    expect(ALGODAO_PHASE_TEMPLATE.map((p) => p.phase_key)).toEqual([
      "emergencia",
      "vegetativo",
      "botoes",
      "florescimento",
      "formacao_macas",
      "enchimento",
      "maturacao",
    ]);
    expect(totalPhaseDuration(ALGODAO_PHASE_TEMPLATE)).toBe(ALGODAO_CYCLE_DAYS);
  });

  it("armazena Kc, p, KL e Ky em cada fase do modelo", () => {
    for (const phase of [...SOJA_PHASE_TEMPLATE, ...ALGODAO_PHASE_TEMPLATE]) {
      expect(phase.kc_start).toBeGreaterThan(0);
      expect(phase.kc_end).toBeGreaterThan(0);
      expect(phase.depletion_factor).toBeGreaterThan(0);
      expect(phase.kl).toBe(1);
      expect(phase.ky).not.toBeNull();
      expect(phase.root_depth_end).toBeGreaterThanOrEqual(phase.root_depth_start);
    }
  });
});

describe("rebuildPhaseTimeline", () => {
  it("deriva DAP da soma sequencial das durações", () => {
    const rebuilt = rebuildPhaseTimeline(
      SOJA_PHASE_TEMPLATE.map((p, i) => ({ ...p, phase_order: i + 1, days_after_plant: 999 })),
    );
    expect(rebuilt.map((p) => p.days_after_plant)).toEqual([0, 10, 35, 55, 75, 105]);
    expect(rebuilt.at(-1)!.days_after_plant + rebuilt.at(-1)!.duration_days).toBe(120);
  });

  it("não deixa DAP sobreposto após reconstruir", () => {
    const rebuilt = rebuildPhaseTimeline(
      ALGODAO_PHASE_TEMPLATE.map((p, i) => ({ ...p, phase_order: i + 1 })),
    );
    const issues = validatePhases(rebuilt, ALGODAO_CYCLE_DAYS);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.some((i) => i.field.includes("overlap"))).toBe(false);
  });
});

describe("scalePhaseDurations", () => {
  it("ajusta soja de 120 para 150 dias sem perder fase nem zerar duração", () => {
    const scaled = scalePhaseDurations(
      SOJA_PHASE_TEMPLATE.map((p, i) => ({ ...p, phase_order: i + 1 })),
      150,
    );
    expect(scaled).toHaveLength(6);
    expect(totalPhaseDuration(scaled)).toBe(150);
    expect(scaled.every((p) => p.duration_days >= 1)).toBe(true);
    const rebuilt = rebuildPhaseTimeline(scaled);
    expect(validatePhases(rebuilt, 150).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("buildPhasesFromTemplate", () => {
  it("monta soja com DAP contínuo e identifyPhase no meio do ciclo", () => {
    const phases = buildPhasesFromTemplate("soja");
    expect(phases).toHaveLength(6);
    const mid = identifyPhase(phases, 60);
    expect(mid?.phase.name).toBe("Formação de vagens");
    expect(identifyPhase(phases, 0)?.phase.phase_key).toBe("emergencia");
    expect(identifyPhase(phases, 200)?.phase.phase_key).toBe("maturacao");
  });

  it("monta algodão e identifica botões pelo DAP", () => {
    const phases = buildPhasesFromTemplate("algodao");
    expect(phases).toHaveLength(7);
    const botoes = phases.find((p) => p.phase_key === "botoes")!;
    const id = identifyPhase(phases, botoes.days_after_plant + 1);
    expect(id?.phase.name).toBe("Botões");
  });
});

describe("daysAfterPlanting e manejo", () => {
  it("conta DAP a partir da data de plantio", () => {
    expect(daysAfterPlanting("2026-10-01", new Date("2026-10-11T15:00:00"))).toBe(10);
  });

  it("rejeita fim de manejo antes do início", () => {
    expect(
      validateManagementDates({
        plantingDate: "2026-10-01",
        managementStart: "2026-10-10",
        managementEnd: "2026-10-05",
      }),
    ).toMatch(/anterior ao início/);
  });
});
