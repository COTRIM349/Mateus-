/**
 * Classificação hídrica do mapa (única fonte).
 *
 * O frontend NÃO escolhe cor. Consome `classifyWaterStatus()` a partir do
 * ARM/CAD/AFD já calculados pelo motor de balanço.
 *
 * Quatro cores operacionais — azul, verde, amarelo, vermelho — no recorte
 * clássico de manejo (Agrosmart Aqua e similares). Cinza (`incompleto`) é
 * ficha sem dado, não condição hídrica.
 *
 * O gatilho de irrigação (`classifyHydricStatus`) permanece independente
 * (verde/amarelo/vermelho/cinza pela AFD).
 */

export type MapHydricStatus =
  | "capacidade_campo"
  | "boa_umidade"
  | "atencao"
  | "deficit_hidrico"
  | "incompleto";

export interface MapHydricThresholds {
  /** ARM/CAD ≥ este valor → capacidade de campo (azul). */
  fieldCapacityRatio: number;
}

export const MAP_HYDRIC_THRESHOLDS: MapHydricThresholds = {
  fieldCapacityRatio: 0.98,
};

/**
 * Paleta única do mapa hídrico.
 * Azul / verde / amarelo / vermelho na mesma escala (Material 500).
 * Anel, preenchimento, legenda e badge usam estes hex — não misturar Tailwind 400/500/600.
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
    label: "CC 100%",
    color: MAP_HYDRIC_COLORS.blue,
    onColor: "#ffffff",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  boa_umidade: {
    label: "Umidade ideal",
    color: MAP_HYDRIC_COLORS.green,
    onColor: "#ffffff",
    bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  atencao: {
    label: "Umidade de atenção",
    color: MAP_HYDRIC_COLORS.yellow,
    onColor: "#111827",
    bgClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  deficit_hidrico: {
    label: "Déficit hídrico",
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

/** Sem irrigar agora — azul / verde / sem dado. */
export const MAP_HYDRIC_NO_IRRIGATE: MapHydricStatus[] = [
  "capacidade_campo",
  "boa_umidade",
  "incompleto",
];

/** Precisa irrigar — amarelo / vermelho. */
export const MAP_HYDRIC_NEED_IRRIGATE: MapHydricStatus[] = [
  "atencao",
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
 * - Azul: ARM ≈ CAD — 100% da capacidade de campo (não é excesso).
 * - Verde: abaixo da CC e acima da umidade de segurança (CAD − AFD) — Ks = 1.
 * - Amarelo: abaixo da segurança, ainda com água (ARM > 0).
 * - Vermelho: ARM ≤ 0 — déficit.
 *
 * Sem CAD/ARM válidos → `incompleto` (não é cor operacional).
 */
export function classifyWaterStatus(input: ClassifyWaterStatusInput): MapHydricStatus {
  const t = { ...MAP_HYDRIC_THRESHOLDS, ...input.thresholds };
  const arm = input.armMm;
  const cad = input.cadMm;

  if (arm == null || cad == null || !Number.isFinite(arm) || !Number.isFinite(cad) || cad <= 0) {
    return "incompleto";
  }

  const fill = arm / cad;
  const afd = input.afdMm != null && Number.isFinite(input.afdMm) && input.afdMm > 0
    ? input.afdMm
    : cad * 0.5;
  const safety = input.safetyMoistureMm != null && Number.isFinite(input.safetyMoistureMm)
    ? Math.max(input.safetyMoistureMm, 0)
    : Math.max(cad - afd, 0);

  if (fill >= t.fieldCapacityRatio) return "capacidade_campo";
  if (arm >= safety) return "boa_umidade";
  if (arm > 0) return "atencao";
  return "deficit_hidrico";
}
