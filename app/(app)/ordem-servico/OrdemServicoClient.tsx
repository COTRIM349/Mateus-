"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import {
  buildRecommendation,
  buildWhatsappMessage,
  normalizeServiceOrder,
  parseBrazilianNumber,
  ServiceOrderParseError,
  type RawServiceOrder,
  type RawServiceOrderInput,
  type ValidationWarning,
} from "@/modules/service-order/services";

function emptyInput(): RawServiceOrderInput {
  return {
    code: "",
    description: "",
    erpCode: "",
    unit: "LT",
    consumedQuantity: "",
    packageCapacity: "",
    packageCount: "",
    withdrawnQuantity: "",
    expectedLeftover: "",
  };
}

function emptyOrder(): RawServiceOrder {
  return {
    number: "",
    date: "",
    team: "",
    productionPeriod: "",
    operationCode: "",
    operationDescription: "",
    farm: "",
    pivot: "",
    quadrant: "",
    area: "",
    inputs: [emptyInput()],
  };
}

const WARNING_STYLE: Record<ValidationWarning["level"], string> = {
  info: "text-graphite-500 dark:text-gray-400",
  atencao: "text-amber-600 dark:text-amber-400",
  critico: "text-red-600 dark:text-red-400",
};

export function OrdemServicoClient() {
  const [order, setOrder] = useState<RawServiceOrder>(emptyOrder());
  const [applicationRate, setApplicationRate] = useState("");
  const [tankCapacity, setTankCapacity] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function setField<K extends keyof RawServiceOrder>(key: K, value: RawServiceOrder[K]) {
    setOrder((prev) => ({ ...prev, [key]: value }));
  }

  function setInputField(index: number, key: keyof RawServiceOrderInput, value: string) {
    setOrder((prev) => {
      const inputs = [...(prev.inputs ?? [])];
      inputs[index] = { ...inputs[index], [key]: value };
      return { ...prev, inputs };
    });
  }

  function addInput() {
    setOrder((prev) => ({ ...prev, inputs: [...(prev.inputs ?? []), emptyInput()] }));
  }

  function removeInput(index: number) {
    setOrder((prev) => ({ ...prev, inputs: (prev.inputs ?? []).filter((_, i) => i !== index) }));
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ordem-servico/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Falha ao ler o PDF.");
        return;
      }
      const data = json.data as RawServiceOrder;
      setOrder({
        ...emptyOrder(),
        ...data,
        inputs: data.inputs?.length ? data.inputs.map((i) => ({ ...emptyInput(), ...i })) : [emptyInput()],
      });
    } catch {
      setUploadError("Não foi possível enviar o arquivo. Verifique a conexão.");
    } finally {
      setUploading(false);
    }
  }

  function handleGenerate() {
    setFormError(null);
    setCopied(false);
    try {
      const os = normalizeServiceOrder(order);
      const rec = buildRecommendation(os, {
        applicationRate: parseBrazilianNumber(applicationRate) ?? undefined,
        tankCapacity: parseBrazilianNumber(tankCapacity) ?? undefined,
      });
      setMessage(buildWhatsappMessage(rec));
      setWarnings(rec.warnings);
    } catch (error) {
      setMessage(null);
      setWarnings([]);
      setFormError(
        error instanceof ServiceOrderParseError
          ? `Confira: ${error.message}`
          : "Não foi possível gerar a recomendação. Revise os dados.",
      );
    }
  }

  async function handleCopy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const inputs = order.inputs ?? [];

  return (
    <div className="space-y-6">
      {/* Upload do PDF */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-graphite-800 dark:text-white">1. Ler PDF do TOTVS</h2>
            <p className="mt-1 text-[13px] text-graphite-400 dark:text-gray-500">
              Envie o PDF da OS. Os campos abaixo são preenchidos para você conferir antes de gerar.
            </p>
          </div>
          <label className="shrink-0">
            <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            <span className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-brand-700">
              {uploading ? "Lendo…" : "Enviar PDF"}
            </span>
          </label>
        </div>
        {uploadError && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {uploadError}
          </p>
        )}
      </Card>

      {/* Dados da OS */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-graphite-800 dark:text-white">2. Dados da OS</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Número da OS" value={order.number ?? ""} onChange={(e) => setField("number", e.target.value)} />
          <Input label="Data" value={order.date ?? ""} onChange={(e) => setField("date", e.target.value)} placeholder="21/09/2026" />
          <Input label="Operação" value={order.operationDescription ?? ""} onChange={(e) => setField("operationDescription", e.target.value)} />
          <Input label="Equipe" value={order.team ?? ""} onChange={(e) => setField("team", e.target.value)} />
          <Input label="Safra / Período" value={order.productionPeriod ?? ""} onChange={(e) => setField("productionPeriod", e.target.value)} />
          <Input label="Fazenda" value={order.farm ?? ""} onChange={(e) => setField("farm", e.target.value)} />
          <Input label="Pivô" value={order.pivot ?? ""} onChange={(e) => setField("pivot", e.target.value)} />
          <Input label="Quadrante" value={order.quadrant ?? ""} onChange={(e) => setField("quadrant", e.target.value)} />
          <Input label="Área (ha)" value={order.area ?? ""} onChange={(e) => setField("area", e.target.value)} placeholder="150,00" />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">Insumos</h3>
          <Button variant="secondary" size="sm" onClick={addInput}>+ Insumo</Button>
        </div>

        <div className="mt-3 space-y-4">
          {inputs.map((input, index) => (
            <div key={index} className="rounded-xl border border-gray-100 p-4 dark:border-white/[0.06]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-graphite-500 dark:text-gray-400">Insumo {index + 1}</span>
                {inputs.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeInput(index)}>Remover</Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input label="Descrição" value={input.description ?? ""} onChange={(e) => setInputField(index, "description", e.target.value)} />
                <Input label="Código" value={input.code ?? ""} onChange={(e) => setInputField(index, "code", e.target.value)} />
                <Input label="Unidade" value={String(input.unit ?? "")} onChange={(e) => setInputField(index, "unit", e.target.value)} />
                <Input label="Consumo previsto" value={String(input.consumedQuantity ?? "")} onChange={(e) => setInputField(index, "consumedQuantity", e.target.value)} placeholder="9,90" />
                <Input label="Capacidade embalagem" value={String(input.packageCapacity ?? "")} onChange={(e) => setInputField(index, "packageCapacity", e.target.value)} placeholder="5,00" />
                <Input label="Nº de embalagens" value={String(input.packageCount ?? "")} onChange={(e) => setInputField(index, "packageCount", e.target.value)} placeholder="2" />
                <Input label="Retirada" value={String(input.withdrawnQuantity ?? "")} onChange={(e) => setInputField(index, "withdrawnQuantity", e.target.value)} placeholder="10,00" />
                <Input label="Previsão de sobra" value={String(input.expectedLeftover ?? "")} onChange={(e) => setInputField(index, "expectedLeftover", e.target.value)} placeholder="0,10" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Parâmetros operacionais */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-graphite-800 dark:text-white">3. Calda (opcional)</h2>
        <p className="mb-4 text-[13px] text-graphite-400 dark:text-gray-500">
          Informe a taxa de aplicação e a capacidade do tanque para o plano de calda. Esses valores não vêm da OS.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Taxa de aplicação (L/ha)" value={applicationRate} onChange={(e) => setApplicationRate(e.target.value)} placeholder="100" />
          <Input label="Capacidade do tanque (L)" value={tankCapacity} onChange={(e) => setTankCapacity(e.target.value)} placeholder="3000" />
        </div>
        <div className="mt-6">
          <Button onClick={handleGenerate}>Gerar recomendação</Button>
        </div>
        {formError && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {formError}
          </p>
        )}
      </Card>

      {/* Resultado */}
      {message && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-graphite-800 dark:text-white">4. Mensagem para o WhatsApp</h2>
            <Button variant="secondary" size="sm" onClick={handleCopy}>{copied ? "Copiado!" : "Copiar"}</Button>
          </div>

          {warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-900/15">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Conferir antes de aplicar</p>
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className={`text-[13px] ${WARNING_STYLE[w.level]}`}>• {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <textarea
            readOnly
            value={message}
            rows={16}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-[13px] leading-relaxed text-graphite-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
          />
        </Card>
      )}
    </div>
  );
}
