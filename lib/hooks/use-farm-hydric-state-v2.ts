"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  computeFarmHydricState,
  computePivotCurrentState,
  type EngineWeatherDay,
  type FarmHydricSummary,
  type PivotHydricState,
  type InitialMoistureUnit,
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

type Anchor = {
  effectiveDate: string;
  source: "measured" | "field_capacity_confirmed";
  moistureValue: number | null;
  moistureUnit: InitialMoistureUnit;
  isFieldCapacity: boolean;
};

type IrrigationRow = {
  id: string;
  pivot_id: string;
  parcel_id: string | null;
  started_at: string;
  depth_mm: number | null;
};

const MAX_RECALC_DAYS = 365;

function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.floor((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000);
}

function minIso(values: string[]): string {
  return [...values].sort()[0];
}

function hasExactDuplicateEvents(rows: IrrigationRow[]): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const depth = Number(row.depth_mm);
    const key = `${row.pivot_id}|${row.parcel_id ?? "*"}|${row.started_at}|${Number.isFinite(depth) ? depth : "invalid"}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Estado hídrico operacional conservador.
 *
 * Regras de confiança:
 * - pivô sem parcela ativa não entra no mapa/manejo;
 * - condição inicial vem de hydric_initial_conditions ou do cadastro inicial
 *   explícito da parcela; nunca presume capacidade de campo;
 * - apenas clima daily_selection aprovado alimenta o motor;
 * - chuva manual pode substituir apenas a precipitação de um dia que já tenha
 *   ETo aprovada;
 * - evento de irrigação setorial respeita parcel_id;
 * - evento legado sem parcel_id só é aceito quando o pivô possui uma única
 *   parcela ativa; em pivô setorizado ele é ambíguo e bloqueia o cálculo;
 * - duplicata exata de irrigação bloqueia o cálculo em vez de somar duas vezes;
 * - não usa water_balances gravado no navegador como seed operacional.
 */
export function useFarmHydricState(): FarmHydricState {
  const { activeFarmId, loading: authLoading } = useAuth();
  const [states, setStates] = useState<PivotHydricState[]>([]);
  const [summary, setSummary] = useState<FarmHydricSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setStates([]);
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const dateEnd = todayLocalIso();

    try {
      const { data: pivotRows, error: pivotError } = await supabase
        .from("pivots")
        .select("id,name,area,flow_rate,efficiency,application_efficiency,latitude,longitude,soil_id,radius,last_tower_radius,overhang_m")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name");
      if (pivotError) throw pivotError;

      const pivots = (pivotRows ?? []) as Array<Record<string, unknown>>;
      const pivotIds = pivots.map((p) => p.id as string);
      if (pivotIds.length === 0) {
        setStates([]);
        setSummary(computeFarmHydricState([]));
        return;
      }

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("pivot_crop_assignments")
        .select("*")
        .in("pivot_id", pivotIds)
        .eq("active", true)
        .or("status.is.null,status.eq.ativa")
        .lte("planting_date", dateEnd)
        .order("created_at", { ascending: false });
      if (assignmentError) throw assignmentError;

      const assignmentsByPivot = new Map<string, Array<Record<string, unknown>>>();
      for (const raw of assignmentRows ?? []) {
        const row = raw as Record<string, unknown>;
        const managementStart = ((row.management_start_date as string | null) ?? (row.planting_date as string | null));
        if (!managementStart || managementStart > dateEnd) continue;
        const pid = row.pivot_id as string;
        const list = assignmentsByPivot.get(pid) ?? [];
        list.push(row);
        assignmentsByPivot.set(pid, list);
      }

      // Pivôs sem parcela ativa não pertencem ao estado operacional.
      const operationalPivots = pivots.filter((p) => (assignmentsByPivot.get(p.id as string)?.length ?? 0) > 0);
      const assignments = operationalPivots.flatMap((p) => assignmentsByPivot.get(p.id as string) ?? []);
      if (assignments.length === 0) {
        setStates([]);
        setSummary(computeFarmHydricState([]));
        return;
      }

      const assignmentIds = assignments.map((a) => a.id as string);
      const cultureIds = Array.from(new Set(assignments.map((a) => a.culture_id as string).filter(Boolean)));
      const pivotSoilIds = operationalPivots.map((p) => p.soil_id as string).filter(Boolean);
      const soilIds = Array.from(new Set([...pivotSoilIds, ...assignments.map((a) => a.soil_id as string).filter(Boolean)]));
      const seasonIds = Array.from(new Set(assignments.map((a) => a.season_id as string).filter(Boolean)));
      const varietyIds = Array.from(new Set(assignments.map((a) => a.culture_variety_id as string).filter(Boolean)));

      const [culturesRes, phasesRes, soilsRes, layersRes, seasonsRes, varietiesRes, stationsRes, anchorsRes] = await Promise.all([
        cultureIds.length ? supabase.from("cultures").select("id,name,root_depth,depletion_factor,kl,ks_function,ky").in("id", cultureIds) : Promise.resolve({ data: [] }),
        cultureIds.length ? supabase.from("culture_phases").select("*").in("culture_id", cultureIds).order("phase_order") : Promise.resolve({ data: [] }),
        soilIds.length ? supabase.from("soils").select("id,name,field_capacity,wilting_point,bulk_density,effective_depth").in("id", soilIds) : Promise.resolve({ data: [] }),
        soilIds.length ? supabase.from("soil_layers").select("soil_id,depth_start,depth_end,field_capacity,wilting_point,bulk_density,kl").in("soil_id", soilIds).order("depth_start") : Promise.resolve({ data: [] }),
        seasonIds.length ? supabase.from("seasons").select("id,name").in("id", seasonIds) : Promise.resolve({ data: [] }),
        varietyIds.length ? supabase.from("culture_varieties").select("id,name").in("id", varietyIds) : Promise.resolve({ data: [] }),
        supabase.from("weather_stations").select("id").eq("farm_id", activeFarmId).eq("active", true),
        supabase.from("hydric_initial_conditions")
          .select("pivot_crop_assignment_id,effective_date,source,moisture_value,moisture_unit,is_field_capacity")
          .in("pivot_crop_assignment_id", assignmentIds)
          .lte("effective_date", dateEnd)
          .order("effective_date", { ascending: false }),
      ]);

      const cultureMap = new Map((culturesRes.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c]));
      const soilMap = new Map((soilsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s]));
      const seasonMap = new Map((seasonsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s.name as string]));
      const varietyMap = new Map((varietiesRes.data ?? []).map((v: Record<string, unknown>) => [v.id as string, v.name as string]));

      const layersBySoil = new Map<string, SoilProfileLayer[]>();
      for (const row of (layersRes.data ?? []) as Array<{ soil_id:string; depth_start:number; depth_end:number; field_capacity:number; wilting_point:number; bulk_density:number|null; kl:number|null }>) {
        const list = layersBySoil.get(row.soil_id) ?? [];
        list.push(...mapDbLayersToProfile([row]));
        layersBySoil.set(row.soil_id, list);
      }

      const phasesByCulture = new Map<string, CulturePhase[]>();
      for (const phase of (phasesRes.data ?? []) as Array<CulturePhase & { culture_id: string }>) {
        const list = phasesByCulture.get(phase.culture_id) ?? [];
        list.push(phase);
        phasesByCulture.set(phase.culture_id, list);
      }

      const latestAnchorByAssignment = new Map<string, Anchor>();
      for (const raw of anchorsRes.data ?? []) {
        const row = raw as Record<string, unknown>;
        const id = row.pivot_crop_assignment_id as string;
        if (latestAnchorByAssignment.has(id)) continue;
        const source = row.source as Anchor["source"];
        const unit = row.moisture_unit as InitialMoistureUnit;
        if (source !== "measured" && source !== "field_capacity_confirmed") continue;
        if (!(["field_capacity_fraction", "weight_pct", "volume_pct"] as string[]).includes(unit)) continue;
        latestAnchorByAssignment.set(id, {
          effectiveDate: row.effective_date as string,
          source,
          moistureValue: row.moisture_value == null ? null : Number(row.moisture_value),
          moistureUnit: unit,
          isFieldCapacity: row.is_field_capacity === true,
        });
      }

      const startByAssignment = new Map<string, { dateStart: string; anchor: Anchor | null }>();
      for (const assignment of assignments) {
        const id = assignment.id as string;
        const anchor = latestAnchorByAssignment.get(id) ?? null;
        if (anchor) {
          const nextDay = addDays(anchor.effectiveDate, 1);
          if (nextDay <= dateEnd && daysBetween(nextDay, dateEnd) <= MAX_RECALC_DAYS) {
            startByAssignment.set(id, { dateStart: nextDay, anchor });
          }
          continue;
        }

        const managementStart = ((assignment.management_start_date as string | null) ?? (assignment.planting_date as string));
        const initialIsCc = assignment.initial_moisture_is_cc === true;
        const initialPct = assignment.initial_soil_moisture_pct == null ? null : Number(assignment.initial_soil_moisture_pct);
        const hasLegacyInitial = initialIsCc || (initialPct != null && Number.isFinite(initialPct));
        if (hasLegacyInitial && managementStart <= dateEnd && daysBetween(managementStart, dateEnd) <= MAX_RECALC_DAYS) {
          startByAssignment.set(id, { dateStart: managementStart, anchor: null });
        }
      }

      const starts = Array.from(startByAssignment.values()).map((v) => v.dateStart);
      const dataStart = starts.length ? minIso(starts) : dateEnd;

      const stationIds = (stationsRes.data ?? []).map((s: { id: string }) => s.id);
      const weatherByDate: Record<string, EngineWeatherDay> = {};
      if (stationIds.length) {
        const [selectionRes, readingsRes] = await Promise.all([
          supabase.from("weather_daily_selection")
            .select("date,selected_reading_id,operational_approved")
            .eq("farm_id", activeFarmId)
            .eq("operational_approved", true)
            .gte("date", dataStart)
            .lte("date", dateEnd),
          supabase.from("weather_readings")
            .select("id,date,et0_calculated,precipitation,station_id")
            .in("station_id", stationIds)
            .gte("date", dataStart)
            .lte("date", dateEnd),
        ]);
        const readingsById = new Map((readingsRes.data ?? []).map((r) => [r.id as string, r]));
        for (const selection of selectionRes.data ?? []) {
          if (!selection.selected_reading_id || selection.operational_approved !== true) continue;
          const reading = readingsById.get(selection.selected_reading_id as string);
          if (!reading) continue;
          const et0 = Number(reading.et0_calculated);
          const precipitation = Number(reading.precipitation);
          if (!Number.isFinite(et0) || et0 < 0 || !Number.isFinite(precipitation) || precipitation < 0) continue;
          weatherByDate[selection.date as string] = { et0, precipitation };
        }
      }

      const { data: manualRows, error: manualError } = await supabase.from("manual_rainfall_entries")
        .select("date,precipitation_mm")
        .eq("farm_id", activeFarmId)
        .gte("date", dataStart)
        .lte("date", dateEnd);
      if (manualError) throw manualError;
      for (const row of manualRows ?? []) {
        const current = weatherByDate[row.date as string];
        const rain = Number(row.precipitation_mm);
        if (current && Number.isFinite(rain) && rain >= 0) weatherByDate[row.date as string] = { ...current, precipitation: rain };
      }

      const { data: irrigationRows, error: irrigationError } = await supabase.from("irrigation_events")
        .select("id,pivot_id,parcel_id,started_at,depth_mm")
        .in("pivot_id", operationalPivots.map((p) => p.id as string))
        .gte("started_at", `${dataStart}T00:00:00`)
        .lte("started_at", `${dateEnd}T23:59:59`);
      if (irrigationError) throw irrigationError;
      const allIrrigation = (irrigationRows ?? []) as IrrigationRow[];

      const result: PivotHydricState[] = [];
      const pushIncomplete = (pivot: Record<string, unknown>, assignment: Record<string, unknown>, cultureName = "—", soilName: string | null = null) => {
        const geometry = resolvePivotMapGeometry({
          radiusM:(pivot.radius as number|null) ?? null,
          lastTowerRadiusM:(pivot.last_tower_radius as number|null) ?? null,
          overhangM:(pivot.overhang_m as number|null) ?? null,
          latitude:(pivot.latitude as number|null) ?? null,
          longitude:(pivot.longitude as number|null) ?? null,
        });
        result.push({
          pivotId:pivot.id as string,
          pivotName:pivot.name as string,
          cultureName,
          varietyName:assignment.culture_variety_id ? varietyMap.get(assignment.culture_variety_id as string) ?? null : null,
          seasonName:assignment.season_id ? seasonMap.get(assignment.season_id as string) ?? null : null,
          area:parcelManagedAreaHa(Number(pivot.area)||0, assignment.planted_area as number|null, assignment.start_angle_deg as number|null, assignment.end_angle_deg as number|null),
          latitude:Number(pivot.latitude)||0,
          longitude:Number(pivot.longitude)||0,
          parcelId:assignment.id as string,
          plantingDate:(assignment.planting_date as string) ?? null,
          soilName,
          radiusMeters:geometry.radiusMeters,
          sheetIncomplete:geometry.sheetIncomplete,
          startAngleDeg:(assignment.start_angle_deg as number|null) ?? null,
          endAngleDeg:(assignment.end_angle_deg as number|null) ?? null,
          parcelName:(assignment.name as string|null) ?? null,
          current:null,
          history:[],
        });
      };

      for (const pivot of operationalPivots) {
        const pivotAssignments = assignmentsByPivot.get(pivot.id as string) ?? [];
        const geometry = resolvePivotMapGeometry({
          radiusM:(pivot.radius as number|null) ?? null,
          lastTowerRadiusM:(pivot.last_tower_radius as number|null) ?? null,
          overhangM:(pivot.overhang_m as number|null) ?? null,
          latitude:(pivot.latitude as number|null) ?? null,
          longitude:(pivot.longitude as number|null) ?? null,
        });
        const isSectorized = pivotAssignments.length > 1;
        const pivotEvents = allIrrigation.filter((e) => e.pivot_id === pivot.id);

        for (const assignment of pivotAssignments) {
          const culture = cultureMap.get(assignment.culture_id as string) ?? null;
          const effectiveSoilId = (pivot.soil_id as string | null) ?? ((assignment.soil_id as string) || null);
          const soil = effectiveSoilId ? soilMap.get(effectiveSoilId) ?? null : null;
          const start = startByAssignment.get(assignment.id as string) ?? null;
          if (!culture || !soil || !start) {
            pushIncomplete(pivot, assignment, culture ? culture.name as string : "—", soil ? soil.name as string : null);
            continue;
          }

          const relevantEvents = pivotEvents.filter((e) => e.parcel_id === assignment.id || (!isSectorized && e.parcel_id == null));
          const hasAmbiguousLegacy = isSectorized && pivotEvents.some((e) => e.parcel_id == null);
          if (hasAmbiguousLegacy || hasExactDuplicateEvents(relevantEvents)) {
            pushIncomplete(pivot, assignment, culture.name as string, soil.name as string);
            continue;
          }

          const irrigationByDate = sumGrossDepthByDate(relevantEvents.map((e) => ({
            started_at:e.started_at,
            depth_mm:Number(e.depth_mm) || 0,
          })));

          const anchor = start.anchor;
          const startAngleDeg = (assignment.start_angle_deg as number|null) ?? null;
          const endAngleDeg = (assignment.end_angle_deg as number|null) ?? null;
          const area = parcelManagedAreaHa(Number(pivot.area)||0, assignment.planted_area as number|null, startAngleDeg, endAngleDeg);

          const state = computePivotCurrentState({
            pivotId:pivot.id as string,
            pivotName:pivot.name as string,
            cultureName:culture.name as string,
            varietyName:assignment.culture_variety_id ? varietyMap.get(assignment.culture_variety_id as string) ?? null : null,
            seasonName:assignment.season_id ? seasonMap.get(assignment.season_id as string) ?? null : null,
            area,
            latitude:Number(pivot.latitude)||0,
            longitude:Number(pivot.longitude)||0,
            parcelId:assignment.id as string,
            plantingDate:(assignment.planting_date as string) ?? null,
            soilName:soil.name as string,
            radiusMeters:geometry.radiusMeters,
            sheetIncomplete:geometry.sheetIncomplete,
            startAngleDeg,
            endAngleDeg,
            parcelName:(assignment.name as string|null) ?? null,
          }, {
            assignment:{
              id:assignment.id as string,
              planting_date:assignment.planting_date as string,
              emergence_date:(assignment.emergence_date as string|null) ?? null,
              parameter_mode:(assignment.parameter_mode as "padrao"|"personalizado") ?? "padrao",
              initial_root_depth:(assignment.initial_root_depth as number|null) ?? null,
              max_root_depth:(assignment.max_root_depth as number|null) ?? null,
              irrigation_efficiency:(assignment.irrigation_efficiency as number|null) ?? null,
              depletion_factor:(assignment.depletion_factor as number|null) ?? null,
              kl_override:(assignment.kl_override as number|null) ?? null,
              ks_function_override:(assignment.ks_function_override as string|null) ?? null,
              initial_soil_moisture_pct:anchor ? anchor.moistureValue : ((assignment.initial_soil_moisture_pct as number|null) ?? null),
              initial_moisture_unit:anchor ? anchor.moistureUnit : ((assignment.initial_moisture_unit as InitialMoistureUnit|null) ?? "field_capacity_fraction"),
              initial_moisture_is_cc:anchor ? anchor.isFieldCapacity : ((assignment.initial_moisture_is_cc as boolean|null) ?? null),
              deficit_irrigation:(assignment.deficit_irrigation as boolean) ?? false,
              stress_point_irrigation:(assignment.stress_point_irrigation as boolean) ?? false,
            },
            culture:{
              root_depth:Number(culture.root_depth)||0.3,
              depletion_factor:Number(culture.depletion_factor)||0.5,
              kl:(culture.kl as number|null) ?? null,
              ks_function:(culture.ks_function as string|null) ?? null,
              ky:(culture.ky as number|null) ?? null,
            },
            phases:phasesByCulture.get(assignment.culture_id as string) ?? [],
            soil:{
              field_capacity:Number(soil.field_capacity),
              wilting_point:Number(soil.wilting_point),
              bulk_density:Number(soil.bulk_density),
              effective_depth:Number(soil.effective_depth)||0.6,
              layers:effectiveSoilId ? layersBySoil.get(effectiveSoilId) ?? [] : [],
            },
            pivot:{
              application_efficiency:(pivot.application_efficiency as number|null) ?? null,
              efficiency:(pivot.efficiency as number|null) ?? null,
              area,
              flow_rate:Number(pivot.flow_rate)||0,
            },
            weatherByDate,
            irrigationByDate,
            dateStart:start.dateStart,
            dateEnd,
          });
          result.push(state);
        }
      }

      setStates(result);
      setSummary(computeFarmHydricState(result));
    } catch (error) {
      console.error("Falha ao carregar estado hídrico operacional", error);
      setStates([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  return { states, summary, loading:authLoading || loading, refresh:load };
}
