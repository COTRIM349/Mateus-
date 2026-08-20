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
  kl_function: string | null;
}

export interface CulturePhaseLike {
  itn_pct: number | null;
  ks_function: string | null;
  shaded_area_pct: number | null;
  ky: number | null;
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

export type KsFunctionName = "linear" | "fao33" | "exponential" | "sigmoid" | "none";
export type KlFunctionName = "constant" | "custom" | "fereres" | "keller_karmeli" | "freitas" | "bernardo";

/** Função Ks efetiva — override parcela > fase > cultura > 'linear'. */
export function resolveKsFunction(
  parcela: Pick<ParcelaLike, "ks_function_override">,
  phase: Pick<CulturePhaseLike, "ks_function"> | null,
  culture: Pick<CultureLike, "ks_function">,
): KsFunctionName {
  const valid: KsFunctionName[] = ["linear", "fao33", "exponential", "sigmoid", "none"];
  const chain = [parcela.ks_function_override, phase?.ks_function ?? null, culture.ks_function];
  for (const v of chain) {
    if (v && (valid as string[]).includes(v)) return v as KsFunctionName;
  }
  return "linear";
}

/** Função Kl efetiva — cultura.kl_function > 'constant'. */
export function resolveKlFunction(
  culture: Pick<CultureLike, "kl_function">,
): KlFunctionName {
  const valid: KlFunctionName[] = ["constant", "custom", "fereres", "keller_karmeli", "freitas", "bernardo"];
  if (culture.kl_function && (valid as string[]).includes(culture.kl_function)) {
    return culture.kl_function as KlFunctionName;
  }
  return "constant";
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
 *   linear      = FAO-56 eq. 84 — decai linear entre p e depleção total
 *   fao33       = Doorenbos-Kassam (Ky) — Ks = 1 - Ky × excess_depletion
 *   exponential = decai côncavo (castiga estresse mais rápido)
 *   sigmoid     = transição suave em torno do ponto médio
 *   none        = Ks fixo em 1 (sem estresse)
 *
 * @param depletionFraction   fração do CAD depletada (0-1)
 * @param p                   fator de depleção sem estresse (0-1)
 * @param fn                  função Ks configurada
 * @param ky                  coeficiente Ky da fase (obrigatório para fao33)
 */
export function calculateKs(
  depletionFraction: number,
  p: number,
  fn: KsFunctionName,
  ky: number | null = null,
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

    case "fao33":
      // Doorenbos-Kassam: quanto maior Ky, mais sensível ao déficit.
      // Ky=1 é equivalente ao linear FAO-56. Ky>1 castiga mais.
      // Ky<1 é mais tolerante.
      // Ky padrão (se não informado) = 1.0.
      {
        const kyEff = ky != null && ky > 0 ? ky : 1.0;
        return Math.max(0, 1 - kyEff * excessDepletion);
      }

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

// ── Kl — coeficiente de localização por função ─────────────────────────────

export interface KlInputs {
  /** Fração de área molhada (0-1). Necessário para K-K, Freitas, Bernardo. */
  wettedAreaFraction?: number | null;
  /** % área sombreada (0-100). Necessário para Fereres. */
  shadedAreaPct?: number | null;
  /** Valor fixo (0-1). Necessário para constant/custom. */
  constantValue?: number | null;
}

/**
 * Calcula o Kl a partir da função escolhida e das entradas disponíveis.
 * Todas as funções retornam valor no intervalo (0, 1].
 *
 * Referências:
 *  - Fereres (1981): Kl = Pc / 85, com cap em 1 quando Pc ≥ 85%
 *  - Keller & Karmeli (1975): Kl = fração da área molhada
 *  - Freitas (Vermeiren-Jobling, 1980): Kl = 0,1 + Pw
 *  - Bernardo (2019): Kl = Pw + 0,15 × (1 − Pw) — mais conservador
 *  - Constant / custom: usa o valor direto (default 1,0 = pivô central total)
 */
export function calculateKl(fn: KlFunctionName, inputs: KlInputs): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  switch (fn) {
    case "fereres": {
      const pc = inputs.shadedAreaPct;
      if (pc == null || !Number.isFinite(pc)) return 1.0;
      const kl = pc / 85;
      return clamp(kl);
    }

    case "keller_karmeli": {
      const pw = inputs.wettedAreaFraction;
      if (pw == null || !Number.isFinite(pw)) return 1.0;
      return clamp(pw);
    }

    case "freitas": {
      const pw = inputs.wettedAreaFraction;
      if (pw == null || !Number.isFinite(pw)) return 1.0;
      return clamp(0.1 + pw);
    }

    case "bernardo": {
      const pw = inputs.wettedAreaFraction;
      if (pw == null || !Number.isFinite(pw)) return 1.0;
      return clamp(pw + 0.15 * (1 - pw));
    }

    case "constant":
    case "custom":
    default: {
      const v = inputs.constantValue;
      if (v == null || !Number.isFinite(v)) return 1.0;
      return clamp(v);
    }
  }
}

// ── Escala sensorial nota → % CC ───────────────────────────────────────────

/**
 * Tabela oficial da escala tátil (mirror do seed em SQL 00031).
 * Nota (1.0 a 9.0 em passos de 0,5) → percentual de CC.
 * Fonte: USDA-NRCS · Marouelli et al. Embrapa · Bernardo, Mantovani & Soares 2019.
 */
export const SOIL_SENSORY_SCALE: ReadonlyArray<{
  note: number;
  moisturePctCc: number;
  category: "umido" | "moderado" | "critico" | "seco";
}> = [
  { note: 1.0, moisturePctCc: 100, category: "umido" },
  { note: 1.5, moisturePctCc:  96, category: "umido" },
  { note: 2.0, moisturePctCc:  92, category: "umido" },
  { note: 2.5, moisturePctCc:  88, category: "umido" },
  { note: 3.0, moisturePctCc:  83, category: "umido" },
  { note: 3.5, moisturePctCc:  79, category: "moderado" },
  { note: 4.0, moisturePctCc:  75, category: "moderado" },
  { note: 4.5, moisturePctCc:  71, category: "moderado" },
  { note: 5.0, moisturePctCc:  67, category: "moderado" },
  { note: 5.5, moisturePctCc:  63, category: "moderado" },
  { note: 6.0, moisturePctCc:  58, category: "moderado" },
  { note: 6.5, moisturePctCc:  54, category: "critico" },
  { note: 7.0, moisturePctCc:  50, category: "critico" },
  { note: 7.5, moisturePctCc:  43, category: "critico" },
  { note: 8.0, moisturePctCc:  35, category: "seco" },
  { note: 8.5, moisturePctCc:  27, category: "seco" },
  { note: 9.0, moisturePctCc:  18, category: "seco" },
] as const;

/**
 * Converte uma nota tátil (1.0 a 9.0) para percentual da capacidade de campo.
 * Se a nota não bater exatamente na escala, faz interpolação linear entre
 * as duas notas mais próximas.
 */
export function sensoryNoteToPercentCC(note: number): number | null {
  if (!Number.isFinite(note) || note < 1.0 || note > 9.0) return null;

  // Encontra as duas notas adjacentes
  const exact = SOIL_SENSORY_SCALE.find((s) => s.note === note);
  if (exact) return exact.moisturePctCc;

  let lo: (typeof SOIL_SENSORY_SCALE)[number] | null = null;
  let hi: (typeof SOIL_SENSORY_SCALE)[number] | null = null;
  for (const s of SOIL_SENSORY_SCALE) {
    if (s.note <= note) lo = s;
    if (s.note >= note && !hi) hi = s;
  }
  if (!lo || !hi) return null;

  const range = hi.note - lo.note;
  if (range === 0) return lo.moisturePctCc;

  const t = (note - lo.note) / range;
  return lo.moisturePctCc + t * (hi.moisturePctCc - lo.moisturePctCc);
}

/** Categoria da nota (umido/moderado/critico/seco) para UI colorida. */
export function sensoryNoteCategory(note: number): "umido" | "moderado" | "critico" | "seco" | null {
  if (!Number.isFinite(note) || note < 1.0 || note > 9.0) return null;
  // Pega a categoria da nota exata (ou da mais próxima abaixo)
  let last: (typeof SOIL_SENSORY_SCALE)[number] | null = null;
  for (const s of SOIL_SENSORY_SCALE) {
    if (s.note <= note) last = s;
    else break;
  }
  return last?.category ?? null;
}
