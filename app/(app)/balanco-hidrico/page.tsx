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
  type DailyBalanceRow,
  type WaterStatus,
  type HydricStatus,
} from "@/modules/water-balance/services";
import { type CulturePhase } from "@/modules/culture/services";

// mapeia o status hídrico (3 níveis do motor) para o water_status legado (5 níveis)
const HYDRIC_TO_WATER_STATUS: Record<HydricStatus, WaterStatus> = {
  verde: "ideal",
  amarelo: "atencao",
  vermelho: "deficit_critico",
  cinza: "ideal",
};
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

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
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3.5 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
      </Card>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-5">
        {activeTab === "balanco" && (
          <BalanceTab rows={balanceRows} summary={summary} loading={loading || calculating} />
        )}
        {activeTab === "graficos" && (
          <ChartsTab rows={balanceRows} />
        )}
        {activeTab === "lancamento" && (
          <LancamentoTab
            pivotId={selectedPivotId}
            pivots={pivots}
            date={lancDate}
            depth={lancDepth}
            saving={lancSaving}
            message={lancMsg}
            onDateChange={setLancDate}
            onDepthChange={setLancDepth}
            onSave={handleLancamento}
          />
        )}
      </div>
    </div>
  );
}

// ── Balance Tab ─────────────────────────────────────────────────────────

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

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard metric={{ id: "etc", title: "ETc Total", value: `${summary.totalETc.toFixed(1)} mm`, description: `Média: ${summary.avgETc.toFixed(1)} mm/dia` }} />
        <StatCard metric={{ id: "precip", title: "Chuva Total", value: `${summary.totalPrecipitation.toFixed(1)} mm`, description: `Efetiva: ${summary.totalEffPrecipitation.toFixed(1)} mm` }} />
        <StatCard metric={{ id: "irrig", title: "Irrigação", value: `${summary.totalIrrigation.toFixed(1)} mm`, description: `${summary.days} dias` }} />
        <StatCard metric={{ id: "arm", title: "ARM Médio", value: `${summary.avgStoredWater.toFixed(1)} mm`, description: `Mín: ${summary.minStoredWater.toFixed(1)} mm` }} />
        <StatCard metric={{ id: "deficit", title: "Dias em Déficit", value: `${summary.daysInDeficit}`, description: `Crítico: ${summary.daysInCritical}`, trend: summary.daysInDeficit > 0 ? "negative" : "positive", variation: summary.daysInDeficit === 0 ? "OK" : `${((summary.daysInDeficit / Math.max(summary.days, 1)) * 100).toFixed(0)}%` }} />
        <StatCard metric={{ id: "surplus", title: "Excedente Total", value: `${summary.totalSurplus.toFixed(1)} mm`, description: "Percolação/escoamento" }} />
      </div>

      {loading ? (
        <Card className="py-8 text-center text-sm text-gray-500">Carregando...</Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table columns={columns} data={rows} getKey={(r) => r.date} />
        </Card>
      )}
    </div>
  );
}

// ── Charts Tab ──────────────────────────────────────────────────────────

function ChartsTab({ rows }: { rows: DailyBalanceRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="py-12 text-center">
        <p className="text-graphite-400 dark:text-gray-500">
          Calcule o balanço hídrico para visualizar os gráficos.
        </p>
      </Card>
    );
  }

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
            <p className={`col-span-full rounded-xl p-3.5 text-xs ${message.includes("sucesso") ? "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"}`}>
              {message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
