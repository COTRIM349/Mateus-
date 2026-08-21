/**
 * Classificação hídrica do mapa (única fonte).
 *
 * O frontend NÃO escolhe cor. Consome `classifyWaterStatus()` a partir do
 * ARM/CAD/AFD já calculados pelo motor de balanço.
 *
 * Faixas parametrizáveis em {@link MAP_HYDRIC_THRESHOLDS}. Não espalhar
 * limites de cor em componentes.
 *
 * Relação com o gatilho de irrigação (`classifyHydricStatus`):
 *   aquele classificador de 4 níveis (verde/amarelo/vermelho/cinza) permanece
 *   para recomendação. O mapa usa estas 6 cores agronômicas.
 */

export type MapHydricStatus =
  | "capacidade_campo"
  | "otima_umidade"
  | "boa_umidade"
  | "sinal_alerta"
  | "atencao"
  | "deficit_hidrico"
  | "incompleto";

export interface MapHydricThresholds {
  /** ARM/CAD ≥ este valor → capacidade de campo. */
  fieldCapacityRatio: number;
  /** ARM/CAD ≥ este valor (e abaixo de CC) → ótima umidade. */
  excellentRatio: number;
  /**
   * Fração da umidade de segurança (CAD − AFD) abaixo da qual entra alerta.
   * Acima da segurança = boa umidade (Ks = 1).
   */
  alertFloorOfSafety: number;
  /** ARM/CAD ≤ este valor (e ARM > 0) → atenção. Abaixo ou igual a 0 → déficit. */
  attentionMaxRatio: number;
}

/**
 * Limites padrão (parametrizáveis). Derivados da estrutura CAD / AFD / ARM
 * já usada no motor — não são mm arbitrários por cultura.
 */
export const MAP_HYDRIC_THRESHOLDS: MapHydricThresholds = {
  fieldCapacityRatio: 0.98,
  excellentRatio: 0.8,
  alertFloorOfSafety: 0.7,
  attentionMaxRatio: 0.25,
};

export const MAP_HYDRIC_STATUS_CONFIG: Record<
  MapHydricStatus,
  { label: string; color: string; bgClass: string }
> = {
  capacidade_campo: {
    label: "Capacidade de campo",
    color: "#1d4ed8",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  otima_umidade: {
    label: "Ótima umidade",
    color: "#166534",
    bgClass: "bg-emerald-950/40 text-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  boa_umidade: {
    label: "Boa umidade",
    color: "#4ade80",
    bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  sinal_alerta: {
    label: "Sinal de alerta",
    color: "#ea580c",
    bgClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  },
  atencao: {
    label: "Atenção",
    color: "#dc2626",
    bgClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  deficit_hidrico: {
    label: "Déficit hídrico",
    color: "#171717",
    bgClass: "bg-zinc-900 text-zinc-100 dark:bg-black dark:text-zinc-200",
  },
  incompleto: {
    label: "Ficha técnica incompleta",
    color: "#6b7280",
    bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400",
  },
};

export const MAP_HYDRIC_LEGEND_ORDER: MapHydricStatus[] = [
  "capacidade_campo",
  "otima_umidade",
  "boa_umidade",
  "sinal_alerta",
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
 * - Capacidade de campo: ARM ≈ CAD (armazenamento máximo operacional).
 * - Ótima: abaixo da CC, ainda com grande reserva (fração da CAD).
 * - Boa: acima da umidade de segurança (CAD − AFD) — zona Ks = 1.
 * - Alerta: entre o piso de alerta e a umidade de segurança.
 * - Atenção: abaixo do alerta, ainda com água (ARM > 0).
 * - Déficit: ARM ≤ 0 — déficit agronomicamente relevante.
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
  if (fill >= t.excellentRatio) return "otima_umidade";
  if (arm >= safety) return "boa_umidade";
  if (safety > 0 && arm >= safety * t.alertFloorOfSafety && fill > t.attentionMaxRatio) {
    return "sinal_alerta";
  }
  if (arm > 0) return "atencao";
  return "deficit_hidrico";
}
