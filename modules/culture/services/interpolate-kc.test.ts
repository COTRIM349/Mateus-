import { describe, expect, it } from "vitest";
import { generateDailyKcCurve, interpolateKc, type CulturePhase } from "./culture.service";
import { buildPhasesFromTemplate } from "./culture-phases";

/** Exemplo do spec (Etapa E): Kc 0,40 → 1,15 em 30 dias. */
const SPEC_PHASE: CulturePhase[] = [
  {
    phase_order: 1,
    name: "Desenvolvimento",
    days_after_plant: 0,
    duration_days: 30,
    kc_start: 0.4,
    kc_end: 1.15,
    root_depth_start: 0.1,
    root_depth_end: 0.4,
    depletion_factor: 0.5,
  },
];

describe("interpolateKc — contrato linear (Etapa E)", () => {
  it("Kc(d) = Kc_ini + (Kc_fim − Kc_ini) × (dias decorridos / duração)", () => {
    expect(interpolateKc(SPEC_PHASE, 0)).toBe(0.4);
    expect(interpolateKc(SPEC_PHASE, 15)).toBe(0.775);
    expect(interpolateKc(SPEC_PHASE, 29)).toBe(1.125);
  });

  it("não salta para o Kc final no primeiro dia da fase", () => {
    expect(interpolateKc(SPEC_PHASE, 0)).toBe(SPEC_PHASE[0].kc_start);
  });

  it("fica limitado aos extremos da fase (não extrapola)", () => {
    const decreasing: CulturePhase[] = [
      { ...SPEC_PHASE[0], kc_start: 1.15, kc_end: 0.5 },
    ];
    expect(interpolateKc(decreasing, 0)).toBe(1.15);
    expect(interpolateKc(decreasing, 15)).toBe(0.825);
    expect(interpolateKc(decreasing, 100)).toBe(0.5);
  });

  it("sem fases retorna 1.0", () => {
    expect(interpolateKc([], 10)).toBe(1);
  });
});

describe("curva contínua de Kc nos modelos soja e algodão", () => {
  it("soja: fronteiras de fase encostam (sem degrau brusco)", () => {
    const phases = buildPhasesFromTemplate("soja");
    for (let i = 1; i < phases.length; i++) {
      const prevEnd = phases[i - 1].days_after_plant + phases[i - 1].duration_days;
      const kcPrevLast = interpolateKc(phases, prevEnd - 1);
      const kcNextFirst = interpolateKc(phases, prevEnd);
      expect(phases[i].kc_start).toBeCloseTo(phases[i - 1].kc_end, 5);
      expect(Math.abs(kcNextFirst - kcPrevLast)).toBeLessThan(0.08);
    }
  });

  it("algodão: a curva diária não tem salto maior que o passo intrafase", () => {
    const phases = buildPhasesFromTemplate("algodao");
    const curve = generateDailyKcCurve(phases, 180);
    let maxIntra = 0;
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].phase === curve[i - 1].phase) {
        maxIntra = Math.max(maxIntra, Math.abs(curve[i].kc - curve[i - 1].kc));
      }
    }
    for (let i = 1; i < curve.length; i++) {
      const jump = Math.abs(curve[i].kc - curve[i - 1].kc);
      expect(jump).toBeLessThanOrEqual(maxIntra + 0.001);
    }
  });

  it("reconstrói Kc, dia e fase para a parcela", () => {
    const phases = buildPhasesFromTemplate("soja");
    const point = generateDailyKcCurve(phases, 120).find((p) => p.day === 60);
    expect(point?.phase).toBe("Formação de vagens");
    expect(point?.kc).toBe(interpolateKc(phases, 60));
  });
});
