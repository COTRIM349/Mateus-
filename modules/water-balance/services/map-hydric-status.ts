/**
 * Classificação hídrica do mapa (única fonte visual).
 *
 * A cor representa decisão de manejo, não apenas uma faixa ampla de umidade:
 * - verde: capacidade de campo (≈100% da CAD);
 * - azul: abaixo da CC, porém ainda sem necessidade de irrigação;
 * - amarelo: aproximação do limite de manejo (70–100% da AFD consumida);
 * - vermelho: limite de manejo atingido/superado (irrigar);
 * - cinza: dado insuficiente.
 */

export type MapHydricStatus =
  | "capacidade_campo"
  | "boa_umidade"
  | "atencao"
  | "deficit_hidrico"
  | "incompleto";

export interface MapHydricThresholds {
  /** ARM/CAD ≥ este valor → capacidade de campo. Tolerância operacional de 2%. */
  fieldCapacityRatio: number;
  /** Fração da AFD consumida a partir da qual entra em atenção. */
  attentionAfdRatio: number;
}

export const MAP_HYDRIC_THRESHOLDS: MapHydricThresholds = {
  fieldCapacityRatio: 0.98,
  attentionAfdRatio: 0.70,
};

/**
 * Paleta única do mapa hídrico.
 * Verde fica reservado à capacidade de campo.
 */
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
    label: "Capacidade de campo",
    color: MAP_HYDRIC_COLORS.green,
    onColor: "#ffffff",
    bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  boa_umidade: {
    label: "Sem necessidade",
    color: MAP_HYDRIC_COLORS.blue,
    onColor: "#ffffff",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  atencao: {
    label: "Atenção",
    color: MAP_HYDRIC_COLORS.yellow,
    onColor: "#111827",
    bgClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  deficit_hidrico: {
    label: "Irrigar",
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

/** Sem irrigar agora — CC, faixa azul ou sem dado. */
export const MAP_HYDRIC_NO_IRRIGATE: MapHydricStatus[] = [
  "capacidade_campo",
  "boa_umidade",
  "incompleto",
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
 * A referência de decisão é a AFD:
 * - Verde: ARM ≈ CAD (CC).
 * - Azul: consumo < 70% da AFD — sem necessidade de irrigação.
 * - Amarelo: consumo de 70% até <100% da AFD — aproximando do limite.
 * - Vermelho: déficit ≥ AFD — limite de manejo atingido, irrigar.
 *
 * Sem CAD/ARM/AFD válidos → `incompleto`.
 */
export function classifyWaterStatus(input: ClassifyWaterStatusInput): MapHydricStatus {
  const t = { ...MAP_HYDRIC_THRESHOLDS, ...input.thresholds };
  const arm = input.armMm;
  const cad = input.cadMm;
  const afd = input.afdMm;

  if (
    arm == null || cad == null || afd == null ||
    !Number.isFinite(arm) || !Number.isFinite(cad) || !Number.isFinite(afd) ||
    cad <= 0 || afd <= 0
  ) {
    return "incompleto";
  }

  const fill = arm / cad;
  const deficit = Math.max(cad - arm, 0);
  const afdConsumed = deficit / afd;

  if (fill >= t.fieldCapacityRatio) return "capacidade_campo";
  if (afdConsumed < t.attentionAfdRatio) return "boa_umidade";
  if (afdConsumed < 1) return "atencao";
  return "deficit_hidrico";
}
