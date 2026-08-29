"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export interface AgronomicSource {
  id: string;
  source_type: string;
  institution: string | null;
  authors: string | null;
  year: number | null;
  title: string | null;
  reference: string | null;
  url: string | null;
  experimental_location: string | null;
  methodology: string | null;
  notes: string | null;
  created_at: string;
}

const SOURCE_TYPES = [
  { value: "fao", label: "FAO" },
  { value: "embrapa", label: "Embrapa" },
  { value: "artigo_cientifico", label: "Artigo científico" },
  { value: "universidade", label: "Universidade" },
  { value: "obtentor_fabricante", label: "Obtentor / fabricante" },
  { value: "assistencia_tecnica", label: "Assistência técnica" },
  { value: "historico_fazenda", label: "Histórico da fazenda" },
  { value: "calibracao_local", label: "Calibração local" },
  { value: "estimativa_provisoria", label: "Estimativa provisória" },
];

const sourceTypeLabel = Object.fromEntries(SOURCE_TYPES.map((o) => [o.value, o.label]));

export function AgronomicSourcesTab() {
  const supabase = createClient();
  const [sources, setSources] = useState<AgronomicSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AgronomicSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgronomicSource | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("agronomic_sources")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (!queryError && data) setSources(data as AgronomicSource[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<AgronomicSource>[] = [
    {
      header: "Fonte",
      render: (r) => (
        <div>
          <p className="font-medium text-graphite-900 dark:text-white">{r.title || r.institution || "Sem título"}</p>
          <p className="text-xs text-graphite-400">{sourceTypeLabel[r.source_type] ?? r.source_type}</p>
        </div>
      ),
    },
    { header: "Instituição", render: (r) => r.institution ?? "—" },
    { header: "Ano", render: (r) => r.year ?? "—", align: "right" },
    { header: "Local", render: (r) => r.experimental_location ?? "—" },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setModalOpen(true); }}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Arquivar</Button>
        </div>
      ),
    },
  ];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    const yearRaw = String(fd.get("year") ?? "").trim();
    const payload = {
      source_type: String(fd.get("source_type")),
      institution: String(fd.get("institution") ?? "").trim() || null,
      authors: String(fd.get("authors") ?? "").trim() || null,
      year: yearRaw ? Number(yearRaw) : null,
      title: String(fd.get("title") ?? "").trim() || null,
      reference: String(fd.get("reference") ?? "").trim() || null,
      url: String(fd.get("url") ?? "").trim() || null,
      experimental_location: String(fd.get("experimental_location") ?? "").trim() || null,
      methodology: String(fd.get("methodology") ?? "").trim() || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.title && !payload.institution && !payload.reference) {
      setError("Informe pelo menos título, instituição ou referência.");
      setSaving(false);
      return;
    }

    const response = editing
      ? await supabase.from("agronomic_sources").update(payload).eq("id", editing.id)
      : await supabase.from("agronomic_sources").insert(payload);

    if (response.error) {
      setError(response.error.message);
      setSaving(false);
      return;
    }

    setModalOpen(false);
    setEditing(null);
    setSaving(false);
    await load();
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error: deleteError } = await supabase
      .from("agronomic_sources")
      .update({ active: false, archived_at: new Date().toISOString() })
      .eq("id", deleteTarget.id);
    if (deleteError) setError(deleteError.message);
    setDeleteTarget(null);
    setSaving(false);
    await load();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-graphite-900 dark:text-white">Fontes agronômicas</h2>
          <p className="mt-1 text-xs text-graphite-400">
            Toda referência de Kc, fenologia, temperatura-base, raiz ou calibração deve apontar para uma fonte rastreável.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setError(""); setModalOpen(true); }}>Nova fonte</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400">Carregando fontes...</p>
        ) : sources.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400">Nenhuma fonte cadastrada.</p>
        ) : (
          <Table columns={columns} data={sources} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setError(""); }}
        title={editing ? "Editar fonte" : "Nova fonte agronômica"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="source_type"
              name="source_type"
              label="Tipo de fonte"
              options={SOURCE_TYPES}
              required
              defaultValue={editing?.source_type ?? "estimativa_provisoria"}
            />
            <Input id="year" name="year" label="Ano" type="number" min="1800" max="2200" defaultValue={editing?.year ?? ""} />
          </div>
          <Input id="title" name="title" label="Título / documento" defaultValue={editing?.title ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="institution" name="institution" label="Autor / instituição" defaultValue={editing?.institution ?? ""} />
            <Input id="authors" name="authors" label="Autores" defaultValue={editing?.authors ?? ""} />
          </div>
          <Input id="experimental_location" name="experimental_location" label="Local do experimento / origem" defaultValue={editing?.experimental_location ?? ""} />
          <Input id="url" name="url" label="Link" type="url" defaultValue={editing?.url ?? ""} />
          <TextArea id="reference" name="reference" label="Referência bibliográfica" defaultValue={editing?.reference ?? ""} />
          <TextArea id="methodology" name="methodology" label="Método utilizado" defaultValue={editing?.methodology ?? ""} />
          <TextArea id="notes" name="notes" label="Observações" defaultValue={editing?.notes ?? ""} />
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar fonte"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Arquivar fonte"
        message="Arquivar esta fonte? Os parâmetros e históricos vinculados continuarão preservados."
        confirmLabel="Arquivar"
        loading={saving}
      />
    </>
  );
}
