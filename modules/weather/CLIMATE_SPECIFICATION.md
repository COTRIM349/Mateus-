# Climate Specification — Cotrim Irrigação Pro

**Versão:** `1.0.0` · **Status:** ativa · **Última revisão:** Etapa 4 (Sprint 12)

Especificação oficial da camada climática. Define **unidades, faixas físicas,
prioridade de fontes, agregações, qualidade, ETo oficial e contrato com o
balanço hídrico**. Cada regra normativa também vive em código, em
[`config/climateSpecification.ts`](./config/climateSpecification.ts) —
os dois documentos são mantidos em sincronia (single source of truth).

Esta spec **não altera comportamento de runtime** — descreve o contrato que
o sistema deve satisfazer. Migrações do fluxo legado são assunto de etapas
dedicadas (§12 e Apêndice C).

---

## Índice

1. [Variáveis oficiais](#1-variaveis-oficiais)
2. [ETo oficial](#2-eto-oficial)
3. [Prioridade das fontes](#3-prioridade-das-fontes)
4. [Tipos de dado](#4-tipos-de-dado)
5. [Agregação horária → diária](#5-agregacao-horaria-diaria)
6. [Qualidade](#6-qualidade)
7. [Faixas físicas e validações](#7-faixas-fisicas)
8. [Timezone](#8-timezone)
9. [Provedores (compatibilidade)](#9-provedores)
10. [Contrato com o balanço hídrico](#10-contrato-com-o-balanco-hidrico)
11. [Configuração em código](#11-configuracao-em-codigo)
12. [Governança e versionamento](#12-governanca)
- [Apêndice A — Glossário](#apendice-a-glossario)
- [Apêndice B — Referências](#apendice-b-referencias)
- [Apêndice C — Divergências conhecidas](#apendice-c-divergencias)

---

## 0. Metadados

- **Mantenedor:** time da plataforma Cotrim Irrigação Pro.
- **Escopo:** toda a camada climática (`modules/weather/*`).
- **Fora de escopo:** motor agronômico do balanço hídrico
  (`modules/water-balance`), motor de recomendação (`modules/recommendation`),
  módulo de irrigação (`modules/irrigation`). A spec **define o contrato**
  que a integração terá que respeitar, mas não a conecta.
- **Compatibilidade:** desta versão em diante, cada mudança normativa exige
  bump de versão (SemVer) e entrada em §12.

---

## 1. Variáveis oficiais {#1-variaveis-oficiais}

24 variáveis. Cada linha da tabela descreve:

- **N**ome técnico e significado
- **Unid.** interna obrigatória
- **Faixa** física esperada (validação em `weatherQuality`)
- **Obr.?** obrigatória para o cálculo canônico (ETo/agregação diária)
- **Est.?** estimável pelo motor com metodologia declarada
- **Ausente:** comportamento quando não vem da fonte

Legenda: ✅ obrigatória · ⚠️ condicional · ❌ nem obrigatória nem estimada.

### 1.1 Meteorológicas

| Campo | Unid. | Faixa | Obr.? | Est.? | Método de estimativa | Ausente |
|---|---|---|---|---|---|---|
| `temperatureMinC` | °C | −15…55 | ✅ | ❌ | — | ETo = null, quality = missing |
| `temperatureMaxC` | °C | −15…55 | ✅ | ❌ | — | idem |
| `temperatureMeanC` | °C | −15…55 | ⚠️ | ✅ | `(Tmin+Tmax)/2` (FAO-56) | `estimatedFields` + quality → `estimated` |
| `relativeHumidityMinPct` | % | 0…100 | ⚠️ | ❌ | — | cai para RHmean; sem nenhuma → missing |
| `relativeHumidityMaxPct` | % | 0…100 | ⚠️ | ❌ | — | idem |
| `relativeHumidityMeanPct` | % | 0…100 | ⚠️ | ❌ | — | usada só como fallback de ea (menor precisão) |
| `precipitationMm` | mm/dia | 0…500 | — | ❌ | — | ETo continua; alertas de chuva ficam null |
| `precipitationProbabilityPct` | % | 0…100 | — | ❌ | — | null |
| `windSpeed10mMs` | m/s | 0…40 | — | ❌ | — | vento a 10m ausente → tenta u2 direto |
| `windSpeed2mMs` | m/s | 0…40 | ✅ | ✅ | FAO-56 eq. 47 a partir de u10 | `estimated` |
| `windDirectionDeg` | ° | 0…360 | — | ✅ | média circular ponderada pela velocidade | `estimated` |
| `solarRadiationWm2` | W/m² (horário) | 0…1500 | — (hor.) | ❌ | — | usada só para agregação diária |
| `solarRadiationMjM2Day` | MJ/m²/dia | 0…45 | ✅ | ✅ | `wm2ToMjM2Day(mean, 3600)` sobre horas válidas | `estimated` |
| `surfacePressureKpa` | kPa | 60…110 | ⚠️ | ✅ | FAO-56 eq. 7 via elevação | `estimated` |
| `vapourPressureDeficitKpa` | kPa | 0…10 | — (motor calcula) | ✅ | `es − ea` (interno) | recomputado |
| `providerReferenceEtoMm` | mm/dia | 0…20 | ❌ | — | — | fica null — **nunca substitui ETo interna** |
| `internallyCalculatedEtoMm` | mm/dia | 0…20 | — (é o resultado) | — | FAO-56 PM (Etapa 2) | null (impede uso pelo balanço) |

### 1.2 Localização e tempo

| Campo | Unid. | Faixa | Obr.? |
|---|---|---|---|
| `elevationM` | m | −500…6000 | ✅ (via pressão) |
| `latitude` | ° decimais | −90…90 | ✅ (Ra) |
| `longitude` | ° decimais | −180…180 | — |
| `timezone` | IANA | (str) | ✅ (agregação diária) |
| `validAt` | ISO-8601 local | — | ✅ |
| `forecastIssuedAt` | ISO-8601 UTC | — | ⚠️ (só forecast) |
| `fetchedAt` | ISO-8601 UTC | — | ✅ (rastreabilidade + `stale`) |

### 1.3 Usos por variável

Cada variável tem um **uso agronômico** documentado:

| Variável | FAO-56 | Alerta | Balanço hídrico |
|---|---|---|---|
| `temperatureMinC` | Δ, Rnl, e°(Tmin) | frio | via ETc |
| `temperatureMaxC` | Δ, Rnl, e°(Tmax) | calor | via ETc |
| `temperatureMeanC` | termo aerodinâmico | — | via ETc |
| `relativeHumidity*` | ea | — | via ETc |
| `precipitationMm` | — | chuva forte | **entrada direta** (chuva efetiva) |
| `windSpeed2mMs` | termo aerodinâmico | vento forte | via ETc |
| `solarRadiationMjM2Day` | Rns, Rnl, Rn | — | via ETc |
| `surfacePressureKpa` | γ | — | via ETc |
| `internallyCalculatedEtoMm` | resultado | — | **entrada direta** |
| `providerReferenceEtoMm` | — | — | **proibido** (§2, §10) |

---

## 2. ETo oficial {#2-eto-oficial}

**Regra fundamental:** a ETo oficial da plataforma é
`internallyCalculatedEtoMm`, calculada pelo motor FAO-56 Penman-Monteith
validado na Etapa 2 (`referenceEtoFao56.ts`).

**Contrato:**

- Método exclusivo: **FAO-56 Penman-Monteith** (Allen et al., 1998).
  Constante em código: `OFFICIAL_ETO_METHOD = "fao_56_penman_monteith"`.
- `providerReferenceEtoMm` **existe apenas para**:
  1. `diagnostic` — verificar consistência entre modelo Cotrim e provider
  2. `ui_comparison` — mostrar as duas ETo lado a lado em tela de análise
  3. `audit` — comparação histórica
- `providerReferenceEtoMm` **NUNCA** pode alimentar:
  - `water_balance` (motor de balanço hídrico)
  - `irrigation_recommendation` (motor de recomendação)
- Quando faltar variável essencial (§1.1), `internallyCalculatedEtoMm = null`
  e `qualityStatus = "missing"`. **Não gerar valor enganoso.**
- Toda estimativa (Tmean derivada, P via elevação, u2 a partir de u10)
  entra em `estimatedFields` do resultado; qualidade cai para `estimated`.

**Divergência C3** (Apêndice C): a UI atualmente usa
`?? provider ?? 0` como fallback de exibição. **Esta spec autoriza a UI
a exibir `providerReferenceEtoMm` para comparação**, mas **proíbe** o `?? 0`
(deve exibir `—` ou `null`). Correção do código legado fica para etapa
própria de limpeza da UI.

---

## 3. Prioridade das fontes {#3-prioridade-das-fontes}

Matriz **inicial e configurável**. Serve como default enquanto não temos
dados de validação por região/fazenda. Configurável por fazenda em etapa
futura. Em código: `SOURCE_PRIORITY`.

| Variável | 1º | 2º | 3º | 4º | 5º | 6º | 7º |
|---|---|---|---|---|---|---|---|
| **temperature** | farm_station | manual | open_meteo | meteoblue | noaa | meteostat | nasa_power |
| **humidity** | farm_station | manual | open_meteo | meteoblue | noaa | meteostat | nasa_power |
| **precipitation observed** | farm_station | manual | noaa | meteostat | nasa_power | — | — |
| **precipitation forecast** | open_meteo | meteoblue | — | — | — | — | — |
| **wind** | farm_station | manual | open_meteo | meteoblue | meteostat | noaa | nasa_power |
| **radiation** | farm_station | open_meteo | meteoblue | nasa_power | — | — | — |
| **pressure** | farm_station | open_meteo | meteoblue | — | — | — | — |
| **eto** | *(vazio — sempre interna)* | | | | | | |

**Regra dura:** um provedor listado sem cobertura confirmada da variável
(cf. `PROVIDERS_COMPATIBILITY.md`) é ignorado silenciosamente para essa
variável — o consumidor segue para o próximo.

---

## 4. Tipos de dado {#4-tipos-de-dado}

Definidos em `WeatherDataType` (Etapa 1):

| Tipo | Origem típica |
|---|---|
| `observed` | rede/estação, tempo real |
| `forecast` | previsão emitida em `forecastIssuedAt` |
| `reanalysis` | grade histórica reprocessada (ex.: NASA POWER) |
| `station` | estação da fazenda (in situ) |
| `manual` | digitado pelo operador |
| `calculated` | derivado por cálculo (ex.: ETo interna) |
| `estimated` | valor estimado por método declarado |

### Regras obrigatórias

1. **Não misturar observado com previsto** no mesmo registro. Se um dia
   tem observação até 12h e previsão a partir das 13h, são dois registros
   (ou o dia inteiro é classificado no tipo do dado que compõe a maioria,
   com warning).
2. **Não misturar reanálise com medição**. Reanálise só entra em fluxos
   históricos ou como preenchimento explícito.
3. **Não compor dados de provedores diferentes sem registrar a composição**.
   Se `temperatureMinC` vem da estação e `solarRadiation` vem da Open-Meteo,
   isso deve aparecer em `metadata.warnings`.
4. **Não apresentar estimado como medido**. `qualityStatus = "estimated"`
   é obrigatório sempre que houver estimativa.
5. **Nunca substituir silenciosamente um registro original**. Toda
   substituição por lançamento manual ou correção deve ficar em auditoria.

---

## 5. Agregação horária → diária {#5-agregacao-horaria-diaria}

Regras em `DAILY_AGGREGATION_RULES`:

| Diário | Regra sobre horários válidos |
|---|---|
| `temperatureMinC` | mínimo |
| `temperatureMaxC` | máximo |
| `temperatureMeanC` | média aritmética |
| `relativeHumidityMinPct` | mínimo |
| `relativeHumidityMaxPct` | máximo |
| `relativeHumidityMeanPct` | média aritmética |
| `precipitationMm` | soma |
| `surfacePressureKpa` | média aritmética |
| `vapourPressureDeficitKpaMean` | média aritmética |
| `vapourPressureDeficitKpaMax` | máximo |
| `windSpeed2mMsMean` | média aritmética |
| `windSpeed2mMsMax` | máximo |
| `windDirectionDeg` | **média circular ponderada pela velocidade** (nunca média aritmética simples) |
| `solarRadiationMjM2Day` | integração temporal: `wm2ToMjM2Day(fluxo, 3600)` por hora → soma |

### 5.1 Completude

- **complete**: ≥ 90% das horas esperadas com valor válido.
- **partial**: 70% ≤ x < 90%.
- **missing**: < 70%.

Se uma variável **essencial** da ETo depende de agregação classificada
como `missing`, o cálculo diário fica `null` (§6, §2).

### 5.2 Dias com 23 ou 25 horas (horário de verão)

- `America/Bahia` **não observa horário de verão** desde 2019 (Decreto
  9.772/2019, Brasil). Portanto, na prática, dias sempre têm 24 horas.
- **Regra geral** (para outros timezones que possam entrar depois):
  a agregação usa o **número real de horas locais** do dia (23 no dia
  de início do DST, 25 no fim). A completude é calculada sobre esse
  número esperado.

---

## 6. Qualidade {#6-qualidade}

Definida em `WeatherQualityStatus`. Precedência (mais grave primeiro):

```
invalid > missing > stale > suspicious > partial > complete
```

Regras objetivas por status:

- **`complete`** — todas as variáveis essenciais da tarefa presentes e
  dentro das faixas físicas.
- **`partial`** — faltam variáveis **não essenciais**, mas nenhuma
  essencial.
- **`stale`** — dado observado além de `MAX_AGE.observedHours` (48h),
  ou forecast além de `MAX_AGE.forecastHours` (24h).
- **`missing`** — falta pelo menos uma variável essencial da tarefa.
- **`invalid`** — pelo menos um valor fora da faixa física (§7) ou
  coerência quebrada (Tmin > Tmax, RHmin > RHmax, timestamp inválido).
- **`suspicious`** — dentro do possível fisicamente, mas fora do esperado
  para o contexto (ex.: `temperatureMeanC` fora do intervalo Tmin–Tmax).
- **`unavailable`** — consulta não foi realizada (provider desabilitado
  ou fora do ar).
- **`estimated`** — ao menos um valor foi estimado pelo motor com
  metodologia declarada.

### 6.1 Tratamento de valores suspeitos

**Nunca apagar.** Sempre classificar (`suspicious` ou `invalid`) e preservar
para auditoria. O consumidor decide se aceita ou não.

### 6.2 Quando bloquear cálculo de ETo

Regras codificadas em `ETO_BLOCKING_RULES`. Resumo:

- **Bloqueiam** (ETo → null): Tmin, Tmax, Rs ausentes; sem qualquer forma
  de vento; sem qualquer forma de umidade; sem pressão nem elevação.
- **Não bloqueiam mas degradam para `estimated`**: Tmean ausente com
  Tmin+Tmax presentes; RHmin/RHmax ausentes com RHmean presente;
  pressão ausente com elevação presente.

---

## 7. Faixas físicas e validações {#7-faixas-fisicas}

Fonte única: `DEFAULT_PHYSICAL_RANGES` em
`modules/weather/quality/weatherQuality.ts`, re-exportada como
`PHYSICAL_RANGES` na spec (§11). Alterar em um único lugar propaga
automaticamente.

| Grandeza | Mínimo | Máximo |
|---|---|---|
| temperatura (°C) | −15 | 55 |
| umidade (%) | 0 | 100 |
| precipitação (mm/dia) | 0 | 500 |
| vento (m/s) | 0 | 40 |
| radiação diária (MJ/m²/d) | 0 | 45 |
| pressão (kPa) | 60 | 110 |
| ETo (mm/dia) | 0 | 20 |
| latitude (°) | −90 | 90 |
| longitude (°) | −180 | 180 |
| altitude (m) | −500 | 6000 |

Timestamps: `validAt` de dado observado **não pode** estar no futuro
(tolerância 1h de fuso, definida em `weatherQuality.assessDailyWeatherQuality`).

---

## 8. Timezone {#8-timezone}

Regras da nova camada:

1. **Fonte primária:** `WeatherLocation.timezone` (IANA).
2. **Fallback oficial:** `America/Bahia` (`DEFAULT_TIMEZONE`).
3. **`fetchedAt`** e **`forecastIssuedAt`** — sempre em **UTC** (`Z`).
4. **`validAt`** — preserva instante local do dado.
5. **`date`** de agregação diária — segue a data local da fazenda.
6. **Nunca** inferir timezone pelo navegador.
7. **Nunca** usar `timezone=auto` em queries a provedores.
8. **Nunca** deslocar a data agrícola por conversão UTC (evitar hack
   `T12:00:00Z` no consumidor — a spec exige data local explícita).

**Divergência C1** (Apêndice C): o fluxo legado usa `America/Sao_Paulo`.
Diferença agronômica é nula (ambos UTC−3 sem DST), mas o rótulo divergente
será corrigido em etapa de migração.

---

## 9. Provedores {#9-provedores}

Tabela detalhada em [`PROVIDERS_COMPATIBILITY.md`](./PROVIDERS_COMPATIBILITY.md).

Resumo desta spec:

| Provedor | Status atual | Uso previsto |
|---|---|---|
| Open-Meteo | ✅ **integrado** (Etapa 3, modo paralelo) | previsão principal, radiação, comparação de ETo |
| Meteoblue | integração legada (ingestão) | comparação; sem Rs → não computa ETo interna |
| NASA POWER | não integrado | histórico e reanálise (uso futuro) |
| Meteostat | não integrado | histórico complementar (uso futuro) |
| NOAA | não integrado | dados de estações (uso futuro) |
| Estação da fazenda | interface prevista | observado (in situ) |
| Manual | integrado (fluxo legado) | correção e complemento |

**Não inventar endpoints ou capacidades ainda não confirmadas.** Cada
integração real gera atualização em `PROVIDERS_COMPATIBILITY.md`.

---

## 10. Contrato com o balanço hídrico {#10-contrato-com-o-balanco-hidrico}

Em código: `WATER_BALANCE_CONTRACT`. Define o que a integração futura
terá que satisfazer:

- **ETo consumida:** exclusivamente `internallyCalculatedEtoMm`.
- **Chuva:** apenas registros de tipo `observed` ou `manual` para
  chuva ocorrida; `forecast` só para projeções.
- **Metadados obrigatórios:** origem (`WeatherSourceMetadata.provider`)
  e qualidade (`qualityStatus`).
- **Estado atual:** `connectedInEtapa: null` — a spec **não conecta**
  o balanço hídrico. Só define o contrato.

---

## 11. Configuração em código {#11-configuracao-em-codigo}

Arquivo: [`config/climateSpecification.ts`](./config/climateSpecification.ts).

Exports normativos:

- `CLIMATE_SPEC_VERSION = "1.0.0"`
- `OFFICIAL_UNITS`, `PHYSICAL_RANGES`, `COMPLETENESS_THRESHOLDS`, `MAX_AGE`
- `DEFAULT_TIMEZONE`
- `OFFICIAL_ETO_METHOD`, `OFFICIAL_ETO_FIELD`, `PROVIDER_ETO_FIELD`
- `PROVIDER_ETO_ALLOWED_USES`, `PROVIDER_ETO_FORBIDDEN_USES`
- `ETO_ESSENTIAL_FIELDS`, `ETO_ESTIMABLE_FIELDS`, `ETO_BLOCKING_RULES`
- `SOURCE_PRIORITY`, `DAILY_AGGREGATION_RULES`
- `WATER_BALANCE_CONTRACT`, `KNOWN_DIVERGENCES`
- `CLIMATE_SPECIFICATION` (snapshot)

**Diretriz de manutenção:** a spec **re-exporta** constantes que já
existem em `weatherQuality.ts` / `weatherUnits.ts` / `openMeteoProvider.ts`.
Não redeclarar. Alterar em um único lugar propaga.

Testes: `config/climateSpecification.test.ts` (29 testes).

---

## 12. Governança e versionamento {#12-governanca}

- **Versão:** SemVer `MAJOR.MINOR.PATCH`.
- **PATCH:** correção de redação, sem mudança normativa.
- **MINOR:** adição retro-compatível (novo campo opcional, novo provider,
  nova regra que não invalida integração existente).
- **MAJOR:** mudança que quebra contrato (renomear campo essencial,
  mudar unidade oficial, remover provider suportado, alterar prioridade
  em uma linha adotada por integração viva).
- **Cada mudança normativa** deve:
  1. Vir com PR que altera `CLIMATE_SPECIFICATION.md` **e**
     `climateSpecification.ts` no mesmo commit.
  2. Bumpar `CLIMATE_SPEC_VERSION`.
  3. Registrar entrada aqui em §12 (changelog abaixo).

### Changelog

- **v1.0.0** — 2026-08 (Etapa 4 / Sprint 12) — versão inicial: fundação,
  ETo oficial, matriz de prioridade, contrato com balanço,
  divergências C1/C2/C3 documentadas.

---

## Apêndice A — Glossário {#apendice-a-glossario}

- **ETo** — evapotranspiração de referência (mm/dia).
- **ETc** — evapotranspiração da cultura, `ETc = Kc × ETo`.
- **FAO-56** — Allen et al. (1998), Irrigation and Drainage Paper 56.
- **Penman-Monteith (PM)** — equação da ETo diária (FAO-56 eq. 6).
- **Rs** — radiação solar global à superfície (MJ/m²/dia).
- **Ra** — radiação solar extraterrestre (MJ/m²/dia).
- **Rso** — radiação solar de céu claro (MJ/m²/dia).
- **Rn** — radiação líquida na superfície (MJ/m²/dia).
- **Rns/Rnl** — radiação líquida de ondas curtas/longas.
- **γ** — constante psicrométrica (kPa/°C).
- **Δ** — inclinação da curva de pressão de vapor (kPa/°C).
- **es / ea** — pressão de vapor de saturação / real (kPa).
- **VPD** — déficit de pressão de vapor (kPa).
- **u2** — velocidade do vento a 2 m (m/s).
- **CAD / AFD** — capacidade de água disponível / facilmente disponível.

---

## Apêndice B — Referências {#apendice-b-referencias}

- Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). *Crop
  evapotranspiration — Guidelines for computing crop water requirements*.
  FAO Irrigation and Drainage Paper 56. Rome: FAO.
- Documentação Open-Meteo: <https://open-meteo.com/en/docs>
  (variáveis confirmadas empiricamente na Etapa 3).
- USDA-SCS: cálculo de precipitação efetiva (usado em
  `weather.service.calculateEffectivePrecipitation`).

---

## Apêndice C — Divergências conhecidas {#apendice-c-divergencias}

Em código: `KNOWN_DIVERGENCES`.

| ID | Local | Comportamento legado | Decisão da spec | Correção prevista |
|---|---|---|---|---|
| **C1** | `ingestion.service.ts`, `meteoblue-ingest.ts`, `virtual-station.service.ts` | Fallback = `America/Sao_Paulo` | Canônico = `America/Bahia` | Etapa de migração de timezone |
| **C2** | `weather.service.ts` (`validateWeatherReading`) | Faixas de temperatura mais estreitas | `PHYSICAL_RANGES` (`−15..55`) é oficial; `validateWeatherReading` é validador legado | Consolidação de validações |
| **C3** | `app/(app)/clima/page.tsx` | `d.et0_calculated ?? d.et0_source ?? 0` | UI pode mostrar `providerReferenceEtoMm` para comparação, **nunca como zero**; balanço/recomendação **proibidos** de consumir provider | Limpeza da UI |

Nenhuma dessas divergências afeta cálculo agronômico atual — todas são
questões de rótulo ou de exibição. Suas correções virão em etapas próprias.
