"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Input, Select, Table, Modal, ConfirmDialog, Tabs, TextArea, type Column } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { BRAZILIAN_STATES } from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import {
  ensureVirtualStation,
  syncVirtualStationWithFarm,
} from "@/modules/weather/services/virtual-station.service";
import { parseCoordinate } from "@/utils/coord";

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
    <div className="space-y-8">
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

  const [coordWarnings, setCoordWarnings] = useState<{ lat?: string; lon?: string }>({});

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    setCoordWarnings({});
    const fd = new FormData(e.currentTarget);
    const activateVirtual = fd.get("activate_virtual_station") === "on";

    // Parse robusto de latitude/longitude aceitando ponto ou vírgula.
    const latParse = parseCoordinate(String(fd.get("latitude") ?? ""), "latitude");
    const lonParse = parseCoordinate(String(fd.get("longitude") ?? ""), "longitude");
    if (!latParse.valid || !lonParse.valid) {
      setFormError(
        [latParse.error && `Latitude: ${latParse.error}`, lonParse.error && `Longitude: ${lonParse.error}`]
          .filter(Boolean)
          .join(" · "),
      );
      setSaving(false);
      return;
    }
    if (latParse.warning || lonParse.warning) {
      setCoordWarnings({
        lat: latParse.warning ?? undefined,
        lon: lonParse.warning ?? undefined,
      });
    }

    // Altitude também aceita vírgula/ponto; vazio significa "não informada".
    const altRaw = String(fd.get("altitude") ?? "").trim().replace(",", ".");
    const altitudeValue =
      altRaw === "" ? null : Number.isFinite(Number(altRaw)) ? Number(altRaw) : null;

    const payload = {
      company_id: profile?.companyId,
      name: fd.get("name") as string,
      city: fd.get("city") as string,
      state: fd.get("state") as string,
      latitude: latParse.value as number,
      longitude: lonParse.value as number,
      altitude: altitudeValue ?? 0,
      total_area: Number(String(fd.get("total_area") ?? "0").replace(",", ".")),
      irrigated_area: Number(String(fd.get("irrigated_area") ?? "0").replace(",", ".")),
      timezone: "America/Sao_Paulo",
    };
    try {
      let farmId: string | null = null;
      if (editing) {
        await update(editing.id, payload);
        farmId = editing.id;
      } else {
        await create(payload as Omit<Farm, "id" | "created_at" | "updated_at">);
        // Recupera o id da fazenda recém-criada (o useCrud não retorna o insert).
        const supabase = createClient();
        const { data: created } = await supabase
          .from("farms")
          .select("id")
          .eq("company_id", profile?.companyId ?? "")
          .eq("name", payload.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        farmId = (created?.id as string) ?? null;
      }

      const supabase = createClient();
      if (editing && farmId) {
        // Fazenda editada: propaga coordenadas/altitude para a estação virtual.
        try {
          await syncVirtualStationWithFarm(supabase, farmId);
        } catch (syncErr) {
          console.warn("Falha ao sincronizar estação virtual:", syncErr);
        }
      } else if (activateVirtual && farmId) {
        // Nova fazenda: criação idempotente da estação virtual.
        try {
          await ensureVirtualStation(supabase, farmId);
        } catch (vsErr) {
          console.warn("Falha ao criar estação virtual:", vsErr);
        }
      }

      setModalOpen(false);
      setEditing(null);
      setCoordWarnings({});
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
      <div className="mb-5 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova fazenda</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
        ) : activeFarms.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma fazenda cadastrada.</p>
        ) : (
          <Table columns={columns} data={activeFarms} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar fazenda" : "Nova fazenda"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" required defaultValue={editing?.name} />
            <Input id="city" name="city" label="Cidade" required defaultValue={editing?.city} />
            <Select id="state" name="state" label="Estado" options={[...BRAZILIAN_STATES]} required defaultValue={editing?.state} />
            <Input id="altitude" name="altitude" label="Altitude (m)" type="number" step="any" defaultValue={editing?.altitude ?? 0} />
            <div>
              <Input
                id="latitude"
                name="latitude"
                label="Latitude (decimal)"
                type="text"
                inputMode="decimal"
                pattern="-?[0-9]+([.,][0-9]+)?"
                required
                defaultValue={editing?.latitude}
                placeholder="-14.6491"
              />
              <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">Ex.: -14.6491 · aceita vírgula ou ponto · faixa -90 a 90</p>
            </div>
            <div>
              <Input
                id="longitude"
                name="longitude"
                label="Longitude (decimal)"
                type="text"
                inputMode="decimal"
                pattern="-?[0-9]+([.,][0-9]+)?"
                required
                defaultValue={editing?.longitude}
                placeholder="-45.2340"
              />
              <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">Ex.: -45.2340 · aceita vírgula ou ponto · faixa -180 a 180</p>
            </div>
            <Input id="total_area" name="total_area" label="Área total (ha)" type="number" step="any" required defaultValue={editing?.total_area} />
            <Input id="irrigated_area" name="irrigated_area" label="Área irrigada (ha)" type="number" step="any" required defaultValue={editing?.irrigated_area} />
          </div>
          {!editing && (
            <label className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-sm dark:border-graphite-700/50 dark:bg-graphite-800/60">
              <input type="checkbox" name="activate_virtual_station" defaultChecked className="mt-0.5" />
              <span>
                <span className="font-medium text-graphite-900 dark:text-white">Ativar Estação Virtual (Open-Meteo)</span>
                <span className="block text-xs text-graphite-400 dark:text-gray-500">
                  Cria automaticamente uma estação virtual nas coordenadas desta fazenda. Serve de fallback quando não houver estação física com dados para o dia.
                </span>
              </span>
            </label>
          )}
          {(coordWarnings.lat || coordWarnings.lon) && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-300">
              <p className="font-semibold">Coordenadas fora do território brasileiro</p>
              {coordWarnings.lat && <p>{coordWarnings.lat}</p>}
              {coordWarnings.lon && <p>{coordWarnings.lon}</p>}
              <p className="mt-1">A fazenda será salva; verifique se este é o país de operação.</p>
            </div>
          )}
          {formError && <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-4">
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
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${r.active ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400" : "bg-gray-100 text-gray-500"}`}>
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
    return <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma fazenda ativa para gerenciar safras.</p></Card>;
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova safra</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
        ) : activeSeasons.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma safra cadastrada para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeSeasons} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar safra" : "Nova safra"}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input id="name" name="name" label="Nome" placeholder="Safra 2025/2026" required defaultValue={editing?.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="start_date" name="start_date" label="Data de início" type="date" required defaultValue={editing?.start_date} />
            <Input id="end_date" name="end_date" label="Data de fim" type="date" required defaultValue={editing?.end_date} />
          </div>
          {formError && <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-4">
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
    return <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma fazenda ativa para gerenciar módulos.</p></Card>;
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Novo módulo</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
        ) : activeModules.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhum módulo cadastrado para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeModules} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar módulo" : "Novo módulo"}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input id="name" name="name" label="Nome" placeholder="RDM, M1, M2/M3..." required defaultValue={editing?.name} />
          <TextArea id="description" name="description" label="Descrição" defaultValue={editing?.description ?? ""} />
          <Input id="total_area" name="total_area" label="Área total (ha)" type="number" step="any" defaultValue={editing?.total_area ?? 0} />
          {formError && <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-4">
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
