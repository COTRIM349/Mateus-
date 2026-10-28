"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, ConfirmDialog, Input, Modal, Select, Table, type Column } from "@/components/ui";
import { PrerequisiteNotice } from "@/components/onboarding";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

interface PivotLite {
  id: string;
  name: string;
}

interface RainEntry {
  id: string;
  farm_id: string;
  pivot_id: string;
  date: string;
  precipitation_mm: number;
  created_at: string;
}

interface RainForm {
  date: string;
  precipitation_mm: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: RainForm = { date: today(), precipitation_mm: "" };

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

export default function LancamentoChuvasPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [rows, setRows] = useState<RainEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RainEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RainEntry | null>(null);
  const [form, setForm] = useState<RainForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!activeFarmId) {
      setPivots([]);
      setSelectedPivotId("");
      return;
    }

    supabase
      .from("pivots")
      .select("id,name")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setPivots((data ?? []) as PivotLite[]);
      });
  }, [activeFarmId, supabase]);

  const selectedPivot = useMemo(
    () => pivots.find((pivot) => pivot.id === selectedPivotId) ?? null,
    [pivots, selectedPivotId],
  );

  const load = useCallback(async () => {
    if (!activeFarmId || !selectedPivotId) {
      setRows([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("manual_rainfall_entries")
      .select("id,farm_id,pivot_id,date,precipitation_mm,created_at")
      .eq("farm_id", activeFarmId)
      .eq("pivot_id", selectedPivotId)
      .order("date", { ascending: false })
      .limit(180);

    if (!error) setRows((data ?? []) as RainEntry[]);
    setLoading(false);
  }, [activeFarmId, selectedPivotId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => {
    if (!selectedPivotId) return;
    setEditing(null);
    setForm({ ...EMPTY, date: today() });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (row: RainEntry) => {
    setEditing(row);
    setForm({
      date: row.date,
      precipitation_mm: String(row.precipitation_mm),
    });
    setFormError("");
    setModalOpen(true);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeFarmId || !selectedPivotId) {
      setFormError("Selecione o pivô.");
      return;
    }

    const rain = Number(form.precipitation_mm.replace(",", "."));
    if (!form.date) {
      setFormError("Informe a data da chuva.");
      return;
    }
    if (!Number.isFinite(rain) || rain < 0) {
      setFormError("Informe uma precipitação válida em milímetros.");
      return;
    }

    setSaving(true);
    setFormError("");

    const payload = {
      farm_id: activeFarmId,
      pivot_id: editing?.pivot_id ?? selectedPivotId,
      date: form.date,
      precipitation_mm: rain,
      source: "pluviometer",
    };

    const { error } = editing
      ? await supabase
          .from("manual_rainfall_entries")
          .update(payload)
          .eq("id", editing.id)
          .eq("farm_id", activeFarmId)
          .eq("pivot_id", editing.pivot_id)
      : await supabase
          .from("manual_rainfall_entries")
          .upsert(payload, { onConflict: "farm_id,pivot_id,date" });

    if (error) {
      setFormError(error.message);
      setSaving(false);
      return;
    }

    setModalOpen(false);
    setEditing(null);
    setSaving(false);
    await load();
  };

  const remove = async () => {
    if (!deleteTarget || !activeFarmId) return;
    setSaving(true);
    await supabase
      .from("manual_rainfall_entries")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("farm_id", activeFarmId)
      .eq("pivot_id", deleteTarget.pivot_id);
    setDeleteTarget(null);
    setSaving(false);
    await load();
  };

  const columns: Column<RainEntry>[] = [
    {
      header: "Data",
      render: (row) => <span className="font-medium">{fmtDate(row.date)}</span>,
    },
    {
      header: "Chuva lançada",
      align: "right",
      render: (row) => <span className="tabular-nums font-semibold">{row.precipitation_mm.toFixed(1)} mm</span>,
    },
    {
      header: "Origem",
      render: () => (
        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          Manual
        </span>
      ),
    },
    {
      header: "Ações",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>Excluir</Button>
        </div>
      ),
    },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Lançamento de Chuvas"
          descricao="Chuva operacional do manejo — registro manual por pivô"
        />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para registrar a chuva medida."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Lançamento de Chuvas"
        descricao="Selecione o pivô e registre a chuva medida. O valor entra somente no balanço hídrico daquele pivô."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
        <strong>Regra operacional:</strong> chuva de estação, API e previsão não entra automaticamente no manejo.
        Somente a chuva manual lançada para cada pivô é considerada no balanço hídrico.
      </div>

      <Card>
        <div className="grid gap-4 p-1 lg:grid-cols-[minmax(280px,420px)_1fr_auto] lg:items-end">
          <Select
            id="rain_pivot"
            label="Pivô"
            value={selectedPivotId}
            onChange={(event) => {
              setSelectedPivotId(event.target.value);
              setEditing(null);
              setFormError("");
            }}
            options={pivots.map((pivot) => ({ value: pivot.id, label: pivot.name }))}
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
              Chuva operacional
            </p>
            <div className="flex min-h-10 items-center rounded-xl border border-gray-200 px-4 py-2 text-sm text-graphite-800 dark:border-white/[0.08] dark:text-gray-100">
              {selectedPivot
                ? `Os lançamentos abaixo pertencem somente ao ${selectedPivot.name}.`
                : "Selecione um pivô para lançar ou consultar chuva."}
            </div>
          </div>

          <Button onClick={openNew} disabled={!selectedPivotId}>
            Nova chuva
          </Button>
        </div>
      </Card>

      {selectedPivotId && (
        <Card>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
              <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-graphite-700 dark:text-gray-200">
                Nenhuma chuva manual registrada para este pivô.
              </p>
              <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                Sem lançamento manual para o pivô, o manejo considera chuva igual a 0 mm.
              </p>
            </div>
          ) : (
            <Table columns={columns} data={rows} getKey={(row) => row.id} />
          )}
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setFormError(""); }}
        title={editing ? "Editar chuva" : `Nova chuva · ${selectedPivot?.name ?? "Pivô"}`}
      >
        <form onSubmit={save} className="space-y-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
              Pivô
            </p>
            <div className="flex h-10 items-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-graphite-900 dark:border-white/[0.08] dark:text-white">
              {selectedPivot?.name ?? "—"}
            </div>
          </div>

          <Input
            id="rain_date"
            label="Data da chuva"
            type="date"
            required
            value={form.date}
            onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
          />
          <Input
            id="rain_mm"
            label="Precipitação medida (mm)"
            type="number"
            min={0}
            max={500}
            step={0.1}
            required
            value={form.precipitation_mm}
            onChange={(event) => setForm((current) => ({ ...current, precipitation_mm: event.target.value }))}
          />

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
            Esta chuva será aplicada somente ao balanço hídrico de <strong>{selectedPivot?.name ?? "este pivô"}</strong> nesta data.
          </div>

          {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar chuva"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Excluir chuva"
        message={`Excluir o lançamento de ${deleteTarget?.precipitation_mm.toFixed(1) ?? "0,0"} mm em ${deleteTarget ? fmtDate(deleteTarget.date) : ""} para ${selectedPivot?.name ?? "este pivô"}? O manejo desse pivô voltará a considerar 0 mm nessa data.`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
