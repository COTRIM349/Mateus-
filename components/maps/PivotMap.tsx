"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { destinationLatLng } from "@/utils/geo";

export interface PivotMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Raio da ficha técnica. Null = não desenha círculo inventado. */
  radiusMeters: number | null;
  active?: boolean;
  color?: string;
  sheetIncomplete?: boolean;
  statusLabel?: string;
  /** Azimute da haste (0 = norte). Sem cadastro, usa o norte como no Scheduling. */
  boomBearingDeg?: number;
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

/** Preenchimento sólido no estilo das plataformas de manejo (Scheduling / FieldNET). */
const SOLID_FILL = 0.9;
const SOLID_FILL_SELECTED = 0.96;

function strokeFor(fill: string, selected: boolean): string {
  if (selected) return "#ffffff";
  if (fill === "#0a0a0a" || fill === "#111111" || fill === "#171717") return "#d4d4d8";
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
      if (layer instanceof L.Circle || layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);

    for (const pivot of pivots) {
      if (!pivot.latitude || !pivot.longitude) continue;
      const latlng: L.LatLngExpression = [pivot.latitude, pivot.longitude];
      const isHighlighted = pivot.id === highlightId;
      const baseColor = pivot.color ?? "#22c55e";
      const tooltip = pivot.statusLabel
        ? `${pivot.name} · ${pivot.statusLabel}`
        : pivot.name;

      if (pivot.radiusMeters == null || pivot.radiusMeters <= 0) {
        bounds.extend(latlng);
        continue;
      }

      const circle = L.circle(latlng, {
        radius: pivot.radiusMeters,
        color: strokeFor(baseColor, isHighlighted),
        fillColor: baseColor,
        fillOpacity: isHighlighted ? SOLID_FILL_SELECTED : SOLID_FILL,
        weight: isHighlighted ? 3 : 1.5,
        opacity: 1,
        className: "pivot-hydric-circle",
        dashArray: pivot.sheetIncomplete ? "7 5" : undefined,
      })
        .addTo(map)
        .bindTooltip(tooltip, {
          permanent: false,
          sticky: true,
          direction: "top",
          opacity: 0.95,
          className: "leaflet-pivot-hover",
        });

      const boomEnd = destinationLatLng(
        pivot.latitude,
        pivot.longitude,
        pivot.radiusMeters,
        pivot.boomBearingDeg ?? 0,
      );
      L.polyline([latlng, [boomEnd.lat, boomEnd.lng]], {
        color: "#f8fafc",
        weight: isHighlighted ? 2.5 : 1.75,
        opacity: 0.95,
        lineCap: "round",
        interactive: false,
        className: "pivot-hydric-boom",
      }).addTo(map);

      if (onSelect) {
        circle.on("click", () => onSelect(pivot.id));
      }

      bounds.extend(latlng);
      bounds.extend([boomEnd.lat, boomEnd.lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
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
