export function radiusFromArea(areaHa: number): number {
  return Math.sqrt((areaHa * 10000) / Math.PI);
}

const EARTH_RADIUS_M = 6378137;

/**
 * Destino a `distanceMeters` no azimute `bearingDeg` (0 = norte).
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

/**
 * Polígono do quadrante: centro do pivô + arco no azimute (0° = norte, horário).
 * Não inventa raio nem desloca o centro.
 */
export function sectorLatLngs(
  lat: number,
  lng: number,
  radiusMeters: number,
  startAngleDeg: number,
  endAngleDeg: number,
  stepDeg = 4,
): Array<{ lat: number; lng: number }> {
  const start = ((startAngleDeg % 360) + 360) % 360;
  const endNorm = endAngleDeg === 360 ? 360 : ((endAngleDeg % 360) + 360) % 360;
  let sweep = (endNorm - start + 360) % 360;
  if (sweep === 0) sweep = 360;
  const steps = Math.max(8, Math.ceil(sweep / stepDeg));
  const arc: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = start + (sweep * i) / steps;
    arc.push(destinationLatLng(lat, lng, radiusMeters, bearing));
  }
  return [{ lat, lng }, ...arc, { lat, lng }];
}

