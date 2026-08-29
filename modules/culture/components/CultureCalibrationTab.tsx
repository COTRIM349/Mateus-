"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, TextArea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  calculatePhotoperiodHours,
  summarizeThermalValues,
  totalDegreeDays,
  type DegreeDayMethod,
} from "@/modules/culture/services/thermal-time";

const MIN_OBSERVATIONS_FOR_APPROVAL = 3;

interface CultureOption {
  id: string;
  name: string;
}

interface Variety {
  id: string;
  name: string;
  calibration_status: string | null;
  basal_temperature_c: number | null;
  upper_temperature_c: number | null;
  degree_day_method: DegreeDayMethod | null;
}

interface CultureThermalConfig {
  basal_temperature_c: number | null;
  upper_temperature_c: number | null;
  degree_day_method: DegreeDayMethod | null;
}

interface Marker {
  id: string;
  stage_code: string;
  name: string;
  marker_order: number;
  critical_water_stage: boolean;
}

interface Parcel {
  id: string;
  pivot_id: string;
  variety_id: string | null;
  planting_date: string;
  emergence_date: string | null;
  status: string;
}

interface Pivot {
  id: string;
  name: string;
  farm_id: string;
  latitude: number | null;
}

interface Observation {
  id: string;
  pivot_crop_assignment_id: string;
  variety_id: string | null;
  marker_id: string;
  observed_date: string;
  dae: number;
  gdd_accumulated: number | null;
  photoperiod_hours: number | null;
  quality: string;
  notes: string | null;
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
  confidence: string;
}

interface Calibration {
  id: string;
  variety_id: string | null;
  marker_id: string | null;
  calibration_type: string;
  n_observations: number;
  mean_gdd: number | null;
  median_gdd: number | null;
  sd_gdd: number | null;
  cv_pct: number | null;
  rmse_days: number | null;
  status: string;
  created_at: string;
}

function dateDiffDays(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export function CultureCalibrationTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: CultureOption[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [cultureThermal, setCultureThermal] = useState<CultureThermalConfig | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [selectedVarietyId, setSelectedVarietyId] = useState("");
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const [selectedParcelId, setSelectedParcelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const pivotMap = useMemo(
    () => new Map(pivots.map((pivot) => [pivot.id, pivot])),
    [pivots],
  );

  const filteredParcels = parcels.filter(
    (parcel) => !selectedVarietyId || parcel.variety_id === selectedVarietyId,
  );

  const filteredObservations = observations.filter(
    (observation) =>
      (!selectedVarietyId || observation.variety_id === selectedVarietyId) &&
      (!selectedMarkerId || observation.marker_id === selectedMarkerId),
  );

  const gddSummary = summarizeThermalValues(
    filteredObservations
      .map((observation) => observation.gdd_accumulated)
      .filter((value): value is number => value != null && Number.isFinite(value)),
  );

  const daeSummary = summarizeThermalValues(
    filteredObservations.map((observation) => observation.dae),
  );

  const selectedTarget = targets.find(
    (target) =>
      target.variety_id === selectedVarietyId && target.marker_id === selectedMarkerId,
  );

  const currentCalibration = calibrations.find(
    (calibration) =>
      calibration.variety_id === selectedVarietyId &&
      calibration.marker_id === selectedMarkerId &&
      calibration.calibration_type === "fenologia",
  );

  async function loadCultureData(cultureId: string) {
    const [cultureResult, varietyResult, markerResult, parcelResult] = await Promise.all([
      supabase
        .from("cultures")
        .select("basal_temperature_c,upper_temperature_c,degree_day_method")
        .eq("id", cultureId)
        .single(),
      supabase
        .from("culture_varieties")
        .select("id,name,calibration_status,basal_temperature_c,upper_temperature_c,degree_day_method")
        .eq("culture_id", cultureId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("culture_phenology_markers")
        .select("id,stage_code,name,marker_order,critical_water_stage")
        .eq("culture_id", cultureId)
        .eq("active", true)
        .order("marker_order"),
      supabase
        .from("pivot_crop_assignments")
        .select("id,pivot_id,variety_id,planting_date,emergence_date,status")
        .eq("culture_id", cultureId)
        .eq("status", "ativa"),
    ]);

    setCultureThermal((cultureResult.data ?? null) as CultureThermalConfig | null);
    const nextVarieties = (varietyResult.data ?? []) as Variety[];
    const nextMarkers = (markerResult.data ?? []) as Marker[];
    const nextParcels = (parcelResult.data ?? []) as Parcel[];

    setVarieties(nextVarieties);
    setMarkers(nextMarkers);
    setParcels(nextParcels);

    setSelectedVarietyId((current) =>
      nextVarieties.some((item) => item.id === current) ? current : (nextVarieties[0]?.id ?? ""),
    );
    setSelectedMarkerId((current) =>
      nextMarkers.some((item) => item.id === current) ? current : (nextMarkers[0]?.id ?? ""),
    );

    const pivotIds = [...new Set(nextParcels.map((parcel) => parcel.pivot_id))];
    if (pivotIds.length > 0) {
      const { data } = await supabase
        .from("pivots")
        .select("id,name,farm_id,latitude")
        .in("id", pivotIds);
      setPivots((data ?? []) as Pivot[]);
    } else {
      setPivots([]);
    }
  }

  async function loadCalibrationData(cultureId: string) {
    const [observationResult, targetResult, calibrationResult] = await Promise.all([
      supabase
        .from("phenology_observations")
        .select("id,pivot_crop_assignment_id,variety_id,marker_id,observed_date,dae,gdd_accumulated,photoperiod_hours,quality,notes")
        .eq("culture_id", cultureId)
        .neq("quality", "descartada")
        .order("observed_date", { ascending: false }),
      supabase
        .from("culture_variety_phenology_targets")
        .select("id,variety_id,marker_id,expected_dae,expected_gdd,calibrated_dae,calibrated_gdd,use_calibrated,confidence"),
      supabase
        .from("culture_calibrations")
        .select("id,variety_id,marker_id,calibration_type,n_observations,mean_gdd,median_gdd,sd_gdd,cv_pct,rmse_days,status,created_at")
        .eq("culture_id", cultureId)
        .order("created_at", { ascending: false }),
    ]);

    setObservations((observationResult.data ?? []) as Observation[]);
    setTargets((targetResult.data ?? []) as Target[]);
    setCalibrations((calibrationResult.data ?? []) as Calibration[]);
  }

  useEffect(() => {
    if (!selectedCultureId) {
      setVarieties([]);
      setCultureThermal(null);
      setMarkers([]);
      setParcels([]);
      setPivots([]);
      setObservations([]);
      setTargets([]);
      setCalibrations([]);
      return;
    }

    void Promise.all([
      loadCultureData(selectedCultureId),
      loadCalibrationData(selectedCultureId),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCultureId]);

  useEffect(() => {
    const next = filteredParcels[0]?.id ?? "";
    if (!filteredParcels.some((parcel) => parcel.id === selectedParcelId)) {
      setSelectedParcelId(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVarietyId, parcels]);

  async function saveTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVarietyId || !selectedMarkerId) return;
    setSaving(true);
    setMessage("");

    const fd = new FormData(event.currentTarget);
    const numOrNull = (name: string) => {
      const value = String(fd.get(name) ?? "").trim();
      return value === "" ? null : Number(value);
    };

    const payload = {
      variety_id: selectedVarietyId,
      marker_id: selectedMarkerId,
      expected_dae: numOrNull("expected_dae"),
      expected_gdd: numOrNull("expected_gdd"),
      confidence: String(fd.get("target_confidence") ?? "nao_validada"),
      use_calibrated: selectedTarget?.use_calibrated ?? false,
    };

    const { error } = await supabase
      .from("culture_variety_phenology_targets")
      .upsert(payload, { onConflict: "variety_id,marker_id" });

    setMessage(error ? `Erro: ${error.message}` : "Alvo fenológico salvo.");
    if (!error && selectedCultureId) await loadCalibrationData(selectedCultureId);
    setSaving(false);
  }

  async function calculateGddFromSelectedClimate(input: {
    farmId: string;
    referenceDate: string;
    observedDate: string;
    dae: number;
  }): Promise<{ gdd: number | null; reason: string | null }> {
    const variety = varieties.find((item) => item.id === selectedVarietyId);
    const baseTemperatureC =
      variety?.basal_temperature_c ?? cultureThermal?.basal_temperature_c ?? null;
    const method =
      variety?.degree_day_method ?? cultureThermal?.degree_day_method ?? "simple_mean";
    const upperTemperatureC =
      variety?.upper_temperature_c ?? cultureThermal?.upper_temperature_c ?? null;

    if (baseTemperatureC == null) {
      return { gdd: null, reason: "Tb não definida para cultura/cultivar." };
    }
    if (method === "simple_mean_capped" && upperTemperatureC == null) {
      return { gdd: null, reason: "Temperatura superior não definida para o método capped." };
    }

    const { data: selections, error: selectionError } = await supabase
      .from("weather_daily_selection")
      .select("date,selected_reading_id")
      .eq("farm_id", input.farmId)
      .gte("date", input.referenceDate)
      .lte("date", input.observedDate)
      .order("date");

    if (selectionError || !selections) {
      return { gdd: null, reason: "Falha ao ler o fechamento climático diário." };
    }

    const expectedDays = input.dae + 1;
    const readingIds = selections
      .map((row) => row.selected_reading_id as string | null)
      .filter((id): id is string => Boolean(id));

    if (selections.length < expectedDays || readingIds.length !== selections.length) {
      return {
        gdd: null,
        reason: `Clima diário incompleto: ${selections.length}/${expectedDays} dias selecionados.`,
      };
    }

    const { data: readings, error: readingError } = await supabase
      .from("weather_readings")
      .select("id,date,temp_min,temp_max")
      .in("id", readingIds);

    if (readingError || !readings || readings.length !== readingIds.length) {
      return { gdd: null, reason: "Leituras climáticas selecionadas incompletas." };
    }

    const temperatures = readings
      .map((row) => ({
        date: String(row.date),
        tminC: Number(row.temp_min),
        tmaxC: Number(row.temp_max),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      gdd: totalDegreeDays(temperatures, {
        baseTemperatureC,
        upperTemperatureC,
        method,
      }),
      reason: null,
    };
  }

  async function saveObservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCultureId || !selectedMarkerId || !selectedParcelId) return;

    const parcel = parcels.find((item) => item.id === selectedParcelId);
    if (!parcel) return;
    const pivot = pivotMap.get(parcel.pivot_id);
    if (!pivot) {
      setMessage("Não foi possível identificar a fazenda do pivô.");
      return;
    }

    setSaving(true);
    setMessage("");
    const fd = new FormData(event.currentTarget);
    const observedDate = String(fd.get("observed_date") ?? "");
    const referenceDate = parcel.emergence_date ?? parcel.planting_date;
    const dae = dateDiffDays(referenceDate, observedDate);
    const gddRaw = String(fd.get("gdd_accumulated") ?? "").trim();
    const climateGdd =
      gddRaw === ""
        ? await calculateGddFromSelectedClimate({
            farmId: pivot.farm_id,
            referenceDate,
            observedDate,
            dae,
          })
        : { gdd: Number(gddRaw), reason: null };
    const photoperiod =
      pivot.latitude != null
        ? calculatePhotoperiodHours(observedDate, Number(pivot.latitude))
        : null;

    const payload = {
      farm_id: pivot.farm_id,
      pivot_crop_assignment_id: parcel.id,
      culture_id: selectedCultureId,
      variety_id: parcel.variety_id,
      marker_id: selectedMarkerId,
      observed_date: observedDate,
      dae,
      gdd_accumulated: climateGdd.gdd,
      photoperiod_hours: photoperiod,
      quality: "campo",
      notes: String(fd.get("observation_notes") ?? "").trim() || null,
    };

    const { error } = await supabase.from("phenology_observations").insert(payload);
    if (!error) {
      await supabase.from("culture_history").insert({
        culture_id: selectedCultureId,
        change_type: "observacao_fenologica",
        description: `Observação fenológica registrada em ${observedDate}`,
        new_values: payload,
      });
      setMessage(
        `Observação registrada: DAE ${dae}${climateGdd.gdd == null ? "" : ` · GDA ${climateGdd.gdd.toFixed(1)} °C·dia`}${photoperiod == null ? "" : ` · fotoperíodo ${photoperiod.toFixed(2)} h`}.${climateGdd.reason ? ` Aviso: ${climateGdd.reason}` : ""}`,
      );
      await loadCalibrationData(selectedCultureId);
    } else {
      setMessage(`Erro: ${error.message}`);
    }
    setSaving(false);
  }

  async function createDraftCalibration() {
    if (!selectedCultureId || !selectedVarietyId || !selectedMarkerId) return;

    const parcel = filteredParcels[0];
    const pivot = parcel ? pivotMap.get(parcel.pivot_id) : null;
    if (!pivot) {
      setMessage("É necessário ter uma parcela ativa para identificar a fazenda da calibração.");
      return;
    }

    const n = filteredObservations.length;
    if (n === 0) {
      setMessage("Nenhuma observação de campo para este estádio/cultivar.");
      return;
    }

    setSaving(true);
    const predictedDae = selectedTarget?.expected_dae;
    const rmse =
      predictedDae == null
        ? null
        : Math.sqrt(
            filteredObservations.reduce(
              (sum, observation) => sum + (observation.dae - predictedDae) ** 2,
              0,
            ) / n,
          );

    const payload = {
      farm_id: pivot.farm_id,
      culture_id: selectedCultureId,
      variety_id: selectedVarietyId,
      marker_id: selectedMarkerId,
      calibration_type: "fenologia",
      n_observations: n,
      mean_gdd: gddSummary.mean,
      median_gdd: gddSummary.median,
      sd_gdd: gddSummary.standardDeviation,
      cv_pct: gddSummary.cvPct,
      rmse_days: rmse == null ? null : Number(rmse.toFixed(2)),
      parameters: {
        mean_dae: daeSummary.mean,
        median_dae: daeSummary.median,
        min_dae: daeSummary.min,
        max_dae: daeSummary.max,
        p10_dae: daeSummary.p10,
        p90_dae: daeSummary.p90,
        minimum_observations_for_approval: MIN_OBSERVATIONS_FOR_APPROVAL,
      },
      status: "rascunho",
      notes: "Calibração gerada a partir de observações de campo. Não ativa até aprovação explícita.",
    };

    const { error } = await supabase.from("culture_calibrations").insert(payload);
    setMessage(error ? `Erro: ${error.message}` : "Rascunho de calibração criado. Ainda não altera o motor.");
    if (!error) await loadCalibrationData(selectedCultureId);
    setSaving(false);
  }

  async function approveCalibration() {
    if (!currentCalibration || !selectedCultureId || !selectedVarietyId || !selectedMarkerId) return;
    if (currentCalibration.n_observations < MIN_OBSERVATIONS_FOR_APPROVAL) {
      setMessage(
        `Aprovação bloqueada: são necessárias pelo menos ${MIN_OBSERVATIONS_FOR_APPROVAL} observações independentes para evitar calibrar com um único evento.`,
      );
      return;
    }

    setSaving(true);
    setMessage("");

    const { error: calibrationError } = await supabase
      .from("culture_calibrations")
      .update({ status: "aprovada", approved_at: new Date().toISOString() })
      .eq("id", currentCalibration.id);

    if (calibrationError) {
      setMessage(`Erro: ${calibrationError.message}`);
      setSaving(false);
      return;
    }

    const targetPayload = {
      variety_id: selectedVarietyId,
      marker_id: selectedMarkerId,
      calibrated_dae: daeSummary.mean,
      calibrated_gdd: gddSummary.mean,
      use_calibrated: true,
      confidence: currentCalibration.n_observations >= 5 ? "alta" : "media",
    };

    const { error: targetError } = await supabase
      .from("culture_variety_phenology_targets")
      .upsert(targetPayload, { onConflict: "variety_id,marker_id" });

    if (!targetError) {
      await supabase
        .from("culture_varieties")
        .update({
          calibration_status: "calibracao_parcial",
          last_calibrated_at: new Date().toISOString(),
        })
        .eq("id", selectedVarietyId);

      await supabase.from("culture_history").insert({
        culture_id: selectedCultureId,
        change_type: "calibracao_aprovada",
        description: "Calibração fenológica local aprovada para cultivar/estádio",
        new_values: targetPayload,
      });
      setMessage("Calibração aprovada e ativada para este estádio. A literatura permanece registrada.");
      await Promise.all([
        loadCultureData(selectedCultureId),
        loadCalibrationData(selectedCultureId),
      ]);
    } else {
      setMessage(`Calibração aprovada, mas o alvo não foi atualizado: ${targetError.message}`);
    }
    setSaving(false);
  }

  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId);
  const selectedVariety = varieties.find((variety) => variety.id === selectedVarietyId);

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Select
            id="calibration_culture"
            name="calibration_culture"
            label="Cultura"
            options={cultures.map((culture) => ({ value: culture.id, label: culture.name }))}
            value={selectedCultureId ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              onSelectCulture(event.target.value || null)
            }
          />
          <Select
            id="calibration_variety"
            name="calibration_variety"
            label="Cultivar"
            options={varieties.map((variety) => ({ value: variety.id, label: variety.name }))}
            value={selectedVarietyId}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedVarietyId(event.target.value)
            }
          />
          <Select
            id="calibration_marker"
            name="calibration_marker"
            label="Estádio / marcador"
            options={markers.map((marker) => ({
              value: marker.id,
              label: `${marker.stage_code} · ${marker.name}${marker.critical_water_stage ? " · crítico" : ""}`,
            }))}
            value={selectedMarkerId}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedMarkerId(event.target.value)
            }
          />
        </div>
      </Card>

      {selectedVariety && selectedMarker && (
        <>
          <Card>
            <form onSubmit={saveTarget} className="space-y-4 p-5">
              <div>
                <h3 className="font-semibold text-graphite-900 dark:text-white">Referência esperada da cultivar</h3>
                <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                  O valor esperado pode vir de obtentor/literatura. O valor calibrado é mantido separado e só entra após aprovação.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  id="expected_dae"
                  name="expected_dae"
                  label="DAE esperado"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={selectedTarget?.expected_dae ?? ""}
                />
                <Input
                  id="expected_gdd"
                  name="expected_gdd"
                  label="GDA esperado (°C·dia)"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={selectedTarget?.expected_gdd ?? ""}
                />
                <Select
                  id="target_confidence"
                  name="target_confidence"
                  label="Confiança"
                  options={[
                    { value: "alta", label: "Alta" },
                    { value: "media", label: "Média" },
                    { value: "baixa", label: "Baixa" },
                    { value: "nao_validada", label: "Não validada" },
                  ]}
                  defaultValue={selectedTarget?.confidence ?? "nao_validada"}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>Salvar referência</Button>
              </div>
            </form>
          </Card>

          <Card>
            <form onSubmit={saveObservation} className="space-y-4 p-5">
              <div>
                <h3 className="font-semibold text-graphite-900 dark:text-white">Observação de campo</h3>
                <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                  A observação real ancora a previsão. DAE é calculado pela emergência quando disponível; fotoperíodo é calculado pela latitude do pivô.
                </p>
              </div>

              {filteredParcels.length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Nenhuma parcela ativa desta cultivar foi encontrada.
                </p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Select
                      id="observation_parcel"
                      name="observation_parcel"
                      label="Parcela ativa"
                      options={filteredParcels.map((parcel) => ({
                        value: parcel.id,
                        label: `${pivotMap.get(parcel.pivot_id)?.name ?? "Pivô"} · plantio ${parcel.planting_date}`,
                      }))}
                      value={selectedParcelId}
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                        setSelectedParcelId(event.target.value)
                      }
                    />
                    <Input
                      id="observed_date"
                      name="observed_date"
                      label="Data observada"
                      type="date"
                      required
                    />
                    <Input
                      id="gdd_accumulated"
                      name="gdd_accumulated"
                      label="GDA acumulado observado"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="Opcional: vazio = calcular pelo fechamento climático validado"
                    />
                  </div>
                  <TextArea
                    id="observation_notes"
                    name="observation_notes"
                    label="Observação"
                    placeholder="Uniformidade, parcela representativa, condição da lavoura..."
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>Registrar estádio observado</Button>
                  </div>
                </>
              )}
            </form>
          </Card>

          <Card>
            <div className="space-y-5 p-5">
              <div>
                <h3 className="font-semibold text-graphite-900 dark:text-white">Resumo da calibração local</h3>
                <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                  O sistema nunca substitui a literatura com uma única observação. A aprovação explícita ativa apenas o estádio calibrado.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Observações", String(filteredObservations.length)],
                  ["DAE médio", daeSummary.mean?.toFixed(1) ?? "—"],
                  ["GDA médio", gddSummary.mean?.toFixed(1) ?? "—"],
                  ["CV GDA", gddSummary.cvPct == null ? "—" : `${gddSummary.cvPct.toFixed(1)}%`],
                  ["Status", currentCalibration?.status ?? "sem rascunho"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-white/[0.08]">
                    <div className="text-[11px] uppercase tracking-wide text-graphite-400">{label}</div>
                    <div className="mt-1 font-semibold text-graphite-900 dark:text-white">{value}</div>
                  </div>
                ))}
              </div>

              {selectedTarget?.use_calibrated && (
                <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  Calibração ativa para {selectedMarker.stage_code}: DAE {selectedTarget.calibrated_dae ?? "—"} · GDA {selectedTarget.calibrated_gdd ?? "—"}.
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="secondary" type="button" onClick={() => void createDraftCalibration()} disabled={saving}>
                  Gerar rascunho estatístico
                </Button>
                <Button
                  type="button"
                  onClick={() => void approveCalibration()}
                  disabled={saving || !currentCalibration || currentCalibration.status === "aprovada"}
                >
                  Aprovar calibração
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-graphite-400">
                    <tr>
                      <th className="py-2">Data</th>
                      <th>DAE</th>
                      <th>GDA</th>
                      <th>Fotoperíodo</th>
                      <th>Parcela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredObservations.map((observation) => {
                      const parcel = parcels.find((item) => item.id === observation.pivot_crop_assignment_id);
                      const pivot = parcel ? pivotMap.get(parcel.pivot_id) : null;
                      return (
                        <tr key={observation.id} className="border-t border-slate-100 dark:border-white/[0.05]">
                          <td className="py-2">{observation.observed_date}</td>
                          <td>{observation.dae}</td>
                          <td>{observation.gdd_accumulated ?? "—"}</td>
                          <td>{observation.photoperiod_hours == null ? "—" : `${observation.photoperiod_hours.toFixed(2)} h`}</td>
                          <td>{pivot?.name ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {filteredObservations.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-graphite-400">
                          Nenhuma observação para este estádio/cultivar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </>
      )}

      {message && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-graphite-700 dark:bg-white/[0.03] dark:text-gray-300">
          {message}
        </p>
      )}
    </div>
  );
}
