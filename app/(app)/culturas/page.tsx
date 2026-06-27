"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Table,
  Modal,
  ConfirmDialog,
  type Column,
} from "@/components/ui";
import { useCrud } from "@/lib/hooks";
import { CROP_STAGES } from "@/constants/brazil";

interface KcByStage {
  germinacao: number;
  vegetativo: number;
  floracao: number;
  enchimento: number;
  maturacao: number;
  colheita: number;
}

interface Culture {
  id: string;
  name: string;
  scientific_name: string | null;
  kc_by_stage: KcByStage;
  root_depth: number;
  depletion_factor: number;
  cycle_days: number;
  active: boolean;
}

export default function CulturasPage() {
  const { data, loading, create, update, softDelete } = useCrud<Culture>({
    table: "cultures",
    orderBy: "name",
    ascending: true,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Culture | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Culture | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeCultures = data.filter((c) => c.active);

  const columns: Column<Culture>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Nome científico", render: (r) => r.scientific_name ? <em>{r.scientific_name}</em> : "—" },
    { header: "Prof. raiz (m)", render: (r) => r.root_depth.toLocaleString("pt-BR"), align: "right" },
    { header: "Fator depleção", render: (r) => r.depletion_factor.toLocaleString("pt-BR"), align: "right" },
    { header: "Ciclo (dias)", render: (r) => r.cycle_days, align: "right" },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setModalOpen(true); }}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
        </div>
      ),
    },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const fd = new FormData(e.currentTarget);

    const depletionFactor = Number(fd.get("depletion_factor"));
    if (depletionFactor < 0 || depletionFactor > 1) {
      setFormError("Fator de depleção deve estar entre 0 e 1");
      setSaving(false);
      return;
    }

    const kc_by_stage: KcByStage = {
      germinacao: Number(fd.get("kc_germinacao")),
      vegetativo: Number(fd.get("kc_vegetativo")),
      floracao: Number(fd.get("kc_floracao")),
      enchimento: Number(fd.get("kc_enchimento")),
      maturacao: Number(fd.get("kc_maturacao")),
      colheita: Number(fd.get("kc_colheita")),
    };

    const payload = {
      name: fd.get("name") as string,
      scientific_name: (fd.get("scientific_name") as string) || null,
      kc_by_stage,
      root_depth: Number(fd.get("root_depth")),
      depletion_factor: depletionFactor,
      cycle_days: Number(fd.get("cycle_days")),
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Culture, "id" | "created_at" | "updated_at">);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await softDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setFormError("Erro ao excluir");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader titulo="Culturas" descricao="Coeficientes agronômicos e estágios fenológicos" />

      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova cultura</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activeCultures.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma cultura cadastrada.</p>
        ) : (
          <Table columns={columns} data={activeCultures} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar cultura" : "Nova cultura"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" placeholder="Soja" required defaultValue={editing?.name} />
            <Input id="scientific_name" name="scientific_name" label="Nome científico" placeholder="Glycine max" defaultValue={editing?.scientific_name ?? ""} />
            <Input id="root_depth" name="root_depth" label="Profundidade da raiz (m)" type="number" step="any" required defaultValue={editing?.root_depth} />
            <Input id="depletion_factor" name="depletion_factor" label="Fator de depleção (0-1)" type="number" step="0.01" min="0" max="1" required defaultValue={editing?.depletion_factor} />
            <Input id="cycle_days" name="cycle_days" label="Ciclo (dias)" type="number" required defaultValue={editing?.cycle_days} />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-graphite-900 dark:text-gray-200">Coeficiente de cultura (Kc) por estágio</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {CROP_STAGES.map((stage) => (
                <Input
                  key={stage.value}
                  id={`kc_${stage.value}`}
                  name={`kc_${stage.value}`}
                  label={stage.label}
                  type="number"
                  step="0.01"
                  min="0"
                  max="2"
                  required
                  defaultValue={editing?.kc_by_stage?.[stage.value as keyof KcByStage] ?? ""}
                />
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
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
        title="Excluir cultura"
        message={`Deseja excluir a cultura "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
