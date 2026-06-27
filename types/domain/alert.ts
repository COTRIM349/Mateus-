export type AlertSeverity = "critico" | "alto" | "medio" | "baixo" | "info";
export type AlertCategory =
  | "deficit_hidrico"
  | "equipamento"
  | "sensor"
  | "reservatorio"
  | "energia"
  | "clima"
  | "sistema";

export interface Alert {
  id: string;
  farmId: string;
  pivotId: string | null;
  sensorId: string | null;
  reservoirId: string | null;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
}
