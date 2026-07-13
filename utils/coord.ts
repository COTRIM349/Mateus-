// ============================================================================
// Coordenadas geográficas — parsing e validação
// ----------------------------------------------------------------------------
// Aceita entradas em formato decimal usando ponto OU vírgula como separador,
// preservando sinal negativo. Não faz DMS — o campo do usuário é sempre
// decimal, com placeholder de exemplo mostrando o formato esperado.
// ============================================================================

export type CoordKind = "latitude" | "longitude";

export interface CoordParseResult {
  valid: boolean;
  value: number | null;
  error: string | null;
  warning: string | null;
}

const LAT_RANGE = { min: -90, max: 90 };
const LON_RANGE = { min: -180, max: 180 };

// Bounding box do Brasil continental (aprox., com folga costeira).
const BR_LAT_RANGE = { min: -34, max: 6 };
const BR_LON_RANGE = { min: -74, max: -33 };

/**
 * Normaliza o texto de entrada substituindo vírgula por ponto e removendo
 * espaços em volta. Não remove sinais nem outros caracteres — para que
 * "-14,6491 " → "-14.6491".
 */
export function normalizeCoordText(raw: string): string {
  return raw.trim().replace(",", ".");
}

/**
 * Valida um texto de coordenada e devolve `{ value, error, warning }`.
 * `warning` é preenchido quando o valor é numericamente válido mas cai fora
 * da bounding box do Brasil — chamador decide se bloqueia ou apenas alerta.
 */
export function parseCoordinate(raw: string, kind: CoordKind): CoordParseResult {
  const text = normalizeCoordText(raw);
  if (text === "") {
    return { valid: false, value: null, error: "campo obrigatório", warning: null };
  }
  // Aceita: opcional sinal, dígitos, opcional . e dígitos.
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return {
      valid: false,
      value: null,
      error: "formato inválido; use decimal com ponto ou vírgula, ex.: -14.6491",
      warning: null,
    };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { valid: false, value: null, error: "número inválido", warning: null };
  }
  const range = kind === "latitude" ? LAT_RANGE : LON_RANGE;
  if (value < range.min || value > range.max) {
    return {
      valid: false,
      value,
      error: `${kind} deve estar entre ${range.min} e ${range.max}`,
      warning: null,
    };
  }

  // Aviso não-bloqueante se estiver fora do Brasil.
  const brRange = kind === "latitude" ? BR_LAT_RANGE : BR_LON_RANGE;
  let warning: string | null = null;
  if (value < brRange.min || value > brRange.max) {
    warning =
      kind === "latitude"
        ? `latitude ${value.toFixed(4)}° está fora da faixa brasileira (${brRange.min}° a ${brRange.max}°). Confira se é intencional.`
        : `longitude ${value.toFixed(4)}° está fora da faixa brasileira (${brRange.min}° a ${brRange.max}°). Confira se é intencional.`;
  }

  return { valid: true, value, error: null, warning };
}

export function isInBrazilBox(latitude: number, longitude: number): boolean {
  return (
    latitude >= BR_LAT_RANGE.min &&
    latitude <= BR_LAT_RANGE.max &&
    longitude >= BR_LON_RANGE.min &&
    longitude <= BR_LON_RANGE.max
  );
}
