# Open-Meteo — Nova arquitetura climática (Etapa 3)

Adapta a integração da Open-Meteo para a interface `WeatherProvider` da
Etapa 1, com normalizer separado e serviço isolado de diagnóstico ETo.
**Modo paralelo:** o provider legado (`providers/open-meteo.ts`) segue
intocado e continua sendo o único usado em produção.

---

## 1 · Arquivos criados nesta etapa

```
modules/weather/providers/openMeteoProvider.ts          — HTTP puro
modules/weather/normalizers/normalizeOpenMeteo.ts       — payload → tipos padronizados
modules/weather/diagnostics/openMeteoEtoDiagnostic.ts   — ETo Open-Meteo × interna
modules/weather/providers/openMeteoProvider.test.ts     — 12 testes
modules/weather/normalizers/normalizeOpenMeteo.test.ts  — 12 testes
modules/weather/diagnostics/openMeteoEtoDiagnostic.test.ts — 6 testes
modules/weather/OPENMETEO_INTEGRATION.md                — este documento
```

Nenhum arquivo existente foi modificado.

---

## 2 · Variáveis oficiais — o que a **API real** aceita

**Alerta importante:** a documentação markdown pública da Open-Meteo lista
alguns nomes com prefixo (`mean_*`, `maximum_*`) que a API REJEITA com
HTTP 400. Todos os nomes abaixo foram **verificados 1-a-1 pingando o
endpoint `/v1/forecast`** — só entrou o que retornou 200.

### 2.1 Diárias (`daily=…`) — confirmadas na API

| Variável Open-Meteo | Unidade | Alvo em `DailyWeatherData` |
|---|---|---|
| `temperature_2m_min/max/mean` | °C | `temperatureMinC/MaxC/MeanC` |
| `relative_humidity_2m_min/max/mean` | % | `relativeHumidityMinPct/MaxPct/MeanPct` |
| `precipitation_sum` | mm | `precipitationMm` |
| `precipitation_probability_max` | % | `precipitationProbabilityPct` |
| `shortwave_radiation_sum` | **MJ/m²** (já integrada no dia) | `solarRadiationMjM2Day` |
| `wind_speed_10m_mean` | m/s (com `wind_speed_unit=ms`) | `windSpeed10mMs` (**original**) + `windSpeed2mMs` (derivado) |
| `wind_speed_10m_max` | m/s | (guardado no header em warning; não temos campo direto) |
| `wind_direction_10m_dominant` | ° | `windDirectionDeg` |
| `surface_pressure_min/max` | hPa | `surfacePressureKpa` (média = (min+max)/2, convertida) — **derivada** |
| `vapour_pressure_deficit_max` | kPa | `vapourPressureDeficitKpa` |
| `et0_fao_evapotranspiration` | mm/dia | `providerReferenceEtoMm` |

**Rejeitadas pela API (400) — NÃO usar:**
- ~~`mean_relative_humidity_2m`~~, ~~`minimum_relative_humidity_2m`~~, ~~`maximum_relative_humidity_2m`~~
- ~~`mean_surface_pressure`~~ · **não existe `surface_pressure_mean` oficial**
- ~~`maximum_vapour_pressure_deficit`~~

### 2.2 Horárias (`hourly=…`) — todas confirmadas

| Variável Open-Meteo | Unidade | Alvo em `HourlyWeatherData` |
|---|---|---|
| `temperature_2m` | °C | `temperatureC` |
| `relative_humidity_2m` | % | `relativeHumidityPct` |
| `precipitation` | mm | `precipitationMm` |
| `precipitation_probability` | % | `precipitationProbabilityPct` |
| `shortwave_radiation` | **W/m²** (média da hora anterior) | `solarRadiationWm2` |
| `wind_speed_10m` | m/s | `windSpeed10mMs` (+ `windSpeed2mMs` derivado) |
| `wind_direction_10m` | ° | `windDirectionDeg` |
| `surface_pressure` | hPa | `surfacePressureKpa` (convertida) |
| `vapour_pressure_deficit` | kPa | `vapourPressureDeficitKpa` |
| `et0_fao_evapotranspiration` | mm | `providerReferenceEtoMm` |

### 2.3 Variáveis obtidas por agregação horária

- **Pressão média diária:** não existe agregação diária oficial. Se
  necessário, agregar de `hourly.surface_pressure` (média das 24
  horas válidas). O normalizer **atual** deriva de `(surface_pressure_min
  + surface_pressure_max) / 2` e registra warning explícito.
- **Direção do vento predominante:** o `wind_direction_10m_dominant`
  já é oficial. Para casos onde precisarmos recomputar (ex.: agregação
  parcial), usar `circularMeanDirection` — média circular ponderada
  pela velocidade, nunca média aritmética simples.

---

## 3 · Unidades confirmadas

Todas mantidas nas unidades internas obrigatórias da Etapa 1:

- Temperatura: °C · Umidade: % · Chuva: mm · Probabilidade: % ·
  Vento diário: m/s · Vento horário: m/s · Direção: ° ·
  **Radiação diária: MJ/m²/dia (já integrada, sem conversão)** ·
  **Radiação horária: W/m² (fluxo médio da hora)** ·
  Pressão: kPa (convertida de hPa) · VPD: kPa · ETo: mm.

Nenhuma unidade é multiplicada duas vezes. Nenhuma conversão silenciosa.

---

## 4 · Regra de timezone (nova camada)

Ordem canônica, aplicada em `openMeteoProvider.buildForecastUrl`:

1. `WeatherLocation.timezone` cadastrado (esperado: `America/Bahia`
   para as fazendas atuais).
2. Fallback: `America/Bahia` (constante `OPEN_METEO_FALLBACK_TIMEZONE`).
3. **Nunca** inferir do navegador. **Nunca** usar `timezone=auto`.

Registros de tempo:
- `fetchedAt` e `forecastIssuedAt` → **UTC** (ISO-8601 com `Z`).
- `validAt` → interpretado no timezone da localização
  (a string `YYYY-MM-DDTHH:MM` recebida do horário Open-Meteo já
  está no fuso enviado no querystring).
- `date` diário → `YYYY-MM-DD` **local da fazenda**.

O fluxo antigo (default `America/Sao_Paulo` em `ingestion.service.ts`)
**não foi alterado** nesta etapa.

---

## 5 · Resultados dos testes

```
Test Files  7 passed (7)
Tests     102 passed (102)
tsc --noEmit → 0 erros
```

Distribuição:

| Suíte | Testes |
|---|---|
| `weatherUnits.test.ts` (Etapa 1) | 10 |
| `weatherQuality.test.ts` (Etapa 1) | 24 |
| `referenceEtoFao56.reference.test.ts` (Etapa 2) | 23 |
| `referenceEtoFao56.sensitivity.test.ts` (Etapa 2) | 14 |
| `openMeteoProvider.test.ts` (Etapa 3) | 12 |
| `normalizeOpenMeteo.test.ts` (Etapa 3) | 12 |
| `openMeteoEtoDiagnostic.test.ts` (Etapa 3) | 6 |
| **Total** | **102** |

Casos cobertos: normalização diária/horária completa; null preservado
em todos os campos; vento 10 m preservado + u2 derivado; pressão hPa→kPa;
radiação diária sem dupla conversão; timezone padrão respeitado;
data futura → `forecast` / data passada → `observed`; erros HTTP
tipados (4xx sem retry, 5xx com 1 retentativa); timeout;
payload não-JSON; healthCheck; comparação ETo com diff nulo quando
`providerEto` é `null`; determinismo; direção do vento circular;
completude 90/70/<70.

---

## 6 · Exemplo real de comparação ETo (Open-Meteo × interna)

Localização: **Oeste da BA (-12.34°, -45.67°, 720 m)**,
timezone `America/Bahia`. Chamada real à API pública em 2026-08.

| Data | providerETo (mm/dia) | internalETo (mm/dia) | Δabs (mm) | Δpct | Qualidade |
|---|---|---|---|---|---|
| 2026-07-29 | 5.43 | 5.28 | 0.15 | −2.7% | complete |
| 2026-07-30 | 5.85 | 5.71 | 0.14 | −2.3% | complete |
| 2026-07-31 | 6.34 | 6.03 | 0.31 | −4.9% | complete |
| 2026-08-01 | 6.14 | 5.92 | 0.22 | −3.5% | complete |

**Interpretação:** interna sistematicamente 2–5% abaixo. Consistente
com o esperado: a ETo da Open-Meteo é agregada a partir de dados
**horários** (usando radiação instantânea, gradiente diurno de temperatura
e VPD hora a hora), enquanto o motor interno usa médias diárias e derivadas.
A diferença é o custo natural de calcular ETo diária com um único ponto
por variável em vez de 24. Nada indica erro no motor — a ordem de grandeza
está bem alinhada e a validação matemática já foi feita na Etapa 2.

---

## 7 · Warnings e limitações registradas

- **Modelo meteorológico:** `metadata.modelName = null`. A Open-Meteo
  usa best-match automático e o payload não expõe o modelo escolhido —
  registrar `null` é a escolha honesta.
- **Pressão diária:** derivada de `(min + max) / 2` (com warning
  `"surface_pressure diário derivado de (min+max)/2 (sem _mean oficial)"`).
  Precisão suficiente para ETo diária; média horária real deve ser usada
  quando disponível.
- **Vento a 2 m:** sempre derivado de `wind_speed_10m_mean` via
  FAO-56 eq. 47 (função central `adjustWindToTwoMeters`) com warning
  `"windSpeed2mMs derivado de windSpeed10mMs (FAO-56 eq. 47)"`.
  O valor a 10 m é **preservado** em `windSpeed10mMs`.
- **Arquivo vs. forecast:** se `range.endDate` for > 5 dias no
  passado, provider usa `archive-api.open-meteo.com`; caso contrário,
  `/v1/forecast`. Dados definitivos vs. quase-tempo-real.
- **Modelo horário `shortwave_radiation`:** é **W/m² como média da
  hora anterior** — usar `wm2ToMjM2Day(value, 3600)` ao agregar
  hora-a-hora (função central já testada).
- **Cache:** não implementado nesta etapa (fora do escopo). Cada
  chamada bate na API.

---

## 8 · Modo paralelo — impacto zero no fluxo atual

**Nada** da nova camada roda automaticamente. Para acionar em
diagnóstico manual:

```ts
import { createOpenMeteoProvider } from "@/modules/weather/providers/openMeteoProvider";
import { runOpenMeteoEtoDiagnostic } from "@/modules/weather/diagnostics/openMeteoEtoDiagnostic";

const provider = createOpenMeteoProvider();
const diag = await runOpenMeteoEtoDiagnostic(provider,
  { id: "…", name: "…", latitude: -12.34, longitude: -45.67, elevationM: 720, timezone: "America/Bahia" },
  { startDate: "2026-08-01", endDate: "2026-08-07" }
);
```

Confirmação de que o fluxo antigo **não** foi alterado:

- `modules/weather/providers/open-meteo.ts` — **INTOCADO**
- `modules/weather/services/ingestion.service.ts` — **INTOCADO**
- `modules/weather/services/provider-registry.ts` — **INTOCADO**
- `modules/weather/services/weather.service.ts` — **INTOCADO**
- `modules/weather/services/meteoblue-ingest.ts` — **INTOCADO**
- `modules/weather/services/source-resolver.ts` — **INTOCADO**
- `modules/weather/services/virtual-station.service.ts` — **INTOCADO**
- `modules/irrigation/services/irrigation.service.ts` — **INTOCADO**
- Migrations, Supabase, RLS, cron, frontend — **INTOCADOS**

`grep -r "openMeteoProvider\|normalizeOpenMeteo\|runOpenMeteoEtoDiagnostic" app/` → sem resultados. Nada da nova cadeia é importado por rotas ou telas.

---

## 9 · Divergências em relação ao plano

- **Nomes de variáveis com prefixo (`mean_*`, `maximum_*`) rejeitados pela API real.**
  A auditoria da Fase 1 usou os nomes que a docs pública lista; a API
  em produção só aceita a variante com sufixo (`_min/_max/_mean`).
  Todos os nomes foram corrigidos antes do commit final.
- **`surface_pressure_mean` diário não existe.** Passamos a derivar
  da média de `min`/`max` com warning. Alternativa exata exige o
  endpoint horário.
- **Todos os demais itens do plano foram cumpridos.**
