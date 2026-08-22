"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_HYDRIC_COLORS } from "@/modules/water-balance/services";
import { isFullCircleParcel } from "@/modules/assignment/services/parcel-geometry";
import { sectorLatLngs } from "@/utils/geo";
import type { PivotMarker } from "@/components/maps/PivotMap";
import {
  DRAWING_KIND_COLORS,
  type DrawTool,
  type GeoJsonGeometry,
  type MapDrawing,
} from "@/modules/vision-map/services";

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const FIELD_FILL = 0.33;
const FIELD_FILL_SELECTED = 0.42;
const RING_WEIGHT = 2.5;
const RING_WEIGHT_SELECTED = 3.5;

function ringColor(fill: string): string {
  if (fill === MAP_HYDRIC_COLORS.gray) return "#d1d5db";
  return fill;
}

function geometryLatLngs(geometry: GeoJsonGeometry): L.LatLngExpression[] {
  if (geometry.type === "Point") {
    return [[geometry.coordinates[1], geometry.coordinates[0]]];
  }
  const pairs = geometry.type === "Polygon" ? geometry.coordinates[0] ?? [] : geometry.coordinates;
  return pairs.map((c) => [c[1], c[0]] as L.LatLngExpression);
}

function pivotPositionKey(pivots: PivotMarker[]): string {
  return pivots
    .map(
      (p) =>
        `${p.id}:${p.latitude}:${p.longitude}:${p.radiusMeters}:${p.startAngleDeg ?? ""}:${p.endAngleDeg ?? ""}`,
    )
    .join("|");
}

interface VisionMapProps {
  pivots: PivotMarker[];
  drawings: MapDrawing[];
  drawTool: DrawTool;
  highlightId?: string;
  selectedDrawingId?: string | null;
  className?: string;
  onSelect?: (id: string) => void;
  onSelectDrawing?: (id: string) => void;
  onDrawingComplete?: (geometry: GeoJsonGeometry) => void;
}

/**
 * Mapa Vision: pivôs (círculo/setor, sem pino) + desenhos GIS + sketch nativo.
 * Camadas em LayerGroups separados para recolorir manejo sem apagar o desenho.
 */
export function VisionMap({
  pivots,
  drawings,
  drawTool,
  highlightId,
  selectedDrawingId,
  className,
  onSelect,
  onSelectDrawing,
  onDrawingComplete,
}: VisionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hydricGroupRef = useRef<L.LayerGroup | null>(null);
  const drawingsGroupRef = useRef<L.LayerGroup | null>(null);
  const sketchGroupRef = useRef<L.LayerGroup | null>(null);
  const sketchRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const fittedKeyRef = useRef<string>("");
  const drawToolRef = useRef(drawTool);
  const completeRef = useRef(onDrawingComplete);
  drawToolRef.current = drawTool;
  completeRef.current = onDrawingComplete;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-15.8, -47.8],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(SATELLITE_URL, { maxZoom: 18 }).addTo(map);
    hydricGroupRef.current = L.layerGroup().addTo(map);
    drawingsGroupRef.current = L.layerGroup().addTo(map);
    sketchGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      hydricGroupRef.current = null;
      drawingsGroupRef.current = null;
      sketchGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = hydricGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const pivot of pivots) {
      if (!pivot.latitude || !pivot.longitude) continue;
      const latlng: L.LatLngExpression = [pivot.latitude, pivot.longitude];
      const isHighlighted = pivot.id === highlightId;
      const baseColor = pivot.color ?? MAP_HYDRIC_COLORS.green;
      const tooltip = pivot.statusLabel ? `${pivot.name} · ${pivot.statusLabel}` : pivot.name;

      if (pivot.radiusMeters == null || pivot.radiusMeters <= 0) {
        bounds.extend(latlng);
        continue;
      }

      const style = {
        color: ringColor(baseColor),
        fillColor: baseColor,
        fillOpacity: isHighlighted ? FIELD_FILL_SELECTED : FIELD_FILL,
        weight: isHighlighted ? RING_WEIGHT_SELECTED : RING_WEIGHT,
        opacity: 0.95,
        className: "pivot-hydric-circle",
        dashArray: pivot.sheetIncomplete ? "8 6" : undefined,
      };

      const sector = !isFullCircleParcel(pivot.startAngleDeg ?? null, pivot.endAngleDeg ?? null);
      const layer = sector
        ? L.polygon(
            sectorLatLngs(
              pivot.latitude,
              pivot.longitude,
              pivot.radiusMeters,
              pivot.startAngleDeg as number,
              pivot.endAngleDeg as number,
            ).map((p) => [p.lat, p.lng] as L.LatLngExpression),
            style,
          )
        : L.circle(latlng, { radius: pivot.radiusMeters, ...style });

      layer.bindTooltip(tooltip, {
        permanent: false,
        sticky: true,
        direction: "top",
        opacity: 0.95,
        className: "leaflet-pivot-hover",
      });

      if (onSelect) {
        layer.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (drawToolRef.current !== "select") return;
          onSelect(pivot.id);
        });
      }

      layer.addTo(group);
      if (layer instanceof L.Circle) bounds.extend(latlng);
      else bounds.extend(layer.getBounds());
    }

    const key = pivotPositionKey(pivots);
    if (bounds.isValid() && fittedKeyRef.current !== key) {
      fittedKeyRef.current = key;
      map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16 });
    }
  }, [pivots, highlightId, onSelect]);

  useEffect(() => {
    const group = drawingsGroupRef.current;
    if (!group) return;
    group.clearLayers();

    for (const drawing of drawings) {
      const color = drawing.color || DRAWING_KIND_COLORS[drawing.kind];
      const selected = drawing.id === selectedDrawingId;
      const latlngs = geometryLatLngs(drawing.geometry);
      let layer: L.Layer;
      if (drawing.geometry.type === "Point") {
        layer = L.circleMarker(latlngs[0], {
          radius: selected ? 9 : 7,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: selected ? 3 : 2,
        });
      } else if (drawing.geometry.type === "LineString") {
        layer = L.polyline(latlngs, {
          color,
          weight: selected ? 4 : 3,
          opacity: 0.95,
        });
      } else {
        layer = L.polygon(latlngs, {
          color,
          fillColor: color,
          fillOpacity: selected ? 0.28 : 0.16,
          weight: selected ? 3 : 2,
        });
      }
      layer.bindTooltip(drawing.name, {
        sticky: true,
        direction: "top",
        opacity: 0.95,
        className: "leaflet-pivot-hover",
      });
      layer.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (drawToolRef.current !== "select") return;
        onSelectDrawing?.(drawing.id);
      });
      layer.addTo(group);
    }
  }, [drawings, selectedDrawingId, onSelectDrawing]);

  function paintSketch() {
    const group = sketchGroupRef.current;
    if (!group) return;
    group.clearLayers();
    const pts = sketchRef.current;
    if (pts.length === 0) return;
    const latlngs = pts.map((p) => [p.lat, p.lng] as L.LatLngExpression);
    const tool = drawToolRef.current;
    if (tool === "marker") {
      L.circleMarker(latlngs[0], {
        radius: 7,
        color: "#ffffff",
        fillColor: "#E91E63",
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(group);
      return;
    }
    if (pts.length === 1) {
      L.circleMarker(latlngs[0], { radius: 4, color: "#fff", fillColor: "#fff", fillOpacity: 1, weight: 1 }).addTo(group);
      return;
    }
    const line = L.polyline(latlngs, { color: "#ffffff", weight: 2, dashArray: "6 4", opacity: 0.95 });
    line.addTo(group);
    if (tool === "polygon" && pts.length >= 3) {
      L.polygon(latlngs, { color: "#ffffff", fillColor: "#8BC34A", fillOpacity: 0.12, weight: 1, dashArray: "6 4" }).addTo(
        group,
      );
    }
  }

  function finishSketch() {
    const tool = drawToolRef.current;
    if (tool === "select") return;
    const pts = sketchRef.current;
    let geometry: GeoJsonGeometry | null = null;
    if (tool === "marker" && pts[0]) {
      geometry = { type: "Point", coordinates: [pts[0].lng, pts[0].lat] };
    } else if (tool === "polyline" && pts.length >= 2) {
      geometry = { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) };
    } else if (tool === "polygon" && pts.length >= 3) {
      const ring = pts.map((p) => [p.lng, p.lat]);
      ring.push([pts[0].lng, pts[0].lat]);
      geometry = { type: "Polygon", coordinates: [ring] };
    }
    sketchRef.current = [];
    paintSketch();
    if (geometry) completeRef.current?.(geometry);
  }

  function cancelSketch() {
    sketchRef.current = [];
    paintSketch();
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawing = drawTool !== "select";
    map.getContainer().style.cursor = drawing ? "crosshair" : "";
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();

    const onClick = (e: L.LeafletMouseEvent) => {
      if (drawToolRef.current === "select") return;
      L.DomEvent.stopPropagation(e);
      const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (drawToolRef.current === "marker") {
        sketchRef.current = [pt];
        paintSketch();
        finishSketch();
        return;
      }
      sketchRef.current = [...sketchRef.current, pt];
      paintSketch();
    };
    const onDblClick = (e: L.LeafletMouseEvent) => {
      if (drawToolRef.current === "select") return;
      L.DomEvent.stop(e);
      finishSketch();
    };
    const onKey = (e: KeyboardEvent) => {
      if (drawToolRef.current === "select") return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelSketch();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        finishSketch();
      }
    };

    if (drawing) {
      map.on("click", onClick);
      map.on("dblclick", onDblClick);
      window.addEventListener("keydown", onKey);
    } else {
      cancelSketch();
    }

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      window.removeEventListener("keydown", onKey);
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = "";
    };
  }, [drawTool]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[400px] w-full rounded-2xl border border-gray-100 dark:border-white/[0.06]"}
    />
  );
}
