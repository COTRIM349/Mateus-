/**
 * Classificação hídrica do mapa (única fonte visual).
 *
 * A cor representa a faixa de ARM em relação à capacidade de campo (CAD/CTA):
 * - azul: somente 100% da capacidade de campo;
 * - verde: 95% até <100% — umidade confortável;
 * - amarelo: 90% até <95% — atenção;
 * - vermelho: <90% — urgente;
 * - cinza: dado insuficiente.
 */

export type MapHydricStatus =
  | "capacidade_campo"
  | "boa_umidade"
  | "atencao"
  | "deficit_hidrico"
  | "incompleto";

export interface MapHydricThresholds {
  /** ARM/CAD ≥ 1,00 → capacidade de campo real. */
  fieldCapacityRatio: number;
  /** ARM/CAD ≥ este valor e <100% → umidade confortável. */
  comfortableCcRatio: number;
  /** ARM/CAD ≥ este valor e < confortável → atenção. */
  attentionCcRatio: number;
  /** Mantido para o gráfico de faixas AFD/CRA, não para a cor do dashboard. */
  attentionAfdRatio: number;
}

export const MAP_HYDRIC_THRESHOLDS: MapHydricThresholds = {
  fieldCapacityRatio: 1,
  comfortableCcRatio: 0.95,
  attentionCcRatio: 0.90,
  attentionAfdRatio: 0.70,
};

/**
 * Paleta única do mapa hídrico.
 * Azul fica reservado exclusivamente à capacidade de campo real.
 */
/**
 * Limites dinâmicos das faixas do reservatório, usando CTA e CRA do próprio
 * dia. F=CRA/CTA é a média semanal dos ajustes FAO-56 por ETc potencial.
 * A CTA pode evoluir diariamente com o crescimento radicular.
 * As cotas absolutas incluem o PMP, para conversão entre mm e % de CTA.
 *
 * Azul: ARM > CTA − 0,70×CRA; amarelo: CTA − CRA < ARM <= CTA − 0,70×CRA;
 * vermelho: ARM <= CTA − CRA. Verde apenas próximo à CC.
 */
export function calculateHydricZoneBounds(input: {
  ctaMm: number;
  craMm: number;
  pmpMm?: number;
  thresholds?: Partial<MapHydricThresholds>;
}): {
  ccAbs: number;
  greenFloorAbs: number;
  attentionAbs: number;
  safetyAbs: number;
  pmpAbs: number;
  ctaMm: number;
  craMm: number;
  factorF: number;
} | null {
  const { ctaMm, craMm, pmpMm = 0 } = input;
  if (![ctaMm, craMm, pmpMm].every(Number.isFinite) ||
      ctaMm <= 0 || craMm <= 0 || craMm > ctaMm || pmpMm < 0) return null;
  const t = { ...MAP_HYDRIC_THRESHOLDS, ...input.thresholds };
  if (![t.fieldCapacityRatio, t.comfortableCcRatio, t.attentionCcRatio, t.attentionAfdRatio].every(Number.isFinite) ||
      t.fieldCapacityRatio < 0 || t.fieldCapacityRatio > 1 ||
      t.comfortableCcRatio < 0 || t.comfortableCcRatio > t.fieldCapacityRatio ||
      t.attentionCcRatio < 0 || t.attentionCcRatio > t.comfortableCcRatio ||
      t.attentionAfdRatio < 0 || t.attentionAfdRatio > 1) return null;
  const ccAbs = pmpMm + ctaMm;
  return {
    ccAbs,
    greenFloorAbs: pmpMm + ctaMm * t.fieldCapacityRatio,
    attentionAbs: ccAbs - craMm * t.attentionAfdRatio,
    safetyAbs: ccAbs - craMm,
    pmpAbs: pmpMm,
    ctaMm,
    craMm,
    factorF: craMm / ctaMm,
  };
}

export const MAP_HYDRIC_COLORS = {
  blue: "#2196F3",
  green: "#4CAF50",
  yellow: "#FFC107",
  red: "#F44336",
  gray: "#9E9E9E",
} as const;

export const MAP_HYDRIC_STATUS_CONFIG: Record<
  MapHydricStatus,
  { label: string; color: string; onColor: string; bgClass: string }
> = {
  capacidade_campo: {
    label: "100% CC",
    color: MAP_HYDRIC_COLORS.blue,
    onColor: "#ffffff",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  boa_umidade: {
    label: "Umidade confortável",
    color: MAP_HYDRIC_COLORS.green,
    onColor: "#ffffff",
    bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  atencao: {
    label: "Atenção",
    color: MAP_HYDRIC_COLORS.yellow,
    onColor: "#111827",
    bgClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  deficit_hidrico: {
    label: "Urgente",
    color: MAP_HYDRIC_COLORS.red,
    onColor: "#ffffff",
    bgClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  incompleto: {
    label: "Dados indisponíveis",
    color: MAP_HYDRIC_COLORS.gray,
    onColor: "#111827",
    bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400",
  },
};

/** Faixas sem urgência imediata no dashboard. */
export const MAP_HYDRIC_NO_IRRIGATE: MapHydricStatus[] = [
  "capacidade_campo",
  "boa_umidade",
];

/** Precisa irrigar agora — vermelho. */
export const MAP_HYDRIC_NEED_IRRIGATE: MapHydricStatus[] = [
  "deficit_hidrico",
];

export const MAP_HYDRIC_LEGEND_ORDER: MapHydricStatus[] = [
  "capacidade_campo",
  "boa_umidade",
  "atencao",
  "deficit_hidrico",
];

export interface ClassifyWaterStatusInput {
  armMm: number | null;
  cadMm: number | null;
  afdMm: number | null;
  safetyMoistureMm?: number | null;
  thresholds?: Partial<MapHydricThresholds>;
}

/**
 * Classifica a condição hídrica do solo para o mapa.
 *
 * A referência visual do dashboard é ARM/CAD:
 * - Azul: 100% da capacidade de campo;
 * - Verde: 95% até <100%;
 * - Amarelo: 90% até <95%;
 * - Vermelho: <90%.
 *
 * Sem CAD/ARM válidos → `incompleto`.
 */
export function classifyWaterStatus(input: ClassifyWaterStatusInput): MapHydricStatus {
  const t = { ...MAP_HYDRIC_THRESHOLDS, ...input.thresholds };
  const arm = input.armMm;
  const cad = input.cadMm;
  if (
    arm == null || cad == null ||
    !Number.isFinite(arm) || !Number.isFinite(cad) ||
    cad <= 0
  ) {
    return "incompleto";
  }

  const fill = arm / cad;

  if (fill >= t.fieldCapacityRatio) return "capacidade_campo";
  if (fill >= t.comfortableCcRatio) return "boa_umidade";
  if (fill >= t.attentionCcRatio) return "atencao";
  return "deficit_hidrico";
}
