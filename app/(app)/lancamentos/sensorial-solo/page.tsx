"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button, Card, Input, Select, Table, Modal, ConfirmDialog, TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { PrerequisiteNotice } from "@/components/onboarding";
import {
  SOIL_SENSORY_SCALE,
  sensoryNoteToPercentCC,
  sensoryNoteCategory,
} from "@/modules/assignment/services/parcel-motor-adapter";

// ── Types ────────────────────────────────────────────────────────────────

interface Reading {
  id: string;
  farm_id: string;
  pivot_id: string;
  reading_date: string;
  moisture_unit: "weight" | "volume";
  use_in_balance: boolean;
  layer_1_note: number | null;
  layer_2_note: number | null;
  layer_3_note: number | null;
  layer_1_moisture_pct: number | null;
  layer_2_moisture_pct: number | null;
  layer_3_moisture_pct: number | null;
  notes: string | null;
  created_at: string;
}

interface PivotLite { id: string; name: string; soil_id: string | null }

interface FormState {
  pivot_id: string;
  reading_date: string;
  moisture_unit: "weight" | "volume";
  use_in_balance: boolean;
  layer_1_note: string;
  layer_2_note: string;
  layer_3_note: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM: FormState = {
  pivot_id: "",
  reading_date: today(),
  moisture_unit: "weight",
  use_in_balance: true,
  layer_1_note: "",
  layer_2_note: "",
  layer_3_note: "",
  notes: "",
};

// ── Category colors ──────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  umido: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-400",
    label: "Úmido",
  },
  moderado: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400",
    label: "Moderado",
  },
  critico: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-400",
    label: "Crítico",
  },
  seco: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    label: "Seco",
  },
};

// ── Page ────────────────────────────────────────────────────────────────

export default function SensorialSoloPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [readings, setReadings] = useState<Reading[]>([]);
  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reading | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reading | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [filterPivot, setFilterPivot] = useState<string>("");

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("pivots")
      .select("id, name, soil_id")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (data) setPivots(data as PivotLite[]); });
  }, [activeFarmId, supabase]);

  const fetchReadings = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    let q = supabase
      .from("soil_sensory_readings")
      .select("*")
      .eq("farm_id", activeFarmId)
      .order("reading_date", { ascending: false })
      .limit(200);
    if (filterPivot) q = q.eq("pivot_id", filterPivot);
    const { data } = await q;
    setReadings((data ?? []) as Reading[]);
    setLoading(false);
  }, [activeFarmId, filterPivot, supabase]);

  useEffect(() => { fetchReadings(); }, [fetchReadings]);

  const pivotMap = useMemo(() => new Map(pivots.map((p) => [p.id, p.name])), [pivots]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, reading_date: today() });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (r: Reading) => {
    setEditing(r);
    setForm({
      pivot_id: r.pivot_id,
      reading_date: r.reading_date,
      moisture_unit: r.moisture_unit,
      use_in_balance: r.use_in_balance,
      layer_1_note: r.layer_1_note != null ? String(r.layer_1_note) : "",
      layer_2_note: r.layer_2_note != null ? String(r.layer_2_note) : "",
      layer_3_note: r.layer_3_note != null ? String(r.layer_3_note) : "",
      notes: r.notes ?? "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeFarmId) return;
    if (!form.pivot_id) { setFormError("Selecione o pivô."); return; }
    if (!form.layer_1_note && !form.layer_2_note && !form.layer_3_note) {
      setFormError("Informe a nota de pelo menos uma camada.");
      return;
    }

    const n = (v: string) => v ? Number(v) : null;
    const noteToPct = (v: string) => v ? sensoryNoteToPercentCC(Number(v)) : null;

    const payload = {
      farm_id: activeFarmId,
      pivot_id: form.pivot_id,
      reading_date: form.reading_date,
      moisture_unit: form.moisture_unit,
      use_in_balance: form.use_in_balance,
      layer_1_note: n(form.layer_1_note),
      layer_2_note: n(form.layer_2_note),
      layer_3_note: n(form.layer_3_note),
      layer_1_moisture_pct: noteToPct(form.layer_1_note),
      layer_2_moisture_pct: noteToPct(form.layer_2_note),
      layer_3_moisture_pct: noteToPct(form.layer_3_note),
      notes: form.notes || null,
    };

    setSaving(true);
    setFormError("");
    try {
      const { error } = editing
        ? await supabase.from("soil_sensory_readings").update(payload).eq("id", editing.id)
        : await supabase.from("soil_sensory_readings").insert(payload);
      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          setFormError("Já existe uma leitura para este pivô nesta data. Edite a existente.");
        } else {
          setFormError(error.message);
        }
      } else {
        setModalOpen(false);
        setEditing(null);
        fetchReadings();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    await supabase.from("soil_sensory_readings").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setSaving(false);
    fetchReadings();
  };

  const noteOptions = [
    { value: "", label: "— sem leitura —" },
    ...SOIL_SENSORY_SCALE.map((s) => ({
      value: String(s.note),
      label: `${s.note.toFixed(1)} — ${s.moisturePctCc}% CC`,
    })),
  ];

  const scaleReference = SOIL_SENSORY_SCALE.filter((s) => Number.isInteger(s.note));

  const columns: Column<Reading>[] = [
    {
      header: "Data",
      render: (r) => new Date(r.reading_date + "T12:00:00").toLocaleDateString("pt-BR"),
    },
    {
      header: "Pivô",
      render: (r) => <span className="font-medium">{pivotMap.get(r.pivot_id) ?? "—"}</span>,
    },
    { header: "Camada 1", render: (r) => renderLayer(r.layer_1_note) },
    { header: "Camada 2", render: (r) => renderLayer(r.layer_2_note) },
    { header: "Camada 3", render: (r) => renderLayer(r.layer_3_note) },
    { header: "Unidade", render: (r) => r.moisture_unit === "weight" ? "Peso" : "Volume" },
    {
      header: "Balanço",
      render: (r) => r.use_in_balance
        ? <span className="inline-flex rounded-lg bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Ativa</span>
        : <span className="inline-flex rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">Auditoria</span>,
    },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
        </div>
      ),
    },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Sensorial de Solo"
          descricao="Método tátil de avaliação da umidade — escala 1-9 (USDA-NRCS · Embrapa)"
        />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para registrar leituras sensoriais por pivô."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Sensorial de Solo"
        descricao="Método tátil — avalia a umidade do solo por consistência/plasticidade e converte automaticamente para % da capacidade de campo"
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px]">
          <Select
            id="filter_pivot"
            label="Filtrar por pivô"
            value={filterPivot}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterPivot(e.target.value)}
            options={[
              { value: "", label: "Todos os pivôs" },
              ...pivots.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <Button onClick={openNew}>Nova leitura</Button>
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
            <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
          </div>
        ) : readings.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhuma leitura registrada. Clique em <b>Nova leitura</b> para começar.
          </p>
        ) : (
          <Table columns={columns} data={readings} getKey={(r) => r.id} />
        )}
      </Card>

      {/* Reference scale */}
      <Card>
        <p className="mb-3 text-sm font-semibold text-graphite-900 dark:text-white">
          Escala de referência (método USDA-NRCS · Marouelli/Embrapa · Bernardo)
        </p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
          {scaleReference.map((s) => {
            const cat = sensoryNoteCategory(s.note);
            const style = cat ? CATEGORY_STYLE[cat] : null;
            return (
              <div key={s.note} className={`rounded-lg p-3 text-center ${style?.bg ?? ""}`}>
                <div className={`text-lg font-bold ${style?.text ?? "text-graphite-900"}`}>
                  {s.note.toFixed(0)}
                </div>
                <div className={`text-xs ${style?.text ?? "text-graphite-500"}`}>
                  {s.moisturePctCc}% CC
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-graphite-500 dark:text-gray-400">
          🌊 Úmido (1-3) &nbsp;·&nbsp; 🌱 Moderado (3.5-6) &nbsp;·&nbsp; ⚠ Crítico (6.5-7.5) &nbsp;·&nbsp; 🏜 Seco (8-9)
        </p>
      </Card>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar leitura sensorial" : "Nova leitura sensorial"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="pivot_id"
              label="Pivô"
              required
              value={form.pivot_id}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => patch({ pivot_id: e.target.value })}
              options={pivots.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Input
              id="reading_date"
              label="Data da leitura"
              type="date"
              required
              value={form.reading_date}
              onChange={(e) => patch({ reading_date: e.target.value })}
            />
          </div>

          <fieldset className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 dark:border-brand-800/30 dark:bg-brand-900/10">
            <legend className="px-2 text-sm font-semibold text-brand-700 dark:text-brand-400">
              Camadas do perfil (superficial → profunda)
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <LayerField label="Camada 1 (superficial 0-20 cm)" value={form.layer_1_note} onChange={(v) => patch({ layer_1_note: v })} options={noteOptions} />
              <LayerField label="Camada 2 (média 20-40 cm)" value={form.layer_2_note} onChange={(v) => patch({ layer_2_note: v })} options={noteOptions} />
              <LayerField label="Camada 3 (profunda 40-60 cm)" value={form.layer_3_note} onChange={(v) => patch({ layer_3_note: v })} options={noteOptions} />
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="moisture_unit"
              label="Unidade de referência"
              value={form.moisture_unit}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => patch({ moisture_unit: e.target.value as "weight" | "volume" })}
              options={[
                { value: "weight", label: "Peso" },
                { value: "volume", label: "Volume" },
              ]}
            />
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.use_in_balance}
                  onChange={(e) => patch({ use_in_balance: e.target.checked })}
                  className="h-4 w-4 accent-brand-500"
                />
                <span>Usar esta leitura no balanço hídrico</span>
              </label>
            </div>
          </div>

          <TextArea
            id="notes"
            label="Observações"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Ex.: solo com fissuras visíveis; amostra na entre-linha; ontem choveu leve"
          />

          {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir leitura"
        message={`Excluir leitura do pivô ${deleteTarget ? pivotMap.get(deleteTarget.pivot_id) ?? "" : ""} em ${deleteTarget ? new Date(deleteTarget.reading_date + "T12:00:00").toLocaleDateString("pt-BR") : ""}?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function renderLayer(note: number | null) {
  if (note == null) return <span className="text-xs text-gray-400">—</span>;
  const pct = sensoryNoteToPercentCC(note);
  const cat = sensoryNoteCategory(note);
  const style = cat ? CATEGORY_STYLE[cat] : null;
  return (
    <div>
      <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${style?.bg ?? ""} ${style?.text ?? ""}`}>
        {note.toFixed(1)}
      </span>
      <span className="ml-1.5 text-xs text-graphite-500 dark:text-gray-400 tabular-nums">
        {pct != null ? `${pct.toFixed(0)}% CC` : ""}
      </span>
    </div>
  );
}

function LayerField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const noteNum = value ? Number(value) : null;
  const pct = noteNum != null ? sensoryNoteToPercentCC(noteNum) : null;
  const cat = noteNum != null ? sensoryNoteCategory(noteNum) : null;
  const style = cat ? CATEGORY_STYLE[cat] : null;

  return (
    <div>
      <Select
        id={`layer_${label}`}
        label={label}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        options={options}
      />
      {value && pct != null && (
        <div className={`mt-1.5 rounded-lg px-2 py-1 text-xs font-medium ${style?.bg ?? ""} ${style?.text ?? ""}`}>
          {style?.label} · {pct.toFixed(0)}% CC
        </div>
      )}
    </div>
  );
}
