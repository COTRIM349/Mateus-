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
import { HydricSensitivityTab } from "@/modules/culture/components/HydricSensitivityTab";
import { CultureCalibrationTab } from "@/modules/culture/components/CultureCalibrationTab";

// ── Types ─────────────────────────────────────────────────────────────────

interface Culture {
  id: string;
  name: string;
  scientific_name: string | null;
  culture_group: string | null;
  description: string | null;
  status: string;
  active: boolean;
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
  { id: "sensibilidade", label: "Sensibilidade Hídrica" },
  { id: "calibracao", label: "Calibração" },
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
        {activeTab === "sensibilidade" && <div className="animate-in"><HydricSensitivityTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
        {activeTab === "calibracao" && <div className="animate-in"><CultureCalibrationTab selectedCultureId={selectedCultureId} onSelectCulture={setSelectedCultureId} cultures={cultures} /></div>}
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

  const activeCultures = data.filter((row) => row.active);

  useEffect(() => {
    onCulturesChange(activeCultures);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupLabels: Record<string, string> = Object.fromEntries(
    CULTURE_GROUPS.map((g) => [g.value, g.label]),
  );
  const statusLabels: Record<string, string> = Object.fromEntries(
    CULTURE_STATUSES.map((s) => [s.value, s.label]),
  );

  const columns: Column<Culture>[] = [
    {
      header: "",
      render: (row) => (
        <input
          type="radio"
          name="culture_select"
          checked={selectedCultureId === row.id}
          onChange={() => onSelectCulture(row.id)}
          className="h-4 w-4 accent-brand-500"
          aria-label={`Selecionar ${row.name}`}
        />
      ),
    },
    { header: "Cultura", render: (row) => <span className="font-medium">{row.name}</span> },
    { header: "Nome científico", render: (row) => row.scientific_name ?? "Sem informação" },
    { header: "Categoria", render: (row) => groupLabels[row.culture_group ?? ""] ?? "Sem informação" },
    { header: "Status", render: (row) => statusLabels[row.status] ?? row.status },
    {
      header: "Ações",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(row); setModalOpen(true); setFormError(""); }}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
            Desativar
          </Button>
        </div>
      ),
    },
  ];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const fd = new FormData(event.currentTarget);

    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      scientific_name: String(fd.get("scientific_name") ?? "").trim() || null,
      culture_group: String(fd.get("culture_group") ?? "").trim() || null,
      description: String(fd.get("description") ?? "").trim() || null,
      status: String(fd.get("status") ?? "ativo"),
      active: true,
    };

    if (!payload.name) {
      setFormError("Nome da cultura é obrigatório.");
      setSaving(false);
      return;
    }

    try {
      if (editing) {
        await update(editing.id, payload);
        const supabase = createClient();
        await supabase.from("culture_history").insert({
          culture_id: editing.id,
          change_type: "edicao",
          description: `Cadastro mestre da cultura "${payload.name}" editado`,
        });
      } else {
        await create(payload as Omit<Culture, "id">);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erro ao salvar cultura.");
    }
    setSaving(false);
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          O cadastro mestre contém apenas a identidade da espécie. Kc, fenologia, graus-dia, raiz e p ficam nas abas próprias com fonte e validação.
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); setFormError(""); }}>
          Nova cultura
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400">Carregando culturas...</p>
        ) : activeCultures.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400">Nenhuma cultura cadastrada.</p>
        ) : (
          <Table columns={columns} data={activeCultures} getKey={(row) => row.id} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setFormError(""); }}
        title={editing ? "Editar cultura" : "Nova cultura"}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input id="name" name="name" label="Nome comum" required defaultValue={editing?.name ?? ""} />
          <Input id="scientific_name" name="scientific_name" label="Nome científico" defaultValue={editing?.scientific_name ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="culture_group"
              name="culture_group"
              label="Categoria"
              options={[...CULTURE_GROUPS]}
              defaultValue={editing?.culture_group ?? CULTURE_GROUPS[0]?.value}
            />
            <Select
              id="status"
              name="status"
              label="Status"
              options={[...CULTURE_STATUSES]}
              defaultValue={editing?.status ?? "ativo"}
            />
          </div>
          <TextArea id="description" name="description" label="Observações gerais da espécie" defaultValue={editing?.description ?? ""} />

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            Não informe Kc, Tb, GDA, profundidade radicular, p ou duração fenológica nesta tela.
          </div>

          {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>
              Cancelar
            </Button>
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
          await softDelete(deleteTarget.id);
          if (selectedCultureId === deleteTarget.id) onSelectCulture(null);
          setDeleteTarget(null);
          setSaving(false);
        }}
        title="Desativar cultura"
        message={`Desativar a cultura "${deleteTarget?.name ?? ""}"? O histórico será preservado.`}
        confirmLabel="Desativar"
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
