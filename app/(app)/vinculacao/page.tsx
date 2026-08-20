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
  Tabs,
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
  // Sprint 13 · Etapa 5 — parcela rica
  name: string | null;
  planted_area: number | null;
  variety_id: string | null;
  water_source: string | null;
  water_source_note: string | null;
  climate_config: string | null;
  rain_option: string | null;
  plant_spacing_m: number | null;
  row_spacing_m: number | null;
  additional_row_spacing_m: number | null;
  deficit_irrigation: boolean | null;
  stress_point_irrigation: boolean | null;
  initial_soil_moisture_pct: number | null;
  initial_moisture_is_cc: boolean | null;
  // Lifecycle
  status: "rascunho" | "ativa" | "encerrada" | "cancelada";
  closed_at: string | null;
  close_reason: string | null;
  close_note: string | null;
  yield_kg_ha: number | null;
  total_water_applied_mm: number | null;
  total_energy_kwh: number | null;
  total_cost: number | null;
}

interface PivotLite { id: string; name: string; efficiency: number; soil_id: string | null; pivot_type: string | null; flow_rate: number | null; area: number | null }
interface SeasonLite { id: string; name: string }
interface CultureLite { id: string; name: string; root_depth: number; depletion_factor: number }
interface SoilLite { id: string; name: string }
interface VarietyLite { id: string; culture_id: string; name: string }

interface FormState {
  // Identidade
  name: string;
  planted_area: string;
  // Vínculo original
  pivot_id: string;
  season_id: string;
  culture_id: string;
  culture_variety_id: string;
  soil_id: string;
  planting_date: string;
  emergence_date: string;
  expected_harvest_date: string;
  // Sprint 13 · manejo de irrigação
  water_source: string;
  water_source_note: string;
  climate_config: string;
  rain_option: string;
  plant_spacing_m: string;
  row_spacing_m: string;
  additional_row_spacing_m: string;
  deficit_irrigation: boolean;
  stress_point_irrigation: boolean;
  initial_soil_moisture_pct: string;
  initial_moisture_is_cc: boolean;
  // Parâmetros customizados legado
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: string;
  max_root_depth: string;
  irrigation_efficiency: string;
  depletion_factor: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  planted_area: "",
  pivot_id: "",
  season_id: "",
  culture_id: "",
  culture_variety_id: "",
  soil_id: "",
  planting_date: "",
  emergence_date: "",
  expected_harvest_date: "",
  water_source: "",
  water_source_note: "",
  climate_config: "farm_default",
  rain_option: "auto",
  plant_spacing_m: "",
  row_spacing_m: "",
  additional_row_spacing_m: "",
  deficit_irrigation: false,
  stress_point_irrigation: false,
  initial_soil_moisture_pct: "",
  initial_moisture_is_cc: true,
  parameter_mode: "padrao",
  initial_root_depth: "",
  max_root_depth: "",
  irrigation_efficiency: "",
  depletion_factor: "",
  notes: "",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function VinculacaoPage() {
  const { activeFarmId, farms } = useAuth();
  const activeFarm = useMemo(() => farms?.find((f) => f.id === activeFarmId) ?? null, [farms, activeFarmId]);
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

  // Sprint 13 · Etapa 5 — lifecycle da parcela
  const [activeSection, setActiveSection] = useState<"ativas" | "historico">("ativas");
  const [closeTarget, setCloseTarget] = useState<Assignment | null>(null);
  const [closeForm, setCloseForm] = useState({
    close_reason: "colheita",
    close_note: "",
    yield_kg_ha: "",
  });

  // Sprint 15 · reorganização do modal de parcela em 4 abas
  const [modalTab, setModalTab] = useState<"caract" | "manejo" | "geo" | "corp">("caract");
  const MODAL_TABS = [
    { id: "caract", label: "Características" },
    { id: "manejo", label: "Manejo de Irrigação" },
    { id: "geo", label: "Geolocalização" },
    { id: "corp", label: "Corporação" },
  ];

  useEffect(() => {
    if (!activeFarmId) {
      setLookupsLoading(false);
      return;
    }
    setLookupsLoading(true);
    (async () => {
      const [pv, ss, cu, so, va] = await Promise.all([
        supabase.from("pivots").select("id, name, efficiency, soil_id, pivot_type, flow_rate, area").eq("farm_id", activeFarmId).eq("active", true).order("name"),
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

  // Separa por status (Sprint 13 · Etapa 5)
  const parcelasAtivas = useMemo(
    () => farmAssignments.filter((a) => (a.status ?? "ativa") === "ativa"),
    [farmAssignments],
  );
  const parcelasHistorico = useMemo(
    () => farmAssignments.filter((a) => a.status === "encerrada" || a.status === "cancelada"),
    [farmAssignments],
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
    setModalTab("caract");
    setModalOpen(true);
  };

  const openEdit = (a: Assignment) => {
    setEditing(a);
    setForm({
      name: a.name ?? "",
      planted_area: a.planted_area != null ? String(a.planted_area) : "",
      pivot_id: a.pivot_id,
      season_id: a.season_id,
      culture_id: a.culture_id,
      culture_variety_id: a.culture_variety_id ?? a.variety_id ?? "",
      soil_id: a.soil_id,
      planting_date: a.planting_date ?? "",
      emergence_date: a.emergence_date ?? "",
      expected_harvest_date: a.expected_harvest_date ?? "",
      water_source: a.water_source ?? "",
      water_source_note: a.water_source_note ?? "",
      climate_config: a.climate_config ?? "farm_default",
      rain_option: a.rain_option ?? "auto",
      plant_spacing_m: a.plant_spacing_m != null ? String(a.plant_spacing_m) : "",
      row_spacing_m: a.row_spacing_m != null ? String(a.row_spacing_m) : "",
      additional_row_spacing_m: a.additional_row_spacing_m != null ? String(a.additional_row_spacing_m) : "",
      deficit_irrigation: a.deficit_irrigation ?? false,
      stress_point_irrigation: a.stress_point_irrigation ?? false,
      initial_soil_moisture_pct: a.initial_soil_moisture_pct != null ? String(a.initial_soil_moisture_pct) : "",
      initial_moisture_is_cc: a.initial_moisture_is_cc ?? true,
      parameter_mode: a.parameter_mode,
      initial_root_depth: a.initial_root_depth != null ? String(a.initial_root_depth) : "",
      max_root_depth: a.max_root_depth != null ? String(a.max_root_depth) : "",
      irrigation_efficiency: a.irrigation_efficiency != null ? String(Math.round(a.irrigation_efficiency * 100)) : "",
      depletion_factor: a.depletion_factor != null ? String(a.depletion_factor) : "",
      notes: a.notes ?? "",
    });
    setFormError("");
    setModalTab("caract");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const openClose = (a: Assignment) => {
    setCloseTarget(a);
    setCloseForm({ close_reason: "colheita", close_note: "", yield_kg_ha: "" });
  };

  const handleCloseParcela = async () => {
    if (!closeTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("pivot_crop_assignments")
        .update({
          status: "encerrada",
          closed_at: new Date().toISOString(),
          close_reason: closeForm.close_reason,
          close_note: closeForm.close_note || null,
          yield_kg_ha: closeForm.yield_kg_ha ? Number(closeForm.yield_kg_ha) : null,
        })
        .eq("id", closeTarget.id);
      if (error) throw new Error(error.message);
      setCloseTarget(null);
      // useCrud não observa mudanças de status; força refetch simples via reload
      location.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao encerrar parcela");
    }
    setSaving(false);
  };

  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  // Sprint 14 · Etapa 4 — quando escolhe o pivô, herda o solo dele.
  // Solo deixa de ser campo editável da parcela.
  const handlePivotChange = (pivot_id: string) => {
    const pivot = pivots.find((p) => p.id === pivot_id);
    patch({
      pivot_id,
      soil_id: pivot?.soil_id ?? "",
    });
  };

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
    // Sprint 14 · Etapa 4 — solo herdado do pivô, não é mais obrigatório
    // pela UI. Se o pivô não tem solo cadastrado, avisa para editar o pivô.
    if (!form.soil_id) {
      return "O pivô selecionado não tem solo cadastrado. Edite o pivô em Cadastros → Pivôs e associe um solo.";
    }
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
    const num = (v: string) => v ? Number(v) : null;
    const payload = {
      // Identidade da parcela (Sprint 13)
      name: form.name || null,
      planted_area: num(form.planted_area),
      // Vínculo
      pivot_id: form.pivot_id,
      season_id: form.season_id,
      culture_id: form.culture_id,
      culture_variety_id: form.culture_variety_id || null,
      variety_id: form.culture_variety_id || null,  // duplica no campo novo
      soil_id: form.soil_id,
      planting_date: form.planting_date,
      emergence_date: form.emergence_date || null,
      expected_harvest_date: form.expected_harvest_date || null,
      // Água + clima
      water_source: form.water_source || null,
      water_source_note: form.water_source_note || null,
      climate_config: form.climate_config,
      rain_option: form.rain_option,
      // Espaçamento
      plant_spacing_m: num(form.plant_spacing_m),
      row_spacing_m: num(form.row_spacing_m),
      additional_row_spacing_m: num(form.additional_row_spacing_m),
      // Manejo
      deficit_irrigation: form.deficit_irrigation,
      stress_point_irrigation: form.stress_point_irrigation,
      initial_soil_moisture_pct: num(form.initial_soil_moisture_pct),
      initial_moisture_is_cc: form.initial_moisture_is_cc,
      // Legado
      parameter_mode: form.parameter_mode,
      initial_root_depth: custom && form.initial_root_depth ? Number(form.initial_root_depth) : null,
      max_root_depth: custom && form.max_root_depth ? Number(form.max_root_depth) : null,
      irrigation_efficiency: custom && form.irrigation_efficiency ? Number(form.irrigation_efficiency) / 100 : null,
      depletion_factor: custom && form.depletion_factor ? Number(form.depletion_factor) : null,
      notes: form.notes || null,
      // Lifecycle — se novo, cria como ativa; edição não altera status
      ...(editing ? {} : { status: "ativa" as const }),
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

  const activeColumns: Column<Assignment>[] = [
    {
      header: "Parcela",
      render: (r) => (
        <div>
          <span className="font-medium">{r.name || pivotMap.get(r.pivot_id) || "—"}</span>
          <span className="block text-xs text-gray-400 dark:text-gray-500">{pivotMap.get(r.pivot_id) ?? "—"}</span>
        </div>
      ),
    },
    { header: "Safra", render: (r) => seasonMap.get(r.season_id) ?? "—" },
    {
      header: "Cultura",
      render: (r) => (
        <div>
          <span>{cultureMap.get(r.culture_id)?.name ?? "—"}</span>
          {(r.culture_variety_id ?? r.variety_id) && (
            <span className="block text-xs text-gray-400 dark:text-gray-500">
              {varietyMap.get(r.culture_variety_id ?? r.variety_id ?? "") ?? ""}
            </span>
          )}
        </div>
      ),
    },
    { header: "Solo", render: (r) => soilMap.get(r.soil_id) ?? "—" },
    {
      header: "Área (ha)",
      render: (r) => r.planted_area != null ? r.planted_area.toLocaleString("pt-BR") : "—",
      align: "right",
    },
    { header: "Plantio", render: (r) => r.planting_date ? new Date(r.planting_date + "T12:00:00").toLocaleDateString("pt-BR") : "—" },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => openClose(r)}>Encerrar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
        </div>
      ),
    },
  ];

  const historicColumns: Column<Assignment>[] = [
    {
      header: "Parcela",
      render: (r) => (
        <div>
          <span className="font-medium">{r.name || pivotMap.get(r.pivot_id) || "—"}</span>
          <span className="block text-xs text-gray-400 dark:text-gray-500">{pivotMap.get(r.pivot_id) ?? "—"}</span>
        </div>
      ),
    },
    { header: "Safra", render: (r) => seasonMap.get(r.season_id) ?? "—" },
    { header: "Cultura", render: (r) => cultureMap.get(r.culture_id)?.name ?? "—" },
    {
      header: "Período",
      render: (r) => {
        const start = r.planting_date ? new Date(r.planting_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
        const end = r.closed_at ? new Date(r.closed_at).toLocaleDateString("pt-BR") : "—";
        return <span className="text-xs">{start} → {end}</span>;
      },
    },
    {
      header: "Área",
      render: (r) => r.planted_area != null ? `${r.planted_area.toLocaleString("pt-BR")} ha` : "—",
      align: "right",
    },
    {
      header: "Motivo",
      render: (r) => {
        const labels: Record<string, string> = {
          colheita: "Colheita",
          falha_lavoura: "Falha da lavoura",
          clima_adverso: "Clima adverso",
          decisao_gerencial: "Decisão gerencial",
          outro: "Outro",
        };
        return labels[r.close_reason ?? ""] ?? "—";
      },
    },
    {
      header: "Yield (kg/ha)",
      render: (r) => r.yield_kg_ha != null ? r.yield_kg_ha.toLocaleString("pt-BR") : "—",
      align: "right",
    },
    {
      header: "Água total",
      render: (r) => r.total_water_applied_mm != null ? `${r.total_water_applied_mm.toFixed(0)} mm` : "—",
      align: "right",
    },
  ];

  // ── Prerequisite guards (Fase 1.2 pattern) ──────────────────────────────

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader titulo="Parcelas" descricao="Cadastro operacional de parcelas (pivô + cultura + solo). Encerre ao colher para gerar histórico da safra." />
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
            ? { title: "Cadastre um solo primeiro", description: "O solo define a capacidade de água disponível. A partir da Sprint 14, o solo é vinculado ao pivô (equipamento) e todas as parcelas dele herdam.", actionLabel: "Ir para Solos", actionHref: "/solos" }
            : null
    : null;

  if (prerequisite) {
    return (
      <div className="space-y-8">
        <PageHeader titulo="Parcelas" descricao="Cadastro operacional de parcelas (pivô + cultura + solo). Encerre ao colher para gerar histórico da safra." />
        <PrerequisiteNotice {...prerequisite} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader titulo="Vinculação Operacional" descricao="Vincule pivô, safra, cultura e solo para habilitar o balanço hídrico" />

      {/* Tabs Ativas / Histórico */}
      <div className="flex gap-2 border-b border-gray-100 dark:border-white/[0.06]">
        <button
          onClick={() => setActiveSection("ativas")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeSection === "ativas"
              ? "border-brand-500 text-brand-700 dark:text-brand-400"
              : "border-transparent text-graphite-400 hover:text-graphite-700 dark:text-gray-500 dark:hover:text-gray-300"
          }`}
        >
          Ativas <span className="ml-1 text-xs">({parcelasAtivas.length})</span>
        </button>
        <button
          onClick={() => setActiveSection("historico")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeSection === "historico"
              ? "border-brand-500 text-brand-700 dark:text-brand-400"
              : "border-transparent text-graphite-400 hover:text-graphite-700 dark:text-gray-500 dark:hover:text-gray-300"
          }`}
        >
          Histórico <span className="ml-1 text-xs">({parcelasHistorico.length})</span>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-graphite-400 dark:text-gray-500">
          {activeSection === "ativas"
            ? `${parcelasAtivas.length} parcela${parcelasAtivas.length !== 1 ? "s" : ""} ativa${parcelasAtivas.length !== 1 ? "s" : ""}`
            : `${parcelasHistorico.length} parcela${parcelasHistorico.length !== 1 ? "s" : ""} no histórico`}
        </p>
        {activeSection === "ativas" && (
          <Button onClick={openNew}>Nova parcela</Button>
        )}
      </div>

      <Card>
        {loading || lookupsLoading ? (
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
        ) : activeSection === "ativas" ? (
          parcelasAtivas.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
              Nenhuma parcela ativa. Crie a primeira para habilitar o balanço hídrico dos pivôs.
            </p>
          ) : (
            <Table columns={activeColumns} data={parcelasAtivas} getKey={(r) => r.id} />
          )
        ) : (
          parcelasHistorico.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
              Nenhuma parcela encerrada ainda. Ao colher uma safra, encerre a parcela para gerar o histórico.
            </p>
          ) : (
            <Table columns={historicColumns} data={parcelasHistorico} getKey={(r) => r.id} />
          )
        )}
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar parcela" : "Nova parcela"} size="xl">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Nome sempre no topo, largura total */}
          <div>
            <Input
              id="parcel_name"
              label="Nome da parcela"
              placeholder="Ex.: Pivô 05 · Algodão 2025/26 (opcional — gera automático se vazio)"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>

          <Tabs tabs={MODAL_TABS} activeTab={modalTab} onChange={(t) => setModalTab(t as typeof modalTab)} />

          {/* ═══════════════════════════════════════════════════════════════
              ABA 1 · CARACTERÍSTICAS
              ═══════════════════════════════════════════════════════════════ */}
          <div className={modalTab === "caract" ? "" : "hidden"}>
            {/* Linha superior: 4 colunas compactas */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                id="planting_date" label="Data do plantio" type="date" required
                value={form.planting_date}
                onChange={(e) => patch({ planting_date: e.target.value })}
              />
              <Input
                id="planted_area" label="Área plantada (ha)" type="number" step="0.1" min="0"
                value={form.planted_area}
                onChange={(e) => patch({ planted_area: e.target.value })}
                placeholder="Se diferente do pivô"
              />
              <Select
                id="climate_config" label="Fonte de clima"
                value={form.climate_config}
                onChange={(e) => patch({ climate_config: e.target.value })}
                options={[
                  { value: "farm_default", label: "Padrão da fazenda" },
                  { value: "virtual_station", label: "Estação virtual" },
                  { value: "nearest_station", label: "Estação próxima" },
                  { value: "manual", label: "Registros manuais" },
                ]}
              />
              <Select
                id="rain_option" label="Opções de chuva"
                value={form.rain_option}
                onChange={(e) => patch({ rain_option: e.target.value })}
                options={[
                  { value: "auto", label: "Automática (provedor)" },
                  { value: "manual", label: "Manual" },
                  { value: "pluviometer", label: "Pluviômetro" },
                  { value: "ignore", label: "Ignorar chuva" },
                ]}
              />
            </div>

            {/* 2 colunas: Equipamento à esquerda, Solo & Água + Espaçamento + CC à direita */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {/* ── LEFT ── Equipamento ── */}
              <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
                <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                  Equipamento
                </legend>
                {(() => {
                  const p = pivots.find((x) => x.id === form.pivot_id);
                  const tipoLabel = p?.pivot_type
                    ? p.pivot_type === "central" ? "Pivô Central"
                      : p.pivot_type === "linear" ? "Linear"
                      : p.pivot_type === "rebocavel" ? "Rebocável"
                      : p.pivot_type
                    : null;
                  return (
                    <div className="space-y-4">
                      <ReadOnlyField
                        label="Tipo do equipamento"
                        value={tipoLabel}
                        hint="Vem do cadastro do pivô"
                      />
                      <Select
                        id="pivot_id" label="Equipamento" required
                        value={form.pivot_id}
                        onChange={(e) => handlePivotChange(e.target.value)}
                        options={[{ value: "", label: "— selecione —" }, ...pivots.map((pv) => ({ value: pv.id, label: pv.name }))]}
                      />
                      <ReadOnlyField
                        label="Setor"
                        value={null}
                        hint="Reservado — para pivôs setorizados (futuro)"
                      />
                      <ReadOnlyField
                        label="Espaçamento entre emissores (m)"
                        value={null}
                        hint="Aplicável a irrigação localizada. Editar no cadastro do pivô."
                      />
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-graphite-600 dark:text-gray-400">
                          Espaçamento entre linhas laterais (m)
                        </label>
                        <div className="flex items-center gap-2">
                          <ReadOnlyField label="" value={null} />
                          <span className="text-graphite-400">×</span>
                          <ReadOnlyField label="" value={null} />
                        </div>
                        <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">
                          Aplicável a irrigação localizada. Editar no cadastro do pivô.
                        </p>
                      </div>
                      <ReadOnlyField
                        label="Porcentagem de área molhada (%)"
                        value={null}
                        hint="Vem do cadastro do pivô. Pivô central = 100%."
                      />
                      <div className="grid gap-3 sm:grid-cols-2 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
                        <ReadOnlyField
                          label="Vazão nominal"
                          value={p?.flow_rate != null ? `${p.flow_rate.toLocaleString("pt-BR")} m³/h` : null}
                        />
                        <ReadOnlyField
                          label="Área do pivô"
                          value={p?.area != null ? `${p.area.toLocaleString("pt-BR")} ha` : null}
                        />
                      </div>
                      <p className="text-[11px] text-graphite-400 dark:text-gray-500">
                        Dados técnicos completos em <a href="/pivos" className="text-brand-600 hover:underline dark:text-brand-400">Cadastros → Pivôs</a>
                      </p>
                    </div>
                  );
                })()}
              </fieldset>

              {/* ── RIGHT ── 3 sub-cards ── */}
              <div className="space-y-5">
                {/* Solo & Água */}
                <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
                  <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                    Solo &amp; Água
                  </legend>
                  <div className="space-y-4">
                    {/* Solo herdado */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-graphite-600 dark:text-gray-400">
                        Solo (herdado do pivô)
                      </label>
                      <div className="flex h-10 items-center rounded-lg border border-dashed border-brand-200 bg-brand-50/40 px-3 text-sm dark:border-brand-800/40 dark:bg-brand-900/10">
                        {form.soil_id
                          ? <span className="font-medium text-graphite-900 dark:text-white">{soilMap.get(form.soil_id) ?? form.soil_id}</span>
                          : form.pivot_id
                            ? <span className="text-amber-700 dark:text-amber-400">⚠ Pivô sem solo — <a href="/pivos" className="underline">cadastre em Pivôs</a></span>
                            : <span className="text-graphite-400 dark:text-gray-500">Selecione um pivô primeiro</span>
                        }
                      </div>
                      <input type="hidden" name="soil_id" value={form.soil_id} />
                    </div>
                    <Select
                      id="water_source" label="Fonte de água"
                      value={form.water_source}
                      onChange={(e) => patch({ water_source: e.target.value })}
                      options={[
                        { value: "", label: "Não especificada" },
                        { value: "rio", label: "Rio" },
                        { value: "poco", label: "Poço" },
                        { value: "reservatorio", label: "Reservatório" },
                        { value: "canal", label: "Canal" },
                        { value: "outorga", label: "Outorga" },
                        { value: "misto", label: "Misto" },
                        { value: "outro", label: "Outro" },
                      ]}
                    />
                  </div>
                </fieldset>

                {/* Espaçamento da cultura */}
                <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
                  <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                    Espaçamento da cultura
                  </legend>
                  <div className="flex items-end gap-2">
                    <Input
                      id="plant_spacing_m" label="Entre plantas (m)" type="number" step="0.01" min="0"
                      value={form.plant_spacing_m}
                      onChange={(e) => patch({ plant_spacing_m: e.target.value })}
                    />
                    <span className="mb-2 pb-1 text-graphite-400">×</span>
                    <Input
                      id="row_spacing_m" label="Entre linhas (m)" type="number" step="0.01" min="0"
                      value={form.row_spacing_m}
                      onChange={(e) => patch({ row_spacing_m: e.target.value })}
                    />
                    <span className="mb-2 pb-1 text-graphite-400">×</span>
                    <Input
                      id="additional_row_spacing_m" label="Linha adicional (m)" type="number" step="0.01" min="0"
                      value={form.additional_row_spacing_m}
                      onChange={(e) => patch({ additional_row_spacing_m: e.target.value })}
                    />
                  </div>
                </fieldset>

                {/* CC após excesso — placeholder pra flow futuro */}
                <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
                  <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                    Capacidade de campo após excesso
                  </legend>
                  <p className="mb-3 text-xs text-graphite-500 dark:text-gray-400">
                    Reinicializa o CC depois de eventos de chuva/irrigação excessivos (quando a lâmina supera a capacidade de retenção).
                  </p>
                  <Button variant="secondary" type="button" onClick={() => setFormError("Cadastro de excesso disponível em breve.")}>
                    Cadastrar excesso →
                  </Button>
                </fieldset>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              ABA 2 · MANEJO DE IRRIGAÇÃO
              ═══════════════════════════════════════════════════════════════ */}
          <div className={modalTab === "manejo" ? "space-y-5" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-3">
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
                id="season_id" label="Safra" required
                value={form.season_id}
                onChange={(e) => patch({ season_id: e.target.value })}
                options={seasons.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>

            <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
              <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                Datas do manejo
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
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
                <div className="flex items-end pb-2">
                  <p className="text-[11px] text-graphite-500 dark:text-gray-400">
                    Data do plantio na aba <b>Características</b>. Fase corrente é derivada automaticamente pelas fases fenológicas da cultura.
                  </p>
                </div>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
              <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                Estratégia de irrigação
              </legend>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.deficit_irrigation}
                    onChange={(e) => patch({ deficit_irrigation: e.target.checked })}
                    className="h-4 w-4 accent-brand-500"
                  />
                  Irrigação com déficit
                  <span className="text-xs text-graphite-400 dark:text-gray-500">(ITN &lt; 100% em fases não-críticas)</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.stress_point_irrigation}
                    onChange={(e) => patch({ stress_point_irrigation: e.target.checked })}
                    className="h-4 w-4 accent-brand-500"
                  />
                  Irrigar no ponto de estresse
                  <span className="text-xs text-graphite-400 dark:text-gray-500">(só ao atingir p × ADT)</span>
                </label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  id="initial_soil_moisture_pct" label="Umidade inicial do solo (%)" type="number" step="0.1" min="0" max="100"
                  value={form.initial_soil_moisture_pct}
                  onChange={(e) => patch({ initial_soil_moisture_pct: e.target.value })}
                  disabled={form.initial_moisture_is_cc}
                  placeholder={form.initial_moisture_is_cc ? "Solo em CC" : ""}
                />
                <label className="flex items-end gap-2 pb-2.5 text-sm text-graphite-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.initial_moisture_is_cc}
                    onChange={(e) => patch({ initial_moisture_is_cc: e.target.checked })}
                    className="h-4 w-4 accent-brand-500"
                  />
                  Solo em CC no início do manejo
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-gray-100 p-5 dark:border-white/[0.06]">
              <legend className="px-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                Parâmetros de manejo
              </legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio" name="parameter_mode" value="padrao"
                    checked={form.parameter_mode === "padrao"}
                    onChange={() => handleModeChange("padrao")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  Padrão da cultura
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio" name="parameter_mode" value="personalizado"
                    checked={form.parameter_mode === "personalizado"}
                    onChange={() => handleModeChange("personalizado")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  Personalizado para esta parcela
                </label>
              </div>

              {form.parameter_mode === "padrao" ? (
                <p className="mt-3 text-xs text-graphite-400 dark:text-gray-500">
                  Kc, fator p, profundidade radicular, Ks e Kl serão carregados automaticamente do cadastro da cultura. O crescimento radicular usa a fase fenológica e o DAE.
                </p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input
                    id="initial_root_depth" label="Prof. inicial raiz (m)" type="number" step="0.01" min="0"
                    value={form.initial_root_depth}
                    onChange={(e) => patch({ initial_root_depth: e.target.value })}
                    placeholder="0.10"
                  />
                  <Input
                    id="max_root_depth" label="Prof. máxima raiz (m)" type="number" step="0.01" min="0"
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
                  <p className="text-xs text-graphite-400 dark:text-gray-500 sm:col-span-2">
                    Estes valores substituem os do cadastro da cultura apenas nesta parcela.
                  </p>
                </div>
              )}
            </fieldset>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              ABA 3 · GEOLOCALIZAÇÃO
              ═══════════════════════════════════════════════════════════════ */}
          <div className={modalTab === "geo" ? "" : "hidden"}>
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-white/[0.08]">
              <p className="text-sm font-medium text-graphite-700 dark:text-gray-300">
                Coordenadas herdadas do pivô
              </p>
              <p className="mt-2 text-xs text-graphite-500 dark:text-gray-400">
                A parcela usa o centro geográfico do pivô. Para editar coordenadas, vá em <a href="/pivos" className="text-brand-600 hover:underline dark:text-brand-400">Cadastros → Pivôs → Localização</a>.
              </p>
              <p className="mt-4 text-[11px] text-graphite-400 dark:text-gray-500">
                Contornos de talhão específicos por parcela virão em sprint futuro.
              </p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              ABA 4 · CORPORAÇÃO
              ═══════════════════════════════════════════════════════════════ */}
          <div className={modalTab === "corp" ? "space-y-5" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField
                label="Fazenda"
                value={activeFarmId ? "Fazenda ativa (selecionada no cabeçalho)" : null}
                hint="Selecionada no cabeçalho da plataforma"
              />
              <ReadOnlyField
                label="Módulo produtivo"
                value={null}
                hint="Herdado do cadastro do pivô"
              />
            </div>
            <TextArea
              id="notes" label="Observações da parcela"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Ex.: talhão pequeno, borda molhada por linha lateral vizinha, safra experimental"
            />
            <TextArea
              id="water_source_note" label="Observações da fonte de água"
              value={form.water_source_note}
              onChange={(e) => patch({ water_source_note: e.target.value })}
              placeholder="Ex.: outorga vencendo em 03/2027; rio compartilhado com Sr. José"
            />
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {formError}
            </p>
          )}

          {/* Rodapé — navegação entre abas + salvar */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-white/[0.06]">
            <div className="flex gap-2">
              {modalTab !== "caract" && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    const i = MODAL_TABS.findIndex((t) => t.id === modalTab);
                    if (i > 0) setModalTab(MODAL_TABS[i - 1].id as typeof modalTab);
                  }}
                >
                  ← Anterior
                </Button>
              )}
              {modalTab !== "corp" && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    const i = MODAL_TABS.findIndex((t) => t.id === modalTab);
                    if (i < MODAL_TABS.length - 1) setModalTab(MODAL_TABS[i + 1].id as typeof modalTab);
                  }}
                >
                  Próximo →
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" type="button" onClick={closeModal}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar parcela"}</Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) { await softDelete(deleteTarget.id); setDeleteTarget(null); } }}
        title="Excluir parcela"
        message="Deseja excluir esta parcela? O histórico de balanço associado deixará de ser recalculado. Se a safra já colheu, prefira encerrar em vez de excluir."
        confirmLabel="Excluir"
        loading={saving}
      />

      {/* Modal — Encerrar Parcela (Sprint 13 · Etapa 5) */}
      <Modal
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title={`Encerrar parcela · ${closeTarget?.name || pivotMap.get(closeTarget?.pivot_id ?? "") || ""}`}
        size="md"
      >
        <div className="space-y-5">
          <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50/60 p-4 dark:border-amber-500/60 dark:bg-amber-900/10">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Ao encerrar, esta parcela sai da lista de <b>Ativas</b> e vai para o <b>Histórico</b>. O balanço hídrico para de ser calculado. Esta ação pode ser revertida editando o status no banco.
            </p>
          </div>

          <div className="grid gap-4">
            <Select
              id="close_reason" label="Motivo do encerramento" required
              value={closeForm.close_reason}
              onChange={(e) => setCloseForm((f) => ({ ...f, close_reason: e.target.value }))}
              options={[
                { value: "colheita", label: "Colheita" },
                { value: "falha_lavoura", label: "Falha da lavoura" },
                { value: "clima_adverso", label: "Clima adverso" },
                { value: "decisao_gerencial", label: "Decisão gerencial" },
                { value: "outro", label: "Outro" },
              ]}
            />
            <Input
              id="yield_kg_ha" label="Produtividade final (kg/ha) — opcional" type="number" step="1" min="0"
              value={closeForm.yield_kg_ha}
              onChange={(e) => setCloseForm((f) => ({ ...f, yield_kg_ha: e.target.value }))}
              placeholder="Ex: 4800 (algodão em pluma)"
            />
            <TextArea
              id="close_note" label="Observações do fechamento"
              value={closeForm.close_note}
              onChange={(e) => setCloseForm((f) => ({ ...f, close_note: e.target.value }))}
              placeholder="Ex: colheita antecipada por chuva, safra abaixo do esperado, etc."
            />
          </div>

          {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setCloseTarget(null)}>Cancelar</Button>
            <Button type="button" onClick={handleCloseParcela} disabled={saving}>
              {saving ? "Encerrando..." : "Encerrar parcela"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── ReadOnlyField — display de valor herdado (Sprint 15) ─────────────────

function ReadOnlyField({
  label, value, hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-graphite-600 dark:text-gray-400">
        {label}
      </label>
      <div className="flex h-10 items-center rounded-lg border border-dashed border-brand-200 bg-brand-50/40 px-3 text-sm dark:border-brand-800/40 dark:bg-brand-900/10">
        {value
          ? <span className="font-medium text-graphite-900 dark:text-white">{value}</span>
          : <span className="text-graphite-400 dark:text-gray-500">—</span>
        }
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">{hint}</p>
      )}
    </div>
  );
}
