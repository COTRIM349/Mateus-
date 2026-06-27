export type ReservoirType = "represa" | "lago" | "poco" | "rio" | "reservatorio";

export interface Reservoir {
  id: string;
  farmId: string;
  name: string;
  type: ReservoirType;
  /** Capacidade máxima em m³. */
  maxCapacity: number;
  /** Volume atual em m³. */
  currentVolume: number;
  /** Nível mínimo operacional em m³. */
  minOperationalLevel: number;
  /** Vazão de recarga estimada em m³/h. */
  rechargeRate: number;
  latitude: number;
  longitude: number;
  active: boolean;
}
