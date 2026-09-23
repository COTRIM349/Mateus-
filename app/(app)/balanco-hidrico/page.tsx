"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
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
  moisturePctCcForDisplay,
  safetyPctCcForDisplay,
  type BalanceDay,
  type DailyBalanceRow,
  type WaterStatus,
  type HydricStatus,
  type InitialMoistureUnit,
} from "@/modules/water-balance/services";
import { cropGroupByName } from "@/modules/water-balance/services/availability-factor";
import { type CulturePhase } from "@/modules/culture/services";
import {
  buildOperationalPivotSoil,
  mapDbLayersToProfile,
  resolveSensoryNote,
  type PivotSoilRegistryLayerRow,
  type PivotSoilRegistryRow,
  type SoilProfileLayer,
} from "@/modules/soil/services";
import { buildIrrigationEventInsert, deriveAppliedVolume, deriveOperatingHours, sumGrossDepthByDate } from "@/modules/irrigation/services";
import {
  assertParcelAcceptsOperationalLaunch,
  filterPivotsWithActiveParcel,
  resolveDaeReferenceDate,
} from "@/modules/assignment/services";
import { calculateDailyKc } from "@/modules/culture/services/agronomic-engine";
import { pickTariffForDate, priceIrrigationEvent, type TariffRow } from "@/modules/costs/services";
import { initialManejoVisibility, managementRowFromBalance, type ManejoSeriesKey } from "@/modules/reports/services";
import { ManejoChart, ManejoSeriesPicker } from "@/components/charts/ManejoChart";
import { HydricInitialConditionForm } from "@/components/water-balance/HydricInitialConditionForm";
import {
  EntradasConsumoChart,
  ReservatorioChart,
  CockpitSeriesToggles,
  ENTRADAS_SERIES,
  RESERVATORIO_SERIES,
  defaultEntradasVisible,
  defaultReservatorioVisible,
  type EntradaConsumoPoint,
  type ReservatorioPoint,
  type EntradaSeriesKey,
  type ReservSeriesKey,
} from "@/components/water-balance/CockpitCharts";
import { useFarmHydricState } from "@/lib/hooks/use-farm-hydric-state-v2";
import Link from "next/link";

// mapeia o status hídrico (3 níveis do motor) para o water_status legado (5 níveis)
const HYDRIC_TO_WATER_STATUS: Record<HydricStatus, WaterStatus> = {
  verde: "ideal",
  amarelo: "atencao",
  vermelho: "deficit_critico",
  cinza: "ideal",
};

// adapta a saída do motor (BalanceDay) ao formato de exibição da tela.
function mapBalanceDay(d: BalanceDay): DailyBalanceRow {
  return {
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
    cadProfileMm: d.cadProfileMm,
    craProfileMm: d.craProfileMm,
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
  };
}

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
  culture_variety_id: string | null;
  variety_id: string | null;
  soil_id: string | null;
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
  bulk_density: number | null;
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

// Arquitetura obrigatória: apenas duas abas. DADOS entende o histórico;
// DECISÃO transforma o estado atual em ação. O registro de irrigação
// executada vive em /lancamentos/irrigacao (fluxo de execução).
const TABS = [
  { id: "dados", label: "Dados" },
  { id: "decisao", label: "Decisão" },
];

// ── Main Page ─────────────────────────────────────────────────────────────

export default function BalancoHidricoPage() {
  const { activeFarmId, farms } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"dados" | "decisao">("dados");
  const [showDetail, setShowDetail] = useState(false);
  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [pivotsLoading, setPivotsLoading] = useState(false);
  const [pivotsLoadedFarmId, setPivotsLoadedFarmId] = useState<string | null>(null);
  const [pivotLoadError, setPivotLoadError] = useState("");
  const [assignment, setAssignment] = useState<CropAssignment | null>(null);
  const [culture, setCulture] = useState<Culture | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [soilLayers, setSoilLayers] = useState<SoilProfileLayer[]>([]);
  const [phases, setPhases] = useState<CulturePhase[]>([]);
  const [hydricAnchor, setHydricAnchor] = useState<HydricAnchor | null>(null);
  const [showInitialForm, setShowInitialForm] = useState(false);
  const [balanceRows, setBalanceRows] = useState<DailyBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [varietyName, setVarietyName] = useState<string | null>(null);
  const [seasonName, setSeasonName] = useState<string | null>(null);

  // Estado hídrico de toda a fazenda (KPIs do topo do cockpit).
  const { states: farmStates, refresh: refreshFarm } = useFarmHydricState();

  // Projeção hídrica: dias futuros calculados pelo motor com a previsão como
  // clima (ETo calculada aprovada), sem irrigação. Nunca observação.
  const [projectionRows, setProjectionRows] = useState<DailyBalanceRow[]>([]);

  // Lançamento tab
  const [lancDate, setLancDate] = useState("");
  const [lancTime, setLancTime] = useState("06:00");
  const [lancDepth, setLancDepth] = useState("");
  const [lancHours, setLancHours] = useState("");
  const [lancNotes, setLancNotes] = useState("");
  const [lancSaving, setLancSaving] = useState(false);
  const [lancMsg, setLancMsg] = useState("");

  // Parcela preferida vinda de ?parcel= (fila da Central de Manejo). Consumida
  // uma única vez ao abrir o pivô setorizado correspondente.
  const preferredParcelRef = useRef<string | null>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("parcel")
      : null,
  );

  // O balanço só oferece pivôs que estejam ativos e tenham parcela em manejo.
  useEffect(() => {
    let cancelled = false;

    setPivots([]);
    setSelectedPivotId("");
    setPivotsLoadedFarmId(null);
    setPivotLoadError("");
    setBalanceRows([]);
    setDateStart("");
    setDateEnd("");

    if (!activeFarmId) {
      setPivotsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setPivotsLoading(true);
    void (async () => {
      try {
        const { data: pivotData, error: pivotsError } = await supabase
          .from("pivots")
          .select("id, name, area, flow_rate, efficiency, application_efficiency, farm_id, specific_consumption, pump_power, installed_power_kw, motor_efficiency, energy_cost, latitude, longitude")
          .eq("farm_id", activeFarmId)
          .eq("active", true)
          .order("name");
        if (pivotsError) throw pivotsError;

        const farmPivots = (pivotData ?? []) as Pivot[];
        if (farmPivots.length === 0) {
          if (!cancelled) setPivotsLoadedFarmId(activeFarmId);
          return;
        }

        const { data: activeAssignments, error: assignmentsError } = await supabase
          .from("pivot_crop_assignments")
          .select("pivot_id,active,status")
          .in("pivot_id", farmPivots.map((pivot) => pivot.id))
          .eq("active", true)
          .or("status.is.null,status.eq.ativa");
        if (assignmentsError) throw assignmentsError;
        if (cancelled) return;

        const eligiblePivots = filterPivotsWithActiveParcel(
          farmPivots,
          activeAssignments ?? [],
        );
        setPivots(eligiblePivots);
        setPivotsLoadedFarmId(activeFarmId);
        // Pré-seleção por ?pivot= (vindo da Central de Manejo/mapa/fila).
        const urlPivot = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("pivot")
          : null;
        setSelectedPivotId((current) => {
          if (eligiblePivots.some((pivot) => pivot.id === current)) return current;
          if (urlPivot && eligiblePivots.some((pivot) => pivot.id === urlPivot)) return urlPivot;
          return eligiblePivots[0]?.id ?? "";
        });
      } catch {
        if (!cancelled) {
          setPivots([]);
          setSelectedPivotId("");
          setPivotLoadError("Não foi possível carregar os pivôs com parcela ativa.");
        }
      } finally {
        if (!cancelled) setPivotsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
      setVarietyName(null);
      setSeasonName(null);
      return;
    }
    // Carregamento cancelável: ao trocar de pivô, ignora resultados de uma carga
    // anterior — senão os dados do pivô antigo podem repovoar o estado por
    // último e ser calculados sob o novo pivô.
    let cancelled = false;
    (async () => {
      // Parcela preferida via ?parcel= (fila da Central) — em pivô setorizado
      // abre a parcela exata; consumida uma vez.
      let pca: unknown = null;
      const preferredParcel = preferredParcelRef.current;
      if (preferredParcel) {
        const { data } = await supabase
          .from("pivot_crop_assignments")
          .select("*")
          .eq("id", preferredParcel)
          .eq("pivot_id", selectedPivotId)
          .eq("active", true)
          .or("status.is.null,status.eq.ativa")
          .maybeSingle();
        if (cancelled) return;
        preferredParcelRef.current = null;
        pca = data;
      }
      if (!pca) {
        const { data } = await supabase
          .from("pivot_crop_assignments")
          .select("*")
          .eq("pivot_id", selectedPivotId)
          .eq("active", true)
          // Sprint 13 · Etapa 6 — só considera parcela em manejo.
          .or("status.is.null,status.eq.ativa")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        pca = data;
      }
      if (cancelled) return;

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

      // Cultivar e safra (identidade da parcela, exibidas no cabeçalho do pivô).
      // Parcelas antigas/importadas podem ter só variety_id — usa o mesmo
      // fallback da tela de vinculação (culture_variety_id ?? variety_id).
      const effectiveVarietyId = a.culture_variety_id ?? a.variety_id;
      const [{ data: varietyRow }, { data: seasonRow }] = await Promise.all([
        effectiveVarietyId
          ? supabase.from("culture_varieties").select("name").eq("id", effectiveVarietyId).maybeSingle()
          : Promise.resolve({ data: null }),
        a.season_id
          ? supabase.from("seasons").select("name").eq("id", a.season_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setVarietyName((varietyRow as { name: string } | null)?.name ?? null);
      setSeasonName((seasonRow as { name: string } | null)?.name ?? null);

      // O perfil físico 1:1 do pivô é a fonte operacional. O catálogo antigo
      // permanece somente como fallback para registros ainda não migrados.
      const { data: legacyPivotSoil } = await supabase
        .from("pivots")
        .select("soil_id")
        .eq("id", selectedPivotId)
        .single();
      const effectiveSoilId =
        (legacyPivotSoil as { soil_id: string | null } | null)?.soil_id ?? a.soil_id;

      const [
        { data: cultureData },
        { data: legacySoilData },
        { data: phaseData },
        { data: legacyLayerData },
        { data: fixedProfileData },
        { data: fixedLayerData },
      ] = await Promise.all([
        supabase.from("cultures").select("id, name, cycle_days, root_depth, depletion_factor, kl, ks_function, ky").eq("id", a.culture_id).single(),
        effectiveSoilId
          ? supabase.from("soils").select("id, name, field_capacity, wilting_point, bulk_density, effective_depth").eq("id", effectiveSoilId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("culture_phases").select("*").eq("culture_id", a.culture_id).order("phase_order"),
        effectiveSoilId
          ? supabase
              .from("soil_layers")
              .select("depth_start, depth_end, field_capacity, wilting_point, bulk_density, kl")
              .eq("soil_id", effectiveSoilId)
              .order("depth_start")
          : Promise.resolve({ data: [] }),
        supabase
          .from("pivot_soils")
          .select("pivot_id,soil_class,cc_pmp_unit")
          .eq("pivot_id", selectedPivotId)
          .maybeSingle(),
        supabase
          .from("pivot_soil_layers")
          .select("pivot_id,layer_number,thickness_m,field_capacity_pct,wilting_point_pct,bulk_density_g_cm3")
          .eq("pivot_id", selectedPivotId)
          .order("layer_number"),
      ]);

      const fixedSoil = buildOperationalPivotSoil(
        fixedProfileData as PivotSoilRegistryRow | null,
        (fixedLayerData ?? []) as PivotSoilRegistryLayerRow[],
      );
      const operationalSoil = fixedSoil ?? (legacySoilData as Soil | null);
      const operationalLayers = fixedSoil?.layers
        ?? mapDbLayersToProfile(legacyLayerData ?? []);

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
      setHydricAnchor(anchor);
      setCulture(cultureData as Culture | null);
      setSoil(operationalSoil);
      setSoilLayers(operationalLayers);
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
    return () => { cancelled = true; };
  }, [selectedPivotId, supabase]);

  // Sequenciamento: só o cálculo mais recente pode escrever no estado, evitando
  // que um cálculo lento com entradas antigas sobrescreva o resultado correto
  // ao trocar de pivô.
  const calcTokenRef = useRef(0);

  // Calculate balance
  const runCalculation = useCallback(async () => {
    if (!assignment || !culture || !soil || !dateStart || !dateEnd) return;
    // Só calcula quando as entradas já pertencem ao mesmo pivô/parcela — evita
    // disparar com a cultura/solo/parcela do pivô anterior ainda em memória.
    if (culture.id !== assignment.culture_id) return;
    if (assignment.pivot_id !== selectedPivotId) return;
    const token = ++calcTokenRef.current;
    const isStale = () => token !== calcTokenRef.current;
    setCalculating(true);
    setError("");
    setNotice("");
    setBalanceRows([]);

    try {
      const pivot = pivots.find((p) => p.id === selectedPivotId);
      if (!pivot) throw new Error("Pivô não encontrado");

      const legacyInitialValue = assignment.initial_soil_moisture_pct;
      const hasLegacyInitial = assignment.initial_moisture_is_cc === true
        || (legacyInitialValue != null && Number.isFinite(Number(legacyInitialValue)));
      // Modelo Irriger/FAO-56: sem âncora datada nem condição inicial cadastrada,
      // assume o perfil na capacidade de campo (depleção zero) no início do
      // ciclo e calcula — não bloqueia. O usuário pode registrar uma condição
      // medida a qualquer momento para sobrescrever a suposição.
      const assumeFieldCapacity = !hydricAnchor && !hasLegacyInitial;
      const calculationStart = hydricAnchor
        ? addDaysIso(hydricAnchor.effectiveDate, 1)
        : (assignment.management_start_date ?? assignment.planting_date);
      if (calculationStart > dateEnd) {
        throw new Error("Balanço bloqueado: a condição inicial é posterior ao período selecionado.");
      }

      // Kc AUTOMÁTICO do cadastro: usa a curva de Kc ATIVA (cultivar → cultura),
      // interpolada por DAE. Sem curva ativa, o motor mantém o Kc das fases
      // (comportamento anterior preservado).
      const effectiveVarietyId = assignment.culture_variety_id ?? assignment.variety_id;
      let kcPoints: { x: number; y: number }[] | null = null;
      {
        const findActive = (byCultivar: boolean) => {
          let q = supabase
            .from("kc_curves")
            .select("id")
            .eq("culture_id", assignment.culture_id)
            .eq("active_for_calculation", true)
            .eq("axis_type", "DAE")
            .limit(1);
          q = byCultivar && effectiveVarietyId ? q.eq("cultivar_id", effectiveVarietyId) : q.is("cultivar_id", null);
          return q.maybeSingle();
        };
        let activeCurveId: string | null = null;
        if (effectiveVarietyId) {
          const { data } = await findActive(true);
          activeCurveId = (data as { id: string } | null)?.id ?? null;
        }
        if (!activeCurveId) {
          const { data } = await findActive(false);
          activeCurveId = (data as { id: string } | null)?.id ?? null;
        }
        if (activeCurveId) {
          const { data: anch } = await supabase
            .from("kc_anchor_points")
            .select("x_value,kc_value")
            .eq("curve_id", activeCurveId)
            .order("sequence_no");
          const pts = ((anch ?? []) as { x_value: number; kc_value: number }[])
            .map((r) => ({ x: r.x_value, y: r.kc_value }));
          if (pts.length >= 2) kcPoints = pts;
        }
      }
      if (isStale()) return;

      // Monta o Kc por data a partir da curva (mesma base de DAE do motor).
      const daeRefMs = new Date(`${resolveDaeReferenceDate(assignment)}T00:00:00Z`).getTime();
      const agronomicByDate: Record<string, { kc: number }> = {};
      if (kcPoints) {
        for (const d of datesInRange(calculationStart, addDaysIso(dateEnd, 30))) {
          const ms = new Date(`${d}T00:00:00Z`).getTime();
          const dae = Math.max(0, Math.floor((ms - daeRefMs) / 86400000));
          agronomicByDate[d] = { kc: calculateDailyKc(kcPoints, dae) };
        }
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

      // O dia corrente (e dias muito recentes) pode ainda não ter ETo fechada.
      // Em vez de bloquear tudo, calcula até o ÚLTIMO dia com dado disponível e
      // apara o rabo faltante. Buraco NO MEIO da série ainda bloqueia (evita
      // omitir ganhos/perdas de um dia sem dado no meio do balanço).
      const fmtBr = (iso: string) => iso.split("-").reverse().join("/");
      const rangeDates = datesInRange(calculationStart, dateEnd);
      const availableDates = rangeDates.filter((date) => weatherByDate[date]);
      if (availableDates.length === 0) {
        throw new Error(
          "Balanço bloqueado: nenhum dia do período tem ETo disponível. Rode a sincronização climática.",
        );
      }
      const effectiveEnd = availableDates[availableDates.length - 1];
      const internalMissing = datesInRange(calculationStart, effectiveEnd)
        .filter((date) => !weatherByDate[date]);
      if (internalMissing.length > 0) {
        const sample = internalMissing.slice(0, 3).join(", ");
        throw new Error(
          `Balanço bloqueado: ${internalMissing.length} dia(s) sem ETo no meio do período (${sample}${internalMissing.length > 3 ? ", …" : ""}). Rode a sincronização climática.`,
        );
      }
      // Só aparar o rabo se o último dado for RECENTE. Se a sincronização está
      // atrasada dias/semanas, não usar um dado velho como se fosse atual —
      // bloqueia e pede sincronização (evita "recomendação de hoje" defasada).
      const todayIso = new Date().toISOString().slice(0, 10);
      const targetEnd = dateEnd < todayIso ? dateEnd : todayIso;
      const MAX_TAIL_LAG_DAYS = 2;
      const lagDays = Math.max(
        0,
        Math.round((Date.parse(`${targetEnd}T12:00:00Z`) - Date.parse(`${effectiveEnd}T12:00:00Z`)) / 86400000),
      );
      if (lagDays > MAX_TAIL_LAG_DAYS) {
        throw new Error(
          `Balanço bloqueado: sincronização climática atrasada — último dado em ${fmtBr(effectiveEnd)}. Rode a sincronização climática para atualizar.`,
        );
      }
      const tailTrimmed = effectiveEnd < targetEnd;
      if (tailTrimmed && !isStale()) {
        setNotice(
          `Balanço calculado até ${fmtBr(effectiveEnd)} — os dias mais recentes ainda não têm dado climático fechado.`,
        );
      }

      // 5. Motor central do balanço hídrico (fonte única de cálculo)
      const engineWeatherByDate: Record<string, { et0: number; precipitation: number }> = {};
      for (const [d, w] of Object.entries(weatherByDate)) {
        engineWeatherByDate[d] = { et0: w.et0, precipitation: w.precip };
      }

      const engineInput = {
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
          availabilityGroup: cropGroupByName(culture.name),
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
        agronomicByDate,
        dateStart: calculationStart,
        dateEnd: effectiveEnd,
      };

      const series = computePivotBalanceSeries(engineInput);
      if (series.length === 0) {
        throw new Error("Balanço bloqueado: valide condição inicial, solo, fases/Kc e eficiência de aplicação.");
      }
      const rows: DailyBalanceRow[] = series.filter((d) => d.date >= dateStart).map(mapBalanceDay);

      // 6. Projeção pela previsão — roda o MESMO motor sobre os dias FUTUROS,
      // usando a previsão (somente ETo calculada aprovada; nunca et0_source) como
      // clima e sem irrigação futura. Assim Kc/fase/raiz/AFD/Ks/chuva efetiva
      // vêm do motor por data, e não de parâmetros congelados do último dia.
      let projRows: DailyBalanceRow[] = [];
      try {
        // Seleção da previsão por PRIORIDADE DE PROVEDOR (precipitação forecast:
        // open_meteo → meteoblue, CLIMATE_SPECIFICATION §prioridades), não pela
        // estação observada — que pode ser Davis/INMET/in-field, sem previsão.
        const { data: fcData } = await supabase
          .from("weather_forecasts")
          .select("target_date, issued_at, et0_calculated, precipitation, provider")
          .eq("farm_id", activeFarmId!)
          .gt("target_date", effectiveEnd)
          .order("issued_at", { ascending: false });
        const providerRank = (p: string | null) => {
          const k = (p ?? "").toLowerCase().replace(/[^a-z]/g, "");
          return k.includes("openmeteo") ? 0 : k.includes("meteoblue") ? 1 : 2;
        };
        const FORECAST_FRESH_MS = 24 * 3600 * 1000; // forecast além de 24h = stale (spec)
        const now = Date.now();
        // Por data: linha COMPLETA (ETo calculada E chuva válidas), FRESCA (<24h),
        // do melhor provedor; empate de provedor resolve pela emissão mais nova
        // (linhas já vêm issued_at desc). ETo sempre calculada; nunca et0_source.
        const byDate = new Map<string, { et0: number; precip: number; rank: number }>();
        for (const row of (fcData ?? []) as Array<{ target_date: string; issued_at: string; et0_calculated: number | null; precipitation: number | null; provider: string | null }>) {
          const et0 = row.et0_calculated;
          if (et0 == null || !Number.isFinite(Number(et0)) || Number(et0) < 0) continue;
          if (row.precipitation == null || !Number.isFinite(Number(row.precipitation)) || Number(row.precipitation) < 0) continue;
          const issued = Date.parse(row.issued_at);
          if (!Number.isFinite(issued) || now - issued > FORECAST_FRESH_MS) continue; // descarta previsão velha
          const rank = providerRank(row.provider);
          const cur = byDate.get(row.target_date);
          if (!cur || rank < cur.rank) byDate.set(row.target_date, { et0: Number(et0), precip: Number(row.precipitation), rank });
        }
        const projWeather: Record<string, { et0: number; precipitation: number }> = { ...engineWeatherByDate };
        let cursor = addDaysIso(effectiveEnd, 1);
        let lastForecastDate = effectiveEnd;
        for (let i = 0; i < 8; i += 1) {
          const w = byDate.get(cursor);
          if (!w) break; // lacuna encerra o prefixo contíguo (não projeta com buraco).
          projWeather[cursor] = { et0: w.et0, precipitation: w.precip };
          lastForecastDate = cursor;
          cursor = addDaysIso(cursor, 1);
        }
        if (lastForecastDate > effectiveEnd) {
          // Cenário "sem irrigação": remove eventos de irrigação posteriores ao
          // último dia observado — a projeção não deve aplicar irrigação futura
          // (as barras da previsão são zero e o rótulo diz "sem irrigação").
          const projIrrigation = Object.fromEntries(
            Object.entries(irrigationByDate).filter(([d]) => d <= effectiveEnd),
          );
          const projSeries = computePivotBalanceSeries({ ...engineInput, weatherByDate: projWeather, irrigationByDate: projIrrigation, dateEnd: lastForecastDate });
          projRows = projSeries.filter((d) => d.date > effectiveEnd).map(mapBalanceDay);
        }
      } catch {
        projRows = [];
      }

      if (isStale()) return;
      setBalanceRows(rows);
      setProjectionRows(projRows);
    } catch (err) {
      if (isStale()) return;
      setBalanceRows([]);
      setProjectionRows([]);
      setError(err instanceof Error ? err.message : "Erro ao calcular balanço");
    } finally {
      if (!isStale()) setCalculating(false);
    }
  }, [assignment, culture, soil, soilLayers, phases, hydricAnchor, dateStart, dateEnd, selectedPivotId, pivots, activeFarmId, supabase]);

  // Trocar de pivô invalida imediatamente qualquer cálculo em voo (o token
  // avança) e limpa a tela — evita que o resultado do pivô anterior apareça
  // sob o cabeçalho do novo antes do recálculo.
  useEffect(() => {
    calcTokenRef.current += 1;
    setBalanceRows([]);
    setProjectionRows([]);
    setCalculating(false); // o run invalidado não limpa a flag; evita travar em "Calculando…"
    setError("");
    setNotice("");
  }, [selectedPivotId]);

  // O balanço corrente é sempre recalculado de entradas confiáveis; histórico
  // persistido não é usado como estado atual nem como seed do ARM.
  useEffect(() => {
    setBalanceRows([]);
    setProjectionRows([]);
    setNotice("");
  }, [assignment?.id, dateStart, dateEnd]);

  // Cockpit: o balanço é recalculado automaticamente quando as entradas do pivô
  // selecionado estão prontas — sem exigir clique em "Calcular".
  useEffect(() => {
    if (assignment && culture && soil && dateStart && dateEnd) {
      void runCalculation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, culture?.id, soil?.id, dateStart, dateEnd, soilLayers.length, phases.length, hydricAnchor?.effectiveDate]);

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
      setLancMsg("Irrigação lançada com sucesso. Atualizando o balanço...");
      setLancDepth("");
      setLancHours("");
      setLancNotes("");
      // Recalcula o cockpit E o estado hídrico da fazenda (KPIs do topo) para
      // refletir o novo ARM/recomendação — o botão "Calcular" foi removido.
      void runCalculation();
      refreshFarm();
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
  // Área sob a parcela ativa (setor/planted_area), não o pivô inteiro — reusa o
  // cálculo do estado hídrico da fazenda.
  const parcelArea = farmStates.find((s) => s.parcelId === assignment?.id)?.area ?? selPivot?.area ?? null;
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

  const farmName = farms.find((f) => f.id === activeFarmId)?.name ?? null;
  const lastRow = balanceRows[balanceRows.length - 1] ?? null;
  const lastUpdate = trace.lastSync
    ? `${fmtDia(trace.lastSync.slice(0, 10))} ${trace.lastSync.slice(11, 16)}`
    : lastRow ? fmtDia(lastRow.date) : null;
  const showInitialNotice = (assignment?.initial_moisture_is_cc === true
    || (assignment?.initial_soil_moisture_pct != null && Number.isFinite(Number(assignment?.initial_soil_moisture_pct))));

  return (
    <div className="space-y-4">
      {/* Cabeçalho — central de decisão */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-graphite-900 dark:text-white">Balanço Hídrico</h1>
          <p className="text-[12.5px] text-graphite-400 dark:text-gray-500">Central de decisão do manejo de irrigação</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <HeaderChip label="Fazenda" value={farmName ?? "—"} />
          <HeaderChip label="Safra" value={seasonName ?? "—"} />
          <HeaderChip label="Cultura" value={culture?.name ?? "—"} />
          <div className="min-w-[150px]">
            <Select
              label="Pivô"
              value={selectedPivotId}
              onChange={(e) => setSelectedPivotId(e.target.value)}
              options={pivots.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          {lastUpdate && (
            <div className="pb-1 text-right">
              <p className="text-[10px] font-medium text-graphite-400 dark:text-gray-500">Última atualização</p>
              <p className="text-[12px] font-semibold text-graphite-700 dark:text-gray-200">{lastUpdate}</p>
            </div>
          )}
        </div>
      </div>

      {/* Navegação principal do manejo — cada aba tem função própria. */}
      {selectedPivotId && assignment && (
        <div className="rounded-2xl border border-gray-100 bg-white px-3 pt-1 dark:border-white/[0.06] dark:bg-graphite-900">
          <Tabs tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as typeof activeTab)} />
        </div>
      )}

      {/* Mensagens de estado */}
      {(pivotsLoading || pivotLoadError || (pivots.length === 0 && pivotsLoadedFarmId === activeFarmId) || (!assignment && selectedPivotId && !pivotsLoading) || error || (notice && !error) || (assignment && !hydricAnchor)) && (
        <div className="space-y-2">
          {pivotsLoading && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Carregando pivôs com parcela ativa...</p>}
          {pivotLoadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{pivotLoadError}</p>}
          {activeFarmId && pivotsLoadedFarmId === activeFarmId && pivots.length === 0 && !pivotLoadError && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Nenhum pivô com parcela ativa nesta fazenda.</p>}
          {!assignment && selectedPivotId && !pivotsLoading && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">A parcela deste pivô deixou de estar ativa. Atualize a seleção.</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
          {notice && !error && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{notice}</p>}
          {assignment && !hydricAnchor && (
            showInitialForm ? (
              <HydricInitialConditionForm
                farmId={activeFarmId}
                assignmentId={assignment.id}
                defaultDate={assignment.management_start_date ?? assignment.planting_date}
                onSaved={(anchor) => {
                  setHydricAnchor(anchor);
                  setShowInitialForm(false);
                  setBalanceRows([]);
                  setError("");
                  setDateStart(addDaysIso(anchor.effectiveDate, 1));
                }}
              />
            ) : (
              <p className="text-[11px] text-graphite-400 dark:text-gray-500">
                {showInitialNotice ? "Condição inicial: valor cadastrado na parcela. " : "Condição inicial assumida como capacidade de campo no início do ciclo. "}
                <button type="button" onClick={() => setShowInitialForm(true)} className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">Definir condição inicial</button>
              </p>
            )
          )}
        </div>
      )}

      {/* ── ABA DADOS: o que aconteceu e a condição hídrica atual.
          O gráfico é EXCLUSIVAMENTE histórico e termina no dia atual. ── */}
      {activeTab === "dados" && selectedPivotId && assignment && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Período (termina sempre hoje)</span>
            {([7, 15, 30, 60, "safra"] as const).map((p) => (
              <button key={String(p)} type="button" onClick={() => applyPeriod(p)} disabled={p === "safra" && !assignment?.planting_date}
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-40 ${activePeriod === p ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-900/20 dark:text-brand-300" : "border-gray-200 bg-white text-graphite-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]"}`}>
                {p === "safra" ? "Ciclo" : `${p}d`}
              </button>
            ))}
          </div>
          {balanceRows.length > 0 ? (
            <>
              <Cockpit
                rows={balanceRows}
                summary={summary}
                projection={projectionRows}
                soilLayers={soilLayers}
                identity={{
                  pivotName: selPivot?.name ?? null,
                  cultureName: culture?.name ?? null,
                  varietyName,
                  seasonName,
                  stage: assignment?.crop_stage ?? null,
                  area: parcelArea,
                  efficiency: selPivot ? ((selPivot.application_efficiency ?? selPivot.efficiency) * 100) : null,
                }}
                sensoryByDate={sensoryByDate}
                onShowDetail={() => setActiveTab("decisao")}
                mode="dados"
              />
              <details className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-graphite-900">
                <summary className="cursor-pointer select-none text-[13px] font-bold text-graphite-900 dark:text-white">
                  Tabela detalhada do balanço <span className="ml-1 text-[11px] font-normal text-graphite-400 dark:text-gray-500">— auditoria dia a dia, com origem de cada dado</span>
                </summary>
                <div className="mt-3">
                  <BalanceTab
                    panel="dados"
                    rows={balanceRows}
                    summary={summary}
                    loading={loading || calculating}
                    head={centroHead}
                    weatherByDate={weatherByDate}
                    sensoryByDate={sensoryByDate}
                  />
                </div>
              </details>
            </>
          ) : (calculating || loading) ? (
            <Card className="flex items-center justify-center gap-3 py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
              <span className="text-sm text-graphite-400 dark:text-gray-500">Calculando balanço...</span>
            </Card>
          ) : !error ? (
            <Card className="py-14 text-center">
              <p className="text-graphite-500 dark:text-gray-400">Sem dados suficientes para o balanço deste pivô. Verifique o clima e a condição inicial.</p>
            </Card>
          ) : null}
        </div>
      )}

      {/* ── ABA DECISÃO: transforma o estado atual em recomendação operacional.
          Não repete o gráfico; a previsão vive só aqui, nunca no histórico. ── */}
      {activeTab === "decisao" && selectedPivotId && assignment && (
        <div className="space-y-3">
          <BalanceTab
            panel="decisao"
            rows={balanceRows}
            summary={summary}
            loading={loading || calculating}
            head={centroHead}
            weatherByDate={weatherByDate}
            sensoryByDate={sensoryByDate}
          />
          {balanceRows.length > 0 && (
            <DecisionForecast projection={projectionRows} last={balanceRows[balanceRows.length - 1]} />
          )}
          {balanceRows.length > 0 && (
            <details className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-graphite-900">
              <summary className="cursor-pointer select-none text-[13px] font-bold text-graphite-900 dark:text-white">
                Registrar irrigação realizada <span className="ml-1 text-[11px] font-normal text-graphite-400 dark:text-gray-500">— só após execução ela entra no histórico (aba DADOS)</span>
              </summary>
              <div className="mt-3">
                <LancamentoTab
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
                    if (pivot && Number.isFinite(n) && n > 0) setLancHours(String(deriveOperatingHours(n, pivot.area, pivot.flow_rate)));
                  }}
                  onHoursChange={setLancHours}
                  onNotesChange={setLancNotes}
                  onSave={handleLancamento}
                />
              </div>
            </details>
          )}
        </div>
      )}

    </div>
  );
}

// ── Clima de apoio à decisão (NUNCA entra no gráfico/histórico) ──────────────
// Previsão só orienta a decisão operacional; só o evento realizado entra no
// balanço (aba DADOS). Dado ausente permanece indisponível.
function DecisionForecast({ projection, last }: { projection: DailyBalanceRow[]; last: DailyBalanceRow }) {
  const future = projection.filter((p) => p.date > last.date);
  if (future.length === 0) return null;
  const byOffset = (days: number) =>
    future.filter((p) => daysBetweenIso(last.date, p.date) <= days);
  const rain24 = byOffset(1).reduce((a, p) => a + (p.precipitation ?? 0), 0);
  const rain48 = byOffset(2).reduce((a, p) => a + (p.precipitation ?? 0), 0);
  const etoDays = future.filter((p) => Number.isFinite(p.et0));
  const etoAvg = etoDays.length > 0 ? etoDays.reduce((a, p) => a + p.et0, 0) / etoDays.length : null;
  const cell = (label: string, value: string, sub: string) => (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="mt-0.5 text-[18px] font-extrabold tabular-nums text-graphite-900 dark:text-white">{value}</p>
      <p className="text-[10.5px] text-graphite-400 dark:text-gray-500">{sub}</p>
    </div>
  );
  return (
    <Card className="p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-graphite-900 dark:text-white"><IconCloud /> Clima de apoio à decisão</p>
      <p className="mb-3 text-[11px] text-graphite-400 dark:text-gray-500">Previsão meteorológica — apoia a decisão, mas <strong>não</strong> altera o histórico nem o gráfico. Só a chuva/irrigação realizada entra no balanço.</p>
      <div className="grid grid-cols-3 gap-2.5">
        {cell("Chuva prev. 24 h", `${rain24.toFixed(1)} mm`, "próximas 24 h")}
        {cell("Chuva prev. 48 h", `${rain48.toFixed(1)} mm`, "próximas 48 h")}
        {cell("ETo esperada", etoAvg != null ? `${etoAvg.toFixed(1)} mm/d` : "indisponível", "média prevista")}
      </div>
    </Card>
  );
}

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="max-w-[140px] truncate text-[12.5px] font-bold text-graphite-800 dark:text-white">{value}</p>
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
    const headers = ["Data", "Fase", "Kc", "Ks", "KL", "ETo", "ETcPot", "ETc", "Ky", "Risco", "Chuva", "ChuvaEf", "Irrigacao", "Ief", "Entradas", "Saidas", "Saldo", "DTA", "CRA", "ARM", "SegMm", "PctCC", "Sensorial", "Deplecao%", "Deficit", "LaminaRec", "Status"];
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
    { header: "Ks", render: (r) => (r.ks ?? 1).toFixed(2) },
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
    { header: "DTA", render: (r) => r.cad.toFixed(1) },
    { header: "CRA", render: (r) => r.afd.toFixed(1) },
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
    const accEtc = rows.reduce((a, r) => a + r.etc, 0);
    const accEto = rows.reduce((a, r) => a + r.et0, 0);
    const accRain = rows.reduce((a, r) => a + r.precipitation, 0);
    const accErain = rows.reduce((a, r) => a + r.effectivePrecipitation, 0);
    const accIrr = rows.reduce((a, r) => a + r.irrigationApplied, 0);
    const defNow = last?.deficit ?? 0;
    const kpis: { label: string; value: string; tone: string }[] = [
      { label: "ETc acumulada", value: `${accEtc.toFixed(1)} mm`, tone: "text-amber-600 dark:text-amber-400" },
      { label: "ETo acumulada", value: `${accEto.toFixed(1)} mm`, tone: "text-graphite-700 dark:text-gray-200" },
      { label: "Chuva", value: `${accRain.toFixed(1)} mm`, tone: "text-blue-600 dark:text-blue-400" },
      { label: "Chuva efetiva", value: `${accErain.toFixed(1)} mm`, tone: "text-sky-600 dark:text-sky-400" },
      { label: "Irrigação", value: `${accIrr.toFixed(1)} mm`, tone: "text-cyan-600 dark:text-cyan-400" },
      { label: "Déficit atual", value: `${defNow.toFixed(1)} mm`, tone: defNow > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400" },
      { label: "Umidade atual", value: `${pctCc.toFixed(0)}% da CC`, tone: "text-graphite-800 dark:text-white" },
    ];
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
        {/* Valores acumulados (estilo iCrop) */}
        <div className="grid grid-cols-2 gap-px border-b border-gray-100 bg-gray-100 sm:grid-cols-4 lg:grid-cols-7 dark:border-white/[0.06] dark:bg-white/[0.06]">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white px-4 py-2.5 dark:bg-graphite-900">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{k.label}</p>
              <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums ${k.tone}`}>{k.value}</p>
            </div>
          ))}
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
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-brand-300">
              {last?.date === new Date().toISOString().slice(0, 10)
                ? "Recomendação de hoje"
                : `Recomendação · situação de ${fmtDia(last?.date ?? "")}`}
            </p>
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
              ? "O ARM está abaixo da umidade de segurança (DTA − CRA) e a demanda (ETc) supera as entradas recentes."
              : urgency?.daysToAfd != null
                ? `O ARM está dentro da faixa segura. Mantida a demanda atual e sem chuva/irrigação, a CRA seria atingida em aproximadamente ${urgency.daysToAfd.toFixed(1)} dia(s).`
                : "O ARM está dentro da faixa segura; as entradas cobrem a demanda atual."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { l: "ARM atual", v: `${arm.toFixed(1)} mm` },
              { l: "DTA / CRA", v: `${cad.toFixed(1)} / ${afd.toFixed(1)} mm` },
              { l: "Umidade de segurança", v: `${safetyMm.toFixed(1)} mm` },
              { l: "% da CC", v: `${pctCc.toFixed(0)}%` },
              { l: "Déficit atual", v: `${(last?.deficit ?? 0).toFixed(1)} mm` },
              { l: "CRA consumida", v: urgency ? `${urgency.afdUsedPct.toFixed(0)}%` : "—" },
              { l: "Margem até CRA", v: urgency ? (urgency.atOrBeyondAfd ? "limite atingido" : `${urgency.remainingToAfdMm.toFixed(1)} mm`) : "—" },
              { l: "Dias até CRA", v: daysToAfdLabel },
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
            if (urgency && !urgency.atOrBeyondAfd && urgency.daysToAfd != null && urgency.daysToAfd <= 2) items.push({ sev: "md", title: "Limite de manejo próximo", desc: `Restam ${urgency.remainingToAfdMm.toFixed(1)} mm até a CRA; na demanda atual, cerca de ${urgency.daysToAfd.toFixed(1)} dia(s).` });
            if ((last?.surplus ?? 0) > 0) items.push({ sev: "md", title: "Possível excesso / drenagem", desc: `Excedente de ${(last?.surplus ?? 0).toFixed(1)} mm acima da capacidade de campo.` });
            if (summary.daysInCritical > 0) items.push({ sev: "hi", title: `${summary.daysInCritical} dia(s) em déficit crítico`, desc: "No período analisado houve dias em déficit crítico." });
            if (items.length === 0) items.push({ sev: "lo", title: "Tudo dentro do esperado", desc: urgency && urgency.daysToAfd != null ? `Sem alerta ativo. Janela estimada até a CRA: ${urgency.daysToAfd.toFixed(1)} dia(s).` : "Nenhum alerta ativo para o pivô no período." });
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

      {/* 2 · Situação atual (DTA / CRA / ARM / segurança — unidades explícitas) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">ARM</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{arm.toFixed(1)}<span className="text-[14px] text-graphite-400"> mm</span> <span className="text-[14px] font-bold text-graphite-400">· {pctCc.toFixed(0)}% da CC</span></p>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-gray-100 dark:bg-white/[0.06]"><div className="h-full rounded" style={{ width: `${clampN(pctCc, 0, 100)}%`, background: classificacao.color }} /></div>
          <span className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tendencia.down ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400" : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"}`}>{tendencia.down ? "▼" : "▲"} {tendencia.label}</span>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">DTA / CRA</p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{cad.toFixed(1)}<span className="text-[14px] text-graphite-400"> mm</span></p>
          <p className="mt-2.5 text-[11.5px] tabular-nums text-graphite-400 dark:text-gray-500">CRA {afd.toFixed(1)} mm · p {cad > 0 ? (afd / cad).toFixed(2) : "—"}</p>
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
            {classificacao.label === "Adequado" ? "ARM acima da umidade de segurança." : classificacao.label === "Atenção" ? "Próximo do limite DTA − CRA." : "Déficit relevante — repor a água do solo."}
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
              l: "Janela até CRA",
              v: daysToAfdLabel,
              sub: urgency
                ? urgency.atOrBeyondAfd
                  ? "CRA já atingida"
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
        <span>ETc <strong className="font-semibold text-graphite-800 dark:text-white">ETo × Kc × KL × Ks</strong></span>
        <span>Ks <strong className="font-semibold text-graphite-800 dark:text-white">FAO-56 (Dr vs CRA)</strong></span>
        <span>Ky <strong className="font-semibold text-graphite-800 dark:text-white">risco produtivo, não lâmina</strong></span>
        <span>Chuva efetiva <strong className="font-semibold text-graphite-800 dark:text-white">{PE_METHOD}</strong></span>
        <span>Balanço <strong className="font-semibold text-graphite-800 dark:text-white">{ARM_FORMULA}</strong></span>
        <span>Unidades <strong className="font-semibold text-graphite-800 dark:text-white">DTA/CRA/ARM mm · % da CC volumétrico</strong></span>
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

// ── Cockpit (central de decisão) ─────────────────────────────────────────

const fmtNum = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");

function StatCard({ icon, label, value, unit, tone }: { icon: ReactNode; label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 dark:border-white/[0.06] dark:bg-graphite-900">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-graphite-500 dark:bg-white/[0.05] dark:text-gray-400">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-graphite-400 dark:text-gray-500">{label}</p>
        <p className={`text-[18px] font-extrabold leading-tight tabular-nums ${tone ?? "text-graphite-900 dark:text-white"}`}>{value}{unit && <span className="ml-0.5 text-[12px] font-semibold text-graphite-400 dark:text-gray-500">{unit}</span>}</p>
      </div>
    </div>
  );
}

// KPIs de toda a fazenda (topo do cockpit).
function FarmKpiRow({ summary, states, loading }: { summary: ReturnType<typeof useFarmHydricState>["summary"]; states: ReturnType<typeof useFarmHydricState>["states"]; loading: boolean }) {
  // O caminho de fazenda vazia retorna um resumo zerado (não-nulo); summary
  // nulo sem loading indica FALHA de carga — não deve virar "tudo zero", que
  // pareceria uma fazenda saudável sem demanda e suprimiria a ação do operador.
  const failed = !loading && summary === null;
  const withData = states.filter((s) => s.current && s.current.status !== "cinza");
  const etcMedia = withData.length ? withData.reduce((a, s) => a + (s.current!.etc ?? 0), 0) / withData.length : null;
  // Contagens/áreas derivadas dos estados (uma linha por parcela/setor):
  // - pivôs para irrigar contam EQUIPAMENTOS distintos, não parcelas;
  // - "área em manejo" inclui parcelas sem dado hídrico (mas operacionais);
  // - "área crítica" é só o status vermelho (amarelo é atenção, não crítico).
  const distinctPivots = new Set(states.map((s) => s.pivotId)).size;
  const managedArea = states.reduce((a, s) => a + (s.area ?? 0), 0);
  const pivotsNeeding = new Set(states.filter((s) => s.current?.shouldIrrigate).map((s) => s.pivotId)).size;
  const criticalArea = states.filter((s) => s.current?.status === "vermelho").reduce((a, s) => a + (s.area ?? 0), 0);
  const items = [
    { icon: <IconDrop />, label: "Pivôs ativos", value: String(summary?.totalPivots ?? distinctPivots) },
    { icon: <IconArea />, label: "Área em manejo", value: fmtInt(managedArea), unit: "ha" },
    { icon: <IconDrop />, label: "ETc média hoje", value: etcMedia != null ? fmtNum(etcMedia) : "—", unit: "mm" },
    { icon: <IconWave />, label: "Déficit médio", value: summary ? fmtNum(summary.avgDeficit) : "—", unit: "mm", tone: summary && summary.avgDeficit > 0 ? "text-orange-600 dark:text-orange-400" : undefined },
    { icon: <IconGear />, label: "Pivôs para irrigar", value: String(pivotsNeeding), tone: pivotsNeeding > 0 ? "text-blue-600 dark:text-blue-400" : undefined },
    { icon: <IconAlert />, label: "Área crítica", value: fmtInt(criticalArea), unit: "ha", tone: criticalArea > 0 ? "text-red-600 dark:text-red-400" : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => (
        <StatCard key={k.label} icon={k.icon} label={k.label} value={loading ? "…" : failed ? "—" : k.value} unit={failed ? undefined : k.unit} tone={failed ? "text-graphite-300 dark:text-gray-600" : k.tone} />
      ))}
    </div>
  );
}

interface CockpitIdentity {
  pivotName: string | null;
  cultureName: string | null;
  varietyName: string | null;
  seasonName: string | null;
  stage: string | null;
  area: number | null;
  efficiency: number | null;
}

function daysBetweenIso(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

// Constrói as séries do cockpit a partir do balanço observado (rows) e da
// projeção já calculada PELO MOTOR sobre dias futuros (projection). Todas as
// grandezas por data — Kc, fase, raiz, CAD/AFD, Ks, chuva efetiva — vêm do
// motor; aqui só se organiza para exibição.
function buildCockpitSeries(rows: DailyBalanceRow[], projection: DailyBalanceRow[]) {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const cad = last.cad;
  const afd = last.afd;
  const pmpMm = Math.max((last.wiltingPoint ?? 0) * (last.rootDepth ?? 0) * 1000, 0);
  const ccMm = pmpMm + cad;
  const safetyArm = Math.max(cad - afd, 0);          // ARM no limite de manejo (déficit = AFD → status vermelho)
  const attentionArm = Math.max(cad - afd * 0.7, 0); // ARM na fronteira ótima/alerta (déficit = 0,7·AFD → amarelo)
  const safetyMm = pmpMm + safetyArm;
  const attentionMm = pmpMm + attentionArm;

  // Projeção só cobre dias após o último observado (garantido no cálculo).
  const future = projection.filter((p) => p.date > last.date);
  const armPmpMm = (r: DailyBalanceRow) => Math.max((r.wiltingPoint ?? 0) * (r.rootDepth ?? 0) * 1000, 0);

  // Reservatório: histórico recente (absoluto) + projeção (absoluto por dia).
  const hist = rows.slice(-16);
  const reservatorio: ReservatorioPoint[] = hist.map((r) => ({
    label: fmtDia(r.date),
    storageAbs: r.storedWater + armPmpMm(r),
    moisturePctCc: moisturePctCcForDisplay(r.moisturePctCc, r.storedWater, r.cad),
    ccAbs: armPmpMm(r) + r.cad,
    safetyAbs: armPmpMm(r) + Math.max(r.cad - r.afd, 0),
    pmpAbs: armPmpMm(r),
    attentionAbs: armPmpMm(r) + Math.max(r.cad - r.afd * 0.7, 0),
    rain: r.effectivePrecipitation,
    irr: r.effectiveIrrigation ?? r.irrigationApplied,
    eto: r.et0,
    kc: r.kc,
    isForecast: false,
  }));
  // REGRA ABSOLUTA: o gráfico é EXCLUSIVAMENTE histórico e termina no dia atual.
  // Nenhum ponto de projeção/previsão entra nas séries — o último ponto já
  // representa o estado atual do pivô. A análise futura vive na aba DECISÃO.
  const todayIndexReserv = -1;
  const crossIndexReserv = -1;

  // Entradas e consumo: últimos 14 dias observados (sem previsão no gráfico).
  const histE = rows.slice(-14);
  const entradas: EntradaConsumoPoint[] = histE.map((r) => ({
    label: fmtDia(r.date),
    chuvaEf: r.effectivePrecipitation,
    irrig: r.effectiveIrrigation ?? r.irrigationApplied,
    etc: r.etc,
    eto: r.et0,
    kc: r.kc,
    phase: r.phase,
    isForecast: false,
  }));
  const todayIndexEntradas = -1; // sem linha "HOJE": o último ponto já é o dia atual

  // Tabela de projeção (APENAS aba DECISÃO — nunca plotada no gráfico):
  // Hoje (último observado) + offsets desejados por data.
  // A cor de cada linha vem do status do motor daquele dia (limiares por data),
  // não de uma comparação contra CAD/AFD do último dia observado.
  const projByOffset = new Map<number, DailyBalanceRow>();
  for (const p of future) projByOffset.set(daysBetweenIso(last.date, p.date), p);
  const wanted = [1, 2, 3, 5, 7];
  type ProjRow = { date: string; arm: number; offset: number; status: WaterStatus; cad: number };
  const projTable: ProjRow[] = [
    { date: last.date, arm: last.storedWater, offset: 0, status: last.waterStatus, cad: last.cad },
    ...wanted.map((d) => { const r = projByOffset.get(d); return r ? { date: r.date, arm: r.storedWater, offset: d, status: r.waterStatus, cad: r.cad } : null; })
      .filter((p): p is ProjRow => p != null),
  ];

  return { entradas, todayIndexEntradas, reservatorio, todayIndexReserv, crossIndexReserv, projTable, future, ccMm, pmpMm, safetyMm, attentionMm, safetyArm, attentionArm, cad, afd, hasForecast: future.length > 0 };
}

function Cockpit({
  rows,
  summary,
  projection,
  soilLayers,
  identity,
  sensoryByDate,
  onShowDetail,
  mode = "dados",
}: {
  rows: DailyBalanceRow[];
  summary: ReturnType<typeof calculateSummary>;
  projection: DailyBalanceRow[];
  soilLayers: SoilProfileLayer[];
  identity: CockpitIdentity;
  sensoryByDate: Record<string, number>;
  onShowDetail: () => void;
  /** "dados" = só histórico + condição atual (sem recomendação/projeção, que
   *  vivem na aba DECISÃO). "full" mantém o cockpit completo. */
  mode?: "dados" | "full";
}) {
  const series = useMemo(() => buildCockpitSeries(rows, projection), [rows, projection]);

  // Variáveis exibidas em cada gráfico — o usuário inclui/remove séries (estilo
  // Scheduling) e a escolha persiste por navegador.
  const [entradasVis, setEntradasVis] = useState<Record<EntradaSeriesKey, boolean>>(defaultEntradasVisible);
  const [reservVis, setReservVis] = useState<Record<ReservSeriesKey, boolean>>(defaultReservatorioVisible);
  // Escala do gráfico de reservatório: "pct" = % da água disponível (PMP=0,
  // CC=100, estilo Scheduling); "mm" = ARM em milímetros absolutos.
  const [reservUnit, setReservUnit] = useState<"pct" | "mm">("pct");
  useEffect(() => {
    try {
      const e = window.localStorage.getItem("bh:entradasVis");
      if (e) setEntradasVis((prev) => ({ ...prev, ...JSON.parse(e) }));
      const r = window.localStorage.getItem("bh:reservVis");
      if (r) setReservVis((prev) => ({ ...prev, ...JSON.parse(r) }));
      const u = window.localStorage.getItem("bh:reservUnit");
      if (u === "pct" || u === "mm") setReservUnit(u);
    } catch {
      // localStorage indisponível — mantém os padrões.
    }
  }, []);
  const changeReservUnit = useCallback((u: "pct" | "mm") => {
    setReservUnit(u);
    try { window.localStorage.setItem("bh:reservUnit", u); } catch { /* noop */ }
  }, []);
  const toggleEntrada = useCallback((k: EntradaSeriesKey) => {
    setEntradasVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { window.localStorage.setItem("bh:entradasVis", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);
  const toggleReserv = useCallback((k: ReservSeriesKey) => {
    setReservVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { window.localStorage.setItem("bh:reservVis", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const last = rows[rows.length - 1];
  if (!last || !series) return null;

  const cad = last.cad;
  const afd = last.afd;
  const arm = last.storedWater;
  const pctCc = moisturePctCcForDisplay(last.moisturePctCc, arm, cad);
  const urgency = calculateManagementUrgency({ afd: last.afd, deficit: last.deficit, etcPotential: last.etcPotential ?? last.etc });
  const verdict = VERDICT[last.waterStatus];
  const irrigar = verdict.irrigar;
  const grossDepth = last.grossDepth;
  const netDepth = last.netDepth;
  // Eficiência exibida = a realmente usada no cálculo da lâmina (líquida/bruta),
  // que já respeita o override da parcela em modo personalizado.
  const efPct = grossDepth > 0 ? (netDepth / grossDepth) * 100 : (identity.efficiency ?? 0);
  const priority = last.waterStatus === "deficit_critico" || last.waterStatus === "deficit"
    ? { label: "Prioridade Alta", short: "PRIORIDADE ALTA", color: "#dc2626" }
    : last.waterStatus === "atencao"
      ? { label: "Prioridade Média", short: "PRIORIDADE MÉDIA", color: "#f97316" }
      : { label: "Prioridade Baixa", short: "PRIORIDADE BAIXA", color: "#16a34a" };

  const daysToAfdLabel = urgency.atOrBeyondAfd
    ? "limite atingido"
    : urgency.daysToAfd == null
      ? "sem demanda"
      : urgency.daysToAfd < 1 ? "< 1 dia" : `${fmtNum(urgency.daysToAfd)} dias`;

  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday = last.date === todayIso;

  // nota sensorial mais recente
  const sensoryEntries = Object.entries(sensoryByDate).sort((a, b) => b[0].localeCompare(a[0]));
  const latestSensory = sensoryEntries[0] ?? null;

  // alertas
  const alerts: { sev: "hi" | "md" | "lo"; text: string }[] = [];
  const pivotLabel = identity.pivotName ?? "Pivô";
  if (urgency.atOrBeyondAfd) {
    alerts.push({ sev: "hi", text: `${pivotLabel} atingiu o limite de manejo.` });
  } else if (series.future.length > 0) {
    // Com previsão: a data de cruzamento vem da PROJEÇÃO do motor (considera
    // chuva prevista), não da estimativa de demanda constante da urgência.
    const firstRed = series.future.find((p) => p.waterStatus === "deficit_critico");
    if (firstRed) alerts.push({ sev: "md", text: `${pivotLabel} atingirá o limite de manejo em ~${daysBetweenIso(last.date, firstRed.date)} dia(s) (projeção).` });
  } else if (urgency.daysToAfd != null && urgency.daysToAfd <= 2.5) {
    // Sem previsão: estimativa por demanda atual (sem chuva) — deixado explícito.
    alerts.push({ sev: "md", text: `${pivotLabel} atingirá o limite de manejo em ${fmtNum(urgency.daysToAfd)} dia(s) (demanda atual, sem chuva).` });
  }
  // Chuva efetiva prevista dos dias GENUINAMENTE futuros (mesma base da projeção).
  const rainForecast = series.future.reduce((a, p) => a + (p.effectivePrecipitation ?? 0), 0);
  if (series.future.length > 0 && rainForecast < 5) alerts.push({ sev: "md", text: "Sem chuva efetiva relevante prevista para os próximos dias." });
  if ((last.ky ?? 0) >= 1) alerts.push({ sev: "md", text: "Fase reprodutiva com alta sensibilidade ao déficit (Ky ≥ 1)." });
  if ((last.surplus ?? 0) > 0) alerts.push({ sev: "md", text: `Excedente de ${fmtNum(last.surplus)} mm acima da capacidade de campo.` });
  if (alerts.length === 0) alerts.push({ sev: "lo", text: "Nenhum alerta ativo para o pivô no período." });
  const sevDot = { hi: "bg-red-500", md: "bg-orange-500", lo: "bg-brand-500" } as const;

  const kySens = last.ky == null ? null : last.ky >= 1.15 ? "MUITO ALTA" : last.ky >= 1 ? "ALTA" : last.ky >= 0.85 ? "MÉDIA" : "BAIXA";
  const kySensColor = last.ky == null ? undefined : last.ky >= 1 ? "text-red-600 dark:text-red-400" : last.ky >= 0.85 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400";

  const rootCm = Math.max(last.rootDepth * 100, 0);
  const profileRows = soilLayers.map((layer) => {
    const thicknessCm = Math.max(layer.depth_end - layer.depth_start, 0);
    const cadLayer = Math.max((layer.field_capacity - layer.wilting_point) * (thicknessCm / 100) * 1000, 0);
    const exploredCm = Math.max(Math.min(rootCm, layer.depth_end) - layer.depth_start, 0);
    const exploredPct = thicknessCm > 0 ? clampN((exploredCm / thicknessCm) * 100, 0, 100) : 0;
    const cadEffective = cadLayer * (exploredPct / 100);
    return { layer, cadLayer, exploredPct, cadEffective };
  });
  const ctaProfile = profileRows.reduce((sum, row) => sum + row.cadLayer, 0);
  const pFactor = cad > 0 ? afd / cad : 0;

  const topKpis = [
    { icon: <IconSun />, label: "ETo hoje", value: fmtNum(last.et0), unit: "mm" },
    { icon: <IconLeaf />, label: "Kc", value: fmtNum(last.kc, 2) },
    { icon: <IconWave />, label: "ETc potencial", value: fmtNum(last.etcPotential ?? last.etc), unit: "mm" },
    { icon: <IconSprout />, label: "Ks", value: fmtNum(last.ks ?? 1, 2) },
    { icon: <IconDrop />, label: "ARM", value: fmtNum(arm), unit: "mm" },
    { icon: <IconLayers />, label: "DTA", value: fmtNum(cad), unit: "mm" },
    { icon: <IconAlert />, label: "CRA", value: fmtNum(afd), unit: "mm" },
    { icon: <IconLeaf />, label: "p", value: fmtNum(pFactor, 2) },
    { icon: <IconRoot />, label: "Raiz efetiva", value: fmtNum(last.rootDepth, 2), unit: "m" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-9">
        {topKpis.map((k) => (
          <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} unit={k.unit} />
        ))}
      </div>

      {/* Cabeçalho do pivô selecionado */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[17px] font-extrabold text-graphite-900 dark:text-white">{identity.pivotName ?? "Pivô"}</span>
          {[identity.cultureName, identity.varietyName, last.phase ?? identity.stage, identity.area != null ? `${fmtNum(identity.area, 0)} ha` : null, last.dae != null ? `${last.dae} DAE` : null]
            .filter(Boolean)
            .map((chip, i) => (
              <span key={i} className="text-[12.5px] text-graphite-500 dark:text-gray-400"><span className="mx-1 text-graphite-300 dark:text-gray-600">•</span>{chip}</span>
            ))}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: priority.color, background: `${priority.color}1a` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: priority.color }} />{priority.short}
          </span>
        </div>
      </Card>

      {/* Gráficos + coluna de decisão */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <div className="mb-2">
              <p className="text-[13px] font-bold text-graphite-900 dark:text-white">Entradas e Consumo</p>
              <p className="text-[11px] text-graphite-400 dark:text-gray-500">Chuva, irrigação, ETo, ETc e curva de Kc · histórico até hoje ({Math.min(rows.length, 14)} dias) · sem previsão no gráfico</p>
            </div>
            <div className="mb-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-graphite-400 dark:text-gray-500">Variáveis do gráfico</p>
              <CockpitSeriesToggles series={ENTRADAS_SERIES} visible={entradasVis} onToggle={toggleEntrada} />
            </div>
            <div className="h-[270px] w-full"><EntradasConsumoChart points={series.entradas} todayIndex={series.hasForecast ? series.todayIndexEntradas : -1} visible={entradasVis} /></div>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold text-graphite-900 dark:text-white">Reservatório de Água do Solo</p>
                <p className="text-[11px] text-graphite-400 dark:text-gray-500">
                  {reservUnit === "pct"
                    ? "Umidade, CC e segurança em % da água disponível (PMP = 0%, CC = 100%) · histórico até hoje"
                    : "ARM em mm, umidade do solo (θ/θCC) e segurança calculada por CRA = p × DTA · histórico até hoje"}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5 rounded-lg bg-gray-100/70 p-0.5 dark:bg-white/[0.04]">
                {(["pct", "mm"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => changeReservUnit(u)}
                    aria-pressed={reservUnit === u}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${reservUnit === u ? "bg-white text-graphite-800 shadow-xs dark:bg-white/[0.1] dark:text-white" : "text-graphite-400 hover:text-graphite-600 dark:text-gray-500"}`}
                  >
                    {u === "pct" ? "% da CC" : "mm"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-graphite-400 dark:text-gray-500">Variáveis do gráfico</p>
              <CockpitSeriesToggles
                series={reservUnit === "pct" ? RESERVATORIO_SERIES.filter((s) => s.k !== "arm") : RESERVATORIO_SERIES}
                visible={reservVis}
                onToggle={toggleReserv}
              />
            </div>
            <div className="h-[360px] w-full"><ReservatorioChart points={series.reservatorio} ccMm={series.ccMm} pmpMm={series.pmpMm} safetyMm={series.safetyMm} attentionMm={series.attentionMm} visible={reservVis} unit={reservUnit} /></div>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Recomendação de hoje — só no cockpit completo; na arquitetura de
              duas abas isto pertence à aba DECISÃO. */}
          {mode === "full" && (
          <>
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-graphite-900 dark:text-white"><IconLeaf /> {isToday ? "Recomendação de Hoje" : `Situação de ${fmtDia(last.date)}`}</p>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: priority.color, background: `${priority.color}1a` }}>{priority.label}</span>
            </div>
            <div className="p-4">
              <div className="flex items-end justify-between">
                <p className="text-[34px] font-extrabold leading-none" style={{ color: irrigar ? "#16a34a" : "#64748b" }}>{irrigar ? `${fmtNum(grossDepth)}` : "0"}<span className="ml-1 text-[16px] font-bold">mm</span></p>
                <span className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold text-graphite-500 dark:bg-white/[0.05] dark:text-gray-400">Janela: {irrigar ? (isToday ? "Hoje" : fmtDia(last.date)) : "—"}</span>
              </div>
              {irrigar ? (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  {[
                    { l: "Lâmina líquida", v: `${fmtNum(netDepth)} mm` },
                    { l: "Eficiência do pivô", v: `${Math.round(efPct)}%` },
                    { l: "Lâmina bruta", v: `${fmtNum(grossDepth)} mm` },
                    { l: "Tempo estimado", v: last.irrigationTime > 0 ? `${fmtNum(last.irrigationTime)} h` : "—" },
                  ].map((r) => (
                    <div key={r.l}>
                      <p className="text-[10.5px] text-graphite-400 dark:text-gray-500">{r.l}</p>
                      <p className="font-bold text-graphite-800 dark:text-white">{r.v}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-[12px] leading-relaxed text-graphite-500 dark:text-gray-400">{verdict.texto(`${fmtNum(grossDepth)} mm`)}</p>
              <div className="mt-3.5 space-y-2">
                <Link href="/programacao" className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-green-700">
                  Programar irrigação <span aria-hidden>→</span>
                </Link>
                <button type="button" onClick={onShowDetail} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-[12.5px] font-semibold text-graphite-600 transition-colors hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.05]">
                  Ver memória de cálculo
                </button>
              </div>
            </div>
          </Card>

          {/* Projeção hídrica */}
          <Card className="p-4">
            <p className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold text-graphite-900 dark:text-white"><IconBars /> Projeção Hídrica <span className="font-normal text-graphite-400 dark:text-gray-500">(sem irrigação)</span></p>
            {series.projTable.length <= 1 ? (
              <p className="text-[12px] text-graphite-400 dark:text-gray-500">Sem previsão climática disponível para projetar o ARM.</p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">
                  <span>Dia</span><span>Data</span><span className="text-right">ARM (mm)</span>
                </div>
                {series.projTable.map((p) => {
                  const pct = p.cad > 0 ? clampN((p.arm / p.cad) * 100, 0, 100) : 0;
                  // Cor = status do motor daquele dia (limiares por data), não
                  // uma comparação contra CAD/AFD do último dia observado.
                  const col = p.status === "ideal" || p.status === "saturado" ? "#16a34a" : p.status === "atencao" ? "#eab308" : "#dc2626";
                  return (
                    <div key={p.offset} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[12px]">
                      <span className="w-8 font-semibold text-graphite-600 dark:text-gray-300">{p.offset === 0 ? "Hoje" : `+${p.offset}`}</span>
                      <span className="flex items-center gap-2 text-graphite-400 dark:text-gray-500">
                        <span className="tabular-nums">{fmtDia(p.date)}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: col }} /></span>
                      </span>
                      <span className="text-right font-bold tabular-nums text-graphite-800 dark:text-white">{fmtNum(p.arm)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          </>
          )}


          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-graphite-900 dark:text-white"><IconRoot /> Perfil explorado pela raiz</p>
              <span className="text-[10.5px] font-semibold text-graphite-400 dark:text-gray-500">Zr {fmtNum(last.rootDepth, 2)} m</span>
            </div>
            {profileRows.length > 0 ? (
              <>
                <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-white/[0.06]">
                  <div className="grid grid-cols-[1.1fr_.8fr_.8fr_.9fr] gap-2 bg-gray-50 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:bg-white/[0.03] dark:text-gray-500">
                    <span>Camada</span><span>DTA</span><span>Explorada</span><span>DTA efetiva</span>
                  </div>
                  {profileRows.map((row) => (
                    <div key={`${row.layer.depth_start}-${row.layer.depth_end}`} className="grid grid-cols-[1.1fr_.8fr_.8fr_.9fr] gap-2 border-t border-gray-100 px-2.5 py-2 text-[11.5px] tabular-nums text-graphite-600 dark:border-white/[0.05] dark:text-gray-300">
                      <span className="font-semibold">{row.layer.depth_start}–{row.layer.depth_end} cm</span>
                      <span>{fmtNum(row.cadLayer)} mm</span>
                      <span>{fmtNum(row.exploredPct, 0)}%</span>
                      <span className="font-bold text-graphite-900 dark:text-white">{fmtNum(row.cadEffective)} mm</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                  <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/[0.03]"><p className="text-graphite-400 dark:text-gray-500">DTA perfil completo</p><p className="mt-0.5 font-extrabold text-graphite-900 dark:text-white">{fmtNum(ctaProfile)} mm</p></div>
                  <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/[0.03]"><p className="text-graphite-400 dark:text-gray-500">DTA efetiva hoje</p><p className="mt-0.5 font-extrabold text-graphite-900 dark:text-white">{fmtNum(cad)} mm</p></div>
                  <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/[0.03]"><p className="text-graphite-400 dark:text-gray-500">Fator p</p><p className="mt-0.5 font-extrabold text-graphite-900 dark:text-white">{fmtNum(pFactor, 2)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-white/[0.03]"><p className="text-graphite-400 dark:text-gray-500">CRA</p><p className="mt-0.5 font-extrabold text-graphite-900 dark:text-white">{fmtNum(afd)} mm</p></div>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-graphite-400 dark:text-gray-500">DTA por camada = (CC − PMP) × espessura. A DTA efetiva considera somente a fração já explorada pela raiz.</p>
              </>
            ) : (
              <p className="text-[12px] text-graphite-400 dark:text-gray-500">Perfil por camadas não cadastrado para este pivô.</p>
            )}
          </Card>

          {/* Nota de umidade de campo + Alertas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-graphite-900 dark:text-white"><IconDrop /> Nota de Umidade de Campo</p>
              {latestSensory ? (
                <div className="flex items-center gap-3">
                  <div className="relative flex h-14 w-14 items-center justify-center">
                    <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-gray-100 dark:stroke-white/[0.08]" />
                      <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeLinecap="round" stroke={Number(latestSensory[1]) >= 7 ? "#16a34a" : Number(latestSensory[1]) >= 4 ? "#eab308" : "#dc2626"} strokeDasharray={`${(Number(latestSensory[1]) / 10) * 97.4} 97.4`} />
                    </svg>
                    <span className="absolute text-[13px] font-extrabold text-graphite-900 dark:text-white">{latestSensory[1]}<span className="text-[9px] text-graphite-400">/10</span></span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-graphite-400 dark:text-gray-500">{fmtDia(latestSensory[0])}</p>
                    <p className="text-[12px] font-semibold text-graphite-700 dark:text-gray-200">{Number(latestSensory[1]) >= 7 ? "Solo úmido" : Number(latestSensory[1]) >= 4 ? "Umidade intermediária" : "Solo seco"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-graphite-400 dark:text-gray-500">Sem leitura sensorial registrada no período.</p>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-graphite-900 dark:text-white"><IconAlert /> Alertas Inteligentes</p>
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sevDot[a.sev]}`} />
                    <p className="text-[12px] leading-snug text-graphite-600 dark:text-gray-300">{a.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>


    </div>
  );
}

// ── Ícones (inline, leves) ───────────────────────────────────────────────
const svgP = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, viewBox: "0 0 24 24", className: "h-4 w-4" } as const;
function IconDrop() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" /></svg>; }
function IconArea() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function IconWave() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8c2 0 2 2 4.5 2S10 8 12 8s2 2 4.5 2S19 8 21 8M3 15c2 0 2 2 4.5 2S10 15 12 15s2 2 4.5 2S19 15 21 15" /></svg>; }
function IconGear() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 2h-5l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L3 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h5l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5c.07-.3.1-.66.1-1z" /></svg>; }
function IconAlert() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a1 1 0 00.9 1.5h18.6a1 1 0 00.9-1.5L13.7 3.9a1 1 0 00-1.7 0z" /></svg>; }
function IconSun() { return <svg {...svgP}><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>; }
function IconLeaf() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M4 20s0-8 8-8 8-8 8-8-1 16-9 16c-4 0-7-3-7-7 0 0 3-2 6-2" /></svg>; }
function IconSprout() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M12 22V12m0 0C12 8 8 6 4 6c0 4 4 6 8 6zm0 0c0-3 3-5 7-5 0 3-3 5-7 5z" /></svg>; }
function IconLayers() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 5-9 5-9-5 9-5zm9 9l-9 5-9-5m18 4l-9 5-9-5" /></svg>; }
function IconRoot() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v8m0 0c0 3-3 4-3 7m3-7c0 3 3 4 3 7M9 21h6" /></svg>; }
function IconBars() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10m5 10V4m5 16v-7m5 7V8" /></svg>; }
function IconCloud() { return <svg {...svgP}><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 014-4 5 5 0 019.9 1H17a3 3 0 010 6H6a3 3 0 01-3-3z" /></svg>; }

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
