import { roundTo, average } from "@/utils/math";

export interface WeatherReadingRow {
  id: string;
  station_id: string;
  date: string;
  temp_max: number;
  temp_min: number;
  temp_mean: number;
  humidity: number;
  wind_speed: number;
  solar_radiation: number | null;
  precipitation: number;
  sunshine: number | null;
  et0_calculated: number | null;
}

export interface WeatherValidation {
  field: string;
  level: "error" | "warning";
  message: string;
}

export function calculateEffectivePrecipitation(precipitation: number): number {
  if (precipitation <= 0) return 0;
  if (precipitation <= 250) {
    return roundTo((precipitation * (125 - 0.2 * precipitation)) / 125, 2);
  }
  return roundTo(125 + 0.1 * precipitation, 2);
}

export function averageTemperature(readings: WeatherReadingRow[]): number {
  if (readings.length === 0) return 0;
  return roundTo(average(readings.map((r) => r.temp_mean)), 1);
}

export function totalPrecipitation(readings: WeatherReadingRow[]): number {
  return roundTo(readings.reduce((s, r) => s + r.precipitation, 0), 1);
}

export function averageET0(readings: WeatherReadingRow[]): number {
  const withEt0 = readings.filter((r) => r.et0_calculated != null);
  if (withEt0.length === 0) return 0;
  return roundTo(average(withEt0.map((r) => r.et0_calculated!)), 2);
}

export function totalET0(readings: WeatherReadingRow[]): number {
  return roundTo(
    readings.reduce((s, r) => s + (r.et0_calculated ?? 0), 0),
    2
  );
}

export function averageHumidity(readings: WeatherReadingRow[]): number {
  if (readings.length === 0) return 0;
  return roundTo(average(readings.map((r) => r.humidity)), 1);
}

export function averageWindSpeed(readings: WeatherReadingRow[]): number {
  if (readings.length === 0) return 0;
  return roundTo(average(readings.map((r) => r.wind_speed)), 1);
}

export function periodSummary(readings: WeatherReadingRow[]) {
  return {
    days: readings.length,
    avgTemp: averageTemperature(readings),
    totalPrecip: totalPrecipitation(readings),
    totalEffPrecip: roundTo(
      readings.reduce(
        (s, r) => s + calculateEffectivePrecipitation(r.precipitation),
        0
      ),
      1
    ),
    avgET0: averageET0(readings),
    totalET0: totalET0(readings),
    avgHumidity: averageHumidity(readings),
    avgWind: averageWindSpeed(readings),
  };
}

export function validateWeatherReading(reading: {
  et0_calculated: number | null;
  precipitation: number;
  temp_max: number;
  temp_min: number;
  temp_mean: number;
  humidity: number;
  wind_speed: number;
  solar_radiation: number | null;
}): WeatherValidation[] {
  const issues: WeatherValidation[] = [];

  if (reading.et0_calculated != null && reading.et0_calculated < 0) {
    issues.push({ field: "et0_calculated", level: "error", message: "ET₀ não pode ser negativa" });
  }
  if (reading.et0_calculated != null && reading.et0_calculated > 15) {
    issues.push({ field: "et0_calculated", level: "warning", message: "ET₀ acima de 15 mm/dia é atípica" });
  }
  if (reading.precipitation < 0) {
    issues.push({ field: "precipitation", level: "error", message: "Precipitação não pode ser negativa" });
  }
  if (reading.precipitation > 200) {
    issues.push({ field: "precipitation", level: "warning", message: "Precipitação acima de 200 mm/dia é atípica" });
  }
  if (reading.temp_max < -10 || reading.temp_max > 55) {
    issues.push({ field: "temp_max", level: "warning", message: "Temperatura máxima fora do intervalo esperado (-10 a 55°C)" });
  }
  if (reading.temp_min < -15 || reading.temp_min > 45) {
    issues.push({ field: "temp_min", level: "warning", message: "Temperatura mínima fora do intervalo esperado (-15 a 45°C)" });
  }
  if (reading.temp_min > reading.temp_max) {
    issues.push({ field: "temp_min", level: "error", message: "Temperatura mínima maior que a máxima" });
  }
  if (reading.temp_mean < reading.temp_min || reading.temp_mean > reading.temp_max) {
    issues.push({ field: "temp_mean", level: "warning", message: "Temperatura média fora do intervalo mín-máx" });
  }
  if (reading.humidity < 0 || reading.humidity > 100) {
    issues.push({ field: "humidity", level: "error", message: "Umidade relativa deve estar entre 0% e 100%" });
  }
  if (reading.wind_speed < 0) {
    issues.push({ field: "wind_speed", level: "error", message: "Velocidade do vento não pode ser negativa" });
  }
  if (reading.wind_speed > 30) {
    issues.push({ field: "wind_speed", level: "warning", message: "Velocidade do vento acima de 30 m/s é atípica" });
  }
  if (reading.solar_radiation != null && reading.solar_radiation < 0) {
    issues.push({ field: "solar_radiation", level: "error", message: "Radiação solar não pode ser negativa" });
  }
  if (reading.solar_radiation != null && reading.solar_radiation > 40) {
    issues.push({ field: "solar_radiation", level: "warning", message: "Radiação solar acima de 40 MJ/m²/dia é atípica" });
  }

  return issues;
}

export interface StationWithPriority {
  id: string;
  name: string;
  source_priority: number;
  active: boolean;
}

export function selectPriorityStation(stations: StationWithPriority[]): StationWithPriority | null {
  const active = stations.filter((s) => s.active);
  if (active.length === 0) return null;
  return active.sort((a, b) => a.source_priority - b.source_priority)[0];
}

export function prepareForWaterBalance(reading: WeatherReadingRow) {
  return {
    date: reading.date,
    et0: reading.et0_calculated ?? 0,
    precipitation: reading.precipitation,
    effectivePrecipitation: calculateEffectivePrecipitation(reading.precipitation),
  };
}
