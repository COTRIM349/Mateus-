/**
 * Classificação hídrica do mapa (única fonte).
 *
 * O frontend NÃO escolhe cor. Consome `classifyWaterStatus()` a partir do
 * ARM/CAD/AFD já calculados pelo motor de balanço.
 *
 * Quatro cores operacionais — azul, verde, amarelo, vermelho — como nas
 * plataformas clássicas de manejo. Cinza (`incompleto`) não entra na legenda:
 * é ficha sem dado, não condição hídrica.
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

/**
 * Limites padrão (parametrizáveis). Derivados da estrutura CAD / AFD / ARM
 * já usada no motor — não são mm arbitrários por cultura.
 */
export const MAP_HYDRIC_THRESHOLDS: MapHydricThresholds = {
  fieldCapacityRatio: 0.98,
};

export const MAP_HYDRIC_STATUS_CONFIG: Record<
  MapHydricStatus,
  { label: string; color: string; bgClass: string }
> = {
  capacidade_campo: {
    label: "Capacidade de campo",
    color: "#2563eb",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  boa_umidade: {
    label: "Adequado",
    color: "#22c55e",
    bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  atencao: {
    label: "Atenção",
    color: "#eab308",
    bgClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  deficit_hidrico: {
    label: "Déficit hídrico",
    color: "#dc2626",
    bgClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  incompleto: {
    label: "Ficha técnica incompleta",
    color: "#6b7280",
    bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400",
  },
};

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
 * - Azul: ARM ≈ CAD (capacidade de campo).
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
