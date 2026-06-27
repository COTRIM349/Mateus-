# Documentacao Tecnica - Cotrim Irrigacao Pro v1.0

## 1. Arquitetura

### Visao Geral

A plataforma segue uma arquitetura **Feature-Based** com separacao clara entre camadas:

- **App Layer**: Next.js 14 App Router com route groups `(auth)` e `(app)`
- **Module Layer**: Logica de negocio isolada em `modules/<feature>/services/`
- **Component Layer**: UI reutilizavel em `components/ui/` e `components/layout/`
- **Data Layer**: Supabase (PostgreSQL) com RLS multi-tenant

### Padroes Arquiteturais

| Padrao | Implementacao |
|--------|--------------|
| Multi-tenant | RLS via `auth_company_id()` e `auth_farm_ids()` |
| Feature modules | `modules/<feature>/services/<feature>.service.ts` |
| Barrel exports | `index.ts` em cada modulo |
| Type safety | TypeScript strict mode, sem `any` |
| Server/Client | SSR para auth, CSR para paginas interativas |
| Dark mode | `darkMode: "class"` com ThemeProvider |

### Fluxo de Autenticacao

```
Login -> Supabase Auth -> auth/callback -> Middleware -> (app) layout
                                                |
                                    AuthProvider (useAuth)
                                         |
                                    activeFarmId -> RLS
```

## 2. Banco de Dados

### Diagrama de Entidades (38 tabelas)

#### Grupo Core (Migration 00001)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `companies` | Empresas (raiz multi-tenant) | - |
| `users` | Perfis de usuario | companies |
| `farms` | Fazendas | companies |
| `user_farm_access` | Acesso usuario-fazenda | users, farms |
| `seasons` | Safras agricolas | farms |
| `production_modules` | Modulos de producao | farms |
| `cultures` | Culturas cadastradas | companies |
| `soils` | Perfis de solo | farms |
| `pivots` | Pivos de irrigacao | farms |
| `pivot_crop_assignments` | Atribuicao cultura-pivo | pivots, cultures, seasons |
| `weather_stations` | Estacoes meteorologicas | farms |
| `weather_readings` | Leituras climaticas | weather_stations |
| `water_balances` | Registros de balanco hidrico | pivots |
| `irrigation_schedules` | Programacoes de irrigacao | farms |
| `irrigation_events` | Eventos de irrigacao | pivots |
| `sensors` | Sensores IoT | farms |
| `sensor_readings` | Leituras de sensores | sensors |
| `reservoirs` | Reservatorios de agua | farms |
| `energy_tariffs` (v1) | Tarifas de energia | farms |
| `cost_centers` | Centros de custo | farms |
| `cost_entries` | Lancamentos de custo | cost_centers |
| `alerts` | Alertas do sistema | farms |

#### Grupo Solo (Migration 00006)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `soil_layers` | Camadas do perfil de solo | soils |
| `soil_history` | Historico de analises | soils |

#### Grupo Cultura (Migration 00007)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `culture_varieties` | Variedades/cultivares | cultures |
| `culture_phases` | Fases fenologicas | cultures |
| `culture_history` | Historico de plantio | cultures |

#### Grupo Recomendacao (Migration 00009)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `irrigation_recommendations` | Recomendacoes geradas | pivots |

#### Grupo Programacao (Migration 00010)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `pump_houses` | Casas de bomba | farms |
| `pump_house_pivots` | Vinculo casa-pivo | pump_houses, pivots |
| `daily_schedules` | Programacoes diarias | farms |
| `schedule_slots` | Slots de irrigacao | daily_schedules |

#### Grupo Energia (Migration 00011)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `energy_tariffs` (v2) | Tarifas detalhadas | farms |
| `energy_consumption` | Consumo energetico | farms, pivots |
| `energy_demand` | Analise de demanda | farms |
| `energy_apportionment` | Rateio de custos | farms |

#### Grupo Relatorios (Migration 00012)
| Tabela | Descricao | FK Principal |
|--------|-----------|-------------|
| `audit_log` | Log de auditoria | farms |
| `report_history` | Historico de relatorios | farms |

### Row Level Security (RLS)

Todas as tabelas com dados de negocio possuem RLS ativado:

```sql
-- Padrao de policy para SELECT
CREATE POLICY tabela_select ON tabela
  FOR SELECT USING (farm_id IN (SELECT unnest(auth_farm_ids())));

-- Funcoes auxiliares
auth_company_id() -> UUID (empresa do usuario logado)
auth_farm_ids()   -> UUID[] (fazendas com acesso)
```

## 3. Modulos e Servicos

### 3.1 Weather Service (`modules/weather/services/`)

**Funcoes exportadas:**
| Funcao | Entrada | Saida |
|--------|---------|-------|
| `calculateEffectivePrecipitation(precip)` | mm | mm (USDA SCS) |
| `averageTemperature(readings)` | WeatherReadingRow[] | numero |
| `totalPrecipitation(readings)` | WeatherReadingRow[] | mm |
| `averageET0(readings)` | WeatherReadingRow[] | mm/dia |
| `totalET0(readings)` | WeatherReadingRow[] | mm |
| `periodSummary(readings)` | WeatherReadingRow[] | PeriodSummary |
| `validateWeatherReading(reading)` | parcial | WeatherValidation[] |
| `selectPriorityStation(stations)` | StationWithPriority[] | station ou null |
| `prepareForWaterBalance(reading)` | WeatherReadingRow | objeto |

**Formula - Precipitacao Efetiva (USDA SCS):**
```
Se P <= 250mm: Pe = P * (125 - 0.2 * P) / 125
Se P > 250mm: Pe = 125 + 0.1 * P
```

### 3.2 Soil Service (`modules/soil/services/`)

Parametros de textura do solo para calculo de CAD:
- Arenoso, Franco-arenoso, Franco, Franco-argiloso, Argiloso, Muito argiloso
- Capacidade de campo (CC) e Ponto de murcha permanente (PMP) por textura

### 3.3 Culture Service (`modules/culture/services/`)

Coeficientes Kc por cultura e fase (FAO-56):
- Soja: 0.4 (germinacao) -> 1.15 (floracao) -> 0.3 (colheita)
- Milho: 0.3 -> 1.2 -> 0.35
- Algodao: 0.35 -> 1.2 -> 0.4

### 3.4 Water Balance Service (`modules/water-balance/services/`)

**Funcoes exportadas:**
| Funcao | Descricao |
|--------|-----------|
| `calculateETc(et0, kc)` | ETc = ET0 x Kc (FAO-56 eq. 58) |
| `calculateDynamicCAD(CC, PMP, z, zEff)` | CAD = (CC - PMP) x Z x 1000 (eq. 82) |
| `calculateDynamicAFD(cad, p)` | AFD = CAD x p (eq. 83) |
| `adjustDepletionFactor(p, etc)` | p_adj = p + 0.04 x (5 - ETc) (eq. 84) |
| `calculateNetDepth(cad, arm)` | Lamina liquida = CAD - ARM |
| `calculateGrossDepth(net, eff)` | Lamina bruta = Liquida / Eficiencia |
| `calculateVolume(gross, area)` | Volume = Lamina x Area x 10 |
| `calculateIrrigationTime(vol, flow)` | Tempo = Volume / Vazao |
| `determineWaterStatus(arm, cad, afd)` | 5 niveis de status hidrico |
| `calculateDailyBalance(input)` | Balanco completo de 1 dia |
| `simulateBalance(days, ...)` | Simulacao multi-dia |
| `calculateSummary(rows)` | Resumo estatistico |
| `validateBalanceInput(input)` | Validacao de parametros |

**Equacao do Balanco Hidrico:**
```
ARM(t) = ARM(t-1) + Pe + Irrigacao - ETc
Se ARM > CAD: Excedente = ARM - CAD; ARM = CAD
Se ARM < 0: ARM = 0
```

**Classificacao de Status Hidrico:**
| Status | Condicao |
|--------|----------|
| Saturado | ARM >= CAD |
| Ideal | ARM >= (CAD - AFD) |
| Atencao | ARM/CAD >= 0.30 |
| Deficit | ARM/CAD >= 0.10 |
| Deficit Critico | ARM/CAD < 0.10 |

### 3.5 Recommendation Service (`modules/recommendation/services/`)

**Algoritmo de Prioridade Ponderada:**
```
Score = DeficitSeverity x 0.40
      + PhaseSensitivity x 0.20
      + ProductiveRisk x 0.20
      + TimeUrgency x 0.20
```

**Sensibilidade por Fase:**
| Fase | Fator |
|------|-------|
| Floracao | 1.0 |
| Enchimento | 0.9 |
| Germinacao | 0.7 |
| Vegetativo | 0.5 |
| Maturacao | 0.3 |
| Colheita | 0.1 |

**Classificacao de Prioridade:**
| Score | Prioridade |
|-------|-----------|
| >= 80 | Critica |
| >= 60 | Alta |
| >= 40 | Media |
| >= 20 | Baixa |
| < 20 | Sem Necessidade |

### 3.6 Scheduling Service (`modules/scheduling/services/`)

**Processo de sequenciamento:**
1. Ordena recomendacoes por score (maior primeiro)
2. Para cada recomendacao com `shouldIrrigate = true`:
   - Verifica status da casa de bomba
   - Verifica disponibilidade de agua (reservatorio)
   - Verifica demanda contratada
   - Encontra janela horaria disponivel (15min slots)
   - Verifica conflitos hidraulicos (linha, simultaneidade)
   - Se recursos insuficientes: tenta irrigacao deficitaria (50%)
   - Se demanda excedida: desloca para fora de ponta
3. Calcula energia e custo por slot
4. Marca grupos simultaneos
5. Calcula totais e utilizacao

### 3.7 Energy Service (`modules/energy/services/`)

**Calculo de consumo:**
```
PotenciaKW = PotenciaCV x 0.7355 / Eficiencia
ConsumoKWh = PotenciaKW x HorasOperacao
PontaKWh = ConsumoKWh x RatioPonta (minuto a minuto)
CustoPonta = PontaKWh x TarifaPonta
CustoForaPonta = ForaPontaKWh x TarifaForaPonta
```

**Metodos de Rateio:**
| Metodo | Chave de rateio |
|--------|----------------|
| Volume | Proporcional ao m3 consumido |
| Area | Proporcional a area (ha) |
| Horas | Proporcional as horas de operacao |
| Igual | Dividido igualmente |
| Personalizado | Percentuais manuais |

**Niveis de Risco de Demanda:**
| Nivel | Condicao (margem) |
|-------|-------------------|
| Critico | Excede contratada |
| Alto | Margem < 5% |
| Moderado | Margem < 15% |
| Baixo | Margem < 30% |
| Confortavel | Margem >= 30% |

### 3.8 Reports Service (`modules/reports/services/`)

**Funcoes de geracao:**
- `calculateReportKPIs()`: 11 indicadores
- `generateDailyReport()`: Relatorio diario completo
- `generateComparative()`: Analise comparativa multi-dimensional
- `calculatePeriodSummary()`: Resumo de periodo

**Funcoes de exportacao:**
- `exportToCSV()`: Gera string CSV com separador `;`
- `prepareSheetData()`: Prepara dados para Excel
- `buildDailyReportSections()`: Estrutura para PDF

## 4. Integracao entre Modulos

```
Weather ---> et0, precipitacao
Soil ------> CC, PMP, profundidade
Culture ---> Kc, fase, fator de deplecao
                |
                v
        Water Balance (FAO-56)
         ARM, CAD, AFD, deficit,
         status hidrico, lamina
                |
                v
        Recommendation Engine
         score, prioridade,
         status operacional,
         lamina, volume, tempo
                |
                v
        Scheduling Engine
         sequenciamento, slots,
         energia, custo, conflitos
                |
                v
        Energy Engine
         consumo ponta/fora,
         rateio, demanda, simulacoes
                |
                v
        Dashboard + Reports
         KPIs, graficos, historico,
         comparativos, auditoria
```

## 5. Componentes UI

| Componente | Props Principais | Uso |
|-----------|-----------------|-----|
| `StatCard` | `metric: {id, title, value, description, variation, trend}` | KPIs |
| `Table<T>` | `columns: Column<T>[], data: T[], getKey: (T) => string` | Tabelas de dados |
| `Tabs` | `tabs: {id, label}[], activeTab, onChange` | Navegacao em abas |
| `Card` | `className, children` | Container com borda |
| `ChartCard` | `title, subtitle, children` | Wrapper para graficos |
| `Modal` | `isOpen, onClose, title, children` | Dialogo modal |
| `Button` | `variant, size, onClick, children` | Botoes de acao |
| `Input` | `label, value, onChange, error` | Campo de texto |
| `Select` | `label, value, options, onChange` | Seletor dropdown |
| `TextArea` | `label, value, onChange` | Area de texto |
| `StatusBadge` | `status, config` | Badge colorido |
| `PriorityBadge` | `priority, config` | Badge de prioridade |
| `EmptyState` | `title, description` | Estado vazio |
| `ConfirmDialog` | `isOpen, onConfirm, onCancel, message` | Confirmacao |

## 6. Constantes do Sistema

### Agronomicas (`constants/agronomic.ts`)
- `CV_TO_KW = 0.7355`
- `PSYCHROMETRIC_CONSTANT_SEA_LEVEL = 0.0665`
- `STEFAN_BOLTZMANN = 4.903e-9`
- `LATENT_HEAT = 2.45`
- `REFERENCE_ALBEDO = 0.23`
- `DEFAULT_KC`: Kc por cultura e fase
- `DEFAULT_ROOT_DEPTH`: Profundidade de raiz por cultura
- `DEFAULT_DEPLETION_FACTOR`: Fator p por cultura

### Brasil (`constants/brazil.ts`)
- 27 estados brasileiros
- 6 texturas de solo
- 4 status de pivo
- 6 estagios de cultura
- 3 tipos de estacao
- 6 fontes de dados
- 3 status de estacao
- 7 grupos de cultura
- 3 status de cultura
- 3 tipos de maturidade
- 5 status hidricos
- 5 prioridades de recomendacao
- 5 status operacionais
- 3 tipos de tarifa
- 5 metodos de rateio
- 5 niveis de risco de demanda
