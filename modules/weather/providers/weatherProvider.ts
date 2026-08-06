// ============================================================================
// modules/weather/providers/weatherProvider.ts
// ----------------------------------------------------------------------------
// Interface comum a todos os provedores climáticos (Etapa 1).
//
// Distinção importante em relação ao que já existe:
//
//   ClimateProvider   (provider-registry.ts, hoje)
//     → HANDLER DE INGESTÃO: sabe gravar em weather_readings, chama Supabase,
//       trata is_locked, atualiza status. Acoplado ao DB.
//
//   WeatherProvider   (este arquivo, novo)
//     → ADAPTADOR PURO: só busca dados de uma fonte externa e devolve no
//       formato padronizado (DailyWeatherData / HourlyWeatherData). Nenhum
//       conhecimento de banco, RLS ou ingestão. É a peça que a Etapa 2 vai
//       chamar por trás do adaptador de ingestão atual.
//
// Convivem sem conflito. A consolidação acontece nas próximas etapas.
// ============================================================================

import type {
  DailyWeatherData,
  HourlyWeatherData,
  WeatherFetchRange,
  WeatherLocation,
  WeatherProviderName,
} from "@/modules/weather/types/weatherTypes";

/** Estado observável de um provedor (para telas de diagnóstico). */
export type WeatherProviderStatus =
  | "ok"
  | "degraded"
  | "unavailable"
  | "not_configured";

/** Configuração comum a qualquer provedor. */
export interface WeatherProviderConfig {
  /** Se falso, o provedor não faz chamadas (útil para desabilitar sem remover). */
  enabled: boolean;
  /** Timeout total por requisição em milissegundos. */
  timeoutMs: number;
  /** Número máximo de tentativas por requisição (inclui a primeira). */
  maxAttempts: number;
  /** Base URL configurável para permitir mock/self-hosted. */
  baseUrl: string | null;
  /**
   * Chave/token — se aplicável. Nunca deve aparecer em logs. Provedores sem
   * autenticação (ex.: Open-Meteo, NASA POWER) mantêm este campo em null.
   */
  apiKey: string | null;
}

/** Resultado do healthCheck de um provedor. */
export interface WeatherHealthCheckResult {
  provider: WeatherProviderName;
  status: WeatherProviderStatus;
  /** HTTP status observado no ping, quando aplicável. */
  httpStatus: number | null;
  /** Latência do ping em ms. */
  latencyMs: number;
  /** Mensagem legível — nunca contém a chave da API. */
  message: string | null;
  /** Marca de tempo do ping (ISO-8601 UTC). */
  checkedAt: string;
}

/**
 * Interface implementada por todos os provedores climáticos.
 *
 * Recomendações de implementação (aplicáveis a partir da Etapa 2):
 *   • Manter puro: sem side-effects em banco, cache ou UI.
 *   • Retornar dados no formato padronizado, com metadata.qualityStatus.
 *   • Preservar null quando o provedor não entregar a variável — nunca zerar.
 *   • Timeout e retry são responsabilidade do provedor; nunca do chamador.
 */
export interface WeatherProvider {
  /** Identificador canônico do provedor. */
  readonly name: WeatherProviderName;
  /** Nome amigável exibido em UI/logs. */
  readonly displayName: string;
  /** Atribuição/licença do provedor (obrigatório em UI). */
  readonly attribution: string;
  /** Configuração ativa (não deve conter segredos em texto plano quando serializada). */
  readonly config: WeatherProviderConfig;

  /**
   * Busca dados diários para uma localização e um intervalo.
   * Retorna uma lista ordenada por date ASC. Dias ausentes ficam de fora
   * (não são preenchidos com null-registro-completo).
   */
  fetchDaily(
    location: WeatherLocation,
    range: WeatherFetchRange,
  ): Promise<DailyWeatherData[]>;

  /**
   * Busca dados horários para uma localização e um intervalo.
   * Provedores que não expõem horário devem lançar WeatherUnavailableError.
   */
  fetchHourly(
    location: WeatherLocation,
    range: WeatherFetchRange,
  ): Promise<HourlyWeatherData[]>;

  /**
   * Verifica se o provedor está acessível e configurado. Não pode causar
   * side-effect nem consumir crédito relevante.
   */
  healthCheck(): Promise<WeatherHealthCheckResult>;
}
