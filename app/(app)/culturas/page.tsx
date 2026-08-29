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
  CULTURE_STATUSES
} from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import { AgronomicSourcesTab } from "@/modules/culture/components/AgronomicSourcesTab";
import { AgronomicCultivarsTab } from "@/modules/culture/components/AgronomicCultivarsTab";
import { AgronomicPhenologyTab } from "@/modules/culture/components/AgronomicPhenologyTab";
import { AgronomicKcTab } from "@/modules/culture/components/AgronomicKcTab";
import { AgronomicRootWaterTab } from "@/modules/culture/components/AgronomicRootWaterTab";
import { AgronomicDegreeDayTab } from "@/modules/culture/components/AgronomicDegreeDayTab";
import {
  interpolateKc,
  interpolateRootDepth,
  identifyPhase,
  validatePhases,
  type CulturePhase,
  type CultureValidation,
} from "@/modules/culture/services";
import { rebuildPhaseTimeline } from "@/modules/culture/services/culture-phases";

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
  // Sprint 13 · Etapa 4 — variáveis de manejo de irrigação
  kl: number | null;
  ks_function: string | null;
  optimal_temperature_c: number | null;
  basal_temperature_c: number | null;
  by_phase: boolean | null;
  kc_constant: boolean | null;
  // Sprint 14 · Etapa 5 — Kl como função selecionável
  kl_function: string | null;
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
  // Sprint 13 · Etapa 4 — parâmetros avançados
  color: string | null;
  duration_degree_days: number | null;
  kc_constant: boolean | null;
  shaded_area_pct: number | null;
  ks_function: string | null;
  itn_pct: number | null;
  cycle_count: number | null;
  ends_cycle: boolean | null;
  // Sprint 14 · Etapa 5 — coeficiente Ky para método FAO 33
  ky: number | null;
  kl: number | null;
  phase_key: string | null;
}

interface AssignmentRow {
  id: string;
  pivot_name: string;
  season_name: string;
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
  { id: "cadastro", label: "Geral" },
  { id: "variedades", label: "Cultivares" },
  { id: "fases", label: "Fenologia" },
  { id: "kc", label: "Kc e ETc" },
  { id: "raiz", label: "Raiz e Água" },
  { id: "graus-dia", label: "Graus-dia" },
  { id: "fontes", label: "Fontes" },
  { id: "associacao", label: "Parcelas" },
  { id: "historico", label: "Histórico" },
];

export default function CulturasPage() {
  const [activeTab, setActiveTab] = useState("cadastro");
  const [selectedCultureId, setSelectedCultureId] = useState<string | null>(null);
  const [cultures, setCultures] = useState<Culture[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("cultures")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setCultures(data as Culture[]);
      });
  }, [activeTab]);

  return (
    <div className="space-y-8">
      <PageHeader titulo="Culturas" descricao="Motor agronômico — fenologia, Kc, graus-dia, rastreabilidade e calibração" />
      <Tabs tabs={cultureTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "cadastro" && (
          <CulturesTab
            selectedCultureId={selectedCultureId}
            onSelectCulture={setSelectedCultureId}
            onCulturesChange={setCultures}
          />
        )}
        {activeTab === "variedades" && <div className="animate-in"><AgronomicCultivarsTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "fases" && <div className="animate-in"><AgronomicPhenologyTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "kc" && <div className="animate-in"><AgronomicKcTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "raiz" && <div className="animate-in"><AgronomicRootWaterTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "graus-dia" && <div className="animate-in"><AgronomicDegreeDayTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "fontes" && <div className="animate-in"><AgronomicSourcesTab /></div>}
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

    const numOrNull = (name: string) => {
      const v = fd.get(name) as string;
      return v ? Number(v) : null;
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
      // Sprint 13 · Etapa 4 — manejo de irrigação
      kl: numOrNull("kl"),
      ks_function: (fd.get("ks_function") as string) || "linear",
      kl_function: (fd.get("kl_function") as string) || "constant",
      optimal_temperature_c: numOrNull("optimal_temperature_c"),
      basal_temperature_c: numOrNull("basal_temperature_c"),
      by_phase: fd.get("by_phase") === "on",
      kc_constant: fd.get("kc_constant") === "on",
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
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
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

          {/* ── Manejo de irrigação (Sprint 13 · Etapa 4) ────────────── */}
          <fieldset className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 dark:border-brand-800/30 dark:bg-brand-900/10">
            <legend className="px-2 text-sm font-semibold text-brand-700 dark:text-brand-400">
              Manejo de irrigação
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                id="kl_function"
                name="kl_function"
                label="Kl — Função (Sprint 14)"
                options={[
                  { value: "constant", label: "Constante (valor fixo)" },
                  { value: "custom", label: "Personalizado" },
                  { value: "fereres", label: "Fereres 1981 (área sombreada)" },
                  { value: "keller_karmeli", label: "Keller-Karmeli 1975 (área molhada)" },
                  { value: "freitas", label: "Freitas (Vermeiren-Jobling)" },
                  { value: "bernardo", label: "Bernardo 2019 (conservador)" },
                ]}
                defaultValue={editing?.kl_function ?? "constant"}
              />
              <Input
                id="kl"
                name="kl"
                label="Kl — valor (usado se função = constant/custom)"
                type="number"
                step="0.01"
                min="0"
                max="1"
                placeholder="1.0 (pivô central)"
                defaultValue={editing?.kl ?? 1.0}
              />
              <Select
                id="ks_function"
                name="ks_function"
                label="Ks — Função de estresse"
                options={[
                  { value: "linear", label: "Linear (FAO-56 padrão)" },
                  { value: "fao33", label: "FAO 33 (Doorenbos-Kassam, usa Ky por fase)" },
                  { value: "exponential", label: "Exponencial (castiga estresse mais rápido)" },
                  { value: "sigmoid", label: "Sigmoide (transição suave)" },
                  { value: "none", label: "Nenhum (Ks fixo em 1)" },
                ]}
                defaultValue={editing?.ks_function ?? "linear"}
              />
              <Input
                id="optimal_temperature_c"
                name="optimal_temperature_c"
                label="Temp. ótima (°C)"
                type="number"
                step="0.1"
                min="0"
                max="45"
                placeholder="Ex: algodão 28"
                defaultValue={editing?.optimal_temperature_c ?? ""}
              />
              <Input
                id="basal_temperature_c"
                name="basal_temperature_c"
                label="Temp. basal (°C) — graus-dia"
                type="number"
                step="0.1"
                min="0"
                max="30"
                placeholder="Ex: algodão 10"
                defaultValue={editing?.basal_temperature_c ?? ""}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  name="by_phase"
                  defaultChecked={editing?.by_phase ?? true}
                  className="h-4 w-4 accent-brand-500"
                />
                Manejo por fase
                <span className="text-xs text-graphite-400 dark:text-gray-500">(usa parâmetros da fase atual)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  name="kc_constant"
                  defaultChecked={editing?.kc_constant ?? false}
                  className="h-4 w-4 accent-brand-500"
                />
                Kc constante no ciclo
                <span className="text-xs text-graphite-400 dark:text-gray-500">(pastagens perenes)</span>
              </label>
            </div>
          </fieldset>

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

// ── Fases Fenológicas ─────────────────────────────────────────────────────

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
    // Sprint 13 · Etapa 6 — só parcelas ativas nesta cultura.
    const { data } = await supabase
      .from("pivot_crop_assignments")
      .select("id, crop_stage, planting_date, pivots(name), seasons(name)")
      .eq("culture_id", selectedCultureId)
      .eq("active", true)
      .or("status.is.null,status.eq.ativa");
    if (data) {
      setAssignments(
        data.map((d) => ({
          id: d.id,
          pivot_name: (d.pivots as unknown as { name: string })?.name ?? "—",
          season_name: (d.seasons as unknown as { name: string })?.name ?? "—",
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
            <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
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
            <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
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
