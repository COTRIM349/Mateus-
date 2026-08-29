"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Select,
  Table,
  Tabs,
  Input,
  TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  calculateSummary,
  calculateManagementUrgency,
  computePivotBalanceSeries,
  WATER_STATUS_CONFIG,
  ARM_FORMULA,
  PE_METHOD,
  ETC_FORMULA,
  KS_FAO56_FORMULA,
  interpretFao56Ks,
  moisturePctCcForDisplay,
  safetyPctCcForDisplay,
  type DailyBalanceRow,
  type WaterStatus,
  type HydricStatus,
  type InitialMoistureUnit,
} from "@/modules/water-balance/services";
import { type CulturePhase } from "@/modules/culture/services";
import { mapDbLayersToProfile, resolveSensoryNote, type SoilProfileLayer } from "@/modules/soil/services";
import { buildIrrigationEventInsert, deriveAppliedVolume, deriveOperatingHours, sumGrossDepthByDate } from "@/modules/irrigation/services";
import { assertParcelAcceptsOperationalLaunch } from "@/modules/assignment/services";
import { pickTariffForDate, priceIrrigationEvent, type TariffRow } from "@/modules/costs/services";
import { initialManejoVisibility, managementRowFromBalance, type ManejoSeriesKey } from "@/modules/reports/services";
import { ManejoChart, ManejoSeriesPicker } from "@/components/charts/ManejoChart";
import { HydricInitialConditionForm } from "@/components/water-balance/HydricInitialConditionForm";

// mapeia o status hídrico (3 níveis do motor) para o water_status legado (5 níveis)
const HYDRIC_TO_WATER_STATUS: Record<HydricStatus, WaterStatus> = {
  verde: "ideal",
  amarelo: "atencao",
  vermelho: "deficit_critico",
  cinza: "ideal",
};

// distância aproximada entre dois pontos (km) — Haversine
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function datesInRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// séries climáticas extras (da estação) por data — para o gráfico
type WeatherExtra = { tmax: number | null; tmin: number | null; tmean: number | null; rh: number | null; wind: number | null; rad: number | null };

// ── Types ─────────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  efficiency: number;
  application_efficiency: number | null;
  farm_id: string;
  specific_consumption: number | null;
  pump_power: number | null;
  installed_power_kw: number | null;
  motor_efficiency: number | null;
  energy_cost: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface CropAssignment {
  id: string;
  pivot_id: string;
  season_id: string;
  culture_id: string;
  soil_id: string;
  planting_date: string;
  management_start_date: string | null;
  emergence_date: string | null;
  crop_stage: string;
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
  bulk_density: number;
  effective_depth: number;
}

interface WeatherReading {
  id: string;
  date: string;
  et0_calculated: number | null;
  precipitation: number;
  station_id: string;
}

interface IrrigationEvent {
  id: string;
  pivot_id: string;
  parcel_id: string | null;
  started_at: string;
  depth_mm: number;
}

interface HydricAnchor {
  effectiveDate: string;
  source: "measured" | "field_capacity_confirmed";
  moistureValue: number | null;
  moistureUnit: InitialMoistureUnit;
  isFieldCapacity: boolean;
}

interface StoredBalance {
  id: string;
  pivot_crop_assignment_id: string;
  date: string;
  et0: number;
  kc: number;
  etc: number;
  precipitation: number;
  effective_precipitation: number;
  applied_depth: number;
  effective_irrigation: number | null;
  root_depth: number;
  cad: number;
  afd: number;
  soil_storage: number;
  depletion_factor: number;
  deficit: number;
  surplus: number;
  net_depth: number;
  gross_depth: number;
  volume_needed: number;
  irrigation_time: number;
  water_status: WaterStatus;
  phase: string | null;
  dae: number | null;
  ks: number | null;
  kl: number | null;
  kc_adjusted: number | null;
  etc_potential: number | null;
  ky: number | null;
  yield_risk: number | null;
  etc_formula: string | null;
  field_capacity: number | null;
  wilting_point: number | null;
  safety_moisture_mm: number | null;
  moisture_pct_cc: number | null;
  safety_pct_cc: number | null;
  pe_formula: string | null;
  balance_formula: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "grafico", label: "Gráfico" },
  { id: "dados", label: "Dados" },
  { id: "decisao", label: "Decisão" },
  { id: "lancamento", label: "Lançamento" },
];

// ── Main Page ─────────────────────────────────────────────────────────────

export default function BalancoHidricoPage() {
  const { activeFarmId, farms } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"grafico" | "dados" | "decisao" | "lancamento">("grafico");
  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [assignment, setAssignment] = useState<CropAssignment | null>(null);
  const [culture, setCulture] = useState<Culture | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [soilLayers, setSoilLayers] = useState<SoilProfileLayer[]>([]);
  const [phases, setPhases] = useState<CulturePhase[]>([]);
  const [hydricAnchor, setHydricAnchor] = useState<HydricAnchor | null>(null);
  const [balanceRows, setBalanceRows] = useState<DailyBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");

  // Lançamento tab
  const [lancDate, setLancDate] = useState("");
  const [lancTime, setLancTime] = useState("06:00");
  const [lancDepth, setLancDepth] = useState("");
  const [lancHours, setLancHours] = useState("");
  const [lancNotes, setLancNotes] = useState("");
  const [lancSaving, setLancSaving] = useState(false);
  const [lancMsg, setLancMsg] = useState("");

  // Load pivots
  useEffect(() => {
    if (!activeFarmId) return;
    (async () => {
      const { data } = await supabase
        .from("pivots")
        .select("id, name, area, flow_rate, efficiency, application_efficiency, farm_id, specific_consumption, pump_power, installed_power_kw, motor_efficiency, energy_cost, latitude, longitude")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name");
      setPivots((data ?? []) as Pivot[]);
    })();
  }, [activeFarmId, supabase]);

  // Load assignment + culture + soil + phases when pivot changes
  useEffect(() => {
    if (!selectedPivotId) {
      setAssignment(null);
      setCulture(null);
      setSoil(null);
      setSoilLayers([]);
      setPhases([]);
      setHydricAnchor(null);
      return;
    }
    (async () => {
      const { data: pca } = await supabase
        .from("pivot_crop_assignments")
        .select("*")
        .eq("pivot_id", selectedPivotId)
        .eq("active", true)
        // Sprint 13 · Etapa 6 — só considera parcela em manejo.
        .or("status.is.null,status.eq.ativa")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!pca) {
        setAssignment(null);
        setCulture(null);
        setSoil(null);
        setSoilLayers([]);
        setPhases([]);
        setHydricAnchor(null);
        return;
      }
      const a = pca as CropAssignment;
      setAssignment(a);

      // Sprint 14 · Etapa 7 — solo agora vem do pivô. Fallback para o
      // soil_id legado da parcela quando o pivô não tem solo cadastrado.
      const { data: pivotSoil } = await supabase
        .from("pivots")
        .select("soil_id")
        .eq("id", selectedPivotId)
        .single();
      const effectiveSoilId =
        (pivotSoil as { soil_id: string | null } | null)?.soil_id ?? a.soil_id;

      const [{ data: cultureData }, { data: soilData }, { data: phaseData }, { data: layerData }] = await Promise.all([
        supabase.from("cultures").select("id, name, cycle_days, root_depth, depletion_factor, kl, ks_function, ky").eq("id", a.culture_id).single(),
        supabase.from("soils").select("id, name, field_capacity, wilting_point, bulk_density, effective_depth").eq("id", effectiveSoilId).single(),
        supabase.from("culture_phases").select("*").eq("culture_id", a.culture_id).order("phase_order"),
        effectiveSoilId
          ? supabase
              .from("soil_layers")
              .select("depth_start, depth_end, field_capacity, wilting_point, bulk_density, kl")
              .eq("soil_id", effectiveSoilId)
              .order("depth_start")
          : Promise.resolve({ data: [] }),
      ]);

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
      setHydricAnchor(anchor);
      setCulture(cultureData as Culture | null);
      setSoil(soilData as Soil | null);
      setSoilLayers(mapDbLayersToProfile(layerData ?? []));
      setPhases((phaseData ?? []) as CulturePhase[]);

      if (a.planting_date) {
        const start = anchor ? addDaysIso(anchor.effectiveDate, 1) : (a.management_start_date ?? a.planting_date);
        const cDays = (cultureData as Culture | null)?.cycle_days ?? 120;
        const end = new Date(new Date(start).getTime() + cDays * 86400000).toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        setDateStart(start);
        setDateEnd(end < today ? end : today);
      }
    })();
  }, [selectedPivotId, supabase]);

  // Calculate balance
  const runCalculation = useCallback(async () => {
    if (!assignment || !culture || !soil || !dateStart || !dateEnd) return;
    setCalculating(true);
    setError("");
    setBalanceRows([]);

    try {
      const pivot = pivots.find((p) => p.id === selectedPivotId);
      if (!pivot) throw new Error("Pivô não encontrado");

      const legacyInitialValue = assignment.initial_soil_moisture_pct;
      const hasLegacyInitial = assignment.initial_moisture_is_cc === true
        || (legacyInitialValue != null && Number.isFinite(Number(legacyInitialValue)));
      if (!hydricAnchor && !hasLegacyInitial) {
        throw new Error("Balanço bloqueado: defina uma condição inicial confiável do solo (medição ou capacidade de campo confirmada).");
      }
      const calculationStart = hydricAnchor
        ? addDaysIso(hydricAnchor.effectiveDate, 1)
        : (assignment.management_start_date ?? assignment.planting_date);
      if (calculationStart > dateEnd) {
        throw new Error("Balanço bloqueado: a condição inicial é posterior ao período selecionado.");
      }

      // 1. Get weather readings for the farm stations
      const { data: stations } = await supabase
        .from("weather_stations")
        .select("id")
        .eq("farm_id", activeFarmId!)
        .eq("active", true);

      const stationIds = (stations ?? []).map((s: { id: string }) => s.id);

      let weatherReadings: WeatherReading[] = [];
      const selectedIdByDate = new Map<string, string>();
      if (stationIds.length > 0) {
        const [wrRes, dsRes] = await Promise.all([
          supabase
            .from("weather_readings")
            .select("id, date, et0_calculated, precipitation, station_id")
            .in("station_id", stationIds)
            .gte("date", calculationStart)
            .lte("date", dateEnd)
            .order("date"),
          supabase
            .from("weather_daily_selection")
            .select("date, selected_reading_id, operational_approved")
            .eq("farm_id", activeFarmId!)
            .gte("date", calculationStart)
            .lte("date", dateEnd),
        ]);
        weatherReadings = (wrRes.data ?? []) as WeatherReading[];
        for (const s of dsRes.data ?? []) {
          if (s.selected_reading_id && s.operational_approved === true) {
            selectedIdByDate.set(s.date as string, s.selected_reading_id as string);
          }
        }
      }

      // 2. Get irrigation events for the selected parcel. Eventos antigos sem
      // parcel_id só são aceitos quando existe uma única parcela ativa no pivô.
      const [{ data: irrEvents }, { count: activeAssignmentCount }] = await Promise.all([
        supabase
          .from("irrigation_events")
          .select("id,pivot_id,parcel_id,started_at,depth_mm")
          .eq("pivot_id", selectedPivotId)
          .gte("started_at", calculationStart + "T00:00:00")
          .lte("started_at", dateEnd + "T23:59:59"),
        supabase
          .from("pivot_crop_assignments")
          .select("id", { count: "exact", head: true })
          .eq("pivot_id", selectedPivotId)
          .eq("active", true)
          .or("status.is.null,status.eq.ativa"),
      ]);
      const allEvents = (irrEvents ?? []) as IrrigationEvent[];
      const sectorized = (activeAssignmentCount ?? 0) > 1;
      if (sectorized && allEvents.some((ev) => ev.parcel_id == null)) {
        throw new Error("Balanço bloqueado: há irrigação antiga sem parcela identificada em pivô setorizado.");
      }
      const relevantEvents = allEvents.filter((ev) =>
        ev.parcel_id === assignment.id || (!sectorized && ev.parcel_id == null),
      );
      const eventKeys = new Set<string>();
      for (const ev of relevantEvents) {
        const key = `${ev.started_at}|${Number(ev.depth_mm)}`;
        if (eventKeys.has(key)) {
          throw new Error(`Balanço bloqueado: irrigação duplicada detectada em ${ev.started_at.slice(0, 10)}.`);
        }
        eventKeys.add(key);
      }
      const irrigationByDate = sumGrossDepthByDate(relevantEvents.map((ev) => ({
        started_at: ev.started_at,
        depth_mm: ev.depth_mm,
      })));

      // 3. Build weather lookup by date
      //    Somente leituras explicitamente aprovadas para uso operacional.
      //    Não existe fallback automático para dados de modelo.
      const weatherByDate: Record<string, { et0: number; precip: number }> = {};
      const readingsById = new Map(weatherReadings.map((r) => [r.id, r]));
      selectedIdByDate.forEach((readingId, date) => {
        const r = readingsById.get(readingId);
        if (r?.et0_calculated != null) weatherByDate[date] = { et0: r.et0_calculated, precip: r.precipitation };
      });

      // Chuva manual é a observação local preferida, mas só substitui P em um
      // dia que já possui ETo operacional aprovada.
      const { data: manualRainRows } = await supabase
        .from("manual_rainfall_entries")
        .select("date,precipitation_mm")
        .eq("farm_id", activeFarmId!)
        .gte("date", calculationStart)
        .lte("date", dateEnd);
      for (const row of manualRainRows ?? []) {
        const current = weatherByDate[row.date as string];
        const rain = Number(row.precipitation_mm);
        if (current && Number.isFinite(rain) && rain >= 0) {
          weatherByDate[row.date as string] = { ...current, precip: rain };
        }
      }

      const missingApprovedDates = datesInRange(calculationStart, dateEnd)
        .filter((date) => !weatherByDate[date]);
      if (missingApprovedDates.length > 0) {
        const sample = missingApprovedDates.slice(0, 3).join(", ");
        throw new Error(
          `Balanço bloqueado: ${missingApprovedDates.length} dia(s) sem dado climático aprovado (${sample}${missingApprovedDates.length > 3 ? ", …" : ""}). A ETo de modelo está em validação.`,
        );
      }

      // 5. Motor central do balanço hídrico (fonte única de cálculo)
      const engineWeatherByDate: Record<string, { et0: number; precipitation: number }> = {};
      for (const [d, w] of Object.entries(weatherByDate)) {
        engineWeatherByDate[d] = { et0: w.et0, precipitation: w.precip };
      }

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
          initial_soil_moisture_pct: hydricAnchor ? hydricAnchor.moistureValue : assignment.initial_soil_moisture_pct,
          initial_moisture_unit: hydricAnchor ? hydricAnchor.moistureUnit : assignment.initial_moisture_unit,
          initial_moisture_is_cc: hydricAnchor ? hydricAnchor.isFieldCapacity : assignment.initial_moisture_is_cc,
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
        pivot: { application_efficiency: pivot.application_efficiency, efficiency: pivot.efficiency, area: pivot.area, flow_rate: pivot.flow_rate },
        weatherByDate: engineWeatherByDate,
        irrigationByDate,
        dateStart: calculationStart,
        dateEnd,
      });
      if (series.length === 0) {
        throw new Error("Balanço bloqueado: valide condição inicial, solo, fases/Kc e eficiência de aplicação.");
      }
      const visibleSeries = series.filter((d) => d.date >= dateStart);

      // adapta a saída do motor ao formato de exibição da tela
      const rows: DailyBalanceRow[] = visibleSeries.map((d) => ({
        date: d.date,
        phase: d.phase,
        et0: d.et0,
        kc: d.kc,
        etc: d.etc,
        precipitation: d.precipitation,
        effectivePrecipitation: d.effectivePrecipitation,
        irrigationApplied: d.irrigation,
        rootDepth: d.rootDepth,
        cad: d.adt,
        afd: d.afd,
        storedWater: d.storage,
        depletionFactor: d.adt > 0 ? Math.round((d.afd / d.adt) * 1000) / 1000 : 0,
        deficit: d.deficit,
        surplus: d.surplus,
        netDepth: d.recommendedNetDepth,
        grossDepth: d.recommendedGrossDepth,
        volumeNeeded: d.recommendedVolume,
        irrigationTime: d.estimatedIrrigationTime,
        waterStatus: HYDRIC_TO_WATER_STATUS[d.status],
        dae: d.dae,
        ks: d.ks,
        ksFormula: d.ksFormula,
        drStartMm: d.drStartMm,
        kl: d.kl,
        kcAdjusted: d.kcAdjusted,
        etcPotential: d.etcPotential,
        ky: d.ky,
        yieldRisk: d.yieldRisk,
        etcFormula: d.etcFormula,
        effectiveIrrigation: d.effectiveIrrigation,
        fieldCapacity: d.fieldCapacity,
        wiltingPoint: d.wiltingPoint,
        safetyMoistureMm: d.safetyMoistureMm,
        moisturePctCc: d.moisturePctCc,
        safetyPctCc: d.safetyPctCc,
        peFormula: d.peFormula,
        balanceFormula: d.balanceFormula,
      }));

      setBalanceRows(rows);
    } catch (err) {
      setBalanceRows([]);
      setError(err instanceof Error ? err.message : "Erro ao calcular balanço");
    } finally {
      setCalculating(false);
    }
  }, [assignment, culture, soil, soilLayers, phases, hydricAnchor, dateStart, dateEnd, selectedPivotId, pivots, activeFarmId, supabase]);

  // O balanço corrente é sempre recalculado de entradas confiáveis; histórico
  // persistido não é usado como estado atual nem como seed do ARM.
  useEffect(() => {
    setBalanceRows([]);
  }, [assignment?.id, dateStart, dateEnd]);

  const summary = useMemo(() => calculateSummary(balanceRows), [balanceRows]);

  // rastreabilidade (estação climática) + operação (eventos de irrigação)
  const [trace, setTrace] = useState<{ stationName: string | null; distanceKm: number | null; lastSync: string | null; qualityPct: number | null }>({ stationName: null, distanceKm: null, lastSync: null, qualityPct: null });
  const [ops, setOps] = useState<{ volumeM3: number | null; hours: number | null; energyKwh: number | null }>({ volumeM3: null, hours: null, energyKwh: null });
  const [weatherByDate, setWeatherByDate] = useState<Record<string, WeatherExtra>>({});
  const [sensoryByDate, setSensoryByDate] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!activeFarmId || !selectedPivotId || !dateStart || !dateEnd) {
      setTrace({ stationName: null, distanceKm: null, lastSync: null, qualityPct: null });
      setOps({ volumeM3: null, hours: null, energyKwh: null });
      setWeatherByDate({});
      setSensoryByDate({});
      return;
    }
    let cancelled = false;
    (async () => {
      const pivot = pivots.find((p) => p.id === selectedPivotId);
      // mesma estação que venceu a seleção operacional no último dia.
      const { data: latestSelection } = await supabase
        .from("weather_daily_selection")
        .select("selected_station_id")
        .eq("farm_id", activeFarmId)
        .eq("operational_approved", true)
        .lte("date", dateEnd)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const selectedStationId = latestSelection?.selected_station_id as string | undefined;
      const { data: st } = selectedStationId
        ? await supabase
            .from("weather_stations")
            .select("id,name,latitude,longitude")
            .eq("id", selectedStationId)
            .maybeSingle()
        : { data: null };

      let lastSync: string | null = null;
      let qualityPct: number | null = null;
      const wx: Record<string, WeatherExtra> = {};
      if (st?.id) {
        const { data: reads } = await supabase
          .from("weather_readings")
          .select("date, imported_at, data_quality, temp_max, temp_min, temp_mean, humidity, wind_speed, solar_radiation")
          .eq("station_id", st.id as string)
          .gte("date", dateStart)
          .lte("date", dateEnd);
        if (reads && reads.length > 0) {
          lastSync = reads.reduce((m: string, r: { imported_at: string }) => (r.imported_at > m ? r.imported_at : m), reads[0].imported_at as string);
          const ok = reads.filter((r: { data_quality: string }) => r.data_quality === "ok").length;
          qualityPct = Math.round((ok / reads.length) * 100);
          for (const r of reads as Array<{ date: string; temp_max: number | null; temp_min: number | null; temp_mean: number | null; humidity: number | null; wind_speed: number | null; solar_radiation: number | null }>) {
            wx[r.date] = { tmax: r.temp_max, tmin: r.temp_min, tmean: r.temp_mean, rh: r.humidity, wind: r.wind_speed, rad: r.solar_radiation };
          }
        }
      }
      const distanceKm = st && pivot?.latitude != null && pivot?.longitude != null
        ? haversineKm(pivot.latitude, pivot.longitude, st.latitude as number, st.longitude as number)
        : null;

      // eventos de irrigação do pivô no período
      const { data: evs } = await supabase
        .from("irrigation_events")
        .select("started_at, ended_at, volume_m3, energy_kwh")
        .eq("pivot_id", selectedPivotId)
        .gte("started_at", dateStart + "T00:00:00")
        .lte("started_at", dateEnd + "T23:59:59");
      let volumeM3: number | null = null, hours: number | null = null, energyKwh: number | null = null;
      if (evs && evs.length > 0) {
        volumeM3 = evs.reduce((a: number, e: { volume_m3: number }) => a + (e.volume_m3 ?? 0), 0);
        const withEnd = evs.filter((e: { ended_at: string | null }) => e.ended_at);
        hours = withEnd.length > 0 ? withEnd.reduce((a: number, e: { started_at: string; ended_at: string }) => a + (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 3600000, 0) : null;
        const en = evs.reduce((a: number, e: { energy_kwh: number | null }) => a + (e.energy_kwh ?? 0), 0);
        energyKwh = en > 0 ? en : null;
      }

      const { data: sensoryRows } = await supabase
        .from("soil_sensory_readings")
        .select("reading_date, note, layer_1_note, layer_2_note, layer_3_note")
        .eq("pivot_id", selectedPivotId)
        .gte("reading_date", dateStart)
        .lte("reading_date", dateEnd);

      const sensory: Record<string, number> = {};
      for (const row of (sensoryRows ?? []) as Array<{
        reading_date: string;
        note: number | null;
        layer_1_note: number | null;
        layer_2_note: number | null;
        layer_3_note: number | null;
      }>) {
        const n = resolveSensoryNote(row);
        if (n != null) sensory[row.reading_date] = n;
      }

      if (!cancelled) {
        setTrace({ stationName: st?.name ?? null, distanceKm, lastSync, qualityPct });
        setOps({ volumeM3, hours, energyKwh });
        setWeatherByDate(wx);
        setSensoryByDate(sensory);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFarmId, selectedPivotId, dateStart, dateEnd, pivots, supabase]);

  // presets de período — apenas ajustam o intervalo (o carregamento é automático)
  const [activePeriod, setActivePeriod] = useState<number | "safra" | null>(null);
  const applyPeriod = (kind: number | "safra") => {
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    let start: string;
    if (kind === "safra" && assignment?.planting_date) start = assignment.planting_date;
    else {
      const d = typeof kind === "number" ? kind : 30;
      start = new Date(today.getTime() - (d - 1) * 86400000).toISOString().slice(0, 10);
    }
    setDateStart(start);
    setDateEnd(end);
    setActivePeriod(kind);
  };

  // ── Lançamento handler ──────────────────────────────────────────────────
  const handleLancamento = async () => {
    if (!selectedPivotId || !lancDate || !lancDepth) return;
    const pivot = pivots.find((p) => p.id === selectedPivotId);
    if (!pivot) return;
    const launchErr = assertParcelAcceptsOperationalLaunch(
      assignment ? { status: "ativa", active: assignment.active } : null,
    );
    if (launchErr) {
      setLancMsg(launchErr);
      return;
    }
    setLancSaving(true);
    setLancMsg("");

    try {
      const depth = parseFloat(lancDepth);
      const payload = buildIrrigationEventInsert({
        pivotId: selectedPivotId,
        parcelId: assignment?.id ?? null,
        dateYmd: lancDate,
        timeHm: lancTime || "06:00",
        depthMm: depth,
        areaHa: pivot.area,
        flowRateM3h: pivot.flow_rate,
        hoursOverride: lancHours === "" ? null : parseFloat(lancHours),
        notes: lancNotes || null,
      });
      const { data: tariffRows } = await supabase
        .from("energy_tariffs")
        .select("id, valid_from, valid_to, rate_peak, rate_off_peak, peak_start, peak_end")
        .eq("farm_id", activeFarmId);
      const priced = priceIrrigationEvent({
        operatingHours: payload.operating_hours,
        volumeM3: payload.volume_m3,
        depthMm: payload.depth_mm,
        areaHa: pivot.area,
        pumpPowerCv: pivot.pump_power,
        installedPowerKw: pivot.installed_power_kw,
        motorEfficiency: pivot.motor_efficiency,
        specificConsumptionKwhM3: pivot.specific_consumption,
        startedAt: payload.started_at,
        tariff: pickTariffForDate((tariffRows ?? []) as TariffRow[], lancDate),
        pivotEnergyCostReaisPerKwh: pivot.energy_cost,
      });
      const { error: err } = await supabase.from("irrigation_events").insert({
        ...payload,
        energy_kwh: priced.energy_kwh,
        cost: priced.cost,
        tariff_rate: priced.tariff_rate,
        energy_source: priced.energy_source,
      });

      if (err) throw new Error(err.message);
      setLancMsg("Irrigação lançada com sucesso. Recalcule o balanço para ver o ARM.");
      setLancDepth("");
      setLancHours("");
      setLancNotes("");
    } catch (err) {
      setLancMsg(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLancSaving(false);
    }
  };

  if (!activeFarmId) {
    return (
      <div>
        <PageHeader titulo="Balanço Hídrico" descricao="Selecione uma fazenda para continuar" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const selPivot = pivots.find((p) => p.id === selectedPivotId);
  const centroHead = {
    pivotName: selPivot?.name ?? null,
    cultureName: culture?.name ?? null,
    seasonName: null as string | null,
    farmName: farms.find((f) => f.id === activeFarmId)?.name ?? null,
    area: selPivot?.area ?? null,
    efficiency: selPivot ? ((selPivot.application_efficiency ?? selPivot.efficiency) * 100) : null,
    plantingDate: assignment?.planting_date ?? null,
    statusLabel: selPivot ? "Operando" : null,
    energiaEspecifica: selPivot?.specific_consumption ?? null,
    stationName: trace.stationName,
    distanceKm: trace.distanceKm,
    lastSync: trace.lastSync,
    qualityPct: trace.qualityPct,
    volumeM3: ops.volumeM3,
    horasOperadas: ops.hours,
  };

  return (
    <div>
      <PageHeader
        titulo="Balanço Hídrico"
        descricao="Gráfico, dados e decisão em abas — o mapa da fazenda fica na Visão Geral"
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Select
            label="Pivô"
            value={selectedPivotId}
            onChange={(e) => setSelectedPivotId(e.target.value)}
            options={pivots.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Input
            label="Data início"
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
          />
          <Input
            label="Data fim"
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
          />
          <div className="flex items-end">
            <Button
              onClick={runCalculation}
              disabled={!selectedPivotId || !assignment || calculating}
            >
              {calculating ? "Calculando..." : "Calcular"}
            </Button>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Período</span>
          {([7, 15, 30, 60, "safra"] as const).map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => applyPeriod(p)}
              disabled={p === "safra" && !assignment?.planting_date}
              className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-40 ${activePeriod === p ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-900/20 dark:text-brand-300" : "border-gray-200 bg-white text-graphite-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]"}`}
            >
              {p === "safra" ? "Safra" : `${p}d`}
            </button>
          ))}
          {assignment && culture && soil && (
            <span className="ml-2 text-[11px] text-graphite-400 dark:text-gray-500">
              {culture.name} · {soil.name} · plantio {assignment.planting_date}
            </span>
          )}
        </div>
        {!assignment && selectedPivotId && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            Nenhuma parcela ativa encontrada para este pivô.
          </p>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
        {assignment && !hydricAnchor && (
          <HydricInitialConditionForm
            farmId={activeFarmId}
            assignmentId={assignment.id}
            defaultDate={assignment.management_start_date ?? assignment.planting_date}
            onSaved={(anchor) => {
              setHydricAnchor(anchor);
              setBalanceRows([]);
              setError("");
              setDateStart(addDaysIso(anchor.effectiveDate, 1));
            }}
          />
        )}
      </Card>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as typeof activeTab)} />

      <div className="mt-4">
        {(activeTab === "grafico" || activeTab === "dados" || activeTab === "decisao") && (
          <div className="animate-in">
            <BalanceTab
              panel={activeTab}
              rows={balanceRows}
              summary={summary}
              loading={loading || calculating}
              head={centroHead}
              weatherByDate={weatherByDate}
              sensoryByDate={sensoryByDate}
            />
          </div>
        )}
        {activeTab === "lancamento" && (
          <div className="animate-in">          <LancamentoTab
            pivotId={selectedPivotId}
            pivots={pivots}
            date={lancDate}
            time={lancTime}
            depth={lancDepth}
            hours={lancHours}
            notes={lancNotes}
            saving={lancSaving}
            message={lancMsg}
            onDateChange={setLancDate}
            onTimeChange={setLancTime}
            onDepthChange={(v) => {
              setLancDepth(v);
              const pivot = pivots.find((p) => p.id === selectedPivotId);
              const n = parseFloat(v);
              if (pivot && Number.isFinite(n) && n > 0) {
                setLancHours(String(deriveOperatingHours(n, pivot.area, pivot.flow_rate)));
              }
            }}
            onHoursChange={setLancHours}
            onNotesChange={setLancNotes}
            onSave={handleLancamento}
          /></div>
        )}
      </div>
    </div>
  );
}

// ── Gráfico de manejo (multi-séries, estilo técnico) ─────────────────────────
// Estrutura inspirada no gráfico de manejo do setor (faixa de KPIs + séries por
// categoria + linhas/barras num quadro de umidade %CC × mm), com identidade
// própria. Usa apenas os dados que o motor FAO-56 já calcula.

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** Entradas do solo no dia: Pe + I_ef (lâmina bruta × eficiência). */
function soilInflowMm(r: DailyBalanceRow): number {
  return r.effectivePrecipitation + (r.effectiveIrrigation ?? r.irrigationApplied);
}

// ── Balance Tab ─────────────────────────────────────────────────────────

interface CentroHead {
  pivotName: string | null;
  cultureName: string | null;
  seasonName: string | null;
  farmName: string | null;
  area: number | null;
  efficiency: number | null;
  plantingDate: string | null;
  statusLabel: string | null;
  energiaEspecifica: number | null;
  stationName: string | null;
  distanceKm: number | null;
  lastSync: string | null;
  qualityPct: number | null;
  volumeM3: number | null;
  horasOperadas: number | null;
}

const fmtTempoH = (h: number) => {
  if (!h || h <= 0) return "—";
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return H > 0 ? `${H}h${M.toString().padStart(2, "0")}` : `${M}min`;
};

// verdicts derivados do status hídrico do motor (sem inventar dado)
const VERDICT: Record<WaterStatus, { label: string; color: string; irrigar: boolean; texto: (mm: string) => string }> = {
  saturado: { label: "Suspender irrigação", color: "#2f6bff", irrigar: false, texto: () => "Solo saturado — suspender irrigação para evitar drenagem." },
  ideal: { label: "Não irrigar", color: "#1ea85b", irrigar: false, texto: () => "Água disponível dentro da faixa ideal. Manter o manejo." },
  atencao: { label: "Monitorar", color: "#f97316", irrigar: false, texto: () => "Água disponível próxima do limite de segurança. Acompanhar de perto." },
  deficit: { label: "Irrigar", color: "#e5484d", irrigar: true, texto: (mm) => `Aplicar ${mm} para repor a água do solo.` },
  deficit_critico: { label: "Irrigação urgente", color: "#c0353a", irrigar: true, texto: (mm) => `Déficit crítico — aplicar ${mm} com prioridade.` },
};

function BalanceTab({
  panel,
  rows,
  summary,
  loading,
  head,
  weatherByDate,
  sensoryByDate,
}: {
  panel: "grafico" | "dados" | "decisao";
  rows: DailyBalanceRow[];
  summary: ReturnType<typeof calculateSummary>;
  loading: boolean;
  head: CentroHead;
  weatherByDate: Record<string, WeatherExtra>;
  sensoryByDate: Record<string, number>;
}) {
  const [visible, setVisible] = useState<Record<ManejoSeriesKey, boolean>>(() => initialManejoVisibility());
  const toggleSeries = (k: ManejoSeriesKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));
  const manejoRows = useMemo(
    () => rows.map((r) => managementRowFromBalance(r, {
      sensoryNote: sensoryByDate[r.date] ?? null,
      weather: weatherByDate[r.date],
      pivotName: head.pivotName ?? undefined,
      cultureName: head.cultureName ?? undefined,
    })),
    [rows, sensoryByDate, weatherByDate, head.pivotName, head.cultureName],
  );
  const [tblFilter, setTblFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const filteredRows = tblFilter.trim()
    ? rows.filter((r) => {
        const q = tblFilter.toLowerCase();
        return r.date.includes(q) || fmtDia(r.date).includes(q) || r.phase.toLowerCase().includes(q);
      })
    : rows;

  const exportCsv = () => {
    const headers = ["Data", "Fase", "Kc", "Ks", "KL", "ETo", "ETcPot", "ETc", "Ky", "Risco", "Chuva", "ChuvaEf", "Irrigacao", "Ief", "Entradas", "Saidas", "Saldo", "CAD", "AFD", "ARM", "SegMm", "PctCC", "Sensorial", "Deplecao%", "Deficit", "LaminaRec", "Status"];
    const lines = filteredRows.map((r) => {
      const entr = soilInflowMm(r);
      const depl = r.cad > 0 ? Math.round(((r.cad - r.storedWater) / r.cad) * 100) : 0;
      const lam = r.deficit >= r.afd && r.afd > 0 ? r.grossDepth : 0;
      const pctCc = moisturePctCcForDisplay(r.moisturePctCc, r.storedWater, r.cad);
      const sens = sensoryByDate[r.date];
      return [
        r.date, r.phase, r.kc.toFixed(2), (r.ks ?? 1).toFixed(2), (r.kl ?? 1).toFixed(2),
        r.et0.toFixed(1), (r.etcPotential ?? r.etc).toFixed(1), r.etc.toFixed(1),
        r.ky != null ? r.ky.toFixed(2) : "", r.yieldRisk != null ? r.yieldRisk.toFixed(2) : "",
        r.precipitation.toFixed(1), r.effectivePrecipitation.toFixed(1), r.irrigationApplied.toFixed(1),
        (r.effectiveIrrigation ?? r.irrigationApplied).toFixed(1),
        entr.toFixed(1), r.etc.toFixed(1), (entr - r.etc).toFixed(1),
        r.cad.toFixed(1), r.afd.toFixed(1), r.storedWater.toFixed(1),
        (r.safetyMoistureMm ?? Math.max(r.cad - r.afd, 0)).toFixed(1), pctCc.toFixed(1),
        sens != null ? String(sens) : "",
        depl, r.deficit.toFixed(1), lam.toFixed(1), WATER_STATUS_CONFIG[r.waterStatus].label,
      ].join(";");
    });
    const csv = "﻿" + [headers.join(";"), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `balanco-hidrico-${rows[0]?.date ?? ""}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0 && !loading) {
    return (
      <Card className="py-16 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" /></svg>
        </div>
        <p className="text-graphite-500 dark:text-gray-400">Selecione um pivô e clique em <strong className="text-graphite-800 dark:text-white">Calcular</strong> para abrir o gráfico, os dados do balanço e a decisão.</p>
      </Card>
    );
  }

  const last = rows[rows.length - 1];
  const first = rows[0];
  const cad = last?.cad ?? 0;
  const afd = last?.afd ?? 0;
  const arm = last?.storedWater ?? 0;
  const pctCc = last ? moisturePctCcForDisplay(last.moisturePctCc, last.storedWater, last.cad) : 0;
  const safetyMm = last?.safetyMoistureMm ?? Math.max(cad - afd, 0);
  const safetyPct = last ? safetyPctCcForDisplay(last.safetyPctCc, last.cad, last.afd) : 0;
  const untilSafety = arm - safetyMm;
  const classificacao = arm >= safetyMm ? { label: "Adequado", color: "#1ea85b" } : arm >= safetyMm * 0.5 ? { label: "Atenção", color: "#f97316" } : { label: "Crítico", color: "#e5484d" };
  const variacao = (last?.storedWater ?? 0) - (first?.storedWater ?? 0);
  const tendencia = variacao < -0.5 ? { label: "queda", down: true } : variacao > 0.5 ? { label: "alta", down: false } : { label: "estável", down: false };
  const efPct = head.efficiency ?? (last ? (last.grossDepth > 0 ? (last.netDepth / last.grossDepth) * 100 : 85) : 85);
  const etoTotal = rows.reduce((a, r) => a + r.et0, 0);
  const stressPct = summary.days > 0 ? (summary.daysInDeficit / summary.days) * 100 : 0;
  const verdict = VERDICT[last?.waterStatus ?? "ideal"];
  const laminaBruta = last?.grossDepth ?? 0;
  const urgency = last
    ? calculateManagementUrgency({
        afd: last.afd,
        deficit: last.deficit,
        etcPotential: last.etcPotential ?? last.etc,
      })
    : null;
  const daysToAfdLabel = urgency
    ? urgency.atOrBeyondAfd
      ? "limite atingido"
      : urgency.daysToAfd == null
        ? "sem demanda"
        : urgency.daysToAfd < 1
          ? "< 1 dia"
          : `${urgency.daysToAfd.toFixed(1)} dias`
    : "—";

  const columns: Column<DailyBalanceRow>[] = [
    { header: "Data", render: (r) => fmtDia(r.date) },
    { header: "Fase", render: (r) => <span className="text-xs">{r.phase}</span> },
    { header: "Kc", render: (r) => r.kc.toFixed(2) },
    { header: "Ks", render: (r) => <span title={r.ksFormula}>{(r.ks ?? 1).toFixed(2)}</span> },
    { header: "KL", render: (r) => (r.kl ?? 1).toFixed(2) },
    { header: "ETo", render: (r) => r.et0.toFixed(1) },
    { header: "ETc pot.", render: (r) => (r.etcPotential ?? r.etc).toFixed(1) },
    { header: "ETc", render: (r) => <span title={r.etcFormula}>{r.etc.toFixed(1)}</span> },
    { header: "Ky", render: (r) => r.ky != null ? r.ky.toFixed(2) : "—" },
    { header: "Risco", render: (r) => r.yieldRisk != null ? r.yieldRisk.toFixed(2) : "—" },
    { header: "Chuva", render: (r) => r.precipitation.toFixed(1) },
    { header: "Ch. ef.", render: (r) => <span title={r.peFormula}>{r.effectivePrecipitation.toFixed(1)}</span> },
    { header: "Irrig.", render: (r) => r.irrigationApplied > 0 ? <span className="text-cyan-600 dark:text-cyan-400">{r.irrigationApplied.toFixed(1)}</span> : "0.0" },
    { header: "I ef.", render: (r) => (r.effectiveIrrigation ?? r.irrigationApplied).toFixed(1) },
    { header: "Entradas", render: (r) => <span className="text-blue-600 dark:text-blue-400">{soilInflowMm(r).toFixed(1)}</span> },
    { header: "Saídas", render: (r) => <span className="text-amber-600 dark:text-amber-400">{r.etc.toFixed(1)}</span> },
    { header: "Saldo", render: (r) => { const s = soilInflowMm(r) - r.etc; return <span className={s >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{s >= 0 ? "+" : ""}{s.toFixed(1)}</span>; } },
    { header: "CAD", render: (r) => r.cad.toFixed(1) },
    { header: "AFD", render: (r) => r.afd.toFixed(1) },
    { header: "ARM", render: (r) => <span title={r.balanceFormula}>{r.storedWater.toFixed(1)}</span> },
    { header: "Seg.", render: (r) => (r.safetyMoistureMm ?? Math.max(r.cad - r.afd, 0)).toFixed(1) },
    { header: "% CC", render: (r) => `${moisturePctCcForDisplay(r.moisturePctCc, r.storedWater, r.cad).toFixed(0)}` },
    { header: "Sens.", render: (r) => sensoryByDate[r.date] != null ? <span className="font-semibold text-violet-600 dark:text-violet-400">{sensoryByDate[r.date]}</span> : "—" },
    { header: "Déficit", render: (r) => r.deficit > 0 ? <span className="text-red-600 dark:text-red-400">{r.deficit.toFixed(1)}</span> : "0.0" },
    { header: "Lâm. rec.", render: (r) => r.deficit >= r.afd && r.afd > 0 ? r.grossDepth.toFixed(1) : "0.0" },
    {
      header: "Status",
      render: (r) => {
        const cfg = WATER_STATUS_CONFIG[r.waterStatus];
        return (
          <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.bgClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {cfg.label}
          </span>
        );
      },
    },
  ];

  if (loading) {
    return (
      <Card className="flex items-center justify-center gap-3 py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
        <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
      </Card>
    );
  }

  if (panel === "grafico") {
    return (
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
          <div>
            <p className="text-[15px] font-bold text-graphite-900 dark:text-white">
              {head.pivotName ?? "Pivô"}{head.cultureName ? ` — ${head.cultureName}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">
              {pctCc.toFixed(0)}% da CC · ARM {arm.toFixed(1)} mm · {classificacao.label}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-bold" style={{ color: verdict.color, background: `${verdict.color}18` }}>
            <span className="h-2 w-2 rounded-full" style={{ background: verdict.color }} />
            {verdict.label}
          </span>
        </div>
        <div className="flex min-h-[min(72vh,calc(100vh-14rem))] flex-col lg:flex-row">
          <ManejoSeriesPicker rows={manejoRows} visible={visible} onToggle={toggleSeries} />
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <ManejoChart rows={manejoRows} visible={visible} />
          </div>
        </div>
      </Card>
    );
  }

  if (panel === "decisao") {
    return (
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/* Recomendação de hoje */}
        <Card className="overflow-hidden p-0">
          <div className="bg-gradient-to-br from-forest-800 to-forest-900 p-4 text-white">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-brand-300">Recomendação de hoje</p>
            <p className="mt-1.5 flex items-center gap-2 text-[20px] font-extrabold" style={{ color: "#eafaf1" }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: verdict.color }} />{verdict.label}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-brand-100/90">{verdict.texto(`${laminaBruta.toFixed(1)} mm`)}</p>
          </div>
          <div className="p-4">
            {verdict.irrigar ? (
              <div className="space-y-0">
                {[
                  { l: "Lâmina líquida", v: `${(last?.netDepth ?? 0).toFixed(1)} mm` },
                  { l: "Lâmina bruta", v: `${laminaBruta.toFixed(1)} mm` },
                  { l: "Eficiência", v: `${efPct.toFixed(0)}%` },
                  { l: "Volume necessário", v: `${(last?.volumeNeeded ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m³` },
                  { l: "Tempo estimado", v: fmtTempoH(last?.irrigationTime ?? 0) },
                ].map((r) => (
                  <div key={r.l} className="flex items-center justify-between border-b border-dashed border-gray-100 py-1.5 text-[12.5px] last:border-0 dark:border-white/[0.06]">
                    <span className="text-graphite-500 dark:text-gray-400">{r.l}</span>
                    <span className="font-bold text-graphite-800 dark:text-white">{r.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-graphite-500 dark:text-gray-400">Sem necessidade de irrigação para hoje. Acompanhar a evolução da umidade.</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[13px] font-bold text-graphite-900 dark:text-white">Por que esta recomendação?</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-graphite-500 dark:text-gray-400">
            {arm < safetyMm
              ? "O ARM está abaixo da umidade de segurança (CAD − AFD) e a demanda (ETc) supera as entradas recentes."
              : urgency?.daysToAfd != null
                ? `O ARM está dentro da faixa segura. Mantida a demanda atual e sem chuva/irrigação, a AFD seria atingida em aproximadamente ${urgency.daysToAfd.toFixed(1)} dia(s).`
                : "O ARM está dentro da faixa segura; as entradas cobrem a demanda atual."}
          </p>
          <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-500/20 dark:bg-brand-900/15">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Ks — estresse hídrico FAO-56</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums text-graphite-900 dark:text-white">
              {(last?.ks ?? 1).toFixed(2)}
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-graphite-500 dark:text-gray-400">
              {last?.ksFormula ?? KS_FAO56_FORMULA}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-graphite-500 dark:text-gray-400">
              {interpretFao56Ks(last?.ks)}
            </p>
            <p className="mt-1.5 text-[11px] tabular-nums text-graphite-400 dark:text-gray-500">
              Dr {(last?.drStartMm ?? last?.deficit ?? 0).toFixed(1)} mm · CAD {cad.toFixed(1)} mm · AFD {afd.toFixed(1)} mm
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-graphite-400 dark:text-gray-500" title={last?.etcFormula}>
              {ETC_FORMULA}: ETc {(last?.etc ?? 0).toFixed(1)} mm · ETc pot. {(last?.etcPotential ?? last?.etc ?? 0).toFixed(1)} mm
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { l: "ARM atual", v: `${arm.toFixed(1)} mm` },
              { l: "CAD / AFD", v: `${cad.toFixed(1)} / ${afd.toFixed(1)} mm` },
              { l: "Umidade de segurança", v: `${safetyMm.toFixed(1)} mm` },
              { l: "% da CC", v: `${pctCc.toFixed(0)}%` },
              { l: "Déficit atual", v: `${(last?.deficit ?? 0).toFixed(1)} mm` },
              { l: "AFD consumida", v: urgency ? `${urgency.afdUsedPct.toFixed(0)}%` : "—" },
              { l: "Margem até AFD", v: urgency ? (urgency.atOrBeyondAfd ? "limite atingido" : `${urgency.remainingToAfdMm.toFixed(1)} mm`) : "—" },
              { l: "Dias até AFD", v: daysToAfdLabel },
              { l: "Risco faixa crítica", v: classificacao.label === "Crítico" ? "Alto" : classificacao.label === "Atenção" ? "Médio" : "Baixo", c: classificacao.color },
            ].map((f) => (
              <div key={f.l} className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/[0.03]">
                <p className="text-[9.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{f.l}</p>
                <p className="mt-1 text-[14px] font-extrabold tabular-nums" style={{ color: f.c ?? undefined }}>{f.v}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-graphite-900 dark:text-white">
            <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a1 1 0 00.9 1.5h18.6a1 1 0 00.9-1.5L13.7 3.9a1 1 0 00-1.7 0z" /></svg>
            Alertas e observações
          </p>
          {(() => {
            const items: { sev: "hi" | "md" | "lo"; title: string; desc: string }[] = [];
            if (arm < safetyMm) items.push({ sev: classificacao.label === "Crítico" ? "hi" : "md", title: "Solo abaixo da faixa de segurança", desc: `ARM em ${pctCc.toFixed(0)}% da CC — repor para evitar estresse.` });
            if ((last?.ks ?? 1) < 1) items.push({ sev: "md", title: "Ks < 1 — transpiração limitada pela água do solo", desc: interpretFao56Ks(last?.ks) });
            if (urgency && !urgency.atOrBeyondAfd && urgency.daysToAfd != null && urgency.daysToAfd <= 2) items.push({ sev: "md", title: "Limite de manejo próximo", desc: `Restam ${urgency.remainingToAfdMm.toFixed(1)} mm até a AFD; na demanda atual, cerca de ${urgency.daysToAfd.toFixed(1)} dia(s).` });
            if ((last?.surplus ?? 0) > 0) items.push({ sev: "md", title: "Possível excesso / drenagem", desc: `Excedente de ${(last?.surplus ?? 0).toFixed(1)} mm acima da capacidade de campo.` });
            if (summary.daysInCritical > 0) items.push({ sev: "hi", title: `${summary.daysInCritical} dia(s) em déficit crítico`, desc: "No período analisado houve dias em déficit crítico." });
            if (items.length === 0) items.push({ sev: "lo", title: "Tudo dentro do esperado", desc: urgency && urgency.daysToAfd != null ? `Sem alerta ativo. Janela estimada até a AFD: ${urgency.daysToAfd.toFixed(1)} dia(s).` : "Nenhum alerta ativo para o pivô no período." });
            const sevCls = { hi: "bg-red-500", md: "bg-orange-500", lo: "bg-brand-500" } as const;
            return items.map((a, i) => (
              <div key={i} className="flex gap-3 border-t border-gray-100 py-2.5 first:border-0 dark:border-white/[0.06]">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevCls[a.sev]}`} />
                <div>
                  <p className="text-[12.5px] font-bold text-graphite-800 dark:text-white">{a.title}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-graphite-400 dark:text-gray-500">{a.desc}</p>
                </div>
              </div>
            ));
          })()}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-forest-900 to-forest-800 p-5 text-white shadow-elevated sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-300">Dados do balanço</p>
            <h2 className="mt-1 text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              {head.pivotName ?? "Pivô"}{head.cultureName ? ` — ${head.cultureName}` : ""}
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-brand-100/90">
              {head.farmName && <span>Fazenda <strong className="font-semibold text-white">{head.farmName}</strong></span>}
              {head.area != null && <span>Área <strong className="font-semibold text-white">{head.area} ha</strong></span>}
              {head.efficiency != null && <span>Eficiência <strong className="font-semibold text-white">{head.efficiency.toFixed(0)}%</strong></span>}
              <span>Atualizado <strong className="font-semibold text-white">{fmtDia(last?.date ?? "")}</strong></span>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ color: classificacao.color, background: `${classificacao.color}22` }}>
            <span className="h-2 w-2 rounded-full" style={{ background: classificacao.color }} />
            {classificacao.label} · {pctCc.toFixed(0)}% da CC
          </span>
        </div>
      </div>

      {/* 2 · Situação atual (CAD / AFD / ARM / segurança — unidades explícitas) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">ARM</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{arm.toFixed(1)}<span className="text-[14px] text-graphite-400"> mm</span> <span className="text-[14px] font-bold text-graphite-400">· {pctCc.toFixed(0)}% da CC</span></p>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-gray-100 dark:bg-white/[0.06]"><div className="h-full rounded" style={{ width: `${clampN(pctCc, 0, 100)}%`, background: classificacao.color }} /></div>
          <span className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tendencia.down ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400" : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"}`}>{tendencia.down ? "▼" : "▲"} {tendencia.label}</span>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">CAD / AFD</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{cad.toFixed(1)}<span className="text-[14px] text-graphite-400"> mm</span></p>
          <p className="mt-2.5 text-[11.5px] tabular-nums text-graphite-400 dark:text-gray-500">AFD {afd.toFixed(1)} mm · p {cad > 0 ? (afd / cad).toFixed(2) : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Umidade de segurança</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{safetyMm.toFixed(1)}<span className="text-[14px] text-graphite-400"> mm</span> <span className="text-[14px] font-bold text-graphite-400">· {safetyPct.toFixed(0)}% da CC</span></p>
          <p className="mt-2.5 text-[11.5px] tabular-nums text-graphite-400 dark:text-gray-500">{untilSafety >= 0 ? `a ${untilSafety.toFixed(1)} mm do limite` : "abaixo do limite de segurança"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Situação do solo</p>
          <p className="mt-2 text-[22px] font-extrabold leading-none" style={{ color: classificacao.color }}>{classificacao.label}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-graphite-400 dark:text-gray-500">
            {classificacao.label === "Adequado" ? "ARM acima da umidade de segurança." : classificacao.label === "Atenção" ? "Próximo do limite CAD − AFD." : "Déficit relevante — repor a água do solo."}
          </p>
        </Card>
      </div>

      {/* 3 · Totais do período */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 bg-forest-900 px-6 py-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-300">Totais do período</p>
          <p className="mt-0.5 text-[14px] font-semibold text-white">
            {first ? fmtDia(first.date) : ""} – {last ? fmtDia(last.date) : ""} · {summary.days} dias
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-white/10 bg-forest-900 sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0">
          {[
            { l: "Dias manejados", v: String(summary.days) },
            { l: "DAP", v: last?.dae != null ? String(last.dae) : "—" },
            { l: "Irrigação", v: `${summary.totalIrrigation.toFixed(0)} mm` },
            { l: "Chuva", v: `${summary.totalPrecipitation.toFixed(0)} mm` },
            { l: "Irrigação efetiva", v: `${(summary.totalIrrigation * efPct / 100).toFixed(0)} mm` },
            { l: "ETo", v: `${etoTotal.toFixed(0)} mm` },
            { l: "ETc", v: `${summary.totalETc.toFixed(0)} mm` },
            { l: "Índice de estresse", v: `${stressPct.toFixed(0)}%` },
          ].map((k) => (
            <div key={k.l} className="px-4 py-3.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-brand-200/80">{k.l}</p>
              <p className="mt-1 text-[16px] font-extrabold tabular-nums text-white">{k.v}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 sm:grid-cols-3 dark:divide-white/[0.06]">
          {[
            { l: "Chuva efetiva", v: `${summary.totalEffPrecipitation.toFixed(0)} mm` },
            { l: "Variação armaz.", v: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1)} mm`, cls: variacao >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
            { l: "Dias em estresse", v: `${summary.daysInDeficit}`, sub: `${stressPct.toFixed(0)}% do período` },
            { l: "Eficiência média", v: `${efPct.toFixed(0)}%` },
            head.volumeM3 != null ? { l: "Volume acumulado", v: `${(head.volumeM3 / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil m³` } : { l: "Volume acumulado", v: "pendente", pend: true },
            head.horasOperadas != null ? { l: "Horas operadas", v: `${head.horasOperadas.toFixed(0)} h` } : { l: "Horas operadas", v: "pendente", pend: true },
            head.energiaEspecifica != null ? { l: "Energia específica", v: `${head.energiaEspecifica} kWh/m³` } : { l: "Energia específica", v: "pendente", pend: true },
            { l: "Uniformidade (CUC)", v: "pendente", pend: true },
            {
              l: "Janela até AFD",
              v: daysToAfdLabel,
              sub: urgency
                ? urgency.atOrBeyondAfd
                  ? "AFD já atingida"
                  : `${urgency.remainingToAfdMm.toFixed(1)} mm de margem`
                : undefined,
              cls: urgency?.atOrBeyondAfd
                ? "text-red-600 dark:text-red-400"
                : urgency?.daysToAfd != null && urgency.daysToAfd <= 2
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-graphite-900 dark:text-white",
            },
          ].map((s, i) => (
            <div key={i} className="px-5 py-3.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{s.l}</p>
              <p className={`mt-1 text-[16px] font-extrabold tabular-nums ${s.pend ? "text-graphite-300 dark:text-gray-600" : s.cls ?? "text-graphite-900 dark:text-white"}`}>{s.v}</p>
              {s.sub && <p className="mt-0.5 text-[10.5px] tabular-nums text-graphite-400 dark:text-gray-500">{s.sub}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* 9 · Tabela técnica */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Dados diários do balanço hídrico <span className="font-normal text-graphite-400 dark:text-gray-500">({filteredRows.length} de {rows.length})</span></p>
          <div className="flex items-center gap-2">
            {showFilter && (
              <input
                type="text"
                autoFocus
                value={tblFilter}
                onChange={(e) => setTblFilter(e.target.value)}
                placeholder="Filtrar data ou fase…"
                className="h-8 w-40 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-graphite-700 outline-none focus:border-brand-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-200"
              />
            )}
            <button type="button" onClick={() => { setShowFilter((s) => !s); if (showFilter) setTblFilter(""); }} className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${showFilter ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-900/20 dark:text-brand-300" : "border-gray-200 bg-white text-graphite-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]"}`}>Filtros</button>
            <button type="button" onClick={exportCsv} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-graphite-600 transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]">Excel</button>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-graphite-600 transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]">PDF</button>
          </div>
        </div>
        <div className="overflow-x-auto px-2 pb-2">
          <Table columns={columns} data={filteredRows} getKey={(r) => r.date} />
        </div>
      </Card>

      {/* 10 · Rastreabilidade */}
      <div className="flex flex-wrap gap-x-7 gap-y-2 rounded-2xl border border-gray-100 bg-gray-50/60 px-6 py-4 text-[11.5px] text-graphite-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-400">
        <p className="w-full text-[10px] font-bold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Rastreabilidade</p>
        <span>Método ETo <strong className="font-semibold text-graphite-800 dark:text-white">FAO Penman-Monteith</strong></span>
        <span>Origem do Kc <strong className="font-semibold text-graphite-800 dark:text-white">Interpolação linear na fase</strong></span>
        <span>ETc <strong className="font-semibold text-graphite-800 dark:text-white">{ETC_FORMULA}</strong></span>
        <span>Ks <strong className="font-semibold text-graphite-800 dark:text-white">{KS_FAO56_FORMULA}</strong></span>
        <span>Ky <strong className="font-semibold text-graphite-800 dark:text-white">risco produtivo, não lâmina</strong></span>
        <span>Chuva efetiva <strong className="font-semibold text-graphite-800 dark:text-white">{PE_METHOD}</strong></span>
        <span>Balanço <strong className="font-semibold text-graphite-800 dark:text-white">{ARM_FORMULA}</strong></span>
        <span>Unidades <strong className="font-semibold text-graphite-800 dark:text-white">CAD/AFD/ARM mm · % da CC volumétrico</strong></span>
        <span>Sensorial <strong className="font-semibold text-graphite-800 dark:text-white">nota 1–10, sem conversão para % da CC</strong></span>
        <span>Irrigação <strong className="font-semibold text-graphite-800 dark:text-white">evento real · I_ef = I × eficiência</strong></span>
        <span>Eficiência <strong className="font-semibold text-graphite-800 dark:text-white">{efPct.toFixed(0)}%</strong></span>
        <span>Motor <strong className="font-semibold text-graphite-800 dark:text-white">FAO-56</strong></span>
        <span>Fonte climática {head.stationName ? <strong className="font-semibold text-graphite-800 dark:text-white">{head.stationName}</strong> : <strong className="font-semibold text-graphite-300 dark:text-gray-600">pendente</strong>}</span>
        <span>Distância estação {head.distanceKm != null ? <strong className="font-semibold text-graphite-800 dark:text-white">{head.distanceKm.toFixed(1)} km</strong> : <strong className="font-semibold text-graphite-300 dark:text-gray-600">pendente</strong>}</span>
        <span>Última sincronização {head.lastSync ? <strong className="font-semibold text-graphite-800 dark:text-white">{fmtDia(head.lastSync.slice(0, 10))} {head.lastSync.slice(11, 16)}</strong> : <strong className="font-semibold text-graphite-300 dark:text-gray-600">pendente</strong>}</span>
        {head.qualityPct != null && (
          <span className="inline-flex items-center gap-2">Qualidade
            <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-white/[0.1]"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${head.qualityPct}%` }} /></span>
            <strong className="font-semibold text-graphite-800 dark:text-white">{head.qualityPct}%</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Lancamento Tab ──────────────────────────────────────────────────────

function LancamentoTab({
  pivotId,
  pivots,
  date,
  time,
  depth,
  hours,
  notes,
  saving,
  message,
  onDateChange,
  onTimeChange,
  onDepthChange,
  onHoursChange,
  onNotesChange,
  onSave,
}: {
  pivotId: string;
  pivots: Pivot[];
  date: string;
  time: string;
  depth: string;
  hours: string;
  notes: string;
  saving: boolean;
  message: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onDepthChange: (v: string) => void;
  onHoursChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onSave: () => void;
}) {
  const pivot = pivots.find((p) => p.id === pivotId);
  const depthN = parseFloat(depth);
  const volume = pivot && Number.isFinite(depthN) && depthN > 0
    ? deriveAppliedVolume(depthN, pivot.area)
    : null;

  return (
    <Card>
      <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">
        Registrar irrigação realizada
      </h3>
      {!pivotId ? (
        <p className="text-sm text-graphite-400 dark:text-gray-500">
          Selecione um pivô acima para lançar o evento.
        </p>
      ) : (
        <div className="grid max-w-lg grid-cols-1 gap-5 sm:grid-cols-2">
          <Input label="Data" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
          <Input label="Hora" type="time" value={time} onChange={(e) => onTimeChange(e.target.value)} />
          <Input
            label="Lâmina bruta (mm)"
            type="number"
            step="0.1"
            min="0"
            value={depth}
            onChange={(e) => onDepthChange(e.target.value)}
          />
          <Input
            label="Horas de operação"
            type="number"
            step="0.1"
            min="0"
            value={hours}
            onChange={(e) => onHoursChange(e.target.value)}
          />
          {volume != null && (
            <p className="col-span-full text-xs text-graphite-400 dark:text-gray-500">
              Volume: <strong>{volume.toLocaleString("pt-BR")} m³</strong>
            </p>
          )}
          <div className="col-span-full">
            <TextArea label="Observação (opcional)" value={notes} onChange={(e) => onNotesChange(e.target.value)} />
          </div>
          <div className="col-span-full">
            <Button onClick={onSave} disabled={!date || !depth || saving}>
              {saving ? "Salvando..." : "Lançar Irrigação"}
            </Button>
          </div>
          {message && (
            <p role="alert" className={`col-span-full rounded-xl p-3.5 text-xs ${message.includes("sucesso") ? "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"}`}>
              {message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
