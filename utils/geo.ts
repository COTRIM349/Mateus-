export function radiusFromArea(areaHa: number): number {
  return Math.sqrt((areaHa * 10000) / Math.PI);
}

const EARTH_RADIUS_M = 6378137;

/**
 * Destino a `distanceMeters` no azimute `bearingDeg` (0 = norte).
 * Usado para desenhar a haste do pivô no mapa — não inventa raio.
 */
export function destinationLatLng(
  lat: number,
  lng: number,
  distanceMeters: number,
  bearingDeg: number,
): { lat: number; lng: number } {
  const angular = distanceMeters / EARTH_RADIUS_M;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

