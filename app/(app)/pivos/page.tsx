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
  TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { PrerequisiteNotice } from "@/components/onboarding";
import { PIVOT_TYPES, PIVOT_MANUFACTURERS } from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import { radiusFromArea } from "@/utils/geo";
import {
  calculatePivotAll,
  checkTypicalRanges,
  type PivotCalculationInput,
} from "@/modules/irrigation/services/pivot-calculations";
import {
  PIVOT_WATER_SOURCES,
  buildPivotEquipmentRow,
  validatePivotEquipmentInput,
} from "@/modules/irrigation/services/pivot-equipment";

const MapPicker = dynamic(() => import("@/components/maps/MapPicker").then((mod) => mod.MapPicker), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="text-sm text-gray-400">Carregando mapa...</p>
    </div>
  ),
});

// ── Types ──────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  farm_id: string;
  module_id: string | null;
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
  active: boolean;
  manufacturer: string | null;
  model: string | null;
  pivot_type: string;
  last_tower_radius: number | null;
  service_pressure: number | null;
  speed_100_pct: number | null;
  full_turn_time: number | null;
  depth_100_pct: number | null;
  min_depth_mm: number | null;
  max_depth_mm: number | null;
  max_operating_time: number | null;
  installed_power_kw: number | null;
  specific_consumption: number | null;
  cuc: number | null;
  energy_cost: number | null;
  cost_per_mm: number | null;
  cost_per_hectare: number | null;
  soil_id: string | null;
  tower_count: number | null;
  length_m: number | null;
  technical_notes: string | null;
  water_source: string | null;
}

interface ProdModule {
  id: string;
  name: string;
}

interface Soil {
  id: string;
  name: string;
}

interface PumpHouseLite {
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

// Pivô é EQUIPAMENTO — não tem "status" na área de cadastro. Status
// operacional (irrigando/parado) é derivado da parcela ativa + operações
// em tempo real, e é exibido em telas operacionais (Programação, Dashboard).

// ── Main Page ──────────────────────────────────────────────────────────

export default function PivosPage() {
  const { activeFarmId } = useAuth();
  const { data, loading, update, softDelete, fetch } = useCrud<Pivot>({
    table: "pivots",
    filters: { farm_id: activeFarmId },
    orderBy: "name",
    ascending: true,
  });

  const [modules, setModules] = useState<ProdModule[]>([]);
  const [soils, setSoils] = useState<Soil[]>([]);
  const [pumpHouses, setPumpHouses] = useState<PumpHouseLite[]>([]);
  const [soilId, setSoilId] = useState<string>("");
  const [pumpHouseId, setPumpHouseId] = useState<string>("");
  const [waterSource, setWaterSource] = useState<string>("");
  const [towerCount, setTowerCount] = useState<number | null>(null);
  const [lengthM, setLengthM] = useState<number | null>(null);
  const [minDepthMm, setMinDepthMm] = useState<number | null>(null);
  const [maxDepthMm, setMaxDepthMm] = useState<number | null>(null);
  const [technicalNotes, setTechnicalNotes] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Pivot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pivot | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [activeTab, setActiveTab] = useState("geral");

  // Campos técnicos controlados no parent para permitir auto-cálculo ao vivo
  // (compartilhados entre TabCaracteristicas e TabCustos).
  const [tech, setTech] = useState<TechFields>({
    area: null, radius: null, flow: null, velocity: null,
    fullTurnTime: null, depth100: null, pumpCv: null,
    motorEff: 88, installedKw: null, cuc: 85, applicationEff: 85, specificCons: null,
  });
  const [energyCost, setEnergyCost] = useState<number | null>(null);

  const updateTech = <K extends keyof TechFields>(field: K, value: TechFields[K]) =>
    setTech((prev) => ({ ...prev, [field]: value }));

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
      .from("soils")
      .select("id, name")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data: sls }) => { if (sls) setSoils(sls); });
    supabase
      .from("pump_houses")
      .select("id, name")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data: houses }) => { if (houses) setPumpHouses(houses); });
  }, [activeFarmId]);

  const activePivots = useMemo(() => data.filter((p) => p.active), [data]);

  const moduleMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m.name])),
    [modules]
  );
  const soilMap = useMemo(
    () => new Map(soils.map((s) => [s.id, s.name])),
    [soils]
  );

  const openNew = () => {
    setEditing(null);
    setActiveTab("geral");
    setFormError("");
    setTech({
      area: null, radius: null, flow: null, velocity: null,
      fullTurnTime: null, depth100: null, pumpCv: null,
      motorEff: 88, installedKw: null, cuc: 85, applicationEff: 85, specificCons: null,
    });
    setEnergyCost(null);
    setSoilId("");
    setPumpHouseId("");
    setWaterSource("");
    setTowerCount(null);
    setLengthM(null);
    setMinDepthMm(null);
    setMaxDepthMm(null);
    setTechnicalNotes("");
    setModalOpen(true);
  };

  const openEdit = (pivot: Pivot) => {
    setEditing(pivot);
    setActiveTab("geral");
    setFormError("");
    setTech({
      area: pivot.area,
      radius: pivot.last_tower_radius,
      flow: pivot.flow_rate,
      velocity: pivot.speed_100_pct,
      fullTurnTime: pivot.full_turn_time,
      depth100: pivot.depth_100_pct,
      pumpCv: pivot.pump_power,
      motorEff: pivot.motor_efficiency != null ? pivot.motor_efficiency * 100 : 88,
      installedKw: pivot.installed_power_kw,
      cuc: pivot.cuc != null ? pivot.cuc * 100 : 85,
      applicationEff: pivot.efficiency != null ? pivot.efficiency * 100 : 85,
      specificCons: pivot.specific_consumption,
    });
    setEnergyCost(pivot.energy_cost);
    setSoilId(pivot.soil_id ?? "");
    setWaterSource(pivot.water_source ?? "");
    setTowerCount(pivot.tower_count);
    setLengthM(pivot.length_m);
    setMinDepthMm(pivot.min_depth_mm);
    setMaxDepthMm(pivot.max_depth_mm);
    setTechnicalNotes(pivot.technical_notes ?? "");
    setPumpHouseId("");
    setModalOpen(true);

    const supabase = createClient();
    supabase
      .from("pump_house_pivots")
      .select("pump_house_id")
      .eq("pivot_id", pivot.id)
      .limit(1)
      .maybeSingle()
      .then(({ data: link }) => {
        if (link?.pump_house_id) setPumpHouseId(link.pump_house_id as string);
      });
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

    // Fonte da verdade: estado controlado (tech) para os campos técnicos;
    // FormData para os demais (identificação, localização).
    const area = tech.area ?? 0;
    const name = ((fd.get("name") as string) ?? "").trim();
    const radius = tech.radius ?? numOrNull("radius") ?? Math.round(radiusFromArea(area));
    const applicationEffPct = tech.applicationEff ?? 85;

    const equipmentInput = {
      farmId: activeFarmId!,
      name,
      code: (fd.get("code") as string) || null,
      moduleId: (fd.get("module_id") as string) || null,
      manufacturer: (fd.get("manufacturer") as string) || null,
      model: (fd.get("model") as string) || null,
      pivotType: (fd.get("pivot_type") as string) || "central",
      area,
      radius,
      lastTowerRadius: tech.radius,
      flowRate: tech.flow ?? 0,
      servicePressure: numOrNull("service_pressure"),
      speed100Pct: tech.velocity,
      fullTurnTime: tech.fullTurnTime ?? numOrNull("full_turn_time"),
      depth100Pct: tech.depth100 ?? numOrNull("depth_100_pct"),
      minDepthMm,
      maxDepthMm,
      maxOperatingTime: numOrNull("max_operating_time"),
      pumpPower: tech.pumpCv ?? 0,
      installedPowerKw: numOrNull("installed_power_kw"),
      motorEfficiency: (tech.motorEff ?? 88) / 100,
      cuc: (tech.cuc ?? 85) / 100,
      applicationEfficiency: applicationEffPct / 100,
      specificConsumption: numOrNull("specific_consumption"),
      latitude: Number(fd.get("latitude")) || 0,
      longitude: Number(fd.get("longitude")) || 0,
      energyCost,
      costPerMm: numOrNull("cost_per_mm"),
      soilId: soilId || null,
      towerCount,
      lengthM,
      technicalNotes: technicalNotes.trim() || null,
      waterSource: waterSource || null,
    };

    const validationError = validatePivotEquipmentInput(equipmentInput);
    if (validationError) {
      setFormError(validationError);
      if (validationError.includes("nome")) setActiveTab("geral");
      else setActiveTab("caracteristicas");
      setSaving(false);
      return;
    }

    const payload = buildPivotEquipmentRow(equipmentInput);

    try {
      const supabase = createClient();
      let pivotId = editing?.id ?? null;

      if (editing) {
        await update(editing.id, payload as Partial<Pivot>);
      } else {
        const { data: created, error } = await supabase
          .from("pivots")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        pivotId = created?.id ?? null;
        await fetch();
      }

      if (pivotId) {
        await supabase.from("pump_house_pivots").delete().eq("pivot_id", pivotId);
        if (pumpHouseId) {
          const { error: linkError } = await supabase.from("pump_house_pivots").insert({
            pivot_id: pivotId,
            pump_house_id: pumpHouseId,
          });
          if (linkError) throw new Error(linkError.message);
        }
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
    { header: "Solo", render: (r) => r.soil_id ? soilMap.get(r.soil_id) ?? "—" : "—" },
    { header: "Área (ha)", render: (r) => r.area?.toLocaleString("pt-BR"), align: "right" },
    { header: "Vazão (m³/h)", render: (r) => r.flow_rate?.toLocaleString("pt-BR"), align: "right" },
    {
      header: "Potência (CV)",
      render: (r) => r.pump_power?.toLocaleString("pt-BR") ?? "—",
      align: "right",
    },
    {
      header: "CUC",
      render: (r) => r.cuc != null ? `${(r.cuc * 100).toFixed(0)}%` : "—",
      align: "right",
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
      <div className="space-y-8">
        <PageHeader titulo="Pivôs (Equipamentos)" descricao="Ficha técnica do equipamento. Cultura e estádio ficam na parcela." />
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
    <div className="space-y-8">
      <PageHeader titulo="Pivôs (Equipamentos)" descricao="Ficha técnica do equipamento. Cultura e estádio ficam na parcela." />

      <div className="flex items-center justify-between">
        <p className="text-sm text-graphite-400 dark:text-gray-500">
          {activePivots.length} pivô{activePivots.length !== 1 ? "s" : ""} cadastrado{activePivots.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openNew}>Novo pivô</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
        ) : activePivots.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhum pivô cadastrado para esta fazenda.</p>
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
        {/* noValidate: validação feita em JS; evita que campos required em abas
            ocultas (todas montadas) bloqueiem o envio de forma não focável. */}
        <form onSubmit={handleSubmit} noValidate>
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
          {/* Todas as abas permanecem montadas (apenas a ativa visível) para que
              todos os campos entrem no FormData, independente da aba selecionada. */}
          <div className="mt-4">
            <div className={activeTab === "geral" ? "" : "hidden"}>
              <TabGeral
                editing={editing}
                modules={modules}
                soils={soils}
                soilId={soilId}
                onSoilChange={setSoilId}
                pumpHouses={pumpHouses}
                pumpHouseId={pumpHouseId}
                onPumpHouseChange={setPumpHouseId}
                waterSource={waterSource}
                onWaterSourceChange={setWaterSource}
                technicalNotes={technicalNotes}
                onTechnicalNotesChange={setTechnicalNotes}
              />
            </div>
            <div className={activeTab === "caracteristicas" ? "" : "hidden"}>
              <TabCaracteristicas
                editing={editing}
                tech={tech}
                onChange={updateTech}
                towerCount={towerCount}
                onTowerCountChange={setTowerCount}
                lengthM={lengthM}
                onLengthMChange={setLengthM}
                minDepthMm={minDepthMm}
                onMinDepthMmChange={setMinDepthMm}
                maxDepthMm={maxDepthMm}
                onMaxDepthMmChange={setMaxDepthMm}
              />
            </div>
            <div className={activeTab === "localizacao" ? "" : "hidden"}>
              <TabLocalizacao editing={editing} allPivots={activePivots} areaValue={tech.area ?? 0} />
            </div>
            <div className={activeTab === "custos" ? "" : "hidden"}>
              <TabCustos tech={tech} energyCost={energyCost} onEnergyCostChange={setEnergyCost} />
            </div>
          </div>

          {formError && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3.5 dark:bg-red-900/20"><p className="text-sm text-red-600 dark:text-red-400">{formError}</p></div>}

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-white/[0.06]">
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
  soils,
  soilId,
  onSoilChange,
  pumpHouses,
  pumpHouseId,
  onPumpHouseChange,
  waterSource,
  onWaterSourceChange,
  technicalNotes,
  onTechnicalNotesChange,
}: {
  editing: Pivot | null;
  modules: ProdModule[];
  soils: Soil[];
  soilId: string;
  onSoilChange: (v: string) => void;
  pumpHouses: PumpHouseLite[];
  pumpHouseId: string;
  onPumpHouseChange: (v: string) => void;
  waterSource: string;
  onWaterSourceChange: (v: string) => void;
  technicalNotes: string;
  onTechnicalNotesChange: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-xs text-graphite-600 dark:border-brand-800/40 dark:bg-brand-900/10 dark:text-gray-400">
        Pivô é equipamento permanente. Cultura, cultivar e estádio são cadastrados na parcela.
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
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
          id="pump_house_id"
          name="pump_house_id"
          label="Casa de bomba"
          options={pumpHouses.map((h) => ({ value: h.id, label: h.name }))}
          value={pumpHouseId}
          onChange={(e) => onPumpHouseChange(e.target.value)}
        />
        <Select
          id="water_source"
          name="water_source"
          label="Fonte de água"
          options={[...PIVOT_WATER_SOURCES]}
          value={waterSource}
          onChange={(e) => onWaterSourceChange(e.target.value)}
        />
      </div>

      <fieldset className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 dark:border-brand-800/30 dark:bg-brand-900/10">
        <legend className="px-2 text-sm font-semibold text-brand-700 dark:text-brand-400">
          Solo dominante do pivô
        </legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Select
            id="soil_id"
            label="Solo"
            value={soilId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSoilChange(e.target.value)}
            options={[
              { value: "", label: "— sem solo definido —" },
              ...soils.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <a
            href="/solos"
            className="self-end whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm text-graphite-700 hover:border-brand-500 hover:text-brand-700 dark:border-white/[0.08] dark:text-gray-300"
          >
            Cadastrar solo →
          </a>
        </div>
        <p className="mt-2 text-xs text-graphite-500 dark:text-gray-400">
          Novas parcelas neste pivô herdam este solo. Camadas (CC/PMP/KL) são detalhadas no cadastro de solos.
        </p>
      </fieldset>

      <TextArea
        id="technical_notes"
        name="technical_notes"
        label="Observações técnicas"
        rows={3}
        value={technicalNotes}
        onChange={(e) => onTechnicalNotesChange(e.target.value)}
        placeholder="Bomba, filtros, particularidades do equipamento..."
      />
    </div>
  );
}

// ── Tab: Características (auto-cálculos vivos via pivot-calculations) ─────

interface TechFields {
  area: number | null;
  radius: number | null;
  flow: number | null;
  velocity: number | null;
  fullTurnTime: number | null;
  depth100: number | null;
  pumpCv: number | null;
  motorEff: number | null;   // 0-100 (fração exibida em %)
  installedKw: number | null;
  cuc: number | null;         // 0-100 (%)
  applicationEff: number | null; // 0-100 (%) — eficiência de aplicação, distinta do CUC
  specificCons: number | null;
}

/** Card de dado auto-calculado: valor destacado + fórmula visível abaixo. */
function AutoField({
  label,
  value,
  unit,
  formula,
  warning,
}: {
  label: string;
  value: number | null;
  unit: string;
  formula: string;
  warning?: string | null;
}) {
  const display = value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (
    <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3 dark:border-brand-800/40 dark:bg-brand-900/10">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">
        {label}
        <span className="ml-1 rounded bg-brand-100 px-1 py-0.5 text-[9px] normal-case tracking-normal text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
          auto
        </span>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-graphite-900 dark:text-white">
        {display}
        <span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">{unit}</span>
      </p>
      <p className="mt-1 font-mono text-[10px] text-graphite-400 dark:text-gray-500">{formula}</p>
      {warning && (
        <p className="mt-1 text-[10px] text-yellow-600 dark:text-yellow-400">⚠ {warning}</p>
      )}
    </div>
  );
}

function TabCaracteristicas({
  editing,
  tech,
  onChange,
  towerCount,
  onTowerCountChange,
  lengthM,
  onLengthMChange,
  minDepthMm,
  onMinDepthMmChange,
  maxDepthMm,
  onMaxDepthMmChange,
}: {
  editing: Pivot | null;
  tech: TechFields;
  onChange: <K extends keyof TechFields>(field: K, value: TechFields[K]) => void;
  towerCount: number | null;
  onTowerCountChange: (v: number | null) => void;
  lengthM: number | null;
  onLengthMChange: (v: number | null) => void;
  minDepthMm: number | null;
  onMinDepthMmChange: (v: number | null) => void;
  maxDepthMm: number | null;
  onMaxDepthMmChange: (v: number | null) => void;
}) {
  // Auto-cálculos derivados ao vivo do motor puro (Etapa 2).
  const auto = useMemo(() => {
    const input: PivotCalculationInput = {
      areaHa: tech.area,
      radiusM: tech.radius,
      flowRateM3h: tech.flow,
      velocity100PctMh: tech.velocity,
      pumpPowerCv: tech.pumpCv,
      motorEfficiency: tech.motorEff != null ? tech.motorEff / 100 : null,
    };
    return calculatePivotAll(input);
  }, [tech.area, tech.radius, tech.flow, tech.velocity, tech.pumpCv, tech.motorEff]);

  // Warnings de faixa típica (soft).
  const warnings = useMemo(() => {
    return checkTypicalRanges({
      cuc: tech.cuc != null ? tech.cuc / 100 : null,
      motorEfficiency: tech.motorEff != null ? tech.motorEff / 100 : null,
      specificConsumptionKwhM3: auto.specificConsumptionKwhM3,
      velocity100PctMh: tech.velocity,
      fullTurnTimeH: auto.fullTurnTimeH,
      depth100PctMm: auto.depth100PctMm,
    });
  }, [tech.cuc, tech.motorEff, tech.velocity, auto]);

  const warningFor = (field: string) =>
    warnings.find((w) => w.field === field)?.message ?? null;

  const numInput = (val: number | null) => (val == null ? "" : String(val));

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-gray-200">
          Identificação do equipamento
        </legend>
        <div className="grid gap-5 sm:grid-cols-3">
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
          <Input
            id="tower_count"
            name="tower_count"
            label="Número de torres"
            type="number"
            min="1"
            step="1"
            value={towerCount == null ? "" : String(towerCount)}
            onChange={(e) => onTowerCountChange(e.target.value ? Number(e.target.value) : null)}
          />
          <Input
            id="length_m"
            name="length_m"
            label="Comprimento (m)"
            type="number"
            step="any"
            value={lengthM == null ? "" : String(lengthM)}
            onChange={(e) => onLengthMChange(e.target.value ? Number(e.target.value) : null)}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-gray-200">
          Dimensões e vazão
        </legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <Input
            id="area"
            name="area"
            label="Área irrigada (ha)"
            type="number"
            step="any"
            required
            value={numInput(tech.area)}
            onChange={(e) => onChange("area", e.target.value ? Number(e.target.value) : null)}
          />
          {tech.radius != null ? (
            <Input
              id="last_tower_radius"
              name="last_tower_radius"
              label="Raio da última torre (m)"
              type="number"
              step="any"
              value={numInput(tech.radius)}
              onChange={(e) => onChange("radius", e.target.value ? Number(e.target.value) : null)}
            />
          ) : (
            <AutoField
              label="Raio da última torre"
              value={auto.radiusM}
              unit="m"
              formula={`= √(${tech.area ?? "área"} × 10.000 / π)`}
            />
          )}
          <Input
            id="flow_rate"
            name="flow_rate"
            label="Vazão (m³/h)"
            type="number"
            step="any"
            required
            value={numInput(tech.flow)}
            onChange={(e) => onChange("flow", e.target.value ? Number(e.target.value) : null)}
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
        {tech.radius == null && (
          <p className="mt-2 text-[11px] text-graphite-400 dark:text-gray-500">
            Raio deixado em branco: calculado automaticamente a partir da área.
            Digite um valor se quiser sobrescrever.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-gray-200">
          Velocidade e lâmina
        </legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <Input
            id="speed_100_pct"
            name="speed_100_pct"
            label="Velocidade a 100% (m/h)"
            type="number"
            step="any"
            value={numInput(tech.velocity)}
            onChange={(e) => onChange("velocity", e.target.value ? Number(e.target.value) : null)}
          />
          {tech.fullTurnTime != null ? (
            <Input
              id="full_turn_time"
              name="full_turn_time"
              label="Tempo de volta a 100% (h)"
              type="number"
              step="any"
              value={numInput(tech.fullTurnTime)}
              onChange={(e) => onChange("fullTurnTime", e.target.value ? Number(e.target.value) : null)}
            />
          ) : (
            <AutoField
              label="Tempo de volta a 100%"
              value={auto.fullTurnTimeH}
              unit="h"
              formula="= 2π × raio / velocidade"
              warning={warningFor("fullTurnTimeH")}
            />
          )}
          {tech.depth100 != null ? (
            <Input
              id="depth_100_pct"
              name="depth_100_pct"
              label="Lâmina a 100% (mm)"
              type="number"
              step="any"
              value={numInput(tech.depth100)}
              onChange={(e) => onChange("depth100", e.target.value ? Number(e.target.value) : null)}
            />
          ) : (
            <AutoField
              label="Lâmina a 100%"
              value={auto.depth100PctMm}
              unit="mm"
              formula="= (vazão × tempo_volta) / (área × 10)"
              warning={warningFor("depth100PctMm")}
            />
          )}
          <Input
            id="min_depth_mm"
            name="min_depth_mm"
            label="Lâmina mínima (mm)"
            type="number"
            step="any"
            value={minDepthMm == null ? "" : String(minDepthMm)}
            onChange={(e) => onMinDepthMmChange(e.target.value ? Number(e.target.value) : null)}
          />
          <Input
            id="max_depth_mm"
            name="max_depth_mm"
            label="Lâmina máxima (mm)"
            type="number"
            step="any"
            value={maxDepthMm == null ? "" : String(maxDepthMm)}
            onChange={(e) => onMaxDepthMmChange(e.target.value ? Number(e.target.value) : null)}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-gray-200">
          Motor e energia
        </legend>
        <div className="grid gap-5 sm:grid-cols-3">
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
            label="Potência da bomba (CV)"
            type="number"
            step="any"
            required
            value={numInput(tech.pumpCv)}
            onChange={(e) => onChange("pumpCv", e.target.value ? Number(e.target.value) : null)}
          />
          <Input
            id="motor_efficiency"
            name="motor_efficiency"
            label="Eficiência do motor (%)"
            type="number"
            step="any"
            required
            value={numInput(tech.motorEff)}
            onChange={(e) => onChange("motorEff", e.target.value ? Number(e.target.value) : null)}
          />
          <AutoField
            label="Potência instalada"
            value={auto.installedPowerKw}
            unit="kW elétricos"
            formula="= CV × 0,7355 / (η_motor/100)"
          />
          <Input
            id="cuc"
            name="cuc"
            label="CUC — Uniformidade Christiansen (%)"
            type="number"
            step="any"
            required
            value={numInput(tech.cuc)}
            onChange={(e) => onChange("cuc", e.target.value ? Number(e.target.value) : null)}
          />
          <Input
            id="application_efficiency"
            name="application_efficiency"
            label="Eficiência de aplicação (%)"
            type="number"
            step="any"
            required
            value={numInput(tech.applicationEff)}
            onChange={(e) => onChange("applicationEff", e.target.value ? Number(e.target.value) : null)}
          />
          <AutoField
            label="Consumo específico"
            value={auto.specificConsumptionKwhM3}
            unit="kWh/m³"
            formula="= kW_instalada / vazão"
            warning={warningFor("specificConsumptionKwhM3")}
          />
        </div>
        {warningFor("cuc") && (
          <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">⚠ CUC — {warningFor("cuc")}</p>
        )}
        {warningFor("motorEfficiency") && (
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">⚠ Eficiência do motor — {warningFor("motorEfficiency")}</p>
        )}
      </fieldset>

      {/* Hidden fields — auto-calc values (para persistência mesmo se usuário não sobrescrever) */}
      <input type="hidden" name="radius" value={tech.radius ?? auto.radiusM ?? ""} />
      <input type="hidden" name="full_turn_time" value={tech.fullTurnTime ?? auto.fullTurnTimeH ?? ""} />
      <input type="hidden" name="depth_100_pct" value={tech.depth100 ?? auto.depth100PctMm ?? ""} />
      <input type="hidden" name="installed_power_kw" value={auto.installedPowerKw ?? ""} />
      <input type="hidden" name="specific_consumption" value={auto.specificConsumptionKwhM3 ?? ""} />
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
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
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
          <p className="flex h-[38px] items-center rounded-xl border border-gray-100 bg-gray-50/80 px-3 text-sm text-graphite-900 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-100">
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
        <div className="space-y-5">
          {pickerOpen && (
            <MapPicker
              value={draft}
              onChange={(la, lo) => setDraft({ lat: la, lng: lo })}
              radiusMeters={computedRadius}
              otherPivots={otherPivots}
              className="h-[60vh] w-full rounded-2xl border border-gray-100 dark:border-white/[0.06]"
            />
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-graphite-400 dark:text-gray-500">
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

function TabCustos({
  tech,
  energyCost,
  onEnergyCostChange,
}: {
  tech: TechFields;
  energyCost: number | null;
  onEnergyCostChange: (v: number | null) => void;
}) {
  // Recomputa consumo específico a partir dos técnicos para calcular custo/mm
  const auto = useMemo(() => {
    return calculatePivotAll({
      areaHa: tech.area,
      radiusM: tech.radius,
      flowRateM3h: tech.flow,
      velocity100PctMh: tech.velocity,
      pumpPowerCv: tech.pumpCv,
      motorEfficiency: tech.motorEff != null ? tech.motorEff / 100 : null,
      energyCostPerKwh: energyCost,
    });
  }, [tech, energyCost]);

  const warnings = useMemo(
    () =>
      checkTypicalRanges({
        costPerKwhReais: energyCost,
        costPerMmReais: auto.costPerMmReais,
      }),
    [energyCost, auto.costPerMmReais],
  );
  const warningFor = (field: string) =>
    warnings.find((w) => w.field === field)?.message ?? null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50/60 p-4 dark:border-amber-500/60 dark:bg-amber-900/10">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Estes valores alimentam relatórios, alertas e rateio de energia — cuidado com a digitação.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          O custo por hectare é <b>calculado no relatório da parcela</b> (depende da lâmina total aplicada na safra) — não é fixo aqui.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          id="energy_cost"
          name="energy_cost"
          label="Custo de energia (R$/kWh)"
          type="number"
          step="0.01"
          min="0"
          max="5"
          required
          placeholder="0,72"
          value={energyCost == null ? "" : String(energyCost)}
          onChange={(e) => onEnergyCostChange(e.target.value ? Number(e.target.value) : null)}
        />
        <AutoField
          label="Custo por mm (por hectare)"
          value={auto.costPerMmReais}
          unit="R$/mm/ha"
          formula="= consumo_específico × 10 × R$/kWh"
          warning={warningFor("costPerMmReais")}
        />
      </div>

      {warningFor("costPerKwhReais") && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          ⚠ Custo de energia — {warningFor("costPerKwhReais")}
        </p>
      )}

      {/* Hidden field — cost_per_mm persistido (o cálculo é auto) */}
      <input type="hidden" name="cost_per_mm" value={auto.costPerMmReais ?? ""} />
    </div>
  );
}
