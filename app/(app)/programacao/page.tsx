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
  Modal,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  calculateDynamicCAD,
  calculateDynamicAFD,
  adjustDepletionFactor,
  calculateETc,
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

// ── Types ─────────────────────────────────────────────────────────────────

interface Pivot {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  efficiency: number;
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
  date: string;
  et0: number;
  kc: number;
  etc: number;
  soil_storage: number;
  cad: number;
  afd: number;
  deficit: number;
  root_depth: number;
  depletion_factor: number;
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
  { id: "dashboard", label: "Dashboard" },
  { id: "simulacoes", label: "Simulações" },
  { id: "historico", label: "Histórico" },
];

// ── Main Page ─────────────────────────────────────────────────────────────

export default function ProgramacaoPage() {
  const { activeFarmId, profile } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [pivots, setPivots] = useState<Pivot[]>([]);

  // Simulation state
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
        .select("id, name, area, flow_rate, efficiency, status, farm_id")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name");
      setPivots((data ?? []) as Pivot[]);
    })();
  }, [activeFarmId, supabase]);

  // Generate recommendations for all pivots
  const generateAll = useCallback(async () => {
    if (!activeFarmId || pivots.length === 0) return;
    setGenerating(true);
    setError("");

    try {
      const today = new Date().toISOString().slice(0, 10);
      const currentHour = new Date().getHours();
      const recs: Recommendation[] = [];

      // Get energy tariff for peak hours
      const { data: tariffData } = await supabase
        .from("energy_tariffs")
        .select("peak_start, peak_end")
        .eq("farm_id", activeFarmId)
        .order("valid_from", { ascending: false })
        .limit(1);

      const peakStart = (tariffData?.[0] as { peak_start: number } | undefined)?.peak_start ?? 18;
      const peakEnd = (tariffData?.[0] as { peak_end: number } | undefined)?.peak_end ?? 21;

      for (const pivot of pivots) {
        try {
          const ctx = await buildPivotContext(
            pivot,
            today,
            currentHour,
            peakStart,
            peakEnd
          );
          if (ctx) {
            recs.push(generateRecommendation(ctx));
          }
        } catch {
          // Skip pivots without complete data
        }
      }

      const ranked = rankRecommendations(recs);
      setRecommendations(ranked);

      // Persist recommendations
      if (ranked.length > 0) {
        const upsertData = ranked.map((r) => ({
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
          .upsert(upsertData, { onConflict: "pivot_id,recommendation_date" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar recomendações");
    } finally {
      setGenerating(false);
    }
  }, [activeFarmId, pivots, supabase]);

  // Build PivotContext from DB data
  const buildPivotContext = useCallback(
    async (
      pivot: Pivot,
      today: string,
      currentHour: number,
      peakStart: number,
      peakEnd: number
    ): Promise<PivotContext | null> => {
      // Get active crop assignment
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

      // Get culture, soil, phases
      const [{ data: cultureData }, { data: soilData }, { data: phasesData }] = await Promise.all([
        supabase.from("cultures").select("id, name, cycle_days, root_depth, depletion_factor").eq("id", pca.culture_id).single(),
        supabase.from("soils").select("id, field_capacity, wilting_point, effective_depth").eq("id", pca.soil_id).single(),
        supabase.from("culture_phases").select("*").eq("culture_id", pca.culture_id).order("phase_order"),
      ]);

      if (!cultureData || !soilData) return null;
      const culture = cultureData as Culture;
      const soil = soilData as Soil;
      const phases = (phasesData ?? []) as CulturePhase[];

      // Days after planting
      const plantingMs = new Date(pca.planting_date).getTime();
      const todayMs = new Date(today).getTime();
      const dap = Math.max(0, Math.floor((todayMs - plantingMs) / 86400000));

      // Get Kc, root depth, phase
      const kc = phases.length > 0 ? interpolateKc(phases, dap) : 1.0;
      const rootDepth = phases.length > 0 ? interpolateRootDepth(phases, dap) : culture.root_depth;
      const phaseId = phases.length > 0 ? identifyPhase(phases, dap) : null;
      const cropPhase = phaseId?.phase.name ?? pca.crop_stage;
      const basePFactor = phaseId?.phase.depletion_factor ?? culture.depletion_factor;

      // Get latest balance
      const { data: balanceData } = await supabase
        .from("water_balances")
        .select("*")
        .eq("pivot_crop_assignment_id", pca.id)
        .order("date", { ascending: false })
        .limit(1)
        .single();

      const cad = calculateDynamicCAD(soil.field_capacity, soil.wilting_point, rootDepth, soil.effective_depth);
      const pAdj = adjustDepletionFactor(basePFactor, 0);
      const afd = calculateDynamicAFD(cad, pAdj);

      let storedWater: number;
      let deficit: number;
      let etc: number;
      let et0: number;
      let waterStatus: WaterStatus;

      if (balanceData) {
        const bal = balanceData as BalanceRow;
        storedWater = bal.soil_storage;
        deficit = bal.deficit;
        etc = bal.etc;
        et0 = bal.et0;
        waterStatus = bal.water_status;
      } else {
        storedWater = cad;
        deficit = 0;
        etc = 0;
        et0 = 0;
        waterStatus = "ideal";
      }

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
        storedWater,
        cad,
        afd,
        deficit,
        etc,
        et0,
        kc,
        rootDepth,
        depletionFactor: pAdj,
        waterStatus,
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

  // Run simulation for a specific pivot
  const runSimulation = useCallback(async () => {
    if (!simPivotId || !activeFarmId) return;
    const pivot = pivots.find((p) => p.id === simPivotId);
    if (!pivot) return;

    const today = new Date().toISOString().slice(0, 10);
    const currentHour = new Date().getHours();

    try {
      const ctx = await buildPivotContext(pivot, today, currentHour, 18, 21);
      if (!ctx) {
        setError("Dados insuficientes para simulação deste pivô");
        return;
      }
      setSimContext(ctx);
      setScenarios(simulateScenarios(ctx));
    } catch {
      setError("Erro ao carregar dados para simulação");
    }
  }, [simPivotId, activeFarmId, pivots, buildPivotContext]);

  // Load history
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

  // Accept recommendation
  const acceptRecommendation = async (rec: Recommendation) => {
    await supabase
      .from("irrigation_recommendations")
      .update({
        accepted: true,
        accepted_at: new Date().toISOString(),
        accepted_by: profile?.id,
      } as Record<string, unknown>)
      .eq("pivot_id", rec.pivotId)
      .eq("recommendation_date", new Date().toISOString().slice(0, 10));

    setRecommendations((prev) =>
      prev.map((r) =>
        r.pivotId === rec.pivotId ? { ...r, observations: r.observations + " [ACEITA]" } : r
      )
    );
  };

  // Summary stats
  const stats = useMemo(() => {
    const total = recommendations.length;
    const irrigar = recommendations.filter((r) => r.shouldIrrigate).length;
    const criticos = recommendations.filter((r) => r.priority === "critica").length;
    const volumeTotal = recommendations.reduce((s, r) => s + r.volumeM3, 0);
    const tempoTotal = recommendations.reduce((s, r) => s + r.irrigationTimeH, 0);
    const riskAvg = total > 0 ? recommendations.reduce((s, r) => s + r.productiveRisk, 0) / total : 0;
    return { total, irrigar, criticos, volumeTotal, tempoTotal, riskAvg };
  }, [recommendations]);

  if (!activeFarmId) {
    return (
      <div>
        <PageHeader titulo="Programação de Irrigação" descricao="Selecione uma fazenda" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Programação de Irrigação"
        descricao="Motor de decisão — Recomendação automática por pivô"
        acao={
          <Button onClick={generateAll} disabled={generating || pivots.length === 0}>
            {generating ? "Gerando..." : "Gerar Recomendações"}
          </Button>
        }
      />

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === "dashboard" && (
          <DashboardTab
            recommendations={recommendations}
            stats={stats}
            generating={generating}
            onAccept={acceptRecommendation}
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
          <HistoryTab
            history={history}
            pivots={pivots}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}

// ── Dashboard Tab ───────────────────────────────────────────────────────

function DashboardTab({
  recommendations,
  stats,
  generating,
  onAccept,
}: {
  recommendations: Recommendation[];
  stats: { total: number; irrigar: number; criticos: number; volumeTotal: number; tempoTotal: number; riskAvg: number };
  generating: boolean;
  onAccept: (rec: Recommendation) => void;
}) {
  if (recommendations.length === 0 && !generating) {
    return (
      <Card className="py-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Clique em &quot;Gerar Recomendações&quot; para analisar todos os pivôs.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard metric={{ id: "total", title: "Pivôs Analisados", value: `${stats.total}` }} />
        <StatCard metric={{ id: "irrigar", title: "Precisam Irrigar", value: `${stats.irrigar}`, trend: stats.irrigar > 0 ? "negative" : "positive", variation: stats.irrigar > 0 ? `${((stats.irrigar / Math.max(stats.total, 1)) * 100).toFixed(0)}%` : "OK" }} />
        <StatCard metric={{ id: "criticos", title: "Prioridade Crítica", value: `${stats.criticos}`, trend: stats.criticos > 0 ? "negative" : "positive", variation: stats.criticos > 0 ? "Urgente" : "Nenhum" }} />
        <StatCard metric={{ id: "volume", title: "Volume Total", value: `${stats.volumeTotal.toFixed(0)} m³` }} />
        <StatCard metric={{ id: "tempo", title: "Tempo Total", value: `${stats.tempoTotal.toFixed(1)} h` }} />
        <StatCard metric={{ id: "risco", title: "Risco Médio", value: `${stats.riskAvg.toFixed(0)}%`, trend: stats.riskAvg > 40 ? "negative" : stats.riskAvg > 20 ? "neutral" : "positive", variation: stats.riskAvg > 40 ? "Elevado" : stats.riskAvg > 20 ? "Moderado" : "Baixo" }} />
      </div>

      {generating ? (
        <Card className="py-8 text-center text-sm text-gray-500">Analisando pivôs...</Card>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.pivotId} rec={rec} onAccept={onAccept} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recommendation Card ─────────────────────────────────────────────────

function RecommendationCard({
  rec,
  onAccept,
}: {
  rec: Recommendation;
  onAccept: (rec: Recommendation) => void;
}) {
  const opCfg = OPERATIONAL_STATUS_CONFIG[rec.operationalStatus];
  const priCfg = PRIORITY_CONFIG[rec.priority];
  const armPct = rec.currentCad > 0 ? ((rec.currentArm / rec.currentCad) * 100).toFixed(0) : "0";

  return (
    <Card className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-graphite-900 dark:text-white">
            {rec.pivotName}
          </h3>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${opCfg.bgClass}`}>
            {opCfg.label}
          </span>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${priCfg.bgClass}`}>
            {priCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Score: <strong>{rec.priorityScore.toFixed(0)}</strong>/100
          </span>
          {rec.shouldIrrigate && (
            <Button size="sm" onClick={() => onAccept(rec)}>
              Aceitar
            </Button>
          )}
        </div>
      </div>

      {/* Reason */}
      <p className="text-sm text-gray-600 dark:text-gray-300">{rec.reason}</p>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
        <MetricItem label="ARM" value={`${rec.currentArm.toFixed(1)} mm`} sub={`${armPct}% do CAD`} />
        <MetricItem label="ETc" value={`${rec.currentEtc.toFixed(1)} mm/dia`} />
        <MetricItem label="Kc" value={rec.currentKc.toFixed(2)} />
        <MetricItem label="Fase" value={rec.cropPhase} />
        <MetricItem
          label="Risco Produtivo"
          value={`${rec.productiveRisk.toFixed(0)}%`}
          highlight={rec.productiveRisk > 50}
        />
        {rec.shouldIrrigate && (
          <>
            <MetricItem label="Lâmina Bruta" value={`${rec.grossDepth.toFixed(1)} mm`} />
            <MetricItem label="Volume" value={`${rec.volumeM3.toFixed(0)} m³`} />
          </>
        )}
      </div>

      {/* Irrigation details */}
      {rec.shouldIrrigate && (
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-graphite-800">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <span className="text-gray-500 dark:text-gray-400">Lâmina líquida: <strong className="text-graphite-900 dark:text-white">{rec.netDepth.toFixed(1)} mm</strong></span>
            <span className="text-gray-500 dark:text-gray-400">Lâmina bruta: <strong className="text-graphite-900 dark:text-white">{rec.grossDepth.toFixed(1)} mm</strong></span>
            <span className="text-gray-500 dark:text-gray-400">Volume: <strong className="text-graphite-900 dark:text-white">{rec.volumeM3.toFixed(0)} m³</strong></span>
            <span className="text-gray-500 dark:text-gray-400">Tempo: <strong className="text-graphite-900 dark:text-white">{rec.irrigationTimeH.toFixed(1)} h</strong></span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Início: <strong className="text-graphite-900 dark:text-white">{rec.recommendedStart}</strong></span>
            {rec.peakRestricted && (
              <span className="text-amber-600 dark:text-amber-400">Restrição de horário de ponta</span>
            )}
          </div>
        </div>
      )}

      {/* Observations */}
      {rec.observations && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{rec.observations}</p>
      )}
    </Card>
  );
}

function MetricItem({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <div className={`font-semibold ${highlight ? "text-red-600 dark:text-red-400" : "text-graphite-900 dark:text-white"}`}>
        {value}
      </div>
      {sub && <span className="text-gray-400 dark:text-gray-500">{sub}</span>}
    </div>
  );
}

// ── Simulation Tab ──────────────────────────────────────────────────────

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
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Pivô"
            value={selectedPivotId}
            onChange={(e) => onPivotChange(e.target.value)}
            options={pivots.map((p) => ({ value: p.id, label: p.name }))}
          />
          <div className="flex items-end">
            <Button onClick={onSimulate} disabled={!selectedPivotId}>
              Simular Cenários
            </Button>
          </div>
        </div>

        {context && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
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
          <p className="text-gray-500 dark:text-gray-400">
            Selecione um pivô e clique em &quot;Simular Cenários&quot; para comparar opções.
          </p>
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
        <h4 className="text-sm font-semibold text-graphite-900 dark:text-white">{scenario.name}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">{scenario.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Lâmina</span>
          <div className="font-semibold text-graphite-900 dark:text-white">
            {scenario.irrigationDepth > 0 ? `${scenario.irrigationDepth.toFixed(1)} mm` : "—"}
          </div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">ARM Projetado</span>
          <div className="font-semibold text-graphite-900 dark:text-white">
            {scenario.projectedArm.toFixed(1)} mm ({armPct}%)
          </div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Status Projetado</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.bgClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusCfg.label}
          </span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Dias até Estresse</span>
          <div className={`font-semibold ${scenario.daysUntilStress <= 1 ? "text-red-600 dark:text-red-400" : scenario.daysUntilStress <= 3 ? "text-amber-600 dark:text-amber-400" : "text-graphite-900 dark:text-white"}`}>
            {scenario.daysUntilStress > 90 ? ">90" : scenario.daysUntilStress}
          </div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Risco Produtivo</span>
          <div className={`font-semibold ${scenario.projectedRisk > 50 ? "text-red-600 dark:text-red-400" : scenario.projectedRisk > 20 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>
            {scenario.projectedRisk.toFixed(0)}%
          </div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Déficit Projetado</span>
          <div className="font-semibold text-graphite-900 dark:text-white">
            {scenario.projectedDeficit > 0 ? `${scenario.projectedDeficit.toFixed(1)} mm` : "0.0 mm"}
          </div>
        </div>
      </div>

      {/* ARM bar visualization */}
      <div className="mt-auto">
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-graphite-700">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, parseFloat(armPct))}%`,
              backgroundColor: statusCfg.color,
            }}
          />
        </div>
      </div>
    </Card>
  );
}

// ── History Tab ─────────────────────────────────────────────────────────

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
    const map: Record<string, string> = {};
    for (const p of pivots) map[p.id] = p.name;
    return map;
  }, [pivots]);

  const columns: Column<StoredRecommendation>[] = [
    { header: "Data", render: (r) => r.recommendation_date },
    { header: "Pivô", render: (r) => pivotNames[r.pivot_id] ?? r.pivot_id.slice(0, 8) },
    {
      header: "Status",
      render: (r) => {
        const cfg = OPERATIONAL_STATUS_CONFIG[r.operational_status];
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bgClass}`}>{cfg.label}</span>;
      },
    },
    {
      header: "Prioridade",
      render: (r) => {
        const cfg = PRIORITY_CONFIG[r.priority];
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bgClass}`}>{cfg.label}</span>;
      },
    },
    { header: "Score", render: (r) => r.priority_score.toFixed(0) },
    { header: "Risco", render: (r) => `${r.productive_risk.toFixed(0)}%` },
    { header: "Lâmina", render: (r) => r.gross_depth > 0 ? `${r.gross_depth.toFixed(1)} mm` : "—" },
    { header: "Volume", render: (r) => r.volume_m3 > 0 ? `${r.volume_m3.toFixed(0)} m³` : "—" },
    { header: "Tempo", render: (r) => r.irrigation_time_h > 0 ? `${r.irrigation_time_h.toFixed(1)} h` : "—" },
    {
      header: "Aceita",
      render: (r) =>
        r.accepted === true ? (
          <span className="text-green-600 dark:text-green-400">Sim</span>
        ) : r.accepted === false ? (
          <span className="text-red-600 dark:text-red-400">Não</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  if (loading) {
    return <Card className="py-8 text-center text-sm text-gray-500">Carregando...</Card>;
  }

  if (history.length === 0) {
    return (
      <Card className="py-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Nenhuma recomendação registrada ainda.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <Table columns={columns} data={history} getKey={(r) => r.id} />
    </Card>
  );
}
