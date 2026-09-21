import Anthropic from "@anthropic-ai/sdk";

/**
 * Função serverless (Vercel) que lê a foto de uma Ordem de Serviço e devolve
 * os campos estruturados. A leitura roda no servidor, com a chave da Anthropic,
 * então quem usa o site não precisa de login no Claude.
 *
 * A IA apenas TRANSCREVE o que está na OS — não calcula nem decide agronomia.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const TOOL = {
  name: "registrar_os",
  description:
    "Registra os campos transcritos da Ordem de Serviço / Requisição para Retirada de Insumos Agrícolas (TOTVS). " +
    "Transcreva exatamente o que está no documento, sem calcular nem interpretar. Mantenha os números como aparecem.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      numero: { type: "string", description: "Número da OS." },
      data: { type: "string", description: "Data (como aparece, ex.: 21/09/2026)." },
      equipe: { type: "string", description: "Equipe responsável." },
      periodo: { type: "string", description: "Período de produção / safra." },
      operacao: { type: "string", description: "Descrição da operação." },
      fazenda: { type: "string", description: "Fazenda." },
      pivo: { type: "string", description: "Pivô." },
      quadrante: { type: "string", description: "Quadrante." },
      area: { type: "string", description: "Área total em ha." },
      insumos: {
        type: "array",
        description: "Insumos (uma linha por produto).",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            descricao: { type: "string", description: "Descrição do insumo." },
            unidade: { type: "string", description: "Unidade (ex.: LT, KG)." },
            consumo: { type: "string", description: "Quantidade a ser consumida." },
            capacidade: { type: "string", description: "Capacidade da embalagem." },
            embalagens: { type: "string", description: "Quantidade de embalagens." },
            retirada: { type: "string", description: "Quantidade a ser retirada." },
            sobra: { type: "string", description: "Previsão de sobra." },
          },
          required: ["descricao", "unidade", "consumo", "capacidade", "embalagens", "retirada"],
        },
      },
    },
    required: ["numero", "operacao", "fazenda", "pivo", "area", "insumos"],
  },
  strict: true,
};

const PROMPT =
  "Esta é a foto de uma Ordem de Serviço (Requisição para Retirada de Insumos Agrícolas, TOTVS). " +
  "Use a ferramenta registrar_os para transcrever os campos exatamente como estão, sem calcular nem converter. " +
  "Os números do documento usam vírgula decimal — mantenha-os como aparecem. Se um campo não existir, deixe vazio.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(501).json({ error: "O servidor está sem a chave ANTHROPIC_API_KEY configurada." });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: "Corpo inválido." });
    return;
  }

  const image = body && body.image;
  const mediaType = (body && body.mediaType) || "image/jpeg";
  if (!image) {
    res.status(400).json({ error: "Nenhuma imagem recebida." });
    return;
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "registrar_os" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const tool = message.content.find((b) => b.type === "tool_use");
    if (!tool) {
      res.status(422).json({ error: "Não consegui ler a OS nesta foto." });
      return;
    }
    res.status(200).json({ data: tool.input });
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 500;
    const map = {
      401: "Chave da API inválida.",
      429: "Limite da API atingido. Aguarde alguns segundos.",
    };
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: map[status] || (err && err.message) || "Falha ao ler a OS.",
    });
  }
}
