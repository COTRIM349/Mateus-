// ============================================================================
// modules/weather/errors/weatherErrors.ts
// ----------------------------------------------------------------------------
// Hierarquia de erros da camada climática (Etapa 1).
//
// Por que classes separadas:
//   • Permitem `catch (e) { if (e instanceof WeatherRateLimitError) ... }`
//     sem string matching frágil.
//   • Servem para o orquestrador de provedores decidir se retenta, abre o
//     circuit breaker, degrada silenciosamente ou propaga a falha.
//
// Convenções:
//   • Nunca incluir a chave da API na mensagem (usar redação onde precisar).
//   • Preservar a causa original em `cause`.
// ============================================================================

import type { WeatherProviderName } from "@/modules/weather/types/weatherTypes";

export interface WeatherErrorContext {
  provider: WeatherProviderName;
  /** URL sanitizada da requisição, se aplicável. */
  requestUrl?: string;
  httpStatus?: number;
  /** Erro original (Error, DOMException, unknown). */
  cause?: unknown;
}

export class WeatherError extends Error {
  readonly provider: WeatherProviderName;
  readonly requestUrl: string | null;
  readonly httpStatus: number | null;
  readonly cause: unknown;

  constructor(message: string, ctx: WeatherErrorContext) {
    super(message);
    this.name = "WeatherError";
    this.provider = ctx.provider;
    this.requestUrl = ctx.requestUrl ?? null;
    this.httpStatus = ctx.httpStatus ?? null;
    this.cause = ctx.cause;
  }
}

/** Erro genérico devolvido pelo provedor (HTTP não-2xx, payload inválido). */
export class WeatherProviderError extends WeatherError {
  constructor(message: string, ctx: WeatherErrorContext) {
    super(message, ctx);
    this.name = "WeatherProviderError";
  }
}

/** Timeout de rede — retentável dentro do maxAttempts do provedor. */
export class WeatherTimeoutError extends WeatherError {
  constructor(message: string, ctx: WeatherErrorContext) {
    super(message, ctx);
    this.name = "WeatherTimeoutError";
  }
}

/** Limite de requisições excedido — não retentar imediatamente. */
export class WeatherRateLimitError extends WeatherError {
  readonly retryAfterSeconds: number | null;
  constructor(
    message: string,
    ctx: WeatherErrorContext,
    retryAfterSeconds: number | null = null,
  ) {
    super(message, ctx);
    this.name = "WeatherRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Configuração ausente ou inválida (ex.: apiKey obrigatória e não definida). */
export class WeatherConfigurationError extends WeatherError {
  constructor(message: string, ctx: WeatherErrorContext) {
    super(message, ctx);
    this.name = "WeatherConfigurationError";
  }
}

/** Payload chegou, mas variáveis essenciais estão ausentes/malformadas. */
export class WeatherValidationError extends WeatherError {
  readonly missingFields: string[];
  constructor(
    message: string,
    ctx: WeatherErrorContext,
    missingFields: string[] = [],
  ) {
    super(message, ctx);
    this.name = "WeatherValidationError";
    this.missingFields = missingFields;
  }
}

/**
 * Provedor está temporariamente/permanentemente indisponível para o uso
 * pretendido — ex.: `fetchHourly` em provedor que só entrega diário.
 */
export class WeatherUnavailableError extends WeatherError {
  constructor(message: string, ctx: WeatherErrorContext) {
    super(message, ctx);
    this.name = "WeatherUnavailableError";
  }
}
