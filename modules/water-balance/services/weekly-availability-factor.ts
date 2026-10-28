import { calculateAdjustedDepletionFraction } from "@/modules/culture/services/agronomic-engine";
import { roundTo } from "@/utils/math";

/**
 * Segunda a domingo, em calendário UTC, para evitar mudanças pelo fuso do navegador.
 * O cálculo diário de ETc e ARM NÃO é alterado.
 */
export function mondayOfIsoWeek(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Data inválida ao calcular fator F semanal.");
  }
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysSinceMonday);
  return parsed.toISOString().slice(0, 10);
}

export interface WeeklyAvailabilityObservation {
  date: string;
  /** F base aprovado para cultura/cultivar/fase/override em cada dia. */
  baseP: number;
  /** ETo aprovada × Kc potencial, sem Kl nem Ks (evita circularidade). */
  etcPotentialMm: number;
}

export interface WeeklyAvailabilityResult {
  /** Mesmo F durante todos os dias observados da semana. */
  factor: number;
  weekStart: string;
  /** Amostras com ETo e cultura válidas no período fornecido. */
  sampleDays: number;
  meanEtcPotentialMm: number;
}

/**
 * F semanal = média aritmética dos ajustes FAO-56 individuais da semana.
 * Assim respeita inclusive alterações de p base ou limites 0,1–0,8.
 * 
 * Para semana incompleta, calcula somente com os dias efetivamente fornecidos:
 * nunca inventa ETo de dias futuros ou ausentes. A média da semana em curso
 * é atualizada quando dias medidos são incorporados ao recálculo.
 */
export function calculateWeeklyAvailabilityFactors(
  observations: WeeklyAvailabilityObservation[],
): Record<string, WeeklyAvailabilityResult> {
  const grouped = new Map<string, WeeklyAvailabilityObservation[]>();
  const seen = new Set<string>();
  for (const obs of observations) {
    if (seen.has(obs.date)) throw new Error("Data duplicada no fator F semanal.");
    seen.add(obs.date);
    if (![obs.baseP, obs.etcPotentialMm].every(Number.isFinite) ||
        obs.baseP <= 0 || obs.baseP >= 1 || obs.etcPotentialMm < 0) {
      throw new Error("Parâmetros inválidos para o fator F semanal.");
    }
    const week = mondayOfIsoWeek(obs.date);
    const items = grouped.get(week) ?? [];
    items.push(obs);
    grouped.set(week, items);
  }

  const result: Record<string, WeeklyAvailabilityResult> = {};
  grouped.forEach((days, weekStart) => {
    const adjusted = days.map((day) => calculateAdjustedDepletionFraction(day.baseP, day.etcPotentialMm));
    const meanFactor = roundTo(adjusted.reduce((sum, value) => sum + value, 0) / adjusted.length, 3);
    const meanEtcPotentialMm = roundTo(days.reduce((sum, day) => sum + day.etcPotentialMm, 0) / days.length, 3);
    for (const day of days) {
      result[day.date] = { factor: meanFactor, weekStart, sampleDays: days.length, meanEtcPotentialMm };
    }
  });
  return result;
}
