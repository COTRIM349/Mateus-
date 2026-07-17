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
import { ProgressRing } from "@/components/ui/instruments";
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

// ── Types ─────────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  efficiency: number;
  farm_id: string;
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
  const { activeFarmId } = useAuth();
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
        .select("id, name, area, flow_rate, efficiency, farm_id")
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

  return (
    <div>
      <PageHeader
        titulo="Balanço Hídrico"
        descricao="Motor FAO-56 — Acompanhamento diário de déficit e armazenamento"
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
          <div className="animate-in"><BalanceTab rows={balanceRows} summary={summary} loading={loading || calculating} /></div>
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

// ── Gráfico grande: armazenamento de água no solo (CC/RAW/PMP) ──────────────

function BalanceChart({ rows }: { rows: DailyBalanceRow[] }) {
  const W = 780, H = 320, padL = 40, padR = 42, padT = 18, padB = 44;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const n = rows.length || 1;
  const last = rows[rows.length - 1];
  const cad = Math.max(...rows.map((r) => r.cad), 1);
  const raw = last ? Math.max(last.cad - last.afd, 0) : 0;
  const yMax = cad * 1.12;
  const ymap = (v: number) => y1 - (Math.max(0, Math.min(v, yMax)) / yMax) * (y1 - y0);
  const band = (x1 - x0) / n;
  const cx = (i: number) => x0 + band * i + band / 2;
  const storagePts = rows.map((r, i) => `${cx(i)},${ymap(r.storedWater)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
      {/* bandas: verde (RAW→CC), âmbar (RAW/2→RAW), vermelho (0→RAW/2) */}
      <rect x={x0} y={ymap(cad)} width={x1 - x0} height={ymap(raw) - ymap(cad)} className="fill-green-500/10 dark:fill-green-500/10" />
      <rect x={x0} y={ymap(raw)} width={x1 - x0} height={ymap(raw / 2) - ymap(raw)} className="fill-amber-400/10 dark:fill-amber-400/10" />
      <rect x={x0} y={ymap(raw / 2)} width={x1 - x0} height={ymap(0) - ymap(raw / 2)} className="fill-red-500/10 dark:fill-red-500/10" />
      {/* y ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={x0} x2={x1} y1={ymap(f * yMax)} y2={ymap(f * yMax)} className="stroke-gray-100 dark:stroke-white/[0.05]" strokeWidth={1} />
          <text x={x0 - 6} y={ymap(f * yMax) + 3} textAnchor="end" className="fill-graphite-300 text-[9px] dark:fill-gray-600">{Math.round(f * yMax)}</text>
        </g>
      ))}
      {/* barras chuva efetiva (azul) + irrigação (verde) */}
      {rows.map((r, i) => (
        <g key={i}>
          {r.effectivePrecipitation > 0 && <rect x={cx(i) - 5} y={ymap(r.effectivePrecipitation)} width={4} height={ymap(0) - ymap(r.effectivePrecipitation)} rx={1} className="fill-blue-400/70" />}
          {r.irrigationApplied > 0 && <rect x={cx(i) + 1} y={ymap(r.irrigationApplied)} width={4} height={ymap(0) - ymap(r.irrigationApplied)} rx={1} className="fill-brand-500/70" />}
        </g>
      ))}
      {/* linhas CC / RAW / PMP */}
      <line x1={x0} x2={x1} y1={ymap(cad)} y2={ymap(cad)} className="stroke-green-500" strokeWidth={1.5} />
      <text x={x1 + 4} y={ymap(cad) + 3} className="fill-green-600 text-[9px] font-bold dark:fill-green-400">CC</text>
      <line x1={x0} x2={x1} y1={ymap(raw)} y2={ymap(raw)} className="stroke-amber-500" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={x1 + 4} y={ymap(raw) + 3} className="fill-amber-600 text-[9px] font-bold dark:fill-amber-400">RAW</text>
      <line x1={x0} x2={x1} y1={ymap(0)} y2={ymap(0)} className="stroke-red-500" strokeWidth={1.5} />
      <text x={x1 + 4} y={ymap(0) + 3} className="fill-red-600 text-[9px] font-bold dark:fill-red-400">PMP</text>
      {/* linha de armazenamento */}
      <polyline points={storagePts} fill="none" className="stroke-brand-700 dark:stroke-brand-400" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((r, i) => <circle key={i} cx={cx(i)} cy={ymap(r.storedWater)} r={2.6} className="fill-brand-700 dark:fill-brand-400" />)}
      {/* datas */}
      {rows.map((r, i) => (i % Math.ceil(n / 8) === 0 || i === n - 1) && (
        <text key={i} x={cx(i)} y={H - 14} textAnchor="middle" className="fill-graphite-400 text-[9px] dark:fill-gray-500">{r.date.slice(8, 10)}/{r.date.slice(5, 7)}</text>
      ))}
    </svg>
  );
}

// ── Balance Tab ─────────────────────────────────────────────────────────

const BAL_KPI_ICONS: Record<string, string> = {
  arm: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm-1 9c3 0 3 2 6 2s3-2 6-2 3 2 4 2",
  def: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z",
  chuva: "M7 15a4 4 0 01.5-8 5 5 0 019.5 1.5A3.5 3.5 0 0117 15M8 19l-1 2M12 19l-1 2M16 19l-1 2",
  eto: "M12 8s3.5 3.8 3.5 6.5a3.5 3.5 0 01-7 0C8.5 11.8 12 8 12 8zM12 6V3M9 5l3-2 3 2",
  irrig: "M4 8c2 0 2-1.5 4-1.5S12 8 14 8s2-1.5 4-1.5S20 8 22 8M2 14c2 0 2-1.5 4-1.5S10 14 12 14s2-1.5 4-1.5S18 14 20 14",
};

function BalanceTab({
  rows,
  summary,
  loading,
}: {
  rows: DailyBalanceRow[];
  summary: ReturnType<typeof calculateSummary>;
  loading: boolean;
}) {
  if (rows.length === 0 && !loading) {
    return (
      <Card className="py-12 text-center">
        <p className="text-graphite-400 dark:text-gray-500">
          Selecione um pivô e clique em &quot;Calcular Balanço&quot; para gerar o balanço hídrico diário.
        </p>
      </Card>
    );
  }

  const last = rows[rows.length - 1];
  const first = rows[0];
  const cad = last?.cad ?? 0;
  const arm = last?.storedWater ?? 0;
  const armPct = cad > 0 ? Math.round((arm / cad) * 100) : 0;
  const raw = last ? Math.max(last.cad - last.afd, 0) : 0;
  const classificacao = arm >= raw ? { label: "Adequado", color: "#22c55e" } : arm >= raw * 0.5 ? { label: "Atenção", color: "#f59e0b" } : { label: "Crítico", color: "#ef4444" };
  const entradas = summary.totalEffPrecipitation + summary.totalIrrigation;
  const variacao = (last?.storedWater ?? 0) - (first?.storedWater ?? 0);

  const kpis = rows.length > 0 ? [
    { k: "arm", label: "Armazenamento atual", value: `${arm.toFixed(1)} mm`, note: `${armPct}% da CAD`, color: "#1ea85b" },
    { k: "def", label: "Déficit atual", value: `${(last?.deficit ?? 0).toFixed(1)} mm`, note: "média ponderada", color: "#ef4444" },
    { k: "chuva", label: "Chuva (período)", value: `${summary.totalEffPrecipitation.toFixed(1)} mm`, note: "efetiva", color: "#2f8fd8" },
    { k: "eto", label: "ETc (período)", value: `${summary.totalETc.toFixed(1)} mm`, note: "demanda", color: "#f59e0b" },
    { k: "irrig", label: "Irrigação (período)", value: `${summary.totalIrrigation.toFixed(1)} mm`, note: `${summary.days} dias`, color: "#7c5cff" },
  ] : [];

  const columns: Column<DailyBalanceRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Fase", render: (r) => <span className="text-xs">{r.phase}</span> },
    { header: "ET₀", render: (r) => r.et0.toFixed(1) },
    { header: "Kc", render: (r) => r.kc.toFixed(2) },
    { header: "ETc", render: (r) => r.etc.toFixed(1) },
    { header: "Chuva", render: (r) => r.precipitation.toFixed(1) },
    { header: "Chuva Ef.", render: (r) => r.effectivePrecipitation.toFixed(1) },
    { header: "Irrigação", render: (r) => r.irrigationApplied > 0 ? <span className="text-brand-600 dark:text-brand-400">{r.irrigationApplied.toFixed(1)}</span> : "0.0" },
    { header: "CAD", render: (r) => r.cad.toFixed(1) },
    { header: "ARM", render: (r) => r.storedWater.toFixed(1) },
    { header: "Déficit", render: (r) => r.deficit > 0 ? <span className="text-red-600 dark:text-red-400">{r.deficit.toFixed(1)}</span> : "0.0" },
    { header: "Excedente", render: (r) => r.surplus > 0 ? <span className="text-blue-600 dark:text-blue-400">{r.surplus.toFixed(1)}</span> : "0.0" },
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
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((m) => (
          <Card key={m.k} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-graphite-400 dark:text-gray-500">{m.label}</p>
                <p className="mt-2 text-[22px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{m.value}</p>
                <p className="mt-1.5 text-[11px] text-graphite-400 dark:text-gray-500">{m.note}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${m.color}14`, color: m.color }}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={BAL_KPI_ICONS[m.k]} /></svg>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Gráfico grande + Situação do solo */}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
            <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Armazenamento de água no solo</p>
            <div className="flex flex-wrap items-center gap-3.5 text-[11px] font-medium text-graphite-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded bg-brand-700 dark:bg-brand-400" />Armazenamento</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400/70" />Chuva efetiva</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500/70" />Irrigação</span>
            </div>
          </div>
          <div className="p-5"><BalanceChart rows={rows} /></div>
        </Card>

        <Card className="p-6">
          <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Situação do solo</p>
          <div className="mt-4 flex flex-col items-center">
            <ProgressRing value={arm} max={cad} color={classificacao.color} size={132} thickness={13}>
              <div className="text-center">
                <span className="text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{armPct}%</span>
                <span className="mt-0.5 block text-[10px] text-graphite-400 dark:text-gray-500">da CAD</span>
              </div>
            </ProgressRing>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Classificação</p>
            <p className="text-[18px] font-extrabold" style={{ color: classificacao.color }}>{classificacao.label}</p>
            <p className="mt-2 text-center text-[12px] leading-relaxed text-graphite-500 dark:text-gray-400">
              {classificacao.label === "Adequado"
                ? "O armazenamento está adequado. Manter o manejo atual."
                : classificacao.label === "Atenção"
                  ? "Armazenamento próximo do limite. Preparar irrigação."
                  : "Déficit relevante. Irrigar para repor a água do solo."}
            </p>
          </div>
        </Card>
      </div>

      {/* Resumo do período */}
      <Card className="p-0">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Resumo do período <span className="font-normal text-graphite-400 dark:text-gray-500">({first?.date.slice(8, 10)}/{first?.date.slice(5, 7)} – {last?.date.slice(8, 10)}/{last?.date.slice(5, 7)})</span></p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-100 md:grid-cols-3 lg:grid-cols-5 dark:divide-white/[0.06]">
          {[
            { label: "Déficit inicial", value: `${(first?.deficit ?? 0).toFixed(1)} mm` },
            { label: "Entradas de água", value: `${entradas.toFixed(1)} mm`, cls: "text-blue-600 dark:text-blue-400" },
            { label: "Saídas de água", value: `${summary.totalETc.toFixed(1)} mm`, cls: "text-amber-600 dark:text-amber-400" },
            { label: "Déficit final", value: `${(last?.deficit ?? 0).toFixed(1)} mm` },
            { label: "Variação do armazenamento", value: `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1)} mm`, cls: variacao >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
          ].map((s, i) => (
            <div key={i} className="px-5 py-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{s.label}</p>
              <p className={`mt-1.5 text-[18px] font-extrabold tabular-nums ${s.cls ?? "text-graphite-900 dark:text-white"}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Tabela detalhada (mantida) */}
      <Card className="overflow-x-auto">
        <p className="mb-3 text-[13px] font-bold text-graphite-800 dark:text-white">Balanço diário detalhado</p>
        <Table columns={columns} data={rows} getKey={(r) => r.date} />
      </Card>
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
