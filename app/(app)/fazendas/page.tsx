"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Input, Select, Table, Modal, ConfirmDialog, Tabs, TextArea, type Column } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { BRAZILIAN_STATES } from "@/constants/brazil";

interface Farm {
  id: string;
  company_id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  altitude: number;
  total_area: number;
  irrigated_area: number;
  timezone: string;
  active: boolean;
}

interface Season {
  id: string;
  farm_id: string;
  name: string;
  start_date: string;
  end_date: string;
  active: boolean;
}

interface ProdModule {
  id: string;
  farm_id: string;
  name: string;
  description: string | null;
  total_area: number;
  active: boolean;
}

const farmTabs = [
  { id: "fazendas", label: "Fazendas" },
  { id: "safras", label: "Safras" },
  { id: "modulos", label: "Módulos Produtivos" },
];

export default function FazendasPage() {
  const [activeTab, setActiveTab] = useState("fazendas");

  return (
    <div className="space-y-6">
      <PageHeader titulo="Fazendas" descricao="Gestão de fazendas, safras e módulos produtivos" />
      <Tabs tabs={farmTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "fazendas" && <FarmsTab />}
        {activeTab === "safras" && <SeasonsTab />}
        {activeTab === "modulos" && <ModulesTab />}
      </div>
    </div>
  );
}

function FarmsTab() {
  const { profile } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<Farm>({
    table: "farms",
    filters: { company_id: profile?.companyId ?? null },
    orderBy: "name",
    ascending: true,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Farm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Farm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeFarms = data.filter((f) => f.active);

  const columns: Column<Farm>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Cidade", render: (r) => r.city },
    { header: "UF", render: (r) => r.state },
    { header: "Área total (ha)", render: (r) => r.total_area.toLocaleString("pt-BR"), align: "right" },
    { header: "Área irrigada (ha)", render: (r) => r.irrigated_area.toLocaleString("pt-BR"), align: "right" },
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
    const payload = {
      company_id: profile?.companyId,
      name: fd.get("name") as string,
      city: fd.get("city") as string,
      state: fd.get("state") as string,
      latitude: Number(fd.get("latitude")),
      longitude: Number(fd.get("longitude")),
      altitude: Number(fd.get("altitude") || 0),
      total_area: Number(fd.get("total_area")),
      irrigated_area: Number(fd.get("irrigated_area")),
      timezone: "America/Sao_Paulo",
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Farm, "id" | "created_at" | "updated_at">);
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
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova fazenda</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activeFarms.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma fazenda cadastrada.</p>
        ) : (
          <Table columns={columns} data={activeFarms} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar fazenda" : "Nova fazenda"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" required defaultValue={editing?.name} />
            <Input id="city" name="city" label="Cidade" required defaultValue={editing?.city} />
            <Select id="state" name="state" label="Estado" options={[...BRAZILIAN_STATES]} required defaultValue={editing?.state} />
            <Input id="altitude" name="altitude" label="Altitude (m)" type="number" step="any" defaultValue={editing?.altitude ?? 0} />
            <Input id="latitude" name="latitude" label="Latitude" type="number" step="any" required defaultValue={editing?.latitude} placeholder="-15.8022" />
            <Input id="longitude" name="longitude" label="Longitude" type="number" step="any" required defaultValue={editing?.longitude} placeholder="-43.3089" />
            <Input id="total_area" name="total_area" label="Área total (ha)" type="number" step="any" required defaultValue={editing?.total_area} />
            <Input id="irrigated_area" name="irrigated_area" label="Área irrigada (ha)" type="number" step="any" required defaultValue={editing?.irrigated_area} />
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
        title="Excluir fazenda"
        message={`Deseja excluir a fazenda "${deleteTarget?.name}"? Esta ação desativará a fazenda.`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

function SeasonsTab() {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<Season>({
    table: "seasons",
    filters: { farm_id: activeFarmId },
    orderBy: "start_date",
    ascending: false,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Season | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeSeasons = data.filter((s) => s.active);

  const columns: Column<Season>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Início", render: (r) => new Date(r.start_date + "T12:00:00").toLocaleDateString("pt-BR") },
    { header: "Fim", render: (r) => new Date(r.end_date + "T12:00:00").toLocaleDateString("pt-BR") },
    {
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.active ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400" : "bg-gray-100 text-gray-500"}`}>
          {r.active ? "Ativa" : "Encerrada"}
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
    const payload = {
      farm_id: activeFarmId!,
      name: fd.get("name") as string,
      start_date: fd.get("start_date") as string,
      end_date: fd.get("end_date") as string,
      active: true,
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Season, "id" | "created_at" | "updated_at">);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  if (!activeFarmId) {
    return <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione uma fazenda ativa para gerenciar safras.</p></Card>;
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova safra</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activeSeasons.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma safra cadastrada para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeSeasons} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar safra" : "Nova safra"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="name" name="name" label="Nome" placeholder="Safra 2025/2026" required defaultValue={editing?.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="start_date" name="start_date" label="Data de início" type="date" required defaultValue={editing?.start_date} />
            <Input id="end_date" name="end_date" label="Data de fim" type="date" required defaultValue={editing?.end_date} />
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
        onConfirm={async () => { if (deleteTarget) { await softDelete(deleteTarget.id); setDeleteTarget(null); } }}
        title="Excluir safra"
        message={`Deseja excluir a safra "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

function ModulesTab() {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<ProdModule>({
    table: "production_modules",
    filters: { farm_id: activeFarmId },
    orderBy: "name",
    ascending: true,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProdModule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProdModule | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeModules = data.filter((m) => m.active);

  const columns: Column<ProdModule>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Descrição", render: (r) => r.description ?? "—" },
    { header: "Área (ha)", render: (r) => r.total_area.toLocaleString("pt-BR"), align: "right" },
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
    const payload = {
      farm_id: activeFarmId!,
      name: fd.get("name") as string,
      description: (fd.get("description") as string) || null,
      total_area: Number(fd.get("total_area") || 0),
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<ProdModule, "id" | "created_at" | "updated_at">);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  if (!activeFarmId) {
    return <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione uma fazenda ativa para gerenciar módulos.</p></Card>;
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Novo módulo</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activeModules.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum módulo cadastrado para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeModules} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar módulo" : "Novo módulo"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="name" name="name" label="Nome" placeholder="RDM, M1, M2/M3..." required defaultValue={editing?.name} />
          <TextArea id="description" name="description" label="Descrição" defaultValue={editing?.description ?? ""} />
          <Input id="total_area" name="total_area" label="Área total (ha)" type="number" step="any" defaultValue={editing?.total_area ?? 0} />
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
        onConfirm={async () => { if (deleteTarget) { await softDelete(deleteTarget.id); setDeleteTarget(null); } }}
        title="Excluir módulo"
        message={`Deseja excluir o módulo "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}
