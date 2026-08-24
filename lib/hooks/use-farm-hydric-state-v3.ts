"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  computeFarmHydricState,
  computePivotCurrentState,
  HYDRIC_ENGINE_VERSION,
  type EngineWeatherDay,
  type FarmHydricSummary,
  type PivotHydricState,
} from "@/modules/water-balance/services";
import { type CulturePhase } from "@/modules/culture/services";
import { mapDbLayersToProfile, type SoilProfileLayer } from "@/modules/soil/services";
import { resolvePivotMapGeometry, sumGrossDepthByDate } from "@/modules/irrigation/services";
import { parcelManagedAreaHa } from "@/modules/assignment/services/parcel-geometry";

interface FarmHydricState {
  states: PivotHydricState[];
  summary: FarmHydricSummary | null;
  loading: boolean;
  refresh: () => void;
}

interface HydricAnchor {
  effectiveDate: string;
  source: "measured" | "field_capacity_confirmed";
  moistureValue: number | null;
  moistureUnit: "field_capacity_fraction" | "weight_pct" | "volume_pct";
  isFieldCapacity: boolean;
}

interface PersistedDualSeed {
  date: string;
  storage: number;
  cad: number;
  surfaceDepletion: number;
}

type StartReference =
  | { kind: "anchor"; dateStart: string; anchor: HydricAnchor }
  | { kind: "prior_v3_dual"; dateStart: string; seed: PersistedDualSeed }
  | { kind: "assignment_initial"; dateStart: string };

const DISPLAY_WINDOW_DAYS = 30;
const MAX_RECOVERY_LOOKBACK_DAYS = 60;

function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(start: string, end: string): number {
  return Math.floor((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86400000);
}
function minIso(values: string[]): string { return [...values].sort()[0]; }

/** Estado hídrico operacional V3 (FAO-56 Kc dual). */
export function useFarmHydricState(): FarmHydricState {
  const { activeFarmId, loading: authLoading } = useAuth();
  const [states, setStates] = useState<PivotHydricState[]>([]);
  const [summary, setSummary] = useState<FarmHydricSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setStates([]); setSummary(null); setLoading(false); return;
    }

    setLoading(true);
    const dateEnd = isoToday();
    const displayStart = addDays(dateEnd, -(DISPLAY_WINDOW_DAYS - 1));
    const oldestRecoveryDate = addDays(dateEnd, -(MAX_RECOVERY_LOOKBACK_DAYS - 1));

    try {
      const { data: pivotRows, error: pivotError } = await supabase
        .from("pivots")
        .select("id,name,area,flow_rate,efficiency,application_efficiency,latitude,longitude,soil_id,radius,last_tower_radius,overhang_m")
        .eq("farm_id", activeFarmId).eq("active", true).order("name");
      if (pivotError) throw pivotError;
      const pivots = pivotRows ?? [];
      const pivotIds = pivots.map((p) => p.id as string);
      if (pivotIds.length === 0) {
        setStates([]); setSummary(computeFarmHydricState([])); return;
      }

      const pivotSoilMap = new Map(pivots.map((p) => [p.id as string, (p.soil_id as string | null) ?? null]));
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("pivot_crop_assignments").select("*").in("pivot_id", pivotIds)
        .eq("active", true).or("status.is.null,status.eq.ativa").lte("planting_date", dateEnd).order("created_at", { ascending: false });
      if (assignmentError) throw assignmentError;

      const assignmentsByPivot = new Map<string, Array<Record<string, unknown>>>();
      for (const row of assignmentRows ?? []) {
        const start = ((row.management_start_date as string | null) ?? (row.planting_date as string));
        if (!start || start > dateEnd) continue;
        const list = assignmentsByPivot.get(row.pivot_id as string) ?? [];
        list.push(row as Record<string, unknown>);
        assignmentsByPivot.set(row.pivot_id as string, list);
      }

      const assignments = Array.from(assignmentsByPivot.values()).flat();
      const assignmentIds = assignments.map((a) => a.id as string);
      const cultureIds = Array.from(new Set(assignments.map((a) => a.culture_id as string).filter(Boolean)));
      const soilIds = Array.from(new Set([
        ...(Array.from(pivotSoilMap.values()).filter(Boolean) as string[]),
        ...assignments.map((a) => a.soil_id as string).filter(Boolean),
      ]));
      const seasonIds = Array.from(new Set(assignments.map((a) => a.season_id as string).filter(Boolean)));
      const varietyIds = Array.from(new Set(assignments.map((a) => a.culture_variety_id as string).filter(Boolean)));

      const [culturesRes, phasesRes, soilsRes, layersRes, seasonsRes, varietiesRes, stationsRes, seedRes, anchorsRes] = await Promise.all([
        cultureIds.length ? supabase.from("cultures").select("id,name,root_depth,depletion_factor,kl,ks_function,ky,coefficient_method,kcb_reference_source").in("id", cultureIds) : Promise.resolve({ data: [] }),
        cultureIds.length ? supabase.from("culture_phases").select("*").in("culture_id", cultureIds).order("phase_order") : Promise.resolve({ data: [] }),
        soilIds.length ? supabase.from("soils").select("id,name,texture,field_capacity,wilting_point,bulk_density,effective_depth,evaporation_layer_depth_m,readily_evaporable_water_mm").in("id", soilIds) : Promise.resolve({ data: [] }),
        soilIds.length ? supabase.from("soil_layers").select("soil_id,depth_start,depth_end,field_capacity,wilting_point,bulk_density,kl").in("soil_id", soilIds).order("depth_start") : Promise.resolve({ data: [] }),
        seasonIds.length ? supabase.from("seasons").select("id,name").in("id", seasonIds) : Promise.resolve({ data: [] }),
        varietyIds.length ? supabase.from("culture_varieties").select("id,name").in("id", varietyIds) : Promise.resolve({ data: [] }),
        supabase.from("weather_stations").select("id").eq("farm_id", activeFarmId).eq("active", true),
        assignmentIds.length ? supabase.from("water_balances_dual")
          .select("pivot_crop_assignment_id,date,soil_storage,cad,surface_depletion_mm,engine_version")
          .in("pivot_crop_assignment_id", assignmentIds).eq("engine_version", HYDRIC_ENGINE_VERSION)
          .lt("date", displayStart).gte("date", addDays(oldestRecoveryDate, -1)).order("date", { ascending: false }) : Promise.resolve({ data: [] }),
        assignmentIds.length ? supabase.from("hydric_initial_conditions")
          .select("pivot_crop_assignment_id,effective_date,source,moisture_value,moisture_unit,is_field_capacity")
          .in("pivot_crop_assignment_id", assignmentIds).lte("effective_date", dateEnd).order("effective_date", { ascending: false }) : Promise.resolve({ data: [] }),
      ]);

      const latestSeedByAssignment = new Map<string, PersistedDualSeed>();
      for (const row of seedRes.data ?? []) {
        const id = row.pivot_crop_assignment_id as string;
        if (latestSeedByAssignment.has(id)) continue;
        const storage = Number(row.soil_storage), cad = Number(row.cad), surface = Number(row.surface_depletion_mm);
        if (!Number.isFinite(storage) || !Number.isFinite(cad) || cad <= 0 || storage < 0 || storage > cad || !Number.isFinite(surface) || surface < 0) continue;
        latestSeedByAssignment.set(id, { date: row.date as string, storage, cad, surfaceDepletion: surface });
      }

      const latestAnchorByAssignment = new Map<string, HydricAnchor>();
      for (const row of anchorsRes.data ?? []) {
        const id = row.pivot_crop_assignment_id as string;
        if (latestAnchorByAssignment.has(id)) continue;
        const source = row.source as HydricAnchor["source"];
        const unit = row.moisture_unit as HydricAnchor["moistureUnit"];
        if (source !== "measured" && source !== "field_capacity_confirmed") continue;
        latestAnchorByAssignment.set(id, {
          effectiveDate: row.effective_date as string,
          source,
          moistureValue: row.moisture_value == null ? null : Number(row.moisture_value),
          moistureUnit: unit,
          isFieldCapacity: row.is_field_capacity === true,
        });
      }

      const startReferenceByAssignment = new Map<string, StartReference>();
      for (const a of assignments) {
        const id = a.id as string;
        const managementStart = ((a.management_start_date as string | null) ?? (a.planting_date as string));
        const anchor = latestAnchorByAssignment.get(id) ?? null;
        const seed = latestSeedByAssignment.get(id) ?? null;

        if (anchor && (!seed || anchor.effectiveDate >= seed.date)) {
          const nextDate = addDays(anchor.effectiveDate, 1);
          if (nextDate <= dateEnd) startReferenceByAssignment.set(id, { kind: "anchor", dateStart: nextDate, anchor });
          continue;
        }
        if (seed) {
          const nextDate = addDays(seed.date, 1);
          if (nextDate <= dateEnd) startReferenceByAssignment.set(id, { kind: "prior_v3_dual", dateStart: nextDate, seed });
          continue;
        }
        if (managementStart >= displayStart) {
          startReferenceByAssignment.set(id, { kind: "assignment_initial", dateStart: managementStart });
        }
      }

      const candidateStarts = Array.from(startReferenceByAssignment.values())
        .map((ref) => ref.dateStart)
        .filter((d) => daysBetween(d, dateEnd) < MAX_RECOVERY_LOOKBACK_DAYS);
      const dataStart = candidateStarts.length ? minIso([displayStart, ...candidateStarts]) : displayStart;

      const stationIds = (stationsRes.data ?? []).map((s: { id: string }) => s.id);
      const weatherByDate: Record<string, EngineWeatherDay> = {};
      if (stationIds.length) {
        const [selectionRes, readingsRes] = await Promise.all([
          supabase.from("weather_daily_selection").select("date,selected_reading_id,operational_approved")
            .eq("farm_id", activeFarmId).eq("operational_approved", true).gte("date", dataStart).lte("date", dateEnd),
          supabase.from("weather_readings").select("id,date,et0_calculated,precipitation,wind_speed,station_id")
            .in("station_id", stationIds).gte("date", dataStart).lte("date", dateEnd),
        ]);
        const readingsById = new Map((readingsRes.data ?? []).map((r) => [r.id as string, r]));
        for (const s of selectionRes.data ?? []) {
          if (!s.selected_reading_id || s.operational_approved !== true) continue;
          const r = readingsById.get(s.selected_reading_id as string); if (!r) continue;
          const et0 = Number(r.et0_calculated), precipitation = Number(r.precipitation);
          if (!Number.isFinite(et0) || et0 < 0 || !Number.isFinite(precipitation) || precipitation < 0) continue;
          const wind = r.wind_speed == null ? null : Number(r.wind_speed);
          weatherByDate[s.date as string] = {
            et0,
            precipitation,
            wind_speed_2m: Number.isFinite(wind) ? wind : null,
            // A tabela diária não armazena RHmin real. Não usamos umidade
            // média como substituto: o núcleo dual aplica a condição padrão
            // FAO-56 (u2=2 m/s; RHmin=45%) quando o par climático não é completo.
            rh_min: null,
          };
        }
      }

      const { data: manualRainRows, error: manualRainError } = await supabase.from("manual_rainfall_entries")
        .select("date,precipitation_mm").eq("farm_id", activeFarmId).gte("date", dataStart).lte("date", dateEnd);
      if (manualRainError) throw manualRainError;
      for (const row of manualRainRows ?? []) {
        const existing = weatherByDate[row.date as string]; const p = Number(row.precipitation_mm);
        if (existing && Number.isFinite(p) && p >= 0) weatherByDate[row.date as string] = { ...existing, precipitation: p };
      }

      const { data: irrRows, error: irrError } = await supabase.from("irrigation_events")
        .select("pivot_id,started_at,depth_mm").in("pivot_id", pivotIds)
        .gte("started_at", `${dataStart}T00:00:00`).lte("started_at", `${dateEnd}T23:59:59`);
      if (irrError) throw irrError;
      const eventsByPivot = new Map<string, Array<{ started_at: string; depth_mm: number }>>();
      for (const e of irrRows ?? []) {
        const list = eventsByPivot.get(e.pivot_id as string) ?? [];
        list.push({ started_at: e.started_at as string, depth_mm: Number(e.depth_mm) || 0 });
        eventsByPivot.set(e.pivot_id as string, list);
      }
      const irrigationByPivot = new Map<string, Record<string, number>>();
      for (const [pid, list] of Array.from(eventsByPivot.entries())) irrigationByPivot.set(pid, sumGrossDepthByDate(list));

      const cultureMap = new Map((culturesRes.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c]));
      const soilMap = new Map((soilsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s]));
      const seasonMap = new Map((seasonsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s.name as string]));
      const varietyMap = new Map((varietiesRes.data ?? []).map((v: Record<string, unknown>) => [v.id as string, v.name as string]));
      const layersBySoil = new Map<string, SoilProfileLayer[]>();
      for (const row of (layersRes.data ?? []) as Array<{ soil_id:string; depth_start:number; depth_end:number; field_capacity:number; wilting_point:number; bulk_density:number|null; kl:number|null }>) {
        const list = layersBySoil.get(row.soil_id) ?? []; list.push(...mapDbLayersToProfile([row])); layersBySoil.set(row.soil_id, list);
      }
      const phasesByCulture = new Map<string, CulturePhase[]>();
      for (const phase of (phasesRes.data ?? []) as Array<CulturePhase & { culture_id: string }>) {
        const list = phasesByCulture.get(phase.culture_id) ?? []; list.push(phase); phasesByCulture.set(phase.culture_id, list);
      }

      const result: PivotHydricState[] = [];
      const pushIncomplete = (pivot: Record<string, unknown>, geometry: { radiusMeters:number|null; sheetIncomplete:boolean }, assignment?: Record<string, unknown>, cultureName="—", soilName:string|null=null) => {
        result.push({ pivotId:pivot.id as string, pivotName:pivot.name as string, cultureName, varietyName:null, seasonName:null,
          area:Number(pivot.area)||0, latitude:Number(pivot.latitude)||0, longitude:Number(pivot.longitude)||0,
          parcelId:assignment ? assignment.id as string : null, plantingDate:assignment ? (assignment.planting_date as string ?? null) : null,
          soilName, radiusMeters:geometry.radiusMeters, sheetIncomplete:geometry.sheetIncomplete,
          startAngleDeg:assignment ? (assignment.start_angle_deg as number|null ?? null) : null,
          endAngleDeg:assignment ? (assignment.end_angle_deg as number|null ?? null) : null,
          parcelName:assignment ? (assignment.name as string|null ?? null) : null, current:null, history:[] });
      };

      for (const pivot of pivots as Array<Record<string, unknown>>) {
        const geometry = resolvePivotMapGeometry({ radiusM:pivot.radius as number|null, lastTowerRadiusM:pivot.last_tower_radius as number|null, overhangM:pivot.overhang_m as number|null, latitude:pivot.latitude as number|null, longitude:pivot.longitude as number|null });
        const pivotAssignments = assignmentsByPivot.get(pivot.id as string) ?? [];
        if (!pivotAssignments.length) { pushIncomplete(pivot, geometry); continue; }

        for (const assignment of pivotAssignments) {
          const culture = cultureMap.get(assignment.culture_id as string) ?? null;
          const effectiveSoilId = pivotSoilMap.get(pivot.id as string) ?? ((assignment.soil_id as string) || null);
          const soil = effectiveSoilId ? soilMap.get(effectiveSoilId) : null;
          if (!culture || !soil || culture.coefficient_method !== "dual_fao56") {
            pushIncomplete(pivot, geometry, assignment, culture ? culture.name as string : "—", soil ? soil.name as string : null); continue;
          }

          const startRef = startReferenceByAssignment.get(assignment.id as string) ?? null;
          if (!startRef || daysBetween(startRef.dateStart, dateEnd) >= MAX_RECOVERY_LOOKBACK_DAYS) {
            pushIncomplete(pivot, geometry, assignment, culture.name as string, soil.name as string); continue;
          }

          const startAngleDeg = (assignment.start_angle_deg as number|null) ?? null;
          const endAngleDeg = (assignment.end_angle_deg as number|null) ?? null;
          const area = parcelManagedAreaHa(Number(pivot.area)||0, assignment.planted_area as number|null, startAngleDeg, endAngleDeg);
          const anchor = startRef.kind === "anchor" ? startRef.anchor : null;
          const seed = startRef.kind === "prior_v3_dual" ? startRef.seed : null;

          const state = computePivotCurrentState({
            pivotId:pivot.id as string, pivotName:pivot.name as string, cultureName:culture.name as string,
            varietyName:assignment.culture_variety_id ? varietyMap.get(assignment.culture_variety_id as string) ?? null : null,
            seasonName:assignment.season_id ? seasonMap.get(assignment.season_id as string) ?? null : null,
            area, latitude:Number(pivot.latitude)||0, longitude:Number(pivot.longitude)||0, parcelId:assignment.id as string,
            plantingDate:(assignment.planting_date as string) ?? null, soilName:soil.name as string, radiusMeters:geometry.radiusMeters,
            sheetIncomplete:geometry.sheetIncomplete, startAngleDeg, endAngleDeg, parcelName:(assignment.name as string|null) ?? null,
          }, {
            assignment: {
              id:assignment.id as string, planting_date:assignment.planting_date as string, emergence_date:(assignment.emergence_date as string|null) ?? null,
              parameter_mode:(assignment.parameter_mode as "padrao"|"personalizado") ?? "padrao", initial_root_depth:(assignment.initial_root_depth as number|null) ?? null,
              max_root_depth:(assignment.max_root_depth as number|null) ?? null, irrigation_efficiency:(assignment.irrigation_efficiency as number|null) ?? null,
              depletion_factor:(assignment.depletion_factor as number|null) ?? null, kl_override:(assignment.kl_override as number|null) ?? null,
              ks_function_override:(assignment.ks_function_override as string|null) ?? null,
              initial_soil_moisture_pct: anchor ? anchor.moistureValue : ((assignment.initial_soil_moisture_pct as number|null) ?? null),
              initial_moisture_unit: anchor ? anchor.moistureUnit : ((assignment.initial_moisture_unit as "field_capacity_fraction"|"weight_pct"|"volume_pct") ?? null),
              initial_moisture_is_cc: anchor ? anchor.isFieldCapacity : ((assignment.initial_moisture_is_cc as boolean|null) ?? null),
              deficit_irrigation:(assignment.deficit_irrigation as boolean) ?? false,
              stress_point_irrigation:(assignment.stress_point_irrigation as boolean) ?? false,
            },
            culture: { root_depth:Number(culture.root_depth)||0.3, depletion_factor:Number(culture.depletion_factor)||0.5, kl:culture.kl as number|null, ks_function:culture.ks_function as string|null, ky:culture.ky as number|null, coefficient_method:culture.coefficient_method as string, kcb_reference_source:culture.kcb_reference_source as string|null },
            phases: phasesByCulture.get(assignment.culture_id as string) ?? [],
            soil: { field_capacity:Number(soil.field_capacity), wilting_point:Number(soil.wilting_point), bulk_density:Number(soil.bulk_density), effective_depth:Number(soil.effective_depth)||0.6,
              texture:soil.texture as string|null, evaporation_layer_depth_m:soil.evaporation_layer_depth_m as number|null, readily_evaporable_water_mm:soil.readily_evaporable_water_mm as number|null,
              layers: effectiveSoilId ? layersBySoil.get(effectiveSoilId) ?? [] : [] },
            pivot: { application_efficiency:pivot.application_efficiency as number|null, efficiency:pivot.efficiency as number|null, area, flow_rate:Number(pivot.flow_rate)||0 },
            weatherByDate, irrigationByDate:irrigationByPivot.get(pivot.id as string) ?? {}, dateStart:startRef.dateStart, dateEnd,
            initialStorageMm:seed?.storage ?? null,
            initialCadMm:seed?.cad ?? null,
            initialSurfaceDepletionMm:seed?.surfaceDepletion ?? null,
          });

          if (state.history.length) {
            const initialConditionSource = startRef.kind === "anchor" ? `dated_${startRef.anchor.source}` : startRef.kind;
            const persisted = state.history.map((d) => ({
              pivot_crop_assignment_id:assignment.id as string, date:d.date, engine_version:HYDRIC_ENGINE_VERSION, dae:d.dae, phase:d.phase, et0:d.et0,
              coefficient_method:d.coefficientMethod, kcb_reference:d.kcbReference, kcb_adjusted:d.kcbAdjusted, kcb_source:d.kcbSource,
              climate_adjustment_source:d.climateAdjustmentSource, ke:d.ke, kc_max:d.kcMax, kr:d.kr,
              kc_effective_potential:d.kc, kc_effective_actual:d.kcAdjusted, ks:d.ks, kl:d.kl, etc_potential:d.etcPotential, etc:d.etc, etc_formula:d.etcFormula,
              precipitation:d.precipitation, effective_precipitation:d.effectivePrecipitation, irrigation:d.irrigation, effective_irrigation:d.effectiveIrrigation,
              root_depth:d.rootDepth, cad:d.adt, afd:d.afd, soil_storage:d.storage, deficit:d.deficit, depletion:d.depletion, surplus:d.surplus,
              field_capacity:d.fieldCapacity, wilting_point:d.wiltingPoint, canopy_cover_fraction:d.canopyCoverFraction, wetted_fraction:d.wettedFraction,
              exposed_wetted_fraction:d.exposedWettedFraction, surface_depletion_start_mm:d.surfaceDepletionStartMm, surface_depletion_mm:d.surfaceDepletionMm,
              tew_mm:d.tewMm, rew_mm:d.rewMm, evaporation_layer_depth_m:d.evaporationLayerDepthM, soil_evaporation_mm:d.soilEvaporationMm,
              should_irrigate:d.shouldIrrigate, recommended_net_depth:d.recommendedNetDepth, recommended_gross_depth:d.recommendedGrossDepth,
              recommended_volume:d.recommendedVolume, estimated_irrigation_time:d.estimatedIrrigationTime, recommendation_reason:d.recommendationReason,
              hydric_status:d.status, map_status:d.mapStatus, safety_moisture_mm:d.safetyMoistureMm, moisture_pct_cc:d.moisturePctCc,
              safety_pct_cc:d.safetyPctCc, ky:d.ky, yield_risk:d.yieldRisk, pe_formula:d.peFormula, balance_formula:d.balanceFormula,
              initial_condition_source:initialConditionSource, updated_at:new Date().toISOString(),
            }));
            const { error:persistError } = await supabase.from("water_balances_dual").upsert(persisted, { onConflict:"pivot_crop_assignment_id,date" });
            if (persistError) throw persistError;
          }
          result.push(state);
        }
      }

      setStates(result); setSummary(computeFarmHydricState(result));
    } catch (error) {
      console.error("Falha ao carregar estado hídrico dual V3", error); setStates([]); setSummary(null);
    } finally { setLoading(false); }
  }, [activeFarmId, supabase]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);
  return { states, summary, loading:authLoading || loading, refresh:load };
}
