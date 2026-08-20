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
  validateSoil,
  validateLayers,
  calculateLayerCAD,
  calculateLayerAFD,
  calculateTotalCADFromLayers,
  DEFAULT_CENTER_PIVOT_KL,
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
  kl: number | null;
  observations: string | null;
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

interface FarmPivot {
  id: string;
  name: string;
  area: number;
  soil_id: string | null;
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
      <div className="space-y-8">
        <PageHeader titulo="Solos" descricao="Perfil físico do pivô (Fazenda → Pivô → solo). CC e PMP em cm³/cm³; CAD/AFD em mm; KL adimensional." />
        <PrerequisiteNotice
          title="Cadastre uma fazenda primeiro"
          description="Os perfis de solo pertencem à fazenda e são associados a cada pivô. Cadastre e selecione uma fazenda ativa para registrar os solos."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader titulo="Solos" descricao="Perfil físico do pivô (Fazenda → Pivô → solo). CC e PMP em cm³/cm³; CAD/AFD em mm; KL adimensional." />
      <Tabs tabs={soloTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "cadastro" && (
          <SoilsTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} />
        )}
        {activeTab === "camadas" && <div className="animate-in"><LayersTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} /></div>}
        {activeTab === "associacao" && <div className="animate-in"><AssociationTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} /></div>}
        {activeTab === "historico" && <div className="animate-in"><HistoryTab selectedSoilId={selectedSoilId} onSelectSoil={setSelectedSoilId} /></div>}
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
    { header: "CC (cm³/cm³)", render: (r) => r.field_capacity.toFixed(3), align: "right" },
    { header: "PMP (cm³/cm³)", render: (r) => r.wilting_point.toFixed(3), align: "right" },
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
        const { data: created } = await supabase
          .from("soils")
          .select("id")
          .eq("farm_id", activeFarmId!)
          .eq("name", payload.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (created) {
          await supabase.from("soil_history").insert({
            soil_id: created.id,
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
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
        ) : activeSoils.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhum perfil cadastrado. Crie o perfil da fazenda e associe-o ao pivô na aba Associação.</p>
        ) : (
          <Table columns={columns} data={activeSoils} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setWarnings([]); }} title={editing ? "Editar solo" : "Novo solo"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
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
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3.5 dark:border-yellow-900/50 dark:bg-yellow-900/20">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{w.message}</p>
              ))}
            </div>
          )}
          {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-3 pt-4">
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
    { header: "Camada (cm)", render: (r) => <span className="font-medium">{r.depth_start}–{r.depth_end}</span> },
    { header: "Textura", render: (r) => textureLabels[r.texture] ?? r.texture },
    { header: "Da (g/cm³)", render: (r) => r.bulk_density.toFixed(2), align: "right" },
    { header: "CC (cm³/cm³)", render: (r) => r.field_capacity.toFixed(3), align: "right" },
    { header: "PMP (cm³/cm³)", render: (r) => r.wilting_point.toFixed(3), align: "right" },
    {
      header: "KL",
      render: (r) => (r.kl == null ? `${DEFAULT_CENTER_PIVOT_KL.toFixed(2)}*` : r.kl.toFixed(2)),
      align: "right",
    },
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
    const klRaw = String(fd.get("kl") ?? "").trim();
    const kl = klRaw === "" ? null : Number(klRaw);
    if (kl != null && (Number.isNaN(kl) || kl < 0 || kl > 1)) {
      setFormError("KL deve estar entre 0 e 1. Em pivô central com molhamento total use 1 (ou deixe em branco).");
      setSaving(false);
      return;
    }

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
      kl,
      observations: (fd.get("observations") as string) || null,
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
            label="Perfil de solo"
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
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione um solo para gerenciar suas camadas.</p></Card>
      ) : (
        <>
          {totalCAD !== null && (
            <div className="mb-4 grid gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-5 dark:border-white/[0.06] dark:bg-white/[0.03] sm:grid-cols-3">
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">Solo selecionado</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{selectedSoil?.name}</p>
              </div>
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">CAD total das camadas (mm)</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{totalCAD.toFixed(1)} mm</p>
                <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">Volumétrica: (CC−PMP)×espessura. O motor recorta pela profundidade da raiz.</p>
              </div>
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">Camadas</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{layers.length}</p>
              </div>
            </div>
          )}

          <Card>
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
            ) : layers.length === 0 ? (
              <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma camada cadastrada. Adicione faixas (ex.: 0–20, 20–40, 40–60 cm) com CC, PMP, densidade e KL.</p>
            ) : (
              <>
                <Table columns={columns} data={layers} getKey={(r) => r.id} />
                <p className="mt-3 text-[11px] text-graphite-400 dark:text-gray-500">* KL em branco assume 1 (pivô central com molhamento total).</p>
              </>
            )}
          </Card>
        </>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setLayerWarnings([]); }} title={editing ? "Editar camada" : "Nova camada"}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="depth_start" name="depth_start" label="Início (cm)" type="number" min="0" required defaultValue={editing?.depth_start ?? (layers.length > 0 ? layers[layers.length - 1].depth_end : 0)} />
            <Input id="depth_end" name="depth_end" label="Fim (cm)" type="number" min="1" required defaultValue={editing?.depth_end ?? (layers.length > 0 ? layers[layers.length - 1].depth_end + 20 : 20)} />
            <Select id="texture" name="texture" label="Textura" options={[...SOIL_TEXTURES]} required defaultValue={editing?.texture ?? selectedSoil?.texture ?? "franco"} />
            <Input id="bulk_density" name="bulk_density" label="Densidade aparente (g/cm³)" type="number" step="0.01" required defaultValue={editing?.bulk_density ?? selectedSoil?.bulk_density} />
            <Input id="field_capacity" name="field_capacity" label="CC volumétrica (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.field_capacity ?? selectedSoil?.field_capacity} placeholder="0.380" />
            <Input id="wilting_point" name="wilting_point" label="PMP volumétrico (cm³/cm³)" type="number" step="0.001" required defaultValue={editing?.wilting_point ?? selectedSoil?.wilting_point} placeholder="0.180" />
            <Input id="infiltration_rate" name="infiltration_rate" label="Infiltração (mm/h)" type="number" step="0.1" defaultValue={editing?.infiltration_rate ?? ""} />
            <Input id="kl" name="kl" label="KL (0–1, vazio = 1)" type="number" step="0.01" min="0" max="1" defaultValue={editing?.kl ?? ""} placeholder="1.00" />
          </div>
          <TextArea id="observations" name="observations" label="Observações da camada" defaultValue={editing?.observations ?? ""} placeholder="Textura local, restrição de raiz, pedregosidade..." />
          <p className="text-[11px] text-graphite-400 dark:text-gray-500">
            CC e PMP são volumétricos (cm³/cm³). Se o laboratório informou % em massa, converta θv = θg × Da antes de cadastrar. KL = 1 em pivô central com molhamento total; não aplicar outro valor às cegas.
          </p>
          {layerWarnings.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3.5 dark:border-yellow-900/50 dark:bg-yellow-900/20">
              {layerWarnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{w.message}</p>
              ))}
            </div>
          )}
          {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
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
  const [pivots, setPivots] = useState<FarmPivot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pivotToBind, setPivotToBind] = useState("");

  const loadFarm = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    const [soilsRes, pivotsRes] = await Promise.all([
      supabase.from("soils").select("*").eq("farm_id", activeFarmId).eq("active", true).order("name"),
      supabase.from("pivots").select("id, name, area, soil_id").eq("farm_id", activeFarmId).eq("active", true).order("name"),
    ]);
    if (soilsRes.data) setSoils(soilsRes.data as Soil[]);
    if (pivotsRes.data) setPivots(pivotsRes.data as FarmPivot[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => { loadFarm(); }, [loadFarm]);

  const bound = pivots.filter((p) => p.soil_id === selectedSoilId);
  const unbound = pivots.filter((p) => p.soil_id !== selectedSoilId);
  const selectedSoil = soils.find((s) => s.id === selectedSoilId);

  const logAssociation = async (pivot: FarmPivot, action: "vincular" | "desvincular") => {
    if (!selectedSoilId) return;
    await supabase.from("soil_history").insert({
      soil_id: selectedSoilId,
      change_type: "associacao",
      description:
        action === "vincular"
          ? `Pivô "${pivot.name}" vinculado a este perfil`
          : `Pivô "${pivot.name}" desvinculado deste perfil`,
      new_values: { pivot_id: pivot.id, soil_id: action === "vincular" ? selectedSoilId : null },
    });
  };

  const handleBind = async () => {
    if (!selectedSoilId || !pivotToBind) return;
    const pivot = pivots.find((p) => p.id === pivotToBind);
    if (!pivot) return;
    setSaving(true);
    setFormError("");
    const { error } = await supabase.from("pivots").update({ soil_id: selectedSoilId }).eq("id", pivot.id);
    if (error) {
      setFormError(error.message);
      setSaving(false);
      return;
    }
    await logAssociation(pivot, "vincular");
    setPivotToBind("");
    setSaving(false);
    loadFarm();
  };

  const handleUnbind = async (pivot: FarmPivot) => {
    setSaving(true);
    setFormError("");
    const { error } = await supabase.from("pivots").update({ soil_id: null }).eq("id", pivot.id);
    if (error) {
      setFormError(error.message);
      setSaving(false);
      return;
    }
    await logAssociation(pivot, "desvincular");
    setSaving(false);
    loadFarm();
  };

  const columns: Column<FarmPivot>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Área (ha)", render: (r) => r.area.toFixed(1), align: "right" },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => handleUnbind(r)}>
          Desvincular
        </Button>
      ),
    },
  ];

  return (
    <>
      <p className="mb-4 text-sm text-graphite-500 dark:text-gray-400">
        O perfil de solo pertence ao pivô, não à parcela. Hierarquia: Fazenda → Pivô → solo.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="soil_select_assoc"
            name="soil_select_assoc"
            label="Perfil de solo"
            options={soils.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedSoilId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectSoil(e.target.value || null)}
          />
        </div>
      </div>

      {!selectedSoilId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione um perfil para vincular aos pivôs da fazenda.</p></Card>
      ) : (
        <div className="space-y-4">
          {unbound.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <Select
                    id="pivot_to_bind"
                    name="pivot_to_bind"
                    label={`Vincular pivô a “${selectedSoil?.name ?? "perfil"}”`}
                    options={[
                      { value: "", label: "Selecione o pivô" },
                      ...unbound.map((p) => ({
                        value: p.id,
                        label: p.soil_id ? `${p.name} (outro perfil)` : p.name,
                      })),
                    ]}
                    value={pivotToBind}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPivotToBind(e.target.value)}
                  />
                </div>
                <Button type="button" disabled={!pivotToBind || saving} onClick={handleBind}>
                  {saving ? "Salvando..." : "Vincular ao perfil"}
                </Button>
              </div>
              {formError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>}
            </Card>
          )}

          <Card>
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
            ) : bound.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-graphite-400 dark:text-gray-500">Nenhum pivô usa este perfil.</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Vincule um pivô acima. A parcela não escolhe solo.</p>
              </div>
            ) : (
              <Table columns={columns} data={bound} getKey={(r) => r.id} />
            )}
          </Card>
        </div>
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
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${changeTypeColors[r.change_type] ?? ""}`}>
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
            label="Perfil de solo"
            options={soils.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedSoilId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectSoil(e.target.value || null)}
          />
        </div>
      </div>

      {!selectedSoilId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione um solo para ver o histórico de alterações.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhum registro de alteração encontrado.</p>
          ) : (
            <Table columns={columns} data={history} getKey={(r) => r.id} />
          )}
        </Card>
      )}
    </>
  );
}
