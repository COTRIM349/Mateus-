"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  Modal,
  ConfirmDialog,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { SOIL_TEXTURES } from "@/constants/brazil";

interface Soil {
  id: string;
  farm_id: string | null;
  name: string;
  texture: string;
  field_capacity: number;
  wilting_point: number;
  bulk_density: number;
  infiltration_rate: number;
  active: boolean;
}

export default function SolosPage() {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<Soil>({
    table: "soils",
    filters: { farm_id: activeFarmId },
    orderBy: "name",
    ascending: true,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Soil | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Soil | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeSoils = data.filter((s) => s.active);

  const textureLabels: Record<string, string> = Object.fromEntries(
    SOIL_TEXTURES.map((t) => [t.value, t.label])
  );

  const columns: Column<Soil>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Textura", render: (r) => textureLabels[r.texture] ?? r.texture },
    { header: "CC (cm³/cm³)", render: (r) => r.field_capacity.toLocaleString("pt-BR"), align: "right" },
    { header: "PMP (cm³/cm³)", render: (r) => r.wilting_point.toLocaleString("pt-BR"), align: "right" },
    { header: "Densidade (g/cm³)", render: (r) => r.bulk_density.toLocaleString("pt-BR"), align: "right" },
    { header: "Infiltração (mm/h)", render: (r) => r.infiltration_rate.toLocaleString("pt-BR"), align: "right" },
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

    const fieldCapacity = Number(fd.get("field_capacity"));
    const wiltingPoint = Number(fd.get("wilting_point"));
    if (fieldCapacity <= wiltingPoint) {
      setFormError("Capacidade de campo deve ser maior que o ponto de murcha permanente.");
      setSaving(false);
      return;
    }

    const payload = {
      farm_id: activeFarmId!,
      name: fd.get("name") as string,
      texture: fd.get("texture") as string,
      field_capacity: fieldCapacity,
      wilting_point: wiltingPoint,
      bulk_density: Number(fd.get("bulk_density")),
      infiltration_rate: Number(fd.get("infiltration_rate")),
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Soil, "id" | "created_at" | "updated_at">);
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

  if (!activeFarmId) {
    return (
      <div className="space-y-6">
        <PageHeader titulo="Solos" descricao="Parâmetros hídricos e tipos de solo" />
        <Card>
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Selecione uma fazenda ativa para gerenciar solos.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Solos" descricao="Parâmetros hídricos e tipos de solo" />

      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Novo solo</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activeSoils.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum solo cadastrado para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeSoils} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar solo" : "Novo solo"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" placeholder="Latossolo Vermelho" required defaultValue={editing?.name} />
            <Select
              id="texture"
              name="texture"
              label="Textura"
              options={[...SOIL_TEXTURES]}
              required
              defaultValue={editing?.texture ?? "franco"}
            />
            <Input id="field_capacity" name="field_capacity" label="Capacidade de campo (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.field_capacity} placeholder="0.380" />
            <Input id="wilting_point" name="wilting_point" label="Ponto de murcha (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.wilting_point} placeholder="0.180" />
            <Input id="bulk_density" name="bulk_density" label="Densidade do solo (g/cm³)" type="number" step="0.01" required defaultValue={editing?.bulk_density} placeholder="1.30" />
            <Input id="infiltration_rate" name="infiltration_rate" label="Taxa de infiltração (mm/h)" type="number" step="0.1" required defaultValue={editing?.infiltration_rate} placeholder="15.0" />
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
        title="Excluir solo"
        message={`Deseja excluir o solo "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
