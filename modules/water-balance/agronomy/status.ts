/**
 * Status hídrico derivado de Dr, CRA, CTA e Ks.
 * Limiares explícitos — nenhum corte escondido no frontend.
 */

export type AgronomicStatus =
  | "capacidade_campo"
  | "otima"
  | "boa"
  | "alerta"
  | "estresse"
  | "severo"
  | "incompleto";

export interface AgronomicStatusThresholds {
  /** Dr/CTA abaixo disso → capacidade de campo. */
  fieldCapacityDrRatio: number;
  /** Dr/CRA abaixo disso → ótima umidade. */
  optimalCraRatio: number;
  /** Dr/CRA abaixo disso → boa umidade. */
  goodCraRatio: number;
  /** Ks abaixo disso (com Dr > CRA) → déficit severo. */
  severeKs: number;
  /** Dr/CTA acima disso → déficit severo. */
  severeDrRatio: number;
}

export const AGRONOMIC_STATUS_THRESHOLDS: AgronomicStatusThresholds = {
  fieldCapacityDrRatio: 0.02,
  optimalCraRatio: 0.5,
  goodCraRatio: 0.85,
  severeKs: 0.5,
  severeDrRatio: 0.8,
};

export const AGRONOMIC_STATUS_CONFIG: Record<
  AgronomicStatus,
  { label: string; color: string; description: string }
> = {
  capacidade_campo: {
    label: "Capacidade de campo",
    color: "#2196F3",
    description: "Dr próximo de 0 — perfil cheio.",
  },
  otima: {
    label: "Ótima umidade",
    color: "#1B5E20",
    description: "Depleção confortável, bem abaixo da CRA.",
  },
  boa: {
    label: "Boa umidade",
    color: "#7CB342",
    description: "Aproximação gradual do limite de manejo.",
  },
  alerta: {
    label: "Alerta",
    color: "#FB8C00",
    description: "Dr próximo da CRA — preparar irrigação.",
  },
  estresse: {
    label: "Estresse hídrico",
    color: "#E53935",
    description: "Dr > CRA e Ks < 1 — transpiração reduzida.",
  },
  severo: {
    label: "Déficit hídrico severo",
    color: "#111111",
    description: "Depleção muito elevada — risco produtivo alto.",
  },
  incompleto: {
    label: "Dado ausente",
    color: "#9E9E9E",
    description: "Parâmetro obrigatório falta para classificar.",
  },
};

export function classifyAgronomicStatus(input: {
  drMm: number | null;
  ctaMm: number | null;
  craMm: number | null;
  ks: number | null;
  thresholds?: Partial<AgronomicStatusThresholds>;
}): AgronomicStatus {
  const t = { ...AGRONOMIC_STATUS_THRESHOLDS, ...input.thresholds };
  const { drMm: dr, ctaMm: cta, craMm: cra, ks } = input;
  if (dr == null || cta == null || cra == null || cta <= 0 || cra <= 0) return "incompleto";

  const drCta = dr / cta;
  if (drCta <= t.fieldCapacityDrRatio) return "capacidade_campo";

  if (ks != null && (ks < t.severeKs || drCta >= t.severeDrRatio)) return "severo";
  if (dr > cra && (ks == null || ks < 1)) return "estresse";

  const drCra = dr / cra;
  if (drCra >= t.goodCraRatio) return "alerta";
  if (drCra >= t.optimalCraRatio) return "boa";
  return "otima";
}

export type IrrigationPriority = "baixa" | "media" | "alta" | "critica";

export function irrigationPriority(input: {
  status: AgronomicStatus;
  daysToCra: number | null;
  ks: number | null;
  ky: number | null;
}): IrrigationPriority {
  if (input.status === "severo") return "critica";
  if (input.status === "estresse") return "alta";
  if (input.status === "alerta") {
    const sensitive = (input.ky ?? 0) >= 1;
    if (sensitive || (input.daysToCra != null && input.daysToCra <= 1)) return "alta";
    return "media";
  }
  if (input.status === "boa") return "media";
  return "baixa";
}
