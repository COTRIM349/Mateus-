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
}

interface PivotMapProps {
  pivots: PivotMarker[];
  highlightId?: string;
  center?: { lat: number; lng: number };
  className?: string;
}

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export function PivotMap({ pivots, highlightId, center, className }: PivotMapProps) {
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

      L.circle(latlng, {
        radius: pivot.radiusMeters || 300,
        color: isHighlighted ? "#2563eb" : "#22c55e",
        fillColor: isHighlighted ? "#3b82f6" : "#4ade80",
        fillOpacity: isHighlighted ? 0.25 : 0.15,
        weight: isHighlighted ? 3 : 2,
      })
        .addTo(map)
        .bindTooltip(pivot.name, {
          permanent: pivots.length <= 20,
          direction: "top",
          className: "leaflet-pivot-label",
        });

      const icon = L.divIcon({
        className: "pivot-center-icon",
        html: `<div style="width:8px;height:8px;border-radius:50%;background:${isHighlighted ? "#2563eb" : "#16a34a"};border:2px solid white;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker(latlng, { icon }).addTo(map);

      bounds.extend(latlng);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [pivots, highlightId]);

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

