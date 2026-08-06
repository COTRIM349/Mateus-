# Provedores climáticos — Matriz de compatibilidade

**Versão:** 1.0.0 (companion do [`CLIMATE_SPECIFICATION.md`](./CLIMATE_SPECIFICATION.md))

Esta matriz registra apenas o que **temos evidência real** — verificado por
integração testada, chamada direta à API ou documentação oficial cruzada
com resposta HTTP. Provedores ainda não integrados aparecem com colunas
em branco e nota **"não confirmado — integração pendente"**.

Diretriz: **não inventar endpoints ou capacidades**. Cada nova integração
atualiza esta tabela como parte do PR.

---

## Legenda

- ✅ **verificado empiricamente** (chamada real à API OU integração ativa)
- ⚠️ **documentado mas não verificado** (docs pública menciona; sem teste)
- ❌ **confirmado como indisponível** (API retorna erro ou docs excluem)
- **—** não confirmado ainda

---

## 1. Open-Meteo · ✅ **integrado** (Etapa 3, modo paralelo)

| Item | Valor |
|---|---|
| Previsão | ✅ (endpoint `/v1/forecast`, `forecast_days` 1..16) |
| Histórico | ✅ (endpoint `archive-api.open-meteo.com/v1/archive`, latência ~5 dias) |
| Resolução temporal | horário e diário |
| Resolução espacial | ~11 km (grade de modelos globais) |
| Autenticação | não requer chave |
| Custo | gratuito para uso não comercial (CC-BY 4.0) |
| Timezone | parâmetro `timezone` (aceita IANA) |
| Vento | `wind_speed_unit=ms` confirmado |

### Variáveis verificadas 1-a-1 (Etapa 3)

| Diária | Status | Notas |
|---|---|---|
| `temperature_2m_min/max/mean` | ✅ 200 | °C |
| `relative_humidity_2m_min/max/mean` | ✅ 200 | % |
| `precipitation_sum` | ✅ 200 | mm |
| `precipitation_probability_max` | ✅ 200 | % |
| `shortwave_radiation_sum` | ✅ 200 | **MJ/m²/dia** (já integrada, sem dupla conversão) |
| `wind_speed_10m_mean/max` | ✅ 200 | m/s (com `wind_speed_unit=ms`) |
| `wind_direction_10m_dominant` | ✅ 200 | ° |
| `surface_pressure_min/max` | ✅ 200 | hPa → converter para kPa |
| `vapour_pressure_deficit_max` | ✅ 200 | kPa |
| `et0_fao_evapotranspiration` | ✅ 200 | mm/dia |
| ~~`mean_relative_humidity_2m`~~ | ❌ 400 | **docs Markdown lista, API rejeita** |
| ~~`mean_surface_pressure`~~ | ❌ 400 | idem — não existe agregação `_mean` diária oficial |
| ~~`maximum_vapour_pressure_deficit`~~ | ❌ 400 | usar `vapour_pressure_deficit_max` |

| Horária | Status | Notas |
|---|---|---|
| `temperature_2m` | ✅ | °C |
| `relative_humidity_2m` | ✅ | % |
| `precipitation` | ✅ | mm |
| `precipitation_probability` | ✅ | % |
| `shortwave_radiation` | ✅ | **W/m²** (fluxo médio da hora anterior) |
| `wind_speed_10m` | ✅ | m/s |
| `wind_direction_10m` | ✅ | ° |
| `surface_pressure` | ✅ | hPa → converter |
| `vapour_pressure_deficit` | ✅ | kPa |
| `et0_fao_evapotranspiration` | ✅ | mm |

### Metadados retornados

`latitude`, `longitude`, `elevation`, `timezone`, `timezone_abbreviation`,
`utc_offset_seconds`, `generationtime_ms`. `modelName` **não** é exposto no
payload (Open-Meteo faz best-match automático) — registrar `null`.

### Limitações conhecidas

- `surface_pressure_mean` diário **não existe** — derivar do horário ou
  usar `(min+max)/2` (com warning).
- Modelo escolhido não é reportado — sem rastreabilidade fina do modelo.
- Radiação horária é **média** da hora, não pico.

### Uso recomendado

- Previsão principal de curto prazo (§3 da spec).
- Fonte de radiação, VPD e precipitação prevista.
- **Comparação com a ETo interna** (via `openMeteoEtoDiagnostic`).

### Uso NÃO recomendado

- Como ETo oficial (spec §2 proíbe).
- Como pluviômetro para chuva observada em fazenda com estação
  in situ (§3 → estação tem prioridade).

---

## 2. Meteoblue · legado (ingestão paralela, sem Rs)

| Item | Valor |
|---|---|
| Previsão | ⚠️ (via package `basic-day`) |
| Histórico | ⚠️ |
| Resolução temporal | diário (no plano básico) |
| Resolução espacial | ~4 km (varia por pacote) |
| Autenticação | **requer** `METEOBLUE_API_KEY` |
| Custo | por pacote; comercial |

### Variáveis (via `modules/weather/providers/meteoblue.ts` legado)

| Variável | Status | Notas |
|---|---|---|
| Temperatura min/max/mean | ⚠️ | disponível no `basic-day` |
| Umidade média | ⚠️ | idem |
| Vento (km/h) | ⚠️ | convertido para m/s no legado (**sem** ajuste 10m→2m — bug conhecido no legado) |
| Precipitação | ⚠️ | idem |
| Pressão (sea level, hPa) | ⚠️ | não persistida hoje |
| Radiação solar | ❌ | **não fornecida** no plano básico → não permite ETo interna |
| ETo (`providerReferenceEtoMm`) | ❌ | não retornado |

### Limitações conhecidas

- Sem radiação → `internallyCalculatedEtoMm = null`.
- Legado converte km/h → m/s **sem** ajuste 10m→2m: quando migrar para a
  nova camada, usar `adjustWindToTwoMeters(kmhToMs(u), 10)`.

### Uso recomendado

- Comparação secundária.
- Se um pacote com radiação for adquirido, promover a fonte de radiação.

---

## 3. NASA POWER · **não integrado**

| Item | Valor |
|---|---|
| Previsão | ❌ |
| Histórico / reanálise | ⚠️ (documentado, não verificado) |
| Resolução temporal | diário |
| Resolução espacial | ~0.5° × 0.625° (~55 km × 70 km) |
| Autenticação | não requer chave |
| Custo | gratuito |

### Variáveis previstas (a confirmar quando integrar)

`T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS10M`, `PRECTOTCORR`,
`ALLSKY_SFC_SW_DWN`, `PS`.

### Uso previsto

- Histórico e reanálise (spec §3).
- **Nunca** como fonte única para chuva operacional (resolução grosseira).

Status: aguarda etapa dedicada de integração.

---

## 4. NOAA Climate Data Online (GHCND) · **não integrado**

| Item | Valor |
|---|---|
| Previsão | ❌ |
| Histórico | ⚠️ |
| Resolução temporal | diário |
| Resolução espacial | por estação (pontual) |
| Autenticação | **requer** `NOAA_API_TOKEN` |
| Custo | gratuito com registro |

### Variáveis previstas

`TMAX`, `TMIN`, `TAVG`, `PRCP`, `AWND` (do dataset GHCND).

### Uso previsto

- Dados de estações próximas com score de representatividade (distância,
  altitude, completude, período, cobertura de variáveis).
- **Nunca** usar automaticamente a estação mais próxima sem passar pelo
  score.

Status: aguarda etapa dedicada.

---

## 5. Meteostat · **não integrado**

| Item | Valor |
|---|---|
| Previsão | ❌ |
| Histórico | ⚠️ |
| Resolução temporal | diário/horário |
| Resolução espacial | por estação (pontual) |
| Autenticação | **requer** `METEOSTAT_API_KEY` |
| Custo | freemium |

### Variáveis previstas

`tavg`, `tmin`, `tmax`, `prcp`, `wdir`, `wspd`, `wpgt`, `pres`, `tsun`.

### Uso previsto

- Histórico complementar quando NOAA/estação da fazenda não cobrirem.

Status: aguarda etapa dedicada.

---

## 6. Estação da fazenda · interface prevista

| Item | Valor |
|---|---|
| Tipo | in situ, dado `station` |
| Previsão | ❌ |
| Histórico | in situ, do que estiver disponível no equipamento |
| Resolução temporal | depende do equipamento |
| Autenticação | depende do fornecedor |

### Variáveis previstas

Todas as básicas + ETo calculada pela própria estação (a considerar
separadamente da ETo interna Cotrim).

### Uso previsto

- Fonte in situ com **prioridade máxima** em §3 quando ativa.
- Registrar timestamp original, id da estação, status de comunicação,
  qualidade do sensor, período sem leitura.

Status: aguarda cadastro de equipamentos reais.

---

## 7. Manual · integrado no fluxo legado

| Item | Valor |
|---|---|
| Uso | correção e complemento (chuva, temperatura, observação) |
| Regras | nunca substituir silenciosamente o registro original; registrar autor, data, motivo |
| UI | aba "Lançamento manual" em `/clima` (fluxo legado) |

---

## Resumo executivo

| Provedor | Integrado? | ETo? | Radiação? | Uso principal |
|---|---|---|---|---|
| Open-Meteo | ✅ (paralelo) | comparação | ✅ (MJ/m²/dia) | previsão |
| Meteoblue | legado | ❌ (sem Rs) | ❌ | comparação secundária |
| NASA POWER | não | — | ⚠️ | histórico/reanálise |
| NOAA | não | — | — | estações |
| Meteostat | não | — | — | histórico complementar |
| Fazenda | não (interface) | — | — | observado in situ |
| Manual | legado | — | — | correção humana |
