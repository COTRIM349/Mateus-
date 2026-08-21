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
  SENSORY_NOTE_OPTIONS,
  SENSORY_NOTE_UNIT,
  buildSensoryInsert,
  combineObservedAt,
  resolveSensoryNote,
  validateSensoryDepthCm,
  validateSensoryNote,
} from "@/modules/soil/services";
import { isActiveParcel } from "@/modules/assignment/services";

interface Reading {
  id: string;
  farm_id: string;
  pivot_id: string;
  parcel_id: string | null;
  reading_date: string;
  observed_at: string | null;
  note: number | null;
  depth_cm: number | null;
  layer_1_note: number | null;
  layer_2_note: number | null;
  layer_3_note: number | null;
  notes: string | null;
}

interface PivotLite { id: string; name: string }

interface ParcelLite { id: string; name: string | null; pivot_id: string; status: string | null; active: boolean | null }

interface FormState {
  pivot_id: string;
  reading_date: string;
  reading_time: string;
  note: string;
  depth_cm: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const nowHm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const EMPTY_FORM: FormState = {
  pivot_id: "",
  reading_date: today(),
  reading_time: nowHm(),
  note: "",
  depth_cm: "20",
  notes: "",
};

function formatObserved(r: Reading): string {
  if (r.observed_at) {
    const d = new Date(r.observed_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    }
  }
  return new Date(r.reading_date + "T12:00:00").toLocaleDateString("pt-BR");
}

export default function SensorialSoloPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [readings, setReadings] = useState<Reading[]>([]);
  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
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
      .select("id, name")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (data) setPivots(data as PivotLite[]); });
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (pivots.length === 0) {
      setParcels([]);
      return;
    }
    supabase
      .from("pivot_crop_assignments")
      .select("id, name, pivot_id, status, active")
      .in("pivot_id", pivots.map((p) => p.id))
      .then(({ data }) => { if (data) setParcels(data as ParcelLite[]); });
  }, [pivots, supabase]);

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
  const parcelMap = useMemo(() => new Map(parcels.map((p) => [p.id, p.name || "Parcela"])), [parcels]);

  const activeParcelFor = useCallback((pivotId: string) => {
    return parcels.find((p) => p.pivot_id === pivotId && isActiveParcel(p.status, p.active)) ?? null;
  }, [parcels]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, reading_date: today(), reading_time: nowHm() });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (r: Reading) => {
    setEditing(r);
    const observed = r.observed_at ? new Date(r.observed_at) : null;
    const time = observed && !Number.isNaN(observed.getTime())
      ? `${String(observed.getHours()).padStart(2, "0")}:${String(observed.getMinutes()).padStart(2, "0")}`
      : "12:00";
    setForm({
      pivot_id: r.pivot_id,
      reading_date: r.reading_date,
      reading_time: time,
      note: String(resolveSensoryNote(r) ?? ""),
      depth_cm: r.depth_cm != null ? String(r.depth_cm) : "20",
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
    const note = Number(form.note);
    const noteErr = validateSensoryNote(note);
    if (noteErr) { setFormError(noteErr); return; }
    const depth = form.depth_cm ? Number(form.depth_cm) : null;
    const depthErr = validateSensoryDepthCm(depth);
    if (depthErr) { setFormError(depthErr); return; }

    const parcel = activeParcelFor(form.pivot_id);
    const payload = buildSensoryInsert({
      farmId: activeFarmId,
      pivotId: form.pivot_id,
      parcelId: editing?.parcel_id ?? parcel?.id ?? null,
      readingDate: form.reading_date,
      observedAt: combineObservedAt(form.reading_date, form.reading_time),
      note,
      depthCm: depth as number,
      notes: form.notes || null,
    });

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

  const selectedParcel = form.pivot_id ? activeParcelFor(form.pivot_id) : null;

  const columns: Column<Reading>[] = [
    { header: "Data / hora", render: (r) => formatObserved(r) },
    { header: "Pivô", render: (r) => <span className="font-medium">{pivotMap.get(r.pivot_id) ?? "—"}</span> },
    { header: "Parcela", render: (r) => r.parcel_id ? (parcelMap.get(r.parcel_id) ?? "ciclo") : "—" },
    {
      header: "Nota",
      render: (r) => {
        const n = resolveSensoryNote(r);
        return n == null
          ? <span className="text-xs text-gray-400">—</span>
          : <span className="inline-flex rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold tabular-nums text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{n}</span>;
      },
    },
    { header: "Profundidade", render: (r) => r.depth_cm != null ? `${r.depth_cm} cm` : "—" },
    { header: "Observação", render: (r) => <span className="text-xs text-graphite-500 dark:text-gray-400">{r.notes ?? "—"}</span> },
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
          descricao="Nota de campo 1–10 — sem conversão automática para % da CC"
        />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para registrar avaliações sensoriais por pivô."
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
        descricao="Avaliação tátil em campo. A nota 1–10 entra no histórico; não vira % da CC nem substitui o ARM."
      />

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
        <Button onClick={openNew}>Nova avaliação</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
            <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
          </div>
        ) : readings.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhuma avaliação registrada. Clique em <b>Nova avaliação</b> para começar.
          </p>
        ) : (
          <Table columns={columns} data={readings} getKey={(r) => r.id} />
        )}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-graphite-900 dark:text-white">Escala operacional</p>
        <div className="flex flex-wrap gap-1.5">
          {SENSORY_NOTE_OPTIONS.map((o) => (
            <span key={o.value} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-sm font-bold tabular-nums text-graphite-700 dark:bg-white/[0.04] dark:text-gray-200">
              {o.label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-graphite-500 dark:text-gray-400">
          Unidade: {SENSORY_NOTE_UNIT}. 1 = mais úmido ao tato · 10 = mais seco. A conversão para % da CC exige calibração por textura e pivô — ainda não aplicada.
        </p>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar avaliação sensorial" : "Nova avaliação sensorial"}
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
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">Parcela ativa</p>
              <p className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-graphite-800 dark:border-white/[0.08] dark:text-gray-100">
                {form.pivot_id
                  ? (selectedParcel?.name || (selectedParcel ? "Parcela ativa" : "Nenhuma parcela ativa neste pivô"))
                  : "Selecione o pivô"}
              </p>
            </div>
            <Input
              id="reading_date"
              label="Data"
              type="date"
              required
              value={form.reading_date}
              onChange={(e) => patch({ reading_date: e.target.value })}
            />
            <Input
              id="reading_time"
              label="Hora"
              type="time"
              required
              value={form.reading_time}
              onChange={(e) => patch({ reading_time: e.target.value })}
            />
            <Select
              id="note"
              label="Nota sensorial (1–10)"
              required
              value={form.note}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => patch({ note: e.target.value })}
              options={[{ value: "", label: "Selecione a nota" }, ...SENSORY_NOTE_OPTIONS]}
            />
            <Input
              id="depth_cm"
              label="Profundidade avaliada (cm)"
              type="number"
              min={1}
              max={300}
              step={1}
              required
              value={form.depth_cm}
              onChange={(e) => patch({ depth_cm: e.target.value })}
            />
          </div>

          <TextArea
            id="notes"
            label="Observação (opcional)"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Ex.: amostra na entre-linha; fissuras visíveis"
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
        title="Excluir avaliação"
        message={`Excluir avaliação do pivô ${deleteTarget ? pivotMap.get(deleteTarget.pivot_id) ?? "" : ""} em ${deleteTarget ? formatObserved(deleteTarget) : ""}?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
