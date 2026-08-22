"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button, Card, Input, Table, Modal, ConfirmDialog, TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { PrerequisiteNotice } from "@/components/onboarding";
import {
  MANUAL_RAIN_OVERRIDE_NOTE,
  MANUAL_RAIN_UNIT,
  buildManualRainfallInsert,
  effectivePrecipFromManual,
  validateManualRainfallMm,
  validateReadingDate,
} from "@/modules/weather/services";

interface RainRow {
  id: string;
  farm_id: string;
  reading_date: string;
  precipitation_mm: number;
  use_in_balance: boolean;
  notes: string | null;
  created_at: string;
}

interface FormState {
  reading_date: string;
  precipitation_mm: string;
  use_in_balance: boolean;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: FormState = {
  reading_date: today(),
  precipitation_mm: "",
  use_in_balance: true,
  notes: "",
};

function fmtDate(ymd: string): string {
  const d = ymd.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export default function LancamentoChuvasPage() {
  const { activeFarmId, profile } = useAuth();
  const supabase = createClient();

  const [rows, setRows] = useState<RainRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RainRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RainRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);

  const fetchRows = useCallback(async () => {
    if (!activeFarmId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("manual_rainfall")
      .select("id, farm_id, reading_date, precipitation_mm, use_in_balance, notes, created_at")
      .eq("farm_id", activeFarmId)
      .order("reading_date", { ascending: false })
      .limit(200);
    setRows((data ?? []) as RainRow[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, reading_date: today() });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (r: RainRow) => {
    setEditing(r);
    setForm({
      reading_date: r.reading_date.slice(0, 10),
      precipitation_mm: String(r.precipitation_mm),
      use_in_balance: r.use_in_balance,
      notes: r.notes ?? "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeFarmId) { setFormError("Selecione uma fazenda."); return; }
    const dateErr = validateReadingDate(form.reading_date);
    if (dateErr) { setFormError(dateErr); return; }
    const mm = Number(form.precipitation_mm);
    const mmErr = validateManualRainfallMm(mm);
    if (mmErr) { setFormError(mmErr); return; }

    let payload: ReturnType<typeof buildManualRainfallInsert>;
    try {
      payload = buildManualRainfallInsert({
        farmId: activeFarmId,
        readingDate: form.reading_date,
        precipitationMm: mm,
        notes: form.notes || null,
        useInBalance: form.use_in_balance,
        observedBy: profile?.id ?? null,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Dados inválidos");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const { error } = editing
        ? await supabase.from("manual_rainfall").update(payload).eq("id", editing.id)
        : await supabase.from("manual_rainfall").upsert(payload, {
          onConflict: "farm_id,reading_date",
        });
      if (error) setFormError(error.message);
      else {
        setModalOpen(false);
        setEditing(null);
        fetchRows();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    await supabase.from("manual_rainfall").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setSaving(false);
    fetchRows();
  };

  const previewPe = form.precipitation_mm !== "" && Number.isFinite(Number(form.precipitation_mm))
    ? effectivePrecipFromManual(Number(form.precipitation_mm))
    : null;

  const columns: Column<RainRow>[] = [
    { header: "Data", render: (r) => fmtDate(r.reading_date) },
    {
      header: "Chuva",
      render: (r) => <span className="tabular-nums font-medium">{r.precipitation_mm.toFixed(1)} mm</span>,
    },
    {
      header: "Pe (SCS)",
      render: (r) => (
        <span className="tabular-nums text-graphite-600 dark:text-gray-300">
          {effectivePrecipFromManual(r.precipitation_mm).toFixed(1)} mm
        </span>
      ),
    },
    {
      header: "No balanço",
      render: (r) => (
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
          r.use_in_balance
            ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
            : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
        }`}>
          {r.use_in_balance ? "Sim" : "Só registro"}
        </span>
      ),
    },
    {
      header: "Observação",
      render: (r) => <span className="text-xs text-graphite-500 dark:text-gray-400">{r.notes ?? "—"}</span>,
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
        <PageHeader titulo="Chuva manual" descricao="Pluviômetro de campo quando a estação falha" />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para registrar chuva medida."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Chuva manual"
        descricao="Registre a chuva do pluviômetro ou observação de campo. Com uso no balanço, ela substitui a precipitação da estação naquele dia — a ETo continua vindo do clima aprovado."
      />

      <div className="flex justify-end">
        <Button onClick={openNew}>Nova chuva</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
            <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhuma chuva lançada. Clique em <b>Nova chuva</b> quando a estação não coletar ou o pluviômetro for a referência.
          </p>
        ) : (
          <Table columns={columns} data={rows} getKey={(r) => r.id} />
        )}
      </Card>

      <p className="text-[11px] text-graphite-400 dark:text-gray-500">
        Unidade: {MANUAL_RAIN_UNIT} · {MANUAL_RAIN_OVERRIDE_NOTE}
      </p>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar chuva manual" : "Nova chuva manual"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="reading_date"
              label="Data"
              type="date"
              required
              max={today()}
              value={form.reading_date}
              onChange={(e) => patch({ reading_date: e.target.value })}
            />
            <Input
              id="precipitation_mm"
              label="Chuva bruta (mm)"
              type="number"
              min={0}
              max={500}
              step={0.1}
              required
              value={form.precipitation_mm}
              onChange={(e) => patch({ precipitation_mm: e.target.value })}
            />
          </div>
          {previewPe != null && (
            <p className="text-xs text-graphite-500 dark:text-gray-400">
              Pe estimada (USDA-SCS):{" "}
              <strong className="text-graphite-800 dark:text-white">{previewPe.toFixed(1)} mm</strong>
              {" "}— o motor recalcula com a CAD do dia.
            </p>
          )}
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-white/[0.08]">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.use_in_balance}
              onChange={(e) => patch({ use_in_balance: e.target.checked })}
            />
            <span>
              <span className="font-medium text-graphite-800 dark:text-gray-100">Usar no balanço hídrico</span>
              <span className="mt-0.5 block text-xs text-graphite-500 dark:text-gray-400">
                Substitui a chuva da estação neste dia. A ETo permanece a do clima aprovado.
              </span>
            </span>
          </label>
          <TextArea
            id="notes"
            label="Observação (opcional)"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Ex.: pluviômetro módulo RDM; estação offline"
          />
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir chuva"
        message={`Excluir chuva de ${deleteTarget ? fmtDate(deleteTarget.reading_date) : ""} (${deleteTarget?.precipitation_mm.toFixed(1) ?? ""} mm)? O próximo cálculo do balanço volta a usar a precipitação da estação.`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
