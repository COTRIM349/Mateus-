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

const DISPLAY_WINDOW_DAYS = 30;
const MAX_RECOVERY_LOOKBACK_DAYS = 60;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.floor((b - a) / 86400000);
}

function minIso(values: string[]): string {
  return [...values].sort()[0];
}

/**
 * Estado hídrico da fazenda com recuperação dinâmica de continuidade.
 *
 * A janela de 30 dias é apenas de visualização. Para uma parcela antiga, o
 * motor procura o último ARM/CAD persistido antes dessa janela e recalcula a
 * partir do dia seguinte. Se o seed estiver mais distante, a consulta climática
 * é ampliada até 60 dias. Sem seed real ou sem clima contínuo, o pivô fica como
 * dado incompleto — nunca reinicia silenciosamente em capacidade de campo.
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
    const dateEnd = isoToday();
    const displayStart = addDays(dateEnd, -(DISPLAY_WINDOW_DAYS - 1));
    const oldestRecoveryDate = addDays(dateEnd, -(MAX_RECOVERY_LOOKBACK_DAYS - 1));

    try {
      const { data: pivotRows, error: pivotError } = await supabase
        .from("pivots")
        .select("id, name, area, flow_rate, efficiency, application_efficiency, latitude, longitude, soil_id, radius, last_tower_radius, overhang_m")
        .eq("farm_id", activeFarmId)
        .eq("active", true)
        .order("name");
      if (pivotError) throw pivotError;

      const pivots = pivotRows ?? [];
      const pivotIds = pivots.map((p) => p.id as string);
      if (pivotIds.length === 0) {
        const empty = computeFarmHydricState([]);
        setStates([]);
        setSummary(empty);
        return;
      }

      const pivotSoilMap = new Map(
        pivots.map((p) => [p.id as string, (p.soil_id as string | null) ?? null]),
      );

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
      for (const row of assignmentRows ?? []) {
        const managementStart = ((row.management_start_date as string | null) ?? (row.planting_date as string));
        if (!managementStart || managementStart > dateEnd) continue;
        const pid = row.pivot_id as string;
        const list = assignmentsByPivot.get(pid) ?? [];
        list.push(row as Record<string, unknown>);
        assignmentsByPivot.set(pid, list);
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

      const [culturesRes, phasesRes, soilsRes, layersRes, seasonsRes, varietiesRes, stationsRes, seedRes] = await Promise.all([
        cultureIds.length
          ? supabase.from("cultures").select("id, name, root_depth, depletion_factor, kl, ks_function, ky").in("id", cultureIds)
          : Promise.resolve({ data: [] }),
        cultureIds.length
          ? supabase.from("culture_phases").select("*").in("culture_id", cultureIds).order("phase_order")
          : Promise.resolve({ data: [] }),
        soilIds.length
          ? supabase.from("soils").select("id, name, field_capacity, wilting_point, bulk_density, effective_depth").in("id", soilIds)
          : Promise.resolve({ data: [] }),
        soilIds.length
          ? supabase.from("soil_layers").select("soil_id, depth_start, depth_end, field_capacity, wilting_point, bulk_density, kl").in("soil_id", soilIds).order("depth_start")
          : Promise.resolve({ data: [] }),
        seasonIds.length
          ? supabase.from("seasons").select("id, name").in("id", seasonIds)
          : Promise.resolve({ data: [] }),
        varietyIds.length
          ? supabase.from("culture_varieties").select("id, name").in("id", varietyIds)
          : Promise.resolve({ data: [] }),
        supabase.from("weather_stations").select("id").eq("farm_id", activeFarmId).eq("active", true),
        assignmentIds.length
          ? supabase
              .from("water_balances")
              .select("pivot_crop_assignment_id, date, soil_storage, cad")
              .in("pivot_crop_assignment_id", assignmentIds)
              .lt("date", displayStart)
              .gte("date", addDays(oldestRecoveryDate, -1))
              .order("date", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

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

      const recalcStartByAssignment = new Map<string, string>();
      for (const assignment of assignments) {
        const managementStart = ((assignment.management_start_date as string | null) ?? (assignment.planting_date as string));
        if (managementStart >= displayStart) {
          recalcStartByAssignment.set(assignment.id as string, managementStart);
          continue;
        }
        const seed = latestSeedByAssignment.get(assignment.id as string);
        if (seed) recalcStartByAssignment.set(assignment.id as string, addDays(seed.date, 1));
      }

      const candidateStarts = Array.from(recalcStartByAssignment.values()).filter(
        (d) => daysBetween(d, dateEnd) < MAX_RECOVERY_LOOKBACK_DAYS,
      );
      const dataStart = candidateStarts.length > 0
        ? minIso([displayStart, ...candidateStarts])
        : displayStart;

      const stationIds = (stationsRes.data ?? []).map((s: { id: string }) => s.id);
      const weatherByDate: Record<string, EngineWeatherDay> = {};
      if (stationIds.length > 0) {
        const [selectionRes, readingsRes] = await Promise.all([
          supabase
            .from("weather_daily_selection")
            .select("date, selected_reading_id, operational_approved")
            .eq("farm_id", activeFarmId)
            .eq("operational_approved", true)
            .gte("date", dataStart)
            .lte("date", dateEnd),
          supabase
            .from("weather_readings")
            .select("id, date, et0_calculated, precipitation, station_id")
            .in("station_id", stationIds)
            .gte("date", dataStart)
            .lte("date", dateEnd),
        ]);

        const readingsById = new Map((readingsRes.data ?? []).map((r) => [r.id as string, r]));
        for (const selection of selectionRes.data ?? []) {
          if (!selection.selected_reading_id || selection.operational_approved !== true) continue;
          const reading = readingsById.get(selection.selected_reading_id as string);
          if (!reading) continue;
          const et0 = reading.et0_calculated as number | null;
          const precipitation = reading.precipitation as number | null;
          if (
            et0 == null || precipitation == null ||
            !Number.isFinite(et0) || et0 < 0 ||
            !Number.isFinite(precipitation) || precipitation < 0
          ) continue;
          weatherByDate[selection.date as string] = { et0, precipitation };
        }
      }

      const { data: irrRows, error: irrError } = await supabase
        .from("irrigation_events")
        .select("pivot_id, started_at, depth_mm")
        .in("pivot_id", pivotIds)
        .gte("started_at", `${dataStart}T00:00:00`)
        .lte("started_at", `${dateEnd}T23:59:59`);
      if (irrError) throw irrError;

      const eventsByPivot = new Map<string, Array<{ started_at: string; depth_mm: number }>>();
      for (const event of irrRows ?? []) {
        const pid = event.pivot_id as string;
        const list = eventsByPivot.get(pid) ?? [];
        list.push({
          started_at: event.started_at as string,
          depth_mm: (event.depth_mm as number) ?? 0,
        });
        eventsByPivot.set(pid, list);
      }
      const irrigationByPivot = new Map<string, Record<string, number>>();
      Array.from(eventsByPivot.entries()).forEach(([pid, list]) => {
        irrigationByPivot.set(pid, sumGrossDepthByDate(list));
      });

      const cultureMap = new Map((culturesRes.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c]));
      const soilMap = new Map((soilsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s]));
      const seasonMap = new Map((seasonsRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s.name as string]));
      const varietyMap = new Map((varietiesRes.data ?? []).map((v: Record<string, unknown>) => [v.id as string, v.name as string]));

      const layersBySoil = new Map<string, SoilProfileLayer[]>();
      for (const row of (layersRes.data ?? []) as Array<{
        soil_id: string;
        depth_start: number;
        depth_end: number;
        field_capacity: number;
        wilting_point: number;
        bulk_density: number | null;
        kl: number | null;
      }>) {
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

      const result: PivotHydricState[] = [];
      const pushIncomplete = (
        pivot: Record<string, unknown>,
        geometry: { radiusMeters: number | null; sheetIncomplete: boolean },
        assignment?: Record<string, unknown>,
        cultureName = "—",
        soilName: string | null = null,
      ) => {
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

      for (const pivot of pivots as Array<Record<string, unknown>>) {
        const geometry = resolvePivotMapGeometry({
          radiusM: (pivot.radius as number | null) ?? null,
          lastTowerRadiusM: (pivot.last_tower_radius as number | null) ?? null,
          overhangM: (pivot.overhang_m as number | null) ?? null,
          latitude: (pivot.latitude as number | null) ?? null,
          longitude: (pivot.longitude as number | null) ?? null,
        });
        const pivotAssignments = assignmentsByPivot.get(pivot.id as string) ?? [];
        if (pivotAssignments.length === 0) {
          pushIncomplete(pivot, geometry);
          continue;
        }

        for (const assignment of pivotAssignments) {
          const culture = cultureMap.get(assignment.culture_id as string) ?? null;
          const effectiveSoilId = pivotSoilMap.get(pivot.id as string) ?? ((assignment.soil_id as string) || null);
          const soil = effectiveSoilId ? soilMap.get(effectiveSoilId) : null;
          if (!culture || !soil) {
            pushIncomplete(
              pivot,
              geometry,
              assignment,
              culture ? (culture.name as string) : "—",
              soil ? ((soil.name as string) ?? null) : null,
            );
            continue;
          }

          const managementStart = ((assignment.management_start_date as string | null) ?? (assignment.planting_date as string));
          const seed = latestSeedByAssignment.get(assignment.id as string) ?? null;
          const dateStart = recalcStartByAssignment.get(assignment.id as string) ?? null;
          const oldParcelNeedsSeed = managementStart < displayStart;

          if (
            !dateStart ||
            (oldParcelNeedsSeed && !seed) ||
            daysBetween(dateStart, dateEnd) >= MAX_RECOVERY_LOOKBACK_DAYS
          ) {
            pushIncomplete(pivot, geometry, assignment, culture.name as string, soil.name as string);
            continue;
          }

          const startAngleDeg = (assignment.start_angle_deg as number | null) ?? null;
          const endAngleDeg = (assignment.end_angle_deg as number | null) ?? null;
          const area = parcelManagedAreaHa(
            (pivot.area as number) ?? 0,
            (assignment.planted_area as number | null) ?? null,
            startAngleDeg,
            endAngleDeg,
          );

          const state = computePivotCurrentState(
            {
              pivotId: pivot.id as string,
              pivotName: pivot.name as string,
              cultureName: culture.name as string,
              varietyName: assignment.culture_variety_id
                ? varietyMap.get(assignment.culture_variety_id as string) ?? null
                : null,
              seasonName: assignment.season_id
                ? seasonMap.get(assignment.season_id as string) ?? null
                : null,
              area,
              latitude: (pivot.latitude as number) ?? 0,
              longitude: (pivot.longitude as number) ?? 0,
              parcelId: assignment.id as string,
              plantingDate: (assignment.planting_date as string) ?? null,
              soilName: soil.name as string,
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
              dateStart,
              dateEnd,
              initialStorageMm: oldParcelNeedsSeed ? seed!.storage : null,
              initialCadMm: oldParcelNeedsSeed ? seed!.cad : null,
            },
          );
          result.push(state);
        }
      }

      setStates(result);
      setSummary(computeFarmHydricState(result));
    } catch (error) {
      console.error("Falha ao carregar estado hídrico da fazenda", error);
      setStates([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  return {
    states,
    summary,
    loading: authLoading || loading,
    refresh: load,
  };
}
