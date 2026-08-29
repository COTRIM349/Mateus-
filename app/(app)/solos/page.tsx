"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Table,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { PrerequisiteNotice } from "@/components/onboarding";
import { createClient } from "@/lib/supabase/client";

type CcPmpUnit = "gravimetric_pct" | "volumetric_pct" | null;

interface PivotRow {
  id: string;
  name: string;
  area: number;
}

interface PivotSoil {
  pivot_id: string;
  farm_id: string;
  soil_class: string | null;
  infiltration_rate_mm_h: number | null;
  cc_pmp_unit: CcPmpUnit;
}

interface PivotSoilLayer {
  id: string;
  pivot_id: string;
  layer_number: number;
  soil_class: string | null;
  thickness_m: number | null;
  field_capacity_pct: number | null;
  wilting_point_pct: number | null;
  bulk_density_g_cm3: number | null;
  cc_pmp_unit: CcPmpUnit;
  dta_mm_cm: number | null;
  cad_mm: number | null;
}

interface LayerDraft {
  thickness_m: string;
  field_capacity_pct: string;
  wilting_point_pct: string;
  bulk_density_g_cm3: string;
}

interface SoilListRow {
  pivot: PivotRow;
  profile: PivotSoil | null;
  layerCount: number;
  cadTotal: number | null;
}

const UNIT_LABELS: Record<Exclude<CcPmpUnit, null>, string> = {
  gravimetric_pct: "% em peso",
  volumetric_pct: "% volumétrica",
};

const SOIL_CLASS_OPTIONS = [
  "Areia franca",
  "Arenoso",
  "Argilo-arenoso",
  "Argilo-siltoso",
  "Argiloso",
  "Franco",
  "Franco-arenoso",
  "Franco-argilo-arenoso",
  "Franco-argilo-siltoso",
  "Franco-argiloso",
  "Franco-siltoso",
  "Siltoso",
] as const;

function normalizeSoilClass(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  const match = SOIL_CLASS_OPTIONS.find(
    (option) => option.toLocaleLowerCase("pt-BR") === normalized
  );
  return match ?? value;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "Não informado";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pivotSortValue(name: string) {
  const match = name.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function comparePivots(a: PivotRow, b: PivotRow) {
  const byNumber = pivotSortValue(a.name) - pivotSortValue(b.name);
  return byNumber !== 0 ? byNumber : a.name.localeCompare(b.name, "pt-BR");
}

function nullableNumber(value: FormDataEntryValue | null) {
  if (value == null) return null;
  const text = String(value).trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function draftNumber(value: string) {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeLayerDraft(layer: PivotSoilLayer): LayerDraft {
  return {
    thickness_m: layer.thickness_m == null ? "" : String(layer.thickness_m),
    field_capacity_pct:
      layer.field_capacity_pct == null ? "" : String(layer.field_capacity_pct),
    wilting_point_pct:
      layer.wilting_point_pct == null ? "" : String(layer.wilting_point_pct),
    bulk_density_g_cm3:
      layer.bulk_density_g_cm3 == null ? "" : String(layer.bulk_density_g_cm3),
  };
}

function calculateDraftMetrics(draft: LayerDraft | undefined, unit: CcPmpUnit) {
  if (!draft || !unit) return { dta: null, cad: null };

  const thickness = draftNumber(draft.thickness_m);
  const cc = draftNumber(draft.field_capacity_pct);
  const pmp = draftNumber(draft.wilting_point_pct);
  const density = draftNumber(draft.bulk_density_g_cm3);

  if (thickness == null || cc == null || pmp == null || cc <= pmp) {
    return { dta: null, cad: null };
  }

  if (unit === "gravimetric_pct" && density == null) {
    return { dta: null, cad: null };
  }

  const dta =
    unit === "gravimetric_pct"
      ? ((cc - pmp) * (density as number)) / 10
      : (cc - pmp) / 10;

  return {
    dta,
    cad: dta * thickness * 100,
  };
}

function layerDepthLabel(layer: PivotSoilLayer, orderedLayers: PivotSoilLayer[]) {
  const sorted = [...orderedLayers].sort((a, b) => a.layer_number - b.layer_number);
  let startCm = 0;

  for (const current of sorted) {
    const thicknessCm = (current.thickness_m ?? 0.2) * 100;
    const endCm = startCm + thicknessCm;

    if (current.id === layer.id) {
      return `${Math.round(startCm)}–${Math.round(endCm)} cm`;
    }

    startCm = endCm;
  }

  return "Não informado";
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4.5 7.5V3.8m0 0H8.2M4.5 3.8l3 3A7.5 7.5 0 1 1 4.7 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M5 3.8h11.2L20 7.6V20H5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 3.8V9h8V3.8M8 20v-7h8v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.8v5.2M12 7.6h.01" strokeLinecap="round" />
    </svg>
  );
}

export default function SolosPage() {
  const { activeFarmId } = useAuth();
  const [supabase] = useState(() => createClient());
  const [pivots, setPivots] = useState<PivotRow[]>([]);
  const [profiles, setProfiles] = useState<PivotSoil[]>([]);
  const [layers, setLayers] = useState<PivotSoilLayer[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadData = useCallback(async () => {
    if (!activeFarmId) return;

    setLoading(true);
    setLoadError("");

    const [pivotsResult, profilesResult] = await Promise.all([
      supabase
        .from("pivots")
        .select("id,name,area")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("pivot_soils")
        .select("pivot_id,farm_id,soil_class,infiltration_rate_mm_h,cc_pmp_unit")
        .eq("farm_id", activeFarmId),
    ]);

    if (pivotsResult.error || profilesResult.error) {
      setLoadError(
        pivotsResult.error?.message ??
          profilesResult.error?.message ??
          "Não foi possível carregar os cadastros de solo."
      );
      setLoading(false);
      return;
    }

    const nextPivots = ((pivotsResult.data ?? []) as PivotRow[]).sort(comparePivots);
    const pivotIds = nextPivots.map((p) => p.id);

    let nextLayers: PivotSoilLayer[] = [];
    if (pivotIds.length > 0) {
      const layersResult = await supabase
        .from("pivot_soil_layers_calculated")
        .select(
          "id,pivot_id,layer_number,thickness_m,field_capacity_pct,wilting_point_pct,bulk_density_g_cm3,cc_pmp_unit,dta_mm_cm,cad_mm"
        )
        .in("pivot_id", pivotIds)
        .order("layer_number");

      if (layersResult.error) {
        setLoadError(layersResult.error.message);
        setLoading(false);
        return;
      }

      nextLayers = (layersResult.data ?? []) as PivotSoilLayer[];
    }

    setPivots(nextPivots);
    setProfiles((profilesResult.data ?? []) as PivotSoil[]);
    setLayers(nextLayers);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const profileByPivot = useMemo(
    () => new Map(profiles.map((profile) => [profile.pivot_id, profile])),
    [profiles]
  );

  const rows = useMemo<SoilListRow[]>(() => {
    const layersByPivot = new Map<string, PivotSoilLayer[]>();
    for (const layer of layers) {
      const current = layersByPivot.get(layer.pivot_id) ?? [];
      current.push(layer);
      layersByPivot.set(layer.pivot_id, current);
    }

    return pivots.map((pivot) => {
      const pivotLayers = layersByPivot.get(pivot.id) ?? [];
      const allCadCalculated =
        pivotLayers.length > 0 && pivotLayers.every((layer) => layer.cad_mm != null);
      const cadTotal = allCadCalculated
        ? pivotLayers.reduce((total, layer) => total + (layer.cad_mm ?? 0), 0)
        : null;

      return {
        pivot,
        profile: profileByPivot.get(pivot.id) ?? null,
        layerCount: pivotLayers.length,
        cadTotal,
      };
    });
  }, [layers, pivots, profileByPivot]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.pivot.name,
        `Solo ${row.pivot.name}`,
        row.profile?.soil_class ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return haystack.includes(term);
    });
  }, [rows, search]);

  const columns: Column<SoilListRow>[] = [
    {
      header: "Pivô",
      render: (row) => <span className="font-semibold">{row.pivot.name}</span>,
    },
    {
      header: "Nome",
      render: (row) => `Solo ${row.pivot.name}`,
    },
    {
      header: "Classe",
      render: (row) => row.profile?.soil_class || "Não informado",
    },
    {
      header: "VIB (mm/h)",
      align: "right",
      render: (row) =>
        row.profile?.infiltration_rate_mm_h == null
          ? "Não informado"
          : formatNumber(row.profile.infiltration_rate_mm_h, 0),
    },
    {
      header: "Unidade CC/PMP",
      render: (row) =>
        row.profile?.cc_pmp_unit
          ? UNIT_LABELS[row.profile.cc_pmp_unit]
          : "Não informado",
    },
    {
      header: "Camadas",
      align: "right",
      render: (row) => row.layerCount,
    },
    {
      header: "CAD total (mm)",
      align: "right",
      render: (row) =>
        row.cadTotal == null ? "Não calculado" : formatNumber(row.cadTotal, 2),
    },
    {
      header: "Ação",
      align: "right",
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setSelectedPivotId(row.pivot.id)}>
          Editar
        </Button>
      ),
    },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Solos"
          descricao="Cadastro físico do solo de cada pivô."
        />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Selecione uma fazenda para visualizar os solos dos pivôs cadastrados."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  const selectedPivot = pivots.find((pivot) => pivot.id === selectedPivotId) ?? null;

  if (selectedPivot) {
    return (
      <SoilDetail
        pivot={selectedPivot}
        profile={profileByPivot.get(selectedPivot.id) ?? null}
        initialLayers={layers.filter((layer) => layer.pivot_id === selectedPivot.id)}
        onBack={() => setSelectedPivotId(null)}
        onChanged={loadData}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Solos"
        descricao="Cadastro físico por pivô. Cada pivô possui seu próprio registro de solo."
      />

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[260px] flex-1">
              <Input
                id="soil_search"
                label="Pesquisar"
                placeholder="Pivô, nome do solo ou classe"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-2.5 text-sm dark:border-white/[0.08]">
              <span className="text-graphite-400 dark:text-gray-500">Pivôs: </span>
              <span className="font-semibold text-graphite-900 dark:text-white">
                {pivots.length}
              </span>
            </div>
          </div>

          {loadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
              <span className="text-sm text-graphite-400 dark:text-gray-500">
                Carregando solos por pivô...
              </span>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-graphite-400 dark:text-gray-500">
              Nenhum pivô encontrado.
            </p>
          ) : (
            <Table columns={columns} data={filteredRows} getKey={(row) => row.pivot.id} />
          )}
        </div>
      </Card>

      <p className="text-xs text-graphite-400 dark:text-gray-500">
        Campos sem informação fornecida permanecem como “Não informado”. DTA e CAD
        só são calculados quando os dados necessários da camada e a unidade de CC/PMP
        estão disponíveis.
      </p>
    </div>
  );
}

function SoilDetail({
  pivot,
  profile,
  initialLayers,
  onBack,
  onChanged,
}: {
  pivot: PivotRow;
  profile: PivotSoil | null;
  initialLayers: PivotSoilLayer[];
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [supabase] = useState(() => createClient());
  const [soilClass, setSoilClass] = useState(
    normalizeSoilClass(profile?.soil_class)
  );
  const [vib, setVib] = useState(
    profile?.infiltration_rate_mm_h == null
      ? ""
      : String(profile.infiltration_rate_mm_h)
  );
  const [unit, setUnit] = useState<CcPmpUnit>(profile?.cc_pmp_unit ?? null);
  const [layers, setLayers] = useState<PivotSoilLayer[]>(initialLayers);
  const [layerDrafts, setLayerDrafts] = useState<Record<string, LayerDraft>>(
    Object.fromEntries(initialLayers.map((layer) => [layer.id, makeLayerDraft(layer)]))
  );
  const [layersDirty, setLayersDirty] = useState(false);
  const [savingInlineLayers, setSavingInlineLayers] = useState(false);
  const [layerMessage, setLayerMessage] = useState("");
  const [changingUnit, setChangingUnit] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [layerModalOpen, setLayerModalOpen] = useState(false);
  const [editingLayer, setEditingLayer] = useState<PivotSoilLayer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PivotSoilLayer | null>(null);
  const [savingLayer, setSavingLayer] = useState(false);
  const [layerError, setLayerError] = useState("");

  useEffect(() => {
    setLayers(initialLayers);
    setLayerDrafts(
      Object.fromEntries(initialLayers.map((layer) => [layer.id, makeLayerDraft(layer)]))
    );
    setLayersDirty(false);
  }, [initialLayers]);

  const refreshLayers = useCallback(async () => {
    const result = await supabase
      .from("pivot_soil_layers_calculated")
      .select(
        "id,pivot_id,layer_number,thickness_m,field_capacity_pct,wilting_point_pct,bulk_density_g_cm3,cc_pmp_unit,dta_mm_cm,cad_mm"
      )
      .eq("pivot_id", pivot.id)
      .order("layer_number");

    if (!result.error) {
      const refreshed = (result.data ?? []) as PivotSoilLayer[];
      setLayers(refreshed);
      setLayerDrafts(
        Object.fromEntries(refreshed.map((layer) => [layer.id, makeLayerDraft(layer)]))
      );
      setLayersDirty(false);
    }
  }, [pivot.id, supabase]);

  const saveProfileFields = async (showMessage = true) => {
    setSavingProfile(true);
    setProfileError("");
    if (showMessage) setProfileMessage("");

    const vibNumber = vib.trim() === "" ? null : Number(vib.replace(",", "."));
    if (vibNumber != null && (!Number.isFinite(vibNumber) || vibNumber < 0)) {
      setProfileError("A VIB deve ser um número maior ou igual a zero.");
      setSavingProfile(false);
      return false;
    }

    const result = await supabase
      .from("pivot_soils")
      .update({
        soil_class: soilClass.trim() || null,
        infiltration_rate_mm_h: vibNumber,
      })
      .eq("pivot_id", pivot.id);

    if (result.error) {
      setProfileError(result.error.message);
      setSavingProfile(false);
      return false;
    }

    await onChanged();
    if (showMessage) setProfileMessage("Informações do solo salvas.");
    setSavingProfile(false);
    return true;
  };

  const updateLayerDraft = (
    layerId: string,
    field: keyof LayerDraft,
    value: string
  ) => {
    setLayerDrafts((current) => ({
      ...current,
      [layerId]: {
        ...(current[layerId] ?? {
          thickness_m: "",
          field_capacity_pct: "",
          wilting_point_pct: "",
          bulk_density_g_cm3: "",
        }),
        [field]: value,
      },
    }));
    setLayersDirty(true);
    setLayerMessage("");
    setLayerError("");
  };

  const persistLayerDrafts = async (showMessage = true) => {
    if (layers.length === 0) return true;

    const payload = [];

    for (const layer of layers) {
      const draft = layerDrafts[layer.id] ?? makeLayerDraft(layer);
      const thickness = draftNumber(draft.thickness_m);
      const fieldCapacity = draftNumber(draft.field_capacity_pct);
      const wiltingPoint = draftNumber(draft.wilting_point_pct);
      const bulkDensity = draftNumber(draft.bulk_density_g_cm3);

      if (thickness != null && thickness <= 0) {
        setLayerError(`Camada ${layer.layer_number}: a espessura deve ser maior que zero.`);
        return false;
      }

      if (bulkDensity != null && bulkDensity <= 0) {
        setLayerError(
          `Camada ${layer.layer_number}: a densidade aparente deve ser maior que zero.`
        );
        return false;
      }

      if (
        fieldCapacity != null &&
        wiltingPoint != null &&
        fieldCapacity <= wiltingPoint
      ) {
        setLayerError(
          `Camada ${layer.layer_number}: a Capacidade de Campo deve ser maior que o Ponto de Murchamento.`
        );
        return false;
      }

      payload.push({
        id: layer.id,
        pivot_id: layer.pivot_id,
        layer_number: layer.layer_number,
        thickness_m: thickness,
        field_capacity_pct: fieldCapacity,
        wilting_point_pct: wiltingPoint,
        bulk_density_g_cm3: bulkDensity,
      });
    }

    setSavingInlineLayers(true);
    setLayerError("");
    setLayerMessage("");

    const result = await supabase
      .from("pivot_soil_layers")
      .upsert(payload, { onConflict: "id" });

    if (result.error) {
      setLayerError(result.error.message);
      setSavingInlineLayers(false);
      return false;
    }

    await refreshLayers();
    await onChanged();
    setSavingInlineLayers(false);
    setLayersDirty(false);

    if (showMessage) {
      setLayerMessage("Alterações das camadas salvas.");
    }

    return true;
  };

  const handleUnitChange = async (nextUnit: CcPmpUnit) => {
    if (nextUnit === unit) return;

    setProfileError("");
    setProfileMessage("");
    setLayerError("");
    setLayerMessage("");

    if (layersDirty) {
      const saved = await persistLayerDrafts(false);
      if (!saved) return;
    }

    if (nextUnit == null) {
      const hasCcPmp = layers.some(
        (layer) =>
          layer.field_capacity_pct != null || layer.wilting_point_pct != null
      );

      if (hasCcPmp) {
        setProfileError(
          "Com CC/PMP preenchidos, escolha % em peso ou % volumétrica. A unidade não pode ficar vazia."
        );
        return;
      }

      setChangingUnit(true);
      const result = await supabase
        .from("pivot_soils")
        .update({ cc_pmp_unit: null })
        .eq("pivot_id", pivot.id);

      if (result.error) {
        setProfileError(result.error.message);
        setChangingUnit(false);
        return;
      }

      setUnit(null);
      await refreshLayers();
      await onChanged();
      setChangingUnit(false);
      return;
    }

    setChangingUnit(true);
    const result = await supabase.rpc("set_pivot_soil_cc_pmp_unit", {
      p_pivot_id: pivot.id,
      p_new_unit: nextUnit,
    });

    if (result.error) {
      setProfileError(result.error.message);
      setChangingUnit(false);
      return;
    }

    setUnit(nextUnit);
    await refreshLayers();
    await onChanged();
    setProfileMessage(
      nextUnit === "volumetric_pct"
        ? "Unidade alterada para % volumétrica. CC e PMP foram convertidos automaticamente pela densidade aparente de cada camada."
        : "Unidade alterada para % em peso. CC e PMP foram convertidos automaticamente pela densidade aparente de cada camada."
    );
    setChangingUnit(false);
  };

  const liveLayerMetrics = layers.map((layer) => ({
    layer,
    ...calculateDraftMetrics(layerDrafts[layer.id], unit),
  }));

  const cadTotal =
    liveLayerMetrics.length > 0 &&
    liveLayerMetrics.every((item) => item.cad != null)
      ? liveLayerMetrics.reduce((total, item) => total + (item.cad ?? 0), 0)
      : null;

  const profileDepthCm =
    liveLayerMetrics.length > 0 &&
    liveLayerMetrics.every(({ layer }) => {
      const thickness = draftNumber(
        layerDrafts[layer.id]?.thickness_m ?? String(layer.thickness_m ?? "")
      );
      return thickness != null && thickness > 0;
    })
      ? liveLayerMetrics.reduce((total, { layer }) => {
          const thickness = draftNumber(
            layerDrafts[layer.id]?.thickness_m ?? String(layer.thickness_m ?? "")
          );
          return total + (thickness ?? 0) * 100;
        }, 0)
      : null;

  const dtaProfileAverage =
    cadTotal != null && profileDepthCm != null && profileDepthCm > 0
      ? cadTotal / profileDepthCm
      : null;

  const originalSoilClass = normalizeSoilClass(profile?.soil_class);
  const originalVib =
    profile?.infiltration_rate_mm_h == null
      ? ""
      : String(profile.infiltration_rate_mm_h);

  const profileDirty = soilClass !== originalSoilClass || vib !== originalVib;
  const hasUnsavedChanges = profileDirty || layersDirty;

  const saveAllChanges = async () => {
    setProfileMessage("");
    setLayerMessage("");

    if (layersDirty) {
      const layersSaved = await persistLayerDrafts(false);
      if (!layersSaved) return;
    }

    if (profileDirty) {
      const profileSaved = await saveProfileFields(false);
      if (!profileSaved) return;
    }

    setProfileMessage("Alterações salvas.");
  };

  const discardUnsavedChanges = () => {
    setSoilClass(originalSoilClass);
    setVib(originalVib);
    setLayerDrafts(
      Object.fromEntries(layers.map((layer) => [layer.id, makeLayerDraft(layer)]))
    );
    setLayersDirty(false);
    setProfileError("");
    setLayerError("");
    setProfileMessage("");
    setLayerMessage("");
  };

  const saveLayer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingLayer(true);
    setLayerError("");

    const fd = new FormData(event.currentTarget);
    const layerNumber = Number(fd.get("layer_number"));
    const thickness = nullableNumber(fd.get("thickness_m"));
    const fieldCapacity = nullableNumber(fd.get("field_capacity_pct"));
    const wiltingPoint = nullableNumber(fd.get("wilting_point_pct"));
    const bulkDensity = nullableNumber(fd.get("bulk_density_g_cm3"));

    if (!Number.isInteger(layerNumber) || layerNumber <= 0) {
      setLayerError("Informe um número de camada válido.");
      setSavingLayer(false);
      return;
    }
    if (thickness != null && thickness <= 0) {
      setLayerError("A espessura deve ser maior que zero.");
      setSavingLayer(false);
      return;
    }
    if (bulkDensity != null && bulkDensity <= 0) {
      setLayerError("A densidade aparente deve ser maior que zero.");
      setSavingLayer(false);
      return;
    }
    if (
      fieldCapacity != null &&
      wiltingPoint != null &&
      fieldCapacity <= wiltingPoint
    ) {
      setLayerError("A Capacidade de Campo deve ser maior que o Ponto de Murchamento.");
      setSavingLayer(false);
      return;
    }

    const payload = {
      layer_number: layerNumber,
      thickness_m: thickness,
      field_capacity_pct: fieldCapacity,
      wilting_point_pct: wiltingPoint,
      bulk_density_g_cm3: bulkDensity,
    };

    const result = editingLayer
      ? await supabase
          .from("pivot_soil_layers")
          .update(payload)
          .eq("id", editingLayer.id)
      : await supabase
          .from("pivot_soil_layers")
          .insert({ pivot_id: pivot.id, ...payload });

    if (result.error) {
      setLayerError(
        result.error.code === "23505"
          ? `A camada ${layerNumber} já existe neste pivô.`
          : result.error.message
      );
      setSavingLayer(false);
      return;
    }

    setLayerModalOpen(false);
    setEditingLayer(null);
    await refreshLayers();
    await onChanged();
    setSavingLayer(false);
  };

  const deleteLayer = async () => {
    if (!deleteTarget) return;
    setSavingLayer(true);
    setLayerError("");

    const result = await supabase
      .from("pivot_soil_layers")
      .delete()
      .eq("id", deleteTarget.id);

    if (result.error) {
      setLayerError(result.error.message);
      setSavingLayer(false);
      return;
    }

    setDeleteTarget(null);
    await refreshLayers();
    await onChanged();
    setSavingLayer(false);
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-graphite-500 transition hover:text-graphite-900 dark:text-gray-400 dark:hover:text-white"
        >
          <BackIcon />
          Voltar para solos
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={discardUnsavedChanges}
            disabled={!hasUnsavedChanges}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-graphite-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.10] dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04]"
          >
            <ResetIcon />
            Descartar alterações
          </button>
          <button
            type="button"
            onClick={() => void saveAllChanges()}
            disabled={!hasUnsavedChanges || savingProfile || savingInlineLayers}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SaveIcon />
            {savingProfile || savingInlineLayers ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-graphite-950 dark:text-white">
          Solo {pivot.name}
        </h1>

        <div className="mt-6 grid gap-4 border-b border-gray-200 pb-6 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.35fr)_minmax(120px,.65fr)_minmax(180px,.85fr)_minmax(140px,.75fr)] dark:border-white/[0.08]">
          <div className="xl:border-r xl:border-gray-200 xl:pr-6 dark:xl:border-white/[0.08]">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-graphite-400 dark:text-gray-500">
              Classe do solo
            </label>
            <select
              value={soilClass}
              onChange={(event) => setSoilClass(event.target.value)}
              className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base font-medium text-graphite-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-white"
            >
              <option value="">Não informado</option>
              {SOIL_CLASS_OPTIONS.map((soilClassOption) => (
                <option key={soilClassOption} value={soilClassOption}>
                  {soilClassOption}
                </option>
              ))}
            </select>
          </div>

          <div className="xl:border-r xl:border-gray-200 xl:px-6 dark:xl:border-white/[0.08]">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-graphite-400 dark:text-gray-500">
              VIB (mm/h)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={vib}
              onChange={(event) => setVib(event.target.value)}
              className="h-12 w-full rounded-xl border border-transparent bg-transparent px-0 text-xl font-medium text-graphite-900 outline-none transition focus:border-gray-200 focus:bg-white focus:px-3 dark:text-white dark:focus:border-white/[0.10] dark:focus:bg-white/[0.03]"
            />
          </div>

          <div className="xl:border-r xl:border-gray-200 xl:px-6 dark:xl:border-white/[0.08]">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-graphite-400 dark:text-gray-500">
              Unidade
            </label>
            <select
              value={unit ?? ""}
              onChange={(event) =>
                void handleUnitChange((event.target.value || null) as CcPmpUnit)
              }
              disabled={changingUnit}
              className="h-12 w-full rounded-xl border border-transparent bg-transparent px-0 text-xl font-medium text-graphite-900 outline-none transition focus:border-gray-200 focus:bg-white focus:px-3 dark:text-white dark:focus:border-white/[0.10] dark:focus:bg-white/[0.03]"
            >
              <option value="">Não informado</option>
              <option value="gravimetric_pct">% em peso</option>
              <option value="volumetric_pct">% volumétrica</option>
            </select>
          </div>

          <div className="xl:pl-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-graphite-400 dark:text-gray-500">
              Perfil
            </p>
            <p className="h-12 pt-2 text-xl font-medium text-graphite-900 dark:text-white">
              {profileDepthCm == null ? "—" : `0–${Math.round(profileDepthCm)} cm`}
            </p>
          </div>
        </div>

        {(profileError || layerError || profileMessage || layerMessage) && (
          <div className="mt-4 space-y-2">
            {profileError && (
              <p className="text-sm text-red-600 dark:text-red-400">{profileError}</p>
            )}
            {layerError && !layerModalOpen && (
              <p className="text-sm text-red-600 dark:text-red-400">{layerError}</p>
            )}
            {(profileMessage || layerMessage) && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {profileMessage || layerMessage}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.10] dark:bg-white/[0.025]">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-graphite-400 dark:text-gray-400">
            Profundidade total
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-600 dark:text-brand-400">
            {profileDepthCm == null ? "—" : `${Math.round(profileDepthCm)} cm`}
          </p>
          <p className="mt-2 text-sm text-graphite-400 dark:text-gray-500">
            {profileDepthCm == null ? "Perfil não informado" : `0–${Math.round(profileDepthCm)} cm`}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.10] dark:bg-white/[0.025]">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-graphite-400 dark:text-gray-400">
            DTA média do perfil
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-600 dark:text-brand-400">
            {dtaProfileAverage == null ? "—" : `${formatNumber(dtaProfileAverage, 3)} mm/cm`}
          </p>
          <p className="mt-2 text-sm text-graphite-400 dark:text-gray-500">
            Disponibilidade de água
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.10] dark:bg-white/[0.025]">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-graphite-400 dark:text-gray-400">
            CAD total do perfil
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-600 dark:text-brand-400">
            {cadTotal == null ? "—" : `${formatNumber(cadTotal, 2)} mm`}
          </p>
          <p className="mt-2 text-sm text-graphite-400 dark:text-gray-500">
            Capacidade de água disponível
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.10] dark:bg-white/[0.025]">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-graphite-400 dark:text-gray-400">
            Número de camadas
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-600 dark:text-brand-400">
            {layers.length}
          </p>
          <p className="mt-2 text-sm text-graphite-400 dark:text-gray-500">
            Camadas cadastradas
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.10] dark:bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/[0.08]">
          <div>
            <h2 className="text-xl font-semibold text-graphite-950 dark:text-white">
              Perfil do solo
            </h2>
            <p className="mt-1 text-sm text-graphite-400 dark:text-gray-500">
              Edite os valores das camadas do solo
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingLayer(null);
              setLayerError("");
              setLayerModalOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-brand-600/50 px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
          >
            <PlusIcon />
            Adicionar camada
          </button>
        </div>

        {layers.length === 0 ? (
          <p className="py-10 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhuma camada foi fornecida para este pivô.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[1.25fr_.9fr_.9fr_1.15fr_1fr_80px] items-center border-b border-gray-200 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite-400 dark:border-white/[0.08] dark:text-gray-500">
                <div>Camada <span className="normal-case tracking-normal">(profundidade)</span></div>
                <div className="text-center">CC (%) <span className="ml-1 inline-flex align-middle text-graphite-300 dark:text-gray-600"><InfoIcon /></span></div>
                <div className="text-center">PMP (%) <span className="ml-1 inline-flex align-middle text-graphite-300 dark:text-gray-600"><InfoIcon /></span></div>
                <div className="text-center">Densidade aparente (g/cm³) <span className="ml-1 inline-flex align-middle text-graphite-300 dark:text-gray-600"><InfoIcon /></span></div>
                <div className="text-center">CAD da camada (mm) <span className="ml-1 inline-flex align-middle text-graphite-300 dark:text-gray-600"><InfoIcon /></span></div>
                <div className="text-center">Ações</div>
              </div>

              {[...layers]
                .sort((a, b) => a.layer_number - b.layer_number)
                .map((layer) => {
                  const draft = layerDrafts[layer.id] ?? makeLayerDraft(layer);
                  const metrics = calculateDraftMetrics(draft, unit);

                  return (
                    <div
                      key={layer.id}
                      className="grid grid-cols-[1.25fr_.9fr_.9fr_1.15fr_1fr_80px] items-center border-b border-gray-100 px-6 py-4 last:border-b-0 dark:border-white/[0.06]"
                    >
                      <div>
                        <p className="text-base font-semibold text-graphite-900 dark:text-white">
                          Camada {layer.layer_number}
                        </p>
                        <p className="mt-1 text-sm font-medium text-brand-600 dark:text-brand-400">
                          {layerDepthLabel(layer, layers)}
                        </p>
                      </div>

                      <div className="px-3">
                        <input
                          aria-label={`Capacidade de Campo da camada ${layer.layer_number}`}
                          type="number"
                          step="0.001"
                          value={draft.field_capacity_pct}
                          onChange={(event) =>
                            updateLayerDraft(layer.id, "field_capacity_pct", event.target.value)
                          }
                          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-center text-base font-medium text-graphite-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-white dark:focus:bg-white/[0.05]"
                        />
                      </div>

                      <div className="px-3">
                        <input
                          aria-label={`Ponto de Murchamento da camada ${layer.layer_number}`}
                          type="number"
                          step="0.001"
                          value={draft.wilting_point_pct}
                          onChange={(event) =>
                            updateLayerDraft(layer.id, "wilting_point_pct", event.target.value)
                          }
                          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-center text-base font-medium text-graphite-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-white dark:focus:bg-white/[0.05]"
                        />
                      </div>

                      <div className="px-3">
                        <input
                          aria-label={`Densidade aparente da camada ${layer.layer_number}`}
                          type="number"
                          min="0.01"
                          step="0.001"
                          value={draft.bulk_density_g_cm3}
                          onChange={(event) =>
                            updateLayerDraft(layer.id, "bulk_density_g_cm3", event.target.value)
                          }
                          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-center text-base font-medium text-graphite-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-white dark:focus:bg-white/[0.05]"
                        />
                      </div>

                      <div className="px-3">
                        <div className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-center dark:border-white/[0.10] dark:bg-transparent">
                          <span className="inline-flex h-full items-center gap-2 text-lg font-medium text-graphite-900 dark:text-white">
                            {metrics.cad == null ? "—" : formatNumber(metrics.cad, 2)}
                            <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">mm</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <button
                          type="button"
                          aria-label={`Excluir camada ${layer.layer_number}`}
                          onClick={() => setDeleteTarget(layer)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      <section className="flex gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-graphite-500 dark:border-white/[0.10] dark:bg-white/[0.02] dark:text-gray-400">
        <span className="mt-0.5 shrink-0 text-graphite-400 dark:text-gray-500">
          <InfoIcon />
        </span>
        <div className="space-y-1">
          <p>DTA média do perfil é calculada com base no CAD total e na profundidade total do solo.</p>
          <p>CAD da camada = DTA × espessura da camada.</p>
        </div>
      </section>

      <Modal
        open={layerModalOpen}
        onClose={() => {
          setLayerModalOpen(false);
          setEditingLayer(null);
          setLayerError("");
        }}
        title={editingLayer ? "Editar camada" : "Adicionar camada"}
      >
        <form onSubmit={saveLayer} className="space-y-5">
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs text-graphite-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400">
            Solo {pivot.name} · Unidade CC/PMP:{" "}
            <strong>{unit ? UNIT_LABELS[unit] : "Não informado"}</strong>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="layer_number"
              name="layer_number"
              label="Camada"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={
                editingLayer?.layer_number ??
                (layers.length > 0
                  ? Math.max(...layers.map((layer) => layer.layer_number)) + 1
                  : 1)
              }
            />
            <Input
              id="thickness_m"
              name="thickness_m"
              label="Espessura da camada (m)"
              type="number"
              min="0.001"
              step="0.01"
              placeholder="Não informado"
              defaultValue={editingLayer?.thickness_m ?? ""}
            />
            <Input
              id="field_capacity_pct"
              name="field_capacity_pct"
              label="Capacidade de Campo (%)"
              type="number"
              step="0.1"
              placeholder="Não informado"
              defaultValue={editingLayer?.field_capacity_pct ?? ""}
            />
            <Input
              id="wilting_point_pct"
              name="wilting_point_pct"
              label="Ponto de Murchamento (%)"
              type="number"
              step="0.1"
              placeholder="Não informado"
              defaultValue={editingLayer?.wilting_point_pct ?? ""}
            />
            <Input
              id="bulk_density_g_cm3"
              name="bulk_density_g_cm3"
              label="Densidade aparente (g/cm³)"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Não informado"
              defaultValue={editingLayer?.bulk_density_g_cm3 ?? ""}
            />
          </div>

          {layerError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {layerError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLayerModalOpen(false);
                setEditingLayer(null);
                setLayerError("");
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={savingLayer}>
              {savingLayer ? "Salvando..." : "Salvar camada"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteLayer}
        title="Excluir camada"
        message={`Deseja excluir a camada ${deleteTarget?.layer_number ?? ""} de Solo ${pivot.name}?`}
        confirmLabel="Excluir"
        loading={savingLayer}
      />
    </div>
  );
}
