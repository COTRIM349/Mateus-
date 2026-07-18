"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Select,
  Table,
  Tabs,
  Input,
  StatCard,
  ChartCard,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  calculateSummary,
  computePivotBalanceSeries,
  WATER_STATUS_CONFIG,
  HYDRIC_STATUS_CONFIG,
  type DailyBalanceRow,
  type WaterStatus,
  type HydricStatus,
} from "@/modules/water-balance/services";
import { type CulturePhase } from "@/modules/culture/services";
import { useRecharts, useFarmHydricState } from "@/lib/hooks";
import { radiusFromArea } from "@/utils/geo";
import { cn } from "@/utils/cn";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-white/[0.06] dark:bg-graphite-800">
        <p className="text-sm text-graphite-400">Carregando mapa...</p>
      </div>
    ),
  },
);

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

// ── Types ─────────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  efficiency: number;
  farm_id: string;
  specific_consumption: number | null;
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
  emergence_date: string | null;
  crop_stage: string;
  parameter_mode: "padrao" | "personalizado";
  initial_root_depth: number | null;
  max_root_depth: number | null;
  irrigation_efficiency: number | null;
  depletion_factor: number | null;
  active: boolean;
}

interface Culture {
  id: string;
  name: string;
  cycle_days: number;
  root_depth: number;
  depletion_factor: number;
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
  started_at: string;
  depth_mm: number;
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
}

// ── Constants ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "balanco", label: "Balanço Diário" },
  { id: "graficos", label: "Gráficos" },
  { id: "lancamento", label: "Lançamento Irrigação" },
];

// ── Main Page ─────────────────────────────────────────────────────────────

export default function BalancoHidricoPage() {
  const { activeFarmId, farms } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState("balanco");
  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [assignment, setAssignment] = useState<CropAssignment | null>(null);
  const [culture, setCulture] = useState<Culture | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [phases, setPhases] = useState<CulturePhase[]>([]);
  const [balanceRows, setBalanceRows] = useState<DailyBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");

  // Lançamento tab
  const [lancDate, setLancDate] = useState("");
  const [lancDepth, setLancDepth] = useState("");
  const [lancSaving, setLancSaving] = useState(false);
  const [lancMsg, setLancMsg] = useState("");

  // Estado hídrico atual de todos os pivôs — apenas para colorir o mapa
  // seletor. Não altera o cálculo detalhado (que continua sob demanda).
  const { states: hydricStates } = useFarmHydricState();
  const mapPivots = useMemo(
    () =>
      hydricStates
        .filter((s) => s.latitude && s.longitude)
        .map((s) => ({
          id: s.pivotId,
          name: s.pivotName,
          latitude: s.latitude,
          longitude: s.longitude,
          radiusMeters: radiusFromArea(s.area),
          color: HYDRIC_STATUS_CONFIG[s.current?.status ?? "cinza"].color,
        })),
    [hydricStates],
  );

  // Load pivots
  useEffect(() => {
    if (!activeFarmId) return;
    (async () => {
      const { data } = await supabase
        .from("pivots")
        .select("id, name, area, flow_rate, efficiency, farm_id, specific_consumption, latitude, longitude")
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
      setPhases([]);
      return;
    }
    (async () => {
      const { data: pca } = await supabase
        .from("pivot_crop_assignments")
        .select("*")
        .eq("pivot_id", selectedPivotId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!pca) {
        setAssignment(null);
        setCulture(null);
        setSoil(null);
        setPhases([]);
        return;
      }
      const a = pca as CropAssignment;
      setAssignment(a);

      const [{ data: cultureData }, { data: soilData }, { data: phaseData }] = await Promise.all([
        supabase.from("cultures").select("id, name, cycle_days, root_depth, depletion_factor").eq("id", a.culture_id).single(),
        supabase.from("soils").select("id, name, field_capacity, wilting_point, bulk_density, effective_depth").eq("id", a.soil_id).single(),
        supabase.from("culture_phases").select("*").eq("culture_id", a.culture_id).order("phase_order"),
      ]);

      setCulture(cultureData as Culture | null);
      setSoil(soilData as Soil | null);
      setPhases((phaseData ?? []) as CulturePhase[]);

      if (a.planting_date) {
        const start = a.planting_date;
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

    try {
      const pivot = pivots.find((p) => p.id === selectedPivotId);
      if (!pivot) throw new Error("Pivô não encontrado");

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
            .gte("date", dateStart)
            .lte("date", dateEnd)
            .order("date"),
          supabase
            .from("weather_daily_selection")
            .select("date, selected_reading_id")
            .eq("farm_id", activeFarmId!)
            .gte("date", dateStart)
            .lte("date", dateEnd),
        ]);
        weatherReadings = (wrRes.data ?? []) as WeatherReading[];
        for (const s of dsRes.data ?? []) {
          if (s.selected_reading_id) {
            selectedIdByDate.set(s.date as string, s.selected_reading_id as string);
          }
        }
      }

      // 2. Get irrigation events for the pivot
      const { data: irrEvents } = await supabase
        .from("irrigation_events")
        .select("id, pivot_id, started_at, depth_mm")
        .eq("pivot_id", selectedPivotId)
        .gte("started_at", dateStart + "T00:00:00")
        .lte("started_at", dateEnd + "T23:59:59");

      const irrigationByDate: Record<string, number> = {};
      for (const ev of (irrEvents ?? []) as IrrigationEvent[]) {
        const d = ev.started_at.slice(0, 10);
        irrigationByDate[d] = (irrigationByDate[d] ?? 0) + ev.depth_mm;
      }

      // 3. Get any manually stored balance entries (applied_depth)
      const { data: storedBalances } = await supabase
        .from("water_balances")
        .select("date, applied_depth")
        .eq("pivot_crop_assignment_id", assignment.id)
        .gte("date", dateStart)
        .lte("date", dateEnd);

      for (const sb of (storedBalances ?? []) as { date: string; applied_depth: number }[]) {
        if (sb.applied_depth > 0 && !irrigationByDate[sb.date]) {
          irrigationByDate[sb.date] = sb.applied_depth;
        }
      }

      // 4. Build weather lookup by date
      //    Prioridade: leitura apontada por weather_daily_selection quando
      //    existir. Fallback: qualquer leitura com ET₀ > 0 disponível.
      const weatherByDate: Record<string, { et0: number; precip: number }> = {};
      const readingsById = new Map(weatherReadings.map((r) => [r.id, r]));
      selectedIdByDate.forEach((readingId, date) => {
        const r = readingsById.get(readingId);
        if (r) weatherByDate[date] = { et0: r.et0_calculated ?? 0, precip: r.precipitation };
      });
      for (const r of weatherReadings) {
        if (weatherByDate[r.date]) continue;
        if (!weatherByDate[r.date] || (r.et0_calculated ?? 0) > 0) {
          weatherByDate[r.date] = {
            et0: r.et0_calculated ?? 0,
            precip: r.precipitation,
          };
        }
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
        },
        culture: { root_depth: culture.root_depth, depletion_factor: culture.depletion_factor },
        phases,
        soil: {
          field_capacity: soil.field_capacity,
          wilting_point: soil.wilting_point,
          bulk_density: soil.bulk_density,
          effective_depth: soil.effective_depth,
        },
        pivot: { efficiency: pivot.efficiency, area: pivot.area, flow_rate: pivot.flow_rate },
        weatherByDate: engineWeatherByDate,
        irrigationByDate,
        dateStart,
        dateEnd,
      });

      // adapta a saída do motor ao formato de exibição da tela
      const rows: DailyBalanceRow[] = series.map((d) => ({
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
      }));

      // fator p real usado pelo motor (afd / adt)
      const resolvedPFactors = series.map((d) =>
        d.adt > 0 ? Math.round((d.afd / d.adt) * 1000) / 1000 : 0,
      );

      setBalanceRows(rows);

      // 6. Persiste o resultado do motor em water_balances (item 14)
      if (series.length > 0) {
        const upsertData = series.map((d, i) => ({
          pivot_crop_assignment_id: assignment.id,
          date: d.date,
          dae: d.dae,
          phase: d.phase,
          et0: d.et0,
          kc: d.kc,
          etc: d.etc,
          precipitation: d.precipitation,
          effective_precipitation: d.effectivePrecipitation,
          applied_depth: d.irrigation,
          effective_irrigation: d.effectiveIrrigation,
          root_depth: d.rootDepth,
          cad: d.adt,
          afd: d.afd,
          soil_storage: d.storage,
          surplus: d.surplus,
          depletion_factor: resolvedPFactors[i],
          deficit: d.deficit,
          depletion: d.depletion,
          net_depth: d.recommendedNetDepth,
          gross_depth: d.recommendedGrossDepth,
          volume_needed: d.recommendedVolume,
          irrigation_time: d.estimatedIrrigationTime,
          should_irrigate: d.shouldIrrigate,
          recommendation_reason: d.recommendationReason,
          hydric_status: d.status,
          water_status: HYDRIC_TO_WATER_STATUS[d.status],
        }));

        await supabase
          .from("water_balances")
          .upsert(upsertData, { onConflict: "pivot_crop_assignment_id,date" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao calcular balanço");
    } finally {
      setCalculating(false);
    }
  }, [assignment, culture, soil, phases, dateStart, dateEnd, selectedPivotId, pivots, activeFarmId, supabase]);

  // Load existing balance from DB when pivot/dates change
  const loadExistingBalance = useCallback(async () => {
    if (!assignment || !dateStart || !dateEnd) return;
    setLoading(true);
    const { data } = await supabase
      .from("water_balances")
      .select("*")
      .eq("pivot_crop_assignment_id", assignment.id)
      .gte("date", dateStart)
      .lte("date", dateEnd)
      .order("date");

    if (data && data.length > 0) {
      const rows: DailyBalanceRow[] = (data as StoredBalance[]).map((r) => ({
        date: r.date,
        et0: r.et0,
        kc: r.kc,
        etc: r.etc,
        precipitation: r.precipitation,
        effectivePrecipitation: r.effective_precipitation,
        irrigationApplied: r.applied_depth,
        rootDepth: r.root_depth,
        cad: r.cad,
        afd: r.afd,
        storedWater: r.soil_storage,
        depletionFactor: r.depletion_factor,
        deficit: r.deficit,
        surplus: r.surplus,
        netDepth: r.net_depth,
        grossDepth: r.gross_depth,
        volumeNeeded: r.volume_needed,
        irrigationTime: r.irrigation_time,
        waterStatus: r.water_status,
        phase: r.phase ?? "—",
      }));
      setBalanceRows(rows);
    }
    setLoading(false);
  }, [assignment, dateStart, dateEnd, supabase]);

  useEffect(() => {
    if (assignment && dateStart && dateEnd) {
      loadExistingBalance();
    }
  }, [assignment, dateStart, dateEnd, loadExistingBalance]);

  const summary = useMemo(() => calculateSummary(balanceRows), [balanceRows]);

  // rastreabilidade (estação climática) + operação (eventos de irrigação)
  const [trace, setTrace] = useState<{ stationName: string | null; distanceKm: number | null; lastSync: string | null; qualityPct: number | null }>({ stationName: null, distanceKm: null, lastSync: null, qualityPct: null });
  const [ops, setOps] = useState<{ volumeM3: number | null; hours: number | null; energyKwh: number | null }>({ volumeM3: null, hours: null, energyKwh: null });

  useEffect(() => {
    if (!activeFarmId || !selectedPivotId || !dateStart || !dateEnd) {
      setTrace({ stationName: null, distanceKm: null, lastSync: null, qualityPct: null });
      setOps({ volumeM3: null, hours: null, energyKwh: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const pivot = pivots.find((p) => p.id === selectedPivotId);
      // estação ativa da fazenda
      const { data: st } = await supabase
        .from("weather_stations")
        .select("id, name, latitude, longitude")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name")
        .limit(1)
        .maybeSingle();

      let lastSync: string | null = null;
      let qualityPct: number | null = null;
      if (st?.id) {
        const { data: reads } = await supabase
          .from("weather_readings")
          .select("imported_at, data_quality")
          .eq("station_id", st.id as string)
          .gte("date", dateStart)
          .lte("date", dateEnd);
        if (reads && reads.length > 0) {
          lastSync = reads.reduce((m: string, r: { imported_at: string }) => (r.imported_at > m ? r.imported_at : m), reads[0].imported_at as string);
          const ok = reads.filter((r: { data_quality: string }) => r.data_quality === "ok").length;
          qualityPct = Math.round((ok / reads.length) * 100);
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

      if (!cancelled) {
        setTrace({ stationName: st?.name ?? null, distanceKm, lastSync, qualityPct });
        setOps({ volumeM3, hours, energyKwh });
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
    setLancSaving(true);
    setLancMsg("");

    try {
      const { error: err } = await supabase.from("irrigation_events").insert({
        pivot_id: selectedPivotId,
        started_at: lancDate + "T06:00:00",
        depth_mm: parseFloat(lancDepth),
        volume_m3: parseFloat(lancDepth) * (pivots.find((p) => p.id === selectedPivotId)?.area ?? 0) * 10,
        status: "concluida",
      } as Record<string, unknown>);

      if (err) throw new Error(err.message);
      setLancMsg("Irrigação lançada com sucesso");
      setLancDepth("");
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
    efficiency: selPivot ? selPivot.efficiency * 100 : null,
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
        titulo="Centro de Decisão Hídrica"
        descricao="Motor FAO-56 — condição da água no solo, recomendação e rastreabilidade"
      />

      {/* Mapa seletor de pivô (por status hídrico) */}
      {mapPivots.length > 0 && (
        <Card className="mb-4 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <svg className="h-[18px] w-[18px] text-graphite-400 dark:text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.5 2V6L9 4m0 16l6-2m-6 2V4m6 14l5.5 2V4l-5.5-2m0 16V2" />
              </svg>
              <p className="text-[13px] font-bold text-graphite-800 dark:text-white">Mapa Operacional</p>
              <span className="text-[11px] text-graphite-400 dark:text-gray-500">· toque em um pivô para selecionar</span>
            </div>
            <div className="flex items-center gap-3.5">
              {(["verde", "amarelo", "vermelho", "cinza"] as HydricStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-white dark:ring-graphite-800" style={{ background: HYDRIC_STATUS_CONFIG[s].color }} />
                  <span className="text-[10px] font-medium text-graphite-400 dark:text-gray-500">{HYDRIC_STATUS_CONFIG[s].label}</span>
                </div>
              ))}
            </div>
          </div>
          <PivotMap
            pivots={mapPivots}
            highlightId={selectedPivotId || undefined}
            onSelect={setSelectedPivotId}
            className="h-[420px] w-full"
          />
        </Card>
      )}

      {/* Pivot / Date selectors */}
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Select
            label="Pivô"
            value={selectedPivotId}
            onChange={(e) => setSelectedPivotId(e.target.value)}
            options={pivots.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Input
            label="Data Início"
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
          />
          <Input
            label="Data Fim"
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
          />
          <div className="flex items-end">
            <Button
              onClick={runCalculation}
              disabled={!selectedPivotId || !assignment || calculating}
            >
              {calculating ? "Calculando..." : "Calcular Balanço"}
            </Button>
          </div>
        </div>
        {/* presets de período */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
        </div>
        {assignment && culture && soil && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-graphite-400 dark:text-gray-500">
            <span>Cultura: <strong className="text-graphite-900 dark:text-white">{culture.name}</strong></span>
            <span>Solo: <strong className="text-graphite-900 dark:text-white">{soil.name}</strong></span>
            <span>Plantio: <strong className="text-graphite-900 dark:text-white">{assignment.planting_date}</strong></span>
            <span>Ciclo: <strong className="text-graphite-900 dark:text-white">{culture.cycle_days} dias</strong></span>
            <span>Eficiência: <strong className="text-graphite-900 dark:text-white">{(pivots.find((p) => p.id === selectedPivotId)?.efficiency ?? 0) * 100}%</strong></span>
          </div>
        )}
        {!assignment && selectedPivotId && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3.5 text-xs text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            Nenhuma associação ativa (pivô↔safra↔cultura↔solo) encontrada para este pivô.
          </p>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3.5 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
      </Card>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-5">
        {activeTab === "balanco" && (
          <div className="animate-in"><BalanceTab rows={balanceRows} summary={summary} loading={loading || calculating} head={centroHead} /></div>
        )}
        {activeTab === "graficos" && (
          <div className="animate-in"><ChartsTab rows={balanceRows} /></div>
        )}
        {activeTab === "lancamento" && (
          <div className="animate-in"><LancamentoTab
            pivotId={selectedPivotId}
            pivots={pivots}
            date={lancDate}
            depth={lancDepth}
            saving={lancSaving}
            message={lancMsg}
            onDateChange={setLancDate}
            onDepthChange={setLancDepth}
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

type SKey = "umidade" | "cc" | "seg" | "pm" | "chuva" | "irrig" | "kc" | "eto" | "etc" | "deficit";
interface SeriesDef { k: SKey; label: string; color: string; kind: "line" | "dash" | "bar"; axis: "pct" | "mm"; }

const MANEJO_GROUPS: { cat: string; items: SeriesDef[] }[] = [
  { cat: "Água no solo", items: [
    { k: "umidade", label: "Água disponível", color: "#0c3d2b", kind: "line", axis: "pct" },
    { k: "cc", label: "Capacidade de campo", color: "#2f6bff", kind: "dash", axis: "pct" },
    { k: "seg", label: "Umid. de segurança", color: "#e5484d", kind: "dash", axis: "pct" },
    { k: "pm", label: "Ponto de murcha", color: "#8a998f", kind: "dash", axis: "pct" },
  ] },
  { cat: "Manejo", items: [
    { k: "chuva", label: "Chuva", color: "#2f6bff", kind: "bar", axis: "mm" },
    { k: "irrig", label: "Irrigação", color: "#0bb4c9", kind: "bar", axis: "mm" },
    { k: "deficit", label: "Déficit", color: "#e5484d", kind: "dash", axis: "mm" },
  ] },
  { cat: "Cultura", items: [
    { k: "kc", label: "Kc (×100)", color: "#4ade80", kind: "dash", axis: "pct" },
  ] },
  { cat: "Clima", items: [
    { k: "eto", label: "ETo", color: "#f97316", kind: "line", axis: "mm" },
    { k: "etc", label: "ETc", color: "#f59e0b", kind: "line", axis: "mm" },
  ] },
];
const MANEJO_ALL: SeriesDef[] = MANEJO_GROUPS.flatMap((g) => g.items);
const MANEJO_DEF = (k: SKey) => MANEJO_ALL.find((s) => s.k === k)!;

function sVal(k: SKey, r: DailyBalanceRow): number {
  switch (k) {
    case "umidade": return r.cad > 0 ? (r.storedWater / r.cad) * 100 : 0;
    case "cc": return 100;
    case "seg": return r.cad > 0 ? ((r.cad - r.afd) / r.cad) * 100 : 0;
    case "pm": return 0;
    case "kc": return r.kc * 100;
    case "chuva": return r.precipitation;
    case "irrig": return r.irrigationApplied;
    case "eto": return r.et0;
    case "etc": return r.etc;
    case "deficit": return r.deficit;
  }
}
const sFmt = (k: SKey, r: DailyBalanceRow): string =>
  k === "kc" ? r.kc.toFixed(2)
    : MANEJO_DEF(k).axis === "pct" ? `${sVal(k, r).toFixed(0)}%`
      : `${sVal(k, r).toFixed(1)} mm`;

function ManejoChart({ rows, visible }: { rows: DailyBalanceRow[]; visible: Record<SKey, boolean> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 940, H = 350, padL = 40, padR = 52, padT = 20, padB = 42;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const n = rows.length || 1;
  const band = (x1 - x0) / n;
  const cx = (i: number) => x0 + band * i + band / 2;

  const yP = (p: number) => y1 - (clampN(p, 0, 125) / 125) * (y1 - y0);
  const mmMax = Math.max(10, Math.ceil(Math.max(1, ...rows.flatMap((r) => [r.precipitation, r.irrigationApplied, r.etc, r.et0, r.deficit])) / 10) * 10);
  const yM = (v: number) => y1 - (clampN(v, 0, mmMax) / mmMax) * (y1 - y0);
  const yFor = (s: SeriesDef, v: number) => (s.axis === "pct" ? yP(v) : yM(v));

  const bw = Math.min(4, band * 0.28);
  const lineKeys: SKey[] = ["cc", "seg", "pm", "kc", "eto", "etc", "deficit", "umidade"]; // umidade por último (topo)
  const step = Math.max(1, Math.ceil(n / 9));

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    setHover(clampN(Math.round((svgX - x0) / band - 0.5), 0, n - 1));
  };
  const activeVisible = MANEJO_ALL.filter((s) => visible[s.k]);

  // faixas suaves (adequada / atenção / crítica) usando a segurança do último dia
  const segPct = rows.length && rows[n - 1].cad > 0 ? ((rows[n - 1].cad - rows[n - 1].afd) / rows[n - 1].cad) * 100 : 50;

  return (
    <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
        {/* faixas discretas: adequada (verde), atenção (âmbar), crítica (vermelho) */}
        <rect x={x0} y={yP(100)} width={x1 - x0} height={yP(segPct) - yP(100)} fill="#1ea85b" opacity={0.05} />
        <rect x={x0} y={yP(segPct)} width={x1 - x0} height={yP(segPct * 0.6) - yP(segPct)} fill="#f97316" opacity={0.05} />
        <rect x={x0} y={yP(segPct * 0.6)} width={x1 - x0} height={yP(0) - yP(segPct * 0.6)} fill="#e5484d" opacity={0.05} />
        {/* grade + eixos */}
        {[0, 25, 50, 75, 100, 125].map((p) => (
          <g key={p}>
            <line x1={x0} x2={x1} y1={yP(p)} y2={yP(p)} className="stroke-gray-100 dark:stroke-white/[0.05]" strokeWidth={1} />
            <text x={x0 - 6} y={yP(p) + 3} textAnchor="end" className="fill-graphite-300 text-[9px] dark:fill-gray-600">{p}</text>
          </g>
        ))}
        <text x={x0 - 6} y={y0 - 7} textAnchor="end" className="fill-graphite-400 text-[9px] font-semibold dark:fill-gray-500">%CC</text>
        {[0, mmMax / 2, mmMax].map((v) => (
          <text key={v} x={x1 + 7} y={yM(v) + 3} className="fill-graphite-300 text-[9px] dark:fill-gray-600">{Math.round(v)}</text>
        ))}
        <text x={x1 + 7} y={y0 - 7} className="fill-graphite-400 text-[9px] font-semibold dark:fill-gray-500">mm</text>

        {/* barras chuva + irrigação */}
        {rows.map((r, i) => (
          <g key={i}>
            {visible.chuva && r.precipitation > 0 && <rect x={cx(i) - bw - 0.6} y={yM(r.precipitation)} width={bw} height={y1 - yM(r.precipitation)} rx={1} fill={MANEJO_DEF("chuva").color} opacity={0.85} />}
            {visible.irrig && r.irrigationApplied > 0 && <rect x={cx(i) + 0.6} y={yM(r.irrigationApplied)} width={bw} height={y1 - yM(r.irrigationApplied)} rx={1} fill={MANEJO_DEF("irrig").color} opacity={0.9} />}
          </g>
        ))}

        {/* linhas */}
        {lineKeys.filter((k) => visible[k]).map((k) => {
          const s = MANEJO_DEF(k);
          const pts = rows.map((r, i) => `${cx(i)},${yFor(s, sVal(k, r))}`).join(" ");
          return (
            <polyline key={k} points={pts} fill="none" stroke={s.color} strokeWidth={k === "umidade" ? 2.3 : 1.5}
              strokeDasharray={s.kind === "dash" ? "5 3" : undefined} strokeLinejoin="round" strokeLinecap="round"
              opacity={k === "umidade" ? 1 : 0.9} />
          );
        })}

        {/* eixo x + datas */}
        <line x1={x0} x2={x1} y1={y1} y2={y1} className="stroke-gray-200 dark:stroke-white/[0.1]" strokeWidth={1} />
        {rows.map((r, i) => (i % step === 0 || i === n - 1) && (
          <text key={`d${i}`} x={cx(i)} y={H - 12} textAnchor="middle" className="fill-graphite-400 text-[9px] dark:fill-gray-500">{fmtDia(r.date)}</text>
        ))}

        {/* crosshair */}
        {hover != null && (
          <g>
            <line x1={cx(hover)} x2={cx(hover)} y1={y0} y2={y1} className="stroke-graphite-300 dark:stroke-white/20" strokeWidth={1} strokeDasharray="3 3" />
            {activeVisible.map((s) => (
              <circle key={s.k} cx={cx(hover)} cy={yFor(s, sVal(s.k, rows[hover]))} r={2.6} fill={s.color} stroke="#fff" strokeWidth={1} />
            ))}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hover != null && rows[hover] && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[150px] -translate-x-1/2 rounded-xl border border-gray-100 bg-white/95 p-2.5 shadow-elevated backdrop-blur dark:border-white/[0.1] dark:bg-graphite-800/95"
          style={{ left: `${(cx(hover) / W) * 100}%` }}
        >
          <p className="mb-1.5 text-[11px] font-bold text-graphite-800 dark:text-white">{fmtDia(rows[hover].date)} <span className="font-normal text-graphite-400">· {rows[hover].phase}</span></p>
          <div className="space-y-1">
            {activeVisible.map((s) => (
              <div key={s.k} className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-graphite-500 dark:text-gray-400"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
                <span className="font-semibold tabular-nums text-graphite-800 dark:text-gray-100">{sFmt(s.k, rows[hover])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  rows,
  summary,
  loading,
  head,
}: {
  rows: DailyBalanceRow[];
  summary: ReturnType<typeof calculateSummary>;
  loading: boolean;
  head: CentroHead;
}) {
  const [visible, setVisible] = useState<Record<SKey, boolean>>({
    umidade: true, cc: true, seg: true, pm: false, chuva: true, irrig: true, kc: true, eto: false, etc: false, deficit: false,
  });
  const [activeCat, setActiveCat] = useState("Água no solo");
  const toggleSeries = (k: SKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));
  const [tblFilter, setTblFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const filteredRows = tblFilter.trim()
    ? rows.filter((r) => {
        const q = tblFilter.toLowerCase();
        return r.date.includes(q) || fmtDia(r.date).includes(q) || r.phase.toLowerCase().includes(q);
      })
    : rows;

  const exportCsv = () => {
    const headers = ["Data", "Fase", "Kc", "ETo", "ETc", "Chuva", "ChuvaEf", "Irrigacao", "Entradas", "Saidas", "Saldo", "AguaDisp", "Deplecao%", "Deficit", "LaminaRec", "Status"];
    const lines = filteredRows.map((r) => {
      const entr = r.effectivePrecipitation + r.irrigationApplied;
      const depl = r.cad > 0 ? Math.round(((r.cad - r.storedWater) / r.cad) * 100) : 0;
      const lam = r.deficit >= r.afd && r.afd > 0 ? r.grossDepth : 0;
      return [r.date, r.phase, r.kc.toFixed(2), r.et0.toFixed(1), r.etc.toFixed(1), r.precipitation.toFixed(1), r.effectivePrecipitation.toFixed(1), r.irrigationApplied.toFixed(1), entr.toFixed(1), r.etc.toFixed(1), (entr - r.etc).toFixed(1), r.storedWater.toFixed(1), depl, r.deficit.toFixed(1), lam.toFixed(1), WATER_STATUS_CONFIG[r.waterStatus].label].join(";");
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
        <p className="text-graphite-500 dark:text-gray-400">Selecione um pivô e clique em <strong className="text-graphite-800 dark:text-white">Calcular Balanço</strong> para abrir o Centro de Decisão Hídrica.</p>
      </Card>
    );
  }

  const last = rows[rows.length - 1];
  const first = rows[0];
  const cad = last?.cad ?? 0;
  const arm = last?.storedWater ?? 0;
  const armPct = cad > 0 ? Math.round((arm / cad) * 100) : 0;
  const raw = last ? Math.max(last.cad - last.afd, 0) : 0;
  const depletPct = cad > 0 ? Math.round(((cad - arm) / cad) * 100) : 0;
  const untilSafety = arm - raw; // >0 acima do limite; <0 abaixo
  const classificacao = arm >= raw ? { label: "Adequado", color: "#1ea85b" } : arm >= raw * 0.5 ? { label: "Atenção", color: "#f97316" } : { label: "Crítico", color: "#e5484d" };
  const variacao = (last?.storedWater ?? 0) - (first?.storedWater ?? 0);
  const tendencia = variacao < -0.5 ? { label: "queda", down: true } : variacao > 0.5 ? { label: "alta", down: false } : { label: "estável", down: false };
  const efPct = head.efficiency ?? (last ? (last.grossDepth > 0 ? (last.netDepth / last.grossDepth) * 100 : 85) : 85);
  const etoTotal = rows.reduce((a, r) => a + r.et0, 0);
  const stressPct = summary.days > 0 ? (summary.daysInDeficit / summary.days) * 100 : 0;
  const verdict = VERDICT[last?.waterStatus ?? "ideal"];
  const laminaBruta = last?.grossDepth ?? 0;

  const columns: Column<DailyBalanceRow>[] = [
    { header: "Data", render: (r) => fmtDia(r.date) },
    { header: "Fase", render: (r) => <span className="text-xs">{r.phase}</span> },
    { header: "Kc", render: (r) => r.kc.toFixed(2) },
    { header: "ETo", render: (r) => r.et0.toFixed(1) },
    { header: "ETc", render: (r) => r.etc.toFixed(1) },
    { header: "Chuva", render: (r) => r.precipitation.toFixed(1) },
    { header: "Ch. ef.", render: (r) => r.effectivePrecipitation.toFixed(1) },
    { header: "Irrig.", render: (r) => r.irrigationApplied > 0 ? <span className="text-cyan-600 dark:text-cyan-400">{r.irrigationApplied.toFixed(1)}</span> : "0.0" },
    { header: "Entradas", render: (r) => <span className="text-blue-600 dark:text-blue-400">{(r.effectivePrecipitation + r.irrigationApplied).toFixed(1)}</span> },
    { header: "Saídas", render: (r) => <span className="text-amber-600 dark:text-amber-400">{r.etc.toFixed(1)}</span> },
    { header: "Saldo", render: (r) => { const s = r.effectivePrecipitation + r.irrigationApplied - r.etc; return <span className={s >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{s >= 0 ? "+" : ""}{s.toFixed(1)}</span>; } },
    { header: "Á. disp.", render: (r) => r.storedWater.toFixed(1) },
    { header: "Depleção", render: (r) => `${r.cad > 0 ? Math.round(((r.cad - r.storedWater) / r.cad) * 100) : 0}%` },
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

  return (
    <div className="space-y-5">
      {/* 1 · Cabeçalho do pivô */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-forest-900 to-forest-800 p-5 text-white shadow-elevated sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-300">Centro de Decisão Hídrica</p>
            <h2 className="mt-1 text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              {head.pivotName ?? "Pivô"}{head.cultureName ? ` — ${head.cultureName}` : ""}
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-brand-100/90">
              {head.farmName && <span>Fazenda <strong className="font-semibold text-white">{head.farmName}</strong></span>}
              {head.area != null && <span>Área <strong className="font-semibold text-white">{head.area} ha</strong></span>}
              {head.efficiency != null && <span>Eficiência <strong className="font-semibold text-white">{head.efficiency.toFixed(0)}%</strong></span>}
              {head.statusLabel && <span className="inline-flex items-center gap-1.5">Status <span className="inline-flex items-center gap-1.5 font-semibold text-white"><span className="h-1.5 w-1.5 rounded-full bg-brand-300 ring-2 ring-brand-300/30" />{head.statusLabel}</span></span>}
              <span>Atualizado <strong className="font-semibold text-white">{fmtDia(last?.date ?? "")}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* 2 · Situação atual (estado — cada dado uma vez) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {/* Água disponível */}
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Água disponível</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{armPct}<span className="text-[14px] text-graphite-400">%</span> <span className="text-[14px] font-bold text-graphite-400">· {arm.toFixed(1)} mm</span></p>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-gray-100 dark:bg-white/[0.06]"><div className="h-full rounded" style={{ width: `${clampN(armPct, 0, 100)}%`, background: classificacao.color }} /></div>
          <span className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tendencia.down ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400" : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"}`}>{tendencia.down ? "▼" : "▲"} {tendencia.label}</span>
        </Card>
        {/* Depleção */}
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Depleção atual</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{depletPct}<span className="text-[14px] text-graphite-400">%</span> <span className="text-[14px] font-bold text-graphite-400">· {(last?.deficit ?? 0).toFixed(1)} mm</span></p>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-gray-100 dark:bg-white/[0.06]"><div className="h-full rounded bg-orange-500" style={{ width: `${clampN(depletPct, 0, 100)}%` }} /></div>
          <p className="mt-2.5 text-[11.5px] tabular-nums text-graphite-400 dark:text-gray-500">{untilSafety >= 0 ? `a ${untilSafety.toFixed(1)} mm do limite de segurança` : "abaixo do limite de segurança"}</p>
        </Card>
        {/* Situação do solo */}
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Situação do solo</p>
          <p className="mt-2 text-[22px] font-extrabold leading-none" style={{ color: classificacao.color }}>{classificacao.label}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-graphite-400 dark:text-gray-500">
            {classificacao.label === "Adequado" ? "Umidade dentro da faixa ideal." : classificacao.label === "Atenção" ? "Próximo do limite de segurança." : "Déficit relevante — repor a água do solo."}
          </p>
        </Card>
      </div>

      {/* 3 + 5 · Gráfico + Recomendação/Alertas */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
      {/* Gráfico principal com painel de camadas */}
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <div>
            <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Evolução do Balanço Hídrico</p>
            <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">água disponível (% CC) × água aplicada (mm) · faixas adequada · atenção · crítica</p>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row">
          {/* painel de séries por categoria */}
          <div className="border-b border-gray-100 p-4 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r dark:border-white/[0.06]">
            <div className="flex gap-0.5 rounded-lg bg-gray-100/70 p-0.5 dark:bg-white/[0.04]">
              {MANEJO_GROUPS.map((g) => (
                <button
                  key={g.cat}
                  type="button"
                  onClick={() => setActiveCat(g.cat)}
                  className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${activeCat === g.cat ? "bg-white text-graphite-800 shadow-xs dark:bg-white/[0.1] dark:text-white" : "text-graphite-400 hover:text-graphite-600 dark:text-gray-500"}`}
                >
                  {g.cat}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-0.5">
              {MANEJO_GROUPS.find((g) => g.cat === activeCat)!.items.map((s) => {
                const on = visible[s.k];
                return (
                  <button
                    key={s.k}
                    type="button"
                    onClick={() => toggleSeries(s.k)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border" style={{ borderColor: s.color, background: on ? s.color : "transparent" }}>
                      {on && <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className={`text-[12px] ${on ? "font-semibold text-graphite-700 dark:text-gray-200" : "text-graphite-400 dark:text-gray-500"}`}>{s.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 border-t border-gray-100 pt-2.5 text-[10px] leading-relaxed text-graphite-300 dark:border-white/[0.06] dark:text-gray-600">
              Passe o mouse no gráfico para ver os valores do dia.
            </p>
          </div>
          {/* gráfico */}
          <div className="min-w-0 flex-1 p-4"><ManejoChart rows={rows} visible={visible} /></div>
        </div>
      </Card>

      {/* Trilha: recomendação + justificativa + alertas */}
      <div className="space-y-5">
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
                  { l: "Velocidade recomendada", v: "pendente", pend: true },
                ].map((r) => (
                  <div key={r.l} className="flex items-center justify-between border-b border-dashed border-gray-100 py-1.5 text-[12.5px] last:border-0 dark:border-white/[0.06]">
                    <span className="text-graphite-500 dark:text-gray-400">{r.l}</span>
                    <span className={r.pend ? "font-semibold text-graphite-300 dark:text-gray-600" : "font-bold text-graphite-800 dark:text-white"}>{r.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-graphite-500 dark:text-gray-400">Sem necessidade de irrigação para hoje. Acompanhar a evolução da umidade.</p>
            )}
          </div>
        </Card>

        {/* Por que esta recomendação? */}
        <Card className="p-4">
          <p className="text-[13px] font-bold text-graphite-900 dark:text-white">Por que esta recomendação?</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-graphite-500 dark:text-gray-400">
            {arm < raw
              ? "A água disponível está abaixo do limite de segurança e a demanda (ETc) supera as entradas recentes."
              : "A água disponível está dentro da faixa segura; as entradas cobrem a demanda atual."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { l: "Água disp. atual", v: `${arm.toFixed(1)} mm` },
              { l: "Limite segurança", v: `${raw.toFixed(1)} mm` },
              { l: "Déficit atual", v: `${(last?.deficit ?? 0).toFixed(1)} mm` },
              { l: "Risco faixa crítica", v: classificacao.label === "Crítico" ? "Alto" : classificacao.label === "Atenção" ? "Médio" : "Baixo", c: classificacao.color },
            ].map((f) => (
              <div key={f.l} className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/[0.03]">
                <p className="text-[9.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{f.l}</p>
                <p className="mt-1 text-[14px] font-extrabold tabular-nums" style={{ color: f.c ?? undefined }}>{f.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[10px] text-graphite-300 dark:text-gray-600">ETc/chuva previstas dependem de dados de previsão (pendente).</p>
        </Card>

        {/* Alertas e observações */}
        <Card className="p-4">
          <p className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-graphite-900 dark:text-white">
            <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a1 1 0 00.9 1.5h18.6a1 1 0 00.9-1.5L13.7 3.9a1 1 0 00-1.7 0z" /></svg>
            Alertas e observações
          </p>
          {(() => {
            const items: { sev: "hi" | "md" | "lo"; title: string; desc: string }[] = [];
            if (arm < raw) items.push({ sev: classificacao.label === "Crítico" ? "hi" : "md", title: "Solo abaixo da faixa de segurança", desc: `Água disponível em ${armPct}% da CC — repor para evitar estresse.` });
            if ((last?.surplus ?? 0) > 0) items.push({ sev: "md", title: "Possível excesso / drenagem", desc: `Excedente de ${(last?.surplus ?? 0).toFixed(1)} mm acima da capacidade de campo.` });
            if (summary.daysInCritical > 0) items.push({ sev: "hi", title: `${summary.daysInCritical} dia(s) em déficit crítico`, desc: "No período analisado houve dias em déficit crítico." });
            if (items.length === 0) items.push({ sev: "lo", title: "Tudo dentro do esperado", desc: "Nenhum alerta ativo para o pivô no período." });
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
      </div>

      {/* 6 · Resumo do período (fonte única dos acumulados/operação) */}
      <Card className="p-0">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Resumo do período <span className="font-normal text-graphite-400 dark:text-gray-500">({first ? fmtDia(first.date) : ""} – {last ? fmtDia(last.date) : ""} · {summary.days} dias)</span></p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0 dark:divide-white/[0.06]">
          {[
            { l: "Chuva", v: `${summary.totalPrecipitation.toFixed(0)} mm`, sub: `efetiva ${summary.totalEffPrecipitation.toFixed(0)}` },
            { l: "Irrigação", v: `${summary.totalIrrigation.toFixed(0)} mm`, sub: `efetiva ${(summary.totalIrrigation * efPct / 100).toFixed(0)}` },
            { l: "ETo", v: `${etoTotal.toFixed(0)} mm` },
            { l: "ETc", v: `${summary.totalETc.toFixed(0)} mm` },
            { l: "Variação armaz.", v: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1)} mm`, cls: variacao >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
            { l: "Dias em estresse", v: `${summary.daysInDeficit}`, sub: `${stressPct.toFixed(0)}% do período` },
            { l: "Eficiência média", v: `${efPct.toFixed(0)}%` },
            head.volumeM3 != null ? { l: "Volume acumulado", v: `${(head.volumeM3 / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil m³` } : { l: "Volume acumulado", v: "pendente", pend: true },
            head.horasOperadas != null ? { l: "Horas operadas", v: `${head.horasOperadas.toFixed(0)} h` } : { l: "Horas operadas", v: "pendente", pend: true },
            head.energiaEspecifica != null ? { l: "Energia específica", v: `${head.energiaEspecifica} kWh/m³` } : { l: "Energia específica", v: "pendente", pend: true },
            { l: "Uniformidade (CUC)", v: "pendente", pend: true },
            { l: "Janela ideal", v: "pendente", pend: true },
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
        <span>Origem do Kc <strong className="font-semibold text-graphite-800 dark:text-white">Curva da cultura</strong></span>
        <span>Chuva efetiva <strong className="font-semibold text-graphite-800 dark:text-white">USDA-SCS</strong></span>
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

// ── Charts Tab ──────────────────────────────────────────────────────────

function ChartsTab({ rows }: { rows: DailyBalanceRow[] }) {
  const recharts = useRecharts();

  if (rows.length === 0) {
    return (
      <Card className="py-12 text-center">
        <p className="text-graphite-400 dark:text-gray-500">
          Calcule o balanço hídrico para visualizar os gráficos.
        </p>
      </Card>
    );
  }

  if (!recharts) {
    return (
      <Card className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
      </Card>
    );
  }

  const { ResponsiveContainer, ComposedChart, Area, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } = recharts;

  const chartData = rows.map((r) => ({
    date: r.date.slice(5),
    arm: r.storedWater,
    cad: r.cad,
    afd_line: r.cad - r.afd,
    etc: r.etc,
    chuva: r.effectivePrecipitation,
    irrigacao: r.irrigationApplied,
    deficit: r.deficit,
    rootDepth: r.rootDepth,
    kc: r.kc,
  }));

  const statusData = rows.map((r) => ({
    date: r.date.slice(5),
    status: r.waterStatus,
    color: WATER_STATUS_CONFIG[r.waterStatus].color,
    value: 1,
  }));

  return (
    <div className="space-y-5">
      {/* Chart 1: Water storage evolution */}
      <ChartCard title="Evolução da Água no Solo" subtitle="Armazenamento (ARM) vs CAD e limiar de estresse (mm)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="cad" name="CAD" stroke="#93c5fd" fill="#dbeafe" fillOpacity={0.4} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="afd_line" name="Limiar Estresse" stroke="#f59e0b" strokeDasharray="6 3" dot={false} />
            <Area type="monotone" dataKey="arm" name="ARM" stroke="#22c55e" fill="#86efac" fillOpacity={0.6} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart 2: ETc vs inputs */}
      <ChartCard title="Demanda vs Entradas" subtitle="ETc, Chuva efetiva e Irrigação aplicada (mm/dia)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="chuva" name="Chuva Efetiva" fill="#60a5fa" />
            <Bar dataKey="irrigacao" name="Irrigação" fill="#34d399" />
            <Line type="monotone" dataKey="etc" name="ETc" stroke="#ef4444" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart 3: Kc and root depth evolution */}
      <ChartCard title="Evolução Kc e Profundidade Radicular" subtitle="Coeficiente cultural e crescimento radicular ao longo do ciclo">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" type="monotone" dataKey="kc" name="Kc" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Area yAxisId="right" type="monotone" dataKey="rootDepth" name="Raiz (m)" stroke="#f97316" fill="#fed7aa" fillOpacity={0.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart 4: Status timeline */}
      <ChartCard title="Status Hídrico Diário" subtitle="Evolução do estado de água no solo">
        <div className="flex h-full flex-col justify-center">
          <div className="flex gap-0.5 overflow-x-auto">
            {statusData.map((d, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center"
                title={`${rows[i].date}: ${WATER_STATUS_CONFIG[d.status].label}`}
              >
                <div
                  className="h-8 w-full min-w-[4px] rounded-sm"
                  style={{ backgroundColor: d.color }}
                />
                {i % Math.max(1, Math.floor(statusData.length / 10)) === 0 && (
                  <span className="mt-1 text-[8px] text-gray-400">{d.date}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {(Object.entries(WATER_STATUS_CONFIG) as [WaterStatus, typeof WATER_STATUS_CONFIG[WaterStatus]][]).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-graphite-400 dark:text-gray-500">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: cfg.color }} />
                {cfg.label}
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

// ── Lancamento Tab ──────────────────────────────────────────────────────

function LancamentoTab({
  pivotId,
  pivots,
  date,
  depth,
  saving,
  message,
  onDateChange,
  onDepthChange,
  onSave,
}: {
  pivotId: string;
  pivots: Pivot[];
  date: string;
  depth: string;
  saving: boolean;
  message: string;
  onDateChange: (v: string) => void;
  onDepthChange: (v: string) => void;
  onSave: () => void;
}) {
  const pivot = pivots.find((p) => p.id === pivotId);

  return (
    <Card>
      <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">
        Lançar Irrigação Aplicada
      </h3>
      {!pivotId ? (
        <p className="text-sm text-graphite-400 dark:text-gray-500">
          Selecione um pivô acima para lançar irrigação.
        </p>
      ) : (
        <div className="grid max-w-lg grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Data"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
          <Input
            label="Lâmina Aplicada (mm)"
            type="number"
            step="0.1"
            min="0"
            value={depth}
            onChange={(e) => onDepthChange(e.target.value)}
          />
          {pivot && depth && parseFloat(depth) > 0 && (
            <div className="col-span-full text-xs text-graphite-400 dark:text-gray-500">
              Volume estimado: <strong>{(parseFloat(depth) * pivot.area * 10).toFixed(0)} m³</strong>
              {" | "}Tempo estimado: <strong>{(parseFloat(depth) * pivot.area * 10 / pivot.flow_rate).toFixed(1)} h</strong>
            </div>
          )}
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
