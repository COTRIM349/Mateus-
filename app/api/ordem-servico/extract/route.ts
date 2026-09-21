import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Extração da Ordem de Serviço a partir do PDF do TOTVS.
 *
 * Recebe o PDF (multipart/form-data, campo "file"), envia ao Claude com input
 * de documento e devolve os campos da OS em texto cru (formato RawServiceOrder),
 * para que a tela normalize, calcule e deixe o responsável conferir antes de
 * gerar a recomendação.
 *
 * IMPORTANTE: a IA apenas LÊ o documento. Ela não decide dose nem produto —
 * transcreve o que já está escrito na OS. A conferência dos números acontece
 * depois, no motor determinístico.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** Modelo usado na leitura. Configurável por env para permitir trocar por um mais barato. */
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

/** Ferramenta de extração: força a saída num JSON com a forma da OS crua. */
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "registrar_ordem_servico",
  description:
    "Registra os campos transcritos da Requisição para Retirada de Insumos Agrícolas (Ordem de Serviço) do TOTVS. Transcreva exatamente o que está no documento, sem interpretar nem calcular. Mantenha os números no formato original do documento (vírgula decimal).",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      number: { type: "string", description: "Número da Ordem de Serviço." },
      date: { type: "string", description: "Data da OS, como aparece (ex.: 21/09/2026)." },
      team: { type: "string", description: "Equipe responsável." },
      productionPeriod: { type: "string", description: "Período de produção / safra." },
      operationCode: { type: "string", description: "Código da operação." },
      operationDescription: { type: "string", description: "Descrição da operação." },
      inputs: {
        type: "array",
        description: "Insumos (uma linha por produto).",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: { type: "string", description: "Código do insumo." },
            description: { type: "string", description: "Descrição do insumo." },
            erpCode: { type: "string", description: "Código ERP do insumo." },
            unit: { type: "string", description: "Unidade de medida (ex.: LT, KG)." },
            consumedQuantity: { type: "string", description: "Quantidade a ser consumida." },
            packageCapacity: { type: "string", description: "Capacidade da embalagem." },
            packageCount: { type: "string", description: "Quantidade de embalagens." },
            withdrawnQuantity: { type: "string", description: "Quantidade à ser retirada." },
            expectedLeftover: { type: "string", description: "Previsão de sobra." },
          },
          required: ["code", "description", "unit", "consumedQuantity", "packageCapacity", "packageCount", "withdrawnQuantity"],
        },
      },
      farm: { type: "string", description: "Fazenda." },
      pivot: { type: "string", description: "Pivô." },
      quadrant: { type: "string", description: "Quadrante." },
      area: { type: "string", description: "Área total (ha)." },
    },
    required: ["number", "team", "operationDescription", "inputs", "farm", "pivot", "area"],
  },
  strict: true,
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Leitura automática indisponível: a chave ANTHROPIC_API_KEY não está configurada. " +
          "Configure a chave no ambiente ou preencha os campos da OS manualmente.",
        code: "missing_api_key",
      },
      { status: 501 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Requisição inválida (esperado multipart/form-data)." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado no campo 'file'." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Envie o PDF da OS exportado do TOTVS." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF acima de 20 MB." }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text:
                "Transcreva os campos desta Ordem de Serviço (Requisição para Retirada de Insumos Agrícolas) " +
                "usando a ferramenta registrar_ordem_servico. Copie os valores exatamente como aparecem, " +
                "sem calcular nem converter. Se um campo não existir no documento, deixe-o vazio.",
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolUse) {
      return NextResponse.json(
        { error: "Não foi possível ler a OS do PDF. Confira o arquivo ou preencha manualmente." },
        { status: 422 },
      );
    }

    return NextResponse.json({ data: toolUse.input });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Chave da API inválida.", code: "invalid_api_key" }, { status: 502 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Limite da API atingido. Tente novamente em instantes." }, { status: 429 });
    }
    const message = error instanceof Error ? error.message : "Falha ao ler o PDF.";
    return NextResponse.json({ error: `Falha na leitura: ${message}` }, { status: 502 });
  }
}
