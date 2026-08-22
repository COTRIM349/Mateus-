"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers";
import { hydricStateId } from "@/components/maps/hydric-map-markers";
import type { PivotHydricState } from "@/modules/water-balance/services";
import {
  DRAWING_KIND_CONFIG,
  DRAWING_KIND_LABELS,
  mapDbDrawing,
  validateDrawingForKind,
  type DrawingKind,
  type DrawTool,
  type GeoJsonGeometry,
  type MapDrawing,
  type VisionLayer,
  costSlicesFromEvents,
  toVisionMarkers,
  type OrbitalMoistureSample,
  type ParcelCostSlice,
} from "@/modules/vision-map/services";

const COST_WINDOW_DAYS = 30;

export function useVisionMap(states: PivotHydricState[], date?: string | null) {
  const { activeFarmId, profile } = useAuth();
  const supabase = createClient();

  const [layer, setLayer] = useState<VisionLayer>("manejo");
  const [drawKind, setDrawKind] = useState<DrawingKind | "select">("select");
  const [drawings, setDrawings] = useState<MapDrawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [orbital, setOrbital] = useState<OrbitalMoistureSample[]>([]);
  const [costs, setCosts] = useState<ParcelCostSlice[]>([]);
  const [orbitalAttribution, setOrbitalAttribution] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const drawTool: DrawTool = drawKind === "select" ? "select" : DRAWING_KIND_CONFIG[drawKind].tool;

  const loadDrawings = useCallback(async () => {
    if (!activeFarmId) {
      setDrawings([]);
      return;
    }
    const { data, error } = await supabase
      .from("map_drawings")
      .select("id, farm_id, name, kind, geometry, color, notes")
      .eq("farm_id", activeFarmId)
      .order("created_at", { ascending: true });
    if (error) {
      setMessage(error.message);
      setDrawings([]);
      return;
    }
    setDrawings((data ?? []).map(mapDbDrawing).filter((d): d is MapDrawing => d != null));
  }, [activeFarmId, supabase]);

  const loadCosts = useCallback(async () => {
    if (!activeFarmId) {
      setCosts([]);
      return;
    }
    const pivotIds = Array.from(new Set(states.map((s) => s.pivotId)));
    if (pivotIds.length === 0) {
      setCosts([]);
      return;
    }
    const since = new Date(Date.now() - COST_WINDOW_DAYS * 86400000).toISOString();
    const { data, error } = await supabase
      .from("irrigation_events")
      .select("pivot_id, parcel_id, cost")
      .in("pivot_id", pivotIds)
      .gte("started_at", since);
    if (error) {
      setCosts([]);
      return;
    }
    const areaByKey = new Map<string, number>();
    for (const state of states) {
      const key = hydricStateId(state);
      areaByKey.set(key, state.area);
      if (!areaByKey.has(state.pivotId)) areaByKey.set(state.pivotId, state.area);
    }
    setCosts(
      costSlicesFromEvents(
        (data ?? []).map((row) => ({
          parcelId: (row.parcel_id as string | null) ?? null,
          pivotId: row.pivot_id as string,
          cost: row.cost == null ? null : Number(row.cost),
        })),
        areaByKey,
      ),
    );
  }, [activeFarmId, states, supabase]);

  const loadCachedOrbital = useCallback(async (): Promise<OrbitalMoistureSample[]> => {
    if (!activeFarmId) {
      setOrbital([]);
      return [];
    }
    const res = await fetch(`/api/climate/orbital-moisture?farmId=${encodeURIComponent(activeFarmId)}`);
    if (!res.ok) return [];
    const payload = (await res.json()) as { samples?: OrbitalMoistureSample[]; attribution?: string };
    const samples = payload.samples ?? [];
    setOrbital(samples);
    if (payload.attribution) setOrbitalAttribution(payload.attribution);
    return samples;
  }, [activeFarmId]);

  const refreshOrbital = useCallback(async () => {
    if (!activeFarmId) return;
    const seen = new Set<string>();
    const points: Array<{ id: string; latitude: number; longitude: number }> = [];
    for (const state of states) {
      if (seen.has(state.pivotId)) continue;
      seen.add(state.pivotId);
      if (!state.latitude || !state.longitude) continue;
      points.push({ id: state.pivotId, latitude: state.latitude, longitude: state.longitude });
    }
    if (points.length === 0) {
      setMessage("Nenhum pivô com coordenada para umidade orbital.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/climate/orbital-moisture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId: activeFarmId, points }),
      });
      const payload = (await res.json()) as {
        error?: string;
        samples?: OrbitalMoistureSample[];
        attribution?: string;
      };
      if (!res.ok) {
        setMessage(payload.error ?? "Falha ao buscar umidade orbital.");
        return;
      }
      setOrbital(payload.samples ?? []);
      if (payload.attribution) setOrbitalAttribution(payload.attribution);
    } finally {
      setBusy(false);
    }
  }, [activeFarmId, states]);

  useEffect(() => {
    void loadDrawings();
  }, [loadDrawings]);

  useEffect(() => {
    if (layer === "custo") void loadCosts();
  }, [layer, loadCosts]);

  useEffect(() => {
    if (layer !== "orbital" || !activeFarmId) return;
    let cancelled = false;
    void (async () => {
      const cached = await loadCachedOrbital();
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      const stale = cached.length === 0 || cached.every((s) => s.sampledAt.slice(0, 10) < today);
      if (stale) await refreshOrbital();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, activeFarmId]);

  const createDrawing = useCallback(
    async (kind: DrawingKind, geometry: GeoJsonGeometry) => {
      if (!activeFarmId) return;
      const checked = validateDrawingForKind(kind, geometry);
      if (!checked.ok) {
        setMessage(checked.error ?? "Geometria inválida.");
        return;
      }
      const count = drawings.filter((d) => d.kind === kind).length + 1;
      const name = `${DRAWING_KIND_LABELS[kind]} ${count}`;
      const color = DRAWING_KIND_CONFIG[kind].color;
      const { data, error } = await supabase
        .from("map_drawings")
        .insert({
          farm_id: activeFarmId,
          name,
          kind,
          geometry: checked.geometry,
          color,
          created_by: profile?.id ?? null,
        })
        .select("id, farm_id, name, kind, geometry, color, notes")
        .single();
      if (error) {
        setMessage(error.message);
        return;
      }
      const mapped = data ? mapDbDrawing(data) : null;
      if (mapped) {
        setDrawings((prev) => [...prev, mapped]);
        setSelectedDrawingId(mapped.id);
      }
      setDrawKind("select");
      setMessage("");
    },
    [activeFarmId, drawings, profile?.id, supabase],
  );

  const deleteDrawing = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("map_drawings").delete().eq("id", id);
      if (error) {
        setMessage(error.message);
        return;
      }
      setDrawings((prev) => prev.filter((d) => d.id !== id));
      if (selectedDrawingId === id) setSelectedDrawingId(null);
    },
    [selectedDrawingId, supabase],
  );

  const markers = useMemo(
    () => toVisionMarkers(states, layer, { date, orbital, costs }),
    [states, layer, date, orbital, costs],
  );

  return {
    layer,
    setLayer,
    drawKind,
    setDrawKind,
    drawTool,
    drawings,
    selectedDrawingId,
    setSelectedDrawingId,
    createDrawing,
    deleteDrawing,
    markers,
    orbitalAttribution,
    message,
    busy,
    refreshOrbital,
  };
}
