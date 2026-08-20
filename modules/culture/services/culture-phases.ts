/**
 * Cadastro de cultura e fases (Etapa D).
 *
 * Duração (dias) é a linha do tempo editável. DAP (days_after_plant) é derivado
 * da soma sequencial das durações — não se edita à parte.
 * Kc, Ks, KL, Ky e p ficam no cadastro (fase/cultura). Interpolação contínua
 * no motor hídrico é Etapa E.
 */

export const PHASE_KEYS = [
  "emergencia",
  "vegetativo",
  "florescimento",
  "formacao_vagens",
  "enchimento_graos",
  "maturacao",
  "botoes",
  "formacao_macas",
  "enchimento",
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

export type CultureKind = "soja" | "algodao" | "outro";

export interface PhaseTemplate {
  phase_key: PhaseKey;
  name: string;
  duration_days: number;
  kc_start: number;
  kc_end: number;
  root_depth_start: number;
  root_depth_end: number;
  depletion_factor: number;
  ky: number | null;
  kl: number;
  color: string;
  itn_pct: number;
}

export interface PhaseTimelineRow extends PhaseTemplate {
  phase_order: number;
  days_after_plant: number;
}

export const SOJA_CYCLE_DAYS = 120;
export const ALGODAO_CYCLE_DAYS = 180;

/** Soja: emergência → vegetativo → florescimento → formação de vagens → enchimento de grãos → maturação. */
export const SOJA_PHASE_TEMPLATE: PhaseTemplate[] = [
  {
    phase_key: "emergencia",
    name: "Emergência",
    duration_days: 10,
    kc_start: 0.4,
    kc_end: 0.5,
    root_depth_start: 0.1,
    root_depth_end: 0.15,
    depletion_factor: 0.5,
    ky: 0.2,
    kl: 1,
    color: "#86efac",
    itn_pct: 100,
  },
  {
    phase_key: "vegetativo",
    name: "Vegetativo",
    duration_days: 25,
    kc_start: 0.5,
    kc_end: 1.0,
    root_depth_start: 0.15,
    root_depth_end: 0.4,
    depletion_factor: 0.5,
    ky: 0.4,
    kl: 1,
    color: "#4ade80",
    itn_pct: 100,
  },
  {
    phase_key: "florescimento",
    name: "Florescimento",
    duration_days: 20,
    kc_start: 1.0,
    kc_end: 1.15,
    root_depth_start: 0.4,
    root_depth_end: 0.5,
    depletion_factor: 0.5,
    ky: 0.8,
    kl: 1,
    color: "#facc15",
    itn_pct: 100,
  },
  {
    phase_key: "formacao_vagens",
    name: "Formação de vagens",
    duration_days: 20,
    kc_start: 1.15,
    kc_end: 1.15,
    root_depth_start: 0.5,
    root_depth_end: 0.55,
    depletion_factor: 0.5,
    ky: 1.0,
    kl: 1,
    color: "#fb923c",
    itn_pct: 100,
  },
  {
    phase_key: "enchimento_graos",
    name: "Enchimento de grãos",
    duration_days: 30,
    kc_start: 1.15,
    kc_end: 0.75,
    root_depth_start: 0.55,
    root_depth_end: 0.6,
    depletion_factor: 0.5,
    ky: 1.0,
    kl: 1,
    color: "#f97316",
    itn_pct: 100,
  },
  {
    phase_key: "maturacao",
    name: "Maturação",
    duration_days: 15,
    kc_start: 0.75,
    kc_end: 0.5,
    root_depth_start: 0.6,
    root_depth_end: 0.6,
    depletion_factor: 0.5,
    ky: 0.4,
    kl: 1,
    color: "#a3a3a3",
    itn_pct: 80,
  },
];

/** Algodão: emergência → vegetativo → botões → florescimento → formação de maçãs → enchimento → maturação. */
export const ALGODAO_PHASE_TEMPLATE: PhaseTemplate[] = [
  {
    phase_key: "emergencia",
    name: "Emergência",
    duration_days: 12,
    kc_start: 0.35,
    kc_end: 0.45,
    root_depth_start: 0.1,
    root_depth_end: 0.15,
    depletion_factor: 0.65,
    ky: 0.2,
    kl: 1,
    color: "#bbf7d0",
    itn_pct: 100,
  },
  {
    phase_key: "vegetativo",
    name: "Vegetativo",
    duration_days: 35,
    kc_start: 0.45,
    kc_end: 0.8,
    root_depth_start: 0.15,
    root_depth_end: 0.4,
    depletion_factor: 0.65,
    ky: 0.2,
    kl: 1,
    color: "#4ade80",
    itn_pct: 100,
  },
  {
    phase_key: "botoes",
    name: "Botões",
    duration_days: 25,
    kc_start: 0.8,
    kc_end: 1.05,
    root_depth_start: 0.4,
    root_depth_end: 0.55,
    depletion_factor: 0.65,
    ky: 0.4,
    kl: 1,
    color: "#fde047",
    itn_pct: 100,
  },
  {
    phase_key: "florescimento",
    name: "Florescimento",
    duration_days: 30,
    kc_start: 1.05,
    kc_end: 1.2,
    root_depth_start: 0.55,
    root_depth_end: 0.7,
    depletion_factor: 0.65,
    ky: 0.5,
    kl: 1,
    color: "#facc15",
    itn_pct: 100,
  },
  {
    phase_key: "formacao_macas",
    name: "Formação de maçãs",
    duration_days: 30,
    kc_start: 1.2,
    kc_end: 1.15,
    root_depth_start: 0.7,
    root_depth_end: 0.8,
    depletion_factor: 0.65,
    ky: 0.5,
    kl: 1,
    color: "#fb923c",
    itn_pct: 100,
  },
  {
    phase_key: "enchimento",
    name: "Enchimento",
    duration_days: 28,
    kc_start: 1.15,
    kc_end: 0.85,
    root_depth_start: 0.8,
    root_depth_end: 0.9,
    depletion_factor: 0.65,
    ky: 0.25,
    kl: 1,
    color: "#f97316",
    itn_pct: 100,
  },
  {
    phase_key: "maturacao",
    name: "Maturação",
    duration_days: 20,
    kc_start: 0.85,
    kc_end: 0.5,
    root_depth_start: 0.9,
    root_depth_end: 0.9,
    depletion_factor: 0.65,
    ky: 0.25,
    kl: 1,
    color: "#a3a3a3",
    itn_pct: 80,
  },
];

export const CULTURE_PHASE_TEMPLATES: Record<
  Exclude<CultureKind, "outro">,
  { cycleDays: number; phases: PhaseTemplate[] }
> = {
  soja: { cycleDays: SOJA_CYCLE_DAYS, phases: SOJA_PHASE_TEMPLATE },
  algodao: { cycleDays: ALGODAO_CYCLE_DAYS, phases: ALGODAO_PHASE_TEMPLATE },
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Infere soja/algodão pelo nome. Grupo "fibras" sozinho não é algodão.
 */
export function inferCultureKind(name: string): CultureKind {
  const n = stripDiacritics(name.trim());
  if (!n) return "outro";
  if (/(^|[^a-z])soja([^a-z]|$)/.test(n) || n.includes("glycine max") || n.includes("soybean")) {
    return "soja";
  }
  if (
    n.includes("algodao") ||
    n.includes("cotton") ||
    n.includes("gossypium")
  ) {
    return "algodao";
  }
  return "outro";
}

export function totalPhaseDuration<T extends { duration_days: number }>(phases: T[]): number {
  return phases.reduce((sum, phase) => sum + (Number(phase.duration_days) || 0), 0);
}

/** Recalcula DAP a partir da ordem e das durações. Duração é a fonte da verdade. */
export function rebuildPhaseTimeline<T extends { phase_order: number; duration_days: number }>(
  phases: T[],
): Array<T & { days_after_plant: number }> {
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
  let dap = 0;
  return sorted.map((phase) => {
    const duration = Math.max(0, Number(phase.duration_days) || 0);
    const next = { ...phase, days_after_plant: dap };
    dap += duration;
    return next;
  });
}

/** Escala durações proporcionalmente para um ciclo alvo, mínimo 1 dia por fase. */
export function scalePhaseDurations<T extends { duration_days: number }>(
  phases: T[],
  targetCycleDays: number,
): T[] {
  const total = totalPhaseDuration(phases);
  if (phases.length === 0 || total <= 0 || targetCycleDays <= 0) return phases;
  if (total === targetCycleDays) return phases;

  const scaled = phases.map((phase) =>
    Math.max(1, Math.round((phase.duration_days * targetCycleDays) / total)),
  );
  let sum = scaled.reduce((a, b) => a + b, 0);
  scaled[scaled.length - 1] += targetCycleDays - sum;
  if (scaled[scaled.length - 1] < 1) {
    let need = 1 - scaled[scaled.length - 1];
    scaled[scaled.length - 1] = 1;
    for (let i = scaled.length - 2; i >= 0 && need > 0; i--) {
      const take = Math.min(need, scaled[i] - 1);
      scaled[i] -= take;
      need -= take;
    }
  }
  return phases.map((phase, i) => ({ ...phase, duration_days: scaled[i] }));
}

export function buildPhasesFromTemplate(
  kind: Exclude<CultureKind, "outro">,
  cycleDays?: number | null,
): PhaseTimelineRow[] {
  const template = CULTURE_PHASE_TEMPLATES[kind];
  const withOrder = template.phases.map((phase, index) => ({
    ...phase,
    phase_order: index + 1,
  }));
  const target = cycleDays && cycleDays > 0 ? cycleDays : template.cycleDays;
  const scaled = scalePhaseDurations(withOrder, target);
  return rebuildPhaseTimeline(scaled);
}

export function daysAfterPlanting(plantingDate: string, onDate: Date = new Date()): number {
  const plant = new Date(`${plantingDate}T12:00:00`);
  if (Number.isNaN(plant.getTime())) return 0;
  const plantUtc = Date.UTC(plant.getFullYear(), plant.getMonth(), plant.getDate());
  const onUtc = Date.UTC(onDate.getFullYear(), onDate.getMonth(), onDate.getDate());
  return Math.floor((onUtc - plantUtc) / 86_400_000);
}

export function validateManagementDates(input: {
  plantingDate?: string | null;
  managementStart?: string | null;
  managementEnd?: string | null;
}): string | null {
  const start = input.managementStart || null;
  const end = input.managementEnd || null;
  if (start && end && end < start) {
    return "A data fim do manejo não pode ser anterior ao início.";
  }
  if (input.plantingDate && end && end < input.plantingDate) {
    return "A data fim do manejo não pode ser anterior ao plantio.";
  }
  return null;
}

export function insertPayloadFromTimeline(
  cultureId: string,
  phases: PhaseTimelineRow[],
): Record<string, unknown>[] {
  return phases.map((phase) => ({
    culture_id: cultureId,
    phase_order: phase.phase_order,
    name: phase.name,
    phase_key: phase.phase_key,
    days_after_plant: phase.days_after_plant,
    duration_days: phase.duration_days,
    kc_start: phase.kc_start,
    kc_end: phase.kc_end,
    root_depth_start: phase.root_depth_start,
    root_depth_end: phase.root_depth_end,
    depletion_factor: phase.depletion_factor,
    ky: phase.ky,
    kl: phase.kl,
    color: phase.color,
    itn_pct: phase.itn_pct,
    kc_constant: false,
    ends_cycle: phase.phase_key === "maturacao",
  }));
}
