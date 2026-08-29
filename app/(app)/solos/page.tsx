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
  const [soilClass, setSoilClass] = useState(profile?.soil_class ?? "");
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

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError("");
    setProfileMessage("");

    const vibNumber = vib.trim() === "" ? null : Number(vib.replace(",", "."));
    if (vibNumber != null && (!Number.isFinite(vibNumber) || vibNumber < 0)) {
      setProfileError("A VIB deve ser um número maior ou igual a zero.");
      setSavingProfile(false);
      return;
    }

    const payload = {
      soil_class: soilClass.trim() || null,
      infiltration_rate_mm_h: vibNumber,
    };

    const result = await supabase
      .from("pivot_soils")
      .update(payload)
      .eq("pivot_id", pivot.id);

    if (result.error) {
      setProfileError(result.error.message);
      setSavingProfile(false);
      return;
    }

    await refreshLayers();
    await onChanged();
    setProfileMessage("Cadastro salvo.");
    setSavingProfile(false);
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

  const layerColumns: Column<PivotSoilLayer>[] = [
    {
      header: "Camada",
      render: (row) => (
        <span className="font-semibold">Camada {row.layer_number}</span>
      ),
    },
    {
      header: "Espessura",
      render: (row) => (
        <span className="font-medium text-graphite-800 dark:text-gray-200">
          {layerDepthLabel(row, layers)}
        </span>
      ),
    },
    {
      header: "CC (%)",
      render: (row) => (
        <input
          aria-label={`Capacidade de Campo da camada ${row.layer_number}`}
          type="number"
          step="0.001"
          value={layerDrafts[row.id]?.field_capacity_pct ?? ""}
          onChange={(event) =>
            updateLayerDraft(row.id, "field_capacity_pct", event.target.value)
          }
          className="w-28 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.04]"
        />
      ),
    },
    {
      header: "PMP (%)",
      render: (row) => (
        <input
          aria-label={`Ponto de Murchamento da camada ${row.layer_number}`}
          type="number"
          step="0.001"
          value={layerDrafts[row.id]?.wilting_point_pct ?? ""}
          onChange={(event) =>
            updateLayerDraft(row.id, "wilting_point_pct", event.target.value)
          }
          className="w-28 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.04]"
        />
      ),
    },
    {
      header: "Densidade aparente (g/cm³)",
      render: (row) => (
        <input
          aria-label={`Densidade aparente da camada ${row.layer_number}`}
          type="number"
          min="0.01"
          step="0.001"
          value={layerDrafts[row.id]?.bulk_density_g_cm3 ?? ""}
          onChange={(event) =>
            updateLayerDraft(row.id, "bulk_density_g_cm3", event.target.value)
          }
          className="w-28 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.04]"
        />
      ),
    },
    {
      header: "CAD (mm)",
      align: "right",
      render: (row) => {
        const metrics = calculateDraftMetrics(layerDrafts[row.id], unit);
        return metrics.cad == null ? "Não calculado" : formatNumber(metrics.cad, 2);
      },
    },
    {
      header: "Ação",
      align: "right",
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
          Excluir
        </Button>
      ),
    },
  ];

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
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Voltar para solos
        </Button>
      </div>

      <PageHeader titulo={`Solo ${pivot.name}`} />

      <Card>
        <form onSubmit={saveProfile} className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-graphite-900 dark:text-white">
              Informações do solo
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Input id="pivot_name" label="Pivô" value={pivot.name} disabled />
            <Input id="soil_name" label="Nome" value={`Solo ${pivot.name}`} disabled />
            <Input
              id="soil_class"
              label="Classe do solo"
              placeholder="Não informado"
              value={soilClass}
              onChange={(event) => setSoilClass(event.target.value)}
            />
            <Input
              id="infiltration_rate_mm_h"
              label="VIB (mm/h)"
              type="number"
              step="0.1"
              min="0"
              placeholder="Não informado"
              value={vib}
              onChange={(event) => setVib(event.target.value)}
            />
          </div>

          <div className="max-w-sm">
            <Select
              id="cc_pmp_unit"
              label="Unidade de CC e PMP"
              value={unit ?? ""}
              onChange={(event) =>
                void handleUnitChange((event.target.value || null) as CcPmpUnit)
              }
              disabled={changingUnit}
              options={[
                { value: "", label: "Não informado" },
                { value: "gravimetric_pct", label: "% em peso" },
                { value: "volumetric_pct", label: "% volumétrica" },
              ]}
            />
          </div>

          {profileError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {profileError}
            </p>
          )}
          {profileMessage && (
            <p className="text-sm text-green-700 dark:text-green-400">
              {profileMessage}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "Salvando..." : "Salvar informações"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-graphite-900 dark:text-white">
                Camadas do solo
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!layersDirty || savingInlineLayers}
                onClick={() => void persistLayerDrafts(true)}
              >
                {savingInlineLayers ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button
                onClick={() => {
                  setEditingLayer(null);
                  setLayerError("");
                  setLayerModalOpen(true);
                }}
              >
                Adicionar camada
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 p-4 dark:border-white/[0.08]">
              <p className="text-xs text-graphite-400 dark:text-gray-500">Camadas</p>
              <div className="mt-2 space-y-1 text-sm font-semibold text-graphite-900 dark:text-white">
                {layers.length === 0 ? (
                  <p>Não informado</p>
                ) : (
                  [...layers]
                    .sort((a, b) => a.layer_number - b.layer_number)
                    .map((layer) => (
                      <p key={layer.id}>Camada {layer.layer_number}</p>
                    ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 p-4 dark:border-white/[0.08]">
              <p className="text-xs text-graphite-400 dark:text-gray-500">
                DTA média do perfil (mm/cm)
              </p>
              <p className="mt-1 text-lg font-semibold text-graphite-900 dark:text-white">
                {dtaProfileAverage == null
                  ? "Não calculado"
                  : formatNumber(dtaProfileAverage, 3)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 p-4 dark:border-white/[0.08]">
              <p className="text-xs text-graphite-400 dark:text-gray-500">CAD total do perfil</p>
              <p className="mt-1 text-lg font-semibold text-graphite-900 dark:text-white">
                {cadTotal == null ? "Não calculado" : `${formatNumber(cadTotal, 2)} mm`}
              </p>
            </div>
          </div>

          {layerError && !layerModalOpen && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {layerError}
            </p>
          )}
          {layerMessage && (
            <p className="text-sm text-green-700 dark:text-green-400">
              {layerMessage}
            </p>
          )}

          {layers.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
              Nenhuma camada foi fornecida para este pivô.
            </p>
          ) : (
            <Table columns={layerColumns} data={layers} getKey={(row) => row.id} />
          )}
        </div>
      </Card>

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

          <p className="text-xs text-graphite-400 dark:text-gray-500">
            DTA e CAD não são digitados. O sistema calcula somente com os dados
            informados. Se faltar unidade, CC, PMP, densidade (quando necessária)
            ou espessura, o resultado ficará como “Não calculado”.
          </p>

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
