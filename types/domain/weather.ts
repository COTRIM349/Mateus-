export interface WeatherReading {
  id: string;
  farmId: string;
  date: Date;
  /** Temperatura máxima em °C. */
  tempMax: number;
  /** Temperatura mínima em °C. */
  tempMin: number;
  /** Temperatura média em °C. */
  tempMean: number;
  /** Umidade relativa média (%). */
  humidity: number;
  /** Velocidade do vento a 2 m (m/s). */
  windSpeed: number;
  /** Radiação solar (MJ/m²/dia). */
  solarRadiation: number;
  /** Precipitação (mm). */
  precipitation: number;
  /** Insolação (horas). */
  sunshine: number;
}

/** Dados necessários para o cálculo de ET0 por Penman-Monteith FAO-56. */
export interface ET0Input {
  tempMax: number;
  tempMin: number;
  humidity: number;
  windSpeed: number;
  solarRadiation: number;
  /** Altitude da estação em metros. */
  altitude: number;
  /** Latitude em graus decimais. */
  latitude: number;
  /** Dia do ano (1-365). */
  dayOfYear: number;
}
