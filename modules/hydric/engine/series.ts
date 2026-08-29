/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SÉRIE DIÁRIA — encadeia o motor v4 dia a dia (realizado + projeção)
 * ═══════════════════════════════════════════════════════════════════════════
 * Mantém REALIZADO e PREVISTO separados (spec-2 §26). A projeção nunca
 * altera o histórico consolidado.
 */
import {
  computeDailyBalanceV4,
  type DailyBalanceInputV4,
  type DailyBalanceResultV4,
  type SoilLayerCanonical,
  type EffectiveRainRule,
} from "./hydricEngineV4";
import type { CoefficientMode } from "@/modules/hydric/domain/glossary";

/** Entrada de um dia da série (o ARM anterior é encadeado automaticamente). */
export interface SeriesDayInput {
  date: string;                 // YYYY-MM-DD
  eto: number | null;
  kc: number;
  kl?: number;
  ke?: number | null;
  rootDepthM: number;
  rainfall: number | null;
  irrigationGross: number | null;
  capillaryRise?: number | null;
  /** realizado (observado) ou previsto (projeção). */
  segment: "realizado" | "previsto";
}

export interface SeriesFixedParams {
  effectiveSoilDepthM: number;
  layers: SoilLayerCanonical[];
  pBase: number;
  applicationEfficiency: number;
  mode: CoefficientMode;
  effectiveRainRule?: EffectiveRainRule;
}

export interface SeriesDayResult extends DailyBalanceResultV4 {
  date: string;
  segment: "realizado" | "previsto";
}

/**
 * Roda o motor para cada dia, encadeando o ARM. `initialArm` é a âncora
 * hídrica datada (obrigatória — spec §7.5).
 */
export function computeSeries(
  days: SeriesDayInput[],
  fixed: SeriesFixedParams,
  initialArm: number,
): SeriesDayResult[] {
  const out: SeriesDayResult[] = [];
  let previousArm = initialArm;

  for (const d of days) {
    const input: DailyBalanceInputV4 = {
      eto: d.eto,
      kc: d.kc,
      kl: d.kl,
      ke: d.ke,
      rootDepthM: d.rootDepthM,
      effectiveSoilDepthM: fixed.effectiveSoilDepthM,
      layers: fixed.layers,
      pBase: fixed.pBase,
      rainfall: d.rainfall,
      irrigationGross: d.irrigationGross,
      applicationEfficiency: fixed.applicationEfficiency,
      capillaryRise: d.capillaryRise,
      previousArm,
      mode: fixed.mode,
      effectiveRainRule: fixed.effectiveRainRule,
    };
    const res = computeDailyBalanceV4(input);
    out.push({ ...res, date: d.date, segment: d.segment });

    // Encadeia o ARM só quando o dia computou; se bloqueado, mantém o anterior.
    if (res.computed && res.arm != null) previousArm = res.arm;
  }

  return out;
}

/** Estimativa por simulação de "dias até atingir a AFD" (spec-2 §27). */
export function daysToReachAfd(series: SeriesDayResult[]): number | null {
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    if (!s.computed || s.dr == null || s.afd == null) continue;
    if (s.dr >= s.afd) return i; // atingiu a AFD no dia i (0 = hoje)
  }
  return null; // não atinge no horizonte simulado
}
