"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface CultureOption { id: string; name: string }
interface CultivarOption { id: string; name: string }
interface SourceOption { id: string; title: string; institution: string | null }
interface Marker {
  id: string;
  stage_code: string;
  name: string;
  marker_order: number;
  management_phase_key: string | null;
  critical_water_stage: boolean;
  physiological_process: string | null;
  yield_component_risk: string | null;
  source_id: string | null;
}
interface Target {
  id: string;
  variety_id: string;
  marker_id: string;
  expected_dae: number | null;
  expected_gdd: number | null;
  calibrated_dae: number | null;
  calibrated_gdd: number | null;
  use_calibrated: boolean;
  source_id: string | null;
  expected_source_id: string | null;
  calibrated_source_id: string | null;
  calibration_confidence: string | null;
  confidence: string;
  notes: string | null;
}
interface CulturePhenology {
  phenology_scale: string | null;
  phenology_source_id: string | null;
}

const CONFIDENCE_OPTIONS = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
  { value: "nao_validada", label: "Não validada" },
];

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function AgronomicPhenologyTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: CultureOption[];
}) {
  const supabase = createClient();
  const [cultivars, setCultivars] = useState<CultivarOption[]>([]);
  const [cultivarId, setCultivarId] = useState("");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [culturePhenology, setCulturePhenology] = useState<CulturePhenology | null>(null);
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    if (!selectedCultureId) {
      setCultivars([]);
      setMarkers([]);
      setTargets([]);
      setCulturePhenology(null);
      setCultivarId("");
      return;
    }

    setLoading(true);
    const [cultivarRes, markerRes, sourceRes, cultureRes] = await Promise.all([
      supabase.from("culture_varieties").select("id,name").eq("culture_id", selectedCultureId).eq("active", true).order("name"),
      supabase.from("culture_phenology_markers")
        .select("id,stage_code,name,marker_order,management_phase_key,critical_water_stage,physiological_process,yield_component_risk,source_id")
        .eq("culture_id", selectedCultureId)
        .eq("active", true)
        .order("marker_order"),
      supabase.from("agronomic_sources").select("id,title,institution").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("cultures").select("phenology_scale,phenology_source_id").eq("id", selectedCultureId).single(),
    ]);

    const nextCultivars = (cultivarRes.data ?? []) as CultivarOption[];
    setCultivars(nextCultivars);
    setMarkers((markerRes.data ?? []) as Marker[]);
    setSources((sourceRes.data ?? []) as SourceOption[]);
    setCulturePhenology((cultureRes.data ?? null) as CulturePhenology | null);
    setCultivarId((current) => nextCultivars.some((v) => v.id === current) ? current : (nextCultivars[0]?.id ?? ""));
    setLoading(false);
  }, [selectedCultureId, supabase]);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const loadTargets = useCallback(async () => {
    if (!cultivarId) {
      setTargets([]);
      return;
    }
    const { data } = await supabase
      .from("culture_variety_phenology_targets")
      .select("*")
      .eq("variety_id", cultivarId);
    setTargets((data ?? []) as Target[]);
  }, [cultivarId, supabase]);

  useEffect(() => { void loadTargets(); }, [loadTargets]);

  const targetByMarker = useMemo(
    () => Object.fromEntries(targets.map((target) => [target.marker_id, target])),
    [targets],
  );
  const sourceLabel = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.title || source.institution || "Fonte"])),
    [sources],
  );

  const columns: Column<Marker>[] = [
    {
      header: "Estádio",
      render: (marker) => (
        <div>
          <p className="font-semibold text-graphite-900 dark:text-white">{marker.stage_code}</p>
          <p className="text-xs text-graphite-400">{marker.name}</p>
        </div>
      ),
    },
    { header: "Grupo", render: (marker) => marker.management_phase_key ?? "—" },
    {
      header: "DAE esperado",
      align: "right",
      render: (marker) => targetByMarker[marker.id]?.expected_dae ?? "—",
    },
    {
      header: "GDA esperado",
      align: "right",
      render: (marker) => targetByMarker[marker.id]?.expected_gdd ?? "—",
    },
    {
      header: "Calibração local",
      render: (marker) => {
        const target = targetByMarker[marker.id];
        if (!target || (target.calibrated_dae == null && target.calibrated_gdd == null)) return "—";
        return (
          <div>
            <p>DAE {target.calibrated_dae ?? "—"} · GDA {target.calibrated_gdd ?? "—"}</p>
            <p className="text-[11px] text-graphite-400">{target.use_calibrated ? "ATIVA" : "Registrada, não ativa"}</p>
          </div>
        );
      },
    },
    {
      header: "Origem",
      render: (marker) => {
        const target = targetByMarker[marker.id];
        const sourceId = target?.expected_source_id ?? target?.source_id ?? marker.source_id;
        return (
          <div>
            <p className="text-xs">{sourceId ? sourceLabel[sourceId] ?? "Fonte arquivada" : "Sem fonte"}</p>
            <p className="text-[11px] text-graphite-400">{target?.confidence ?? "—"}</p>
          </div>
        );
      },
    },
    {
      header: "Ações",
      align: "right",
      render: (marker) => (
        <Button variant="ghost" size="sm" disabled={!cultivarId} onClick={() => { setEditingMarker(marker); setError(""); }}>
          Parâmetros
        </Button>
      ),
    },
  ];

  const saveTarget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMarker || !cultivarId) return;

    const fd = new FormData(event.currentTarget);
    const sourceId = String(fd.get("source_id") ?? "").trim();
    const expectedDae = numberOrNull(fd.get("expected_dae"));
    const expectedGdd = numberOrNull(fd.get("expected_gdd"));

    if (!sourceId) {
      setError("Informe a fonte dos valores esperados.");
      return;
    }
    if (expectedDae == null && expectedGdd == null) {
      setError("Informe DAE esperado e/ou GDA esperado.");
      return;
    }

    setSaving(true);
    setError("");

    const current = targetByMarker[editingMarker.id];
    const payload = {
      variety_id: cultivarId,
      marker_id: editingMarker.id,
      expected_dae: expectedDae,
      expected_gdd: expectedGdd,
      source_id: sourceId,
      expected_source_id: sourceId,
      confidence: String(fd.get("confidence") ?? "nao_validada"),
      notes: String(fd.get("notes") ?? "").trim() || null,
      use_calibrated: current?.use_calibrated ?? false,
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = await supabase
      .from("culture_variety_phenology_targets")
      .upsert(payload, { onConflict: "variety_id,marker_id" });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setEditingMarker(null);
    setSaving(false);
    await loadTargets();
  };

  const target = editingMarker ? targetByMarker[editingMarker.id] : undefined;
  const scaleSource = culturePhenology?.phenology_source_id
    ? sourceLabel[culturePhenology.phenology_source_id] ?? "Fonte cadastrada"
    : "Sem fonte";

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Select
          id="phenology_culture"
          name="phenology_culture"
          label="Cultura"
          options={cultures.map((culture) => ({ value: culture.id, label: culture.name }))}
          value={selectedCultureId ?? ""}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(event.target.value || null)}
        />
        <Select
          id="phenology_cultivar"
          name="phenology_cultivar"
          label="Cultivar"
          options={[{ value: "", label: cultivars.length ? "Selecione a cultivar" : "Sem cultivares" }, ...cultivars.map((cultivar) => ({ value: cultivar.id, label: cultivar.name }))]}
          value={cultivarId}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setCultivarId(event.target.value)}
          disabled={!selectedCultureId}
        />
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-graphite-400">Escala de referência</p>
          <p className="mt-1 text-sm font-semibold text-graphite-900 dark:text-white">{culturePhenology?.phenology_scale ?? "Sem escala"}</p>
          <p className="text-xs text-graphite-400">{scaleSource}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
        Fenologia informa <strong>quando</strong> a planta está em cada estádio. Kc permanece em curva própria. Observação de campo e calibração local não apagam o valor esperado de literatura/fabricante.
      </div>

      <Card>
        {!selectedCultureId ? (
          <p className="py-8 text-center text-sm text-graphite-400">Selecione uma cultura.</p>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-graphite-400">Carregando fenologia...</p>
        ) : markers.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400">Nenhum marcador fenológico ativo.</p>
        ) : (
          <Table columns={columns} data={markers} getKey={(row) => row.id} />
        )}
      </Card>

      <Modal
        open={!!editingMarker}
        onClose={() => { setEditingMarker(null); setError(""); }}
        title={editingMarker ? (editingMarker.stage_code + " — " + editingMarker.name) : "Parâmetro fenológico"}
        size="lg"
      >
        {editingMarker && (
          <form onSubmit={saveTarget} className="space-y-5">
            <div className="rounded-xl bg-gray-50 p-4 text-xs text-graphite-500 dark:bg-white/[0.03] dark:text-gray-400">
              <p>{editingMarker.physiological_process ?? "Processo fisiológico não cadastrado."}</p>
              {editingMarker.yield_component_risk && <p className="mt-1">Componente em risco: {editingMarker.yield_component_risk}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="expected_dae" name="expected_dae" label="DAE esperado" type="number" min="0" step="0.1" defaultValue={target?.expected_dae ?? ""} />
              <Input id="expected_gdd" name="expected_gdd" label="GDA esperado" type="number" min="0" step="0.1" defaultValue={target?.expected_gdd ?? ""} />
              <Select
                id="source_id"
                name="source_id"
                label="Fonte dos valores esperados"
                options={[{ value: "", label: "Selecione" }, ...sources.map((source) => ({ value: source.id, label: source.title || source.institution || "Fonte" }))]}
                required
                defaultValue={target?.expected_source_id ?? target?.source_id ?? ""}
              />
              <Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE_OPTIONS} required defaultValue={target?.confidence ?? "nao_validada"} />
            </div>
            {target && (target.calibrated_dae != null || target.calibrated_gdd != null) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                Calibração local registrada: DAE {target.calibrated_dae ?? "—"} · GDA {target.calibrated_gdd ?? "—"}. A calibração é gerenciada na aba Calibração.
              </div>
            )}
            <TextArea id="notes" name="notes" label="Observações" defaultValue={target?.notes ?? ""} />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setEditingMarker(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
