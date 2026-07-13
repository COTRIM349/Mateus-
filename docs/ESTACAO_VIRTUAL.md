# Estação Virtual — Cotrim Irrigação Pro

> Sprint 5.2 · Documento técnico de referência

A **Estação Virtual** representa uma estação meteorológica associada às
coordenadas da fazenda que busca automaticamente dados climáticos de fontes
externas confiáveis (inicialmente Open-Meteo). Para o Motor do Balanço
Hídrico, ela é indistinguível de uma estação física — a origem dos dados
fica isolada nas camadas de ingestão e seleção.

---

## 1. Conceito

Cada fazenda pode ter:

- somente estação física (padrão histórico);
- somente estação virtual (fazendas sem hardware);
- ambas simultaneamente (recomendado).

Quando ambas coexistem, o serviço de seleção diária (`weather_daily_selection`)
escolhe automaticamente a de menor `source_priority`. A estação virtual é
criada com prioridade 5 por convenção — abaixo das estações físicas
tipicamente cadastradas com prioridade 1-3. Nada impede o operador de
inverter as prioridades manualmente se desejar.

## 2. Modelo de dados

A Estação Virtual **reutiliza integralmente** o schema criado na Sprint 5.1.
Nenhuma migration nova foi necessária.

```
weather_stations (1 linha por estação virtual da fazenda)
├── station_type    = 'virtual'
├── data_source     = 'open_meteo'   (extensível via provider-registry)
├── provider        = 'open_meteo'
├── latitude        = fazenda.latitude
├── longitude       = fazenda.longitude
├── altitude        = fazenda.altitude (0 se ausente)
├── timezone        = fazenda.timezone (ou 'America/Sao_Paulo')
├── source_priority = 5 (default; ajustável)
├── active          = true
├── sync_status     = idle|ok|degraded|failed
├── last_sync_at    = timestamptz
└── sync_error      = texto do último erro (quando failed)
```

## 3. Fluxo de dados

```
Fazenda cadastrada com lat/lon
        │
        ▼
ensureVirtualStation(supabase, farmId)   ← service idempotente
        │
        ▼
weather_stations (virtual, data_source='open_meteo')
        │
        ▼ (acionamento: manual, cron ou botão)
POST /api/climate/sync-farm
        │
        ▼
ingestFarmClimate(supabase, farmId)      ← provider-registry despacha
        │
        ▼
Open-Meteo API                            ← fetch com timeout + retry
        │
        ▼
Provider open-meteo.ts                    ← normaliza (vento 10m→2m etc.)
        │
        ▼
Serviço de ingestão
  • valida cada leitura (validateWeatherReading)
  • calcula ET₀ (Penman-Monteith FAO-56, calculateET0)
  • calcula chuva efetiva (calculateEffectivePrecipitation)
  • respeita is_locked (não sobrescreve manual travado)
  • grava data_kind='observed', origin='open_meteo'
        │
        ▼
weather_readings (dado observado)
weather_forecasts (previsão em tabela separada)
climate_ingestion_runs (log da execução)
        │
        ▼
resolveDailyClimateSource(farmId, date)  ← escolhe fonte por prioridade
        │
        ▼
weather_daily_selection (auditável)
        │
        ▼
Motor do Balanço Hídrico
  • use-farm-hydric-state.ts
  • balanco-hidrico/page.tsx
  → não conhece a origem; consome a leitura apontada pela selection
```

## 4. Prioridade e fallback

O ranking do resolver (`source-resolver.ts`) segue esta ordem:

1. `source_priority` (menor vence — 1=máxima)
2. `data_quality` (`ok` > `degraded` > `missing`)
3. `data_kind` (`observed` > `historical_grid` > `manual`)
4. `imported_at` (mais recente vence em empate final)

O registro em `weather_daily_selection` inclui `priority_used`,
`quality_used`, `reason` (motivo humano-legível), `rejected_sources`
(quais estações foram descartadas e por quê) e `fallback_used`
(marca `true` quando a estação prioritária não tinha dado para o dia).

## 5. Fontes suportadas

| Chave | Categoria | Status | Sprint |
|---|---|---|---|
| `open_meteo` | observed | Implementado | 5.1 / 5.2 |
| `manual` | manual | Implementado | pré-5.1 |
| `br_dwgd` | historical_grid | Reservado no schema (não implementado) | 5.3 |
| `api_inmet` | observed | Reservado no schema | futuro |
| `api_nasa_power` | observed | Reservado no schema | futuro |
| `davis_link` | observed | Reservado no schema | futuro |
| `campo_station` | observed | Reservado no schema | futuro |

Adicionar uma nova fonte no futuro requer apenas:

1. Novo arquivo em `modules/weather/providers/<nome>.ts` com `fetch...` +
   normalização.
2. Nova função `ingest<Nome>Observations` em `ingestion.service.ts`.
3. Registrar no `provider-registry.ts` via `registerProvider({...})`.

Nenhuma migration, nenhuma alteração em `ingestFarmClimate`, no resolver
ou no Motor.

## 6. API pública

### `POST /api/climate/sync-farm` *(sessão de usuário)*

Cria (opcional) e sincroniza a estação virtual + demais estações
automáticas da fazenda. RLS garante isolamento por tenant.

```json
{
  "farmId": "uuid-da-fazenda",
  "ensureVirtual": true,          // opcional; cria virtual se não existir
  "pastDays": 7,                  // opcional; 1..92 (default 7)
  "forecastDays": 7               // opcional; 1..16 (default 7)
}
```

Resposta:

```json
{
  "farmId": "...",
  "virtualStationCreated": true,
  "runs": [{ "provider": "open_meteo", "status": "success", "rowsInserted": 7, "rowsUpdated": 0, ... }],
  "selections": 7,
  "window": { "pastDays": 7, "forecastDays": 7 }
}
```

### `POST /api/climate/ingest` *(cron / service role)*

Endpoint existente da Sprint 5.1, protegido por `x-cron-secret`. Continua
funcionando sem mudanças — despacha para todos os provedores registrados.

## 7. UI

**Tela Clima → aba "Estação Virtual"** mostra:

- Nome, fonte, prioridade, fuso horário
- Latitude, longitude, altitude
- Status de sincronização (badge colorido)
- Última sincronização (timestamp)
- Botão "Sincronizar agora" (chama `/api/climate/sync-farm`)
- Última leitura observada: ET₀ Cotrim, ET₀ fonte, chuva, chuva efetiva,
  temperaturas (mín/méd/máx), umidade, vento, radiação, qualidade, origem
- Última execução: inseridas/atualizadas/ignoradas, duração, erro (se houver)

**Tela Fazendas → nova fazenda** oferece checkbox
"Ativar Estação Virtual (Open-Meteo)" marcado por padrão. Ao salvar,
chama `ensureVirtualStation` client-side com a sessão do usuário.

## 8. Validações aplicadas

Todas mantidas do `validateWeatherReading` da Sprint 5.1:

- ET₀ negativa → rejeitada (level=error)
- Chuva negativa → rejeitada
- Tmin > Tmax → rejeitada
- Umidade fora de 0..100 → rejeitada
- Vento negativo → rejeitado
- Duplicidade → protegida por `UNIQUE(station_id, date)` no banco;
  ingestão detecta linha existente e faz UPDATE (não gera duplicata)

Além disso: se faltarem inputs para calcular ET₀ (radiação ou umidade nulas),
`et0_calculated` fica NULL e `data_quality='degraded'` — sem estimativa
silenciosa.

## 9. Motor do Balanço

O Motor continua exatamente como implementado na Fase 3. Nada nele foi
alterado nesta sprint. A leitura de `weather_readings` já usa
`weather_daily_selection` como fonte de verdade (Sprint 5.1). Fallback ao
comportamento antigo se a seleção não existir para uma data (compatibilidade).

## 10. Como testar em produção (fluxo completo)

**Pré-requisito:** migrations 00017/00018/00019 já aplicadas + env vars
`SUPABASE_SERVICE_ROLE_KEY` e `CLIMATE_CRON_SECRET` cadastradas.

1. Fazer login na aplicação.
2. Ir em **Fazendas** → **Nova fazenda**. Preencher lat/lon reais (ex.:
   coordenadas de uma fazenda existente). Manter marcado o checkbox
   "Ativar Estação Virtual". Salvar.
3. Ir em **Clima** → aba **Estação Virtual**. Deve aparecer a estação
   recém-criada com status "Não sincronizada".
4. Clicar em **Sincronizar agora**. Aguardar 5-10s.
5. Verificar:
   - Status vira "ok" com timestamp.
   - Última leitura preenchida com valores plausíveis.
   - Aba **Fonte Diária** mostra a estação virtual escolhida para cada
     um dos últimos 7 dias.
   - Aba **Sincronizações** mostra o run com `rows_inserted > 0`.
   - Aba **Previsão** mostra 7 dias de forecast.
6. Ir em **Balanço Hídrico** → escolher um pivô cuja fazenda tenha a
   estação virtual → o balanço agora usa os dados climáticos ingeridos
   (o campo ET₀ da série diária vem preenchido).

## 11. O que não mudou

- Motor do balanço hídrico
- Fórmula de ET₀ (Penman-Monteith FAO-56)
- Schema do banco (nenhuma migration nova)
- Tabelas de pivôs, solos, culturas, programação, energia, rateio
- Provider registry (aditivo, sem breaking change)
