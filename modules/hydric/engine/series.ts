/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SÉRIE DIÁRIA — encadeia o motor v4 dia a dia (realizado + projeção)
 * ═══════════════════════════════════════════════════════════════════════════
 * Mantém REALIZADO e PREVISTO separados (spec-2 §26). A projeção nunca
 * altera o histórico consolidado.
 */
import {
  computeDailyBalanceV4,
  calculateCadByLayers,
  type DailyBalanceInputV4,
  type DailyBalanceResultV4,
  type SoilLayerCanonical,
  type EffectiveRainRule,
} from "./hydricEngineV4";
import { clamp } from "@/utils/math";
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
  /**
   * Re-âncora opcional (nova condição hídrica datada) para este dia.
   * Necessária para retomar a série após um dia bloqueado por dado ausente.
   * ARM absoluto (mm) OU Dr absoluto (mm) — informar apenas um.
   */
  anchorArm?: number | null;
  anchorDr?: number | null;
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
 * Roda o motor para cada dia, encadeando a DEPLEÇÃO (Dr), não o ARM absoluto.
 * `initialArm` é a âncora hídrica datada inicial (obrigatória — spec §7.5).
 *
 * Por que encadear Dr e não ARM (correção de revisão):
 *   Quando a profundidade radicular cresce, a CAD aumenta. Carregar o ARM
 *   absoluto do dia anterior faria a camada recém-explorada entrar com "água
 *   faltando", criando depleção artificial e recomendação prematura. Encadear
 *   Dr (mm já depletados) preserva o consumo real: a água nova fica disponível
 *   (ARM = CAD − Dr cresce junto com a CAD).
 *
 * Dia bloqueado (dado obrigatório ausente): a série NÃO retoma silenciosamente
 * do estado pré-lacuna (isso omitiria ganhos/perdas do dia sem dado). Fica
 * bloqueada até um dia trazer uma re-âncora explícita (anchorArm/anchorDr).
 */
export function computeSeries(
  days: SeriesDayInput[],
  fixed: SeriesFixedParams,
  initialArm: number,
): SeriesDayResult[] {
  const out: SeriesDayResult[] = [];

  // Estado encadeado como DEPLEÇÃO (Dr). Deriva do ARM inicial usando a CAD
  // da profundidade radicular do primeiro dia (fallback: profundidade efetiva).
  const firstRoot = days[0]?.rootDepthM ?? fixed.effectiveSoilDepthM;
  const cad0 = calculateCadByLayers(fixed.layers, firstRoot, fixed.effectiveSoilDepthM);
  let previousDr: number | null = cad0 > 0 ? clamp(cad0 - initialArm, 0, cad0) : 0;

  for (const d of days) {
    // CAD do dia (depende da raiz do dia) para converter Dr encadeado → ARM.
    const cadDay = calculateCadByLayers(fixed.layers, d.rootDepthM, fixed.effectiveSoilDepthM);

    // Re-âncora explícita neste dia tem precedência (retoma após lacuna).
    let drForDay = previousDr;
    if (d.anchorDr != null) {
      drForDay = clamp(d.anchorDr, 0, cadDay);
    } else if (d.anchorArm != null) {
      drForDay = clamp(cadDay - d.anchorArm, 0, cadDay);
    }

    // Sem estado válido (lacuna anterior e sem re-âncora): bloqueia o dia.
    if (drForDay == null) {
      out.push({
        engineVersion: "hydric_engine_v4.0.0",
        mode: fixed.mode,
        computed: false,
        missing: ["Série interrompida por dia sem dado — informe nova condição hídrica (re-âncora) para retomar"],
        cad: null, afd: null, armCritico: null, pAdjusted: null,
        etcPotential: null, ks: null, etcReal: null,
        effectiveRain: null, irrigationEffective: null,
        arm: null, dr: null, pctArm: null, deepPercolation: null,
        state: "indisponivel",
        date: d.date, segment: d.segment,
      });
      continue;
    }

    const previousArm = clamp(cadDay - drForDay, 0, cadDay);
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

    // Encadeia o Dr do fim do dia; se o dia bloqueou, invalida o estado
    // (série fica bloqueada até uma re-âncora, salvo se este dia trouxe uma).
    if (res.computed && res.dr != null) {
      previousDr = res.dr;
    } else {
      previousDr = null;
    }
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
