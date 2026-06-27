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
