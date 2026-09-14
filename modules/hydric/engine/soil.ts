/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SOLO — funções puras de disponibilidade de água (unit-aware)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implementa a normalização de umidade do solo com seleção de unidade
 * (spec-2 §2-4). A fórmula da DTA muda automaticamente conforme a unidade
 * de CC e PMP — nunca aplicar densidade aparente duas vezes.
 *
 * Referências: Bernardo, Mantovani & Soares (2019); FAO-56 eq. 82.
 */

import { clamp } from "@/utils/math";

// ── Unidade de umidade ──────────────────────────────────────────────────────
export type MoistureUnit = "weight_pct" | "volumetric_pct" | "m3_m3";

/** Camada de solo como cadastrada (com unidade explícita). */
export interface SoilLayerInput {
  /** Espessura da camada (cm). */
  thicknessCm: number;
  /** Capacidade de campo, na unidade indicada por `unit`. */
  fieldCapacity: number;
  /** Ponto de murcha permanente, na unidade indicada por `unit`. */
  wiltingPoint: number;
  /** Densidade aparente (g/cm³). Obrigatória quando unit = weight_pct. */
  bulkDensity: number | null;
  /** Unidade de CC e PMP. */
  unit: MoistureUnit;
  /** Fração explorada pela raiz nesta camada (0-1). Default calculado externamente. */
  rootExploration?: number;
}

/**
 * DTA — Disponibilidade Total de Água por unidade de profundidade (mm/cm).
 *
 * % em peso:      DTA = ((CC − PMP) × Da) / 10
 * % volumétrico:  DTA = (CC − PMP) / 10
 * m³/m³:          DTA = (CC − PMP) × 10
 *
 * Retorna null quando falta um dado obrigatório (ex.: Da ausente em base peso).
 */
export function calculateDTA(
  fieldCapacity: number,
  wiltingPoint: number,
  bulkDensity: number | null,
  unit: MoistureUnit,
): number | null {
  const delta = fieldCapacity - wiltingPoint;
  if (!Number.isFinite(delta)) return null;

  switch (unit) {
    case "weight_pct":
      if (bulkDensity == null || bulkDensity <= 0) return null; // Da obrigatória
      return (delta * bulkDensity) / 10;
    case "volumetric_pct":
      return delta / 10;
    case "m3_m3":
      return delta * 10;
  }
}

/**
 * CTA de uma camada (mm) = DTA (mm/cm) × espessura explorada (cm).
 * `exploredCm` permite usar só a fração da camada alcançada pela raiz.
 */
export function calculateLayerCTA(dtaMmCm: number, exploredCm: number): number {
  return dtaMmCm * Math.max(exploredCm, 0);
}

// ── Distribuição da raiz pelas camadas ──────────────────────────────────────

export interface ResolvedLayer {
  index: number;
  thicknessCm: number;
  exploredCm: number;
  dtaMmCm: number | null;
  ctaMm: number | null;
  /** Motivo quando dtaMmCm/ctaMm é null. */
  reason: string | null;
}

/**
 * Resolve quanto de cada camada a raiz explora, dado Zr (cm).
 * Camadas totalmente acima de Zr → exploradas por inteiro.
 * Camada onde Zr termina → explorada só até Zr.
 * Camadas abaixo de Zr → não exploradas (exploredCm = 0).
 */
export function resolveRootLayers(
  layers: SoilLayerInput[],
  rootDepthCm: number,
): ResolvedLayer[] {
  const out: ResolvedLayer[] = [];
  let cumTop = 0;
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    const bottom = cumTop + l.thicknessCm;
    const exploredCm = clamp(rootDepthCm - cumTop, 0, l.thicknessCm);

    const dta = calculateDTA(l.fieldCapacity, l.wiltingPoint, l.bulkDensity, l.unit);
    let reason: string | null = null;
    if (dta == null) {
      reason = l.unit === "weight_pct"
        ? "Densidade aparente ausente (obrigatória em base peso)"
        : "CC/PMP inválidos";
    } else if (l.fieldCapacity <= l.wiltingPoint) {
      reason = "CC ≤ PMP (inválido)";
    }

    const ctaMm = dta != null && reason == null ? calculateLayerCTA(dta, exploredCm) : null;

    out.push({
      index: i,
      thicknessCm: l.thicknessCm,
      exploredCm,
      dtaMmCm: dta,
      ctaMm,
      reason,
    });
    cumTop = bottom;
  }
  return out;
}

/**
 * CTA total (mm) da zona radicular — soma das camadas exploradas.
 * Retorna null se qualquer camada explorada tiver dado obrigatório ausente.
 */
export function calculateCTA(resolved: ResolvedLayer[]): { value: number | null; missing: string[] } {
  const missing: string[] = [];
  let total = 0;
  for (const r of resolved) {
    if (r.exploredCm <= 0) continue; // camada não alcançada — ignora
    if (r.ctaMm == null) {
      missing.push(`Camada ${r.index + 1}: ${r.reason ?? "dado ausente"}`);
      continue;
    }
    total += r.ctaMm;
  }
  return { value: missing.length > 0 ? null : total, missing };
}

// ── FD / CRA (spec-2 §6) ────────────────────────────────────────────────────

/** CRA (AFD) = CTA × FD. FD é parâmetro de manejo (NÃO é Ks). */
export function calculateCRA(cta: number, fd: number): number {
  return cta * clamp(fd, 0, 1);
}

// ── Armazenamento e depleção (spec-2 §8-9) ──────────────────────────────────

/** ARM = CTA − Dr (limitado a [0, CTA]). */
export function calculateRootZoneStorage(cta: number, dr: number): number {
  return clamp(cta - dr, 0, cta);
}

// ── Ks (spec-2 §11) ─────────────────────────────────────────────────────────
/**
 * Ks = 1 quando Dr ≤ CRA.
 * Ks = (CTA − Dr) / (CTA − CRA) quando Dr > CRA. Limitado a [0,1].
 */
export function calculateKsFromDepletion(cta: number, cra: number, dr: number): number {
  if (cta <= 0) return 0;
  if (dr <= cra) return 1;
  const denom = cta - cra;
  if (denom <= 0) return 0;
  return clamp((cta - dr) / denom, 0, 1);
}
