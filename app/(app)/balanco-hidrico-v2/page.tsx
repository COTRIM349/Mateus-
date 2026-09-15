"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Select } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { WaterBalanceCommandCenter } from "@/components/water-balance/WaterBalanceCommandCenter";
import {
  computePivotBalanceSeries,
  type DailyBalanceRow,
  type InitialMoistureUnit,
  type WaterStatus,
  type HydricStatus,
} from "@/modules/water-balance/services";
import type { CulturePhase } from "@/modules/culture/services";
import {
  buildOperationalPivotSoil,
  mapDbLayersToProfile,
  type PivotSoilRegistryLayerRow,
  type PivotSoilRegistryRow,
  type SoilProfileLayer,
} from "@/modules/soil/services";
import { filterPivotsWithActiveParcel } from "@/modules/assignment/services";
import { sumGrossDepthByDate } from "@/modules/irrigation/services";

const HYDRIC_TO_WATER_STATUS: Record<HydricStatus, WaterStatus> = {
  verde: "ideal",
  amarelo: "atencao",
  vermelho: "deficit_critico",
  cinza: "ideal",
};

interface Pivot {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  efficiency: number;
  application_efficiency: number | null;
  farm_id: string;
}

interface CropAssignment {
  id: string;
  pivot_id: string;
  season_id: string;
  culture_id: string;
  soil_id: string | null;
  planting_date: string;
  management_start_date: string | null;
  emergence_date: string | null;
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: number | null;
  max_root_depth: number | null;
  irrigation_efficiency: number | null;
  depletion_factor: number | null;
  kl_override: number | null;
  ks_function_override: string | null;
  initial_soil_moisture_pct: number | null;
  initial_moisture_unit: InitialMoistureUnit | null;
  initial_moisture_is_cc: boolean | null;
  deficit_irrigation: boolean | null;
  stress_point_irrigation: boolean | null;
  active: boolean;
}

interface Culture {
  id: string;
  name: string;
  cycle_days: number;
  root_depth: number;
  depletion_factor: number;
  kl: number | null;
  ks_function: string | null;
  ky: number | null;
}

interface Soil {
  id: string;
  name: string;
  field_capacity: number;
  wilting_point: number;
  bulk_density: number | null;
  effective_depth: number;
}

interface HydricAnchor {
  effectiveDate: string;
  source: "measured" | "field_capacity_confirmed";
  moistureValue: number | null;
  moistureUnit: InitialMoistureUnit;
  isFieldCapacity: boolean;
}

interface WeatherReading {
  id: string;
  date: string;
  et0_calculated: number | null;
  precipitation: number;
}

interface IrrigationEvent {
  parcel_id: string | null;
  started_at: string;
  depth_mm: number;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datesInRange(startIso: string, endIso: string) {
  const out: string[] = [];
  const cursor = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
}

export default function BalancoHidricoV2Page() {
  const router = useRouter();
  const { activeFarmId, farms } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [assignment, setAssignment] = useState<CropAssignment | null>(null);
  const [culture, setCulture] = useState<Culture | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [soilLayers, setSoilLayers] = useState<SoilProfileLayer[]>([]);
  const [phases, setPhases] = useState<CulturePhase[]>([]);
  const [hydricAnchor, setHydricAnchor] = useState<HydricAnchor | null>(null);
  const [rows, setRows] = useState<DailyBalanceRow[]>([]);
  const [loadingPivots, setLoadingPivots] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showMemory, setShowMemory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPivots([]);
    setSelectedPivotId("");
    setRows([]);
    setError("");
    setNotice("");

    if (!activeFarmId) return () => { cancelled = true; };

    setLoadingPivots(true);
    void (async () => {
      try {
        const { data: pivotData, error: pivotError } = await supabase
          .from("pivots")
          .select("id,name,area,flow_rate,efficiency,application_efficiency,farm_id")
          .eq("farm_id", activeFarmId)
          .eq("active", true)
          .order("name");
        if (pivotError) throw pivotError;

        const farmPivots = (pivotData ?? []) as Pivot[];
        if (!farmPivots.length) return;

        const { data: activeAssignments, error: assignmentError } = await supabase
          .from("pivot_crop_assignments")
          .select("pivot_id,active,status")
          .in("pivot_id", farmPivots.map((pivot) => pivot.id))
          .eq("active", true)
          .or("status.is.null,status.eq.ativa");
        if (assignmentError) throw assignmentError;

        const eligible = filterPivotsWithActiveParcel(farmPivots, activeAssignments ?? []);
        if (cancelled) return;
        setPivots(eligible);
        setSelectedPivotId(eligible[0]?.id ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar os pivôs ativos.");
      } finally {
        if (!cancelled) setLoadingPivots(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeFarmId, supabase]);

  useEffect(() => {
    let cancelled = false;
    setAssignment(null);
    setCulture(null);
    setSoil(null);
    setSoilLayers([]);
    setPhases([]);
    setHydricAnchor(null);
    setRows([]);
    setError("");
    setNotice("");

    if (!selectedPivotId) return () => { cancelled = true; };

    void (async () => {
      try {
        const { data: assignmentData, error: assignmentError } = await supabase
          .from("pivot_crop_assignments")
          .select("*")
          .eq("pivot_id", selectedPivotId)
          .eq("active", true)
          .or("status.is.null,status.eq.ativa")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (assignmentError || !assignmentData) throw assignmentError ?? new Error("Parcela ativa não encontrada.");

        const a = assignmentData as CropAssignment;

        const { data: pivotLegacySoil } = await supabase
          .from("pivots")
          .select("soil_id")
          .eq("id", selectedPivotId)
          .single();
        const legacySoilId = (pivotLegacySoil as { soil_id: string | null } | null)?.soil_id ?? a.soil_id;

        const [
          { data: cultureData },
          { data: phaseData },
          { data: fixedProfileData },
          { data: fixedLayerData },
          { data: legacySoilData },
          { data: legacyLayerData },
        ] = await Promise.all([
          supabase.from("cultures").select("id,name,cycle_days,root_depth,depletion_factor,kl,ks_function,ky").eq("id", a.culture_id).single(),
          supabase.from("culture_phases").select("*").eq("culture_id", a.culture_id).order("phase_order"),
          supabase.from("pivot_soils").select("pivot_id,soil_class,cc_pmp_unit").eq("pivot_id", selectedPivotId).maybeSingle(),
          supabase.from("pivot_soil_layers").select("pivot_id,layer_number,thickness_m,field_capacity_pct,wilting_point_pct,bulk_density_g_cm3").eq("pivot_id", selectedPivotId).order("layer_number"),
          legacySoilId
            ? supabase.from("soils").select("id,name,field_capacity,wilting_point,bulk_density,effective_depth").eq("id", legacySoilId).maybeSingle()
            : Promise.resolve({ data: null }),
          legacySoilId
            ? supabase.from("soil_layers").select("depth_start,depth_end,field_capacity,wilting_point,bulk_density,kl").eq("soil_id", legacySoilId).order("depth_start")
            : Promise.resolve({ data: [] }),
        ]);

        const fixedSoil = buildOperationalPivotSoil(
          fixedProfileData as PivotSoilRegistryRow | null,
          (fixedLayerData ?? []) as PivotSoilRegistryLayerRow[],
        );
        const operationalSoil = fixedSoil ?? (legacySoilData as Soil | null);
        const operationalLayers = fixedSoil?.layers ?? mapDbLayersToProfile(legacyLayerData ?? []);
        if (!operationalSoil) throw new Error("Pivô sem perfil de solo operacional válido.");
        if (!cultureData) throw new Error("Cultura da parcela não encontrada.");

        const todayIso = new Date().toISOString().slice(0, 10);
        const { data: anchorData } = await supabase
          .from("hydric_initial_conditions")
          .select("effective_date,source,moisture_value,moisture_unit,is_field_capacity")
          .eq("pivot_crop_assignment_id", a.id)
          .lte("effective_date", todayIso)
          .order("effective_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const anchor = anchorData && (anchorData.source === "measured" || anchorData.source === "field_capacity_confirmed")
          ? {
              effectiveDate: anchorData.effective_date as string,
              source: anchorData.source as HydricAnchor["source"],
              moistureValue: anchorData.moisture_value == null ? null : Number(anchorData.moisture_value),
              moistureUnit: anchorData.moisture_unit as InitialMoistureUnit,
              isFieldCapacity: anchorData.is_field_capacity === true,
            }
          : null;

        if (cancelled) return;
        setAssignment(a);
        setCulture(cultureData as Culture);
        setSoil(operationalSoil);
        setSoilLayers(operationalLayers);
        setPhases((phaseData ?? []) as CulturePhase[]);
        setHydricAnchor(anchor);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao preparar os dados agronômicos do pivô.");
      }
    })();

    return () => { cancelled = true; };
  }, [selectedPivotId, supabase]);

  const calculate = useCallback(async () => {
    if (!activeFarmId || !selectedPivotId || !assignment || !culture || !soil) return;

    const pivot = pivots.find((item) => item.id === selectedPivotId);
    if (!pivot) return;

    setLoadingBalance(true);
    setRows([]);
    setError("");
    setNotice("");

    try {
      const today = new Date().toISOString().slice(0, 10);
      const hasLegacyInitial = assignment.initial_moisture_is_cc === true
        || (assignment.initial_soil_moisture_pct != null && Number.isFinite(Number(assignment.initial_soil_moisture_pct)));
      const assumeFieldCapacity = !hydricAnchor && !hasLegacyInitial;
      const start = hydricAnchor
        ? addDaysIso(hydricAnchor.effectiveDate, 1)
        : (assignment.management_start_date ?? assignment.planting_date);
      const end = today;

      if (!start || start > end) throw new Error("Período do balanço inválido para a parcela ativa.");

      const { data: stations, error: stationsError } = await supabase
        .from("weather_stations")
        .select("id")
        .eq("farm_id", activeFarmId)
        .eq("active", true);
      if (stationsError) throw stationsError;
      const stationIds = (stations ?? []).map((station: { id: string }) => station.id);
      if (!stationIds.length) throw new Error("Nenhuma estação climática ativa disponível para a fazenda.");

      const [{ data: readings }, { data: selections }] = await Promise.all([
        supabase
          .from("weather_readings")
          .select("id,date,et0_calculated,precipitation")
          .in("station_id", stationIds)
          .gte("date", start)
          .lte("date", end)
          .order("date"),
        supabase
          .from("weather_daily_selection")
          .select("date,selected_reading_id,operational_approved")
          .eq("farm_id", activeFarmId)
          .gte("date", start)
          .lte("date", end),
      ]);

      const readingsById = new Map(((readings ?? []) as WeatherReading[]).map((reading) => [reading.id, reading]));
      const weatherByDate: Record<string, { et0: number; precipitation: number }> = {};
      for (const selection of selections ?? []) {
        if (!selection.selected_reading_id || selection.operational_approved !== true) continue;
        const reading = readingsById.get(selection.selected_reading_id as string);
        if (reading?.et0_calculated == null) continue;
        weatherByDate[selection.date as string] = {
          et0: Number(reading.et0_calculated),
          precipitation: Number(reading.precipitation ?? 0),
        };
      }

      const { data: manualRain } = await supabase
        .from("manual_rainfall_entries")
        .select("date,precipitation_mm")
        .eq("farm_id", activeFarmId)
        .gte("date", start)
        .lte("date", end);
      for (const rain of manualRain ?? []) {
        const date = rain.date as string;
        const amount = Number(rain.precipitation_mm);
        if (weatherByDate[date] && Number.isFinite(amount) && amount >= 0) {
          weatherByDate[date] = { ...weatherByDate[date], precipitation: amount };
        }
      }

      const availableDates = datesInRange(start, end).filter((date) => weatherByDate[date]);
      if (!availableDates.length) throw new Error("Nenhum dia com ETo operacional disponível. Sincronize o clima.");
      const effectiveEnd = availableDates[availableDates.length - 1];
      const missingInside = datesInRange(start, effectiveEnd).filter((date) => !weatherByDate[date]);
      if (missingInside.length) {
        throw new Error(`Balanço bloqueado: existem ${missingInside.length} dia(s) sem ETo no meio da série climática.`);
      }
      if (effectiveEnd < end) {
        setNotice(`Balanço calculado até ${effectiveEnd.split("-").reverse().join("/")} — último dia com ETo operacional disponível.`);
      }

      const [{ data: irrigationEvents }, { count: activeAssignmentCount }] = await Promise.all([
        supabase
          .from("irrigation_events")
          .select("parcel_id,started_at,depth_mm")
          .eq("pivot_id", selectedPivotId)
          .gte("started_at", `${start}T00:00:00`)
          .lte("started_at", `${effectiveEnd}T23:59:59`),
        supabase
          .from("pivot_crop_assignments")
          .select("id", { count: "exact", head: true })
          .eq("pivot_id", selectedPivotId)
          .eq("active", true)
          .or("status.is.null,status.eq.ativa"),
      ]);

      const sectorized = (activeAssignmentCount ?? 0) > 1;
      const relevantEvents = ((irrigationEvents ?? []) as IrrigationEvent[]).filter((event) =>
        event.parcel_id === assignment.id || (!sectorized && event.parcel_id == null),
      );
      const irrigationByDate = sumGrossDepthByDate(relevantEvents.map((event) => ({
        started_at: event.started_at,
        depth_mm: event.depth_mm,
      })));

      const series = computePivotBalanceSeries({
        assignment: {
          id: assignment.id,
          planting_date: assignment.planting_date,
          emergence_date: assignment.emergence_date,
          parameter_mode: assignment.parameter_mode,
          initial_root_depth: assignment.initial_root_depth,
          max_root_depth: assignment.max_root_depth,
          irrigation_efficiency: assignment.irrigation_efficiency,
          depletion_factor: assignment.depletion_factor,
          kl_override: assignment.kl_override,
          ks_function_override: assignment.ks_function_override,
          initial_soil_moisture_pct: hydricAnchor ? hydricAnchor.moistureValue : (assumeFieldCapacity ? null : assignment.initial_soil_moisture_pct),
          initial_moisture_unit: hydricAnchor ? hydricAnchor.moistureUnit : assignment.initial_moisture_unit,
          initial_moisture_is_cc: hydricAnchor ? hydricAnchor.isFieldCapacity : (assumeFieldCapacity ? true : assignment.initial_moisture_is_cc),
          deficit_irrigation: assignment.deficit_irrigation,
          stress_point_irrigation: assignment.stress_point_irrigation,
        },
        culture: {
          root_depth: culture.root_depth,
          depletion_factor: culture.depletion_factor,
          kl: culture.kl,
          ks_function: culture.ks_function,
          ky: culture.ky,
        },
        phases,
        soil: {
          field_capacity: soil.field_capacity,
          wilting_point: soil.wilting_point,
          bulk_density: soil.bulk_density,
          effective_depth: soil.effective_depth,
          layers: soilLayers,
        },
        pivot: {
          application_efficiency: pivot.application_efficiency,
          efficiency: pivot.efficiency,
          area: pivot.area,
          flow_rate: pivot.flow_rate,
        },
        weatherByDate,
        irrigationByDate,
        dateStart: start,
        dateEnd: effectiveEnd,
      });

      if (!series.length) throw new Error("O motor hídrico não retornou dados para este pivô.");

      const mapped: DailyBalanceRow[] = series.map((day) => ({
        date: day.date,
        phase: day.phase,
        et0: day.et0,
        kc: day.kc,
        etc: day.etc,
        precipitation: day.precipitation,
        effectivePrecipitation: day.effectivePrecipitation,
        irrigationApplied: day.irrigation,
        rootDepth: day.rootDepth,
        cad: day.adt,
        afd: day.afd,
        cadProfileMm: day.cadProfileMm,
        craProfileMm: day.craProfileMm,
        storedWater: day.storage,
        depletionFactor: day.adt > 0 ? Math.round((day.afd / day.adt) * 1000) / 1000 : 0,
        deficit: day.deficit,
        surplus: day.surplus,
        netDepth: day.recommendedNetDepth,
        grossDepth: day.recommendedGrossDepth,
        volumeNeeded: day.recommendedVolume,
        irrigationTime: day.estimatedIrrigationTime,
        waterStatus: HYDRIC_TO_WATER_STATUS[day.status],
        dae: day.dae,
        ks: day.ks,
        kl: day.kl,
        kcAdjusted: day.kcAdjusted,
        etcPotential: day.etcPotential,
        ky: day.ky,
        yieldRisk: day.yieldRisk,
        etcFormula: day.etcFormula,
        effectiveIrrigation: day.effectiveIrrigation,
        fieldCapacity: day.fieldCapacity,
        wiltingPoint: day.wiltingPoint,
        safetyMoistureMm: day.safetyMoistureMm,
        moisturePctCc: day.moisturePctCc,
        safetyPctCc: day.safetyPctCc,
        peFormula: day.peFormula,
        balanceFormula: day.balanceFormula,
      }));

      setRows(mapped);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Erro ao calcular o balanço hídrico.");
    } finally {
      setLoadingBalance(false);
    }
  }, [activeFarmId, selectedPivotId, assignment, culture, soil, soilLayers, phases, hydricAnchor, pivots, supabase]);

  useEffect(() => {
    if (!assignment || !culture || !soil || !selectedPivotId) return;
    void calculate();
  }, [assignment, culture, soil, selectedPivotId, calculate]);

  const selectedPivot = pivots.find((pivot) => pivot.id === selectedPivotId) ?? null;
  const farmName = farms.find((farm) => farm.id === activeFarmId)?.name ?? null;
  const latest = rows[rows.length - 1] ?? null;

  if (!activeFarmId) {
    return <PageHeader titulo="Balanço Hídrico V2" descricao="Selecione uma fazenda para continuar" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Balanço Hídrico V2"
        descricao="Central diária de decisão de irrigação — interface em validação"
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <Select
              label="Pivô com parcela ativa"
              value={selectedPivotId}
              onChange={(event) => setSelectedPivotId(event.target.value)}
              options={pivots.map((pivot) => ({ value: pivot.id, label: pivot.name }))}
            />
            <div className="flex items-end gap-2">
              <Button onClick={() => void calculate()} disabled={!selectedPivotId || loadingBalance}>
                {loadingBalance ? "Atualizando..." : "Atualizar balanço"}
              </Button>
              <button
                type="button"
                onClick={() => router.push("/balanco-hidrico")}
                className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-graphite-500 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.05]"
              >
                Interface atual
              </button>
            </div>
          </div>
          <div className="text-xs text-graphite-400 dark:text-gray-500">
            {loadingPivots ? "Carregando pivôs..." : `${pivots.length} pivô(s) com parcela ativa`}
          </div>
        </div>
        {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
        {notice && !error ? <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{notice}</p> : null}
      </Card>

      <WaterBalanceCommandCenter
        rows={rows}
        pivotName={selectedPivot?.name}
        cultureName={culture?.name}
        farmName={farmName}
        areaHa={selectedPivot?.area}
        efficiencyPct={selectedPivot ? (selectedPivot.application_efficiency ?? selectedPivot.efficiency) * 100 : null}
        activePivotCount={pivots.length}
        loading={loadingBalance || loadingPivots}
        onProgramIrrigation={() => router.push("/programacao")}
        onOpenCalculationMemory={() => setShowMemory((current) => !current)}
      />

      {showMemory && latest ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-graphite-900 dark:text-white">Memória de cálculo — último dia</p>
              <p className="mt-0.5 text-xs text-graphite-400 dark:text-gray-500">{latest.date.split("-").reverse().join("/")} · {latest.phase}</p>
            </div>
            <button type="button" onClick={() => setShowMemory(false)} className="text-xs font-semibold text-graphite-400 hover:text-graphite-700 dark:hover:text-white">Fechar</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["ETo", `${latest.et0.toFixed(2)} mm`],
              ["Kc", latest.kc.toFixed(3)],
              ["ETc potencial", `${(latest.etcPotential ?? latest.etc).toFixed(2)} mm`],
              ["Ks", (latest.ks ?? 1).toFixed(3)],
              ["ETc ajustada", `${latest.etc.toFixed(2)} mm`],
              ["Raiz", `${latest.rootDepth.toFixed(2)} m`],
              ["CAD", `${latest.cad.toFixed(2)} mm`],
              ["AFD", `${latest.afd.toFixed(2)} mm`],
              ["ARM", `${latest.storedWater.toFixed(2)} mm`],
              ["Chuva efetiva", `${latest.effectivePrecipitation.toFixed(2)} mm`],
              ["Irrigação efetiva", `${(latest.effectiveIrrigation ?? latest.irrigationApplied).toFixed(2)} mm`],
              ["Lâmina bruta", `${latest.grossDepth.toFixed(2)} mm`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
                <p className="text-[9px] font-bold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{label}</p>
                <p className="mt-1 text-sm font-extrabold text-graphite-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 rounded-xl border border-gray-100 p-3 text-xs text-graphite-500 dark:border-white/[0.06] dark:text-gray-400">
            <p><strong className="text-graphite-800 dark:text-white">ETc:</strong> {latest.etcFormula ?? "ETo × Kc × fatores de ajuste"}</p>
            <p><strong className="text-graphite-800 dark:text-white">Balanço:</strong> {latest.balanceFormula ?? "ARM anterior + entradas − ETc − drenagem"}</p>
            <p><strong className="text-graphite-800 dark:text-white">Chuva efetiva:</strong> {latest.peFormula ?? "regra operacional vigente"}</p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
