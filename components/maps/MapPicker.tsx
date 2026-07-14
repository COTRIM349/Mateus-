"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface OtherPivot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface MapPickerProps {
  /** ponto atual (centro do pivô), ou null quando ainda não marcado */
  value: { lat: number; lng: number } | null;
  /** chamado ao clicar/arrastar o marcador com as novas coordenadas */
  onChange: (lat: number, lng: number) => void;
  /** raio do círculo de pré-visualização (m) */
  radiusMeters?: number;
  /** demais pivôs, apenas para contexto visual */
  otherPivots?: OtherPivot[];
  className?: string;
}

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

/**
 * Seletor de ponto no mapa (tela cheia). Permite clicar ou arrastar para marcar
 * o centro do pivô e reporta as coordenadas via onChange. Componente próprio,
 * separado do PivotMap para não afetar o mapa do dashboard/lista.
 */
export function MapPicker({ value, onChange, radiusMeters = 0, otherPivots = [], className }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const contextPivot = otherPivots.find((p) => p.latitude && p.longitude);
    const center: L.LatLngExpression = value
      ? [value.lat, value.lng]
      : contextPivot
        ? [contextPivot.latitude, contextPivot.longitude]
        : [-15.8, -47.8];

    const map = L.map(containerRef.current, {
      center,
      zoom: value ? 15 : 13,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(SATELLITE_URL, { maxZoom: 19 }).addTo(map);
    L.tileLayer(LABELS_URL, { maxZoom: 19 }).addTo(map);

    // demais pivôs, apenas contexto
    for (const p of otherPivots) {
      if (!p.latitude || !p.longitude) continue;
      L.circle([p.latitude, p.longitude], {
        radius: p.radiusMeters || 300,
        color: "#94a3b8",
        fillColor: "#cbd5e1",
        fillOpacity: 0.1,
        weight: 1,
      })
        .addTo(map)
        .bindTooltip(p.name, { direction: "top" });
    }

    const place = (lat: number, lng: number) => {
      if (!markerRef.current) {
        const icon = L.divIcon({
          className: "pivot-picker-icon",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 1px #2563eb"></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current!.getLatLng();
          if (circleRef.current) circleRef.current.setLatLng(ll);
          onChangeRef.current(ll.lat, ll.lng);
        });
      } else {
        markerRef.current.setLatLng([lat, lng]);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]).setRadius(radiusMeters || 300);
      } else {
        circleRef.current = L.circle([lat, lng], {
          radius: radiusMeters || 300,
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 0.2,
          weight: 2,
        }).addTo(map);
      }
    };

    map.on("click", (e: L.LeafletMouseEvent) => {
      place(e.latlng.lat, e.latlng.lng);
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    if (value) place(value.lat, value.lng);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // atualiza o raio da pré-visualização quando a área muda
  useEffect(() => {
    if (circleRef.current && radiusMeters > 0) circleRef.current.setRadius(radiusMeters);
  }, [radiusMeters]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[400px] w-full rounded-2xl border border-gray-100 dark:border-graphite-700/50"}
    />
  );
}
