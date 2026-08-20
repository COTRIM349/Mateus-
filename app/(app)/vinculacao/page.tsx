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
  TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { PrerequisiteNotice } from "@/components/onboarding";
import { createClient } from "@/lib/supabase/client";
import { MATURITY_TYPES } from "@/constants/brazil";
import {
  buildParcelClosePayload,
  buildParcelInsertRow,
  isActiveParcel,
  isHistoricParcel,
  suggestParcelName,
  validateParcelCycle,
} from "@/modules/assignment/services";
import { identifyPhase } from "@/modules/culture/services";
import {
  daysAfterPlanting,
  validateManagementDates,
} from "@/modules/culture/services/culture-phases";

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
  kl_override: number | null;
  // Lifecycle
  status: "rascunho" | "ativa" | "encerrada" | "cancelada";
  closed_at: string | null;
  close_reason: string | null;
  close_note: string | null;
  yield_kg_ha: number | null;
  total_water_applied_mm: number | null;
  total_energy_kwh: number | null;
  total_cost: number | null;
  current_phase_id: string | null;
  management_start_date: string | null;
  management_end_date: string | null;
}

interface PivotLite {
  id: string;
  name: string;
  efficiency: number;
  soil_id: string | null;
  area: number;
  module_id: string | null;
}
interface SeasonLite { id: string; name: string }
interface CultureLite { id: string; name: string; root_depth: number; depletion_factor: number; cycle_days: number }
interface SoilLite { id: string; name: string }
interface VarietyLite { id: string; culture_id: string; name: string; maturity: string | null }
interface ModuleLite { id: string; name: string }
interface PhaseLite {
  id: string;
  culture_id: string;
  name: string;
  phase_order: number;
  days_after_plant: number;
  duration_days: number;
  kc_start: number;
  kc_end: number;
  root_depth_start: number;
  root_depth_end: number;
  depletion_factor: number;
  phase_key: string | null;
}

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
  kl_override: string;
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
  current_phase_id: string;
  management_start_date: string;
  management_end_date: string;
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
  kl_override: "",
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
  current_phase_id: "",
  management_start_date: "",
  management_end_date: "",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function VinculacaoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const { data: assignments, loading, create, update, fetch: refetch } = useCrud<Assignment>({
    table: "pivot_crop_assignments",
    orderBy: "created_at",
    ascending: false,
  });

  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [seasons, setSeasons] = useState<SeasonLite[]>([]);
  const [cultures, setCultures] = useState<CultureLite[]>([]);
  const [soils, setSoils] = useState<SoilLite[]>([]);
  const [varieties, setVarieties] = useState<VarietyLite[]>([]);
  const [modules, setModules] = useState<ModuleLite[]>([]);
  const [culturePhases, setCulturePhases] = useState<PhaseLite[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formTab, setFormTab] = useState("caracteristicas");

  // Sprint 13 · Etapa 5 — lifecycle da parcela
  const [activeSection, setActiveSection] = useState<"ativas" | "historico">("ativas");
  const [closeTarget, setCloseTarget] = useState<Assignment | null>(null);
  const [closeForm, setCloseForm] = useState({
    close_reason: "colheita",
    close_note: "",
    yield_kg_ha: "",
  });

  useEffect(() => {
    if (!activeFarmId) {
      setLookupsLoading(false);
      return;
    }
    setLookupsLoading(true);
    (async () => {
      const [pv, ss, cu, so, va, mo] = await Promise.all([
        supabase.from("pivots").select("id, name, efficiency, soil_id, area, module_id").eq("farm_id", activeFarmId).eq("active", true).order("name"),
        supabase.from("seasons").select("id, name").eq("farm_id", activeFarmId).eq("active", true).order("start_date", { ascending: false }),
        supabase.from("cultures").select("id, name, root_depth, depletion_factor, cycle_days").eq("active", true).order("name"),
        supabase.from("soils").select("id, name").eq("farm_id", activeFarmId).eq("active", true).order("name"),
        supabase.from("culture_varieties").select("id, culture_id, name, maturity").eq("active", true).order("name"),
        supabase.from("production_modules").select("id, name").eq("farm_id", activeFarmId).eq("active", true).order("name"),
      ]);
      setPivots((pv.data ?? []) as PivotLite[]);
      setSeasons((ss.data ?? []) as SeasonLite[]);
      setCultures((cu.data ?? []) as CultureLite[]);
      setSoils((so.data ?? []) as SoilLite[]);
      setVarieties((va.data ?? []) as VarietyLite[]);
      setModules((mo.data ?? []) as ModuleLite[]);
      setLookupsLoading(false);
    })();
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (!form.culture_id) {
      setCulturePhases([]);
      return;
    }
    supabase
      .from("culture_phases")
      .select("id, culture_id, name, phase_order, days_after_plant, duration_days, kc_start, kc_end, root_depth_start, root_depth_end, depletion_factor, phase_key")
      .eq("culture_id", form.culture_id)
      .order("phase_order")
      .then(({ data }) => setCulturePhases((data ?? []) as PhaseLite[]));
  }, [form.culture_id, supabase]);

  const pivotIds = useMemo(() => new Set(pivots.map((p) => p.id)), [pivots]);
  const farmAssignments = useMemo(
    () => assignments.filter((a) => pivotIds.has(a.pivot_id)),
    [assignments, pivotIds],
  );

  // Separa por status (Sprint 13 · Etapa 5)
  const parcelasAtivas = useMemo(
    () => farmAssignments.filter((a) => isActiveParcel(a.status, a.active)),
    [farmAssignments],
  );
  const parcelasHistorico = useMemo(
    () => farmAssignments.filter((a) => isHistoricParcel(a.status, a.active)),
    [farmAssignments],
  );

  const pivotMap = useMemo(() => new Map(pivots.map((p) => [p.id, p.name])), [pivots]);
  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s.name])), [seasons]);
  const cultureMap = useMemo(() => new Map(cultures.map((c) => [c.id, c])), [cultures]);
  const soilMap = useMemo(() => new Map(soils.map((s) => [s.id, s.name])), [soils]);
  const varietyMap = useMemo(() => new Map(varieties.map((v) => [v.id, v.name])), [varieties]);

  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m.name])), [modules]);
  const selectedPivot = pivots.find((p) => p.id === form.pivot_id);
  const selectedModuleName = selectedPivot?.module_id ? moduleMap.get(selectedPivot.module_id) ?? "—" : "—";

  const maturityLabels = useMemo(
    () => Object.fromEntries(MATURITY_TYPES.map((m) => [m.value, m.label])),
    [],
  );
  const varietiesForCulture = useMemo(
    () => varieties.filter((v) => v.culture_id === form.culture_id),
    [varieties, form.culture_id],
  );

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormTab("caracteristicas");
    setModalOpen(true);
  };

  const openEdit = (a: Assignment) => {
    if (isHistoricParcel(a.status, a.active)) return;
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
      kl_override: a.kl_override != null ? String(a.kl_override) : "",
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
      current_phase_id: a.current_phase_id ?? "",
      management_start_date: a.management_start_date ?? "",
      management_end_date: a.management_end_date ?? "",
    });
    setFormError("");
    setFormTab("caracteristicas");
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
      const payload = buildParcelClosePayload({
        closeReason: closeForm.close_reason,
        closeNote: closeForm.close_note,
        yieldKgHa: closeForm.yield_kg_ha ? Number(closeForm.yield_kg_ha) : null,
      });
      const { error } = await supabase
        .from("pivot_crop_assignments")
        .update(payload)
        .eq("id", closeTarget.id);
      if (error) throw new Error(error.message);
      setCloseTarget(null);
      await refetch();
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
    const changes: Partial<FormState> = { culture_id, culture_variety_id: "", current_phase_id: "" };
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
    const pivot = pivots.find((p) => p.id === form.pivot_id);
    const num = (v: string) => (v ? Number(v) : null);
    const cycleError = validateParcelCycle({
      name: form.name || null,
      plantedArea: num(form.planted_area),
      pivotId: form.pivot_id,
      pivotArea: pivot?.area ?? 0,
      pivotSoilId: form.soil_id || pivot?.soil_id || null,
      seasonId: form.season_id,
      cultureId: form.culture_id,
      cultureVarietyId: form.culture_variety_id || null,
      plantingDate: form.planting_date,
      emergenceDate: form.emergence_date || null,
      expectedHarvestDate: form.expected_harvest_date || null,
      klOverride: num(form.kl_override),
      notes: form.notes || null,
      existingOnPivot: farmAssignments.map((a) => ({
        id: a.id,
        pivot_id: a.pivot_id,
        status: a.status,
        active: a.active,
      })),
      editingId: editing?.id ?? null,
    });
    if (cycleError) return cycleError;
    const mgmtError = validateManagementDates({
      plantingDate: form.planting_date,
      managementStart: form.management_start_date || null,
      managementEnd: form.management_end_date || null,
    });
    if (mgmtError) return mgmtError;
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
    const pivot = pivots.find((p) => p.id === form.pivot_id);
    const culture = cultureMap.get(form.culture_id);
    const seasonName = seasonMap.get(form.season_id) ?? "";
    const cycleRow = buildParcelInsertRow({
      name: form.name.trim() || suggestParcelName(pivot?.name ?? "", culture?.name ?? "", seasonName),
      plantedArea: num(form.planted_area),
      pivotId: form.pivot_id,
      pivotArea: pivot?.area ?? 0,
      pivotSoilId: form.soil_id || pivot?.soil_id || null,
      seasonId: form.season_id,
      cultureId: form.culture_id,
      cultureVarietyId: form.culture_variety_id || null,
      plantingDate: form.planting_date,
      emergenceDate: form.emergence_date || null,
      expectedHarvestDate: form.expected_harvest_date || null,
      klOverride: num(form.kl_override),
      notes: form.notes || null,
      existingOnPivot: [],
      editingId: editing?.id ?? null,
    });
    const payload = {
      ...cycleRow,
      ...(editing ? { status: undefined, active: undefined } : {}),
      water_source: form.water_source || null,
      water_source_note: form.water_source_note || null,
      climate_config: form.climate_config,
      rain_option: form.rain_option,
      plant_spacing_m: num(form.plant_spacing_m),
      row_spacing_m: num(form.row_spacing_m),
      additional_row_spacing_m: num(form.additional_row_spacing_m),
      deficit_irrigation: form.deficit_irrigation,
      stress_point_irrigation: form.stress_point_irrigation,
      initial_soil_moisture_pct: num(form.initial_soil_moisture_pct),
      initial_moisture_is_cc: form.initial_moisture_is_cc,
      parameter_mode: form.parameter_mode,
      initial_root_depth: custom && form.initial_root_depth ? Number(form.initial_root_depth) : null,
      max_root_depth: custom && form.max_root_depth ? Number(form.max_root_depth) : null,
      irrigation_efficiency: custom && form.irrigation_efficiency ? Number(form.irrigation_efficiency) / 100 : null,
      depletion_factor: custom && form.depletion_factor ? Number(form.depletion_factor) : null,
      current_phase_id: form.current_phase_id || null,
      management_start_date: form.management_start_date || null,
      management_end_date: form.management_end_date || null,
    };
    const persist = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    try {
      if (editing) {
        await update(editing.id, persist as Partial<Assignment>);
      } else {
        await create(persist as Omit<Assignment, "id" | "created_at" | "updated_at">);
      }
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      if (/duplicate|unique|23505/i.test(msg)) {
        setFormError("Já existe parcela ativa neste pivô. Encerre o ciclo atual para abrir um novo.");
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
        <PageHeader titulo="Parcelas" descricao="Ciclo agronômico no pivô (cultura, plantio, safra). Nova cultura = nova parcela. Encerrar preserva o histórico." />
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
        <PageHeader titulo="Parcelas" descricao="Ciclo agronômico no pivô (cultura, plantio, safra). Nova cultura = nova parcela. Encerrar preserva o histórico." />
        <PrerequisiteNotice {...prerequisite} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader titulo="Parcelas" descricao="Ciclo agronômico no pivô. Nova cultura = novo ciclo. O equipamento e o solo permanecem; o histórico não se apaga." />

      <Tabs
        tabs={[
          { id: "ativas", label: `Ativas (${parcelasAtivas.length})` },
          { id: "historico", label: `Histórico (${parcelasHistorico.length})` },
        ]}
        activeTab={activeSection}
        onChange={(id) => setActiveSection(id as "ativas" | "historico")}
      />

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
              Nenhuma parcela ativa. Abra o primeiro ciclo neste pivô. Depois de encerrar, crie outra parcela para a próxima cultura.
            </p>
          ) : (
            <Table columns={activeColumns} data={parcelasAtivas} getKey={(r) => r.id} />
          )
        ) : (
          parcelasHistorico.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
              Nenhuma parcela no histórico. Encerrar o ciclo (colheita) move a parcela para cá — o registro não é apagado nem reutilizado.
            </p>
          ) : (
            <Table columns={historicColumns} data={parcelasHistorico} getKey={(r) => r.id} />
          )
        )}
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar parcela" : "Nova parcela"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Tabs
            tabs={[
              { id: "caracteristicas", label: "Características" },
              { id: "cultura", label: "Cultura" },
              { id: "manejo", label: "Manejo" },
            ]}
            activeTab={formTab}
            onChange={setFormTab}
          />

          {formTab === "caracteristicas" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="parcel_name" label="Nome da parcela" placeholder="Ex: Pivô 31 · Soja · 2026/27"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <Input
                  id="planted_area" label="Área da parcela (ha)" type="number" step="0.1" min="0"
                  value={form.planted_area}
                  onChange={(e) => patch({ planted_area: e.target.value })}
                  placeholder={selectedPivot ? `Máx. ${selectedPivot.area} ha (pivô)` : "≤ área do pivô"}
                />
                <Select
                  id="pivot_id" label="Pivô" required
                  value={form.pivot_id}
                  onChange={(e) => handlePivotChange(e.target.value)}
                  options={pivots.map((p) => ({ value: p.id, label: p.name }))}
                />
                <Select
                  id="season_id" label="Safra" required
                  value={form.season_id}
                  onChange={(e) => patch({ season_id: e.target.value })}
                  options={seasons.map((s) => ({ value: s.id, label: s.name }))}
                />
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">Módulo</label>
                  <div className="flex h-10 items-center rounded-xl border border-gray-200 px-4 text-sm text-graphite-700 dark:border-white/[0.08] dark:text-gray-300">
                    {form.pivot_id ? selectedModuleName : "Selecione o pivô"}
                  </div>
                </div>
                <Input
                  id="planting_date" label="Data de plantio" type="date" required
                  value={form.planting_date}
                  onChange={(e) => patch({ planting_date: e.target.value })}
                />
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
                    Perfil de solo (do pivô)
                  </label>
                  <div className="flex h-10 items-center rounded-lg border border-dashed border-brand-200 bg-brand-50/40 px-3 text-sm dark:border-brand-800/40 dark:bg-brand-900/10">
                    {form.soil_id
                      ? <span className="font-medium text-graphite-900 dark:text-white">{soilMap.get(form.soil_id) ?? form.soil_id}</span>
                      : form.pivot_id
                        ? <span className="text-amber-700 dark:text-amber-400">Pivô sem solo — <a href="/solos" className="underline">associe em Solos</a></span>
                        : <span className="text-graphite-400 dark:text-gray-500">Selecione um pivô primeiro</span>}
                  </div>
                  <input type="hidden" name="soil_id" value={form.soil_id} />
                </div>
                <Input
                  id="kl_override" label="KL (0–1, vazio = 1)" type="number" step="0.01" min="0" max="1"
                  value={form.kl_override}
                  onChange={(e) => patch({ kl_override: e.target.value })}
                  placeholder="1.00"
                />
              </div>
              <TextArea
                id="notes" label="Observações"
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
              <p className="text-[11px] text-graphite-400 dark:text-gray-500">
                Solo e ficha técnica pertencem ao pivô. KL vazio assume 1 (pivô central). Nova cultura neste equipamento exige encerrar este ciclo e abrir outra parcela.
              </p>
            </div>
          )}

          {formTab === "cultura" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="culture_id" label="Cultura" required
                value={form.culture_id}
                onChange={(e) => handleCultureChange(e.target.value)}
                options={cultures.map((c) => ({ value: c.id, label: `${c.name} (${c.cycle_days}d)` }))}
              />
              <Select
                id="culture_variety_id" label="Cultivar (opcional)"
                value={form.culture_variety_id}
                onChange={(e) => patch({ culture_variety_id: e.target.value })}
                options={varietiesForCulture.map((v) => ({
                  value: v.id,
                  label: v.maturity ? `${v.name} · ${maturityLabels[v.maturity] ?? v.maturity}` : v.name,
                }))}
                disabled={!form.culture_id}
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
              <Input
                id="management_start_date" label="Início do manejo" type="date"
                value={form.management_start_date}
                onChange={(e) => patch({ management_start_date: e.target.value })}
              />
              <Input
                id="management_end_date" label="Fim do manejo (opcional)" type="date"
                value={form.management_end_date}
                onChange={(e) => patch({ management_end_date: e.target.value })}
              />
              <Select
                id="current_phase_id" label="Estádio fenológico"
                value={form.current_phase_id}
                onChange={(e) => patch({ current_phase_id: e.target.value })}
                options={[
                  { value: "", label: "Automático (pelo DAP)" },
                  ...culturePhases.map((p) => ({
                    value: p.id,
                    label: `${p.phase_order}. ${p.name} (DAP ${p.days_after_plant})`,
                  })),
                ]}
                disabled={!form.culture_id}
              />
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
                  Estádio automático agora
                </p>
                <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  {form.planting_date && culturePhases.length > 0 ? (() => {
                    const dap = daysAfterPlanting(form.planting_date);
                    const auto = identifyPhase(culturePhases, dap);
                    const manual = form.current_phase_id
                      ? culturePhases.find((p) => p.id === form.current_phase_id)
                      : null;
                    return (
                      <span className="text-graphite-900 dark:text-white">
                        DAP {dap} · {auto?.phase.name ?? "—"}
                        {manual ? ` · correção: ${manual.name}` : ""}
                      </span>
                    );
                  })() : (
                    <span className="text-graphite-400 dark:text-gray-500">
                      {form.culture_id ? "Informe o plantio e cadastre fases na cultura" : "Selecione a cultura"}
                    </span>
                  )}
                </div>
              </div>
              <p className="sm:col-span-2 text-[11px] text-graphite-400 dark:text-gray-500">
                Cultivar, ciclo e estádio pertencem à parcela. Fases e Kc/Ks/Ky ficam no cadastro da cultura.
                A correção manual grava a fase atual; o motor contínuo de Kc entra na próxima etapa.
              </p>
            </div>
          )}

          {formTab === "manejo" && (
            <>
              <fieldset className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 dark:border-brand-800/30 dark:bg-brand-900/10">
                <legend className="px-2 text-sm font-semibold text-brand-700 dark:text-brand-400">
                  Água, clima e espaçamento
                </legend>
                <div className="grid gap-4 sm:grid-cols-3">
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
                  <Select
                    id="climate_config" label="Fonte de clima"
                    value={form.climate_config}
                    onChange={(e) => patch({ climate_config: e.target.value })}
                    options={[
                      { value: "farm_default", label: "Padrão da fazenda" },
                      { value: "virtual_station", label: "Estação virtual" },
                      { value: "nearest_station", label: "Estação física mais próxima" },
                      { value: "manual", label: "Registros manuais" },
                    ]}
                  />
                  <Select
                    id="rain_option" label="Fonte da chuva"
                    value={form.rain_option}
                    onChange={(e) => patch({ rain_option: e.target.value })}
                    options={[
                      { value: "auto", label: "Automática (provedor)" },
                      { value: "manual", label: "Manual" },
                      { value: "pluviometer", label: "Pluviômetro da fazenda" },
                      { value: "ignore", label: "Ignorar chuva" },
                    ]}
                  />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Input
                    id="plant_spacing_m" label="Espaç. entre plantas (m)" type="number" step="0.01" min="0"
                    value={form.plant_spacing_m}
                    onChange={(e) => patch({ plant_spacing_m: e.target.value })}
                  />
                  <Input
                    id="row_spacing_m" label="Espaç. entre linhas (m)" type="number" step="0.01" min="0"
                    value={form.row_spacing_m}
                    onChange={(e) => patch({ row_spacing_m: e.target.value })}
                  />
                  <Input
                    id="additional_row_spacing_m" label="Linha adicional (m)" type="number" step="0.01" min="0"
                    value={form.additional_row_spacing_m}
                    onChange={(e) => patch({ additional_row_spacing_m: e.target.value })}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.deficit_irrigation}
                      onChange={(e) => patch({ deficit_irrigation: e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    Irrigação com déficit
                  </label>
                  <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.stress_point_irrigation}
                      onChange={(e) => patch({ stress_point_irrigation: e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    Irrigar no ponto de estresse
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
                  <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.initial_moisture_is_cc}
                      onChange={(e) => patch({ initial_moisture_is_cc: e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    Solo em Capacidade de Campo no início
                  </label>
                </div>
              </fieldset>

              <div className="rounded-xl border border-gray-100 p-4 dark:border-white/[0.06]">
                <p className="mb-3 text-sm font-medium text-graphite-900 dark:text-gray-200">Parâmetros deste ciclo</p>
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
                    Personalizar neste ciclo
                  </label>
                </div>
                {form.parameter_mode === "padrao" ? (
                  <p className="mt-3 text-xs text-graphite-400 dark:text-gray-500">
                    Profundidade de raiz, fator p e eficiência vêm da cultura e do pivô. Fases e Kc entram nas próximas etapas.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Input
                      id="initial_root_depth" label="Prof. inicial da raiz (m)" type="number" step="0.01" min="0"
                      value={form.initial_root_depth}
                      onChange={(e) => patch({ initial_root_depth: e.target.value })}
                    />
                    <Input
                      id="max_root_depth" label="Prof. máxima da raiz (m)" type="number" step="0.01" min="0"
                      value={form.max_root_depth}
                      onChange={(e) => patch({ max_root_depth: e.target.value })}
                    />
                    <Input
                      id="irrigation_efficiency" label="Eficiência de irrigação (%)" type="number" step="1" min="1" max="100"
                      value={form.irrigation_efficiency}
                      onChange={(e) => patch({ irrigation_efficiency: e.target.value })}
                    />
                    <Input
                      id="depletion_factor" label="Fator de depleção (p)" type="number" step="0.01" min="0" max="1"
                      value={form.depletion_factor}
                      onChange={(e) => patch({ depletion_factor: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

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
              Encerrar move esta parcela para o <b>Histórico</b> e libera o pivô para um novo ciclo.
              Os dados não são apagados e este registro não pode ser reutilizado para outra cultura.
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
