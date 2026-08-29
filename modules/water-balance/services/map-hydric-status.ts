/**
 * Classificação hídrica do mapa — mesma escala agronômica do motor FAO-56.
 *
 * O frontend NÃO escolhe cor. Consome o status derivado de Dr, CTA, CRA e Ks.
 * Limiares explícitos em AGRONOMIC_STATUS_THRESHOLDS — nenhum corte escondido.
 */

import {
  AGRONOMIC_STATUS_CONFIG,
  AGRONOMIC_STATUS_THRESHOLDS,
  calculateKsFromDr,
  classifyAgronomicStatus,
  type AgronomicStatus,
} from "../agronomy";

export type MapHydricStatus = AgronomicStatus;

export const MAP_HYDRIC_THRESHOLDS = AGRONOMIC_STATUS_THRESHOLDS;

export const MAP_HYDRIC_COLORS = {
  blue: AGRONOMIC_STATUS_CONFIG.capacidade_campo.color,
  darkGreen: AGRONOMIC_STATUS_CONFIG.otima.color,
  lightGreen: AGRONOMIC_STATUS_CONFIG.boa.color,
  orange: AGRONOMIC_STATUS_CONFIG.alerta.color,
  red: AGRONOMIC_STATUS_CONFIG.estresse.color,
  black: AGRONOMIC_STATUS_CONFIG.severo.color,
  gray: AGRONOMIC_STATUS_CONFIG.incompleto.color,
} as const;

export const MAP_HYDRIC_STATUS_CONFIG: Record<
  MapHydricStatus,
  { label: string; color: string; onColor: string; bgClass: string; description: string }
> = {
  capacidade_campo: {
    label: "Capacidade de campo",
    color: MAP_HYDRIC_COLORS.blue,
    onColor: "#ffffff",
    bgClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    description: AGRONOMIC_STATUS_CONFIG.capacidade_campo.description,
  },
  otima: {
    label: "Ótima umidade",
    color: MAP_HYDRIC_COLORS.darkGreen,
    onColor: "#ffffff",
    bgClass: "bg-green-900/20 text-green-900 dark:bg-green-900/40 dark:text-green-200",
    description: AGRONOMIC_STATUS_CONFIG.otima.description,
  },
  boa: {
    label: "Boa umidade",
    color: MAP_HYDRIC_COLORS.lightGreen,
    onColor: "#111827",
    bgClass: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
    description: AGRONOMIC_STATUS_CONFIG.boa.description,
  },
  alerta: {
    label: "Alerta",
    color: MAP_HYDRIC_COLORS.orange,
    onColor: "#111827",
    bgClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    description: AGRONOMIC_STATUS_CONFIG.alerta.description,
  },
  estresse: {
    label: "Estresse hídrico",
    color: MAP_HYDRIC_COLORS.red,
    onColor: "#ffffff",
    bgClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    description: AGRONOMIC_STATUS_CONFIG.estresse.description,
  },
  severo: {
    label: "Déficit hídrico severo",
    color: MAP_HYDRIC_COLORS.black,
    onColor: "#ffffff",
    bgClass: "bg-zinc-900 text-white dark:bg-black dark:text-gray-100",
    description: AGRONOMIC_STATUS_CONFIG.severo.description,
  },
  incompleto: {
    label: "Dado ausente",
    color: MAP_HYDRIC_COLORS.gray,
    onColor: "#111827",
    bgClass: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400",
    description: AGRONOMIC_STATUS_CONFIG.incompleto.description,
  },
};

/** Sem irrigar agora — perfil cheio / confortável / sem dado. */
export const MAP_HYDRIC_NO_IRRIGATE: MapHydricStatus[] = [
  "capacidade_campo",
  "otima",
  "boa",
  "incompleto",
];

/** Precisa irrigar — alerta, estresse ou déficit severo. */
export const MAP_HYDRIC_NEED_IRRIGATE: MapHydricStatus[] = [
  "alerta",
  "estresse",
  "severo",
];

export const MAP_HYDRIC_LEGEND_ORDER: MapHydricStatus[] = [
  "capacidade_campo",
  "otima",
  "boa",
  "alerta",
  "estresse",
  "severo",
];

export interface ClassifyWaterStatusInput {
  armMm: number | null;
  cadMm: number | null;
  afdMm: number | null;
  safetyMoistureMm?: number | null;
  ks?: number | null;
}

/**
 * Classifica a condição hídrica a partir de ARM/CTA/CRA (equivalente a Dr).
 * Mesma regra do motor: não usa um valor digitado à mão.
 */
export function classifyWaterStatus(input: ClassifyWaterStatusInput): MapHydricStatus {
  const arm = input.armMm;
  const cad = input.cadMm;

  if (arm == null || cad == null || !Number.isFinite(arm) || !Number.isFinite(cad) || cad <= 0) {
    return "incompleto";
  }

  const dr = Math.max(cad - arm, 0);
  const cra = input.afdMm != null && Number.isFinite(input.afdMm) && input.afdMm > 0
    ? input.afdMm
    : null;
  const ks = input.ks != null && Number.isFinite(input.ks)
    ? input.ks
    : calculateKsFromDr({ ctaMm: cad, craMm: cra, drMm: dr }).value;

  return classifyAgronomicStatus({ drMm: dr, ctaMm: cad, craMm: cra, ks });
}
