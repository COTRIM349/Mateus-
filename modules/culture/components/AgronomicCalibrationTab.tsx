"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Table,
  TextArea,
  type Column,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  calculateCalibrationStatistics,
  calculateDayLengthHours,
  calculatePredictionErrors,
  evaluateBaseTemperatureCandidates,
  type BaseTemperatureCandidateResult,
  type ThermalObservation,
} from "@/modules/culture/services/agronomic-engine";

interface CultureOption { id: string; name: string; scientific_name?: string | null }
interface CultivarOption { id: string; name: string; calibration_status?: string }
interface SourceOption { id: string; title: string | null; institution: string | null }
interface Stage { id: string; code: string; name: string; stage_order: number; scale_id: string }
interface PlantingWindow { id: string; name: string; start_month_day: string | null; end_month_day: string | null }
interface Assignment {
  id: string;
  planting_date: string;
  emergence_date: string | null;
  culture_variety_id: string | null;
  variety_id: string | null;
  pivot_id: string;
  pivots: { name: string; latitude: number | null; longitude: number | null } | null;
  seasons: { name: string } | null;
}
interface FieldObservation {
  id: string;
  assignment_id: string;
  cultivar_id: string | null;
  stage_id: string;
  observation_date: string;
  sowing_date: string | null;
  emergence_date: string | null;
  das: number | null;
  dae: number | null;
  accumulated_gdd: number | null;
  photoperiod_hours: number | null;
  sample_size: number | null;
  sample_stage_pct: number | null;
  notes: string | null;
}
interface CalibrationRun {
  id: string;
  calibration_type: "phenology" | "base_temperature" | "kc";
  cultivar_id: string;
  planting_window_id: string | null;
  stage_id: string | null;
  min_observations_required: number | null;
  status: string;
  n_observations: number;
  mean_value: number | null;
  median_value: number | null;
  stddev_value: number | null;
  cv_pct: number | null;
  mean_error: number | null;
  mae: number | null;
  rmse: number | null;
  result_json: Record<string, unknown> | null;
  created_at: string;
}
interface PhenologyTarget {
  id: string;
  stage_id: string;
  dae_expected: number | null;
  gdd_expected: number | null;
  dae_calibrated: number | null;
  gdd_calibrated: number | null;
  expected_source_id: string | null;
  source_id: string | null;
}
interface KcObservation {
  id: string;
  assignment_id: string;
  cultivar_id: string | null;
  observation_start: string;
  observation_end: string;
  stage_id: string | null;
  dae: number | null;
  accumulated_gdd: number | null;
  eto_mm: number;
  etc_observed_mm: number;
  kc_observed: number | null;
  observation_level: "A" | "B" | "C" | "D";
  etc_method: string;
  ks_mean: number | null;
  data_quality_status: "accepted" | "review" | "excluded";
  exclusion_reasons: string[] | null;
  notes: string | null;
}
interface KcCalibrationPoint {
  id: string;
  calibration_run_id: string;
  stage_id: string | null;
  axis_type: "DAE" | "GDA" | "PHENOLOGY_PROGRESS";
  x_value: number;
  kc_value: number;
  approved: boolean;
  confidence: string;
  created_at: string;
}

type CalibrationMode = "campo" | "fenologia" | "tb" | "kc";

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  nao_validada: "Não validada",
};

function num(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function daysBetween(start: string | null, end: string): number | null {
  if (!start) return null;
  const a = Date.parse(`${start}T12:00:00Z`);
  const b = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function inWindow(date: string | null, window: PlantingWindow | null): boolean {
  if (!date || !window || !window.start_month_day || !window.end_month_day) return true;
  const md = date.slice(5);
  const start = window.start_month_day;
  const end = window.end_month_day;
  if (start <= end) return md >= start && md <= end;
  return md >= start || md <= end;
}

function confidenceFromCv(cv: number | null): "alta" | "media" | "baixa" | "nao_validada" {
  if (cv == null) return "nao_validada";
  if (cv <= 5) return "alta";
  if (cv <= 10) return "media";
  return "baixa";
}

export function AgronomicCalibrationTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: CultureOption[];
}) {
  const supabase = createClient();
  const [mode, setMode] = useState<CalibrationMode>("campo");
  const [cultivars, setCultivars] = useState<CultivarOption[]>([]);
  const [cultivarId, setCultivarId] = useState("");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [windows, setWindows] = useState<PlantingWindow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [observations, setObservations] = useState<FieldObservation[]>([]);
  const [runs, setRuns] = useState<CalibrationRun[]>([]);
  const [targets, setTargets] = useState<PhenologyTarget[]>([]);
  const [kcObservations, setKcObservations] = useState<KcObservation[]>([]);
  const [kcPoints, setKcPoints] = useState<KcCalibrationPoint[]>([]);
  const [fieldModal, setFieldModal] = useState(false);
  const [kcModal, setKcModal] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [stageId, setStageId] = useState("");
  const [windowId, setWindowId] = useState("");
  const [minObservations, setMinObservations] = useState("3");
  const [estimator, setEstimator] = useState<"median" | "mean">("median");

  const [tbMin, setTbMin] = useState("8");
  const [tbMax, setTbMax] = useState("16");
  const [tbStep, setTbStep] = useState("0.5");
  const [tbResults, setTbResults] = useState<BaseTemperatureCandidateResult[]>([]);
  const [selectedTb, setSelectedTb] = useState("");

  const [kcStageId, setKcStageId] = useState("");
  const [kcMinObservations, setKcMinObservations] = useState("3");
  const [kcAxis, setKcAxis] = useState<"DAE" | "GDA">("GDA");

  const selectedWindow = windows.find((w) => w.id === windowId) ?? null;
  const selectedStage = stages.find((s) => s.id === stageId) ?? null;
  const selectedKcStage = stages.find((s) => s.id === kcStageId) ?? null;

  const loadBase = useCallback(async () => {
    if (!selectedCultureId) {
      setCultivars([]);
      setStages([]);
      setWindows([]);
      setAssignments([]);
      return;
    }

    const [cultivarRes, sourceRes, scaleRes, windowRes, assignmentRes] = await Promise.all([
      supabase
        .from("culture_varieties")
        .select("id,name,calibration_status")
        .eq("culture_id", selectedCultureId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("agronomic_sources")
        .select("id,title,institution")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("phenology_scales")
        .select("id")
        .eq("culture_id", selectedCultureId)
        .eq("active", true),
      supabase
        .from("planting_windows")
        .select("id,name,start_month_day,end_month_day")
        .eq("culture_id", selectedCultureId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("pivot_crop_assignments")
        .select("id,planting_date,emergence_date,culture_variety_id,variety_id,pivot_id,pivots(name,latitude,longitude),seasons(name)")
        .eq("culture_id", selectedCultureId)
        .eq("active", true),
    ]);

    const cultivarRows = (cultivarRes.data ?? []) as CultivarOption[];
    setCultivars(cultivarRows);
    setSources((sourceRes.data ?? []) as SourceOption[]);
    setWindows((windowRes.data ?? []) as PlantingWindow[]);
    setAssignments((assignmentRes.data ?? []) as unknown as Assignment[]);

    const scaleIds = (scaleRes.data ?? []).map((row) => row.id as string);
    if (scaleIds.length) {
      const { data } = await supabase
        .from("phenology_stages")
        .select("id,code,name,stage_order,scale_id")
        .in("scale_id", scaleIds)
        .order("stage_order");
      setStages((data ?? []) as Stage[]);
    } else {
      setStages([]);
    }

    setCultivarId((current) =>
      cultivarRows.some((row) => row.id === current) ? current : (cultivarRows[0]?.id ?? "")
    );
  }, [selectedCultureId, supabase]);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const loadCultivarData = useCallback(async () => {
    if (!cultivarId) {
      setObservations([]);
      setRuns([]);
      setTargets([]);
      setKcObservations([]);
      setKcPoints([]);
      return;
    }

    const [obsRes, runRes, targetRes, kcObsRes] = await Promise.all([
      supabase
        .from("field_phenology_observations")
        .select("*")
        .eq("cultivar_id", cultivarId)
        .order("observation_date", { ascending: false }),
      supabase
        .from("agronomic_calibration_runs")
        .select("*")
        .eq("cultivar_id", cultivarId)
        .order("created_at", { ascending: false }),
      supabase
        .from("cultivar_phenology_targets")
        .select("id,stage_id,dae_expected,gdd_expected,dae_calibrated,gdd_calibrated,expected_source_id,source_id")
        .eq("cultivar_id", cultivarId),
      supabase
        .from("kc_calibration_observations")
        .select("*")
        .eq("cultivar_id", cultivarId)
        .order("observation_end", { ascending: false }),
    ]);

    setObservations((obsRes.data ?? []) as FieldObservation[]);
    setRuns((runRes.data ?? []) as CalibrationRun[]);
    setTargets((targetRes.data ?? []) as PhenologyTarget[]);
    setKcObservations((kcObsRes.data ?? []) as KcObservation[]);

    const kcRunIds = ((runRes.data ?? []) as CalibrationRun[])
      .filter((run) => run.calibration_type === "kc")
      .map((run) => run.id);
    if (kcRunIds.length) {
      const { data } = await supabase
        .from("kc_calibration_points")
        .select("*")
        .in("calibration_run_id", kcRunIds)
        .order("created_at", { ascending: false });
      setKcPoints((data ?? []) as KcCalibrationPoint[]);
    } else {
      setKcPoints([]);
    }
  }, [cultivarId, supabase]);

  useEffect(() => { void loadCultivarData(); }, [loadCultivarData]);

  const cultivarAssignments = useMemo(
    () => assignments.filter((a) =>
      a.culture_variety_id === cultivarId || a.variety_id === cultivarId
    ),
    [assignments, cultivarId],
  );

  const stageObservations = useMemo(
    () => observations.filter((obs) =>
      (!stageId || obs.stage_id === stageId) &&
      inWindow(obs.sowing_date, selectedWindow)
    ),
    [observations, selectedWindow, stageId],
  );

  const daeStats = useMemo(
    () => calculateCalibrationStatistics(
      stageObservations.map((obs) => obs.dae).filter((v): v is number => v != null)
    ),
    [stageObservations],
  );
  const gddStats = useMemo(
    () => calculateCalibrationStatistics(
      stageObservations.map((obs) => obs.accumulated_gdd).filter((v): v is number => v != null)
    ),
    [stageObservations],
  );

  const target = targets.find((row) => row.stage_id === stageId) ?? null;
  const daeErrors = useMemo(
    () => target?.dae_expected == null
      ? null
      : calculatePredictionErrors(
          stageObservations.map((obs) => obs.dae).filter((v): v is number => v != null),
          stageObservations.map((obs) => obs.dae).filter((v): v is number => v != null).map(() => target.dae_expected!)
        ),
    [stageObservations, target],
  );
  const gddErrors = useMemo(
    () => target?.gdd_expected == null
      ? null
      : calculatePredictionErrors(
          stageObservations.map((obs) => obs.accumulated_gdd).filter((v): v is number => v != null),
          stageObservations.map((obs) => obs.accumulated_gdd).filter((v): v is number => v != null).map(() => target.gdd_expected!)
        ),
    [stageObservations, target],
  );

  const filteredKcObservations = useMemo(
    () => kcObservations.filter((obs) => !kcStageId || obs.stage_id === kcStageId),
    [kcObservations, kcStageId],
  );
  const acceptedKc = useMemo(
    () => filteredKcObservations.filter((obs) =>
      obs.data_quality_status === "accepted" &&
      obs.observation_level !== "D" &&
      obs.kc_observed != null &&
      (obs.ks_mean == null || obs.ks_mean >= 0.95)
    ),
    [filteredKcObservations],
  );
  const kcStats = useMemo(
    () => calculateCalibrationStatistics(
      acceptedKc.map((obs) => obs.kc_observed).filter((v): v is number => v != null)
    ),
    [acceptedKc],
  );

  const stageLabel = useMemo(
    () => Object.fromEntries(stages.map((stage) => [stage.id, stage.code])),
    [stages],
  );

  async function saveFieldObservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const fd = new FormData(event.currentTarget);
    const assignmentId = String(fd.get("assignment_id") ?? "");
    const observedStageId = String(fd.get("stage_id") ?? "");
    const observationDate = String(fd.get("observation_date") ?? "");
    const assignment = cultivarAssignments.find((row) => row.id === assignmentId);
    if (!assignment || !observedStageId || !observationDate) {
      setError("Parcela, estádio e data são obrigatórios.");
      return;
    }

    setSaving(true);
    const { data: thermalRows } = await supabase
      .from("daily_thermal_time")
      .select("date,accumulated_gdd")
      .eq("assignment_id", assignmentId)
      .lte("date", observationDate)
      .order("date", { ascending: false })
      .limit(1);

    const accumulatedGdd = thermalRows?.[0]?.accumulated_gdd ?? null;
    const latitude = assignment.pivots?.latitude ?? null;
    const photoperiod = latitude == null ? null : calculateDayLengthHours(latitude, observationDate);
    const { data: auth } = await supabase.auth.getUser();

    const payload = {
      assignment_id: assignmentId,
      cultivar_id: cultivarId,
      stage_id: observedStageId,
      observation_date: observationDate,
      sowing_date: assignment.planting_date,
      emergence_date: assignment.emergence_date,
      das: daysBetween(assignment.planting_date, observationDate),
      dae: daysBetween(assignment.emergence_date, observationDate),
      accumulated_gdd: accumulatedGdd,
      photoperiod_hours: photoperiod,
      sample_size: num(String(fd.get("sample_size") ?? "")),
      sample_stage_pct: num(String(fd.get("sample_stage_pct") ?? "")),
      observer_id: auth.user?.id ?? null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    };

    const { error: insertError } = await supabase
      .from("field_phenology_observations")
      .insert(payload);

    if (insertError) {
      setError(insertError.message);
    } else {
      setNotice(
        accumulatedGdd == null
          ? "Observação salva. GDA ficou sem informação porque ainda não existe série térmica diária para a parcela."
          : "Observação salva e vinculada à série térmica da parcela."
      );
      setFieldModal(false);
      await loadCultivarData();
    }
    setSaving(false);
  }

  async function generatePhenologyCalibration() {
    if (!selectedCultureId || !cultivarId || !stageId || !windowId) {
      setError("Selecione cultivar, estádio e janela de semeadura.");
      return;
    }
    const minN = Math.max(1, Number(minObservations) || 3);
    const primaryStats = gddStats.n >= minN ? gddStats : daeStats;
    if (primaryStats.n < minN) {
      setError(`A calibração exige pelo menos ${minN} observações válidas nesta cultivar × estádio × janela.`);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    const resultJson = {
      estimator,
      dae: daeStats,
      gdd: gddStats,
      daePredictionError: daeErrors,
      gddPredictionError: gddErrors,
      window: selectedWindow?.name ?? null,
      stage: selectedStage?.code ?? null,
    };

    const { error: runError } = await supabase.from("agronomic_calibration_runs").insert({
      calibration_type: "phenology",
      culture_id: selectedCultureId,
      cultivar_id: cultivarId,
      planting_window_id: windowId,
      stage_id: stageId,
      min_observations_required: minN,
      status: "review",
      n_observations: primaryStats.n,
      mean_value: primaryStats.mean,
      median_value: primaryStats.median,
      stddev_value: primaryStats.stdDev,
      cv_pct: primaryStats.cvPct,
      min_value: primaryStats.min,
      max_value: primaryStats.max,
      p10: primaryStats.p10,
      p25: primaryStats.p25,
      p50: primaryStats.p50,
      p75: primaryStats.p75,
      p90: primaryStats.p90,
      mean_error: gddErrors?.meanError ?? daeErrors?.meanError ?? null,
      mae: gddErrors?.mae ?? daeErrors?.mae ?? null,
      rmse: gddErrors?.rmse ?? daeErrors?.rmse ?? null,
      result_json: resultJson,
      notes: "Proposta gerada a partir de observações de campo. Requer aprovação explícita.",
    });

    if (runError) setError(runError.message);
    else {
      setNotice("Proposta de calibração criada. Ela ainda NÃO está ativa; revise e use APROVAR CALIBRAÇÃO.");
      await loadCultivarData();
    }
    setSaving(false);
  }

  async function approvePhenologyRun(run: CalibrationRun) {
    if (!selectedCultureId || !cultivarId || !run.stage_id) return;
    const minN = run.min_observations_required ?? 1;
    if (run.n_observations < minN) {
      setError("A proposta não possui o número mínimo de observações exigido.");
      return;
    }

    setSaving(true);
    setError("");
    const estimatorUsed = String(run.result_json?.estimator ?? "median");
    const daeResult = run.result_json?.dae as { mean?: number | null; median?: number | null; cvPct?: number | null } | undefined;
    const gddResult = run.result_json?.gdd as { mean?: number | null; median?: number | null; cvPct?: number | null } | undefined;
    const calibratedDae = estimatorUsed === "mean" ? (daeResult?.mean ?? null) : (daeResult?.median ?? null);
    const calibratedGdd = estimatorUsed === "mean" ? (gddResult?.mean ?? null) : (gddResult?.median ?? null);
    const cv = calibratedGdd != null ? (gddResult?.cvPct ?? null) : (daeResult?.cvPct ?? null);
    const confidence = confidenceFromCv(cv ?? null);

    const { data: auth } = await supabase.auth.getUser();
    const { data: source, error: sourceError } = await supabase
      .from("agronomic_sources")
      .insert({
        source_type: "calibracao_local",
        institution: "Histórico da fazenda",
        title: `Calibração fenológica local · ${selectedStage?.code ?? "estádio"} · ${selectedWindow?.name ?? "janela"}`,
        methodology: `Estatística descritiva por cultivar × estádio × janela; estimador aprovado: ${estimatorUsed}.`,
        notes: `Run ${run.id}; n=${run.n_observations}; CV=${cv ?? "sem informação"}.`,
        created_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();

    if (sourceError || !source) {
      setError(sourceError?.message ?? "Não foi possível registrar a fonte da calibração.");
      setSaving(false);
      return;
    }

    const existing = targets.find((row) => row.stage_id === run.stage_id) ?? null;
    const calibrationPayload = {
      dae_calibrated: calibratedDae,
      gdd_calibrated: calibratedGdd,
      calibrated_source_id: source.id,
      calibration_confidence: confidence,
      calibration_run_id: run.id,
      updated_at: new Date().toISOString(),
    };

    const targetResponse = existing
      ? await supabase.from("cultivar_phenology_targets").update(calibrationPayload).eq("id", existing.id)
      : await supabase.from("cultivar_phenology_targets").insert({
          cultivar_id: cultivarId,
          stage_id: run.stage_id,
          planting_window_id: run.planting_window_id,
          ...calibrationPayload,
          confidence: "nao_validada",
          validation_status: "draft",
        });

    if (targetResponse.error) {
      setError(targetResponse.error.message);
      setSaving(false);
      return;
    }

    await Promise.all([
      supabase.from("agronomic_calibration_runs").update({
        status: "approved",
        approved_by: auth.user?.id ?? null,
        approved_at: new Date().toISOString(),
      }).eq("id", run.id),
      supabase.from("culture_varieties").update({
        calibration_status: "calibracao_parcial",
      }).eq("id", cultivarId),
    ]);

    setNotice("Calibração fenológica aprovada. Literatura/valor esperado foi preservado e o valor local ficou em coluna separada.");
    await loadCultivarData();
    setSaving(false);
  }

  async function analyzeTb() {
    if (!stageId || !windowId) {
      setError("Selecione estágio e janela antes de avaliar Tb.");
      return;
    }
    const min = Number(tbMin), max = Number(tbMax), step = Number(tbStep);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0 || max < min) {
      setError("Faixa de Tb inválida.");
      return;
    }

    const obs = stageObservations.filter((row) => row.emergence_date && row.observation_date);
    const minN = Math.max(2, Number(minObservations) || 3);
    if (obs.length < minN) {
      setError(`São necessárias pelo menos ${minN} observações com data de emergência.`);
      return;
    }

    setSaving(true);
    setError("");
    const thermal: ThermalObservation[] = [];
    for (const observation of obs) {
      const start = observation.emergence_date!;
      const { data } = await supabase
        .from("daily_thermal_time")
        .select("tmax_c,tmin_c,date")
        .eq("assignment_id", observation.assignment_id)
        .gte("date", start)
        .lte("date", observation.observation_date)
        .order("date");
      if (data && data.length) {
        thermal.push({
          dailyTemperatures: data.map((row) => ({
            tmaxC: row.tmax_c as number,
            tminC: row.tmin_c as number,
          })),
        });
      }
    }

    if (thermal.length < minN) {
      setError("Ainda não existe série diária Tmax/Tmin suficiente para recalcular Tb nas parcelas selecionadas.");
      setSaving(false);
      return;
    }

    const candidates: number[] = [];
    for (let value = min; value <= max + step / 10; value += step) {
      candidates.push(Number(value.toFixed(3)));
    }
    const result = evaluateBaseTemperatureCandidates(thermal, candidates)
      .sort((a, b) => (a.cvPct ?? Infinity) - (b.cvPct ?? Infinity));
    setTbResults(result);
    setSelectedTb(result[0] ? String(result[0].baseTemperatureC) : "");
    setNotice("Análise de Tb concluída. O primeiro resultado minimiza a dispersão térmica, mas NÃO será ativado automaticamente.");
    setSaving(false);
  }

  async function approveTb() {
    if (!selectedCultureId || !cultivarId || !stageId || !windowId || !selectedTb) return;
    const candidate = tbResults.find((row) => row.baseTemperatureC === Number(selectedTb));
    if (!candidate) return;

    const minN = Math.max(2, Number(minObservations) || 3);
    if (candidate.n < minN) {
      setError("Candidata não atende ao número mínimo de observações.");
      return;
    }

    setSaving(true);
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { data: source, error: sourceError } = await supabase
      .from("agronomic_sources")
      .insert({
        source_type: "calibracao_local",
        institution: "Histórico da fazenda",
        title: `Tb local proposta · ${selectedStage?.code ?? "evento"} · ${selectedWindow?.name ?? "janela"}`,
        methodology: "Seleção de Tb candidata por redução da dispersão do tempo térmico até o mesmo evento fenológico.",
        notes: `Tb=${candidate.baseTemperatureC} °C; n=${candidate.n}; CV=${candidate.cvPct ?? "sem informação"}%. Não ativada automaticamente.`,
        created_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();

    if (sourceError || !source) {
      setError(sourceError?.message ?? "Falha ao registrar fonte.");
      setSaving(false);
      return;
    }

    const { data: run, error: runError } = await supabase
      .from("agronomic_calibration_runs")
      .insert({
        calibration_type: "base_temperature",
        culture_id: selectedCultureId,
        cultivar_id: cultivarId,
        planting_window_id: windowId,
        stage_id: stageId,
        min_observations_required: minN,
        status: "approved",
        n_observations: candidate.n,
        mean_value: candidate.meanGdd,
        stddev_value: candidate.stdDevGdd,
        cv_pct: candidate.cvPct,
        result_json: { selectedTbC: candidate.baseTemperatureC, candidates: tbResults },
        approved_by: auth.user?.id ?? null,
        approved_at: new Date().toISOString(),
        notes: "Tb aprovada como parâmetro local candidato; ativação operacional permanece separada.",
      })
      .select("id")
      .single();

    if (runError || !run) {
      setError(runError?.message ?? "Falha ao registrar calibração.");
      setSaving(false);
      return;
    }

    const { error: parameterError } = await supabase.from("agronomic_parameter_values").insert({
      parameter_code: "base_temperature_lower_c",
      scope_type: "local_calibration",
      culture_id: selectedCultureId,
      cultivar_id: cultivarId,
      planting_window_id: windowId,
      numeric_value: candidate.baseTemperatureC,
      unit: "°C",
      source_id: source.id,
      confidence: confidenceFromCv(candidate.cvPct),
      validation_status: "approved",
      method: "thermal_time_dispersion_minimization",
      model_version: "agronomic-engine-v1",
      active_for_calculation: false,
      approved_by: auth.user?.id ?? null,
      approved_at: new Date().toISOString(),
      notes: `Calibration run ${run.id}. Requer ativação explícita na aba Graus-dia.`,
    });

    if (parameterError) setError(parameterError.message);
    else setNotice("Tb local aprovada e registrada, mas permanece INATIVA até ativação explícita na aba Graus-dia.");
    setSaving(false);
  }

  async function saveKcObservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fd = new FormData(event.currentTarget);
    const assignmentId = String(fd.get("assignment_id") ?? "");
    const eto = num(String(fd.get("eto_mm") ?? ""));
    const etc = num(String(fd.get("etc_observed_mm") ?? ""));
    const level = String(fd.get("observation_level") ?? "D") as "A" | "B" | "C" | "D";
    const quality = String(fd.get("data_quality_status") ?? "review") as "accepted" | "review" | "excluded";
    const start = String(fd.get("observation_start") ?? "");
    const end = String(fd.get("observation_end") ?? "");
    if (!assignmentId || !start || !end || eto == null || eto <= 0 || etc == null) {
      setError("Parcela, período, ETo e ETc observada são obrigatórios.");
      return;
    }

    const dae = num(String(fd.get("dae") ?? ""));
    const gdd = num(String(fd.get("accumulated_gdd") ?? ""));
    const ks = num(String(fd.get("ks_mean") ?? ""));
    const reasons = String(fd.get("exclusion_reasons") ?? "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);

    setSaving(true);
    const { error: insertError } = await supabase.from("kc_calibration_observations").insert({
      assignment_id: assignmentId,
      cultivar_id: cultivarId,
      observation_start: start,
      observation_end: end,
      stage_id: String(fd.get("stage_id") ?? "") || null,
      dae,
      accumulated_gdd: gdd,
      eto_mm: eto,
      etc_observed_mm: etc,
      observation_level: level,
      etc_method: String(fd.get("etc_method") ?? "").trim() || "não informado",
      ks_mean: ks,
      data_quality_status: quality,
      exclusion_reasons: reasons.length ? reasons : null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    });

    if (insertError) setError(insertError.message);
    else {
      setNotice(level === "D"
        ? "Observação registrada como nível D. Ela NÃO poderá gerar Kc calibrado."
        : "Observação de Kc registrada para avaliação de qualidade.");
      setKcModal(false);
      await loadCultivarData();
    }
    setSaving(false);
  }

  async function createKcCalibrationPoint() {
    if (!selectedCultureId || !cultivarId || !kcStageId) {
      setError("Selecione o estádio para agrupar as observações de Kc.");
      return;
    }
    const minN = Math.max(2, Number(kcMinObservations) || 3);
    if (acceptedKc.length < minN || kcStats.mean == null) {
      setError(`São necessárias pelo menos ${minN} observações aceitas de nível A/B/C, próximas do potencial (Ks ≥ 0,95 quando disponível).`);
      return;
    }

    const xValues = acceptedKc
      .map((obs) => kcAxis === "GDA" ? obs.accumulated_gdd : obs.dae)
      .filter((v): v is number => v != null);
    const xStats = calculateCalibrationStatistics(xValues);
    if (xStats.n < minN || xStats.median == null) {
      setError(`Não há ${minN} valores de ${kcAxis} válidos nas observações aceitas.`);
      return;
    }

    setSaving(true);
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { data: source, error: sourceError } = await supabase
      .from("agronomic_sources")
      .insert({
        source_type: "calibracao_local",
        institution: "Histórico da fazenda",
        title: `Ponto Kc observado · ${selectedKcStage?.code ?? "estádio"}`,
        methodology: "Kc observado = ETc observada / ETo; somente períodos aceitos de nível A/B/C e próximos do potencial.",
        notes: `n=${acceptedKc.length}; Kc médio=${kcStats.mean}; CV=${kcStats.cvPct ?? "sem informação"}.`,
        created_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();

    if (sourceError || !source) {
      setError(sourceError?.message ?? "Falha ao registrar fonte do Kc.");
      setSaving(false);
      return;
    }

    const { data: run, error: runError } = await supabase
      .from("agronomic_calibration_runs")
      .insert({
        calibration_type: "kc",
        culture_id: selectedCultureId,
        cultivar_id: cultivarId,
        stage_id: kcStageId,
        min_observations_required: minN,
        status: "review",
        n_observations: acceptedKc.length,
        mean_value: kcStats.mean,
        median_value: kcStats.median,
        stddev_value: kcStats.stdDev,
        cv_pct: kcStats.cvPct,
        min_value: kcStats.min,
        max_value: kcStats.max,
        p10: kcStats.p10,
        p25: kcStats.p25,
        p50: kcStats.p50,
        p75: kcStats.p75,
        p90: kcStats.p90,
        result_json: { axis: kcAxis, x: xStats, kc: kcStats },
        notes: "Proposta de ponto Kc local. Requer aprovação explícita e não cria curva com uma única observação.",
      })
      .select("id")
      .single();

    if (runError || !run) {
      setError(runError?.message ?? "Falha ao criar proposta de Kc.");
      setSaving(false);
      return;
    }

    const { error: pointError } = await supabase.from("kc_calibration_points").insert({
      calibration_run_id: run.id,
      culture_id: selectedCultureId,
      cultivar_id: cultivarId,
      stage_id: kcStageId,
      axis_type: kcAxis,
      x_value: xStats.median,
      kc_value: kcStats.mean,
      source_id: source.id,
      confidence: confidenceFromCv(kcStats.cvPct),
      approved: false,
      notes: "Ponto proposto. A aprovação não cria automaticamente a curva operacional.",
    });

    if (pointError) setError(pointError.message);
    else {
      setNotice("Ponto Kc proposto. Use APROVAR PONTO após revisão; a curva operacional continuará sendo uma etapa separada.");
      await loadCultivarData();
    }
    setSaving(false);
  }

  async function approveKcPoint(point: KcCalibrationPoint) {
    setSaving(true);
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: pointError } = await supabase.from("kc_calibration_points").update({
      approved: true,
      approved_by: auth.user?.id ?? null,
      approved_at: new Date().toISOString(),
    }).eq("id", point.id);

    if (!pointError) {
      await supabase.from("agronomic_calibration_runs").update({
        status: "approved",
        approved_by: auth.user?.id ?? null,
        approved_at: new Date().toISOString(),
      }).eq("id", point.calibration_run_id);
      setNotice("Ponto Kc aprovado. Ele ainda NÃO substituiu nenhuma curva bibliográfica; deve ser incorporado a uma curva local versionada na aba Kc e ETc.");
      await loadCultivarData();
    } else {
      setError(pointError.message);
    }
    setSaving(false);
  }

  const observationColumns: Column<FieldObservation>[] = [
    { header: "Data", render: (row) => new Date(row.observation_date + "T12:00:00").toLocaleDateString("pt-BR") },
    { header: "Estádio", render: (row) => stageLabel[row.stage_id] ?? "—" },
    { header: "DAE", render: (row) => row.dae ?? "—", align: "right" },
    { header: "GDA", render: (row) => row.accumulated_gdd?.toFixed(1) ?? "—", align: "right" },
    { header: "Fotoperíodo", render: (row) => row.photoperiod_hours != null ? `${row.photoperiod_hours.toFixed(2)} h` : "—", align: "right" },
    { header: "Amostra", render: (row) => row.sample_size ? `${row.sample_size} plantas` : "—" },
  ];

  const runColumns: Column<CalibrationRun>[] = [
    { header: "Tipo", render: (row) => row.calibration_type },
    { header: "Estádio", render: (row) => row.stage_id ? stageLabel[row.stage_id] ?? "—" : "—" },
    { header: "n", render: (row) => row.n_observations, align: "right" },
    { header: "CV", render: (row) => row.cv_pct != null ? `${row.cv_pct.toFixed(1)}%` : "—", align: "right" },
    { header: "RMSE", render: (row) => row.rmse?.toFixed(2) ?? "—", align: "right" },
    { header: "Status", render: (row) => row.status },
    {
      header: "Ações",
      align: "right",
      render: (row) =>
        row.calibration_type === "phenology" && row.status === "review" ? (
          <Button size="sm" onClick={() => void approvePhenologyRun(row)} disabled={saving}>
            APROVAR CALIBRAÇÃO
          </Button>
        ) : "—",
    },
  ];

  const kcColumns: Column<KcObservation>[] = [
    { header: "Período", render: (row) => `${row.observation_start} → ${row.observation_end}` },
    { header: "Estádio", render: (row) => row.stage_id ? stageLabel[row.stage_id] ?? "—" : "—" },
    { header: "Nível", render: (row) => row.observation_level },
    { header: "Ks", render: (row) => row.ks_mean?.toFixed(2) ?? "—", align: "right" },
    { header: "Kc obs.", render: (row) => row.kc_observed?.toFixed(3) ?? "—", align: "right" },
    { header: "Qualidade", render: (row) => row.data_quality_status },
  ];

  const pointColumns: Column<KcCalibrationPoint>[] = [
    { header: "Estádio", render: (row) => row.stage_id ? stageLabel[row.stage_id] ?? "—" : "—" },
    { header: "Eixo", render: (row) => row.axis_type },
    { header: "X", render: (row) => row.x_value.toFixed(1), align: "right" },
    { header: "Kc", render: (row) => row.kc_value.toFixed(3), align: "right" },
    { header: "Confiança", render: (row) => CONFIDENCE_LABEL[row.confidence] ?? row.confidence },
    { header: "Aprovado", render: (row) => row.approved ? "SIM" : "—" },
    {
      header: "Ações",
      align: "right",
      render: (row) => row.approved ? "—" : (
        <Button size="sm" onClick={() => void approveKcPoint(row)} disabled={saving}>APROVAR PONTO</Button>
      ),
    },
  ];

  const modeOptions = [
    { value: "campo", label: "Observações de campo" },
    { value: "fenologia", label: "Calibração fenológica" },
    { value: "tb", label: "Calibração de Tb" },
    { value: "kc", label: "Calibração de Kc" },
  ];

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Select
          id="cal_culture"
          name="cal_culture"
          label="Cultura"
          options={cultures.map((row) => ({ value: row.id, label: row.name }))}
          value={selectedCultureId ?? ""}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onSelectCulture(event.target.value || null)}
        />
        <Select
          id="cal_cultivar"
          name="cal_cultivar"
          label="Cultivar"
          options={[{ value: "", label: cultivars.length ? "Selecione" : "Sem cultivares" }, ...cultivars.map((row) => ({ value: row.id, label: row.name }))]}
          value={cultivarId}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setCultivarId(event.target.value)}
          disabled={!selectedCultureId}
        />
        <Select
          id="cal_mode"
          name="cal_mode"
          label="Módulo"
          options={modeOptions}
          value={mode}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setMode(event.target.value as CalibrationMode)}
        />
      </div>

      <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-800 dark:border-violet-900/40 dark:bg-violet-900/20 dark:text-violet-300">
        Calibração local nunca apaga literatura ou fabricante. Toda proposta passa por revisão e aprovação explícita. Fenologia, Tb e Kc são calibrações independentes.
      </div>

      {mode === "campo" && (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => { setFieldModal(true); setError(""); }} disabled={!cultivarId || cultivarAssignments.length === 0}>
              Registrar fenologia de campo
            </Button>
          </div>
          <Card>
            {observations.length ? (
              <Table columns={observationColumns} data={observations} getKey={(row) => row.id} />
            ) : (
              <p className="py-8 text-center text-sm text-graphite-400">Nenhuma observação fenológica registrada para esta cultivar.</p>
            )}
          </Card>
        </>
      )}

      {mode === "fenologia" && (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-4">
              <Select id="cal_stage" name="cal_stage" label="Estádio" options={[{ value: "", label: "Selecione" }, ...stages.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` }))]} value={stageId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStageId(e.target.value)} />
              <Select id="cal_window" name="cal_window" label="Janela de semeadura" options={[{ value: "", label: "Selecione" }, ...windows.map((row) => ({ value: row.id, label: row.name }))]} value={windowId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWindowId(e.target.value)} />
              <Input id="cal_min_n" label="Mínimo de observações" type="number" min="2" value={minObservations} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinObservations(e.target.value)} />
              <Select id="cal_estimator" name="cal_estimator" label="Estimador aprovado" options={[{ value: "median", label: "Mediana" }, { value: "mean", label: "Média" }]} value={estimator} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEstimator(e.target.value as "median" | "mean")} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">n DAE</p><p className="text-xl font-semibold">{daeStats.n}</p><p className="text-xs">mediana {daeStats.median ?? "—"} · CV {daeStats.cvPct ?? "—"}%</p></div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">n GDA</p><p className="text-xl font-semibold">{gddStats.n}</p><p className="text-xs">mediana {gddStats.median ?? "—"} · CV {gddStats.cvPct ?? "—"}%</p></div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">Erro DAE atual</p><p className="text-xl font-semibold">{daeErrors?.rmse?.toFixed(2) ?? "—"}</p><p className="text-xs">RMSE</p></div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">Erro GDA atual</p><p className="text-xl font-semibold">{gddErrors?.rmse?.toFixed(2) ?? "—"}</p><p className="text-xs">RMSE</p></div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={() => void generatePhenologyCalibration()} disabled={saving || !cultivarId}>Gerar proposta de calibração</Button>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-graphite-900 dark:text-white">Histórico de propostas</h3>
            {runs.filter((run) => run.calibration_type === "phenology").length ? (
              <Table columns={runColumns} data={runs.filter((run) => run.calibration_type === "phenology")} getKey={(row) => row.id} />
            ) : (
              <p className="py-6 text-center text-sm text-graphite-400">Nenhuma proposta fenológica.</p>
            )}
          </Card>
        </div>
      )}

      {mode === "tb" && (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-5">
              <Select id="tb_stage" name="tb_stage" label="Evento/estádio" options={[{ value: "", label: "Selecione" }, ...stages.map((row) => ({ value: row.id, label: row.code }))]} value={stageId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStageId(e.target.value)} />
              <Select id="tb_window" name="tb_window" label="Janela" options={[{ value: "", label: "Selecione" }, ...windows.map((row) => ({ value: row.id, label: row.name }))]} value={windowId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWindowId(e.target.value)} />
              <Input id="tb_min" label="Tb mínima (°C)" value={tbMin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTbMin(e.target.value)} />
              <Input id="tb_max" label="Tb máxima (°C)" value={tbMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTbMax(e.target.value)} />
              <Input id="tb_step" label="Passo (°C)" value={tbStep} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTbStep(e.target.value)} />
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              A faixa candidata deve ser definida com base técnica. Na soja, baixa dispersão térmica não prova que o fotoperíodo deixou de ser importante.
            </div>
            <div className="mt-4 flex justify-end"><Button onClick={() => void analyzeTb()} disabled={saving}>Testar candidatas</Button></div>
          </Card>

          {tbResults.length > 0 && (
            <Card>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Select
                  id="tb_candidate"
                  name="tb_candidate"
                  label="Tb candidata para aprovação"
                  options={tbResults.map((row) => ({
                    value: String(row.baseTemperatureC),
                    label: `${row.baseTemperatureC.toFixed(2)} °C · n=${row.n} · CV=${row.cvPct?.toFixed(2) ?? "—"}%`,
                  }))}
                  value={selectedTb}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTb(e.target.value)}
                />
                <div className="flex items-end"><Button onClick={() => void approveTb()} disabled={saving}>APROVAR Tb SELECIONADA</Button></div>
              </div>
              <p className="mt-3 text-xs text-graphite-400">A aprovação registra a Tb local, mas mantém o parâmetro inativo até ativação na aba Graus-dia.</p>
            </Card>
          )}
        </div>
      )}

      {mode === "kc" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setKcModal(true); setError(""); }} disabled={!cultivarId || cultivarAssignments.length === 0}>Registrar ETc observada</Button>
          </div>
          <Card>
            {kcObservations.length ? <Table columns={kcColumns} data={kcObservations} getKey={(row) => row.id} /> : <p className="py-8 text-center text-sm text-graphite-400">Nenhuma observação independente de ETc.</p>}
          </Card>
          <Card>
            <div className="grid gap-4 sm:grid-cols-4">
              <Select id="kc_cal_stage" name="kc_cal_stage" label="Estádio" options={[{ value: "", label: "Selecione" }, ...stages.map((row) => ({ value: row.id, label: row.code }))]} value={kcStageId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKcStageId(e.target.value)} />
              <Select id="kc_cal_axis" name="kc_cal_axis" label="Eixo do ponto" options={[{ value: "GDA", label: "GDA" }, { value: "DAE", label: "DAE" }]} value={kcAxis} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKcAxis(e.target.value as "DAE" | "GDA")} />
              <Input id="kc_cal_min" label="Mínimo A/B/C" type="number" min="2" value={kcMinObservations} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKcMinObservations(e.target.value)} />
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">Aceitas próximas do potencial</p><p className="text-xl font-semibold">{acceptedKc.length}</p><p className="text-xs">Kc médio {kcStats.mean ?? "—"} · CV {kcStats.cvPct ?? "—"}%</p></div>
            </div>
            <div className="mt-4 flex justify-end"><Button onClick={() => void createKcCalibrationPoint()} disabled={saving}>Gerar proposta de ponto Kc</Button></div>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-graphite-900 dark:text-white">Pontos locais propostos/aprovados</h3>
            {kcPoints.length ? <Table columns={pointColumns} data={kcPoints} getKey={(row) => row.id} /> : <p className="py-6 text-center text-sm text-graphite-400">Nenhum ponto Kc local.</p>}
          </Card>
        </div>
      )}

      {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <Modal open={fieldModal} onClose={() => { setFieldModal(false); setError(""); }} title="Registrar fenologia observada" size="lg">
        <form onSubmit={saveFieldObservation} className="space-y-5">
          <Select id="field_assignment" name="assignment_id" label="Parcela / pivô" options={cultivarAssignments.map((row) => ({ value: row.id, label: `${row.pivots?.name ?? "Pivô"} · ${row.seasons?.name ?? "Safra"} · plantio ${row.planting_date}` }))} required />
          <Select id="field_stage" name="stage_id" label="Estádio observado" options={stages.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` }))} required />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="field_date" name="observation_date" label="Data da observação" type="date" required />
            <Input id="field_sample_size" name="sample_size" label="Plantas avaliadas" type="number" min="1" />
            <Input id="field_sample_pct" name="sample_stage_pct" label="% da amostra no estádio" type="number" min="0" max="100" step="0.1" />
          </div>
          <TextArea id="field_notes" name="notes" label="Observações de campo" />
          <p className="text-xs text-graphite-400">DAE, DAS, GDA disponível e fotoperíodo serão vinculados automaticamente. A observação altera o estado real da parcela, não o cadastro mestre da cultivar.</p>
          <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={() => setFieldModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar observação</Button></div>
        </form>
      </Modal>

      <Modal open={kcModal} onClose={() => { setKcModal(false); setError(""); }} title="Registrar ETc independente para Kc" size="lg">
        <form onSubmit={saveKcObservation} className="space-y-5">
          <Select id="kc_obs_assignment" name="assignment_id" label="Parcela / pivô" options={cultivarAssignments.map((row) => ({ value: row.id, label: row.pivots?.name ?? row.id }))} required />
          <Select id="kc_obs_stage" name="stage_id" label="Estádio" options={[{ value: "", label: "Sem estádio vinculado" }, ...stages.map((row) => ({ value: row.id, label: row.code }))]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="kc_obs_start" name="observation_start" label="Início do período" type="date" required />
            <Input id="kc_obs_end" name="observation_end" label="Fim do período" type="date" required />
            <Input id="kc_obs_eto" name="eto_mm" label="ETo no período (mm)" type="number" min="0.01" step="0.01" required />
            <Input id="kc_obs_etc" name="etc_observed_mm" label="ETc observada (mm)" type="number" min="0" step="0.01" required />
            <Input id="kc_obs_dae" name="dae" label="DAE representativo" type="number" min="0" step="0.1" />
            <Input id="kc_obs_gdd" name="accumulated_gdd" label="GDA representativo" type="number" min="0" step="0.1" />
            <Input id="kc_obs_ks" name="ks_mean" label="Ks médio" type="number" min="0" max="1" step="0.01" />
            <Input id="kc_obs_method" name="etc_method" label="Método de ETc observada" placeholder="sensor / balanço / lisímetro..." required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="kc_obs_level" name="observation_level" label="Nível da observação" options={[{ value: "A", label: "A — lisímetro/micrometeorologia validada" }, { value: "B", label: "B — sensores de umidade calibrados" }, { value: "C", label: "C — amostragem volumétrica/gravimétrica" }, { value: "D", label: "D — sem ETc independente" }]} defaultValue="D" required />
            <Select id="kc_obs_quality" name="data_quality_status" label="Qualidade" options={[{ value: "review", label: "Em revisão" }, { value: "accepted", label: "Aceita" }, { value: "excluded", label: "Excluída" }]} defaultValue="review" required />
          </div>
          <Input id="kc_obs_reasons" name="exclusion_reasons" label="Motivos de exclusão/alerta (separar por ;)" />
          <TextArea id="kc_obs_notes" name="notes" label="Observações" />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">Nível D nunca é chamado de Kc calibrado. Períodos com Ks baixo, drenagem incerta, chuva duvidosa ou irrigação não medida devem ser excluídos ou revisados.</div>
          <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={() => setKcModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar período</Button></div>
        </form>
      </Modal>
    </>
  );
}
