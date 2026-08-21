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

interface FarmHydricState {
  states: PivotHydricState[];
  summary: FarmHydricSummary | null;
  loading: boolean;
  refresh: () => void;
}

const WINDOW_DAYS = 30;

/**
 * Carrega do Supabase os dados necessários (pivô, vínculo, cultura, fases,
 * solo, clima, irrigação) e delega TODO o cálculo ao motor do balanço hídrico.
 * Retorna o estado atual por pivô e a agregação da fazenda. Nenhuma regra de
 * negócio vive aqui — apenas orquestração de dados para o motor.
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
    const dateEnd = today.toISOString().slice(0, 10);
    const dateStart = new Date(today.getTime() - (WINDOW_DAYS - 1) * 86400000)
      .toISOString()
      .slice(0, 10);

    // 1. pivôs da fazenda (Sprint 14 · Etapa 7 — inclui soil_id)
    const { data: pivotRows } = await supabase
      .from("pivots")
      .select("id, name, area, flow_rate, efficiency, latitude, longitude, soil_id, radius, last_tower_radius, overhang_m")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name");
    const pivots = pivotRows ?? [];
    const pivotIds = pivots.map((p) => p.id as string);
    const pivotSoilMap = new Map(
      pivots.map((p) => [p.id as string, (p.soil_id as string | null) ?? null]),
    );

    if (pivotIds.length === 0) {
      setStates([]);
      setSummary(computeFarmHydricState([]));
      setLoading(false);
      return;
    }

    // 2. vínculos ativos desses pivôs (mais recente por pivô)
    //    Sprint 13 · Etapa 6 — status='ativa' ou NULL (retro-compat).
    const { data: assignmentRows } = await supabase
      .from("pivot_crop_assignments")
      .select("*")
      .in("pivot_id", pivotIds)
      .eq("active", true)
      .or("status.is.null,status.eq.ativa")
      .order("created_at", { ascending: false });

    const assignmentByPivot = new Map<string, Record<string, unknown>>();
    for (const a of assignmentRows ?? []) {
      const pid = a.pivot_id as string;
      if (!assignmentByPivot.has(pid)) assignmentByPivot.set(pid, a);
    }

    const assignments = Array.from(assignmentByPivot.values());
    const cultureIds = Array.from(new Set(assignments.map((a) => a.culture_id as string)));
    // Sprint 14 · Etapa 7 — solo prioritariamente do pivô; fallback parcela.
    const soilIds = Array.from(new Set([
      ...Array.from(pivotSoilMap.values()).filter(Boolean) as string[],
      ...assignments.map((a) => a.soil_id as string).filter(Boolean),
    ]));
    const seasonIds = Array.from(new Set(assignments.map((a) => a.season_id as string).filter(Boolean)));
    const varietyIds = Array.from(new Set(assignments.map((a) => a.culture_variety_id as string).filter(Boolean)));

    // 3. cultura, fases, solo, safra, cultivar, clima, irrigação
    const [culturesRes, phasesRes, soilsRes, layersRes, seasonsRes, varietiesRes, stationsRes] = await Promise.all([
      cultureIds.length ? supabase.from("cultures").select("id, name, root_depth, depletion_factor, kl, ks_function, ky").in("id", cultureIds) : Promise.resolve({ data: [] }),
      cultureIds.length ? supabase.from("culture_phases").select("*").in("culture_id", cultureIds).order("phase_order") : Promise.resolve({ data: [] }),
      soilIds.length ? supabase.from("soils").select("id, name, field_capacity, wilting_point, bulk_density, effective_depth").in("id", soilIds) : Promise.resolve({ data: [] }),
      soilIds.length
        ? supabase
            .from("soil_layers")
            .select("soil_id, depth_start, depth_end, field_capacity, wilting_point, bulk_density, kl")
            .in("soil_id", soilIds)
            .order("depth_start")
        : Promise.resolve({ data: [] }),
      seasonIds.length ? supabase.from("seasons").select("id, name").in("id", seasonIds) : Promise.resolve({ data: [] }),
      varietyIds.length ? supabase.from("culture_varieties").select("id, name").in("id", varietyIds) : Promise.resolve({ data: [] }),
      supabase.from("weather_stations").select("id").eq("farm_id", activeFarmId).eq("active", true),
    ]);

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
      const existing = layersBySoil.get(row.soil_id) ?? [];
      existing.push(...mapDbLayersToProfile([row]));
      layersBySoil.set(row.soil_id, existing);
    }

    const phasesByCulture = new Map<string, CulturePhase[]>();
    for (const p of (phasesRes.data ?? []) as CulturePhase[] & { culture_id: string }[]) {
      const cid = (p as unknown as { culture_id: string }).culture_id;
      if (!phasesByCulture.has(cid)) phasesByCulture.set(cid, []);
      phasesByCulture.get(cid)!.push(p);
    }

    // clima da fazenda (ET0 e chuva por data)
    // Prioridade: leitura apontada por weather_daily_selection (se houver
    // registro para a data). Fallback: qualquer leitura de estação ativa
    // com et0 > 0 (compatibilidade com dados antigos).
    const stationIds = (stationsRes.data ?? []).map((s: { id: string }) => s.id);
    const weatherByDate: Record<string, EngineWeatherDay> = {};

    if (stationIds.length > 0) {
      const [selectionRes, readingsRes] = await Promise.all([
        supabase
          .from("weather_daily_selection")
          .select("date, selected_reading_id")
          .eq("farm_id", activeFarmId)
          .gte("date", dateStart)
          .lte("date", dateEnd),
        supabase
          .from("weather_readings")
          .select("id, date, et0_calculated, precipitation, station_id")
          .in("station_id", stationIds)
          .gte("date", dateStart)
          .lte("date", dateEnd)
          .order("date"),
      ]);

      const readingsById = new Map<string, { date: string; et0: number; precipitation: number }>();
      for (const r of readingsRes.data ?? []) {
        readingsById.set(r.id as string, {
          date: r.date as string,
          et0: (r.et0_calculated as number) ?? 0,
          precipitation: (r.precipitation as number) ?? 0,
        });
      }

      const preferredReadingByDate = new Map<string, string>();
      for (const s of selectionRes.data ?? []) {
        if (s.selected_reading_id) {
          preferredReadingByDate.set(s.date as string, s.selected_reading_id as string);
        }
      }

      // 1) aplica seleção explícita
      preferredReadingByDate.forEach((readingId, date) => {
        const r = readingsById.get(readingId);
        if (r) weatherByDate[date] = { et0: r.et0, precipitation: r.precipitation };
      });

      // 2) fallback para datas sem seleção
      for (const r of readingsRes.data ?? []) {
        const d = r.date as string;
        if (weatherByDate[d]) continue;
        const et0 = (r.et0_calculated as number) ?? 0;
        if (et0 > 0 || !(d in weatherByDate)) {
          weatherByDate[d] = { et0, precipitation: (r.precipitation as number) ?? 0 };
        }
      }
    }

    // irrigação aplicada por pivô/data
    const { data: irrEvents } = await supabase
      .from("irrigation_events")
      .select("pivot_id, started_at, depth_mm")
      .in("pivot_id", pivotIds)
      .gte("started_at", dateStart + "T00:00:00")
      .lte("started_at", dateEnd + "T23:59:59");
    const irrigationByPivot = new Map<string, Record<string, number>>();
    const eventsByPivot = new Map<string, Array<{ started_at: string; depth_mm: number }>>();
    for (const ev of irrEvents ?? []) {
      const pid = ev.pivot_id as string;
      if (!eventsByPivot.has(pid)) eventsByPivot.set(pid, []);
      eventsByPivot.get(pid)!.push({
        started_at: ev.started_at as string,
        depth_mm: (ev.depth_mm as number) ?? 0,
      });
    }
    for (const [pid, list] of Array.from(eventsByPivot.entries())) {
      irrigationByPivot.set(pid, sumGrossDepthByDate(list));
    }

    // 4. motor: estado atual por pivô
    const result: PivotHydricState[] = [];
    for (const pivot of pivots) {
      const assignment = assignmentByPivot.get(pivot.id as string);
      const culture = assignment ? cultureMap.get(assignment.culture_id as string) : null;
      // Sprint 14 · Etapa 7 — solo do pivô > fallback parcela
      const effectiveSoilId =
        pivotSoilMap.get(pivot.id as string) ??
        (assignment ? (assignment.soil_id as string) : null);
      const soil = effectiveSoilId ? soilMap.get(effectiveSoilId) : null;

      const geometry = resolvePivotMapGeometry({
        radiusM: (pivot.radius as number | null) ?? null,
        lastTowerRadiusM: (pivot.last_tower_radius as number | null) ?? null,
        overhangM: (pivot.overhang_m as number | null) ?? null,
        latitude: (pivot.latitude as number | null) ?? null,
        longitude: (pivot.longitude as number | null) ?? null,
      });

      if (!assignment || !culture || !soil) {
        // sem vínculo/cultura/solo → sem dados para cálculo (cinza)
        result.push({
          pivotId: pivot.id as string,
          pivotName: pivot.name as string,
          cultureName: culture ? (culture.name as string) : "—",
          varietyName: null,
          seasonName: null,
          area: (pivot.area as number) ?? 0,
          latitude: (pivot.latitude as number) ?? 0,
          longitude: (pivot.longitude as number) ?? 0,
          parcelId: assignment ? (assignment.id as string) : null,
          plantingDate: assignment ? ((assignment.planting_date as string) ?? null) : null,
          soilName: soil ? ((soil.name as string) ?? null) : null,
          radiusMeters: geometry.radiusMeters,
          sheetIncomplete: geometry.sheetIncomplete,
          current: null,
          history: [],
        });
        continue;
      }

      const state = computePivotCurrentState(
        {
          pivotId: pivot.id as string,
          pivotName: pivot.name as string,
          cultureName: culture.name as string,
          varietyName: assignment.culture_variety_id ? varietyMap.get(assignment.culture_variety_id as string) ?? null : null,
          seasonName: assignment.season_id ? seasonMap.get(assignment.season_id as string) ?? null : null,
          area: (pivot.area as number) ?? 0,
          latitude: (pivot.latitude as number) ?? 0,
          longitude: (pivot.longitude as number) ?? 0,
          parcelId: assignment.id as string,
          plantingDate: (assignment.planting_date as string) ?? null,
          soilName: (soil.name as string) ?? null,
          radiusMeters: geometry.radiusMeters,
          sheetIncomplete: geometry.sheetIncomplete,
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
            efficiency: (pivot.efficiency as number) ?? 0.85,
            area: (pivot.area as number) ?? 0,
            flow_rate: (pivot.flow_rate as number) ?? 0,
          },
          weatherByDate,
          irrigationByDate: irrigationByPivot.get(pivot.id as string) ?? {},
          dateStart,
          dateEnd,
        },
      );
      result.push(state);
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
