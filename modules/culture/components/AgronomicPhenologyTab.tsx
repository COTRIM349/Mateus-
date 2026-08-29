"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface CultureOption {
  id: string;
  name: string;
}

interface CultivarOption {
  id: string;
  name: string;
}

interface SourceOption {
  id: string;
  title: string | null;
  institution: string | null;
}

interface PhenologyScale {
  id: string;
  culture_id: string;
  name: string;
  source_id: string | null;
}

interface PhenologyStage {
  id: string;
  scale_id: string;
  source_id: string | null;
  code: string;
  name: string;
  stage_order: number;
  stage_group: string | null;
  description: string | null;
}

interface PhenologyTarget {
  id: string;
  cultivar_id: string;
  stage_id: string;
  dae_bibliographic: number | null;
  dae_expected: number | null;
  gdd_expected: number | null;
  dae_calibrated: number | null;
  gdd_calibrated: number | null;
  source_id: string | null;
  confidence: string;
  validation_status: string;
  notes: string | null;
}

const CONFIDENCE_OPTIONS = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
  { value: "nao_validada", label: "Não validada" },
];

const VALIDATION_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "review", label: "Em revisão" },
  { value: "approved", label: "Aprovado" },
  { value: "rejected", label: "Rejeitado" },
];

function numberOrNull(v: FormDataEntryValue | null): number | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
  const [cultivarId, setCultivarId] = useState<string>("");
  const [scales, setScales] = useState<PhenologyScale[]>([]);
  const [stages, setStages] = useState<PhenologyStage[]>([]);
  const [targets, setTargets] = useState<PhenologyTarget[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [editingStage, setEditingStage] = useState<PhenologyStage | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    if (!selectedCultureId) {
      setCultivars([]);
      setScales([]);
      setStages([]);
      setTargets([]);
      setCultivarId("");
      return;
    }
    setLoading(true);

    const [cultivarRes, scaleRes, sourceRes] = await Promise.all([
      supabase.from("culture_varieties").select("id,name").eq("culture_id", selectedCultureId).eq("active", true).order("name"),
      supabase.from("phenology_scales").select("id,culture_id,name,source_id").eq("culture_id", selectedCultureId).eq("active", true).order("name"),
      supabase.from("agronomic_sources").select("id,title,institution").eq("active", true).order("created_at", { ascending: false }),
    ]);

    const cultivarRows = (cultivarRes.data ?? []) as CultivarOption[];
    setCultivars(cultivarRows);
    setSources((sourceRes.data ?? []) as SourceOption[]);
    const scaleRows = (scaleRes.data ?? []) as PhenologyScale[];
    setScales(scaleRows);

    const currentCultivar = cultivarId && cultivarRows.some((v) => v.id === cultivarId)
      ? cultivarId
      : cultivarRows[0]?.id ?? "";
    if (currentCultivar !== cultivarId) setCultivarId(currentCultivar);

    const scaleIds = scaleRows.map((s) => s.id);
    if (scaleIds.length > 0) {
      const { data } = await supabase
        .from("phenology_stages")
        .select("id,scale_id,source_id,code,name,stage_order,stage_group,description")
        .in("scale_id", scaleIds)
        .order("stage_order");
      setStages((data ?? []) as PhenologyStage[]);
    } else {
      setStages([]);
    }

    setLoading(false);
  }, [cultivarId, selectedCultureId, supabase]);

  useEffect(() => { void loadBase(); }, [selectedCultureId]);

  const loadTargets = useCallback(async () => {
    if (!cultivarId) {
      setTargets([]);
      return;
    }
    const { data } = await supabase
      .from("cultivar_phenology_targets")
      .select("*")
      .eq("cultivar_id", cultivarId);
    setTargets((data ?? []) as PhenologyTarget[]);
  }, [cultivarId, supabase]);

  useEffect(() => { void loadTargets(); }, [loadTargets]);

  const targetsByStage = useMemo(
    () => Object.fromEntries(targets.map((t) => [t.stage_id, t])),
    [targets],
  );
  const sourceLabel = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s.title || s.institution || "Fonte"])),
    [sources],
  );

  const sourceOptions = [
    { value: "", label: "Selecione a fonte" },
    ...sources.map((s) => ({ value: s.id, label: s.title || s.institution || "Fonte" })),
  ];

  const columns: Column<PhenologyStage>[] = [
    {
      header: "Estádio",
      render: (stage) => (
        <div>
          <p className="font-semibold text-graphite-900 dark:text-white">{stage.code}</p>
          <p className="text-xs text-graphite-400">{stage.name}</p>
        </div>
      ),
    },
    { header: "Grupo", render: (stage) => stage.stage_group ?? "—" },
    {
      header: "DAE bibliog.",
      align: "right",
      render: (stage) => targetsByStage[stage.id]?.dae_bibliographic ?? "—",
    },
    {
      header: "DAE esperado",
      align: "right",
      render: (stage) => targetsByStage[stage.id]?.dae_expected ?? "—",
    },
    {
      header: "GDA esperado",
      align: "right",
      render: (stage) => targetsByStage[stage.id]?.gdd_expected ?? "—",
    },
    {
      header: "Calibração local",
      render: (stage) => {
        const target = targetsByStage[stage.id];
        if (!target || (target.dae_calibrated == null && target.gdd_calibrated == null)) return "—";
        return `DAE ${target.dae_calibrated ?? "—"} · GDA ${target.gdd_calibrated ?? "—"}`;
      },
    },
    {
      header: "Origem",
      render: (stage) => {
        const target = targetsByStage[stage.id];
        const id = target?.source_id ?? stage.source_id;
        return (
          <div>
            <p className="text-xs">{id ? sourceLabel[id] ?? "Fonte arquivada" : "Sem fonte específica"}</p>
            {target && <p className="text-[11px] text-graphite-400">{target.confidence} · {target.validation_status}</p>}
          </div>
        );
      },
    },
    {
      header: "Ações",
      align: "right",
      render: (stage) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={!cultivarId}
          onClick={() => { setEditingStage(stage); setError(""); }}
        >
          Parâmetros
        </Button>
      ),
    },
  ];

  const saveTarget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStage || !cultivarId) return;

    const fd = new FormData(event.currentTarget);
    const sourceId = String(fd.get("source_id") ?? "").trim();
    if (!sourceId) {
      setError("Informe a fonte dos valores fenológicos.");
      return;
    }

    const payload = {
      cultivar_id: cultivarId,
      stage_id: editingStage.id,
      planting_window_id: null,
      dae_bibliographic: numberOrNull(fd.get("dae_bibliographic")),
      dae_expected: numberOrNull(fd.get("dae_expected")),
      gdd_expected: numberOrNull(fd.get("gdd_expected")),
      source_id: sourceId,
      confidence: String(fd.get("confidence") ?? "nao_validada"),
      validation_status: String(fd.get("validation_status") ?? "draft"),
      notes: String(fd.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (payload.dae_bibliographic == null && payload.dae_expected == null && payload.gdd_expected == null) {
      setError("Informe pelo menos DAE bibliográfico, DAE esperado ou GDA esperado.");
      return;
    }

    setSaving(true);
    setError("");
    const current = targetsByStage[editingStage.id];
    const response = current
      ? await supabase.from("cultivar_phenology_targets").update(payload).eq("id", current.id)
      : await supabase.from("cultivar_phenology_targets").insert(payload);

    if (response.error) {
      setError(response.error.message);
      setSaving(false);
      return;
    }

    setEditingStage(null);
    setSaving(false);
    await loadTargets();
  };

  const activeScale = scales[0];
  const target = editingStage ? targetsByStage[editingStage.id] : undefined;

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Select
          id="phenology_culture"
          name="phenology_culture"
          label="Cultura"
          options={cultures.map((c) => ({ value: c.id, label: c.name }))}
          value={selectedCultureId ?? ""}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(e.target.value || null)}
        />
        <Select
          id="phenology_cultivar"
          name="phenology_cultivar"
          label="Cultivar"
          options={[
            { value: "", label: cultivars.length ? "Selecione a cultivar" : "Sem cultivares" },
            ...cultivars.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={cultivarId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCultivarId(e.target.value)}
          disabled={!selectedCultureId}
        />
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-graphite-400">Escala ativa</p>
          <p className="mt-1 text-sm font-semibold text-graphite-900 dark:text-white">{activeScale?.name ?? "Sem escala"}</p>
          <p className="text-xs text-graphite-400">{activeScale?.source_id ? sourceLabel[activeScale.source_id] ?? "Fonte cadastrada" : "Sem fonte"}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
        Fenologia define <strong>quando</strong> a planta está em cada estádio. Ela não define automaticamente o Kc. Uma observação real de campo prevalecerá sobre a previsão da parcela, sem sobrescrever a literatura da cultivar.
      </div>

      <Card>
        {!selectedCultureId ? (
          <p className="py-8 text-center text-sm text-graphite-400">Selecione uma cultura.</p>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-graphite-400">Carregando fenologia...</p>
        ) : stages.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400">Nenhuma escala fenológica ativa para esta cultura.</p>
        ) : (
          <Table columns={columns} data={stages} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal
        open={!!editingStage}
        onClose={() => { setEditingStage(null); setError(""); }}
        title={editingStage ? `${editingStage.code} — ${editingStage.name}` : "Parâmetro fenológico"}
        size="lg"
      >
        {editingStage && (
          <form onSubmit={saveTarget} className="space-y-5">
            <div className="rounded-xl bg-gray-50 p-4 text-xs text-graphite-500 dark:bg-white/[0.03] dark:text-gray-400">
              {editingStage.description || "Sem descrição adicional."}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                id="dae_bibliographic"
                name="dae_bibliographic"
                label="DAE bibliográfico"
                type="number"
                step="0.1"
                min="0"
                defaultValue={target?.dae_bibliographic ?? ""}
              />
              <Input
                id="dae_expected"
                name="dae_expected"
                label="DAE esperado cultivar"
                type="number"
                step="0.1"
                min="0"
                defaultValue={target?.dae_expected ?? ""}
              />
              <Input
                id="gdd_expected"
                name="gdd_expected"
                label="GDA esperado"
                type="number"
                step="0.1"
                min="0"
                defaultValue={target?.gdd_expected ?? ""}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select id="source_id" name="source_id" label="Fonte" options={sourceOptions} required defaultValue={target?.source_id ?? ""} />
              <Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE_OPTIONS} required defaultValue={target?.confidence ?? "nao_validada"} />
              <Select id="validation_status" name="validation_status" label="Validação" options={VALIDATION_OPTIONS} required defaultValue={target?.validation_status ?? "draft"} />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              DAE/GDA calibrados não são editados manualmente nesta tela. Eles devem vir do módulo de calibração local aprovado.
            </div>

            <TextArea id="notes" name="notes" label="Observações" defaultValue={target?.notes ?? ""} />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setEditingStage(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar parâmetro"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
