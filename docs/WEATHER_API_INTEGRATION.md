# WeatherAPI.com — Fonte Climática Secundária

Integração adicionada como **fonte de comparação e contingência**. Open-Meteo continua sendo a fonte primária do balanço hídrico.

## Papel

- **Prioridade:** 6 (Open-Meteo = 5). O `source-resolver` mantém Open-Meteo vencendo por padrão.
- **Cálculo de ETo Cotrim:** desativado para leituras WeatherAPI. A API free não fornece radiação solar (Rs) — sem Rs não há Penman-Monteith adequado.
- **weather_daily_selection:** o endpoint `test-weather-api` NÃO altera. O `sync-farm` normal continua rodando resolver, mas prioridade P5<P6 impede troca automática.
- **Motor do balanço hídrico:** intocado.

## Endpoints

Todas as chamadas server-only. Chave lida de `process.env.WEATHERAPI_KEY`, jamais em variável `NEXT_PUBLIC_*`.

| Endpoint WeatherAPI | Uso |
|---|---|
| `GET /v1/forecast.json?q=<lat>,<lon>&days=3&aqi=no&alerts=no` | Dia atual + até 3 dias de forecast |
| `GET /v1/history.json?q=<lat>,<lon>&dt=YYYY-MM-DD` | Um dia observado passado (uma chamada por data) |
| `GET /v1/current.json?q=<lat>,<lon>&aqi=no` | Usado apenas no diagnóstico |

Total por sync completa (7d passado + 3d forecast) = **8 chamadas**. Free tier: 1.000.000/mês.

## Mapeamento de campos

Fonte: `forecast.forecastday[].day` e `forecast.forecastday[].hour`.

| WeatherAPI | Unidade | Conversão | Campo Cotrim |
|---|---|---|---|
| `maxtemp_c`, `mintemp_c`, `avgtemp_c` | °C | — | `temp_max`, `temp_min`, `temp_mean` |
| `avghumidity` | % | — | `humidity` |
| `maxwind_kph` | km/h | ÷ 3,6 → m/s a 10 m → FAO-56 eq. 47 → m/s a 2 m | `wind_speed` |
| `totalprecip_mm` | mm | `calculateEffectivePrecipitation` | `precipitation`, `effective_precip` |
| `daily_chance_of_rain` (forecast) | % | — | `precipitation_probability` (só em `weather_forecasts`) |
| `hour[].pressure_mb` | hPa | média das 24 h | `atmospheric_pressure_hpa` |
| `condition.text` | texto | — | `condition_text` |
| — | — | não fornecido | `solar_radiation` = NULL |
| — | — | regra | `et0_source` = NULL, `et0_calculated` = NULL |

## Limitações do plano free

- **3 dias de forecast** (máximo). Ingest capa em 3.
- **7 dias de histórico** (máximo). Ingest capa em 7.
- **Sem radiação solar** (Rs) — impossibilita ETo Penman-Monteith.
- **Sem ETo direta** no payload.
- Rate limit: **1.000.000/mês**.

## Segurança da chave

1. `WEATHERAPI_KEY` só existe no ambiente da Vercel/Supabase (sem prefixo `NEXT_PUBLIC_`).
2. Cada arquivo do provider começa com `if (typeof window !== "undefined") throw` — quebra explicitamente se importado do browser.
3. `redactWeatherApiUrl(url)` substitui `key=<segredo>` por `key=[REDACTED]` antes de qualquer log ou coluna persistida em `climate_ingestion_runs.request_url`.
4. O endpoint `weather-api-diagnostic` nunca devolve nem a chave nem a URL — só status, latência, plano e erro mascarado.
5. Nenhum arquivo `.env` versionado contém a chave.

## Endpoints internos

### `GET /api/climate/weather-api-diagnostic`
Autenticado por sessão. Retorna:
```json
{
  "keyPresent": true,
  "status": "ok" | "invalid_key" | "rate_limited" | "provider_error" | "timeout" | "error" | "not_configured",
  "httpStatus": 200,
  "latencyMs": 340,
  "plan": "free (assumido)",
  "limitations": { "requestsPerMonth": 1000000, "historyDays": 7, "forecastDays": 3, "solarRadiation": false, "ecoTo": false, "notes": "…" },
  "error": null
}
```

### `POST /api/climate/test-weather-api`
Autenticado por sessão. Body: `{ farmId }`. Cria (se necessário) estação virtual WeatherAPI P6 e sincroniza 7d + 3d **somente** para o provider WeatherAPI.

## Tratamento de erros do provider

| HTTP | Ação |
|---|---|
| 401/403 | `WeatherApiError(kind='invalid_key', retryable=false)` — para a sync imediatamente, marca `sync_status='failed'` |
| 429 | `retryable=true`, backoff 1s / 3s / 9s |
| 400 | Mensagem do body do provedor, sem retry |
| 5xx | `retryable=true`, backoff 500ms / 1500ms / 3500ms |
| Timeout (15s) | Retry 3× |
| Rede | Retry 3× |

## Comparação exibida na UI

Aba **Clima → Estação Virtual → card WeatherAPI (fonte secundária de comparação)** — tabela lado a lado dos últimos 7 dias mostrando T_max, UR, vento, chuva e pressão de cada provider, com destaque de cor quando a diferença ultrapassa limiares.
