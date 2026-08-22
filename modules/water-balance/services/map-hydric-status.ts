/**
 * Escala hídrica operacional do mapa — fonte única de cor.
 *
 * Azul       = capacidade de campo
 * Verde esc. = ótima umidade
 * Verde claro= boa umidade
 * Laranja    = alerta
 * Vermelho   = atenção / estresse
 * Preto      = déficit hídrico severo
 * Cinza      = dados incompletos (não é condição agronômica)
 */

export type MapHydricStatus =
  | "capacidade_campo"
  | "otima_umidade"
  | "boa_umidade"
  | "alerta"
  | "atencao"
  | "deficit_hidrico"
  | "incompleto";

export interface MapHydricThresholds {
  fieldCapacityRatio: number;
  optimalAfdRatio: number;
  goodAfdRatio: number;
  severeStorageRatio: number;
}

export const MAP_HYDRIC_THRESHOLDS: MapHydricThresholds = {
  fieldCapacityRatio: 0.98,
  optimalAfdRatio: 0.35,
  goodAfdRatio: 0.70,
  severeStorageRatio: 0.10,
};

export const MAP_HYDRIC_COLORS = {
  blue: "#1565C0",
  darkGreen: "#166534",
  lightGreen: "#66BB6A",
  orange: "#F97316",
  red: "#DC2626",
  black: "#111111",
  gray: "#9E9E9E",
} as const;

export const MAP_HYDRIC_STATUS_CONFIG: Record<
  MapHydricStatus,
  { label: string; color: string; onColor: string; bgClass: string }
> = {
  capacidade_campo: {
    label: "Capacidade de campo",
    color: MAP_HYDRIC_COLORS.blue,
    onColor: "#ffffff",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  otima_umidade: {
    label: "Ótima umidade",
    color: MAP_HYDRIC_COLORS.darkGreen,
    onColor: "#ffffff",
    bgClass: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  },
  boa_umidade: {
    label: "Boa umidade",
    color: MAP_HYDRIC_COLORS.lightGreen,
    onColor: "#102a16",
    bgClass: "bg-green-50 text-green-800 dark:bg-green-900/25 dark:text-green-300",
  },
  alerta: {
    label: "Alerta",
    color: MAP_HYDRIC_COLORS.orange,
    onColor: "#ffffff",
    bgClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  },
  atencao: {
    label: "Atenção",
    color: MAP_HYDRIC_COLORS.red,
    onColor: "#ffffff",
    bgClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  deficit_hidrico: {
    label: "Déficit hídrico",
    color: MAP_HYDRIC_COLORS.black,
    onColor: "#ffffff",
    bgClass: "bg-black text-white dark:bg-black dark:text-white",
  },
  incompleto: {
    label: "Dados indisponíveis",
    color: MAP_HYDRIC_COLORS.gray,
    onColor: "#111827",
    bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400",
  },
};

export const MAP_HYDRIC_NO_IRRIGATE: MapHydricStatus[] = [
  "capacidade_campo",
  "otima_umidade",
  "boa_umidade",
  "incompleto",
];

export const MAP_HYDRIC_NEED_IRRIGATE: MapHydricStatus[] = [
  "alerta",
  "atencao",
  "deficit_hidrico",
];

export const MAP_HYDRIC_LEGEND_ORDER: MapHydricStatus[] = [
  "capacidade_campo",
  "otima_umidade",
  "boa_umidade",
  "alerta",
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

export function classifyWaterStatus(input: ClassifyWaterStatusInput): MapHydricStatus {
  const t = { ...MAP_HYDRIC_THRESHOLDS, ...input.thresholds };
  const arm = input.armMm;
  const cad = input.cadMm;
  const afd = input.afdMm;

  if (
    arm == null || cad == null || afd == null ||
    !Number.isFinite(arm) || !Number.isFinite(cad) || !Number.isFinite(afd) ||
    cad <= 0 || afd <= 0
  ) return "incompleto";

  const fill = arm / cad;
  const deficit = Math.max(cad - arm, 0);
  const afdRatio = deficit / afd;

  if (fill >= t.fieldCapacityRatio) return "capacidade_campo";
  if (fill <= t.severeStorageRatio || arm <= 0) return "deficit_hidrico";
  if (afdRatio < t.optimalAfdRatio) return "otima_umidade";
  if (afdRatio < t.goodAfdRatio) return "boa_umidade";
  if (afdRatio < 1) return "alerta";

  // AFD ultrapassada: já existe estresse. Preto fica reservado para o
  // esgotamento severo da água disponível; vermelho sinaliza ação imediata.
  return "atencao";
}
