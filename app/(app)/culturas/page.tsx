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
import { useCrud } from "@/lib/hooks";
import { useAuth } from "@/components/providers";
import {
  CROP_STAGES,
  CULTURE_GROUPS,
  CULTURE_STATUSES,
  MATURITY_TYPES,
} from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import {
  interpolateKc,
  interpolateRootDepth,
  identifyPhase,
  validatePhases,
  type CulturePhase,
  type CultureValidation,
} from "@/modules/culture/services";

// ── Types ─────────────────────────────────────────────────────────────────

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
  culture_group: string | null;
  description: string | null;
  status: string;
  kc_by_stage: KcByStage;
  root_depth: number;
  depletion_factor: number;
  cycle_days: number;
  active: boolean;
}

interface Variety {
  id: string;
  culture_id: string;
  name: string;
  company: string | null;
  maturity: string;
  cycle_days: number | null;
  observations: string | null;
  active: boolean;
}

interface PhaseRow {
  id: string;
  culture_id: string;
  phase_order: number;
  name: string;
  days_after_plant: number;
  duration_days: number;
  kc_start: number;
  kc_end: number;
  root_depth_start: number;
  root_depth_end: number;
  depletion_factor: number;
  description: string | null;
}

interface AssignmentRow {
  id: string;
  pivot_name: string;
  season_name: string;
  soil_name: string;
  crop_stage: string;
  planting_date: string;
}

interface HistoryEntry {
  id: string;
  change_type: string;
  description: string;
  created_at: string;
}

const cultureTabs = [
  { id: "cadastro", label: "Cadastro" },
  { id: "variedades", label: "Variedades" },
  { id: "fases", label: "Fases Fenológicas" },
  { id: "associacao", label: "Associação" },
  { id: "historico", label: "Histórico" },
];

export default function CulturasPage() {
  const [activeTab, setActiveTab] = useState("cadastro");
  const [selectedCultureId, setSelectedCultureId] = useState<string | null>(null);
  const [cultures, setCultures] = useState<Culture[]>([]);

  return (
    <div className="space-y-8">
      <PageHeader titulo="Culturas" descricao="Motor de cultura — coeficientes, fases fenológicas e sistema radicular" />
      <Tabs tabs={cultureTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "cadastro" && (
          <CulturesTab
            selectedCultureId={selectedCultureId}
            onSelectCulture={setSelectedCultureId}
            onCulturesChange={setCultures}
          />
        )}
        {activeTab === "variedades" && <div className="animate-in"><VarietiesTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "fases" && <div className="animate-in"><PhasesTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "associacao" && <div className="animate-in"><AssociationTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "historico" && <div className="animate-in"><HistoryTabComponent selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
      </div>
    </div>
  );
}

// ── Cadastro ──────────────────────────────────────────────────────────────

function CulturesTab({
  selectedCultureId,
  onSelectCulture,
  onCulturesChange,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  onCulturesChange: (c: Culture[]) => void;
}) {
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

  useEffect(() => {
    onCulturesChange(activeCultures);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupLabels: Record<string, string> = Object.fromEntries(
    CULTURE_GROUPS.map((g) => [g.value, g.label])
  );
  const statusLabels: Record<string, string> = Object.fromEntries(
    CULTURE_STATUSES.map((s) => [s.value, s.label])
  );

  const statusColors: Record<string, string> = {
    ativo: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    inativo: "bg-gray-100 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400",
    em_teste: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };

  const columns: Column<Culture>[] = [
    {
      header: "",
      render: (r) => (
        <input
          type="radio"
          name="culture_select"
          checked={selectedCultureId === r.id}
          onChange={() => onSelectCulture(r.id)}
          className="h-4 w-4 accent-brand-500"
        />
      ),
    },
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Grupo", render: (r) => groupLabels[r.culture_group ?? ""] ?? "—" },
    { header: "Ciclo", render: (r) => `${r.cycle_days} dias`, align: "right" },
    { header: "Raiz (m)", render: (r) => r.root_depth.toFixed(2), align: "right" },
    { header: "p", render: (r) => r.depletion_factor.toFixed(2), align: "right" },
    {
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${statusColors[r.status] ?? ""}`}>
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
      culture_group: fd.get("culture_group") as string,
      description: (fd.get("description") as string) || null,
      status: fd.get("status") as string,
      kc_by_stage,
      root_depth: Number(fd.get("root_depth")),
      depletion_factor: depletionFactor,
      cycle_days: Number(fd.get("cycle_days")),
    };
    try {
      const supabase = createClient();
      if (editing) {
        await update(editing.id, payload);
        await supabase.from("culture_history").insert({
          culture_id: editing.id,
          change_type: "edicao",
          description: `Cultura "${payload.name}" editada`,
          old_values: { name: editing.name, cycle_days: editing.cycle_days },
          new_values: { name: payload.name, cycle_days: payload.cycle_days },
        });
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

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova cultura</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
        ) : activeCultures.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma cultura cadastrada.</p>
        ) : (
          <Table columns={columns} data={activeCultures} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar cultura" : "Nova cultura"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" placeholder="Soja" required defaultValue={editing?.name} />
            <Input id="scientific_name" name="scientific_name" label="Nome científico" placeholder="Glycine max" defaultValue={editing?.scientific_name ?? ""} />
            <Select id="culture_group" name="culture_group" label="Grupo" options={[...CULTURE_GROUPS]} required defaultValue={editing?.culture_group ?? "graos"} />
            <Select id="status" name="status" label="Status" options={[...CULTURE_STATUSES]} required defaultValue={editing?.status ?? "ativo"} />
            <Input id="cycle_days" name="cycle_days" label="Ciclo (dias)" type="number" required defaultValue={editing?.cycle_days} />
            <Input id="root_depth" name="root_depth" label="Prof. raiz máx. (m)" type="number" step="0.01" required defaultValue={editing?.root_depth} />
            <Input id="depletion_factor" name="depletion_factor" label="Fator de depleção (p)" type="number" step="0.01" min="0" max="1" required defaultValue={editing?.depletion_factor} />
          </div>

          <TextArea id="description" name="description" label="Descrição" defaultValue={editing?.description ?? ""} />

          <div>
            <p className="mb-2 text-sm font-medium text-graphite-900 dark:text-gray-200">Kc por estágio (referência rápida)</p>
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
                  max="2.5"
                  required
                  defaultValue={editing?.kc_by_stage?.[stage.value as keyof KcByStage] ?? ""}
                />
              ))}
            </div>
          </div>

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
        onConfirm={async () => {
          if (!deleteTarget) return;
          setSaving(true);
          try { await softDelete(deleteTarget.id); if (selectedCultureId === deleteTarget.id) onSelectCulture(null); setDeleteTarget(null); } catch { setFormError("Erro ao excluir"); }
          setSaving(false);
        }}
        title="Excluir cultura"
        message={`Deseja excluir a cultura "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

// ── Variedades ────────────────────────────────────────────────────────────

function VarietiesTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: Culture[];
}) {
  const supabase = createClient();
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Variety | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Variety | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchVarieties = useCallback(async () => {
    if (!selectedCultureId) { setVarieties([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("culture_varieties")
      .select("*")
      .eq("culture_id", selectedCultureId)
      .eq("active", true)
      .order("name");
    if (data) setVarieties(data as Variety[]);
    setLoading(false);
  }, [selectedCultureId, supabase]);

  useEffect(() => { fetchVarieties(); }, [fetchVarieties]);

  const maturityLabels: Record<string, string> = Object.fromEntries(
    MATURITY_TYPES.map((m) => [m.value, m.label])
  );

  const columns: Column<Variety>[] = [
    { header: "Cultivar", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Empresa", render: (r) => r.company ?? "—" },
    { header: "Maturação", render: (r) => maturityLabels[r.maturity] ?? r.maturity },
    { header: "Ciclo (dias)", render: (r) => r.cycle_days ?? "—", align: "right" },
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
    if (!selectedCultureId) return;
    setSaving(true);
    setFormError("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      culture_id: selectedCultureId,
      name: fd.get("name") as string,
      company: (fd.get("company") as string) || null,
      maturity: fd.get("maturity") as string,
      cycle_days: fd.get("cycle_days") ? Number(fd.get("cycle_days")) : null,
      observations: (fd.get("observations") as string) || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from("culture_varieties").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
        await supabase.from("culture_history").insert({
          culture_id: selectedCultureId, change_type: "variedade_edit",
          description: `Variedade "${payload.name}" editada`,
        });
      } else {
        const { error } = await supabase.from("culture_varieties").insert(payload);
        if (error) throw new Error(error.message);
        await supabase.from("culture_history").insert({
          culture_id: selectedCultureId, change_type: "variedade_add",
          description: `Variedade "${payload.name}" adicionada`,
        });
      }
      setModalOpen(false);
      setEditing(null);
      fetchVarieties();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selectedCultureId) return;
    setSaving(true);
    await supabase.from("culture_varieties").update({ active: false }).eq("id", deleteTarget.id);
    await supabase.from("culture_history").insert({
      culture_id: selectedCultureId, change_type: "variedade_del",
      description: `Variedade "${deleteTarget.name}" removida`,
    });
    setDeleteTarget(null);
    setSaving(false);
    fetchVarieties();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="culture_select_var"
            name="culture_select_var"
            label="Cultura"
            options={cultures.map((c) => ({ value: c.id, label: c.name }))}
            value={selectedCultureId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(e.target.value || null)}
          />
        </div>
        {selectedCultureId && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova variedade</Button>
        )}
      </div>

      {!selectedCultureId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma cultura para gerenciar variedades.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
          ) : varieties.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma variedade cadastrada.</p>
          ) : (
            <Table columns={columns} data={varieties} getKey={(r) => r.id} />
          )}
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar variedade" : "Nova variedade"}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input id="name" name="name" label="Cultivar" placeholder="BRS 388" required defaultValue={editing?.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="company" name="company" label="Empresa" placeholder="Embrapa" defaultValue={editing?.company ?? ""} />
            <Select id="maturity" name="maturity" label="Ciclo de maturação" options={[...MATURITY_TYPES]} required defaultValue={editing?.maturity ?? "medio"} />
            <Input id="cycle_days" name="cycle_days" label="Ciclo (dias)" type="number" defaultValue={editing?.cycle_days ?? ""} />
          </div>
          <TextArea id="observations" name="observations" label="Observações" defaultValue={editing?.observations ?? ""} />
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
        title="Excluir variedade"
        message={`Deseja excluir a variedade "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

// ── Fases Fenológicas ─────────────────────────────────────────────────────

function PhasesTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: Culture[];
}) {
  const supabase = createClient();
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PhaseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhaseRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [warnings, setWarnings] = useState<CultureValidation[]>([]);

  const selectedCulture = cultures.find((c) => c.id === selectedCultureId);

  const fetchPhases = useCallback(async () => {
    if (!selectedCultureId) { setPhases([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("culture_phases")
      .select("*")
      .eq("culture_id", selectedCultureId)
      .order("phase_order");
    if (data) setPhases(data as PhaseRow[]);
    setLoading(false);
  }, [selectedCultureId, supabase]);

  useEffect(() => { fetchPhases(); }, [fetchPhases]);

  const previewDay = phases.length > 0 && selectedCulture
    ? Math.floor(selectedCulture.cycle_days / 2)
    : null;

  const columns: Column<PhaseRow>[] = [
    { header: "#", render: (r) => r.phase_order, align: "center" },
    { header: "Fase", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "DAP", render: (r) => r.days_after_plant, align: "right" },
    { header: "Duração", render: (r) => `${r.duration_days} dias`, align: "right" },
    { header: "Kc início", render: (r) => r.kc_start.toFixed(2), align: "right" },
    { header: "Kc fim", render: (r) => r.kc_end.toFixed(2), align: "right" },
    { header: "Raiz ini (m)", render: (r) => r.root_depth_start.toFixed(2), align: "right" },
    { header: "Raiz fim (m)", render: (r) => r.root_depth_end.toFixed(2), align: "right" },
    { header: "p", render: (r) => r.depletion_factor.toFixed(2), align: "right" },
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
    if (!selectedCultureId || !selectedCulture) return;
    setSaving(true);
    setFormError("");
    setWarnings([]);
    const fd = new FormData(e.currentTarget);

    const newPhase = {
      phase_order: Number(fd.get("phase_order")),
      days_after_plant: Number(fd.get("days_after_plant")),
      duration_days: Number(fd.get("duration_days")),
      kc_start: Number(fd.get("kc_start")),
      kc_end: Number(fd.get("kc_end")),
    };

    const otherPhases = editing
      ? phases.filter((p) => p.id !== editing.id)
      : phases;
    const allPhases = [...otherPhases.map((p) => ({
      phase_order: p.phase_order, days_after_plant: p.days_after_plant,
      duration_days: p.duration_days, kc_start: p.kc_start, kc_end: p.kc_end,
    })), newPhase];

    const issues = validatePhases(allPhases, selectedCulture.cycle_days);
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length > 0) {
      setFormError(errors.map((e) => e.message).join("; "));
      setSaving(false);
      return;
    }
    setWarnings(issues.filter((i) => i.level === "warning"));

    const payload = {
      culture_id: selectedCultureId,
      phase_order: newPhase.phase_order,
      name: fd.get("name") as string,
      days_after_plant: newPhase.days_after_plant,
      duration_days: newPhase.duration_days,
      kc_start: newPhase.kc_start,
      kc_end: newPhase.kc_end,
      root_depth_start: Number(fd.get("root_depth_start")),
      root_depth_end: Number(fd.get("root_depth_end")),
      depletion_factor: Number(fd.get("depletion_factor")),
      description: (fd.get("description") as string) || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from("culture_phases").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
        await supabase.from("culture_history").insert({
          culture_id: selectedCultureId, change_type: "fase_edit",
          description: `Fase "${payload.name}" editada`,
        });
      } else {
        const { error } = await supabase.from("culture_phases").insert(payload);
        if (error) throw new Error(error.message);
        await supabase.from("culture_history").insert({
          culture_id: selectedCultureId, change_type: "fase_add",
          description: `Fase "${payload.name}" adicionada (ordem ${payload.phase_order})`,
        });
      }
      setModalOpen(false);
      setEditing(null);
      fetchPhases();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selectedCultureId) return;
    setSaving(true);
    await supabase.from("culture_phases").delete().eq("id", deleteTarget.id);
    await supabase.from("culture_history").insert({
      culture_id: selectedCultureId, change_type: "fase_del",
      description: `Fase "${deleteTarget.name}" removida`,
    });
    setDeleteTarget(null);
    setSaving(false);
    fetchPhases();
  };

  const nextOrder = phases.length > 0 ? Math.max(...phases.map((p) => p.phase_order)) + 1 : 1;
  const nextDAP = phases.length > 0
    ? phases[phases.length - 1].days_after_plant + phases[phases.length - 1].duration_days
    : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="culture_select_phases"
            name="culture_select_phases"
            label="Cultura"
            options={cultures.map((c) => ({ value: c.id, label: `${c.name} (${c.cycle_days}d)` }))}
            value={selectedCultureId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(e.target.value || null)}
          />
        </div>
        {selectedCultureId && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); setWarnings([]); }}>Nova fase</Button>
        )}
      </div>

      {!selectedCultureId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma cultura para gerenciar fases fenológicas.</p></Card>
      ) : (
        <>
          {previewDay !== null && phases.length > 0 && (
            <div className="mb-4 grid gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-5 dark:border-graphite-700/50 dark:bg-graphite-800/60 sm:grid-cols-4">
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">Dia exemplo (DAP {previewDay})</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">
                  {identifyPhase(phases as CulturePhase[], previewDay)?.phase.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">Kc interpolado</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">
                  {interpolateKc(phases as CulturePhase[], previewDay).toFixed(3)}
                </p>
              </div>
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">Raiz interpolada</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">
                  {interpolateRootDepth(phases as CulturePhase[], previewDay).toFixed(3)} m
                </p>
              </div>
              <div>
                <p className="text-xs text-graphite-400 dark:text-gray-500">Total fases</p>
                <p className="text-sm font-semibold text-graphite-900 dark:text-white">{phases.length}</p>
              </div>
            </div>
          )}

          <Card>
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
            ) : phases.length === 0 ? (
              <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma fase cadastrada. Adicione fases para definir o perfil fenológico.</p>
            ) : (
              <Table columns={columns} data={phases} getKey={(r) => r.id} />
            )}
          </Card>
        </>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setWarnings([]); }} title={editing ? "Editar fase" : "Nova fase"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="phase_order" name="phase_order" label="Ordem" type="number" min="1" required defaultValue={editing?.phase_order ?? nextOrder} />
            <Input id="name" name="name" label="Nome da fase" placeholder="Germinação" required defaultValue={editing?.name} />
            <Input id="days_after_plant" name="days_after_plant" label="Dias após plantio (início)" type="number" min="0" required defaultValue={editing?.days_after_plant ?? nextDAP} />
            <Input id="duration_days" name="duration_days" label="Duração (dias)" type="number" min="1" required defaultValue={editing?.duration_days} />
          </div>

          <p className="text-sm font-medium text-graphite-900 dark:text-gray-200">Kc (interpolação linear)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="kc_start" name="kc_start" label="Kc início" type="number" step="0.01" min="0" max="2.5" required defaultValue={editing?.kc_start} />
            <Input id="kc_end" name="kc_end" label="Kc fim" type="number" step="0.01" min="0" max="2.5" required defaultValue={editing?.kc_end} />
          </div>

          <p className="text-sm font-medium text-graphite-900 dark:text-gray-200">Sistema radicular</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="root_depth_start" name="root_depth_start" label="Raiz início (m)" type="number" step="0.01" min="0" required defaultValue={editing?.root_depth_start ?? 0.1} />
            <Input id="root_depth_end" name="root_depth_end" label="Raiz fim (m)" type="number" step="0.01" min="0" required defaultValue={editing?.root_depth_end ?? 0.3} />
          </div>

          <Input id="depletion_factor" name="depletion_factor" label="Fator de depleção (p)" type="number" step="0.01" min="0" max="1" required defaultValue={editing?.depletion_factor ?? selectedCulture?.depletion_factor ?? 0.5} />
          <TextArea id="description" name="description" label="Observações" defaultValue={editing?.description ?? ""} />

          {warnings.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3.5 dark:border-yellow-900/50 dark:bg-yellow-900/20">
              {warnings.map((w, i) => (
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
        title="Excluir fase"
        message={`Excluir a fase "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

// ── Associação ────────────────────────────────────────────────────────────

function AssociationTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: Culture[];
}) {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAssignments = useCallback(async () => {
    if (!selectedCultureId) { setAssignments([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("pivot_crop_assignments")
      .select("id, crop_stage, planting_date, pivots(name), seasons(name), soils(name)")
      .eq("culture_id", selectedCultureId)
      .eq("active", true);
    if (data) {
      setAssignments(
        data.map((d) => ({
          id: d.id,
          pivot_name: (d.pivots as unknown as { name: string })?.name ?? "—",
          season_name: (d.seasons as unknown as { name: string })?.name ?? "—",
          soil_name: (d.soils as unknown as { name: string })?.name ?? "—",
          crop_stage: d.crop_stage,
          planting_date: d.planting_date,
        }))
      );
    }
    setLoading(false);
  }, [selectedCultureId, supabase]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const stageLabels: Record<string, string> = Object.fromEntries(
    CROP_STAGES.map((s) => [s.value, s.label])
  );

  const columns: Column<AssignmentRow>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivot_name}</span> },
    { header: "Safra", render: (r) => r.season_name },
    { header: "Solo", render: (r) => r.soil_name },
    { header: "Estágio", render: (r) => stageLabels[r.crop_stage] ?? r.crop_stage },
    { header: "Plantio", render: (r) => new Date(r.planting_date + "T12:00:00").toLocaleDateString("pt-BR") },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Select
            id="culture_select_assoc"
            name="culture_select_assoc"
            label="Cultura"
            options={cultures.map((c) => ({ value: c.id, label: c.name }))}
            value={selectedCultureId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(e.target.value || null)}
          />
        </div>
      </div>

      {!selectedCultureId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma cultura para ver seus vínculos.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
          ) : assignments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-graphite-400 dark:text-gray-500">Nenhuma associação encontrada.</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Cultura → Variedade → Safra → Pivô via pivot_crop_assignments.</p>
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

function HistoryTabComponent({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: Culture[];
}) {
  const supabase = createClient();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!selectedCultureId) { setHistory([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("culture_history")
      .select("*")
      .eq("culture_id", selectedCultureId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data as HistoryEntry[]);
    setLoading(false);
  }, [selectedCultureId, supabase]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const changeTypeLabels: Record<string, string> = {
    criacao: "Criação",
    edicao: "Edição",
    variedade_add: "Variedade +",
    variedade_edit: "Variedade ed.",
    variedade_del: "Variedade -",
    fase_add: "Fase +",
    fase_edit: "Fase ed.",
    fase_del: "Fase -",
    associacao: "Associação",
  };

  const changeTypeColors: Record<string, string> = {
    criacao: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    edicao: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    variedade_add: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",
    variedade_edit: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    variedade_del: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    fase_add: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",
    fase_edit: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    fase_del: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    associacao: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  const columns: Column<HistoryEntry>[] = [
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
            id="culture_select_hist"
            name="culture_select_hist"
            label="Cultura"
            options={cultures.map((c) => ({ value: c.id, label: c.name }))}
            value={selectedCultureId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(e.target.value || null)}
          />
        </div>
      </div>

      {!selectedCultureId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma cultura para ver o histórico.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhum registro de alteração.</p>
          ) : (
            <Table columns={columns} data={history} getKey={(r) => r.id} />
          )}
        </Card>
      )}
    </>
  );
}
