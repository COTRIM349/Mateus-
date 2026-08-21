/**
 * Geometria do pivô para o mapa hídrico.
 *
 * Nunca usar raio fixo (ex.: 300 m) nem derivar raio da área no momento
 * do desenho. O círculo usa a ficha técnica:
 *   1. raio da última torre + vão em balanço, quando o raio da torre existe;
 *   2. senão o raio total cadastrado (`pivots.radius`).
 *
 * Se o essencial faltar, sinaliza ficha incompleta — não inventa geometria.
 */

export interface PivotGeometryInput {
  radiusM?: number | null;
  lastTowerRadiusM?: number | null;
  overhangM?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PivotMapGeometry {
  /** Raio irrigado em metros, ou null se a ficha não tem geometria. */
  radiusMeters: number | null;
  sheetIncomplete: boolean;
  missing: string[];
}

function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function resolvePivotMapGeometry(input: PivotGeometryInput): PivotMapGeometry {
  const missing: string[] = [];
  const lastTower = positive(input.lastTowerRadiusM);
  const overhang = input.overhangM != null && Number.isFinite(input.overhangM) && input.overhangM >= 0
    ? input.overhangM
    : 0;
  const totalRadius = positive(input.radiusM);

  let radiusMeters: number | null = null;
  if (lastTower != null) {
    radiusMeters = lastTower + overhang;
  } else if (totalRadius != null) {
    radiusMeters = totalRadius;
  } else {
    missing.push("raio");
  }

  if (input.latitude == null || !Number.isFinite(input.latitude) || input.latitude === 0) {
    missing.push("latitude");
  }
  if (input.longitude == null || !Number.isFinite(input.longitude) || input.longitude === 0) {
    missing.push("longitude");
  }

  return {
    radiusMeters,
    sheetIncomplete: missing.length > 0,
    missing,
  };
}
