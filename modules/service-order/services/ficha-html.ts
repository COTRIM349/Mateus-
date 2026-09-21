/**
 * Gerador da ficha imprimível (HTML) da recomendação técnica.
 *
 * Produz um documento HTML A4 autossuficiente (CSS inline) para o responsável
 * imprimir ou salvar como PDF direto do navegador. Mantém o mesmo conteúdo da
 * mensagem de WhatsApp, num formato de arquivo/impressão.
 */

import { formatNumber } from "@/utils/format";
import type {
  InputRecommendation,
  ServiceOrderRecommendation,
  ValidationWarning,
} from "./os-calculations";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDose(input: InputRecommendation): string {
  if (input.unit === "LT" && input.doseByArea > 0 && input.doseByArea < 1) {
    return `${formatNumber(input.doseByArea * 1000, 0)} mL/ha`;
  }
  return `${formatNumber(input.doseByArea, 3)} ${input.unit}/ha`;
}

const WARNING_LABEL: Record<ValidationWarning["level"], string> = {
  info: "Observação",
  atencao: "Atenção",
  critico: "Crítico",
};

const WARNING_COLOR: Record<ValidationWarning["level"], string> = {
  info: "#6b7280",
  atencao: "#b45309",
  critico: "#dc2626",
};

function inputRow(input: InputRecommendation): string {
  return `
    <tr>
      <td class="prod">${escapeHtml(input.description)}</td>
      <td class="num strong">${formatDose(input)}</td>
      <td class="num">${formatNumber(input.consumed, 2)} ${escapeHtml(input.unit)}</td>
      <td class="num">${formatNumber(input.withdrawn, 2)} ${escapeHtml(input.unit)} (${formatNumber(input.packageCount, 0)}× ${formatNumber(input.packageCapacity, 0)})</td>
      <td class="num">${formatNumber(input.leftover, 2)} ${escapeHtml(input.unit)}</td>
    </tr>`;
}

/** Monta o documento HTML completo da ficha. */
export function buildFichaHtml(rec: ServiceOrderRecommendation): string {
  const { order } = rec;
  const loc = order.location;
  const dateLabel = order.date ? order.date.split("-").reverse().join("/") : "—";
  const localLabel = `${escapeHtml(loc.farm)} — ${escapeHtml(loc.pivot)}${loc.quadrant ? ` (Quadrante ${escapeHtml(loc.quadrant)})` : ""}`;

  const caldaBlock = rec.calda
    ? `
    <section>
      <h2>Calda</h2>
      <div class="grid">
        <div><span>Taxa de aplicação</span><strong>${formatNumber(rec.calda.applicationRate, 0)} L/ha</strong></div>
        <div><span>Volume total</span><strong>${formatNumber(rec.calda.totalVolume, 0)} L</strong></div>
        ${rec.calda.tanksNeeded != null ? `<div><span>Tanques</span><strong>${formatNumber(rec.calda.tanksNeeded, 0)} × ${formatNumber(rec.calda.tankCapacity ?? 0, 0)} L</strong></div>` : ""}
      </div>
    </section>`
    : "";

  const warningsBlock =
    rec.warnings.length > 0
      ? `
    <section>
      <h2>Conferir antes de aplicar</h2>
      <ul class="warnings">
        ${rec.warnings
          .map(
            (w) =>
              `<li><span class="wl" style="color:${WARNING_COLOR[w.level]}">${WARNING_LABEL[w.level]}:</span> ${escapeHtml(w.message)}</li>`,
          )
          .join("")}
      </ul>
    </section>`
      : "";

  const generated = rec.generatedAt.toLocaleString("pt-BR");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>OS ${escapeHtml(order.number)} - Ficha</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1f2937; margin: 0; padding: 32px; font-size: 13px; }
  .sheet { max-width: 760px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #16a34a; padding-bottom: 12px; margin-bottom: 20px; }
  header .os { font-size: 22px; font-weight: 800; color: #111827; }
  header .op { color: #4b5563; margin-top: 2px; }
  header .date { text-align: right; color: #6b7280; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 4px; }
  .grid > div { display: flex; flex-direction: column; }
  .grid span { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; }
  .grid strong { font-size: 14px; color: #111827; margin-top: 2px; }
  section { margin-bottom: 20px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #9ca3af; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
  td.num { text-align: right; white-space: nowrap; }
  td.prod { font-weight: 600; }
  td.strong { font-weight: 700; color: #16a34a; }
  ul.warnings { list-style: none; padding: 0; margin: 0; }
  ul.warnings li { padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
  .wl { font-weight: 700; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div>
        <div class="os">OS ${escapeHtml(order.number)}</div>
        <div class="op">${escapeHtml(order.operation.description)}</div>
      </div>
      <div class="date">
        Data: ${dateLabel}<br/>
        ${order.productionPeriod ? `Safra: ${escapeHtml(order.productionPeriod)}` : ""}
      </div>
    </header>

    <section>
      <div class="grid">
        <div><span>Local</span><strong>${localLabel}</strong></div>
        <div><span>Área</span><strong>${formatNumber(loc.area, 2)} ha</strong></div>
        <div><span>Equipe</span><strong>${escapeHtml(order.team)}</strong></div>
      </div>
    </section>

    <section>
      <h2>Insumos e doses</h2>
      <table>
        <thead>
          <tr><th>Produto</th><th class="num">Dose</th><th class="num">Consumo</th><th class="num">Retirar</th><th class="num">Sobra</th></tr>
        </thead>
        <tbody>
          ${rec.inputs.map(inputRow).join("")}
        </tbody>
      </table>
    </section>

    ${caldaBlock}
    ${warningsBlock}

    <footer>
      Recomendação gerada a partir da Ordem de Serviço em ${generated}.
      Confirme dose, alvo e condições de aplicação com o responsável técnico antes da aplicação.
    </footer>
  </div>
</body>
</html>`;
}
