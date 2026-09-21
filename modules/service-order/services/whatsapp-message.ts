/**
 * Gerador da mensagem de WhatsApp a partir da recomendação técnica.
 *
 * Produz um texto pronto para copiar e colar no WhatsApp, com formatação
 * (negrito com asteriscos) que o app renderiza. Os números saem no padrão
 * brasileiro (vírgula decimal).
 */

import { formatNumber } from "@/utils/format";
import type {
  InputRecommendation,
  ServiceOrderRecommendation,
  ValidationWarning,
} from "./os-calculations";

/** Formata a dose por hectare de forma legível, na unidade do insumo. */
function formatDose(input: InputRecommendation): string {
  // Doses pequenas em litros ficam mais legíveis em mililitros.
  if (input.unit === "LT" && input.doseByArea > 0 && input.doseByArea < 1) {
    return `${formatNumber(input.doseByArea * 1000, 0)} mL/ha`;
  }
  return `${formatNumber(input.doseByArea, 3)} ${input.unit}/ha`;
}

const WARNING_ICON: Record<ValidationWarning["level"], string> = {
  info: "ℹ️",
  atencao: "⚠️",
  critico: "🚨",
};

/** Monta o bloco de um insumo. */
function inputBlock(input: InputRecommendation): string {
  const lines = [
    `• *${input.description}*`,
    `   Dose: ${formatDose(input)}`,
    `   Consumo previsto: ${formatNumber(input.consumed, 2)} ${input.unit}`,
    `   Retirar: ${formatNumber(input.withdrawn, 2)} ${input.unit} (${formatNumber(input.packageCount, 0)}× ${formatNumber(input.packageCapacity, 0)} ${input.unit})`,
    `   Sobra: ${formatNumber(input.leftover, 2)} ${input.unit}`,
  ];
  return lines.join("\n");
}

/**
 * Gera a mensagem de WhatsApp da recomendação técnica.
 *
 * @returns Texto pronto para colar (com `\n` como quebra de linha).
 */
export function buildWhatsappMessage(rec: ServiceOrderRecommendation): string {
  const { order } = rec;
  const loc = order.location;
  const dateLabel = order.date
    ? order.date.split("-").reverse().join("/")
    : "—";

  const header = [
    `📋 *ORDEM DE SERVIÇO ${order.number}*`,
    `${order.operation.description}`,
    "",
    `🏞️ *Local:* ${loc.farm} — ${loc.pivot}${loc.quadrant ? ` (Quadrante ${loc.quadrant})` : ""}`,
    `📐 *Área:* ${formatNumber(loc.area, 2)} ha`,
    `👥 *Equipe:* ${order.team}`,
    order.productionPeriod ? `🌱 *Safra:* ${order.productionPeriod}` : null,
    `📅 *Data:* ${dateLabel}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const inputsSection = ["", "*INSUMOS E DOSES:*", ...rec.inputs.map(inputBlock)].join("\n");

  const caldaSection = rec.calda
    ? [
        "",
        "*CALDA:*",
        `   Taxa: ${formatNumber(rec.calda.applicationRate, 0)} L/ha`,
        `   Volume total: ${formatNumber(rec.calda.totalVolume, 0)} L`,
        rec.calda.tanksNeeded != null
          ? `   Tanques: ${formatNumber(rec.calda.tanksNeeded, 0)} (tanque de ${formatNumber(rec.calda.tankCapacity ?? 0, 0)} L)`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n")
    : "";

  const warningsSection =
    rec.warnings.length > 0
      ? [
          "",
          "*⚠️ CONFERIR ANTES DE APLICAR:*",
          ...rec.warnings.map((w) => `${WARNING_ICON[w.level]} ${w.message}`),
        ].join("\n")
      : "";

  const footer = [
    "",
    "_Recomendação gerada a partir da OS. Confirme dose, alvo e condições com o responsável técnico antes da aplicação._",
  ].join("\n");

  return [header, inputsSection, caldaSection, warningsSection, footer]
    .filter((section) => section !== "")
    .join("\n");
}
