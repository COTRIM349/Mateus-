"use client";

import { useState, useEffect } from "react";
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
import { PIVOT_STATUSES } from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";

interface Pivot {
  id: string;
  farm_id: string;
  module_id: string | null;
  name: string;
  area: number;
  radius: number;
  flow_rate: number;
  pump_power: number;
  motor_efficiency: number;
  efficiency: number;
  latitude: number;
  longitude: number;
  status: string;
  active: boolean;
}

interface ProdModule {
  id: string;
  name: string;
  active: boolean;
}

export default function PivosPage() {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<Pivot>({
    table: "pivots",
    filters: { farm_id: activeFarmId },
    orderBy: "name",
    ascending: true,
  });

  const [modules, setModules] = useState<ProdModule[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Pivot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pivot | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!activeFarmId) return;
    const supabase = createClient();
    supabase
      .from("production_modules")
      .select("id, name, active")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data: mods }) => {
        if (mods) setModules(mods);
      });
  }, [activeFarmId]);

  const activePivots = data.filter((p) => p.active);

  const moduleMap = new Map(modules.map((m) => [m.id, m.name]));

  const statusLabels: Record<string, string> = Object.fromEntries(
    PIVOT_STATUSES.map((s) => [s.value, s.label])
  );

  const statusColors: Record<string, string> = {
    irrigando: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    parado: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
    manutencao: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    alerta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  const columns: Column<Pivot>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Módulo", render: (r) => r.module_id ? moduleMap.get(r.module_id) ?? "—" : "—" },
    { header: "Área (ha)", render: (r) => r.area.toLocaleString("pt-BR"), align: "right" },
    { header: "Vazão (m³/h)", render: (r) => r.flow_rate.toLocaleString("pt-BR"), align: "right" },
    {
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] ?? ""}`}>
          {statusLabels[r.status] ?? r.status}
        </span>
      ),
    },
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
    const efficiency = Number(fd.get("efficiency"));
    if (efficiency < 0 || efficiency > 100) {
      setFormError("Eficiência deve estar entre 0 e 100%");
      setSaving(false);
      return;
    }
    const payload = {
      farm_id: activeFarmId!,
      module_id: (fd.get("module_id") as string) || null,
      name: fd.get("name") as string,
      area: Number(fd.get("area")),
      radius: Number(fd.get("radius")),
      flow_rate: Number(fd.get("flow_rate")),
      pump_power: Number(fd.get("pump_power")),
      motor_efficiency: Number(fd.get("motor_efficiency")) / 100,
      efficiency: efficiency / 100,
      latitude: Number(fd.get("latitude")),
      longitude: Number(fd.get("longitude")),
      status: fd.get("status") as string,
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Pivot, "id" | "created_at" | "updated_at">);
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
        <PageHeader titulo="Pivôs" descricao="Cadastro e monitoramento de pivôs centrais" />
        <Card>
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Selecione uma fazenda ativa para gerenciar pivôs.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Pivôs" descricao="Cadastro e monitoramento de pivôs centrais" />

      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Novo pivô</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activePivots.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum pivô cadastrado para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activePivots} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar pivô" : "Novo pivô"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" placeholder="Pivô 01" required defaultValue={editing?.name} />
            <Select
              id="module_id"
              name="module_id"
              label="Módulo produtivo"
              options={[{ value: "", label: "Nenhum" }, ...modules.map((m) => ({ value: m.id, label: m.name }))]}
              defaultValue={editing?.module_id ?? ""}
            />
            <Input id="area" name="area" label="Área (ha)" type="number" step="any" required defaultValue={editing?.area} />
            <Input id="radius" name="radius" label="Raio (m)" type="number" step="any" required defaultValue={editing?.radius} />
            <Input id="flow_rate" name="flow_rate" label="Vazão (m³/h)" type="number" step="any" required defaultValue={editing?.flow_rate} />
            <Input id="pump_power" name="pump_power" label="Potência da bomba (cv)" type="number" step="any" required defaultValue={editing?.pump_power} />
            <Input id="motor_efficiency" name="motor_efficiency" label="Eficiência do motor (%)" type="number" step="any" required defaultValue={editing ? (editing.motor_efficiency * 100) : 88} />
            <Input id="efficiency" name="efficiency" label="Eficiência de aplicação (%)" type="number" step="any" required defaultValue={editing ? (editing.efficiency * 100) : 85} />
            <Input id="latitude" name="latitude" label="Latitude" type="number" step="any" required defaultValue={editing?.latitude} placeholder="-15.8022" />
            <Input id="longitude" name="longitude" label="Longitude" type="number" step="any" required defaultValue={editing?.longitude} placeholder="-43.3089" />
            <Select
              id="status"
              name="status"
              label="Status"
              options={[...PIVOT_STATUSES]}
              required
              defaultValue={editing?.status ?? "parado"}
            />
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
        title="Excluir pivô"
        message={`Deseja excluir o pivô "${deleteTarget?.name}"? Esta ação desativará o pivô.`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
