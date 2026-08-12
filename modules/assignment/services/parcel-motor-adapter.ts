/**
 * Adaptador Parcela → entradas dos motores (Sprint 13 · Etapa 6).
 *
 * Traduz os campos NOVOS da parcela (Kl da cultura, ITN% da fase,
 * deficit_irrigation, stress_point_irrigation) em ajustes aos números
 * que os motores existentes (water-balance, recommendation) já sabem
 * consumir — SEM mudar a assinatura desses motores.
 *
 * Regra: enquanto os motores não forem refatorados para receber Kl/ITN
 * como parâmetros de primeira classe, aplicamos:
 *
 *   kc_efetivo   = kc × kl                    (efeito da localização)
 *   lâmina_final = lâmina_recomendada × ITN%  (efeito da intenção)
 *
 * Isso preserva comportamento quando os campos estão em default
 * (kl=1.0, ITN=100%) e permite o novo comportamento quando o usuário
 * ajusta.
 */

// ── Tipos mínimos ──────────────────────────────────────────────────────────

export interface CultureLike {
  kl: number | null;
  ks_function: string | null;
}

export interface CulturePhaseLike {
  itn_pct: number | null;
  ks_function: string | null;
  shaded_area_pct: number | null;
}

export interface ParcelaLike {
  deficit_irrigation: boolean | null;
  stress_point_irrigation: boolean | null;
  kl_override: number | null;
  ks_function_override: string | null;
  initial_moisture_is_cc: boolean | null;
  initial_soil_moisture_pct: number | null;
}

// ── Resolvers ──────────────────────────────────────────────────────────────

/** Kl efetivo — override da parcela > kl da cultura > 1.0. */
export function resolveKl(
  parcela: Pick<ParcelaLike, "kl_override">,
  culture: Pick<CultureLike, "kl">,
): number {
  if (parcela.kl_override != null && parcela.kl_override > 0) return parcela.kl_override;
  if (culture.kl != null && culture.kl > 0) return culture.kl;
  return 1.0;
}

/** Função Ks efetiva — override parcela > fase > cultura > 'linear'. */
export function resolveKsFunction(
  parcela: Pick<ParcelaLike, "ks_function_override">,
  phase: Pick<CulturePhaseLike, "ks_function"> | null,
  culture: Pick<CultureLike, "ks_function">,
): "linear" | "exponential" | "sigmoid" | "none" {
  const chain = [
    parcela.ks_function_override,
    phase?.ks_function ?? null,
    culture.ks_function,
  ];
  for (const v of chain) {
    if (v === "linear" || v === "exponential" || v === "sigmoid" || v === "none") return v;
  }
  return "linear";
}

/** ITN% da fase (0-150) → fração multiplicativa (0-1.5). Default 1.0. */
export function resolveItnFraction(
  phase: Pick<CulturePhaseLike, "itn_pct"> | null,
): number {
  const pct = phase?.itn_pct;
  if (pct == null || !Number.isFinite(pct) || pct < 0) return 1.0;
  return pct / 100;
}

// ── Ajustes aos motores ────────────────────────────────────────────────────

/**
 * Kc efetivo = Kc × Kl. Aplique antes de chamar water-balance.
 * Efeito: reduz proporcionalmente a demanda em irrigação localizada.
 */
export function applyKlToKc(kc: number, kl: number): number {
  return kc * kl;
}

/**
 * Lâmina final = lâmina_recomendada × (ITN/100). Aplique após recommendation.
 * Efeito: reduz a lâmina quando a fase não pede reposição total.
 */
export function applyItnToDepth(depthMm: number, itnFraction: number): number {
  return depthMm * itnFraction;
}

/**
 * Ks calculado pela função configurada.
 *   linear      = Ks = (CAD - deficit) / (CAD - (1-p)*CAD)  (FAO-56 padrão)
 *   exponential = Ks = exp(-k × (deficit/CAD)^2)             (mais agressivo)
 *   sigmoid     = Ks = 1 / (1 + exp((deficit - threshold)/k))
 *   none        = Ks = 1 sempre
 *
 * @param depletionFraction   fração do CAD depletada (0-1)
 * @param p                   fator de depleção sem estresse (0-1)
 * @param fn                  função Ks configurada
 */
export function calculateKs(
  depletionFraction: number,
  p: number,
  fn: "linear" | "exponential" | "sigmoid" | "none",
): number {
  if (fn === "none") return 1;

  // Zona sem estresse: enquanto d <= p, Ks = 1
  if (depletionFraction <= p) return 1;

  // Depleção completa: Ks = 0
  if (depletionFraction >= 1) return 0;

  const excessDepletion = (depletionFraction - p) / (1 - p);

  switch (fn) {
    case "linear":
      // FAO-56 eq. 84 — decai linear entre (p, 1) → (1, 0)
      return Math.max(0, 1 - excessDepletion);

    case "exponential":
      // Castiga estresse mais rápido que linear (decai côncavo).
      // Ex.: em excess=0.5, linear=0.5 e exponencial≈0.25.
      return Math.max(0, (1 - excessDepletion) * (1 - excessDepletion));

    case "sigmoid":
      return 1 / (1 + Math.exp(6 * (excessDepletion - 0.5)));

    default:
      return Math.max(0, 1 - excessDepletion);
  }
}

/**
 * Regra "irrigar no ponto de estresse":
 *   quando true, só irriga quando déficit ≥ p × CAD (encoste no limite).
 *   quando false (padrão FAO-56), irriga preventivamente antes disso.
 */
export function shouldIrrigateAtStressPoint(
  parcela: Pick<ParcelaLike, "stress_point_irrigation">,
  depletionFraction: number,
  p: number,
): boolean {
  if (!parcela.stress_point_irrigation) return false;
  return depletionFraction >= p;
}
