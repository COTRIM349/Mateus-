export type SensorType =
  | "umidade_solo"
  | "temperatura_solo"
  | "nivel_reservatorio"
  | "vazao"
  | "pressao"
  | "pluviometro"
  | "estacao_meteorologica";

export type SensorStatus = "online" | "offline" | "alerta" | "manutencao";

export interface Sensor {
  id: string;
  farmId: string;
  pivotId: string | null;
  reservoirId: string | null;
  name: string;
  type: SensorType;
  model: string;
  unit: string;
  /** Intervalo de leitura em minutos. */
  readingInterval: number;
  status: SensorStatus;
  latitude: number;
  longitude: number;
  installedAt: Date;
  lastReadingAt: Date | null;
  active: boolean;
}

export interface SensorReading {
  id: string;
  sensorId: string;
  timestamp: Date;
  value: number;
  unit: string;
}
