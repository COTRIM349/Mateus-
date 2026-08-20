export type SoilTexture =
  | "arenoso"
  | "franco-arenoso"
  | "franco"
  | "franco-argiloso"
  | "argiloso"
  | "muito-argiloso";

export interface Soil {
  id: string;
  name: string;
  texture: SoilTexture;
  /** Capacidade de campo (cm³/cm³). */
  fieldCapacity: number;
  /** Ponto de murcha permanente (cm³/cm³). */
  wiltingPoint: number;
  /** Densidade aparente (g/cm³). */
  bulkDensity: number;
  /** Velocidade de infiltração básica (mm/h). */
  infiltrationRate: number;
}

export interface SoilLayer {
  id: string;
  soilId: string;
  /** Profundidade inicial (cm). */
  depthStartCm: number;
  /** Profundidade final (cm). */
  depthEndCm: number;
  texture: SoilTexture;
  /** Densidade aparente (g/cm³) — informativa. */
  bulkDensity: number;
  /** Capacidade de campo volumétrica (cm³/cm³). */
  fieldCapacity: number;
  /** Ponto de murcha permanente volumétrico (cm³/cm³). */
  wiltingPoint: number;
  /** Coeficiente de localização 0–1. Null = 1 (pivô central). */
  kl: number | null;
  observations: string | null;
}
