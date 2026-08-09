export interface IvanovEtoInput {
  date: string;
  temperatureMeanC: number | null;
  relativeHumidityMeanPct: number | null;
}

export interface IvanovEtoResult {
  etoMmDay: number | null;
  etoMmMonth: number | null;
  method: "ivanov_1954";
  formulaVersion: "ivanov-1954-monthly-daily-equivalent-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  daysInMonth: number | null;
  missingFields: string[];
  warnings: string[];
}

function daysInIsoMonth(dateIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Ivanov mensal; o valor diário é o equivalente mensal dividido pelos dias do mês. */
export function calculateReferenceEtoIvanov(input: IvanovEtoInput): IvanovEtoResult {
  const missingFields: string[] = [];
  const temperature = input.temperatureMeanC;
  const humidity = input.relativeHumidityMeanPct;
  const monthDays = daysInIsoMonth(input.date);

  if (temperature === null || !Number.isFinite(temperature)) missingFields.push("temperatureMeanC");
  if (humidity === null || !Number.isFinite(humidity)) missingFields.push("relativeHumidityMeanPct");
  if (monthDays === null) missingFields.push("date");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      etoMmMonth: null,
      method: "ivanov_1954",
      formulaVersion: "ivanov-1954-monthly-daily-equivalent-v1",
      qualityStatus: "missing",
      daysInMonth: monthDays,
      missingFields,
      warnings: ["Ivanov exige temperatura média, umidade relativa e mês válido."],
    };
  }

  if ((humidity as number) < 0 || (humidity as number) > 100) {
    return {
      etoMmDay: null,
      etoMmMonth: null,
      method: "ivanov_1954",
      formulaVersion: "ivanov-1954-monthly-daily-equivalent-v1",
      qualityStatus: "invalid",
      daysInMonth: monthDays,
      missingFields: [],
      warnings: ["Umidade relativa fora de 0–100%."],
    };
  }

  const etoMmMonth = 0.0018 * ((temperature as number) + 25) ** 2 * (100 - (humidity as number));
  const etoMmDay = etoMmMonth / (monthDays as number);

  return {
    etoMmDay: Number.isFinite(etoMmDay) ? Math.max(etoMmDay, 0) : null,
    etoMmMonth: Number.isFinite(etoMmMonth) ? Math.max(etoMmMonth, 0) : null,
    method: "ivanov_1954",
    formulaVersion: "ivanov-1954-monthly-daily-equivalent-v1",
    qualityStatus: Number.isFinite(etoMmDay) ? "estimated" : "invalid",
    daysInMonth: monthDays,
    missingFields: [],
    warnings: ["Equação originalmente mensal; a tela apresenta somente o equivalente diário do mês."],
  };
}
