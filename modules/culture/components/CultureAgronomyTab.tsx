"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, TextArea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface CultureOption {
  id: string;
  name: string;
}

interface AgronomicSource {
  id: string;
  source_key: string;
  source_type: string;
  title: string;
  institution: string | null;
  publication_year: number | null;
  citation: string;
  source_url: string | null;
}

interface CultureAgronomy {
  id: string;
  phenology_scale: string | null;
  kc_method: string | null;
  degree_day_method: string | null;
  basal_temperature_c: number | null;
  upper_temperature_c: number | null;
  optimal_temperature_c: number | null;
  photoperiod_sensitive: boolean | null;
  thermal_source_id: string | null;
  kc_source_id: string | null;
  phenology_source_id: string | null;
  agronomic_confidence: string | null;
  requires_local_calibration: boolean | null;
  agronomic_notes: string | null;
}

interface VarietyAgronomy {
  id: string;
  name: string;
  company: string | null;
  maturity: string;
  cycle_days: number | null;
  relative_maturity_group: number | null;
  growth_habit: string | null;
  long_juvenile_period: boolean | null;
  photoperiod_sensitivity: string | null;
  basal_temperature_c: number | null;
  upper_temperature_c: number | null;
  optimal_temperature_c: number | null;
  degree_day_method: string | null;
  thermal_source_id: string | null;
  phenology_source_id: string | null;
  calibration_status: string | null;
  phenology_model_level: number | null;
  calibration_notes: string | null;
}

function sourceLabel(source: AgronomicSource): string {
  const year = source.publication_year ? ` · ${source.publication_year}` : "";
  return `${source.institution ?? source.source_type} · ${source.title}${year}`;
}

export function CultureAgronomyTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: CultureOption[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sources, setSources] = useState<AgronomicSource[]>([]);
  const [culture, setCulture] = useState<CultureAgronomy | null>(null);
  const [varieties, setVarieties] = useState<VarietyAgronomy[]>([]);
  const [selectedVarietyId, setSelectedVarietyId] = useState("");
  const [savingCulture, setSavingCulture] = useState(false);
  const [savingVariety, setSavingVariety] = useState(false);
  const [message, setMessage] = useState("");

  const selectedVariety = varieties.find((item) => item.id === selectedVarietyId) ?? null;

  useEffect(() => {
    void supabase
      .from("agronomic_sources")
      .select("id,source_key,source_type,title,institution,publication_year,citation,source_url")
      .order("institution")
      .then(({ data }) => setSources((data ?? []) as AgronomicSource[]));
  }, [supabase]);

  useEffect(() => {
    if (!selectedCultureId) {
      setCulture(null);
      setVarieties([]);
      setSelectedVarietyId("");
      return;
    }

    void Promise.all([
      supabase
        .from("cultures")
        .select("id,phenology_scale,kc_method,degree_day_method,basal_temperature_c,upper_temperature_c,optimal_temperature_c,photoperiod_sensitive,thermal_source_id,kc_source_id,phenology_source_id,agronomic_confidence,requires_local_calibration,agronomic_notes")
        .eq("id", selectedCultureId)
        .single(),
      supabase
        .from("culture_varieties")
        .select("id,name,company,maturity,cycle_days,relative_maturity_group,growth_habit,long_juvenile_period,photoperiod_sensitivity,basal_temperature_c,upper_temperature_c,optimal_temperature_c,degree_day_method,thermal_source_id,phenology_source_id,calibration_status,phenology_model_level,calibration_notes")
        .eq("culture_id", selectedCultureId)
        .eq("active", true)
        .order("name"),
    ]).then(([cultureResult, varietyResult]) => {
      setCulture((cultureResult.data ?? null) as CultureAgronomy | null);
      const nextVarieties = (varietyResult.data ?? []) as VarietyAgronomy[];
      setVarieties(nextVarieties);
      setSelectedVarietyId((current) =>
        nextVarieties.some((item) => item.id === current) ? current : (nextVarieties[0]?.id ?? ""),
      );
    });
  }, [selectedCultureId, supabase]);

  const sourceOptions = sources.map((source) => ({
    value: source.id,
    label: sourceLabel(source),
  }));

  const sourceById = (id: string | null | undefined) => sources.find((source) => source.id === id);

  async function saveCulture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCultureId) return;
    setSavingCulture(true);
    setMessage("");

    const fd = new FormData(event.currentTarget);
    const numOrNull = (name: string) => {
      const value = String(fd.get(name) ?? "").trim();
      return value === "" ? null : Number(value);
    };
    const strOrNull = (name: string) => {
      const value = String(fd.get(name) ?? "").trim();
      return value === "" ? null : value;
    };

    const payload = {
      phenology_scale: strOrNull("phenology_scale"),
      kc_method: "linear_phenological",
      degree_day_method: String(fd.get("degree_day_method") ?? "simple_mean"),
      basal_temperature_c: numOrNull("basal_temperature_c"),
      upper_temperature_c: numOrNull("upper_temperature_c"),
      optimal_temperature_c: numOrNull("optimal_temperature_c"),
      photoperiod_sensitive: fd.get("photoperiod_sensitive") === "on",
      thermal_source_id: strOrNull("thermal_source_id"),
      kc_source_id: strOrNull("kc_source_id"),
      phenology_source_id: strOrNull("phenology_source_id"),
      agronomic_confidence: String(fd.get("agronomic_confidence") ?? "nao_validada"),
      requires_local_calibration: fd.get("requires_local_calibration") === "on",
      agronomic_notes: strOrNull("agronomic_notes"),
    };

    const { error } = await supabase.from("cultures").update(payload).eq("id", selectedCultureId);
    if (!error) {
      await supabase.from("culture_history").insert({
        culture_id: selectedCultureId,
        change_type: "parametro_agronomico",
        description: "Parâmetros agronômicos, térmicos e fontes atualizados",
        new_values: payload,
      });
      setCulture((current) => (current ? { ...current, ...payload } : current));
      setMessage("Parâmetros da cultura salvos.");
    } else {
      setMessage(`Erro: ${error.message}`);
    }
    setSavingCulture(false);
  }

  async function saveVariety(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVariety) return;
    setSavingVariety(true);
    setMessage("");

    const fd = new FormData(event.currentTarget);
    const numOrNull = (name: string) => {
      const value = String(fd.get(name) ?? "").trim();
      return value === "" ? null : Number(value);
    };
    const strOrNull = (name: string) => {
      const value = String(fd.get(name) ?? "").trim();
      return value === "" ? null : value;
    };

    const payload = {
      relative_maturity_group: numOrNull("relative_maturity_group"),
      growth_habit: strOrNull("growth_habit"),
      long_juvenile_period: fd.get("long_juvenile_period") === "on",
      photoperiod_sensitivity: strOrNull("photoperiod_sensitivity"),
      basal_temperature_c: numOrNull("variety_basal_temperature_c"),
      upper_temperature_c: numOrNull("variety_upper_temperature_c"),
      optimal_temperature_c: numOrNull("variety_optimal_temperature_c"),
      degree_day_method: strOrNull("variety_degree_day_method"),
      thermal_source_id: strOrNull("variety_thermal_source_id"),
      phenology_source_id: strOrNull("variety_phenology_source_id"),
      phenology_model_level: Number(fd.get("phenology_model_level") ?? 1),
      calibration_notes: strOrNull("calibration_notes"),
    };

    const { error } = await supabase
      .from("culture_varieties")
      .update(payload)
      .eq("id", selectedVariety.id);

    if (!error) {
      await supabase.from("culture_history").insert({
        culture_id: selectedCultureId,
        change_type: "parametro_agronomico",
        description: `Parâmetros agronômicos da cultivar "${selectedVariety.name}" atualizados`,
        new_values: { variety_id: selectedVariety.id, ...payload },
      });
      setVarieties((current) =>
        current.map((item) => (item.id === selectedVariety.id ? { ...item, ...payload } : item)),
      );
      setMessage("Parâmetros da cultivar salvos.");
    } else {
      setMessage(`Erro: ${error.message}`);
    }
    setSavingVariety(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-4 p-5 md:grid-cols-[minmax(220px,320px)_1fr]">
          <Select
            id="agronomy_culture"
            name="agronomy_culture"
            label="Cultura"
            options={cultures.map((item) => ({ value: item.id, label: item.name }))}
            value={selectedCultureId ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              onSelectCulture(event.target.value || null)
            }
          />
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-graphite-600 dark:bg-white/[0.03] dark:text-gray-300">
            <strong>Regra do motor:</strong> Kc diário por interpolação linear entre âncoras fenológicas.
            CAD, CC e PMP continuam exclusivos do cadastro de solo.
          </div>
        </div>
      </Card>

      {culture && (
        <Card>
          <form onSubmit={saveCulture} className="space-y-5 p-5">
            <div>
              <h3 className="text-base font-semibold text-graphite-900 dark:text-white">Parâmetros da cultura</h3>
              <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                Literatura = referência inicial. O sistema mantém fonte, confiança e necessidade de calibração local.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                id="phenology_scale"
                name="phenology_scale"
                label="Escala fenológica"
                defaultValue={culture.phenology_scale ?? ""}
                placeholder="Ex.: Fehr & Caviness (VE–R8)"
              />
              <Select
                id="degree_day_method"
                name="degree_day_method"
                label="Método de graus-dia"
                options={[
                  { value: "simple_mean", label: "Média simples: max(0, Tmédia − Tb)" },
                  { value: "simple_mean_capped", label: "Média simples com limite superior" },
                ]}
                defaultValue={culture.degree_day_method ?? "simple_mean"}
              />
              <Input
                id="kc_method_display"
                name="kc_method_display"
                label="Método de Kc"
                value="Linear fenológico"
                readOnly
              />
              <Input
                id="basal_temperature_c"
                name="basal_temperature_c"
                label="Tb da cultura (°C)"
                type="number"
                step="0.1"
                min="0"
                max="30"
                defaultValue={culture.basal_temperature_c ?? ""}
              />
              <Input
                id="upper_temperature_c"
                name="upper_temperature_c"
                label="Temperatura superior (°C)"
                type="number"
                step="0.1"
                min="0"
                max="60"
                defaultValue={culture.upper_temperature_c ?? ""}
              />
              <Input
                id="optimal_temperature_c"
                name="optimal_temperature_c"
                label="Temperatura ótima (°C)"
                type="number"
                step="0.1"
                min="0"
                max="45"
                defaultValue={culture.optimal_temperature_c ?? ""}
              />
              <Select
                id="agronomic_confidence"
                name="agronomic_confidence"
                label="Confiança do cadastro"
                options={[
                  { value: "alta", label: "Alta" },
                  { value: "media", label: "Média" },
                  { value: "baixa", label: "Baixa" },
                  { value: "nao_validada", label: "Não validada" },
                ]}
                defaultValue={culture.agronomic_confidence ?? "nao_validada"}
              />
              <Select
                id="thermal_source_id"
                name="thermal_source_id"
                label="Fonte — graus-dia/Tb"
                options={[{ value: "", label: "Sem fonte definida" }, ...sourceOptions]}
                defaultValue={culture.thermal_source_id ?? ""}
              />
              <Select
                id="kc_source_id"
                name="kc_source_id"
                label="Fonte — Kc"
                options={[{ value: "", label: "Sem fonte definida" }, ...sourceOptions]}
                defaultValue={culture.kc_source_id ?? ""}
              />
              <Select
                id="phenology_source_id"
                name="phenology_source_id"
                label="Fonte — fenologia"
                options={[{ value: "", label: "Sem fonte definida" }, ...sourceOptions]}
                defaultValue={culture.phenology_source_id ?? ""}
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  name="photoperiod_sensitive"
                  defaultChecked={culture.photoperiod_sensitive ?? false}
                  className="h-4 w-4 accent-brand-500"
                />
                Fenologia sensível ao fotoperíodo
              </label>
              <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  name="requires_local_calibration"
                  defaultChecked={culture.requires_local_calibration ?? true}
                  className="h-4 w-4 accent-brand-500"
                />
                Requer calibração local
              </label>
            </div>

            <TextArea
              id="agronomic_notes"
              name="agronomic_notes"
              label="Notas agronômicas"
              defaultValue={culture.agronomic_notes ?? ""}
            />

            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Térmica", culture.thermal_source_id],
                ["Kc", culture.kc_source_id],
                ["Fenologia", culture.phenology_source_id],
              ].map(([label, id]) => {
                const source = sourceById(id);
                return (
                  <div key={label} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-white/[0.08]">
                    <div className="font-semibold text-graphite-700 dark:text-gray-200">Fonte {label}</div>
                    <div className="mt-1 text-graphite-500 dark:text-gray-400">
                      {source ? source.citation : "Sem fonte vinculada"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={savingCulture}>
                {savingCulture ? "Salvando..." : "Salvar agronomia da cultura"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {selectedCultureId && (
        <Card>
          <div className="space-y-5 p-5">
            <div>
              <h3 className="text-base font-semibold text-graphite-900 dark:text-white">Cultivar / variedade</h3>
              <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                A cultivar pode sobrescrever Tb e fenologia da cultura somente quando houver fonte ou calibração.
              </p>
            </div>

            {varieties.length === 0 ? (
              <p className="text-sm text-graphite-400">Nenhuma cultivar cadastrada para esta cultura.</p>
            ) : (
              <>
                <Select
                  id="agronomy_variety"
                  name="agronomy_variety"
                  label="Cultivar"
                  options={varieties.map((item) => ({
                    value: item.id,
                    label: `${item.name}${item.company ? ` · ${item.company}` : ""}`,
                  }))}
                  value={selectedVarietyId}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedVarietyId(event.target.value)
                  }
                />

                {selectedVariety && (
                  <form key={selectedVariety.id} onSubmit={saveVariety} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Input
                        id="relative_maturity_group"
                        name="relative_maturity_group"
                        label="Grupo de maturidade relativa (soja)"
                        type="number"
                        step="0.1"
                        min="0"
                        max="12"
                        defaultValue={selectedVariety.relative_maturity_group ?? ""}
                      />
                      <Select
                        id="growth_habit"
                        name="growth_habit"
                        label="Hábito de crescimento"
                        options={[
                          { value: "", label: "Sem informação" },
                          { value: "determinado", label: "Determinado" },
                          { value: "semideterminado", label: "Semideterminado" },
                          { value: "indeterminado", label: "Indeterminado" },
                          { value: "desconhecido", label: "Desconhecido" },
                        ]}
                        defaultValue={selectedVariety.growth_habit ?? ""}
                      />
                      <Select
                        id="photoperiod_sensitivity"
                        name="photoperiod_sensitivity"
                        label="Sensibilidade ao fotoperíodo"
                        options={[
                          { value: "", label: "Sem informação" },
                          { value: "baixa", label: "Baixa" },
                          { value: "media", label: "Média" },
                          { value: "alta", label: "Alta" },
                          { value: "desconhecida", label: "Desconhecida" },
                        ]}
                        defaultValue={selectedVariety.photoperiod_sensitivity ?? ""}
                      />
                      <Input
                        id="variety_basal_temperature_c"
                        name="variety_basal_temperature_c"
                        label="Tb específica da cultivar (°C)"
                        type="number"
                        step="0.1"
                        min="0"
                        max="30"
                        defaultValue={selectedVariety.basal_temperature_c ?? ""}
                      />
                      <Input
                        id="variety_upper_temperature_c"
                        name="variety_upper_temperature_c"
                        label="Temperatura superior da cultivar (°C)"
                        type="number"
                        step="0.1"
                        min="0"
                        max="60"
                        defaultValue={selectedVariety.upper_temperature_c ?? ""}
                      />
                      <Input
                        id="variety_optimal_temperature_c"
                        name="variety_optimal_temperature_c"
                        label="Temperatura ótima da cultivar (°C)"
                        type="number"
                        step="0.1"
                        min="0"
                        max="45"
                        defaultValue={selectedVariety.optimal_temperature_c ?? ""}
                      />
                      <Select
                        id="variety_degree_day_method"
                        name="variety_degree_day_method"
                        label="Método térmico da cultivar"
                        options={[
                          { value: "", label: "Herdar da cultura" },
                          { value: "simple_mean", label: "Média simples" },
                          { value: "simple_mean_capped", label: "Média com limite superior" },
                        ]}
                        defaultValue={selectedVariety.degree_day_method ?? ""}
                      />
                      <Select
                        id="phenology_model_level"
                        name="phenology_model_level"
                        label="Nível do modelo fenológico"
                        options={[
                          { value: "1", label: "1 · DAE + cultivar + janela" },
                          { value: "2", label: "2 · GDA + cultivar + janela" },
                          { value: "3", label: "3 · GDA + fotoperíodo" },
                          { value: "4", label: "4 · Modelo local calibrado" },
                        ]}
                        defaultValue={String(selectedVariety.phenology_model_level ?? 1)}
                      />
                      <Input
                        id="calibration_status_display"
                        name="calibration_status_display"
                        label="Status de calibração"
                        value={(selectedVariety.calibration_status ?? "nao_calibrada").replaceAll("_", " ")}
                        readOnly
                      />
                      <Select
                        id="variety_thermal_source_id"
                        name="variety_thermal_source_id"
                        label="Fonte térmica da cultivar"
                        options={[{ value: "", label: "Herdar / sem fonte específica" }, ...sourceOptions]}
                        defaultValue={selectedVariety.thermal_source_id ?? ""}
                      />
                      <Select
                        id="variety_phenology_source_id"
                        name="variety_phenology_source_id"
                        label="Fonte fenológica da cultivar"
                        options={[{ value: "", label: "Herdar / sem fonte específica" }, ...sourceOptions]}
                        defaultValue={selectedVariety.phenology_source_id ?? ""}
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm text-graphite-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        name="long_juvenile_period"
                        defaultChecked={selectedVariety.long_juvenile_period ?? false}
                        className="h-4 w-4 accent-brand-500"
                      />
                      Período juvenil longo informado para a cultivar
                    </label>

                    <TextArea
                      id="calibration_notes"
                      name="calibration_notes"
                      label="Notas de calibração da cultivar"
                      defaultValue={selectedVariety.calibration_notes ?? ""}
                    />

                    <div className="flex justify-end">
                      <Button type="submit" disabled={savingVariety}>
                        {savingVariety ? "Salvando..." : "Salvar cultivar"}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {message && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-graphite-700 dark:bg-white/[0.03] dark:text-gray-300">
          {message}
        </p>
      )}
    </div>
  );
}
