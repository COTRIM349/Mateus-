"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers";
import {
  computePivotCurrentState,
  computeFarmHydricState,
  type PivotHydricState,
  type FarmHydricSummary,
  type EngineWeatherDay,
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

const WINDOW_DAYS = 30;

function isoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Orquestra dados para o motor V2. O hook não calcula regra agronômica.
 * Pontos de segurança:
 * - só usa clima explicitamente aprovado para operação;
 * - ausência não vira ETo/chuva zero;
 * - parcelas futuras não entram;
 * - janela de 30 dias é apenas de exibição: o ARM parte do balanço persistido
 *   do dia anterior, preservando continuidade temporal.
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

    const today = new Date();
    const dateEnd = isoDateLocal(today);
    const globalDateStart = isoDateLocal(new Date(today.getTime() - (WINDOW_DAYS - 1) * 86400000));
    const previousGlobalDate = addDays(globalDateStart, -1);

    const { data: pivotRows } = await supabase
      .from("pivots")
      .select("id, name, area, flow_rate, efficiency, application_efficiency, latitude, longitude, soil_id, radius, last_tower_radius, overhang_m")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name");
    const pivots = pivotRows ?? [];
    const pivotIds = pivots.map((p) => p.id as string);
    const pivotSoilMap = new Map(pivots.map((p) => [p.id as string, (p.soil_id as string | null) ?? null]));

    if (pivotIds.length === 0) {
      setStates([]);
      setSummary(computeFarmHydricState([]));
      setLoading(false);
      return;
    }

    const { data: assignmentRows } = await supabase
      .from("pivot_crop_assignments")
      .select("*")
      .in("pivot_id", pivotIds)
      .eq("active", true)
      .or("status.is.null,status.eq.ativa")
      .lte("planting_date", dateEnd)
      .order("created_at", { ascending: false });

    const assignments = assignmentRows ?? [];
    const assignmentsByPivot = new Map<string, Array<Record<string, unknown>>>();
    for (const a of assignments) {
      const managementStart = ((a.management_start_date as string | null) ?? (a.planting_date as string));
      if (managementStart > dateEnd) continue;
      const pid = a.pivot_id as string;
      const list = assignmentsByPivot.get(pid) ?? [];
      list.push(a as Record<string, unknown>);
      assignmentsByPivot.set(pid, list);
    }

    const activeAssignments = Array.from(assignmentsByPivot.values()).flat();
    const assignmentIds = activeAssignments.map((a) => a.id as string);
    const cultureIds = Array.from(new Set(activeAssignments.map((a) => a.culture_id as string)));
    const soilIds = Array.from(new Set([
      ...(Array.from(pivotSoilMap.values()).filter(Boolean) as string[]),
      ...activeAssignments.map((a) => a.soil_id as string).filter(Boolean),
    ]));
    const seasonIds = Array.from(new Set(activeAssignments.map((a) => a.season_id as string).filter(Boolean)));
    const varietyIds = Array.from(new Set(activeAssignments.map((a) => a.culture_variety_id as string).filter(Boolean)));

    const [culturesRes, phasesRes, soilsRes, layersRes, seasonsRes, varietiesRes, stationsRes, seedRes] = await Promise.all([
      cultureIds.length ? supabase.from("cultures").select("id, name, root_depth, depletion_factor, kl, ks_function, ky").in("id", cultureIds) : Promise.resolve({ data: [] }),
      cultureIds.length ? supabase.from("culture_phases").select("*").in("culture_id", cultureIds).order("phase_order") : Promise.resolve({ data: [] }),
      soilIds.length ? supabase.from("soils").select("id, name, field_capacity, wilting_point, bulk_density, effective_depth").in("id", soilIds) : Promise.resolve({ data: [] }),
      soilIds.length ? supabase.from("soil_layers").select("soil_id, depth_start, depth_end, field_capacity, wilting_point, bulk_density, kl").in("soil_id", soilIds).order("depth_start") : Promise.resolve({ data: [] }),
      seasonIds.length ? supabase.from("seasons").select("id, name").in("id", seasonIds) : Promise.resolve({ data: [] }),
      varietyIds.length ? supabase.from("culture_varieties").select("id, name").in("id", varietyIds) : Promise.resolve({ data: [] }),
      supabase.from("weather_stations").select("id").eq("farm_id", activeFarmId).eq("active", true),
      assignmentIds.length
        ? supabase.from("water_balances").select("pivot_crop_assignment_id, date, soil_storage, cad").in("pivot_crop_assignment_id", assignmentIds).lte("date", previousGlobalDate).order("date", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const cultureMap = new Map((culturesRes.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c]));
    const soilMap = new Map((soilsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s]));
    const seasonMap = new Map((seasonsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s.name as string]));
    const varietyMap = new Map((varietiesRes.data ?? []).map((v: Record<string, unknown>) => [v.id as string, v.name as string]));

    const layersBySoil = new Map<string, SoilProfileLayer[]>();
    for (const row of (layersRes.data ?? []) as Array<{ soil_id: string; depth_start: number; depth_end: number; field_capacity: number; wilting_point: number; bulk_density: number | null; kl: number | null }>) {
      const existing = layersBySoil.get(row.soil_id) ?? [];
      existing.push(...mapDbLayersToProfile([row]));
      layersBySoil.set(row.soil_id, existing);
    }

    const phasesByCulture = new Map<string, CulturePhase[]>();
    for (const p of (phasesRes.data ?? []) as Array<CulturePhase & { culture_id: string }>) {
      if (!phasesByCulture.has(p.culture_id)) phasesByCulture.set(p.culture_id, []);
      phasesByCulture.get(p.culture_id)!.push(p);
    }

    // Último balanço persistido por parcela antes da janela. Só é aceito como
    // seed quando for exatamente o dia anterior ao início efetivo da série.
    const latestSeedByAssignment = new Map<string, { date: string; storage: number; cad: number }>();
    for (const row of seedRes.data ?? []) {
      const id = row.pivot_crop_assignment_id as string;
      if (latestSeedByAssignment.has(id)) continue;
      latestSeedByAssignment.set(id, {
        date: row.date as string,
        storage: row.soil_storage as number,
        cad: row.cad as number,
      });
    }

    // Clima: SOMENTE leitura escolhida e operacionalmente aprovada.
    const stationIds = (stationsRes.data ?? []).map((s: { id: string }) => s.id);
    const weatherByDate: Record<string, EngineWeatherDay> = {};
    if (stationIds.length > 0) {
      const [selectionRes, readingsRes] = await Promise.all([
        supabase
          .from("weather_daily_selection")
          .select("date, selected_reading_id, operational_approved")
          .eq("farm_id", activeFarmId)
          .eq("operational_approved", true)
          .gte("date", globalDateStart)
          .lte("date", dateEnd),
        supabase
          .from("weather_readings")
          .select("id, date, et0_source, precipitation, station_id")
          .in("station_id", stationIds)
          .gte("date", globalDateStart)
          .lte("date", dateEnd),
      ]);

      const readingsById = new Map((readingsRes.data ?? []).map((r) => [r.id as string, r]));
      for (const selection of selectionRes.data ?? []) {
        if (!selection.selected_reading_id || selection.operational_approved !== true) continue;
        const r = readingsById.get(selection.selected_reading_id as string);
        if (!r) continue;
        const et0 = r.et0_source as number | null;
        const precipitation = r.precipitation as number | null;
        if (et0 == null || precipitation == null || !Number.isFinite(et0) || !Number.isFinite(precipitation)) continue;
        weatherByDate[selection.date as string] = { et0, precipitation };
      }
    }

    const { data: irrEvents } = await supabase
      .from("irrigation_events")
      .select("pivot_id, started_at, depth_mm")
      .in("pivot_id", pivotIds)
      .gte("started_at", globalDateStart + "T00:00:00")
      .lte("started_at", dateEnd + "T23:59:59");
    const eventsByPivot = new Map<string, Array<{ started_at: string; depth_mm: number }>>();
    for (const ev of irrEvents ?? []) {
      const pid = ev.pivot_id as string;
      if (!eventsByPivot.has(pid)) eventsByPivot.set(pid, []);
      eventsByPivot.get(pid)!.push({ started_at: ev.started_at as string, depth_mm: (ev.depth_mm as number) ?? 0 });
    }
    const irrigationByPivot = new Map<string, Record<string, number>>();
    for (const [pid, list] of eventsByPivot.entries()) irrigationByPivot.set(pid, sumGrossDepthByDate(list));

    const result: PivotHydricState[] = [];
    for (const pivot of pivots) {
      const pivotAssignments = assignmentsByPivot.get(pivot.id as string) ?? [];
      const geometry = resolvePivotMapGeometry({
        radiusM: (pivot.radius as number | null) ?? null,
        lastTowerRadiusM: (pivot.last_tower_radius as number | null) ?? null,
        overhangM: (pivot.overhang_m as number | null) ?? null,
        latitude: (pivot.latitude as number | null) ?? null,
        longitude: (pivot.longitude as number | null) ?? null,
      });

      const pushIncomplete = (assignment?: Record<string, unknown>, cultureName = "—", soilName: string | null = null) => {
        result.push({
          pivotId: pivot.id as string,
          pivotName: pivot.name as string,
          cultureName,
          varietyName: null,
          seasonName: null,
          area: (pivot.area as number) ?? 0,
          latitude: (pivot.latitude as number) ?? 0,
          longitude: (pivot.longitude as number) ?? 0,
          parcelId: assignment ? (assignment.id as string) : null,
          plantingDate: assignment ? ((assignment.planting_date as string) ?? null) : null,
          soilName,
          radiusMeters: geometry.radiusMeters,
          sheetIncomplete: geometry.sheetIncomplete,
          startAngleDeg: assignment ? ((assignment.start_angle_deg as number | null) ?? null) : null,
          endAngleDeg: assignment ? ((assignment.end_angle_deg as number | null) ?? null) : null,
          parcelName: assignment ? ((assignment.name as string | null) ?? null) : null,
          current: null,
          history: [],
        });
      };

      if (pivotAssignments.length === 0) {
        pushIncomplete();
        continue;
      }

      for (const assignment of pivotAssignments) {
        const culture = cultureMap.get(assignment.culture_id as string) ?? null;
        const effectiveSoilId = pivotSoilMap.get(pivot.id as string) ?? ((assignment.soil_id as string) || null);
        const soil = effectiveSoilId ? soilMap.get(effectiveSoilId) : null;
        if (!culture || !soil) {
          pushIncomplete(assignment, culture ? (culture.name as string) : "—", soil ? ((soil.name as string) ?? null) : null);
          continue;
        }

        const managementStart = ((assignment.management_start_date as string | null) ?? (assignment.planting_date as string));
        const effectiveDateStart = maxIso(globalDateStart, managementStart);
        const seed = latestSeedByAssignment.get(assignment.id as string) ?? null;
        const requiresSeed = managementStart < globalDateStart;
        const seedIsContinuous = seed?.date === addDays(effectiveDateStart, -1);
        if (requiresSeed && !seedIsContinuous) {
          pushIncomplete(assignment, culture.name as string, soil.name as string);
          continue;
        }

        const startAngleDeg = (assignment.start_angle_deg as number | null) ?? null;
        const endAngleDeg = (assignment.end_angle_deg as number | null) ?? null;
        const plantedArea = (assignment.planted_area as number | null) ?? null;
        const area = parcelManagedAreaHa((pivot.area as number) ?? 0, plantedArea, startAngleDeg, endAngleDeg);

        const state = computePivotCurrentState(
          {
            pivotId: pivot.id as string,
            pivotName: pivot.name as string,
            cultureName: culture.name as string,
            varietyName: assignment.culture_variety_id ? varietyMap.get(assignment.culture_variety_id as string) ?? null : null,
            seasonName: assignment.season_id ? seasonMap.get(assignment.season_id as string) ?? null : null,
            area,
            latitude: (pivot.latitude as number) ?? 0,
            longitude: (pivot.longitude as number) ?? 0,
            parcelId: assignment.id as string,
            plantingDate: (assignment.planting_date as string) ?? null,
            soilName: (soil.name as string) ?? null,
            radiusMeters: geometry.radiusMeters,
            sheetIncomplete: geometry.sheetIncomplete,
            startAngleDeg,
            endAngleDeg,
            parcelName: (assignment.name as string | null) ?? null,
          },
          {
            assignment: {
              id: assignment.id as string,
              planting_date: assignment.planting_date as string,
              emergence_date: (assignment.emergence_date as string) ?? null,
              parameter_mode: (assignment.parameter_mode as "padrao" | "personalizado") ?? "padrao",
              initial_root_depth: (assignment.initial_root_depth as number) ?? null,
              max_root_depth: (assignment.max_root_depth as number) ?? null,
              irrigation_efficiency: (assignment.irrigation_efficiency as number) ?? null,
              depletion_factor: (assignment.depletion_factor as number) ?? null,
              kl_override: (assignment.kl_override as number) ?? null,
              ks_function_override: (assignment.ks_function_override as string) ?? null,
              initial_soil_moisture_pct: (assignment.initial_soil_moisture_pct as number) ?? null,
              initial_moisture_unit: (assignment.initial_moisture_unit as "field_capacity_fraction" | "weight_pct" | "volume_pct") ?? null,
              initial_moisture_is_cc: (assignment.initial_moisture_is_cc as boolean) ?? null,
              deficit_irrigation: (assignment.deficit_irrigation as boolean) ?? false,
              stress_point_irrigation: (assignment.stress_point_irrigation as boolean) ?? false,
            },
            culture: {
              root_depth: (culture.root_depth as number) ?? 0.3,
              depletion_factor: (culture.depletion_factor as number) ?? 0.5,
              kl: (culture.kl as number) ?? null,
              ks_function: (culture.ks_function as string) ?? null,
              ky: (culture.ky as number) ?? null,
            },
            phases: phasesByCulture.get(assignment.culture_id as string) ?? [],
            soil: {
              field_capacity: soil.field_capacity as number,
              wilting_point: soil.wilting_point as number,
              bulk_density: soil.bulk_density as number,
              effective_depth: (soil.effective_depth as number) ?? 0.6,
              layers: effectiveSoilId ? layersBySoil.get(effectiveSoilId) ?? [] : [],
            },
            pivot: {
              application_efficiency: (pivot.application_efficiency as number | null) ?? null,
              efficiency: (pivot.efficiency as number | null) ?? null,
              area,
              flow_rate: (pivot.flow_rate as number) ?? 0,
            },
            weatherByDate,
            irrigationByDate: irrigationByPivot.get(pivot.id as string) ?? {},
            dateStart: effectiveDateStart,
            dateEnd,
            initialStorageMm: seedIsContinuous ? seed!.storage : null,
            initialCadMm: seedIsContinuous ? seed!.cad : null,
          },
        );
        result.push(state);
      }
    }

    setStates(result);
    setSummary(computeFarmHydricState(result));
    setLoading(false);
  }, [supabase, activeFarmId]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  return { states, summary, loading: authLoading || loading, refresh: load };
}
