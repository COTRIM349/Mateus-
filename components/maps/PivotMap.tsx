"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface PivotMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active?: boolean;
  /** cor do círculo (status hídrico); default verde */
  color?: string;
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

      const circle = L.circle(latlng, {
        radius: pivot.radiusMeters || 300,
        color: isHighlighted ? "#2563eb" : baseColor,
        fillColor: baseColor,
        fillOpacity: isHighlighted ? 0.4 : 0.25,
        weight: isHighlighted ? 4 : 2,
      })
        .addTo(map)
        .bindTooltip(pivot.name, {
          permanent: pivots.length <= 20,
          direction: "top",
          className: "leaflet-pivot-label",
        });

      if (onSelect) {
        circle.on("click", () => onSelect(pivot.id));
        circle.getElement()?.setAttribute("style", "cursor:pointer");
      }

      const icon = L.divIcon({
        className: "pivot-center-icon",
        html: `<div style="width:8px;height:8px;border-radius:50%;background:${isHighlighted ? "#2563eb" : baseColor};border:2px solid white;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker(latlng, { icon }).addTo(map);

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
      className={className ?? "h-[400px] w-full rounded-lg border border-gray-200 dark:border-graphite-700"}
    />
  );
}

