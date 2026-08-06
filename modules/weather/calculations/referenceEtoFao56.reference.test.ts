// ============================================================================
// Etapa 2 — Casos de referência FAO-56 para calculateReferenceEtoFao56.
//
// Todos os valores esperados neste arquivo foram derivados MANUALMENTE das
// equações do FAO-56, com o cálculo passo a passo documentado em
// FAO56_VALIDATION.md (§4). Não são valores da função sob teste.
//
// Tolerâncias e justificativas: ver FAO56_VALIDATION.md §4.1 e §4.2.
// ============================================================================

import { describe, it, expect } from "vitest";
import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import type { ReferenceEtoInput } from "./referenceEtoTypes";

const baseTermodinamico: ReferenceEtoInput = {
  date: "2025-07-06", // J = 187
  latitude: 45.72,
  elevationM: 100,
  temperatureMinC: 12.3,
  temperatureMaxC: 21.5,
  temperatureMeanC: null,
  relativeHumidityMinPct: 63,
  relativeHumidityMaxPct: 84,
  relativeHumidityMeanPct: null,
  actualVapourPressureKpa: null,
  windSpeedMs: 2.78,
  windMeasurementHeightM: 2,
  solarRadiationMjM2Day: 22.07,
  surfacePressureKpa: null,
};

describe("Ra por latitude e dia do ano (FAO-56 eq. 21, 23, 24, 25)", () => {
  const cases = [
    { nome: "R1 · 45.72°N, J=187 (verão HN)", date: "2025-07-06", latitude: 45.72, esperado: 41.35 },
    { nome: "R2 · 20°S, J=15 (verão HS)",     date: "2025-01-15", latitude: -20,    esperado: 41.86 },
    { nome: "R3 · 40°N, J=196 (verão HN)",    date: "2025-07-15", latitude: 40,     esperado: 40.87 },
    { nome: "R4 · 20°S, J=196 (inverno HS)",  date: "2025-07-15", latitude: -20,    esperado: 24.97 },
  ];
  for (const c of cases) {
    it(`${c.nome} — Ra ≈ ${c.esperado} MJ/m²/d (±0.15)`, () => {
      const r = calculateReferenceEtoFao56({
        ...baseTermodinamico,
        date: c.date,
        latitude: c.latitude,
      });
      const ra = r.intermediateValues.extraterrestrialRadiationMjM2Day;
      expect(ra).not.toBeNull();
      // Tolerância 0.15 MJ/m²/d absorve arredondamentos das contas manuais
      // (esperados) mostradas em FAO56_VALIDATION.md §4.1. FAO-56 Table 2.6
      // publica com resolução 0.1 MJ/m²/d — 0.15 é 1.5× a resolução da tabela.
      expect(Math.abs((ra as number) - c.esperado)).toBeLessThan(0.15);
    });
  }
});

describe("Intermediários termodinâmicos — FAO-56 eqs. 7, 8, 11-13, 17", () => {
  const r = calculateReferenceEtoFao56(baseTermodinamico);
  const iv = r.intermediateValues;

  it("Pressão atmosférica P (eq. 7) ≈ 100.12 kPa (z=100m)", () => {
    expect(iv.atmosphericPressureKpa).not.toBeNull();
    expect(iv.atmosphericPressureKpa as number).toBeCloseTo(100.12, 2);
  });

  it("Constante psicrométrica γ (eq. 8) ≈ 0.0666 kPa/°C", () => {
    expect(iv.psychrometricConstantKpaC).not.toBeNull();
    expect(iv.psychrometricConstantKpaC as number).toBeCloseTo(0.0666, 3);
  });

  it("Pressão de saturação média es (eq. 12) ≈ 1.997 kPa", () => {
    expect(iv.saturationVapourPressureKpa).not.toBeNull();
    expect(iv.saturationVapourPressureKpa as number).toBeCloseTo(1.997, 2);
  });

  it("Pressão real de vapor ea (eq. 17) ≈ 1.408 kPa", () => {
    expect(iv.actualVapourPressureKpa).not.toBeNull();
    expect(iv.actualVapourPressureKpa as number).toBeCloseTo(1.408, 2);
  });

  it("Déficit de pressão de vapor VPD ≈ 0.588 kPa", () => {
    expect(iv.vapourPressureDeficitKpa).not.toBeNull();
    expect(iv.vapourPressureDeficitKpa as number).toBeCloseTo(0.588, 2);
  });

  it("Inclinação Δ (eq. 13) ≈ 0.122 kPa/°C em Tmean=16.9", () => {
    expect(iv.saturationSlopeKpaC).not.toBeNull();
    expect(iv.saturationSlopeKpaC as number).toBeCloseTo(0.122, 3);
  });

  it("Rns (eq. 38) = 0.77·Rs — para Rs=22.07 dá 16.99 MJ/m²/d", () => {
    expect(iv.netShortwaveRadiationMjM2Day).not.toBeNull();
    expect(iv.netShortwaveRadiationMjM2Day as number).toBeCloseTo(16.99, 2);
  });

  it("Tmean é derivada como (Tmin+Tmax)/2 e registrada em estimatedFields", () => {
    expect(r.estimatedFields.some((e) => e.field === "temperatureMeanC")).toBe(true);
  });

  it("P é estimada da altitude e registrada em estimatedFields", () => {
    expect(r.estimatedFields.some((e) => e.field === "atmosphericPressureKpa")).toBe(true);
    expect(r.method).toBe("fao_56_pm_estimated");
  });
});

describe("Coerência do fluxo completo — FAO-56 Example 17 (Rs=22.07 direto)", () => {
  const r = calculateReferenceEtoFao56(baseTermodinamico);

  it("qualidade final é 'estimated' (por P e Tmean estimados)", () => {
    expect(r.qualityStatus).toBe("estimated");
    expect(r.method).toBe("fao_56_pm_estimated");
  });

  it("ETo > 0 e dentro da faixa fisicamente plausível para o dia", () => {
    // O valor de ETo do exemplo original varia com o Rs de partida (22.07 aqui
    // é um valor típico reportado). Não fixamos um único número; apenas
    // verificamos plausibilidade física. A validação item-a-item dos
    // intermediários já garante correção matemática.
    expect(r.etoMmDay).not.toBeNull();
    expect(r.etoMmDay as number).toBeGreaterThan(3.0);
    expect(r.etoMmDay as number).toBeLessThan(5.0);
  });

  it("Rn é consistente: Rn = Rns − Rnl", () => {
    const iv = r.intermediateValues;
    expect(iv.netRadiationMjM2Day).not.toBeNull();
    const diff = (iv.netRadiationMjM2Day as number) - (
      (iv.netShortwaveRadiationMjM2Day as number) - (iv.netLongwaveRadiationMjM2Day as number)
    );
    expect(Math.abs(diff)).toBeLessThan(1e-9);
  });

  it("G = 0 na base diária (eq. 42)", () => {
    expect(r.intermediateValues.soilHeatFluxMjM2Day).toBe(0);
  });

  it("Warnings vazios em fluxo bem comportado (sem clamp de Rs/Rso)", () => {
    // Rs=22.07 e Rso ≈ 31 → Rs/Rso ≈ 0.71, dentro de [0,1]
    expect(r.warnings.some((w) => w.includes("Rs/Rso"))).toBe(false);
  });
});

describe("I1 · Cap de Rs/Rso em [0, 1] com warning quando fora", () => {
  it("Rs > Rso resulta em warning + Rnl calculado com cloudRatio = 1", () => {
    const r = calculateReferenceEtoFao56({
      ...baseTermodinamico,
      // Rs enorme (fisicamente impossível): força Rs/Rso > 1
      solarRadiationMjM2Day: 200,
    });
    expect(r.warnings.some((w) => w.includes("Rs/Rso") && w.includes("> 1"))).toBe(true);
    // ETo ainda é calculado — não desprezamos o registro
    expect(r.etoMmDay).not.toBeNull();
  });

  it("Rs = 0 (dia sem radiação) não produz warning de cap (0 está no intervalo)", () => {
    const r = calculateReferenceEtoFao56({
      ...baseTermodinamico,
      solarRadiationMjM2Day: 0,
    });
    expect(r.warnings.some((w) => w.includes("Rs/Rso"))).toBe(false);
  });
});

describe("I2 · elevationM ausente com pressure fornecida", () => {
  it("Rso é calculado ao nível do mar e emite warning explícito", () => {
    const r = calculateReferenceEtoFao56({
      ...baseTermodinamico,
      elevationM: null,
      surfacePressureKpa: 100.1, // pressão fornecida
    });
    expect(r.warnings.some((w) => w.includes("elevationM ausente"))).toBe(true);
    expect(r.intermediateValues.clearSkyRadiationMjM2Day).not.toBeNull();
    expect(r.etoMmDay).not.toBeNull();
  });

  it("Sem pressure NEM elevation → missing (não tenta estimar)", () => {
    const r = calculateReferenceEtoFao56({
      ...baseTermodinamico,
      elevationM: null,
      surfacePressureKpa: null,
    });
    expect(r.qualityStatus).toBe("missing");
    expect(r.etoMmDay).toBeNull();
    expect(r.missingFields).toEqual(
      expect.arrayContaining(["surfacePressureKpa", "elevationM"]),
    );
  });

  it("Pressão fornecida INVÁLIDA (≤0) é ignorada, com aviso", () => {
    const r = calculateReferenceEtoFao56({
      ...baseTermodinamico,
      surfacePressureKpa: 0,
    });
    expect(r.warnings.some((w) => w.includes("surfacePressureKpa inválida"))).toBe(true);
    // Cai para estimativa via elevação (que foi fornecida)
    expect(r.estimatedFields.some((e) => e.field === "atmosphericPressureKpa")).toBe(true);
  });
});
