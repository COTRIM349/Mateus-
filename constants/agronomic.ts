/**
 * Constantes agronômicas usadas nos cálculos de irrigação.
 * Referências: FAO-56, Embrapa, Allen et al. (1998).
 */

/** Constante psicrométrica padrão a nível do mar (kPa/°C). */
export const PSYCHROMETRIC_CONSTANT_SEA_LEVEL = 0.0665;

/** Constante de Stefan-Boltzmann (MJ/m²/dia/K⁴). */
export const STEFAN_BOLTZMANN = 4.903e-9;

/** Calor latente de vaporização (MJ/kg). */
export const LATENT_HEAT = 2.45;

/** Albedo de cultura de referência (grama). */
export const REFERENCE_ALBEDO = 0.23;

/** Constante solar (MJ/m²/min). */
export const SOLAR_CONSTANT = 0.0820;

/** Fator de conversão CV para kW. */
export const CV_TO_KW = 0.7355;

/** Coeficientes de cultura (Kc) padrão por cultura e estágio (FAO-56). */
export const DEFAULT_KC: Record<string, Record<string, number>> = {
  Soja: {
    germinacao: 0.4,
    vegetativo: 0.8,
    floracao: 1.15,
    enchimento: 1.15,
    maturacao: 0.5,
    colheita: 0.3,
  },
  Milho: {
    germinacao: 0.3,
    vegetativo: 0.7,
    floracao: 1.2,
    enchimento: 1.15,
    maturacao: 0.6,
    colheita: 0.35,
  },
  Algodão: {
    germinacao: 0.35,
    vegetativo: 0.75,
    floracao: 1.2,
    enchimento: 1.15,
    maturacao: 0.7,
    colheita: 0.4,
  },
  Cacau: {
    germinacao: 0.9,
    vegetativo: 1.0,
    floracao: 1.05,
    enchimento: 1.05,
    maturacao: 1.0,
    colheita: 0.95,
  },
};

/** Profundidade efetiva de raízes por cultura em metros. */
export const DEFAULT_ROOT_DEPTH: Record<string, number> = {
  Soja: 0.6,
  Milho: 0.8,
  Algodão: 1.0,
  Cacau: 1.2,
};

/** Fator de depleção (p) por cultura — FAO-56 Tabela 22. */
export const DEFAULT_DEPLETION_FACTOR: Record<string, number> = {
  Soja: 0.5,
  Milho: 0.55,
  Algodão: 0.65,
  Cacau: 0.3,
};
