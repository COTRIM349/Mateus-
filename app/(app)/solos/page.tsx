"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  Modal,
  ConfirmDialog,
  Tabs,
  TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { PrerequisiteNotice } from "@/components/onboarding";
import { SOIL_TEXTURES } from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import {
  calculateCAD,
  calculateAFD,
  calculateMaxStorage,
  validateSoil,
  validateLayers,
  calculateLayerCAD,
  calculateLayerAFD,
  calculateTotalCADFromLayers,
  inferTextureFromGranulometry,
  type SoilValidation,
} from "@/modules/soil/services";

// ── Types ─────────────────────────────────────────────────────────────────

interface Soil {
  id: string;
  farm_id: string | null;
  name: string;
  texture: string;
  sand_pct: number;
  silt_pct: number;
  clay_pct: number;
  field_capacity: number;
  wilting_point: number;
  bulk_density: number;
  infiltration_rate: number;
  hydraulic_conductivity: number | null;
  effective_depth: number;
  cad: number | null;
  afd: number | null;
  observations: string | null;
  active: boolean;
}

interface SoilLayer {
  id: string;
  soil_id: string;
  depth_start: number;
  depth_end: number;
  texture: string;
  bulk_density: number;
  field_capacity: number;
  wilting_point: number;
  cad: number | null;
  afd: number | null;
  infiltration_rate: number | null;
}

interface SoilHistoryEntry {
  id: string;
  soil_id: string;
  change_type: string;
  description: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

interface PivotAssignment {
  id: string;
  pivot_id: string;
  soil_id: string;
  pivot_name?: string;
  season_name?: string;
  culture_name?: string;
}

const soloTabs = [
  { id: "cadastro", label: "Cadastro" },
  { id: "camadas", label: "Camadas" },
  { id: "associacao", label: "Associação Pivôs" },
  { id: "historico", label: "Histórico" },
];

export default function SolosPage() {
  const { activeFarmId } = useAuth();
  const [activeTab, setActiveTab] = useState("cadastro");
  const [selectedSoilId, setSelectedSoilId] = useState<string | null>(null);

  if (!activeFarmId) {
    return (
      <div className="space-y-6">
        <PageHeader titulo="Solos" descricao="Motor de dados de solo para balanço hídrico" />
        <PrerequisiteNotice
          title="Cadastre uma fazenda primeiro"
          description="Os perfis de solo pertencem a uma fazenda. Cadastre e selecione uma fazenda ativa para registrar os solos."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Solos" descricao="Motor de dados de solo para balanço hídrico" />
      <Tabs tabs={soloTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "cadastro" && (
          <SoilsTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} />
        )}
        {activeTab === "camadas" && <LayersTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} />}
        {activeTab === "associacao" && <AssociationTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} />}
        {activeTab === "historico" && <HistoryTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} />}
      </div>
    </div>
  );
}

// ── Cadastro ──────────────────────────────────────────────────────────────

function SoilsTab({
  selectedSoilId,
  onSelectSoil,
}: {
  selectedSoilId: string | null;
  onSelectSoil: (id: string | null) => void;
}) {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete, fetch: refetch } = useCrud<Soil>({
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
  const [warnings, setWarnings] = useState<SoilValidation[]>([]);

  const activeSoils = data.filter((s) => s.active);

  const textureLabels: Record<string, string> = Object.fromEntries(
    SOIL_TEXTURES.map((t) => [t.value, t.label])
  );

  const columns: Column<Soil>[] = [
    {
      header: "",
      render: (r) => (
        <input
          type="radio"
          name="soil_select"
          checked={selectedSoilId === r.id}
          onChange={() => onSelectSoil(r.id)}
          className="h-4 w-4 accent-brand-500"
        />
      ),
    },
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Textura", render: (r) => textureLabels[r.texture] ?? r.texture },
    { header: "CC", render: (r) => r.field_capacity.toFixed(3), align: "right" },
    { header: "PMP", render: (r) => r.wilting_point.toFixed(3), align: "right" },
    {
      header: "CAD (mm)",
      render: (r) => {
        const cad = r.cad ?? calculateCAD({ field_capacity: r.field_capacity, wilting_point: r.wilting_point, effective_depth: r.effective_depth });
        return cad.toFixed(1);
      },
      align: "right",
    },
    {
      header: "AFD (mm)",
      render: (r) => {
        const cad = r.cad ?? calculateCAD({ field_capacity: r.field_capacity, wilting_point: r.wilting_point, effective_depth: r.effective_depth });
        const afd = r.afd ?? calculateAFD(cad);
        return afd.toFixed(1);
      },
      align: "right",
    },
    { header: "Prof. (m)", render: (r) => r.effective_depth.toFixed(2), align: "right" },
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
    setWarnings([]);
    const fd = new FormData(e.currentTarget);

    const sandPct = Number(fd.get("sand_pct") || 0);
    const siltPct = Number(fd.get("silt_pct") || 0);
    const clayPct = Number(fd.get("clay_pct") || 0);
    const fieldCapacity = Number(fd.get("field_capacity"));
    const wiltingPoint = Number(fd.get("wilting_point"));
    const bulkDensity = Number(fd.get("bulk_density"));
    const effectiveDepth = Number(fd.get("effective_depth") || 0.6);
    const infiltrationRate = Number(fd.get("infiltration_rate"));
    const texture = fd.get("texture") as string;

    const issues = validateSoil({
      texture,
      field_capacity: fieldCapacity,
      wilting_point: wiltingPoint,
      bulk_density: bulkDensity,
      sand_pct: sandPct,
      silt_pct: siltPct,
      clay_pct: clayPct,
      effective_depth: effectiveDepth,
      infiltration_rate: infiltrationRate,
    });

    const errors = issues.filter((i) => i.level === "error");
    if (errors.length > 0) {
      setFormError(errors.map((e) => e.message).join("; "));
      setWarnings(issues.filter((i) => i.level === "warning"));
      setSaving(false);
      return;
    }
    setWarnings(issues.filter((i) => i.level === "warning"));

    const cad = calculateCAD({ field_capacity: fieldCapacity, wilting_point: wiltingPoint, effective_depth: effectiveDepth });
    const afd = calculateAFD(cad);

    const payload = {
      farm_id: activeFarmId!,
      name: fd.get("name") as string,
      texture,
      sand_pct: sandPct,
      silt_pct: siltPct,
      clay_pct: clayPct,
      field_capacity: fieldCapacity,
      wilting_point: wiltingPoint,
      bulk_density: bulkDensity,
      infiltration_rate: infiltrationRate,
      hydraulic_conductivity: fd.get("hydraulic_conductivity") ? Number(fd.get("hydraulic_conductivity")) : null,
      effective_depth: effectiveDepth,
      cad,
      afd,
      observations: (fd.get("observations") as string) || null,
    };

    try {
      const supabase = createClient();
      if (editing) {
        await update(editing.id, payload);
        await supabase.from("soil_history").insert({
          soil_id: editing.id,
          change_type: "edicao",
          description: `Parâmetros do solo "${payload.name}" atualizados`,
          old_values: {
            texture: editing.texture,
            field_capacity: editing.field_capacity,
            wilting_point: editing.wilting_point,
            bulk_density: editing.bulk_density,
          },
          new_values: {
            texture: payload.texture,
            field_capacity: payload.field_capacity,
            wilting_point: payload.wilting_point,
            bulk_density: payload.bulk_density,
          },
        });
      } else {
        await create(payload as Omit<Soil, "id" | "created_at" | "updated_at">);
        await refetch();
        const newSoil = data.find((s) => s.name === payload.name);
        if (newSoil) {
          await supabase.from("soil_history").insert({
            soil_id: newSoil.id,
            change_type: "criacao",
            description: `Solo "${payload.name}" criado`,
            new_values: payload,
          });
        }
      }
      setModalOpen(false);
      setEditing(null);
      setWarnings([]);
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
      if (selectedSoilId === deleteTarget.id) onSelectSoil(null);
      setDeleteTarget(null);
    } catch {
      setFormError("Erro ao excluir");
    }
    setSaving(false);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); setWarnings([]); }}>Novo solo</Button>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setWarnings([]); }} title={editing ? "Editar solo" : "Novo solo"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" placeholder="Latossolo Vermelho" required defaultValue={editing?.name} />
            <Select id="texture" name="texture" label="Classe textural" options={[...SOIL_TEXTURES]} required defaultValue={editing?.texture ?? "franco"} />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-graphite-900 dark:text-gray-200">Granulometria (%)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input id="sand_pct" name="sand_pct" label="Areia" type="number" step="0.1" min="0" max="100" defaultValue={editing?.sand_pct ?? 0} />
              <Input id="silt_pct" name="silt_pct" label="Silte" type="number" step="0.1" min="0" max="100" defaultValue={editing?.silt_pct ?? 0} />
              <Input id="clay_pct" name="clay_pct" label="Argila" type="number" step="0.1" min="0" max="100" defaultValue={editing?.clay_pct ?? 0} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="bulk_density" name="bulk_density" label="Densidade (g/cm³)" type="number" step="0.01" required defaultValue={editing?.bulk_density} placeholder="1.30" />
            <Input id="field_capacity" name="field_capacity" label="Capacidade de campo (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.field_capacity} placeholder="0.380" />
            <Input id="wilting_point" name="wilting_point" label="Ponto de murcha (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.wilting_point} placeholder="0.180" />
            <Input id="infiltration_rate" name="infiltration_rate" label="Infiltração (mm/h)" type="number" step="0.1" required defaultValue={editing?.infiltration_rate} placeholder="25.0" />
            <Input id="hydraulic_conductivity" name="hydraulic_conductivity" label="Condutividade hidráulica (mm/h)" type="number" step="0.01" defaultValue={editing?.hydraulic_conductivity ?? ""} />
            <Input id="effective_depth" name="effective_depth" label="Profundidade efetiva (m)" type="number" step="0.01" required defaultValue={editing?.effective_depth ?? 0.6} />
          </div>

          <TextArea id="observations" name="observations" label="Observações" defaultValue={editing?.observations ?? ""} />

          {warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/50 dark:bg-yellow-900/20">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{w.message}</p>
              ))}
            </div>
          )}
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); setWarnings([]); }}>Cancelar</Button>
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
    </>
  );
}

// ── Camadas ───────────────────────────────────────────────────────────────

function LayersTab({
  selectedSoilId,
  onSelectSoil,
}: {
  selectedSoilId: string | null;
  onSelectSoil: (id: string | null) => void;
}) {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [soils, setSoils] = useState<Soil[]>([]);
  const [layers, setLayers] = useState<SoilLayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SoilLayer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SoilLayer | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [layerWarnings, setLayerWarnings] = useState<SoilValidation[]>([]);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("soils")
      .select("*")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (data) setSoils(data as Soil[]); });
  }, [activeFarmId, supabase]);

  const fetchLayers = useCallback(async () => {
    if (!selectedSoilId) { setLayers([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("soil_layers")
      .select("*")
      .eq("soil_id", selectedSoilId)
      .order("depth_start");
    if (data) setLayers(data as SoilLayer[]);
    setLoading(false);
  }, [selectedSoilId, supabase]);

  useEffect(() => { fetchLayers(); }, [fetchLayers]);

  const selectedSoil = soils.find((s) => s.id === selectedSoilId);

  const totalCAD = layers.length > 0
    ? calculateTotalCADFromLayers(layers.map((l) => ({
        depth_start: l.depth_start,
        depth_end: l.depth_end,
        field_capacity: l.field_capacity,
        wilting_point: l.wilting_point,
      })))
    : null;

  const textureLabels: Record<string, string> = Object.fromEntries(
    SOIL_TEXTURES.map((t) => [t.value, t.label])
  );

  const columns: Column<SoilLayer>[] = [
    { header: "Camada", render: (r) => <span className="font-medium">{r.depth_start}–{r.depth_end} cm</span> },
    { header: "Textura", render: (r) => textureLabels[r.texture] ?? r.texture },
    { header: "Dens.", render: (r) => r.bulk_density.toFixed(2), align: "right" },
    { header: "CC", render: (r) => r.field_capacity.toFixed(3), align: "right" },
    { header: "PMP", render: (r) => r.wilting_point.toFixed(3), align: "right" },
    {
      header: "CAD (mm)",
      render: (r) => {
        const cad = calculateLayerCAD({ depth_start: r.depth_start, depth_end: r.depth_end, field_capacity: r.field_capacity, wilting_point: r.wilting_point });
        return cad.toFixed(1);
      },
      align: "right",
    },
    {
      header: "AFD (mm)",
      render: (r) => {
        const afd = calculateLayerAFD({ depth_start: r.depth_start, depth_end: r.depth_end, field_capacity: r.field_capacity, wilting_point: r.wilting_point });
        return afd.toFixed(1);
      },
      align: "right",
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
    if (!selectedSoilId) return;
    setSaving(true);
    setFormError("");
    setLayerWarnings([]);
    const fd = new FormData(e.currentTarget);

    const depthStart = Number(fd.get("depth_start"));
    const depthEnd = Number(fd.get("depth_end"));
    const fieldCapacity = Number(fd.get("field_capacity"));
    const wiltingPoint = Number(fd.get("wilting_point"));

    const newLayer = { depth_start: depthStart, depth_end: depthEnd, field_capacity: fieldCapacity, wilting_point: wiltingPoint };
    const otherLayers = editing
      ? layers.filter((l) => l.id !== editing.id).map((l) => ({ depth_start: l.depth_start, depth_end: l.depth_end, field_capacity: l.field_capacity, wilting_point: l.wilting_point }))
      : layers.map((l) => ({ depth_start: l.depth_start, depth_end: l.depth_end, field_capacity: l.field_capacity, wilting_point: l.wilting_point }));

    const allLayers = [...otherLayers, newLayer];
    const issues = validateLayers(allLayers);
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length > 0) {
      setFormError(errors.map((e) => e.message).join("; "));
      setSaving(false);
      return;
    }
    setLayerWarnings(issues.filter((i) => i.level === "warning"));

    const cad = calculateLayerCAD(newLayer);
    const afd = calculateLayerAFD(newLayer);

    const payload = {
      soil_id: selectedSoilId,
      depth_start: depthStart,
      depth_end: depthEnd,
      texture: fd.get("texture") as string,
      bulk_density: Number(fd.get("bulk_density")),
      field_capacity: fieldCapacity,
      wilting_point: wiltingPoint,
      cad,
      afd,
      infiltration_rate: fd.get("infiltration_rate") ? Number(fd.get("infiltration_rate")) : null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from("soil_layers").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
        await supabase.from("soil_history").insert({
          soil_id: selectedSoilId,
          change_type: "camada_edit",
          description: `Camada ${depthStart}–${depthEnd} cm editada`,
          old_values: { depth_start: editing.depth_start, depth_end: editing.depth_end, field_capacity: editing.field_capacity },
          new_values: { depth_start: depthStart, depth_end: depthEnd, field_capacity: fieldCapacity },
        });
      } else {
        const { error } = await supabase.from("soil_layers").insert(payload);
        if (error) throw new Error(error.message);
        await supabase.from("soil_history").insert({
          soil_id: selectedSoilId,
          change_type: "camada_add",
          description: `Camada ${depthStart}–${depthEnd} cm adicionada`,
          new_values: payload,
        });
      }
      setModalOpen(false);
      setEditing(null);
      fetchLayers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selectedSoilId) return;
    setSaving(true);
    const { error } = await supabase.from("soil_layers").delete().eq("id", deleteTarget.id);
    if (!error) {
      await supabase.from("soil_history").insert({
        soil_id: selectedSoilId,
        change_type: "camada_del",
        description: `Camada ${deleteTarget.depth_start}–${deleteTarget.depth_end} cm removida`,
        old_values: { depth_start: deleteTarget.depth_start, depth_end: deleteTarget.depth_end },
      });
    }
    setDeleteTarget(null);
    setSaving(false);
    fetchLayers();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="soil_select_layers"
            name="soil_select_layers"
            label="Solo"
            options={soils.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedSoilId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectSoil(e.target.value || null)}
          />
        </div>
        {selectedSoilId && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); setLayerWarnings([]); }}>Nova camada</Button>
        )}
      </div>

      {!selectedSoilId ? (
        <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione um solo para gerenciar suas camadas.</p></Card>
      ) : (
        <>
          {totalCAD !== null && (
            <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-graphite-700 dark:bg-graphite-800 sm:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solo selecionado</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{selectedSoil?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">CAD total (camadas)</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{totalCAD.toFixed(1)} mm</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Camadas</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{layers.length}</p>
              </div>
            </div>
          )}

          <Card>
            {loading ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
            ) : layers.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma camada cadastrada. Adicione camadas para detalhar o perfil do solo.</p>
            ) : (
              <Table columns={columns} data={layers} getKey={(r) => r.id} />
            )}
          </Card>
        </>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setLayerWarnings([]); }} title={editing ? "Editar camada" : "Nova camada"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="depth_start" name="depth_start" label="Início (cm)" type="number" min="0" required defaultValue={editing?.depth_start ?? (layers.length > 0 ? layers[layers.length - 1].depth_end : 0)} />
            <Input id="depth_end" name="depth_end" label="Fim (cm)" type="number" min="1" required defaultValue={editing?.depth_end ?? (layers.length > 0 ? layers[layers.length - 1].depth_end + 20 : 20)} />
            <Select id="texture" name="texture" label="Textura" options={[...SOIL_TEXTURES]} required defaultValue={editing?.texture ?? selectedSoil?.texture ?? "franco"} />
            <Input id="bulk_density" name="bulk_density" label="Densidade (g/cm³)" type="number" step="0.01" required defaultValue={editing?.bulk_density ?? selectedSoil?.bulk_density} />
            <Input id="field_capacity" name="field_capacity" label="CC (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.field_capacity ?? selectedSoil?.field_capacity} placeholder="0.380" />
            <Input id="wilting_point" name="wilting_point" label="PMP (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.wilting_point ?? selectedSoil?.wilting_point} placeholder="0.180" />
            <Input id="infiltration_rate" name="infiltration_rate" label="Infiltração (mm/h)" type="number" step="0.1" defaultValue={editing?.infiltration_rate ?? ""} />
          </div>
          {layerWarnings.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/50 dark:bg-yellow-900/20">
              {layerWarnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{w.message}</p>
              ))}
            </div>
          )}
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
        title="Excluir camada"
        message={`Excluir a camada ${deleteTarget?.depth_start}–${deleteTarget?.depth_end} cm?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

// ── Associação Pivôs ──────────────────────────────────────────────────────

function AssociationTab({
  selectedSoilId,
  onSelectSoil,
}: {
  selectedSoilId: string | null;
  onSelectSoil: (id: string | null) => void;
}) {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [soils, setSoils] = useState<Soil[]>([]);
  const [assignments, setAssignments] = useState<PivotAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("soils")
      .select("*")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (data) setSoils(data as Soil[]); });
  }, [activeFarmId, supabase]);

  const fetchAssignments = useCallback(async () => {
    if (!selectedSoilId) { setAssignments([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("pivot_crop_assignments")
      .select("id, pivot_id, soil_id, pivots(name), seasons(name), cultures(name)")
      .eq("soil_id", selectedSoilId)
      .eq("active", true);
    if (data) {
      setAssignments(
        data.map((d) => ({
          id: d.id,
          pivot_id: d.pivot_id,
          soil_id: d.soil_id,
          pivot_name: (d.pivots as unknown as { name: string })?.name ?? "—",
          season_name: (d.seasons as unknown as { name: string })?.name ?? "—",
          culture_name: (d.cultures as unknown as { name: string })?.name ?? "—",
        }))
      );
    }
    setLoading(false);
  }, [selectedSoilId, supabase]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const columns: Column<PivotAssignment>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivot_name}</span> },
    { header: "Safra", render: (r) => r.season_name },
    { header: "Cultura", render: (r) => r.culture_name },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="soil_select_assoc"
            name="soil_select_assoc"
            label="Solo"
            options={soils.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedSoilId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectSoil(e.target.value || null)}
          />
        </div>
      </div>

      {!selectedSoilId ? (
        <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione um solo para ver seus vínculos com pivôs.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
          ) : assignments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum pivô vinculado a este solo.</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">A associação solo ↔ pivô é feita via Vínculo Pivô-Cultura-Solo (pivot_crop_assignments).</p>
            </div>
          ) : (
            <Table columns={columns} data={assignments} getKey={(r) => r.id} />
          )}
        </Card>
      )}
    </>
  );
}

// ── Histórico ─────────────────────────────────────────────────────────────

function HistoryTab({
  selectedSoilId,
  onSelectSoil,
}: {
  selectedSoilId: string | null;
  onSelectSoil: (id: string | null) => void;
}) {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [soils, setSoils] = useState<Soil[]>([]);
  const [history, setHistory] = useState<SoilHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("soils")
      .select("*")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (data) setSoils(data as Soil[]); });
  }, [activeFarmId, supabase]);

  const fetchHistory = useCallback(async () => {
    if (!selectedSoilId) { setHistory([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("soil_history")
      .select("*")
      .eq("soil_id", selectedSoilId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data as SoilHistoryEntry[]);
    setLoading(false);
  }, [selectedSoilId, supabase]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const changeTypeLabels: Record<string, string> = {
    criacao: "Criação",
    edicao: "Edição",
    camada_add: "Camada adicionada",
    camada_edit: "Camada editada",
    camada_del: "Camada removida",
    associacao: "Associação",
  };

  const changeTypeColors: Record<string, string> = {
    criacao: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    edicao: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    camada_add: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",
    camada_edit: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    camada_del: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    associacao: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  const columns: Column<SoilHistoryEntry>[] = [
    {
      header: "Data",
      render: (r) => new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    },
    {
      header: "Tipo",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${changeTypeColors[r.change_type] ?? ""}`}>
          {changeTypeLabels[r.change_type] ?? r.change_type}
        </span>
      ),
    },
    { header: "Descrição", render: (r) => r.description },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="soil_select_hist"
            name="soil_select_hist"
            label="Solo"
            options={soils.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedSoilId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectSoil(e.target.value || null)}
          />
        </div>
      </div>

      {!selectedSoilId ? (
        <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione um solo para ver o histórico de alterações.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum registro de alteração encontrado.</p>
          ) : (
            <Table columns={columns} data={history} getKey={(r) => r.id} />
          )}
        </Card>
      )}
    </>
  );
}
