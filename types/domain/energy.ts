export type TariffType = "verde" | "azul" | "convencional";
export type TariffPeriod = "ponta" | "fora_ponta" | "reservado";

export interface EnergyTariff {
  id: string;
  farmId: string;
  tariffType: TariffType;
  /** Tarifa de demanda (R$/kW). */
  demandRate: number;
  /** Tarifa de consumo por período (R$/kWh). */
  consumptionRates: Record<TariffPeriod, number>;
  /** Horário de ponta: início (hora). */
  peakStart: number;
  /** Horário de ponta: fim (hora). */
  peakEnd: number;
  validFrom: Date;
  validTo: Date | null;
}

export interface EnergyConsumption {
  id: string;
  pivotId: string;
  date: Date;
  /** Tempo de operação em horas. */
  operatingHours: number;
  /** Consumo em kWh. */
  consumption: number;
  /** Custo em R$. */
  cost: number;
  period: TariffPeriod;
}

export interface EnergyCalculationInput {
  /** Potência da bomba em CV. */
  pumpPower: number;
  /** Tempo de irrigação em horas. */
  irrigationTime: number;
  /** Tarifa aplicável (R$/kWh). */
  tariffRate: number;
  /** Rendimento do motor (0-1). */
  motorEfficiency: number;
}
