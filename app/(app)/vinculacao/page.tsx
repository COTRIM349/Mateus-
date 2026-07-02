"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  Modal,
  ConfirmDialog,
  TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { PrerequisiteNotice } from "@/components/onboarding";
import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  pivot_id: string;
  season_id: string;
  culture_id: string;
  culture_variety_id: string | null;
  soil_id: string;
  crop_stage: string;
  planting_date: string;
  emergence_date: string | null;
  expected_harvest_date: string | null;
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: number | null;
  max_root_depth: number | null;
  irrigation_efficiency: number | null;
  depletion_factor: number | null;
  notes: string | null;
  active: boolean;
}

interface PivotLite { id: string; name: string; efficiency: number }
interface SeasonLite { id: string; name: string }
interface CultureLite { id: string; name: string; root_depth: number; depletion_factor: number }
interface SoilLite { id: string; name: string }
interface VarietyLite { id: string; culture_id: string; name: string }

interface FormState {
  pivot_id: string;
  season_id: string;
  culture_id: string;
  culture_variety_id: string;
  soil_id: string;
  planting_date: string;
  emergence_date: string;
  expected_harvest_date: string;
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: string;
  max_root_depth: string;
  irrigation_efficiency: string;
  depletion_factor: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  pivot_id: "",
  season_id: "",
  culture_id: "",
  culture_variety_id: "",
  soil_id: "",
  planting_date: "",
  emergence_date: "",
  expected_harvest_date: "",
  parameter_mode: "padrao",
  initial_root_depth: "",
  max_root_depth: "",
  irrigation_efficiency: "",
  depletion_factor: "",
  notes: "",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function VinculacaoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const { data: assignments, loading, create, update, softDelete } = useCrud<Assignment>({
    table: "pivot_crop_assignments",
    orderBy: "created_at",
    ascending: false,
  });

  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [seasons, setSeasons] = useState<SeasonLite[]>([]);
  const [cultures, setCultures] = useState<CultureLite[]>([]);
  const [soils, setSoils] = useState<SoilLite[]>([]);
  const [varieties, setVarieties] = useState<VarietyLite[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!activeFarmId) {
      setLookupsLoading(false);
      return;
    }
    setLookupsLoading(true);
    (async () => {
      const [pv, ss, cu, so, va] = await Promise.all([
        supabase.from("pivots").select("id, name, efficiency").eq("farm_id", activeFarmId).eq("active", true).order("name"),
        supabase.from("seasons").select("id, name").eq("farm_id", activeFarmId).eq("active", true).order("start_date", { ascending: false }),
        supabase.from("cultures").select("id, name, root_depth, depletion_factor").eq("active", true).order("name"),
        supabase.from("soils").select("id, name").eq("farm_id", activeFarmId).eq("active", true).order("name"),
        supabase.from("culture_varieties").select("id, culture_id, name").eq("active", true).order("name"),
      ]);
      setPivots((pv.data ?? []) as PivotLite[]);
      setSeasons((ss.data ?? []) as SeasonLite[]);
      setCultures((cu.data ?? []) as CultureLite[]);
      setSoils((so.data ?? []) as SoilLite[]);
      setVarieties((va.data ?? []) as VarietyLite[]);
      setLookupsLoading(false);
    })();
  }, [activeFarmId, supabase]);

  const pivotIds = useMemo(() => new Set(pivots.map((p) => p.id)), [pivots]);
  const farmAssignments = useMemo(
    () => assignments.filter((a) => a.active && pivotIds.has(a.pivot_id)),
    [assignments, pivotIds],
  );

  const pivotMap = useMemo(() => new Map(pivots.map((p) => [p.id, p.name])), [pivots]);
  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s.name])), [seasons]);
  const cultureMap = useMemo(() => new Map(cultures.map((c) => [c.id, c])), [cultures]);
  const soilMap = useMemo(() => new Map(soils.map((s) => [s.id, s.name])), [soils]);
  const varietyMap = useMemo(() => new Map(varieties.map((v) => [v.id, v.name])), [varieties]);

  const varietiesForCulture = useMemo(
    () => varieties.filter((v) => v.culture_id === form.culture_id),
    [varieties, form.culture_id],
  );

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (a: Assignment) => {
    setEditing(a);
    setForm({
      pivot_id: a.pivot_id,
      season_id: a.season_id,
      culture_id: a.culture_id,
      culture_variety_id: a.culture_variety_id ?? "",
      soil_id: a.soil_id,
      planting_date: a.planting_date ?? "",
      emergence_date: a.emergence_date ?? "",
      expected_harvest_date: a.expected_harvest_date ?? "",
      parameter_mode: a.parameter_mode,
      initial_root_depth: a.initial_root_depth != null ? String(a.initial_root_depth) : "",
      max_root_depth: a.max_root_depth != null ? String(a.max_root_depth) : "",
      irrigation_efficiency: a.irrigation_efficiency != null ? String(Math.round(a.irrigation_efficiency * 100)) : "",
      depletion_factor: a.depletion_factor != null ? String(a.depletion_factor) : "",
      notes: a.notes ?? "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  const handleCultureChange = (culture_id: string) => {
    const culture = cultureMap.get(culture_id);
    const changes: Partial<FormState> = { culture_id, culture_variety_id: "" };
    // when personalizando, pré-preenche os padrões da cultura como ponto de partida
    if (form.parameter_mode === "personalizado" && culture) {
      changes.max_root_depth = String(culture.root_depth);
      changes.depletion_factor = String(culture.depletion_factor);
    }
    patch(changes);
  };

  const handleModeChange = (mode: "padrao" | "personalizado") => {
    if (mode === "personalizado") {
      const culture = cultureMap.get(form.culture_id);
      const pivot = pivots.find((p) => p.id === form.pivot_id);
      patch({
        parameter_mode: mode,
        max_root_depth: form.max_root_depth || (culture ? String(culture.root_depth) : ""),
        depletion_factor: form.depletion_factor || (culture ? String(culture.depletion_factor) : ""),
        irrigation_efficiency: form.irrigation_efficiency || (pivot ? String(Math.round(pivot.efficiency * 100)) : ""),
      });
    } else {
      patch({ parameter_mode: mode });
    }
  };

  const validate = (): string | null => {
    if (!form.pivot_id) return "Selecione o pivô.";
    if (!form.season_id) return "Selecione a safra.";
    if (!form.culture_id) return "Selecione a cultura.";
    if (!form.soil_id) return "Selecione o solo.";
    if (!form.planting_date) return "Informe a data de plantio.";
    if (form.emergence_date && form.emergence_date < form.planting_date)
      return "A data de emergência não pode ser anterior ao plantio.";
    if (form.expected_harvest_date && form.expected_harvest_date <= form.planting_date)
      return "A colheita prevista deve ser posterior ao plantio.";
    if (form.parameter_mode === "personalizado") {
      const init = form.initial_root_depth ? Number(form.initial_root_depth) : null;
      const max = form.max_root_depth ? Number(form.max_root_depth) : null;
      if (init != null && init <= 0) return "A profundidade inicial da raiz deve ser maior que zero.";
      if (max != null && max <= 0) return "A profundidade máxima da raiz deve ser maior que zero.";
      if (init != null && max != null && init > max)
        return "A profundidade inicial não pode ser maior que a máxima.";
      const eff = form.irrigation_efficiency ? Number(form.irrigation_efficiency) : null;
      if (eff != null && (eff <= 0 || eff > 100)) return "A eficiência deve estar entre 1 e 100%.";
      const p = form.depletion_factor ? Number(form.depletion_factor) : null;
      if (p != null && (p <= 0 || p > 1)) return "O fator p deve estar entre 0 e 1.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError("");

    const custom = form.parameter_mode === "personalizado";
    const payload = {
      pivot_id: form.pivot_id,
      season_id: form.season_id,
      culture_id: form.culture_id,
      culture_variety_id: form.culture_variety_id || null,
      soil_id: form.soil_id,
      planting_date: form.planting_date,
      emergence_date: form.emergence_date || null,
      expected_harvest_date: form.expected_harvest_date || null,
      parameter_mode: form.parameter_mode,
      initial_root_depth: custom && form.initial_root_depth ? Number(form.initial_root_depth) : null,
      max_root_depth: custom && form.max_root_depth ? Number(form.max_root_depth) : null,
      irrigation_efficiency: custom && form.irrigation_efficiency ? Number(form.irrigation_efficiency) / 100 : null,
      depletion_factor: custom && form.depletion_factor ? Number(form.depletion_factor) : null,
      notes: form.notes || null,
    };

    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<Assignment, "id" | "created_at" | "updated_at">);
      }
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      if (/duplicate|unique|23505/i.test(msg)) {
        setFormError("Já existe uma vinculação ativa para este pivô nesta safra.");
      } else {
        setFormError(msg);
      }
    }
    setSaving(false);
  };

  const columns: Column<Assignment>[] = [
    { header: "Pivô", render: (r) => <span className="font-medium">{pivotMap.get(r.pivot_id) ?? "—"}</span> },
    { header: "Safra", render: (r) => seasonMap.get(r.season_id) ?? "—" },
    {
      header: "Cultura",
      render: (r) => (
        <div>
          <span>{cultureMap.get(r.culture_id)?.name ?? "—"}</span>
          {r.culture_variety_id && (
            <span className="block text-xs text-gray-400 dark:text-gray-500">{varietyMap.get(r.culture_variety_id) ?? ""}</span>
          )}
        </div>
      ),
    },
    { header: "Solo", render: (r) => soilMap.get(r.soil_id) ?? "—" },
    { header: "Plantio", render: (r) => r.planting_date ? new Date(r.planting_date + "T12:00:00").toLocaleDateString("pt-BR") : "—" },
    {
      header: "Parâmetros",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          r.parameter_mode === "personalizado"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            : "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
        }`}>
          {r.parameter_mode === "personalizado" ? "Personalizado" : "Padrão da cultura"}
        </span>
      ),
    },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
        </div>
      ),
    },
  ];

  // ── Prerequisite guards (Fase 1.2 pattern) ──────────────────────────────

  if (!activeFarmId) {
    return (
      <div className="space-y-6">
        <PageHeader titulo="Vinculação Operacional" descricao="Vincule pivô, safra, cultura e solo para habilitar o balanço hídrico" />
        <PrerequisiteNotice
          title="Cadastre uma fazenda primeiro"
          description="A vinculação operacional pertence a uma fazenda. Cadastre e selecione uma fazenda ativa para continuar."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  const prerequisite = !lookupsLoading
    ? pivots.length === 0
      ? { title: "Cadastre um pivô primeiro", description: "A vinculação parte do pivô. Cadastre ao menos um pivô nesta fazenda.", actionLabel: "Ir para Pivôs", actionHref: "/pivos" }
      : seasons.length === 0
        ? { title: "Cadastre uma safra primeiro", description: "É necessário ter uma safra para vincular a cultura ao ciclo produtivo.", actionLabel: "Ir para Fazendas", actionHref: "/fazendas" }
        : cultures.length === 0
          ? { title: "Cadastre uma cultura primeiro", description: "A vinculação precisa de uma cultura com suas fases fenológicas.", actionLabel: "Ir para Culturas", actionHref: "/culturas" }
          : soils.length === 0
            ? { title: "Cadastre um solo primeiro", description: "O solo define a capacidade de água disponível usada no balanço hídrico.", actionLabel: "Ir para Solos", actionHref: "/solos" }
            : null
    : null;

  if (prerequisite) {
    return (
      <div className="space-y-6">
        <PageHeader titulo="Vinculação Operacional" descricao="Vincule pivô, safra, cultura e solo para habilitar o balanço hídrico" />
        <PrerequisiteNotice {...prerequisite} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Vinculação Operacional" descricao="Vincule pivô, safra, cultura e solo para habilitar o balanço hídrico" />

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {farmAssignments.length} vinculação{farmAssignments.length !== 1 ? "ões" : ""} ativa{farmAssignments.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openNew}>Nova vinculação</Button>
      </div>

      <Card>
        {loading || lookupsLoading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : farmAssignments.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma vinculação cadastrada. Crie a primeira para habilitar o balanço hídrico dos pivôs.
          </p>
        ) : (
          <Table columns={columns} data={farmAssignments} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar vinculação" : "Nova vinculação"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="pivot_id" label="Pivô" required
              value={form.pivot_id}
              onChange={(e) => patch({ pivot_id: e.target.value })}
              options={pivots.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Select
              id="season_id" label="Safra" required
              value={form.season_id}
              onChange={(e) => patch({ season_id: e.target.value })}
              options={seasons.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select
              id="culture_id" label="Cultura" required
              value={form.culture_id}
              onChange={(e) => handleCultureChange(e.target.value)}
              options={cultures.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              id="culture_variety_id" label="Cultivar (opcional)"
              value={form.culture_variety_id}
              onChange={(e) => patch({ culture_variety_id: e.target.value })}
              options={varietiesForCulture.map((v) => ({ value: v.id, label: v.name }))}
              disabled={!form.culture_id}
            />
            <Select
              id="soil_id" label="Solo" required
              value={form.soil_id}
              onChange={(e) => patch({ soil_id: e.target.value })}
              options={soils.map((s) => ({ value: s.id, label: s.name }))}
            />
            <div />
            <Input
              id="planting_date" label="Data de plantio" type="date" required
              value={form.planting_date}
              onChange={(e) => patch({ planting_date: e.target.value })}
            />
            <Input
              id="emergence_date" label="Data de emergência (opcional)" type="date"
              value={form.emergence_date}
              onChange={(e) => patch({ emergence_date: e.target.value })}
            />
            <Input
              id="expected_harvest_date" label="Colheita prevista (opcional)" type="date"
              value={form.expected_harvest_date}
              onChange={(e) => patch({ expected_harvest_date: e.target.value })}
            />
          </div>

          {/* Origem dos parâmetros de manejo */}
          <div className="rounded-xl border border-gray-200 p-4 dark:border-graphite-700">
            <p className="mb-3 text-sm font-medium text-graphite-900 dark:text-gray-200">Parâmetros de manejo</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio" name="parameter_mode" value="padrao"
                  checked={form.parameter_mode === "padrao"}
                  onChange={() => handleModeChange("padrao")}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Utilizar parâmetros padrão da cultura
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio" name="parameter_mode" value="personalizado"
                  checked={form.parameter_mode === "personalizado"}
                  onChange={() => handleModeChange("personalizado")}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Personalizar parâmetros deste pivô
              </label>
            </div>

            {form.parameter_mode === "padrao" ? (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Kc, fator p, profundidade radicular e eficiência serão carregados automaticamente do cadastro da cultura e do pivô. O crescimento radicular é calculado pelo sistema conforme a fase fenológica e o DAE.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  id="initial_root_depth" label="Prof. inicial da raiz (m)" type="number" step="0.01" min="0"
                  value={form.initial_root_depth}
                  onChange={(e) => patch({ initial_root_depth: e.target.value })}
                  placeholder="0.10"
                />
                <Input
                  id="max_root_depth" label="Prof. máxima da raiz (m)" type="number" step="0.01" min="0"
                  value={form.max_root_depth}
                  onChange={(e) => patch({ max_root_depth: e.target.value })}
                  placeholder="0.60"
                />
                <Input
                  id="irrigation_efficiency" label="Eficiência de irrigação (%)" type="number" step="1" min="1" max="100"
                  value={form.irrigation_efficiency}
                  onChange={(e) => patch({ irrigation_efficiency: e.target.value })}
                  placeholder="85"
                />
                <Input
                  id="depletion_factor" label="Fator de depleção (p)" type="number" step="0.01" min="0" max="1"
                  value={form.depletion_factor}
                  onChange={(e) => patch({ depletion_factor: e.target.value })}
                  placeholder="0.50"
                />
                <p className="sm:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                  Os valores personalizados valem apenas para este pivô nesta safra e não alteram o cadastro original da cultura.
                </p>
              </div>
            )}
          </div>

          <TextArea
            id="notes" label="Observações (opcional)"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) { await softDelete(deleteTarget.id); setDeleteTarget(null); } }}
        title="Excluir vinculação"
        message="Deseja excluir esta vinculação? O histórico de balanço associado deixará de ser recalculado."
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
