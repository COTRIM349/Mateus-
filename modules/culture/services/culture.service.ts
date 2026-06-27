import { roundTo, clamp } from "@/utils/math";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CulturePhase {
  phase_order: number;
  name: string;
  days_after_plant: number;
  duration_days: number;
  kc_start: number;
  kc_end: number;
  root_depth_start: number;
  root_depth_end: number;
  depletion_factor: number;
}

export interface PhaseIdentification {
  phase: CulturePhase;
  dayWithinPhase: number;
  progress: number;
}

export interface CultureValidation {
  field: string;
  level: "error" | "warning";
  message: string;
}

// ── Phase identification ─────────────────────────────────────────────────

export function identifyPhase(
  phases: CulturePhase[],
  daysAfterPlant: number
): PhaseIdentification | null {
  if (phases.length === 0) return null;

  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);

  for (const phase of sorted) {
    const phaseStart = phase.days_after_plant;
    const phaseEnd = phaseStart + phase.duration_days;

    if (daysAfterPlant >= phaseStart && daysAfterPlant < phaseEnd) {
      const dayWithin = daysAfterPlant - phaseStart;
      const progress = phase.duration_days > 0 ? dayWithin / phase.duration_days : 0;
      return { phase, dayWithinPhase: dayWithin, progress };
    }
  }

  const lastPhase = sorted[sorted.length - 1];
  const lastEnd = lastPhase.days_after_plant + lastPhase.duration_days;
  if (daysAfterPlant >= lastEnd) {
    return { phase: lastPhase, dayWithinPhase: lastPhase.duration_days, progress: 1 };
  }

  return null;
}

// ── Kc interpolation ─────────────────────────────────────────────────────

export function interpolateKc(
  phases: CulturePhase[],
  daysAfterPlant: number
): number {
  const id = identifyPhase(phases, daysAfterPlant);
  if (!id) {
    if (phases.length === 0) return 1.0;
    const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
    return sorted[0].kc_start;
  }

  const kc = id.phase.kc_start + (id.phase.kc_end - id.phase.kc_start) * id.progress;
  return roundTo(clamp(kc, 0, 2.5), 3);
}

export function generateDailyKcCurve(
  phases: CulturePhase[],
  cycleDays: number
): { day: number; kc: number; phase: string }[] {
  const curve: { day: number; kc: number; phase: string }[] = [];
  for (let day = 0; day <= cycleDays; day++) {
    const id = identifyPhase(phases, day);
    curve.push({
      day,
      kc: interpolateKc(phases, day),
      phase: id?.phase.name ?? "—",
    });
  }
  return curve;
}

// ── Root depth interpolation ─────────────────────────────────────────────

export function interpolateRootDepth(
  phases: CulturePhase[],
  daysAfterPlant: number
): number {
  const id = identifyPhase(phases, daysAfterPlant);
  if (!id) {
    if (phases.length === 0) return 0.3;
    const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
    return sorted[0].root_depth_start;
  }

  const depth =
    id.phase.root_depth_start +
    (id.phase.root_depth_end - id.phase.root_depth_start) * id.progress;
  return roundTo(Math.max(depth, 0.05), 3);
}

export function generateDailyRootCurve(
  phases: CulturePhase[],
  cycleDays: number
): { day: number; depth: number; phase: string }[] {
  const curve: { day: number; depth: number; phase: string }[] = [];
  for (let day = 0; day <= cycleDays; day++) {
    const id = identifyPhase(phases, day);
    curve.push({
      day,
      depth: interpolateRootDepth(phases, day),
      phase: id?.phase.name ?? "—",
    });
  }
  return curve;
}

// ── Depletion factor ─────────────────────────────────────────────────────

export function getDepletionFactor(
  phases: CulturePhase[],
  daysAfterPlant: number,
  fallback: number = 0.5
): number {
  const id = identifyPhase(phases, daysAfterPlant);
  if (!id) return fallback;
  return id.phase.depletion_factor;
}

export function adjustDepletionFactor(
  baseFactor: number,
  et0: number
): number {
  // FAO-56 adjustment: p = p_table + 0.04 * (5 - ETc)
  // Simplification using ET0 as proxy
  const adjusted = baseFactor + 0.04 * (5 - et0);
  return roundTo(clamp(adjusted, 0.1, 0.8), 3);
}

// ── Validation ───────────────────────────────────────────────────────────

export function validateCulture(culture: {
  name: string;
  cycle_days: number;
  root_depth: number;
  depletion_factor: number;
}): CultureValidation[] {
  const issues: CultureValidation[] = [];

  if (!culture.name.trim()) {
    issues.push({ field: "name", level: "error", message: "Nome é obrigatório" });
  }
  if (culture.cycle_days <= 0) {
    issues.push({ field: "cycle_days", level: "error", message: "Ciclo deve ser positivo" });
  }
  if (culture.cycle_days > 730) {
    issues.push({ field: "cycle_days", level: "warning", message: "Ciclo acima de 730 dias é atípico" });
  }
  if (culture.root_depth <= 0) {
    issues.push({ field: "root_depth", level: "error", message: "Profundidade da raiz deve ser positiva" });
  }
  if (culture.root_depth > 3) {
    issues.push({ field: "root_depth", level: "warning", message: "Profundidade acima de 3 m é atípica" });
  }
  if (culture.depletion_factor < 0 || culture.depletion_factor > 1) {
    issues.push({ field: "depletion_factor", level: "error", message: "Fator de depleção deve estar entre 0 e 1" });
  }

  return issues;
}

export function validatePhases(
  phases: { phase_order: number; days_after_plant: number; duration_days: number; kc_start: number; kc_end: number }[],
  cycleDays: number
): CultureValidation[] {
  const issues: CultureValidation[] = [];
  if (phases.length === 0) return issues;

  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);

  const orders = sorted.map((p) => p.phase_order);
  if (new Set(orders).size !== orders.length) {
    issues.push({ field: "phase_order", level: "error", message: "Ordem das fases deve ser única" });
  }

  let totalDays = 0;
  for (let i = 0; i < sorted.length; i++) {
    const phase = sorted[i];

    if (phase.duration_days <= 0) {
      issues.push({ field: `phase_${i}_duration`, level: "error", message: `Fase ${phase.phase_order}: duração deve ser positiva` });
    }

    if (phase.kc_start < 0 || phase.kc_start > 2.5 || phase.kc_end < 0 || phase.kc_end > 2.5) {
      issues.push({ field: `phase_${i}_kc`, level: "error", message: `Fase ${phase.phase_order}: Kc deve estar entre 0 e 2.5` });
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      const expectedStart = prev.days_after_plant + prev.duration_days;
      if (phase.days_after_plant < expectedStart) {
        issues.push({ field: `phase_${i}_overlap`, level: "error", message: `Fase ${phase.phase_order}: sobreposição com a fase anterior` });
      }
      if (phase.days_after_plant > expectedStart) {
        issues.push({ field: `phase_${i}_gap`, level: "warning", message: `Intervalo de ${phase.days_after_plant - expectedStart} dias entre fases ${prev.phase_order} e ${phase.phase_order}` });
      }
    }

    totalDays += phase.duration_days;
  }

  if (totalDays > 0 && Math.abs(totalDays - cycleDays) > 5) {
    issues.push({
      field: "total_days",
      level: "warning",
      message: `Soma das fases (${totalDays} dias) difere do ciclo da cultura (${cycleDays} dias)`,
    });
  }

  return issues;
}
