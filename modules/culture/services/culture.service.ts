import { roundTo, clamp } from "@/utils/math";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CulturePhase {
  phase_order: number;
  name: string;
  days_after_plant: number;
  duration_days: number;
  /** Kc simples legado/referência. Não é usado pelo motor dual V3. */
  kc_start: number;
  kc_end: number;
  /** FAO-56 dual: coeficiente basal de cultura. */
  kcb_start?: number | null;
  kcb_end?: number | null;
  kcb_reference_source?: string | null;
  /** Cobertura e altura podem ser observadas/calibradas; null permite derivação auditável. */
  canopy_cover_start?: number | null;
  canopy_cover_end?: number | null;
  plant_height_start_m?: number | null;
  plant_height_end_m?: number | null;
  root_depth_start: number;
  root_depth_end: number;
  depletion_factor: number;
  phase_key?: string | null;
  id?: string;
  ky?: number | null;
  kl?: number | null;
  ks_function?: string | null;
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

  const progress = clamp(id.progress, 0, 1);
  const start = id.phase.kc_start;
  const end = id.phase.kc_end;
  const kc = start + (end - start) * progress;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return roundTo(clamp(kc, lo, hi), 3);
}

/** Interpolação diária do Kcb basal para o motor FAO-56 dual. */
export function interpolateKcb(
  phases: CulturePhase[],
  daysAfterPlant: number
): number | null {
  const id = identifyPhase(phases, daysAfterPlant);
  if (!id || id.phase.kcb_start == null || id.phase.kcb_end == null) return null;
  const progress = clamp(id.progress, 0, 1);
  return roundTo(id.phase.kcb_start + (id.phase.kcb_end - id.phase.kcb_start) * progress, 3);
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

export function generateDailyKcbCurve(
  phases: CulturePhase[],
  cycleDays: number
): { day: number; kcb: number | null; phase: string }[] {
  const curve: { day: number; kcb: number | null; phase: string }[] = [];
  for (let day = 0; day <= cycleDays; day++) {
    const id = identifyPhase(phases, day);
    curve.push({ day, kcb: interpolateKcb(phases, day), phase: id?.phase.name ?? "—" });
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
  if (culture.depletion_factor <= 0 || culture.depletion_factor >= 1) {
    issues.push({ field: "depletion_factor", level: "error", message: "Fator de depleção deve estar entre 0 e 1" });
  }
  return issues;
}
