import { describe, it, expect } from "vitest";
import {
  resolveKl,
  resolveKsFunction,
  resolveKlFunction,
  resolveItnFraction,
  applyKlToKc,
  applyItnToDepth,
  calculateKs,
  calculateKl,
  shouldIrrigateAtStressPoint,
  sensoryNoteToPercentCC,
  sensoryNoteCategory,
  SOIL_SENSORY_SCALE,
} from "./parcel-motor-adapter";

// ── resolveKl ──────────────────────────────────────────────────────────────

describe("resolveKl — cadeia override parcela > cultura > default 1.0", () => {
  it("override da parcela vence", () => {
    expect(resolveKl({ kl_override: 0.7 }, { kl: 0.9 })).toBe(0.7);
  });
  it("sem override, usa Kl da cultura", () => {
    expect(resolveKl({ kl_override: null }, { kl: 0.85 })).toBe(0.85);
  });
  it("sem nada, retorna 1.0 (pivô central)", () => {
    expect(resolveKl({ kl_override: null }, { kl: null })).toBe(1.0);
  });
  it("valores zero ou negativos são ignorados", () => {
    expect(resolveKl({ kl_override: 0 }, { kl: 0.9 })).toBe(0.9);
    expect(resolveKl({ kl_override: -1 }, { kl: null })).toBe(1.0);
  });
});

// ── resolveKsFunction ──────────────────────────────────────────────────────

describe("resolveKsFunction — cadeia parcela > fase > cultura > linear", () => {
  it("override da parcela vence", () => {
    const r = resolveKsFunction(
      { ks_function_override: "exponential" },
      { ks_function: "sigmoid" },
      { ks_function: "none" },
    );
    expect(r).toBe("exponential");
  });
  it("sem parcela, usa fase", () => {
    const r = resolveKsFunction(
      { ks_function_override: null },
      { ks_function: "sigmoid" },
      { ks_function: "none" },
    );
    expect(r).toBe("sigmoid");
  });
  it("sem parcela e fase, usa cultura", () => {
    const r = resolveKsFunction(
      { ks_function_override: null },
      null,
      { ks_function: "exponential" },
    );
    expect(r).toBe("exponential");
  });
  it("nada preenchido → linear (padrão FAO-56)", () => {
    expect(resolveKsFunction({ ks_function_override: null }, null, { ks_function: null })).toBe("linear");
  });
});

// ── resolveItnFraction ─────────────────────────────────────────────────────

describe("resolveItnFraction", () => {
  it("100% → 1.0", () => {
    expect(resolveItnFraction({ itn_pct: 100 })).toBe(1.0);
  });
  it("80% (irrigação deficitária) → 0.8", () => {
    expect(resolveItnFraction({ itn_pct: 80 })).toBeCloseTo(0.8);
  });
  it("null → 1.0 (default)", () => {
    expect(resolveItnFraction({ itn_pct: null })).toBe(1.0);
    expect(resolveItnFraction(null)).toBe(1.0);
  });
  it("valores negativos ignorados", () => {
    expect(resolveItnFraction({ itn_pct: -20 })).toBe(1.0);
  });
});

// ── applyKlToKc / applyItnToDepth ──────────────────────────────────────────

describe("aplicação de Kl e ITN", () => {
  it("Kc × Kl (gotejamento reduz demanda)", () => {
    expect(applyKlToKc(1.15, 0.6)).toBeCloseTo(0.69);
  });
  it("lâmina × ITN (fase não-crítica reduz reposição)", () => {
    expect(applyItnToDepth(10, 0.7)).toBeCloseTo(7);
  });
});

// ── calculateKs — cada função ──────────────────────────────────────────────

describe("calculateKs — sem estresse (depleção ≤ p)", () => {
  it("linear: Ks = 1 quando depleção ≤ p", () => {
    expect(calculateKs(0.3, 0.5, "linear")).toBe(1);
    expect(calculateKs(0.5, 0.5, "linear")).toBe(1);
  });
  it("todas as funções concordam nessa zona", () => {
    for (const fn of ["linear", "exponential", "sigmoid"] as const) {
      expect(calculateKs(0.3, 0.5, fn)).toBe(1);
    }
  });
});

describe("calculateKs — depleção total (100%)", () => {
  it("linear: Ks = 0 na depleção total", () => {
    expect(calculateKs(1, 0.5, "linear")).toBe(0);
  });
  it("none: sempre 1", () => {
    expect(calculateKs(1, 0.5, "none")).toBe(1);
  });
});

describe("calculateKs — na zona de estresse (p < d < 1)", () => {
  it("linear: decai proporcionalmente entre p e 1", () => {
    // depleção 0.75, p=0.5 → excess = (0.75-0.5)/(1-0.5) = 0.5 → Ks = 0.5
    expect(calculateKs(0.75, 0.5, "linear")).toBeCloseTo(0.5);
  });
  it("exponencial decai mais rápido que linear (mesma condição)", () => {
    const ksLin = calculateKs(0.75, 0.5, "linear");
    const ksExp = calculateKs(0.75, 0.5, "exponential");
    expect(ksExp).toBeLessThan(ksLin);
  });
  it("sigmoid entre 0 e 1 em qualquer ponto", () => {
    const ks = calculateKs(0.7, 0.5, "sigmoid");
    expect(ks).toBeGreaterThan(0);
    expect(ks).toBeLessThan(1);
  });
});

// ── shouldIrrigateAtStressPoint ────────────────────────────────────────────

describe("shouldIrrigateAtStressPoint", () => {
  it("false por padrão (irriga preventivamente)", () => {
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: false }, 0.8, 0.5)).toBe(false);
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: null }, 0.8, 0.5)).toBe(false);
  });
  it("true e depleção ≥ p → deve irrigar", () => {
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: true }, 0.6, 0.5)).toBe(true);
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: true }, 1.0, 0.5)).toBe(true);
  });
  it("true e depleção < p → aguarda", () => {
    expect(shouldIrrigateAtStressPoint({ stress_point_irrigation: true }, 0.3, 0.5)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SPRINT 14 · Etapa 2 — Ks/Kl expandidos + escala sensorial
// ═══════════════════════════════════════════════════════════════════════

// ── resolveKsFunction · nova opção "fao33" ────────────────────────────────

describe("resolveKsFunction — aceita fao33 (Doorenbos-Kassam)", () => {
  it("cultura configurada com fao33 → retorna fao33", () => {
    const r = resolveKsFunction(
      { ks_function_override: null },
      { ks_function: null },
      { ks_function: "fao33" },
    );
    expect(r).toBe("fao33");
  });

  it("override da parcela fao33 vence sobre outros", () => {
    const r = resolveKsFunction(
      { ks_function_override: "fao33" },
      { ks_function: "linear" },
      { ks_function: "sigmoid" },
    );
    expect(r).toBe("fao33");
  });

  it("valor inválido é ignorado, fallback linear", () => {
    const r = resolveKsFunction(
      { ks_function_override: null },
      { ks_function: "banana" },
      { ks_function: null },
    );
    expect(r).toBe("linear");
  });
});

// ── resolveKlFunction ─────────────────────────────────────────────────────

describe("resolveKlFunction", () => {
  it("retorna a função configurada na cultura", () => {
    expect(resolveKlFunction({ kl_function: "fereres" })).toBe("fereres");
    expect(resolveKlFunction({ kl_function: "keller_karmeli" })).toBe("keller_karmeli");
    expect(resolveKlFunction({ kl_function: "freitas" })).toBe("freitas");
    expect(resolveKlFunction({ kl_function: "bernardo" })).toBe("bernardo");
    expect(resolveKlFunction({ kl_function: "custom" })).toBe("custom");
  });
  it("null ou inválido → constant (default)", () => {
    expect(resolveKlFunction({ kl_function: null })).toBe("constant");
    expect(resolveKlFunction({ kl_function: "banana" })).toBe("constant");
  });
});

// ── calculateKs · FAO 33 ──────────────────────────────────────────────────

describe("calculateKs — FAO 33 (Doorenbos-Kassam)", () => {
  it("Ky = 1.0 é equivalente ao linear FAO-56", () => {
    const ksFao = calculateKs(0.75, 0.5, "fao33", 1.0);
    const ksLin = calculateKs(0.75, 0.5, "linear");
    expect(ksFao).toBeCloseTo(ksLin, 3);
  });

  it("Ky = 1.5 (mais sensível) → Ks menor que linear", () => {
    // excess = (0.75-0.5)/(1-0.5) = 0.5
    // Ks_linear = 1 - 0.5 = 0.5
    // Ks_fao33 (Ky=1.5) = 1 - 1.5*0.5 = 0.25
    const ks = calculateKs(0.75, 0.5, "fao33", 1.5);
    expect(ks).toBeCloseTo(0.25, 3);
  });

  it("Ky = 0.5 (tolerante) → Ks maior que linear", () => {
    // excess = 0.5, Ks = 1 - 0.5*0.5 = 0.75
    const ks = calculateKs(0.75, 0.5, "fao33", 0.5);
    expect(ks).toBeCloseTo(0.75, 3);
  });

  it("sem Ky informado usa Ky padrão 1.0 (= linear)", () => {
    const ks = calculateKs(0.75, 0.5, "fao33", null);
    const ksLin = calculateKs(0.75, 0.5, "linear");
    expect(ks).toBeCloseTo(ksLin, 3);
  });

  it("Ky = 2.5 + depleção alta → Ks satura em 0 (nunca negativo)", () => {
    const ks = calculateKs(0.9, 0.5, "fao33", 2.5);
    expect(ks).toBe(0);
  });
});

// ── calculateKl · 6 funções ───────────────────────────────────────────────

describe("calculateKl — constant", () => {
  it("retorna o valor fornecido", () => {
    expect(calculateKl("constant", { constantValue: 0.85 })).toBeCloseTo(0.85);
    expect(calculateKl("constant", { constantValue: 1.0 })).toBe(1.0);
  });
  it("sem valor → 1.0 (pivô central)", () => {
    expect(calculateKl("constant", {})).toBe(1.0);
  });
  it("clamp 0-1", () => {
    expect(calculateKl("constant", { constantValue: 1.5 })).toBe(1.0);
    expect(calculateKl("constant", { constantValue: -0.2 })).toBe(0);
  });
});

describe("calculateKl — Fereres (área sombreada)", () => {
  it("Pc = 85% → Kl = 1.0 (satura)", () => {
    expect(calculateKl("fereres", { shadedAreaPct: 85 })).toBe(1.0);
  });
  it("Pc = 42.5% → Kl ≈ 0.5", () => {
    expect(calculateKl("fereres", { shadedAreaPct: 42.5 })).toBeCloseTo(0.5, 2);
  });
  it("Pc = 100% → Kl = 1.0 (satura)", () => {
    expect(calculateKl("fereres", { shadedAreaPct: 100 })).toBe(1.0);
  });
  it("Pc = 68% (típico algodão em floração) → Kl = 0.80", () => {
    // 68 / 85 = 0.8
    expect(calculateKl("fereres", { shadedAreaPct: 68 })).toBeCloseTo(0.8, 2);
  });
  it("sem Pc → 1.0 (default seguro)", () => {
    expect(calculateKl("fereres", {})).toBe(1.0);
  });
});

describe("calculateKl — Keller-Karmeli (área molhada)", () => {
  it("Pw = 1.0 (todo molhado, pivô central) → Kl = 1.0", () => {
    expect(calculateKl("keller_karmeli", { wettedAreaFraction: 1.0 })).toBe(1.0);
  });
  it("Pw = 0.5 (gotejamento) → Kl = 0.5", () => {
    expect(calculateKl("keller_karmeli", { wettedAreaFraction: 0.5 })).toBe(0.5);
  });
  it("sem Pw → 1.0", () => {
    expect(calculateKl("keller_karmeli", {})).toBe(1.0);
  });
});

describe("calculateKl — Freitas (Vermeiren-Jobling)", () => {
  it("Pw = 0.5 → Kl = 0.1 + 0.5 = 0.6", () => {
    expect(calculateKl("freitas", { wettedAreaFraction: 0.5 })).toBeCloseTo(0.6);
  });
  it("Pw = 0.9 → Kl = 1.0 (clamp)", () => {
    expect(calculateKl("freitas", { wettedAreaFraction: 0.95 })).toBe(1.0);
  });
  it("Pw = 0.0 → Kl = 0.1", () => {
    expect(calculateKl("freitas", { wettedAreaFraction: 0 })).toBeCloseTo(0.1);
  });
});

describe("calculateKl — Bernardo (2019)", () => {
  it("Pw = 1.0 → Kl = 1.0", () => {
    expect(calculateKl("bernardo", { wettedAreaFraction: 1.0 })).toBe(1.0);
  });
  it("Pw = 0.5 → Kl = 0.5 + 0.15*(1-0.5) = 0.575", () => {
    expect(calculateKl("bernardo", { wettedAreaFraction: 0.5 })).toBeCloseTo(0.575);
  });
  it("Pw = 0 → Kl = 0.15", () => {
    expect(calculateKl("bernardo", { wettedAreaFraction: 0 })).toBeCloseTo(0.15);
  });
});

describe("calculateKl — comparação entre métodos com mesma Pw = 0.5", () => {
  it("Keller-Karmeli = 0.5 (base)", () => {
    expect(calculateKl("keller_karmeli", { wettedAreaFraction: 0.5 })).toBe(0.5);
  });
  it("Bernardo > K-K (mais conservador)", () => {
    const kk = calculateKl("keller_karmeli", { wettedAreaFraction: 0.5 });
    const bn = calculateKl("bernardo", { wettedAreaFraction: 0.5 });
    expect(bn).toBeGreaterThan(kk);
  });
  it("Freitas > K-K (soma 0,1)", () => {
    const fr = calculateKl("freitas", { wettedAreaFraction: 0.5 });
    expect(fr).toBeGreaterThan(0.5);
  });
});

// ── Escala sensorial ─────────────────────────────────────────────────────

describe("SOIL_SENSORY_SCALE — 17 entradas de 1.0 a 9.0 passo 0.5", () => {
  it("tem exatamente 17 entradas", () => {
    expect(SOIL_SENSORY_SCALE).toHaveLength(17);
  });
  it("nota 1.0 = 100% CC (capacidade de campo)", () => {
    const entry = SOIL_SENSORY_SCALE.find((s) => s.note === 1.0);
    expect(entry?.moisturePctCc).toBe(100);
    expect(entry?.category).toBe("umido");
  });
  it("nota 7.0 = 50% CC (ponto crítico AFD)", () => {
    const entry = SOIL_SENSORY_SCALE.find((s) => s.note === 7.0);
    expect(entry?.moisturePctCc).toBe(50);
    expect(entry?.category).toBe("critico");
  });
  it("nota 9.0 = 18% CC (próximo PMP)", () => {
    const entry = SOIL_SENSORY_SCALE.find((s) => s.note === 9.0);
    expect(entry?.moisturePctCc).toBe(18);
    expect(entry?.category).toBe("seco");
  });
  it("é monotonicamente decrescente em %CC", () => {
    for (let i = 1; i < SOIL_SENSORY_SCALE.length; i++) {
      expect(SOIL_SENSORY_SCALE[i].moisturePctCc).toBeLessThan(SOIL_SENSORY_SCALE[i - 1].moisturePctCc);
    }
  });
});

describe("sensoryNoteToPercentCC — conversão + interpolação", () => {
  it("nota exata (1.0) → valor tabelado (100%)", () => {
    expect(sensoryNoteToPercentCC(1.0)).toBe(100);
  });
  it("nota exata (5.0) → 67%", () => {
    expect(sensoryNoteToPercentCC(5.0)).toBe(67);
  });
  it("nota fracionária entre 5.0 e 5.5 → interpolação linear", () => {
    // 5.0 = 67, 5.5 = 63 → 5.25 = 65
    expect(sensoryNoteToPercentCC(5.25)).toBeCloseTo(65, 1);
  });
  it("nota fora do range (< 1) → null", () => {
    expect(sensoryNoteToPercentCC(0.5)).toBeNull();
    expect(sensoryNoteToPercentCC(9.5)).toBeNull();
  });
  it("NaN ou undefined → null", () => {
    expect(sensoryNoteToPercentCC(NaN)).toBeNull();
  });
});

describe("sensoryNoteCategory", () => {
  it("nota 2 → umido", () => {
    expect(sensoryNoteCategory(2.0)).toBe("umido");
  });
  it("nota 5 → moderado", () => {
    expect(sensoryNoteCategory(5.0)).toBe("moderado");
  });
  it("nota 7 → critico", () => {
    expect(sensoryNoteCategory(7.0)).toBe("critico");
  });
  it("nota 8.5 → seco", () => {
    expect(sensoryNoteCategory(8.5)).toBe("seco");
  });
  it("nota fora do range → null", () => {
    expect(sensoryNoteCategory(0)).toBeNull();
    expect(sensoryNoteCategory(10)).toBeNull();
  });
});
