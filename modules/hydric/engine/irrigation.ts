/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IRRIGAÇÃO / DEMANDA — funções puras (spec-2 §15-24, §39)
 * ═══════════════════════════════════════════════════════════════════════════
 * ETc, chuva efetiva, lâmina líquida/bruta, volume, tempo, capacidade diária.
 * Guardar ETc potencial E ajustada separadamente (spec-2 §16).
 */

import { clamp } from "@/utils/math";

// ── ETc (spec-2 §15-16) ─────────────────────────────────────────────────────

/** ETc potencial = ETo × Kc × Kl. */
export function calculateETcPotential(eto: number, kc: number, kl = 1): number {
  return Math.max(eto * kc * clamp(kl, 0, 1), 0);
}

/** ETc ajustada = ETc potencial × Ks. Guardar SEPARADO da potencial. */
export function calculateETcAdjusted(etcPotential: number, ks: number): number {
  return Math.max(etcPotential * clamp(ks, 0, 1), 0);
}

// ── Chuva efetiva (spec-2 §18) ──────────────────────────────────────────────
export type EffectiveRainRule =
  | { kind: "fixed_fraction"; fraction: number }
  | { kind: "threshold"; abstractionMm: number }
  | { kind: "full" };

export function calculateEffectiveRain(rain: number, rule: EffectiveRainRule): number {
  if (rain <= 0) return 0;
  switch (rule.kind) {
    case "fixed_fraction": return rain * clamp(rule.fraction, 0, 1);
    case "threshold": return Math.max(rain - rule.abstractionMm, 0);
    case "full": return rain;
  }
}

// ── Depleção diária (spec-2 §9-10) ──────────────────────────────────────────
/**
 * Dr_i = Dr_(i-1) − (P − RO) − Ief − CR + ETc_real + DP
 * Retorna { drNext, deepPercolation }. Trata excedente > CTA como DP.
 */
export function calculateDepletion(input: {
  drPrev: number;
  effectiveRain: number;   // (P − RO) já resolvido
  irrigationEffective: number;
  capillaryRise: number;
  etcReal: number;
  cta: number;
}): { drNext: number; deepPercolation: number } {
  const raw =
    input.drPrev - input.effectiveRain - input.irrigationEffective
    - input.capillaryRise + input.etcReal;
  // Dr não pode ser negativo: excedente vira drenagem profunda.
  if (raw < 0) {
    return { drNext: 0, deepPercolation: Math.abs(raw) };
  }
  // Dr não pode passar da CTA (perfil no PMP).
  if (raw > input.cta) {
    return { drNext: input.cta, deepPercolation: 0 };
  }
  return { drNext: raw, deepPercolation: 0 };
}

// ── Recomendação de lâmina (spec-2 §20-23) ─────────────────────────────────

/** Lâmina líquida = Dr − Dr_alvo (default alvo 0 = repor até CC). */
export function calculateIrrigationRequirement(dr: number, drTarget = 0): number {
  return Math.max(dr - drTarget, 0);
}

/**
 * Lâmina bruta = LL / Ea.
 * Ea ≤ 0 é configuração impossível de equipamento → retorna null (indisponível)
 * em vez de 0, para não apresentar "não irrigar" como resultado válido.
 */
export function calculateGrossDepth(netDepthMm: number, ea: number): number | null {
  if (ea <= 0) return null;
  return netDepthMm / ea;
}

/** Volume (m³) = LB (mm) × Área (ha) × 10. */
export function calculateIrrigationVolume(grossDepthMm: number, areaHa: number): number {
  return grossDepthMm * areaHa * 10;
}

/** Tempo (h) = Volume (m³) / Vazão (m³/h). */
export function calculateRuntime(volumeM3: number, flowM3h: number): number {
  if (flowM3h <= 0) return 0;
  return volumeM3 / flowM3h;
}

/** Capacidade diária (mm/dia) = (Q × horas) / (Área × 10). */
export function calculateDailyCapacity(flowM3h: number, hoursAvailable: number, areaHa: number): number {
  if (areaHa <= 0) return 0;
  return (flowM3h * hoursAvailable) / (areaHa * 10);
}

// ── Dias até o limite (spec-2 §27) ──────────────────────────────────────────
/** Aproximação: (CRA − Dr) / ETc. Marcar como aproximação na UI. */
export function estimateDaysToLimitApprox(cra: number, dr: number, etc: number): number | null {
  if (etc <= 0) return null;
  return Math.max((cra - dr) / etc, 0);
}
