import { describe, it, expect } from "vitest";
import {
  kmhToMs,
  msToKmh,
  hPaToKpa,
  kpaToHpa,
  paToKpa,
  wm2ToMjM2Day,
  adjustWindToTwoMeters,
} from "@/modules/weather/conversions/weatherUnits";

// ── Testes exigidos pela Etapa 1 (marcados #N onde correspondem à lista) ──

describe("weatherUnits — conversões de unidade", () => {
  it("#1 · 36 km/h = 10 m/s", () => {
    expect(kmhToMs(36)).toBeCloseTo(10, 10);
  });

  it("m/s ↔ km/h é reversível dentro do erro numérico", () => {
    expect(msToKmh(10)).toBeCloseTo(36, 10);
    expect(kmhToMs(msToKmh(7.5) as number)).toBeCloseTo(7.5, 10);
  });

  it("#2 · 1013 hPa = 101.3 kPa (e o inverso)", () => {
    expect(hPaToKpa(1013)).toBeCloseTo(101.3, 10);
    expect(kpaToHpa(101.3)).toBeCloseTo(1013, 10);
  });

  it("Pa → kPa (101325 Pa = 101.325 kPa)", () => {
    expect(paToKpa(101_325)).toBeCloseTo(101.325, 10);
  });

  it("#3 · null permanece null em TODAS as conversoras", () => {
    expect(kmhToMs(null)).toBeNull();
    expect(msToKmh(null)).toBeNull();
    expect(hPaToKpa(null)).toBeNull();
    expect(kpaToHpa(null)).toBeNull();
    expect(paToKpa(null)).toBeNull();
    expect(wm2ToMjM2Day(null, 86_400)).toBeNull();
    expect(adjustWindToTwoMeters(null, 10)).toBeNull();
  });

  it("W/m² integrado em 1 dia (86400 s) resulta em MJ/m²/dia coerente", () => {
    // 1 W/m² × 86400 s = 86400 J/m² = 0.0864 MJ/m²
    expect(wm2ToMjM2Day(1, 86_400)).toBeCloseTo(0.0864, 10);
    // 300 W/m² médio ~ 25.92 MJ/m²/dia (valor típico de meio-dia integrado)
    expect(wm2ToMjM2Day(300, 86_400)).toBeCloseTo(25.92, 10);
  });

  it("wm2ToMjM2Day rejeita duration ≤ 0 (erro explícito, não retorna zero)", () => {
    expect(() => wm2ToMjM2Day(300, 0)).toThrow();
    expect(() => wm2ToMjM2Day(300, -1)).toThrow();
  });

  // ── Ajuste de vento FAO-56 eq. 47 ──────────────────────────────────────

  it("#1 adicional · vento medido a 2 m NÃO é alterado (sem erro numérico)", () => {
    // Curto-circuito explícito: heightM === 2 → devolve o mesmo valor
    expect(adjustWindToTwoMeters(3.2, 2)).toBe(3.2);
    expect(adjustWindToTwoMeters(7, 2)).toBe(7);
  });

  it("#2 adicional · vento a 10 m converte para 2 m com fator FAO-56 ≈ 0.7480", () => {
    // Fator exato: 4.87 / ln(67.8·10 − 5.42) = 0.7479510752…
    // u2 = 5 × 0.7479510752 ≈ 3.7398
    const u2 = adjustWindToTwoMeters(5, 10) as number;
    expect(u2).toBeCloseTo(5 * 0.7479510752, 6);
  });

  it("adjustWindToTwoMeters lança erro para altura inválida", () => {
    expect(() => adjustWindToTwoMeters(5, 0)).toThrow();
    expect(() => adjustWindToTwoMeters(5, -3)).toThrow();
  });

  it("#6 · vento a 10 m é convertido corretamente para 2 m (fator ~0.7480)", () => {
    // Reafirmando via múltiplos valores com o fator exato do FAO-56 eq. 47
    const factor = 4.87 / Math.log(67.8 * 10 - 5.42);
    for (const uz of [1, 2.5, 8, 12]) {
      const u2 = adjustWindToTwoMeters(uz, 10) as number;
      expect(u2).toBeCloseTo(uz * factor, 8);
    }
  });
});
