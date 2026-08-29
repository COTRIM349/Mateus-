"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface CultureOption {
  id: string;
  name: string;
  scientific_name?: string | null;
}

interface SourceOption {
  id: string;
  title: string | null;
  institution: string | null;
  source_type: string;
}

interface CultivarRow {
  id: string;
  culture_id: string;
  name: string;
  company: string | null;
  breeder: string | null;
  technology: string | null;
  maturity: string | null;
  cycle_days: number | null;
  manufacturer_cycle_days: number | null;
  planning_occupancy_days: number | null;
  relative_maturity_group: number | null;
  growth_habit: string | null;
  long_juvenile_period: boolean | null;
  photoperiod_sensitivity: string | null;
  adaptation_region: string | null;
  recommended_population_min: number | null;
  recommended_population_max: number | null;
  recommended_spacing_m: number | null;
  expected_height_m: number | null;
  architecture: string | null;
  lodging_sensitivity: string | null;
  regulator_sensitivity: string | null;
  calibration_status: string;
  data_source_id: string | null;
  data_confidence: string;
  observations: string | null;
  active: boolean;
}

const MATURITY_OPTIONS = [
  { value: "", label: "Sem informação" },
  { value: "precoce", label: "Precoce" },
  { value: "medio", label: "Médio" },
  { value: "tardio", label: "Tardio" },
];

const GROWTH_HABIT_OPTIONS = [
  { value: "", label: "Sem informação" },
  { value: "determinado", label: "Determinado" },
  { value: "semideterminado", label: "Semideterminado" },
  { value: "indeterminado", label: "Indeterminado" },
  { value: "desconhecido", label: "Desconhecido" },
];

const PHOTOPERIOD_OPTIONS = [
  { value: "", label: "Sem informação" },
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "desconhecida", label: "Desconhecida" },
];

const CONFIDENCE_OPTIONS = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
  { value: "nao_validada", label: "Não validada" },
];

const CALIBRATION_LABELS: Record<string, string> = {
  nao_calibrada: "Não calibrada",
  em_calibracao: "Em calibração",
  calibracao_parcial: "Calibração parcial",
  calibrada_localmente: "Calibrada localmente",
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cultureKind(culture?: CultureOption): "soja" | "algodao" | "outro" {
  if (!culture) return "outro";
  const n = normalize(`${culture.name} ${culture.scientific_name ?? ""}`);
  if (n.includes("soja") || n.includes("glycine max")) return "soja";
  if (n.includes("algodao") || n.includes("gossypium")) return "algodao";
  return "outro";
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function AgronomicCultivarsTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: CultureOption[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<CultivarRow[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CultivarRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CultivarRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCulture = cultures.find((c) => c.id === selectedCultureId);
  const kind = cultureKind(selectedCulture);

  const load = useCallback(async () => {
    if (!selectedCultureId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const [cultivarResponse, sourceResponse] = await Promise.all([
      supabase
        .from("culture_varieties")
        .select("*")
        .eq("culture_id", selectedCultureId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("agronomic_sources")
        .select("id,title,institution,source_type")
        .eq("active", true)
        .order("created_at", { ascending: false }),
    ]);
    if (!cultivarResponse.error && cultivarResponse.data) setRows(cultivarResponse.data as CultivarRow[]);
    if (!sourceResponse.error && sourceResponse.data) setSources(sourceResponse.data as SourceOption[]);
    setLoading(false);
  }, [selectedCultureId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const sourceById = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s.title || s.institution || s.source_type])),
    [sources],
  );

  const columns: Column<CultivarRow>[] = [
    {
      header: "Cultivar",
      render: (r) => (
        <div>
          <p className="font-medium text-graphite-900 dark:text-white">{r.name}</p>
          <p className="text-xs text-graphite-400">{r.technology || r.breeder || r.company || "Sem tecnologia/obtentor informado"}</p>
        </div>
      ),
    },
    ...(kind === "soja"
      ? [{ header: "GRM", render: (r: CultivarRow) => r.relative_maturity_group ?? "—", align: "right" as const }]
      : []),
    { header: "Classe ciclo", render: (r) => r.maturity ? (r.maturity === "medio" ? "Médio" : r.maturity[0].toUpperCase() + r.maturity.slice(1)) : "—" },
    { header: "Ocupação", render: (r) => r.planning_occupancy_days != null ? `${r.planning_occupancy_days} d` : "—", align: "right" },
    {
      header: "Fonte",
      render: (r) => (
        <div>
          <p className="text-xs">{r.data_source_id ? sourceById[r.data_source_id] ?? "Fonte arquivada" : "Sem fonte"}</p>
          <p className={`text-[11px] ${r.data_confidence === "nao_validada" ? "text-amber-600" : "text-graphite-400"}`}>
            {r.data_confidence === "nao_validada" ? "Não validada" : r.data_confidence}
          </p>
        </div>
      ),
    },
    { header: "Calibração", render: (r) => CALIBRATION_LABELS[r.calibration_status] ?? r.calibration_status },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setError(""); setModalOpen(true); }}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Desativar</Button>
        </div>
      ),
    },
  ];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCultureId) return;

    const fd = new FormData(event.currentTarget);
    const sourceId = textOrNull(fd.get("data_source_id"));
    if (!sourceId) {
      setError("A fonte é obrigatória. Cadastre-a primeiro na aba Fontes.");
      return;
    }

    const breeder = textOrNull(fd.get("breeder"));
    const payload = {
      culture_id: selectedCultureId,
      name: String(fd.get("name") ?? "").trim(),
      breeder,
      company: breeder,
      technology: textOrNull(fd.get("technology")),
      maturity: textOrNull(fd.get("maturity")),
      relative_maturity_group: numberOrNull(fd.get("relative_maturity_group")),
      manufacturer_cycle_days: numberOrNull(fd.get("manufacturer_cycle_days")),
      planning_occupancy_days: numberOrNull(fd.get("planning_occupancy_days")),
      growth_habit: textOrNull(fd.get("growth_habit")),
      long_juvenile_period:
        fd.get("long_juvenile_period") === "sim"
          ? true
          : fd.get("long_juvenile_period") === "nao"
            ? false
            : null,
      photoperiod_sensitivity: textOrNull(fd.get("photoperiod_sensitivity")),
      adaptation_region: textOrNull(fd.get("adaptation_region")),
      recommended_population_min: numberOrNull(fd.get("recommended_population_min")),
      recommended_population_max: numberOrNull(fd.get("recommended_population_max")),
      recommended_spacing_m: numberOrNull(fd.get("recommended_spacing_m")),
      expected_height_m: numberOrNull(fd.get("expected_height_m")),
      architecture: textOrNull(fd.get("architecture")),
      lodging_sensitivity: textOrNull(fd.get("lodging_sensitivity")),
      regulator_sensitivity: textOrNull(fd.get("regulator_sensitivity")),
      data_source_id: sourceId,
      data_confidence: String(fd.get("data_confidence") ?? "nao_validada"),
      observations: textOrNull(fd.get("observations")),
    };

    if (!payload.name) {
      setError("Nome da cultivar é obrigatório.");
      return;
    }

    setSaving(true);
    setError("");
    const response = editing
      ? await supabase.from("culture_varieties").update(payload).eq("id", editing.id)
      : await supabase.from("culture_varieties").insert(payload);

    if (response.error) {
      setError(response.error.message);
      setSaving(false);
      return;
    }

    await supabase.from("culture_history").insert({
      culture_id: selectedCultureId,
      change_type: editing ? "variedade_edit" : "variedade_add",
      description: `Cultivar "${payload.name}" ${editing ? "editada" : "adicionada"} com fonte rastreável`,
    });

    setSaving(false);
    setModalOpen(false);
    setEditing(null);
    await load();
  };

  const deactivate = async () => {
    if (!deleteTarget || !selectedCultureId) return;
    setSaving(true);
    await supabase.from("culture_varieties").update({ active: false }).eq("id", deleteTarget.id);
    await supabase.from("culture_history").insert({
      culture_id: selectedCultureId,
      change_type: "variedade_del",
      description: `Cultivar "${deleteTarget.name}" desativada`,
    });
    setDeleteTarget(null);
    setSaving(false);
    await load();
  };

  const sourceOptions = [
    { value: "", label: "Selecione uma fonte" },
    ...sources.map((s) => ({
      value: s.id,
      label: s.title || s.institution || s.source_type,
    })),
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[240px]">
          <Select
            id="culture_select_cultivar"
            name="culture_select_cultivar"
            label="Cultura"
            options={cultures.map((c) => ({ value: c.id, label: c.name }))}
            value={selectedCultureId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(e.target.value || null)}
          />
        </div>
        {selectedCultureId && (
          <Button onClick={() => { setEditing(null); setError(""); setModalOpen(true); }}>Nova cultivar</Button>
        )}
      </div>

      {selectedCultureId && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-graphite-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400">
          <strong className="text-graphite-800 dark:text-gray-200">Regra:</strong> janela de ocupação, ciclo do obtentor e GRM são campos diferentes. Nenhum deles gera automaticamente Kc, Tb, GDA ou duração fenológica.
        </div>
      )}

      {!selectedCultureId ? (
        <Card><p className="py-8 text-center text-sm text-graphite-400">Selecione uma cultura.</p></Card>
      ) : (
        <Card>
          {loading ? (
            <p className="py-8 text-center text-sm text-graphite-400">Carregando cultivares...</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400">Nenhuma cultivar cadastrada.</p>
          ) : (
            <Table columns={columns} data={rows} getKey={(r) => r.id} />
          )}
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setError(""); }}
        title={editing ? "Editar cultivar" : "Nova cultivar"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome da cultivar" required defaultValue={editing?.name ?? ""} />
            <Input id="breeder" name="breeder" label="Obtentor / fabricante" defaultValue={editing?.breeder ?? editing?.company ?? ""} />
            <Input id="technology" name="technology" label="Tecnologia" defaultValue={editing?.technology ?? ""} />
            <Select
              id="maturity"
              name="maturity"
              label="Classe operacional de ciclo"
              options={MATURITY_OPTIONS}
              defaultValue={editing?.maturity ?? ""}
            />
          </div>

          {kind === "soja" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="relative_maturity_group"
                name="relative_maturity_group"
                label="Grupo de maturação relativa (GRM)"
                type="number"
                step="0.1"
                defaultValue={editing?.relative_maturity_group ?? ""}
              />
              <Select
                id="growth_habit"
                name="growth_habit"
                label="Hábito de crescimento"
                options={GROWTH_HABIT_OPTIONS}
                defaultValue={editing?.growth_habit ?? ""}
              />
              <Select
                id="long_juvenile_period"
                name="long_juvenile_period"
                label="Período juvenil longo"
                options={[
                  { value: "", label: "Sem informação" },
                  { value: "sim", label: "Sim" },
                  { value: "nao", label: "Não" },
                ]}
                defaultValue={editing?.long_juvenile_period == null ? "" : editing.long_juvenile_period ? "sim" : "nao"}
              />
              <Select
                id="photoperiod_sensitivity"
                name="photoperiod_sensitivity"
                label="Sensibilidade fotoperiódica"
                options={PHOTOPERIOD_OPTIONS}
                defaultValue={editing?.photoperiod_sensitivity ?? ""}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="manufacturer_cycle_days"
              name="manufacturer_cycle_days"
              label="Ciclo informado pelo obtentor (dias)"
              type="number"
              min="1"
              defaultValue={editing?.manufacturer_cycle_days ?? ""}
            />
            <Input
              id="planning_occupancy_days"
              name="planning_occupancy_days"
              label="Janela de ocupação (dias)"
              type="number"
              min="1"
              defaultValue={editing?.planning_occupancy_days ?? ""}
            />
            <Input id="recommended_spacing_m" name="recommended_spacing_m" label="Espaçamento (m)" type="number" step="0.01" defaultValue={editing?.recommended_spacing_m ?? ""} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="adaptation_region" name="adaptation_region" label="Região de adaptação" defaultValue={editing?.adaptation_region ?? ""} />
            <Input id="architecture" name="architecture" label="Arquitetura / porte" defaultValue={editing?.architecture ?? ""} />
            <Input id="recommended_population_min" name="recommended_population_min" label="População mínima" type="number" step="1" defaultValue={editing?.recommended_population_min ?? ""} />
            <Input id="recommended_population_max" name="recommended_population_max" label="População máxima" type="number" step="1" defaultValue={editing?.recommended_population_max ?? ""} />
            <Input id="expected_height_m" name="expected_height_m" label="Altura esperada (m)" type="number" step="0.01" defaultValue={editing?.expected_height_m ?? ""} />
            {kind === "soja" ? (
              <Input id="lodging_sensitivity" name="lodging_sensitivity" label="Sensibilidade ao acamamento" defaultValue={editing?.lodging_sensitivity ?? ""} />
            ) : (
              <Input id="regulator_sensitivity" name="regulator_sensitivity" label="Sensibilidade a regulador" defaultValue={editing?.regulator_sensitivity ?? ""} />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-4 dark:border-white/[0.06]">
            <p className="mb-3 text-sm font-medium text-graphite-900 dark:text-white">Rastreabilidade do cadastro</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="data_source_id"
                name="data_source_id"
                label="Fonte"
                options={sourceOptions}
                required
                defaultValue={editing?.data_source_id ?? ""}
              />
              <Select
                id="data_confidence"
                name="data_confidence"
                label="Confiabilidade"
                options={CONFIDENCE_OPTIONS}
                required
                defaultValue={editing?.data_confidence ?? "nao_validada"}
              />
            </div>
            {sources.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">Cadastre uma fonte na aba Fontes antes de salvar parâmetros da cultivar.</p>
            )}
          </div>

          <TextArea id="observations" name="observations" label="Observações" defaultValue={editing?.observations ?? ""} />

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" disabled={saving || sources.length === 0}>{saving ? "Salvando..." : "Salvar cultivar"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deactivate}
        title="Desativar cultivar"
        message={`Desativar a cultivar "${deleteTarget?.name ?? ""}"? O histórico será preservado.`}
        confirmLabel="Desativar"
        loading={saving}
      />
    </>
  );
}
