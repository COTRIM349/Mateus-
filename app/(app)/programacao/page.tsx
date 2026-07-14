"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Tabs,
  Select,
  StatCard,
  Table,
  Input,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  calculateDynamicCAD,
  calculateDynamicAFD,
  adjustDepletionFactor,
  determineWaterStatus,
  WATER_STATUS_CONFIG,
  type WaterStatus,
} from "@/modules/water-balance/services";
import {
  interpolateKc,
  interpolateRootDepth,
  identifyPhase,
  type CulturePhase,
} from "@/modules/culture/services";
import {
  generateRecommendation,
  simulateScenarios,
  rankRecommendations,
  OPERATIONAL_STATUS_CONFIG,
  PRIORITY_CONFIG,
  type Recommendation,
  type SimulationScenario,
  type PivotContext,
  type OperationalStatus,
  type RecommendationPriority,
} from "@/modules/recommendation/services";
import {
  generateDailySchedule,
  validateSchedule,
  SLOT_STATUS_CONFIG,
  SCHEDULE_STATUS_CONFIG,
  type DailySchedule,
  type ScheduleSlot,
  type SchedulingConstraints,
  type PumpHouse,
  type PumpHousePivot,
  type ReservoirState,
  type EnergyTariff,
  type ScheduleValidation,
} from "@/modules/scheduling/services";

// ── Types ─────────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  efficiency: number;
  pump_power: number;
  status: string;
  farm_id: string;
}

interface CropAssignment {
  id: string;
  pivot_id: string;
  culture_id: string;
  soil_id: string;
  planting_date: string;
  crop_stage: string;
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
  field_capacity: number;
  wilting_point: number;
  effective_depth: number;
}

interface BalanceRow {
  soil_storage: number;
  deficit: number;
  etc: number;
  et0: number;
  water_status: WaterStatus;
}

interface StoredRecommendation {
  id: string;
  pivot_id: string;
  recommendation_date: string;
  should_irrigate: boolean;
  operational_status: OperationalStatus;
  priority: RecommendationPriority;
  priority_score: number;
  productive_risk: number;
  net_depth: number;
  gross_depth: number;
  volume_m3: number;
  irrigation_time_h: number;
  current_arm: number;
  current_cad: number;
  current_deficit: number;
  current_etc: number;
  crop_phase: string | null;
  reason: string;
  accepted: boolean | null;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "central", label: "Central Operacional" },
  { id: "recomendacoes", label: "Recomendações" },
  { id: "simulacoes", label: "Simulações" },
  { id: "historico", label: "Histórico" },
];

// ── Main Page ─────────────────────────────────────────────────────────────

export default function ProgramacaoPage() {
  const { activeFarmId, profile } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState("central");
  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [scheduleValidation, setScheduleValidation] = useState<ScheduleValidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Simulation
  const [simPivotId, setSimPivotId] = useState("");
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [simContext, setSimContext] = useState<PivotContext | null>(null);

  // History
  const [history, setHistory] = useState<StoredRecommendation[]>([]);

  // Load pivots
  useEffect(() => {
    if (!activeFarmId) return;
    (async () => {
      const { data } = await supabase
        .from("pivots")
        .select("id, name, area, flow_rate, efficiency, pump_power, status, farm_id")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name");
      setPivots((data ?? []) as Pivot[]);
    })();
  }, [activeFarmId, supabase]);

  // Build PivotContext from DB
  const buildPivotContext = useCallback(
    async (
      pivot: Pivot,
      today: string,
      currentHour: number,
      peakStart: number,
      peakEnd: number
    ): Promise<PivotContext | null> => {
      const { data: pcaData } = await supabase
        .from("pivot_crop_assignments")
        .select("*")
        .eq("pivot_id", pivot.id)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!pcaData) return null;
      const pca = pcaData as CropAssignment;

      const [{ data: cultureData }, { data: soilData }, { data: phasesData }] =
        await Promise.all([
          supabase.from("cultures").select("id, name, cycle_days, root_depth, depletion_factor").eq("id", pca.culture_id).single(),
          supabase.from("soils").select("id, field_capacity, wilting_point, effective_depth").eq("id", pca.soil_id).single(),
          supabase.from("culture_phases").select("*").eq("culture_id", pca.culture_id).order("phase_order"),
        ]);

      if (!cultureData || !soilData) return null;
      const culture = cultureData as Culture;
      const soil = soilData as Soil;
      const phases = (phasesData ?? []) as CulturePhase[];

      const dap = Math.max(
        0,
        Math.floor(
          (new Date(today).getTime() - new Date(pca.planting_date).getTime()) /
            86400000
        )
      );

      const kc = phases.length > 0 ? interpolateKc(phases, dap) : 1.0;
      const rootDepth = phases.length > 0 ? interpolateRootDepth(phases, dap) : culture.root_depth;
      const phaseId = phases.length > 0 ? identifyPhase(phases, dap) : null;
      const cropPhase = phaseId?.phase.name ?? pca.crop_stage;
      const basePFactor = phaseId?.phase.depletion_factor ?? culture.depletion_factor;

      const { data: balanceData } = await supabase
        .from("water_balances")
        .select("soil_storage, deficit, etc, et0, water_status")
        .eq("pivot_crop_assignment_id", pca.id)
        .order("date", { ascending: false })
        .limit(1)
        .single();

      const cad = calculateDynamicCAD(soil.field_capacity, soil.wilting_point, rootDepth, soil.effective_depth);
      const pAdj = adjustDepletionFactor(basePFactor, 0);
      const afd = calculateDynamicAFD(cad, pAdj);

      const bal = balanceData as BalanceRow | null;

      return {
        pivotId: pivot.id,
        pivotName: pivot.name,
        area: pivot.area,
        flowRate: pivot.flow_rate,
        efficiency: pivot.efficiency,
        pivotStatus: pivot.status,
        fieldCapacity: soil.field_capacity,
        wiltingPoint: soil.wilting_point,
        effectiveSoilDepth: soil.effective_depth,
        storedWater: bal?.soil_storage ?? cad,
        cad,
        afd,
        deficit: bal?.deficit ?? 0,
        etc: bal?.etc ?? 0,
        et0: bal?.et0 ?? 0,
        kc,
        rootDepth,
        depletionFactor: pAdj,
        waterStatus: (bal?.water_status as WaterStatus) ?? "ideal",
        cropPhase,
        daysAfterPlant: dap,
        cycleDays: culture.cycle_days,
        forecastPrecip: 0,
        peakHourStart: peakStart,
        peakHourEnd: peakEnd,
        currentHour,
        maintenanceBlocked: pivot.status === "manutencao",
        reservoirAvailable: true,
      };
    },
    [supabase]
  );

  // Load constraints from DB
  const loadConstraints = useCallback(async (): Promise<SchedulingConstraints> => {
    const [
      { data: phData },
      { data: phpData },
      { data: tariffData },
      { data: resData },
    ] = await Promise.all([
      supabase.from("pump_houses").select("*").eq("farm_id", activeFarmId!).eq("active", true),
      supabase.from("pump_house_pivots").select("*"),
      supabase.from("energy_tariffs").select("*").eq("farm_id", activeFarmId!).order("valid_from", { ascending: false }).limit(1),
      supabase.from("reservoirs").select("*").eq("farm_id", activeFarmId!).eq("active", true),
    ]);

    const pumpHouses: PumpHouse[] = ((phData ?? []) as { id: string; name: string; max_flow_rate: number; max_simultaneous: number; power_kw: number; status: string }[]).map((p) => ({
      id: p.id,
      name: p.name,
      maxFlowRate: p.max_flow_rate,
      maxSimultaneous: p.max_simultaneous,
      powerKw: p.power_kw,
      status: p.status,
    }));

    const pumpHousePivots: PumpHousePivot[] = ((phpData ?? []) as { pump_house_id: string; pivot_id: string; hydraulic_line: string; priority_order: number }[]).map((pp) => ({
      pumpHouseId: pp.pump_house_id,
      pivotId: pp.pivot_id,
      hydraulicLine: pp.hydraulic_line,
      priorityOrder: pp.priority_order,
    }));

    const t = (tariffData?.[0] ?? {}) as {
      peak_start?: number; peak_end?: number; rate_peak?: number; rate_off_peak?: number; demand_rate?: number;
    };
    const tariff: EnergyTariff = {
      peakStart: t.peak_start ?? 18,
      peakEnd: t.peak_end ?? 21,
      ratePeak: t.rate_peak ?? 0.85,
      rateOffPeak: t.rate_off_peak ?? 0.45,
      demandRate: t.demand_rate ?? 0,
    };

    const reservoirs: ReservoirState[] = ((resData ?? []) as {
      id: string; name: string; current_volume: number; max_capacity: number; min_operational_level: number; recharge_rate: number;
    }[]).map((r) => ({
      id: r.id,
      name: r.name,
      currentVolume: r.current_volume,
      maxCapacity: r.max_capacity,
      minOperational: r.min_operational_level,
      rechargeRate: r.recharge_rate,
    }));

    return {
      pumpHouses,
      pumpHousePivots,
      tariff,
      contractedDemandKw: tariff.demandRate,
      reservoirs,
      operationalStart: 5,
      operationalEnd: 23,
      maxDailyHours: 18,
    };
  }, [activeFarmId, supabase]);

  // Generate full schedule
  const generateAll = useCallback(async () => {
    if (!activeFarmId || pivots.length === 0) return;
    setGenerating(true);
    setError("");

    try {
      const today = new Date().toISOString().slice(0, 10);
      const currentHour = new Date().getHours();
      const constraints = await loadConstraints();

      // 1. Generate recommendations
      const recs: Recommendation[] = [];
      for (const pivot of pivots) {
        try {
          const ctx = await buildPivotContext(
            pivot, today, currentHour,
            constraints.tariff.peakStart, constraints.tariff.peakEnd
          );
          if (ctx) recs.push(generateRecommendation(ctx));
        } catch {
          // skip
        }
      }

      const ranked = rankRecommendations(recs);
      setRecommendations(ranked);

      // Persist recommendations
      if (ranked.length > 0) {
        const upsertRecs = ranked.map((r) => ({
          farm_id: activeFarmId,
          pivot_id: r.pivotId,
          recommendation_date: today,
          should_irrigate: r.shouldIrrigate,
          operational_status: r.operationalStatus,
          priority: r.priority,
          priority_score: r.priorityScore,
          productive_risk: r.productiveRisk,
          net_depth: r.netDepth,
          gross_depth: r.grossDepth,
          volume_m3: r.volumeM3,
          irrigation_time_h: r.irrigationTimeH,
          current_arm: r.currentArm,
          current_cad: r.currentCad,
          current_afd: r.currentAfd,
          current_deficit: r.currentDeficit,
          current_etc: r.currentEtc,
          current_kc: r.currentKc,
          root_depth: r.rootDepth,
          crop_phase: r.cropPhase,
          depletion_factor: r.depletionFactor,
          peak_restricted: r.peakRestricted,
          recommended_start: r.recommendedStart,
          reason: r.reason,
          observations: r.observations,
        }));
        await supabase
          .from("irrigation_recommendations")
          .upsert(upsertRecs, { onConflict: "pivot_id,recommendation_date" });
      }

      // 2. Generate schedule from recommendations
      const dailySchedule = generateDailySchedule(ranked, constraints, today);
      setSchedule(dailySchedule);
      setScheduleValidation(validateSchedule(dailySchedule, constraints));

      // 3. Persist schedule
      const { data: schedData } = await supabase
        .from("daily_schedules")
        .upsert(
          {
            farm_id: activeFarmId,
            schedule_date: today,
            status: "rascunho",
            total_volume_m3: dailySchedule.totalVolumeM3,
            total_energy_kwh: dailySchedule.totalEnergyKwh,
            total_cost: dailySchedule.totalCost,
            total_duration_h: dailySchedule.totalDurationH,
            peak_demand_kw: dailySchedule.peakDemandKw,
            contracted_demand_kw: dailySchedule.contractedDemandKw,
            created_by: profile?.id,
          } as Record<string, unknown>,
          { onConflict: "farm_id,schedule_date" }
        )
        .select("id")
        .single();

      if (schedData && dailySchedule.slots.length > 0) {
        const schedId = (schedData as { id: string }).id;
        // Delete old slots
        await supabase.from("schedule_slots").delete().eq("schedule_id", schedId);
        // Insert new slots
        const slotsInsert = dailySchedule.slots.map((s) => ({
          schedule_id: schedId,
          pivot_id: s.pivotId,
          pump_house_id: s.pumpHouseId,
          sequence_order: s.sequenceOrder,
          start_time: s.startTime,
          end_time: s.endTime,
          duration_h: s.durationH,
          net_depth: s.netDepth,
          gross_depth: s.grossDepth,
          volume_m3: s.volumeM3,
          energy_kwh: s.energyKwh,
          cost: s.cost,
          slot_status: s.slotStatus,
          can_simultaneous: s.canSimultaneous,
          simultaneous_group: s.simultaneousGroup,
          hydraulic_line: s.hydraulicLine,
          deficit_irrigation: s.deficitIrrigation,
          justification: s.justification,
        }));
        await supabase.from("schedule_slots").insert(slotsInsert);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar programação");
    } finally {
      setGenerating(false);
    }
  }, [activeFarmId, pivots, supabase, profile, buildPivotContext, loadConstraints]);

  // Approve schedule
  const approveSchedule = async () => {
    if (!schedule || !activeFarmId) return;
    await supabase
      .from("daily_schedules")
      .update({
        status: "aprovado",
        approved_by: profile?.id,
        approved_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("farm_id", activeFarmId)
      .eq("schedule_date", schedule.scheduleDate);
    setSchedule({ ...schedule, status: "aprovado" });
  };

  // Simulation
  const runSimulation = useCallback(async () => {
    if (!simPivotId || !activeFarmId) return;
    const pivot = pivots.find((p) => p.id === simPivotId);
    if (!pivot) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const ctx = await buildPivotContext(pivot, today, new Date().getHours(), 18, 21);
      if (!ctx) return;
      setSimContext(ctx);
      setScenarios(simulateScenarios(ctx));
    } catch { /* skip */ }
  }, [simPivotId, activeFarmId, pivots, buildPivotContext]);

  // History
  const loadHistory = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    const { data } = await supabase
      .from("irrigation_recommendations")
      .select("*")
      .eq("farm_id", activeFarmId)
      .order("recommendation_date", { ascending: false })
      .limit(100);
    setHistory((data ?? []) as StoredRecommendation[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (activeTab === "historico") loadHistory();
  }, [activeTab, loadHistory]);

  // Stats
  const recStats = useMemo(() => {
    const total = recommendations.length;
    const irrigar = recommendations.filter((r) => r.shouldIrrigate).length;
    const criticos = recommendations.filter((r) => r.priority === "critica").length;
    return { total, irrigar, criticos };
  }, [recommendations]);

  if (!activeFarmId) {
    return (
      <div>
        <PageHeader titulo="Central de Programação" descricao="Selecione uma fazenda" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Central de Programação"
        descricao="Motor operacional — Programação automática de irrigação"
        acao={
          <div className="flex gap-2">
            <Button onClick={generateAll} disabled={generating || pivots.length === 0}>
              {generating ? "Gerando..." : "Gerar Programação"}
            </Button>
            {schedule && schedule.status === "rascunho" && (
              <Button variant="secondary" onClick={approveSchedule}>
                Aprovar
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50 p-3.5 dark:border-red-900 dark:bg-red-900/20">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === "central" && (
          <CentralTab
            schedule={schedule}
            validation={scheduleValidation}
            generating={generating}
          />
        )}
        {activeTab === "recomendacoes" && (
          <RecommendationsTab
            recommendations={recommendations}
            stats={recStats}
            generating={generating}
          />
        )}
        {activeTab === "simulacoes" && (
          <SimulationTab
            pivots={pivots}
            selectedPivotId={simPivotId}
            onPivotChange={setSimPivotId}
            onSimulate={runSimulation}
            scenarios={scenarios}
            context={simContext}
          />
        )}
        {activeTab === "historico" && (
          <HistoryTab history={history} pivots={pivots} loading={loading} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Central Operacional Tab
// ═══════════════════════════════════════════════════════════════════════

function CentralTab({
  schedule,
  validation,
  generating,
}: {
  schedule: DailySchedule | null;
  validation: ScheduleValidation[];
  generating: boolean;
}) {
  if (!schedule && !generating) {
    return (
      <Card className="py-12 text-center">
        <p className="text-graphite-400 dark:text-gray-500">
          Clique em &quot;Gerar Programação&quot; para criar a programação operacional do dia.
        </p>
      </Card>
    );
  }

  if (generating) {
    return <Card className="py-8 text-center text-sm text-graphite-400">Analisando pivôs e gerando programação...</Card>;
  }

  if (!schedule) return null;

  const activeSlots = schedule.slots.filter((s) => s.slotStatus !== "bloqueado");
  const blockedSlots = schedule.slots.filter((s) => s.slotStatus === "bloqueado");
  const statusCfg = SCHEDULE_STATUS_CONFIG[schedule.status];

  return (
    <div className="space-y-5">
      {/* Status & Summary */}
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">
          Programação {schedule.scheduleDate}
        </h3>
        <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${statusCfg.bgClass}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Validation alerts */}
      {validation.length > 0 && (
        <Card className="space-y-1">
          {validation.map((v, i) => (
            <p key={i} className={`text-xs ${v.level === "error" ? "text-red-600 dark:text-red-400" : v.level === "warning" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
              {v.level === "error" ? "ERRO" : v.level === "warning" ? "AVISO" : "INFO"}: {v.message}
            </p>
          ))}
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard metric={{ id: "pivots", title: "Pivôs Programados", value: `${activeSlots.length}`, description: blockedSlots.length > 0 ? `${blockedSlots.length} bloqueado(s)` : "Nenhum bloqueado" }} />
        <StatCard metric={{ id: "volume", title: "Volume Total", value: `${schedule.totalVolumeM3.toFixed(0)} m³` }} />
        <StatCard metric={{ id: "energy", title: "Energia Estimada", value: `${schedule.totalEnergyKwh.toFixed(0)} kWh` }} />
        <StatCard metric={{ id: "cost", title: "Custo Estimado", value: `R$ ${schedule.totalCost.toFixed(2)}` }} />
        <StatCard metric={{ id: "duration", title: "Janela Operacional", value: `${schedule.totalDurationH.toFixed(1)} h` }} />
        <StatCard metric={{ id: "demand", title: "Demanda de Ponta", value: `${schedule.peakDemandKw.toFixed(0)} kW`, description: schedule.contractedDemandKw > 0 ? `Contratada: ${schedule.contractedDemandKw.toFixed(0)} kW` : undefined, trend: schedule.peakDemandKw > schedule.contractedDemandKw && schedule.contractedDemandKw > 0 ? "negative" : "positive", variation: schedule.contractedDemandKw > 0 ? `${((schedule.peakDemandKw / schedule.contractedDemandKw) * 100).toFixed(0)}%` : undefined }} />
      </div>

      {/* Timeline visual */}
      <Card>
        <h4 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Linha do Tempo Operacional</h4>
        <TimelineVisual slots={activeSlots} />
      </Card>

      {/* Slots table */}
      <Card className="overflow-x-auto">
        <h4 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Sequência de Irrigação</h4>
        <SlotsTable slots={schedule.slots} />
      </Card>

      {/* Pump & Reservoir utilization */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {schedule.pumpUtilization.length > 0 && (
          <Card>
            <h4 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Utilização das Bombas</h4>
            {schedule.pumpUtilization.map((pu) => (
              <div key={pu.pumpHouseId} className="mb-2 flex items-center justify-between text-xs">
                <span className="text-graphite-400 dark:text-gray-500">{pu.pumpHouseName}</span>
                <div className="flex items-center gap-3">
                  <span>{pu.pivotsServed} pivô(s)</span>
                  <span>{pu.totalHours}h</span>
                  <span>{pu.totalVolumeM3.toFixed(0)} m³</span>
                  <div className="w-20">
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-graphite-700/50">
                      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.min(100, pu.utilizationPct)}%` }} />
                    </div>
                  </div>
                  <span className="w-10 text-right">{pu.utilizationPct}%</span>
                </div>
              </div>
            ))}
          </Card>
        )}

        {schedule.reservoirUsage.length > 0 && (
          <Card>
            <h4 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Utilização dos Reservatórios</h4>
            {schedule.reservoirUsage.map((ru) => (
              <div key={ru.reservoirId} className="mb-2 text-xs">
                <div className="flex justify-between text-graphite-400 dark:text-gray-500">
                  <span>{ru.reservoirName}</span>
                  <span>{ru.capacityPct}%</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="w-20">{ru.startVolume.toFixed(0)} m³</span>
                  <span className="text-red-500">-{ru.consumed.toFixed(0)}</span>
                  <span className="text-green-500">+{ru.recharged.toFixed(0)}</span>
                  <span className="font-semibold text-graphite-900 dark:text-white">{ru.endVolume.toFixed(0)} m³</span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-graphite-700/50">
                      <div
                        className={`h-2 rounded-full ${ru.capacityPct < 20 ? "bg-red-500" : ru.capacityPct < 50 ? "bg-amber-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(100, ru.capacityPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Blocked slots */}
      {blockedSlots.length > 0 && (
        <Card className="border-amber-100 dark:border-amber-900/50">
          <h4 className="mb-5 text-sm font-semibold tracking-tight text-amber-700 dark:text-amber-400">Pivôs Bloqueados ({blockedSlots.length})</h4>
          {blockedSlots.map((s) => (
            <div key={s.pivotId} className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-graphite-900 dark:text-white">{s.pivotName}</span>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-lg px-2 py-0.5 font-medium ${PRIORITY_CONFIG[s.priority].bgClass}`}>{PRIORITY_CONFIG[s.priority].label}</span>
                <span className="text-graphite-400 dark:text-gray-500">{s.justification}</span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ── Timeline visual ─────────────────────────────────────────────────────

function TimelineVisual({ slots }: { slots: ScheduleSlot[] }) {
  if (slots.length === 0) {
    return <p className="text-xs text-graphite-400">Nenhum slot ativo.</p>;
  }

  const timeToMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const starts = slots.map((s) => timeToMin(s.startTime));
  const ends = slots.map((s) => timeToMin(s.endTime));
  const minTime = Math.min(...starts);
  const maxTime = Math.max(...ends);
  const range = maxTime - minTime || 1;

  const colors = [
    "bg-brand-500", "bg-blue-500", "bg-green-500", "bg-purple-500",
    "bg-orange-500", "bg-teal-500", "bg-pink-500", "bg-indigo-500",
  ];

  return (
    <div className="space-y-1">
      {/* Time axis */}
      <div className="relative mb-2 h-4">
        {Array.from({ length: Math.ceil((maxTime - minTime) / 60) + 1 }, (_, i) => {
          const hour = Math.floor(minTime / 60) + i;
          const pos = ((hour * 60 - minTime) / range) * 100;
          if (pos < 0 || pos > 100) return null;
          return (
            <span key={hour} className="absolute text-[9px] text-gray-400" style={{ left: `${pos}%` }}>
              {`${hour}h`}
            </span>
          );
        })}
      </div>
      {/* Peak hour marker */}
      <div className="relative h-2">
        <div
          className="absolute h-full rounded-lg bg-red-200 opacity-40 dark:bg-red-900/30"
          style={{
            left: `${Math.max(0, ((18 * 60 - minTime) / range) * 100)}%`,
            width: `${Math.min(100, ((3 * 60) / range) * 100)}%`,
          }}
        />
        <span className="absolute text-[8px] text-red-400" style={{ left: `${Math.max(0, ((18 * 60 - minTime) / range) * 100)}%` }}>
          ponta
        </span>
      </div>
      {/* Slot bars */}
      {slots.map((slot, i) => {
        const left = ((timeToMin(slot.startTime) - minTime) / range) * 100;
        const width = ((timeToMin(slot.endTime) - timeToMin(slot.startTime)) / range) * 100;
        return (
          <div key={slot.pivotId} className="relative h-6">
            <div
              className={`absolute h-full rounded-lg ${colors[i % colors.length]} flex items-center overflow-hidden px-1`}
              style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
              title={`${slot.pivotName}: ${slot.startTime}–${slot.endTime} (${slot.grossDepth.toFixed(1)} mm)`}
            >
              <span className="truncate text-[9px] font-medium text-white">{slot.pivotName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Slots table ─────────────────────────────────────────────────────────

function SlotsTable({ slots }: { slots: ScheduleSlot[] }) {
  const columns: Column<ScheduleSlot>[] = [
    { header: "#", render: (s) => s.sequenceOrder },
    { header: "Pivô", render: (s) => <span className="font-medium">{s.pivotName}</span> },
    {
      header: "Status",
      render: (s) => {
        const cfg = SLOT_STATUS_CONFIG[s.slotStatus];
        return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.bgClass}`}>{cfg.label}</span>;
      },
    },
    {
      header: "Prioridade",
      render: (s) => <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${PRIORITY_CONFIG[s.priority].bgClass}`}>{PRIORITY_CONFIG[s.priority].label}</span>,
    },
    { header: "Início", render: (s) => s.startTime },
    { header: "Término", render: (s) => s.endTime },
    { header: "Duração", render: (s) => s.durationH > 0 ? `${s.durationH.toFixed(1)} h` : "—" },
    { header: "Lâmina", render: (s) => s.grossDepth > 0 ? `${s.grossDepth.toFixed(1)} mm` : "—" },
    { header: "Volume", render: (s) => s.volumeM3 > 0 ? `${s.volumeM3.toFixed(0)} m³` : "—" },
    { header: "Energia", render: (s) => s.energyKwh > 0 ? `${s.energyKwh.toFixed(0)} kWh` : "—" },
    { header: "Custo", render: (s) => s.cost > 0 ? `R$ ${s.cost.toFixed(2)}` : "—" },
    { header: "Bomba", render: (s) => <span className="text-xs">{s.pumpHouseName}</span> },
    {
      header: "Simult.",
      render: (s) =>
        s.canSimultaneous ? (
          <span className="text-xs text-brand-600 dark:text-brand-400">Grupo {s.simultaneousGroup}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      header: "Justificativa",
      render: (s) => (
        <span className="text-xs text-graphite-400 dark:text-gray-500" title={s.justification}>
          {s.justification.length > 60 ? s.justification.slice(0, 60) + "…" : s.justification}
        </span>
      ),
    },
  ];

  return <Table columns={columns} data={slots} getKey={(s) => s.pivotId} />;
}

// ═══════════════════════════════════════════════════════════════════════
// Recommendations Tab
// ═══════════════════════════════════════════════════════════════════════

function RecommendationsTab({
  recommendations,
  stats,
  generating,
}: {
  recommendations: Recommendation[];
  stats: { total: number; irrigar: number; criticos: number };
  generating: boolean;
}) {
  if (recommendations.length === 0 && !generating) {
    return (
      <Card className="py-12 text-center">
        <p className="text-graphite-400 dark:text-gray-500">Clique em &quot;Gerar Programação&quot; para analisar todos os pivôs.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard metric={{ id: "t", title: "Analisados", value: `${stats.total}` }} />
        <StatCard metric={{ id: "i", title: "Precisam Irrigar", value: `${stats.irrigar}`, trend: stats.irrigar > 0 ? "negative" : "positive", variation: stats.irrigar > 0 ? "Ação" : "OK" }} />
        <StatCard metric={{ id: "c", title: "Críticos", value: `${stats.criticos}`, trend: stats.criticos > 0 ? "negative" : "positive", variation: stats.criticos > 0 ? "Urgente" : "Nenhum" }} />
      </div>

      {generating ? (
        <Card className="py-8 text-center text-sm text-graphite-400">Analisando...</Card>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.pivotId} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const opCfg = OPERATIONAL_STATUS_CONFIG[rec.operationalStatus];
  const priCfg = PRIORITY_CONFIG[rec.priority];
  const armPct = rec.currentCad > 0 ? ((rec.currentArm / rec.currentCad) * 100).toFixed(0) : "0";

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">{rec.pivotName}</h3>
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${opCfg.bgClass}`}>{opCfg.label}</span>
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${priCfg.bgClass}`}>{priCfg.label}</span>
        <span className="ml-auto text-xs text-graphite-400">Score: {rec.priorityScore.toFixed(0)}/100</span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300">{rec.reason}</p>
      <div className="flex flex-wrap gap-4 text-xs text-graphite-400 dark:text-gray-500">
        <span>ARM: <strong className="text-graphite-900 dark:text-white">{rec.currentArm.toFixed(1)} mm ({armPct}%)</strong></span>
        <span>ETc: <strong>{rec.currentEtc.toFixed(1)} mm</strong></span>
        <span>Risco: <strong className={rec.productiveRisk > 50 ? "text-red-600 dark:text-red-400" : ""}>{rec.productiveRisk.toFixed(0)}%</strong></span>
        {rec.shouldIrrigate && (
          <>
            <span>Lâmina: <strong>{rec.grossDepth.toFixed(1)} mm</strong></span>
            <span>Volume: <strong>{rec.volumeM3.toFixed(0)} m³</strong></span>
            <span>Tempo: <strong>{rec.irrigationTimeH.toFixed(1)} h</strong></span>
          </>
        )}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Simulation Tab
// ═══════════════════════════════════════════════════════════════════════

function SimulationTab({
  pivots,
  selectedPivotId,
  onPivotChange,
  onSimulate,
  scenarios,
  context,
}: {
  pivots: Pivot[];
  selectedPivotId: string;
  onPivotChange: (id: string) => void;
  onSimulate: () => void;
  scenarios: SimulationScenario[];
  context: PivotContext | null;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Pivô" value={selectedPivotId} onChange={(e) => onPivotChange(e.target.value)} options={pivots.map((p) => ({ value: p.id, label: p.name }))} />
          <div className="flex items-end">
            <Button onClick={onSimulate} disabled={!selectedPivotId}>Simular Cenários</Button>
          </div>
        </div>
        {context && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-graphite-400 dark:text-gray-500">
            <span>ARM: <strong className="text-graphite-900 dark:text-white">{context.storedWater.toFixed(1)} mm</strong></span>
            <span>CAD: <strong className="text-graphite-900 dark:text-white">{context.cad.toFixed(1)} mm</strong></span>
            <span>ETc: <strong className="text-graphite-900 dark:text-white">{context.etc.toFixed(1)} mm/dia</strong></span>
            <span>Fase: <strong className="text-graphite-900 dark:text-white">{context.cropPhase}</strong></span>
            <span>Status: <strong className="text-graphite-900 dark:text-white">{WATER_STATUS_CONFIG[context.waterStatus].label}</strong></span>
          </div>
        )}
      </Card>

      {scenarios.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-graphite-400 dark:text-gray-500">Selecione um pivô e clique em &quot;Simular Cenários&quot;.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((sc, i) => (
            <ScenarioCard key={i} scenario={sc} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: SimulationScenario }) {
  const statusCfg = WATER_STATUS_CONFIG[scenario.projectedStatus];
  const armPct = scenario.projectedCad > 0 ? ((scenario.projectedArm / scenario.projectedCad) * 100).toFixed(0) : "0";

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">{scenario.name}</h4>
        <p className="text-xs text-graphite-400 dark:text-gray-500">{scenario.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-graphite-400">Lâmina</span>
          <div className="font-semibold text-graphite-900 dark:text-white">{scenario.irrigationDepth > 0 ? `${scenario.irrigationDepth.toFixed(1)} mm` : "—"}</div>
        </div>
        <div>
          <span className="text-graphite-400">ARM Projetado</span>
          <div className="font-semibold text-graphite-900 dark:text-white">{scenario.projectedArm.toFixed(1)} mm ({armPct}%)</div>
        </div>
        <div>
          <span className="text-graphite-400">Status</span>
          <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ${statusCfg.bgClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />{statusCfg.label}
          </span>
        </div>
        <div>
          <span className="text-graphite-400">Risco</span>
          <div className={`font-semibold ${scenario.projectedRisk > 50 ? "text-red-600" : scenario.projectedRisk > 20 ? "text-amber-600" : "text-green-600"}`}>{scenario.projectedRisk.toFixed(0)}%</div>
        </div>
      </div>
      <div className="mt-auto">
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-graphite-700/50">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, parseFloat(armPct))}%`, backgroundColor: statusCfg.color }} />
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// History Tab
// ═══════════════════════════════════════════════════════════════════════

function HistoryTab({
  history,
  pivots,
  loading,
}: {
  history: StoredRecommendation[];
  pivots: Pivot[];
  loading: boolean;
}) {
  const pivotNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of pivots) m[p.id] = p.name;
    return m;
  }, [pivots]);

  const columns: Column<StoredRecommendation>[] = [
    { header: "Data", render: (r) => r.recommendation_date },
    { header: "Pivô", render: (r) => pivotNames[r.pivot_id] ?? r.pivot_id.slice(0, 8) },
    {
      header: "Status",
      render: (r) => {
        const cfg = OPERATIONAL_STATUS_CONFIG[r.operational_status];
        return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.bgClass}`}>{cfg.label}</span>;
      },
    },
    {
      header: "Prioridade",
      render: (r) => {
        const cfg = PRIORITY_CONFIG[r.priority];
        return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${cfg.bgClass}`}>{cfg.label}</span>;
      },
    },
    { header: "Score", render: (r) => r.priority_score.toFixed(0) },
    { header: "Risco", render: (r) => `${r.productive_risk.toFixed(0)}%` },
    { header: "Lâmina", render: (r) => r.gross_depth > 0 ? `${r.gross_depth.toFixed(1)} mm` : "—" },
    { header: "Volume", render: (r) => r.volume_m3 > 0 ? `${r.volume_m3.toFixed(0)} m³` : "—" },
    {
      header: "Aceita",
      render: (r) =>
        r.accepted === true ? <span className="text-green-600">Sim</span> :
        r.accepted === false ? <span className="text-red-600">Não</span> :
        <span className="text-gray-400">—</span>,
    },
  ];

  if (loading) return <Card className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-graphite-700 dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></Card>;

  if (history.length === 0) {
    return <Card className="py-12 text-center"><p className="text-graphite-400 dark:text-gray-500">Nenhuma recomendação registrada.</p></Card>;
  }

  return (
    <Card className="overflow-x-auto">
      <Table columns={columns} data={history} getKey={(r) => r.id} />
    </Card>
  );
}
