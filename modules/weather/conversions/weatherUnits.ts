// ============================================================================
// modules/weather/conversions/weatherUnits.ts
// ----------------------------------------------------------------------------
// Conversões de unidades climáticas — puras, testáveis e sem side-effect.
//
// Regras de projeto (obrigatórias):
//   • Todas as funções aceitam `number | null` e retornam `number | null`.
//     Se a entrada é null, a saída é null (nunca zero).
//   • Nada de arredondamento silencioso: quem chama decide o número de casas.
//   • Estas funções são as ÚNICAS conversoras da camada climática. Providers
//     e normalizadores devem chamá-las (Etapa 2 em diante) — nunca duplicar.
// ============================================================================

/**
 * Converte velocidade de km/h para m/s.
 * 1 m/s = 3.6 km/h → v_ms = v_kmh / 3.6
 * Exemplo: 36 km/h → 10 m/s.
 */
export function kmhToMs(value: number | null): number | null {
  if (value === null) return null;
  return value / 3.6;
}

/** Inverso de `kmhToMs`. */
export function msToKmh(value: number | null): number | null {
  if (value === null) return null;
  return value * 3.6;
}

/**
 * hPa (hectopascal, unidade meteorológica comum) para kPa (unidade FAO-56).
 * 1 kPa = 10 hPa → v_kpa = v_hpa / 10.
 * Exemplo: 1013 hPa → 101.3 kPa.
 */
export function hPaToKpa(value: number | null): number | null {
  if (value === null) return null;
  return value / 10;
}

/** Inverso de `hPaToKpa`. */
export function kpaToHpa(value: number | null): number | null {
  if (value === null) return null;
  return value * 10;
}

/**
 * Pa (pascal, SI) para kPa. 1 kPa = 1000 Pa.
 * Útil quando o provedor entrega pressão em Pa (ex.: alguns endpoints ERA5).
 */
export function paToKpa(value: number | null): number | null {
  if (value === null) return null;
  return value / 1000;
}

/**
 * Converte um fluxo médio de radiação em W/m² para uma energia acumulada
 * em MJ/m² sobre uma duração explícita.
 *
 *   energiaJm2   = fluxoWm2 × duracaoSegundos              (W·s/m² = J/m²)
 *   energiaMjm2  = energiaJm2 / 1e6
 *
 * Para agregar do fluxo médio DIÁRIO em MJ/m²/dia, passar
 * durationSeconds = 86400. Isso não é uma soma — é a integração
 * temporal do fluxo médio sobre o intervalo.
 */
export function wm2ToMjM2Day(
  fluxWm2: number | null,
  durationSeconds: number,
): number | null {
  if (fluxWm2 === null) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("wm2ToMjM2Day: durationSeconds deve ser > 0.");
  }
  return (fluxWm2 * durationSeconds) / 1_000_000;
}

/**
 * Ajusta a velocidade do vento medida em altura `heightM` para a altura
 * padrão de 2 m (FAO-56, eq. 47):
 *
 *   u2 = uz × 4.87 / ln(67.8 × z − 5.42)
 *
 * onde:
 *   uz  = velocidade medida a z metros de altura;
 *   z   = altura da medição em metros (> 0);
 *   u2  = velocidade a 2 m.
 *
 * Casos:
 *   • heightM = 2  → sem alteração indevida (fator = 1, dentro do erro
 *     numérico do próprio ln — retornamos o valor de entrada exatamente).
 *   • heightM = 10 → fator ≈ 0.7480 (referência FAO-56).
 *
 * Preserva null. Rejeita alturas fisicamente impossíveis.
 */
export function adjustWindToTwoMeters(
  speedMs: number | null,
  heightM: number,
): number | null {
  if (speedMs === null) return null;
  if (!Number.isFinite(heightM) || heightM <= 0) {
    throw new Error("adjustWindToTwoMeters: heightM deve ser > 0.");
  }
  // Curto-circuito para não introduzir erro numérico ao "converter 2→2".
  if (heightM === 2) return speedMs;
  const denominator = Math.log(67.8 * heightM - 5.42);
  if (!Number.isFinite(denominator) || denominator === 0) {
    // Se ln(67.8z − 5.42) não for definido (altura muito pequena), degrada
    // para null — melhor null explícito do que valor errado silencioso.
    return null;
  }
  const factor = 4.87 / denominator;
  return speedMs * factor;
}
