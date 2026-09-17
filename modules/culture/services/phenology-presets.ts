/**
 * Cronograma fenológico de referência: quando cada estádio ocorre, como fração
 * do ciclo da variedade. Serve para GERAR o "DAE esperado" por variedade a
 * partir do ciclo dela — um ponto de partida rastreável que o agrônomo revisa
 * e calibra (a calibração local nunca apaga o valor esperado).
 *
 * O DAE é medido da emergência: por isso a emergência (VE) fica em fração 0.
 * As frações vão até ~1,0 no fim do ciclo. Multiplicadas pelo ciclo da
 * variedade (dias), dão o DAE esperado de cada estádio.
 */

export type CropKind = "soja" | "milho" | "algodao" | "outro";

export function cropKindFromName(name: string): CropKind {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.includes("soja") || n.includes("glycine")) return "soja";
  if (n.includes("milho") || n.includes("zea mays")) return "milho";
  if (n.includes("algod") || n.includes("gossypium")) return "algodao";
  return "outro";
}

// Fração do ciclo (DAE / ciclo) por código de estádio. Soja: escala Fehr &
// Caviness (VE–R8). Valores de literatura, ajustáveis por calibração local.
const STAGE_FRACTION_BY_CODE: Record<CropKind, Record<string, number>> = {
  soja: {
    VE: 0.0, VC: 0.06, V1: 0.10, V2: 0.14, V3: 0.18, V4: 0.22, V5: 0.26, V6: 0.30,
    R1: 0.34, R2: 0.42, R3: 0.50, R4: 0.58, R5: 0.66, R6: 0.80, R7: 0.92, R8: 1.0,
  },
  milho: {
    VE: 0.0, V6: 0.25, V12: 0.42, VT: 0.55, R1: 0.58, R2: 0.66, R3: 0.74, R4: 0.82, R5: 0.90, R6: 1.0,
  },
  algodao: {},
  outro: {},
};

// Fallback por fase de manejo (quando o código do estádio não está no mapa).
// Fração ~central da fase dentro do ciclo.
const STAGE_FRACTION_BY_PHASE: Record<string, number> = {
  emergencia: 0.04,
  vegetativo: 0.28,
  botao: 0.32,
  florescimento: 0.45,
  formacao_vagens: 0.56,
  formacao_macas: 0.56,
  enchimento_graos: 0.75,
  enchimento: 0.75,
  abertura: 0.9,
  maturacao: 0.96,
};

// Ciclo padrão (dias, plantio→maturação) quando a variedade não informa o
// ciclo do obtentor. Por classe de ciclo quando aplicável.
const DEFAULT_CYCLE_DAYS: Record<CropKind, { precoce: number; medio: number; tardio: number; base: number }> = {
  soja: { precoce: 110, medio: 125, tardio: 140, base: 120 },
  milho: { precoce: 130, medio: 150, tardio: 165, base: 150 },
  algodao: { precoce: 170, medio: 185, tardio: 200, base: 185 },
  outro: { precoce: 110, medio: 120, tardio: 135, base: 120 },
};

export function resolveCycleDays(
  crop: CropKind,
  manufacturerCycleDays: number | null | undefined,
  maturity: string | null | undefined,
): number {
  if (manufacturerCycleDays != null && Number.isFinite(manufacturerCycleDays) && manufacturerCycleDays > 0) {
    return Math.round(manufacturerCycleDays);
  }
  const d = DEFAULT_CYCLE_DAYS[crop];
  if (maturity === "precoce") return d.precoce;
  if (maturity === "tardio") return d.tardio;
  if (maturity === "medio") return d.medio;
  return d.base;
}

/** Fração do ciclo de um estádio, por código e (fallback) fase de manejo. */
export function stageFraction(
  crop: CropKind,
  stageCode: string,
  managementPhaseKey: string | null | undefined,
): number | null {
  const byCode = STAGE_FRACTION_BY_CODE[crop]?.[stageCode.trim().toUpperCase()];
  if (byCode != null) return byCode;
  if (managementPhaseKey && STAGE_FRACTION_BY_PHASE[managementPhaseKey] != null) {
    return STAGE_FRACTION_BY_PHASE[managementPhaseKey];
  }
  return null;
}

/** DAE esperado (dias após emergência) de um estádio para um ciclo dado. */
export function expectedDae(
  crop: CropKind,
  stageCode: string,
  managementPhaseKey: string | null | undefined,
  cycleDays: number,
): number | null {
  const f = stageFraction(crop, stageCode, managementPhaseKey);
  if (f == null) return null;
  return Math.round(f * cycleDays);
}
