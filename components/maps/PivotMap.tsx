"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

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
    L.tileLayer(LABELS_URL, { maxZoom: 18 }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.Circle || layer instanceof L.Marker) {
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

      if (pivot.radiusMeters != null && pivot.radiusMeters > 0) {
        const circle = L.circle(latlng, {
          radius: pivot.radiusMeters,
          color: isHighlighted ? "#ffffff" : baseColor,
          fillColor: baseColor,
          fillOpacity: isHighlighted ? 0.45 : 0.32,
          weight: isHighlighted ? 3 : 2,
          dashArray: pivot.sheetIncomplete ? "6 4" : undefined,
        })
          .addTo(map)
          .bindTooltip(tooltip, {
            permanent: false,
            sticky: true,
            direction: "top",
            className: "leaflet-pivot-hover",
          });

        if (onSelect) {
          circle.on("click", () => onSelect(pivot.id));
          circle.getElement()?.setAttribute("style", "cursor:pointer");
        }
      }

      const icon = L.divIcon({
        className: "pivot-center-icon",
        html: `<div style="width:8px;height:8px;border-radius:50%;background:${isHighlighted ? "#ffffff" : baseColor};border:2px solid ${pivot.sheetIncomplete ? "#f97316" : "white"};box-shadow:0 0 0 1px ${baseColor};"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const marker = L.marker(latlng, { icon })
        .addTo(map)
        .bindTooltip(tooltip, {
          permanent: false,
          sticky: true,
          direction: "top",
          className: "leaflet-pivot-hover",
        });
      if (onSelect) {
        marker.on("click", () => onSelect(pivot.id));
      }

      bounds.extend(latlng);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
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
