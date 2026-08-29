"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_HYDRIC_COLORS } from "@/modules/water-balance/services";
import { isFullCircleParcel } from "@/modules/assignment/services/parcel-geometry";
import { sectorLatLngs } from "@/utils/geo";

export interface PivotMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Raio da ficha técnica. Null = não desenha círculo inventado. */
  radiusMeters: number | null;
  /** Ângulo inicial do quadrante (0° = norte, horário). Null = pivô inteiro. */
  startAngleDeg?: number | null;
  endAngleDeg?: number | null;
  active?: boolean;
  color?: string;
  sheetIncomplete?: boolean;
  statusLabel?: string;
}

interface PivotMapProps {
  pivots: PivotMarker[];
  highlightId?: string;
  center?: { lat: number; lng: number };
  className?: string;
  onSelect?: (id: string) => void;
}

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * Pivô no recorte clássico de manejo (Agrosmart Aqua):
 * círculo ou quadrante na cor do status, borda da mesma cor,
 * lavoura visível, sem pino no centro. Sempre na coordenada do equipamento.
 */
const FIELD_FILL = 0.33;
const FIELD_FILL_SELECTED = 0.42;
const RING_WEIGHT = 2.5;
const RING_WEIGHT_SELECTED = 3.5;

function ringColor(fill: string): string {
  if (fill === MAP_HYDRIC_COLORS.gray) return "#d1d5db";
  return fill;
}

export function PivotMap({ pivots, highlightId, center, className, onSelect }: PivotMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const defaultCenter: L.LatLngExpression = center
      ? [center.lat, center.lng]
      : [-15.8, -47.8];

    const map = L.map(containerRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(SATELLITE_URL, { maxZoom: 18 }).addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (
        layer instanceof L.Circle ||
        layer instanceof L.CircleMarker ||
        layer instanceof L.Marker ||
        layer instanceof L.Polyline ||
        layer instanceof L.Polygon
      ) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);

    for (const pivot of pivots) {
      if (!pivot.latitude || !pivot.longitude) continue;
      const latlng: L.LatLngExpression = [pivot.latitude, pivot.longitude];
      const isHighlighted = pivot.id === highlightId;
      const baseColor = pivot.color ?? MAP_HYDRIC_COLORS.lightGreen;
      const tooltip = pivot.statusLabel
        ? `${pivot.name} · ${pivot.statusLabel}`
        : pivot.name;

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

      layer
        .addTo(map)
        .bindTooltip(tooltip, {
          permanent: false,
          sticky: true,
          direction: "top",
          opacity: 0.95,
          className: "leaflet-pivot-hover",
        });

      if (onSelect) {
        layer.on("click", () => onSelect(pivot.id));
      }

      if (layer instanceof L.Circle) {
        bounds.extend(latlng);
      } else {
        bounds.extend(layer.getBounds());
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16 });
    }
  }, [pivots, highlightId, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.setView([center.lat, center.lng], 15, { animate: true });
  }, [center]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[400px] w-full rounded-2xl border border-gray-100 dark:border-white/[0.06]"}
    />
  );
}
