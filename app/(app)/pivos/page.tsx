"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  Modal,
  Tabs,
  ConfirmDialog,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { PrerequisiteNotice } from "@/components/onboarding";
import { PIVOT_STATUSES, PIVOT_TYPES, PIVOT_MANUFACTURERS } from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import { radiusFromArea } from "@/utils/geo";

const MapPicker = dynamic(() => import("@/components/maps/MapPicker").then((mod) => mod.MapPicker), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 dark:border-graphite-700 dark:bg-graphite-800">
      <p className="text-sm text-gray-400">Carregando mapa...</p>
    </div>
  ),
});

// ── Types ──────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  farm_id: string;
  module_id: string | null;
  culture_id: string | null;
  name: string;
  code: string | null;
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
  manufacturer: string | null;
  model: string | null;
  pivot_type: string;
  last_tower_radius: number | null;
  service_pressure: number | null;
  speed_100_pct: number | null;
  full_turn_time: number | null;
  depth_100_pct: number | null;
  max_operating_time: number | null;
  installed_power_kw: number | null;
  specific_consumption: number | null;
  energy_cost: number | null;
  cost_per_mm: number | null;
  cost_per_hectare: number | null;
}

interface ProdModule {
  id: string;
  name: string;
}

interface Culture {
  id: string;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "caracteristicas", label: "Características" },
  { id: "localizacao", label: "Localização" },
  { id: "custos", label: "Custos" },
];

const STATUS_COLORS: Record<string, string> = {
  irrigando: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  parado: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
  manutencao: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  alerta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  PIVOT_STATUSES.map((s) => [s.value, s.label])
);

// ── Main Page ──────────────────────────────────────────────────────────

export default function PivosPage() {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<Pivot>({
    table: "pivots",
    filters: { farm_id: activeFarmId },
    orderBy: "name",
    ascending: true,
  });

  const [modules, setModules] = useState<ProdModule[]>([]);
  const [cultures, setCultures] = useState<Culture[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Pivot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pivot | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [activeTab, setActiveTab] = useState("geral");
  const [areaValue, setAreaValue] = useState(0);

  useEffect(() => {
    if (!activeFarmId) return;
    const supabase = createClient();
    supabase
      .from("production_modules")
      .select("id, name")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data: mods }) => { if (mods) setModules(mods); });
    supabase
      .from("cultures")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data: cults }) => { if (cults) setCultures(cults); });
  }, [activeFarmId]);

  const activePivots = useMemo(() => data.filter((p) => p.active), [data]);

  const cultureMap = useMemo(
    () => new Map(cultures.map((c) => [c.id, c.name])),
    [cultures]
  );
  const moduleMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m.name])),
    [modules]
  );

  const openNew = () => {
    setEditing(null);
    setActiveTab("geral");
    setFormError("");
    setAreaValue(0);
    setModalOpen(true);
  };

  const openEdit = (pivot: Pivot) => {
    setEditing(pivot);
    setActiveTab("geral");
    setFormError("");
    setAreaValue(pivot.area);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    const fd = new FormData(e.currentTarget);
    const numOrNull = (name: string) => {
      const v = fd.get(name) as string;
      return v ? Number(v) : null;
    };

    const area = Number(fd.get("area")) || 0;
    const inputRadius = numOrNull("radius");
    const computedRadius = inputRadius || Math.round(radiusFromArea(area));

    const efficiency = Number(fd.get("efficiency"));
    if (efficiency < 0 || efficiency > 100) {
      setFormError("Eficiência deve estar entre 0 e 100%");
      setSaving(false);
      return;
    }

    const payload = {
      farm_id: activeFarmId!,
      name: fd.get("name") as string,
      code: (fd.get("code") as string) || null,
      module_id: (fd.get("module_id") as string) || null,
      culture_id: (fd.get("culture_id") as string) || null,
      status: fd.get("status") as string,
      manufacturer: (fd.get("manufacturer") as string) || null,
      model: (fd.get("model") as string) || null,
      pivot_type: (fd.get("pivot_type") as string) || "central",
      area,
      radius: computedRadius,
      last_tower_radius: numOrNull("last_tower_radius"),
      flow_rate: Number(fd.get("flow_rate")) || 0,
      service_pressure: numOrNull("service_pressure"),
      speed_100_pct: numOrNull("speed_100_pct"),
      full_turn_time: numOrNull("full_turn_time"),
      depth_100_pct: numOrNull("depth_100_pct"),
      max_operating_time: numOrNull("max_operating_time"),
      pump_power: Number(fd.get("pump_power")) || 0,
      installed_power_kw: numOrNull("installed_power_kw"),
      motor_efficiency: Number(fd.get("motor_efficiency")) / 100,
      efficiency: efficiency / 100,
      specific_consumption: numOrNull("specific_consumption"),
      latitude: Number(fd.get("latitude")) || 0,
      longitude: Number(fd.get("longitude")) || 0,
      energy_cost: numOrNull("energy_cost"),
      cost_per_mm: numOrNull("cost_per_mm"),
      cost_per_hectare: numOrNull("cost_per_hectare"),
    };

    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Pivot, "id" | "created_at" | "updated_at">);
      }
      closeModal();
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

  const columns: Column<Pivot>[] = [
    {
      header: "Nome",
      render: (r) => (
        <div>
          <span className="font-medium">{r.name}</span>
          {r.code && <span className="ml-2 text-xs text-gray-400">{r.code}</span>}
        </div>
      ),
    },
    { header: "Módulo", render: (r) => r.module_id ? moduleMap.get(r.module_id) ?? "—" : "—" },
    { header: "Cultura", render: (r) => r.culture_id ? cultureMap.get(r.culture_id) ?? "—" : "—" },
    { header: "Área (ha)", render: (r) => r.area?.toLocaleString("pt-BR"), align: "right" },
    { header: "Vazão (m³/h)", render: (r) => r.flow_rate?.toLocaleString("pt-BR"), align: "right" },
    {
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      header: "",
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
      <div className="space-y-6">
        <PageHeader titulo="Pivôs" descricao="Cadastro e monitoramento de pivôs centrais" />
        <PrerequisiteNotice
          title="Cadastre uma fazenda primeiro"
          description="Os pivôs pertencem a uma fazenda. Cadastre e selecione uma fazenda ativa para começar a registrar seus pivôs."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Pivôs" descricao="Cadastro e monitoramento de pivôs centrais" />

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {activePivots.length} pivô{activePivots.length !== 1 ? "s" : ""} cadastrado{activePivots.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openNew}>Novo pivô</Button>
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

      {/* ── Modal de criação/edição ──────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Editar: ${editing.name}` : "Novo pivô"}
        size="xl"
      >
        <form onSubmit={handleSubmit}>
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
          <div className="mt-4">
            {activeTab === "geral" && (
              <TabGeral
                editing={editing}
                modules={modules}
                cultures={cultures}
              />
            )}
            {activeTab === "caracteristicas" && (
              <TabCaracteristicas editing={editing} areaValue={areaValue} onAreaChange={setAreaValue} />
            )}
            {activeTab === "localizacao" && (
              <TabLocalizacao editing={editing} allPivots={activePivots} areaValue={areaValue} />
            )}
            {activeTab === "custos" && (
              <TabCustos editing={editing} />
            )}
          </div>

          {formError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-graphite-700">
            <div className="flex gap-2">
              {activeTab !== "geral" && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    const idx = TABS.findIndex((t) => t.id === activeTab);
                    if (idx > 0) setActiveTab(TABS[idx - 1].id);
                  }}
                >
                  Anterior
                </Button>
              )}
              {activeTab !== "custos" && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    const idx = TABS.findIndex((t) => t.id === activeTab);
                    if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].id);
                  }}
                >
                  Próximo
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" type="button" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar pivô"}
              </Button>
            </div>
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

// ── Tab: Geral ─────────────────────────────────────────────────────────

function TabGeral({
  editing,
  modules,
  cultures,
}: {
  editing: Pivot | null;
  modules: ProdModule[];
  cultures: Culture[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        id="name"
        name="name"
        label="Nome do pivô"
        placeholder="Pivô 14"
        required
        defaultValue={editing?.name}
      />
      <Input
        id="code"
        name="code"
        label="Código"
        placeholder="P14"
        defaultValue={editing?.code ?? ""}
      />
      <Select
        id="module_id"
        name="module_id"
        label="Módulo produtivo"
        options={modules.map((m) => ({ value: m.id, label: m.name }))}
        defaultValue={editing?.module_id ?? ""}
      />
      <Select
        id="culture_id"
        name="culture_id"
        label="Cultura atual"
        options={cultures.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={editing?.culture_id ?? ""}
      />
      <Select
        id="status"
        name="status"
        label="Status"
        options={[...PIVOT_STATUSES]}
        required
        defaultValue={editing?.status ?? "parado"}
      />
    </div>
  );
}

// ── Tab: Características ───────────────────────────────────────────────

function TabCaracteristicas({
  editing,
  areaValue,
  onAreaChange,
}: {
  editing: Pivot | null;
  areaValue: number;
  onAreaChange: (v: number) => void;
}) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-graphite-900 dark:text-gray-200">
          Identificação do equipamento
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            id="manufacturer"
            name="manufacturer"
            label="Fabricante"
            options={[...PIVOT_MANUFACTURERS]}
            defaultValue={editing?.manufacturer ?? ""}
          />
          <Input
            id="model"
            name="model"
            label="Modelo"
            placeholder="8120"
            defaultValue={editing?.model ?? ""}
          />
          <Select
            id="pivot_type"
            name="pivot_type"
            label="Tipo"
            options={[...PIVOT_TYPES]}
            defaultValue={editing?.pivot_type ?? "central"}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-graphite-900 dark:text-gray-200">
          Dimensões e vazão
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="area"
            name="area"
            label="Área irrigada (ha)"
            type="number"
            step="any"
            required
            value={areaValue || ""}
            onChange={(e) => onAreaChange(Number(e.target.value) || 0)}
          />
          <Input
            id="last_tower_radius"
            name="last_tower_radius"
            label="Raio da última torre (m)"
            type="number"
            step="any"
            placeholder="Auto-calculado se vazio"
            defaultValue={editing?.last_tower_radius ?? ""}
          />
          <Input
            id="flow_rate"
            name="flow_rate"
            label="Vazão (m³/h)"
            type="number"
            step="any"
            required
            defaultValue={editing?.flow_rate}
          />
          <Input
            id="service_pressure"
            name="service_pressure"
            label="Pressão de serviço (bar)"
            type="number"
            step="any"
            defaultValue={editing?.service_pressure ?? ""}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-graphite-900 dark:text-gray-200">
          Velocidade e lâmina
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="speed_100_pct"
            name="speed_100_pct"
            label="Velocidade a 100% (m/h)"
            type="number"
            step="any"
            defaultValue={editing?.speed_100_pct ?? ""}
          />
          <Input
            id="full_turn_time"
            name="full_turn_time"
            label="Tempo de volta a 100% (h)"
            type="number"
            step="any"
            defaultValue={editing?.full_turn_time ?? ""}
          />
          <Input
            id="depth_100_pct"
            name="depth_100_pct"
            label="Lâmina a 100% (mm)"
            type="number"
            step="any"
            defaultValue={editing?.depth_100_pct ?? ""}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-graphite-900 dark:text-gray-200">
          Motor e energia
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="max_operating_time"
            name="max_operating_time"
            label="Tempo máximo de operação (h/dia)"
            type="number"
            step="any"
            defaultValue={editing?.max_operating_time ?? 24}
          />
          <Input
            id="pump_power"
            name="pump_power"
            label="Potência da bomba (cv)"
            type="number"
            step="any"
            required
            defaultValue={editing?.pump_power}
          />
          <Input
            id="installed_power_kw"
            name="installed_power_kw"
            label="Potência instalada (kW)"
            type="number"
            step="any"
            defaultValue={editing?.installed_power_kw ?? ""}
          />
          <Input
            id="motor_efficiency"
            name="motor_efficiency"
            label="Eficiência do motor (%)"
            type="number"
            step="any"
            required
            defaultValue={editing ? (editing.motor_efficiency * 100) : 88}
          />
          <Input
            id="efficiency"
            name="efficiency"
            label="Eficiência de aplicação (%)"
            type="number"
            step="any"
            required
            defaultValue={editing ? (editing.efficiency * 100) : 85}
          />
          <Input
            id="specific_consumption"
            name="specific_consumption"
            label="Consumo específico (kWh/m³)"
            type="number"
            step="any"
            defaultValue={editing?.specific_consumption ?? ""}
          />
        </div>
      </fieldset>

      {/* Hidden field — radius is handled in submit */}
      <input type="hidden" name="radius" value="" />
    </div>
  );
}

// ── Tab: Localização ───────────────────────────────────────────────────

function TabLocalizacao({
  editing,
  allPivots,
  areaValue,
}: {
  editing: Pivot | null;
  allPivots: Pivot[];
  areaValue: number;
}) {
  const [lat, setLat] = useState(editing?.latitude ?? 0);
  const [lng, setLng] = useState(editing?.longitude ?? 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);

  const computedRadius = useMemo(() => {
    if (areaValue <= 0) return 0;
    return Math.round(radiusFromArea(areaValue));
  }, [areaValue]);

  const otherPivots = useMemo(
    () =>
      allPivots
        .filter((p) => p.id !== editing?.id && p.latitude && p.longitude)
        .map((p) => ({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
          radiusMeters: p.radius,
        })),
    [allPivots, editing],
  );

  const openPicker = () => {
    setDraft(lat && lng ? { lat, lng } : null);
    setPickerOpen(true);
  };

  const confirmPicker = () => {
    if (draft) {
      setLat(draft.lat);
      setLng(draft.lng);
    }
    setPickerOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          id="latitude"
          name="latitude"
          label="Latitude"
          type="number"
          step="any"
          required
          placeholder="-15.8022"
          value={lat || ""}
          onChange={(e) => setLat(Number(e.target.value))}
        />
        <Input
          id="longitude"
          name="longitude"
          label="Longitude"
          type="number"
          step="any"
          required
          placeholder="-47.3089"
          value={lng || ""}
          onChange={(e) => setLng(Number(e.target.value))}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-graphite-900 dark:text-gray-200">
            Raio calculado
          </label>
          <p className="flex h-[38px] items-center rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-graphite-900 dark:border-graphite-600 dark:bg-graphite-800 dark:text-gray-100">
            {computedRadius > 0 ? `${computedRadius} m` : "Informe a área"}
          </p>
        </div>
      </div>

      <div>
        <Button type="button" variant="secondary" onClick={openPicker}>
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Localizar no mapa
          </span>
        </Button>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Use “Localizar no mapa” para marcar o centro do pivô, ou informe as coordenadas manualmente.
        </p>
      </div>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Localizar pivô no mapa" size="xl">
        <div className="space-y-4">
          {pickerOpen && (
            <MapPicker
              value={draft}
              onChange={(la, lo) => setDraft({ lat: la, lng: lo })}
              radiusMeters={computedRadius}
              otherPivots={otherPivots}
              className="h-[60vh] w-full rounded-lg border border-gray-200 dark:border-graphite-700"
            />
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {draft
                ? `Centro: ${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`
                : "Clique no mapa para marcar o centro do pivô."}
            </p>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setPickerOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={confirmPicker} disabled={!draft}>Confirmar localização</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Tab: Custos ────────────────────────────────────────────────────────

function TabCustos({ editing }: { editing: Pivot | null }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Custos operacionais do pivô. Esses valores são utilizados nos relatórios e no rateio de energia.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          id="energy_cost"
          name="energy_cost"
          label="Custo de energia (R$/kWh)"
          type="number"
          step="any"
          placeholder="0.72"
          defaultValue={editing?.energy_cost ?? ""}
        />
        <Input
          id="cost_per_mm"
          name="cost_per_mm"
          label="Custo por mm (R$/mm)"
          type="number"
          step="any"
          defaultValue={editing?.cost_per_mm ?? ""}
        />
        <Input
          id="cost_per_hectare"
          name="cost_per_hectare"
          label="Custo por hectare (R$/ha)"
          type="number"
          step="any"
          defaultValue={editing?.cost_per_hectare ?? ""}
        />
      </div>
    </div>
  );
}
