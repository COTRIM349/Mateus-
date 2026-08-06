// ============================================================================
// Etapa 2 — Testes de sensibilidade física do motor FAO-56.
//
// Verificam propriedades qualitativas (monotonicidade, sinal, coerência), não
// valores absolutos. Ver FAO56_VALIDATION.md §5.
// ============================================================================

import { describe, it, expect } from "vitest";
import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import type { ReferenceEtoInput } from "./referenceEtoTypes";

function base(overrides?: Partial<ReferenceEtoInput>): ReferenceEtoInput {
  return {
    date: "2025-07-06",
    latitude: -12,        // Cerrado (Oeste da Bahia)
    elevationM: 700,
    temperatureMinC: 18,
    temperatureMaxC: 30,
    temperatureMeanC: null,
    relativeHumidityMinPct: 40,
    relativeHumidityMaxPct: 85,
    relativeHumidityMeanPct: null,
    actualVapourPressureKpa: null,
    windSpeedMs: 2,
    windMeasurementHeightM: 2,
    solarRadiationMjM2Day: 18,
    surfacePressureKpa: null,
    ...overrides,
  };
}

function eto(overrides?: Partial<ReferenceEtoInput>): number {
  const r = calculateReferenceEtoFao56(base(overrides));
  expect(r.etoMmDay).not.toBeNull();
  return r.etoMmDay as number;
}

describe("Monotonicidade — ETo cresce com Rs, u2 e VPD", () => {
  it("ETo estritamente crescente com Rs (5 pontos)", () => {
    const rsSeq = [8, 12, 16, 20, 24];
    const vals = rsSeq.map((rs) => eto({ solarRadiationMjM2Day: rs }));
    for (let i = 1; i < vals.length; i += 1) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });

  it("ETo estritamente crescente com u2 (5 pontos)", () => {
    const uSeq = [0.5, 1.5, 3, 5, 8];
    const vals = uSeq.map((u) => eto({ windSpeedMs: u }));
    for (let i = 1; i < vals.length; i += 1) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });

  it("ETo aumenta quando VPD aumenta (RH cai)", () => {
    // Fixamos min/max de RH em pares que reduzem gradualmente ea
    const rhPairs: [number, number][] = [
      [80, 95],
      [60, 90],
      [40, 80],
      [25, 65],
      [15, 50],
    ];
    const vals = rhPairs.map(([mn, mx]) =>
      eto({ relativeHumidityMinPct: mn, relativeHumidityMaxPct: mx }),
    );
    for (let i = 1; i < vals.length; i += 1) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });
});

describe("Cenários físicos coerentes", () => {
  it("Quente-seco > quente-úmido (mesma T, Rs, u2)", () => {
    const seco = eto({
      temperatureMinC: 22,
      temperatureMaxC: 34,
      relativeHumidityMinPct: 20,
      relativeHumidityMaxPct: 55,
    });
    const umido = eto({
      temperatureMinC: 22,
      temperatureMaxC: 34,
      relativeHumidityMinPct: 65,
      relativeHumidityMaxPct: 95,
    });
    expect(seco).toBeGreaterThan(umido);
  });

  it("Baixa radiação → ETo menor", () => {
    const alta = eto({ solarRadiationMjM2Day: 25 });
    const baixa = eto({ solarRadiationMjM2Day: 5 });
    expect(alta).toBeGreaterThan(baixa);
  });

  it("Alta altitude → ETo levemente maior (γ menor, Rso maior)", () => {
    const baixa = eto({ elevationM: 100 });
    const alta = eto({ elevationM: 2500 });
    expect(alta).toBeGreaterThan(baixa);
  });

  it("Verão vs Inverno na mesma latitude (Cerrado 12°S)", () => {
    // Cerrado: verão chuvoso (jan) tem MENOR Ra que inverno seco (jul) no HS
    // porque no verão o sol está mais alto mas o dia é mais longo no inverno
    // relativo à latitude tropical. Testamos apenas Ra (grandeza puramente
    // solar), sem interferência de outras variáveis.
    const raJul = calculateReferenceEtoFao56(base({ date: "2025-07-15" }))
      .intermediateValues.extraterrestrialRadiationMjM2Day;
    const raJan = calculateReferenceEtoFao56(base({ date: "2025-01-15" }))
      .intermediateValues.extraterrestrialRadiationMjM2Day;
    // Latitude tropical: Ra varia relativamente pouco; janeiro (verão HS)
    // tende a ser maior. Verificamos apenas que ambos são finitos e > 0.
    expect(raJul).not.toBeNull();
    expect(raJan).not.toBeNull();
    expect(raJul as number).toBeGreaterThan(0);
    expect(raJan as number).toBeGreaterThan(0);
    expect(raJan as number).toBeGreaterThan(raJul as number);
  });

  it("Latitude −12° (HS tropical) e latitude +12° (HN tropical) em 15/jan trocam papéis solares", () => {
    // Em 15/jan, HS está em verão e HN em inverno. Ra_HS > Ra_HN.
    const raHS = calculateReferenceEtoFao56(base({ date: "2025-01-15", latitude: -12 }))
      .intermediateValues.extraterrestrialRadiationMjM2Day;
    const raHN = calculateReferenceEtoFao56(base({ date: "2025-01-15", latitude: 12 }))
      .intermediateValues.extraterrestrialRadiationMjM2Day;
    expect(raHS).not.toBeNull();
    expect(raHN).not.toBeNull();
    expect(raHS as number).toBeGreaterThan(raHN as number);
  });
});

describe("Não-negatividade e continuidade", () => {
  it("ETo ≥ 0 em 20 amostras aleatórias plausíveis", () => {
    // PRNG determinístico simples para reprodutibilidade
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 20; i += 1) {
      const tmin = 5 + rand() * 20;
      const tmax = tmin + 3 + rand() * 15;
      const r = calculateReferenceEtoFao56(base({
        temperatureMinC: tmin,
        temperatureMaxC: tmax,
        relativeHumidityMinPct: 10 + rand() * 70,
        relativeHumidityMaxPct: 40 + rand() * 55,
        windSpeedMs: 0.1 + rand() * 10,
        solarRadiationMjM2Day: 1 + rand() * 30,
      }));
      // Motor pode retornar null se RH gerada for inconsistente; nesses casos
      // apenas exigimos que NUNCA volte negativo
      if (r.etoMmDay !== null) expect(r.etoMmDay).toBeGreaterThanOrEqual(0);
    }
  });

  it("Continuidade: variação pequena em Rs → variação pequena em ETo", () => {
    // |ETo(Rs+ε) − ETo(Rs)| < K·ε (sem descontinuidades)
    const eps = 0.01;
    const rs = 18;
    const eA = eto({ solarRadiationMjM2Day: rs });
    const eB = eto({ solarRadiationMjM2Day: rs + eps });
    const diff = Math.abs(eB - eA);
    expect(diff).toBeLessThan(0.05); // K razoável para eps=0.01 MJ/m²/d
  });
});

describe("Robustez numérica em bordas", () => {
  it("Latitude 89°N não gera NaN em Ra (clamp em acos)", () => {
    const r = calculateReferenceEtoFao56(base({ latitude: 89, date: "2025-06-21" }));
    const ra = r.intermediateValues.extraterrestrialRadiationMjM2Day;
    expect(ra).not.toBeNull();
    expect(Number.isFinite(ra as number)).toBe(true);
  });

  it("Latitude 89°S no solstício de verão local (dez) também é finita", () => {
    const r = calculateReferenceEtoFao56(base({ latitude: -89, date: "2025-12-21" }));
    const ra = r.intermediateValues.extraterrestrialRadiationMjM2Day;
    expect(ra).not.toBeNull();
    expect(Number.isFinite(ra as number)).toBe(true);
  });

  it("Ano bissexto: 31/dez/2024 tem J = 366", () => {
    // Verificação indireta via Ra: J=366 e J=1 vizinhos, valores próximos
    const r366 = calculateReferenceEtoFao56(base({ date: "2024-12-31", latitude: 0 }));
    const r001 = calculateReferenceEtoFao56(base({ date: "2025-01-01", latitude: 0 }));
    const ra366 = r366.intermediateValues.extraterrestrialRadiationMjM2Day as number;
    const ra001 = r001.intermediateValues.extraterrestrialRadiationMjM2Day as number;
    expect(Math.abs(ra366 - ra001)).toBeLessThan(0.5);
  });

  it("Data inválida lança erro explícito (fail-fast)", () => {
    expect(() =>
      calculateReferenceEtoFao56(base({ date: "não é uma data" })),
    ).toThrow(/Data inválida/);
  });
});
