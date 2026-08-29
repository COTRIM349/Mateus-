/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MOTOR HÍDRICO CANÔNICO v4 — implementação única e versionada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unifica os três motores legados divergentes (water-balance.service,
 * pivot-engine, recommendation.service) numa só implementação FAO-56 pura,
 * testável e sem side-effects (sem DB, sem UI, sem clima — só matemática).
 *
 * Correções agronômicas em relação ao legado (spec §7.6):
 *   1. Ks REDUZ a ETc quando Dr > AFD (legado usava sempre ETc potencial).
 *   2. Chuva efetiva é diária e configurável — NÃO a fórmula mensal USDA-SCS
 *      que o motor A aplicava indevidamente em base diária.
 *   3. Dr (depleção) é o indicador primário; ARM = clamp(0, CAD).
 *   4. Escoamento superficial tratado ANTES da chuva efetiva.
 *   5. Todo resultado carrega a versão do motor e o modo de coeficiente.
 *
 * Referências: FAO-56 eq. 82-86; Bernardo, Mantovani & Soares (2019).
 */

import { clamp, roundTo } from "@/utils/math";
import {
  HYDRIC_ENGINE_VERSION,
  type CoefficientMode,
  type HydricState,
} from "@/modules/hydric/domain/glossary";

// ── Entradas ────────────────────────────────────────────────────────────────

/** Camada de solo já normalizada para unidades canônicas. */
export interface SoilLayerCanonical {
  /** Profundidade do topo da camada (m). */
  topM: number;
  /** Profundidade da base da camada (m). */
  bottomM: number;
  /** Capacidade de campo volumétrica (cm³/cm³). */
  thetaCC: number;
  /** Ponto de murcha permanente volumétrico (cm³/cm³). */
  thetaPMP: number;
  /** Fator de exploração radicular nesta camada (0-1). Default 1. */
  rootExploration?: number;
}

export interface DailyBalanceInputV4 {
  /** ETo de referência (mm/dia). null = indisponível → bloqueia cálculo. */
  eto: number | null;
  /** Coeficiente de cultura Kc (single) OU Kcb (dual). */
  kc: number;
  /** Coeficiente de localização Kl (0-1). Default 1. */
  kl?: number;
  /** Só no modo dual: coeficiente de evaporação Ke. */
  ke?: number | null;
  /** Profundidade radicular atual (m). */
  rootDepthM: number;
  /** Profundidade efetiva máxima do solo (m). */
  effectiveSoilDepthM: number;
  /** Camadas de solo (canônicas). */
  layers: SoilLayerCanonical[];
  /** Fator de depleção base p (0-1). */
  pBase: number;
  /** Chuva bruta do dia (mm). null = indisponível (NÃO assumir 0). */
  rainfall: number | null;
  /** Irrigação bruta aplicada (mm). null = indisponível. */
  irrigationGross: number | null;
  /** Eficiência de aplicação Ea (0-1). */
  applicationEfficiency: number;
  /** Ascensão capilar (mm), quando conhecida. Default 0 só se explicitamente 0. */
  capillaryRise?: number | null;
  /** ARM do dia anterior (mm). Âncora hídrica obrigatória (spec §7.5). */
  previousArm: number;
  /** Modo do coeficiente. */
  mode: CoefficientMode;
  /** Regra de chuva efetiva. */
  effectiveRainRule?: EffectiveRainRule;
}

/**
 * Regra de chuva efetiva (spec §7.6 — tratar escoamento antes).
 *   fixed_fraction: Pe = rain × fraction (default 0.8) — simples e diário.
 *   threshold: perde os primeiros `abstractionMm`, resto é efetivo.
 *   full: toda chuva é efetiva (Pe = rain) — para solos planos/coberto.
 */
export type EffectiveRainRule =
  | { kind: "fixed_fraction"; fraction: number }
  | { kind: "threshold"; abstractionMm: number }
  | { kind: "full" };

const DEFAULT_RAIN_RULE: EffectiveRainRule = { kind: "fixed_fraction", fraction: 0.8 };

// ── Saída ─────────────────────────────────────────────────────────────────

export interface DailyBalanceResultV4 {
  engineVersion: string;
  mode: CoefficientMode;
  /** true se o cálculo oficial foi possível; false = faltou dado obrigatório. */
  computed: boolean;
  /** Requisitos faltantes quando computed=false. */
  missing: string[];

  cad: number | null;
  afd: number | null;
  armCritico: number | null;
  pAdjusted: number | null;

  etcPotential: number | null;
  ks: number | null;
  etcReal: number | null;

  effectiveRain: number | null;
  irrigationEffective: number | null;

  arm: number | null;
  dr: number | null;
  pctArm: number | null;
  deepPercolation: number | null;

  state: HydricState;
}

// ── CAD por camadas (spec §7.6) ─────────────────────────────────────────────

/**
 * CAD = Σ_camada [(θCC − θPMP) × profundidade_explorada × 1000]
 * limitado pela profundidade radicular atual e pela profundidade efetiva.
 */
export function calculateCadByLayers(
  layers: SoilLayerCanonical[],
  rootDepthM: number,
  effectiveSoilDepthM: number,
): number {
  const zMax = Math.min(rootDepthM, effectiveSoilDepthM);
  if (zMax <= 0) return 0;

  let cad = 0;
  for (const l of layers) {
    const top = Math.max(l.topM, 0);
    const bottom = Math.min(l.bottomM, zMax);
    const explored = bottom - top;
    if (explored <= 0) continue;
    const dtaVol = Math.max(l.thetaCC - l.thetaPMP, 0); // cm³/cm³
    const factor = l.rootExploration ?? 1;
    cad += dtaVol * explored * 1000 * clamp(factor, 0, 1);
  }
  return roundTo(Math.max(cad, 0), 2);
}

// ── p ajustado (FAO-56 eq. 84) ──────────────────────────────────────────────
export function adjustP(pBase: number, etcPotential: number): number {
  const adj = pBase + 0.04 * (5 - etcPotential);
  return roundTo(clamp(adj, 0.1, 0.8), 3);
}

// ── Ks (FAO-56 eq. 84) ──────────────────────────────────────────────────────
/**
 * Ks = 1 quando Dr ≤ AFD.
 * Ks = (CAD − Dr) / ((1 − p) × CAD) quando Dr > AFD. Limitado a [0,1].
 */
export function calculateKs(cad: number, dr: number, afd: number, p: number): number {
  if (cad <= 0) return 0;
  if (dr <= afd) return 1;
  const denom = (1 - p) * cad;
  if (denom <= 0) return 0;
  return clamp((cad - dr) / denom, 0, 1);
}

// ── Chuva efetiva diária (escoamento tratado antes) ─────────────────────────
export function effectiveRainfall(rain: number, rule: EffectiveRainRule): number {
  if (rain <= 0) return 0;
  switch (rule.kind) {
    case "fixed_fraction":
      return roundTo(rain * clamp(rule.fraction, 0, 1), 2);
    case "threshold":
      return roundTo(Math.max(rain - rule.abstractionMm, 0), 2);
    case "full":
      return roundTo(rain, 2);
  }
}

// ── Estado hídrico (derivado de Dr, AFD, Ks) ────────────────────────────────
export function classifyState(
  computed: boolean,
  cad: number | null,
  arm: number | null,
  afd: number | null,
  ks: number | null,
): HydricState {
  if (!computed || cad == null || arm == null || afd == null) return "indisponivel";
  if (cad <= 0) return "critico";

  const dr = cad - arm;

  // Faixas por depleção crescente. `alerta` é a zona logo APÓS cruzar a AFD
  // (Dr > AFD mas ainda na primeira metade do que resta até a CAD).
  if (arm >= cad * 0.98) return "capacidade";
  if (dr <= afd * 0.5) return "otimo";
  if (dr <= afd) return "adequado";
  // A partir daqui Dr > AFD (há estresse). Separa amarelo → vermelho → preto.
  const stressBand = afd + (cad - afd) * 0.5; // metade do caminho AFD→CAD
  if (dr <= stressBand) return "alerta";
  if (ks != null && ks < 0.4) return "critico";
  return "abaixo_seguranca";
}

// ── Motor diário ────────────────────────────────────────────────────────────

export function computeDailyBalanceV4(input: DailyBalanceInputV4): DailyBalanceResultV4 {
  const missing: string[] = [];
  if (input.eto == null) missing.push("ETo do dia (indisponível)");
  // Modo dual exige Ke validado (spec §6.3) — nunca substituir por 0.
  if (input.mode === "dual" && (input.ke == null)) {
    missing.push("Ke (obrigatório no modo dual — não substituir por 0)");
  }
  if (input.rainfall == null) missing.push("Chuva do dia (indisponível — não assumir 0)");
  if (input.irrigationGross == null) missing.push("Irrigação do dia (indisponível)");
  if (!input.layers || input.layers.length === 0) missing.push("Camadas de solo (sem cadastro)");
  if (!Number.isFinite(input.previousArm)) missing.push("Condição hídrica inicial (ARM anterior)");

  const base: DailyBalanceResultV4 = {
    engineVersion: HYDRIC_ENGINE_VERSION,
    mode: input.mode,
    computed: false,
    missing,
    cad: null, afd: null, armCritico: null, pAdjusted: null,
    etcPotential: null, ks: null, etcReal: null,
    effectiveRain: null, irrigationEffective: null,
    arm: null, dr: null, pctArm: null, deepPercolation: null,
    state: "indisponivel",
  };

  if (missing.length > 0) return base;

  const eto = input.eto as number;
  const kl = input.kl ?? 1;
  const rainRule = input.effectiveRainRule ?? DEFAULT_RAIN_RULE;

  // 1. CAD / p / AFD
  const cad = calculateCadByLayers(input.layers, input.rootDepthM, input.effectiveSoilDepthM);

  // 2. ETc potencial (modo)
  let etcPotential: number;
  if (input.mode === "dual") {
    const kcb = input.kc;
    const ke = input.ke ?? 0;
    // No dual, Ks entra no termo Kcb; calculamos Ks depois com Dr provisório.
    etcPotential = roundTo(Math.max((kcb + ke) * eto, 0), 2); // potencial (Ks=1)
  } else {
    etcPotential = roundTo(Math.max(eto * input.kc * kl, 0), 2);
  }

  const pAdjusted = adjustP(input.pBase, etcPotential);
  const afd = roundTo(cad * pAdjusted, 2);

  // 3. Dr no início do dia (a partir do ARM anterior)
  const armPrev = clamp(input.previousArm, 0, cad);
  const drStart = cad - armPrev;

  // 4. Ks a partir do Dr do início do dia
  const ks = calculateKs(cad, drStart, afd, pAdjusted);

  // 5. ETc real = potencial × Ks (single) ou (Kcb×Ks + Ke)×ETo (dual)
  let etcReal: number;
  if (input.mode === "dual") {
    const kcb = input.kc;
    const ke = input.ke ?? 0;
    etcReal = roundTo(Math.max((kcb * ks + ke) * eto, 0), 2);
  } else {
    etcReal = roundTo(Math.max(etcPotential * ks, 0), 2);
  }

  // 6. Entradas de água
  const effRain = effectiveRainfall(input.rainfall as number, rainRule);
  const irrEff = roundTo((input.irrigationGross as number) * clamp(input.applicationEfficiency, 0, 1), 2);
  const capillary = input.capillaryRise ?? 0;

  // 7. Balanço: ARM_prov = ARM_ant + Pe + Ief + ascensão − ETc_real
  const armProvisional = armPrev + effRain + irrEff + capillary - etcReal;
  const arm = roundTo(clamp(armProvisional, 0, cad), 2);
  const deepPercolation = roundTo(Math.max(armProvisional - cad, 0), 2);
  const dr = roundTo(cad - arm, 2);
  const pctArm = cad > 0 ? roundTo((arm / cad) * 100, 1) : 0;
  const armCritico = roundTo(cad - afd, 2);

  const state = classifyState(true, cad, arm, afd, ks);

  return {
    engineVersion: HYDRIC_ENGINE_VERSION,
    mode: input.mode,
    computed: true,
    missing: [],
    cad, afd, armCritico, pAdjusted,
    etcPotential, ks, etcReal,
    effectiveRain: effRain, irrigationEffective: irrEff,
    arm, dr, pctArm, deepPercolation,
    state,
  };
}
