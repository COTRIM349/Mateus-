# Changelog - Cotrim Irrigacao Pro

Todas as alteracoes notaveis do projeto estao documentadas neste arquivo.

## [1.0.0] - 2026-06-27

### Sprint 11 - Relatorios Inteligentes
**Commit:** `1433ad9`

**Arquivos criados:**
- `supabase/migrations/00012_reports_audit.sql`
- `modules/reports/services/reports.service.ts`
- `modules/reports/services/index.ts`

**Arquivos modificados:**
- `app/(app)/relatorios/page.tsx` (reescrita completa)

**Funcionalidades:**
- 8 tipos de relatorio: diario, semanal, mensal, por pivo, por cultura, energetico, financeiro, executivo
- 3 formatos de exportacao: PDF, Excel (.xlsx), CSV
- 6 dimensoes de historico: irrigacoes, recomendacoes, agua, energia, custos, clima
- 7 dimensoes de comparativo: periodos, safras, culturas, pivos, casas de bomba, modulos, fazendas
- 11 KPIs com radar de desempenho
- Auditoria completa: quem, o que, quando alterou + timeline
- Tabelas `audit_log` e `report_history` com RLS

---

### Sprint 10 - Centro de Controle Operacional (Dashboard Executivo)
**Commit:** `4b82248`

**Arquivos modificados:**
- `app/(app)/page.tsx` (reescrita completa)

**Funcionalidades:**
- Dashboard com 8 KPIs e 7 Smart Cards inteligentes
- Mapa operacional com 6 cores de status de pivo
- Centro de operacoes: fila, andamento, concluidos, alertas, top 5 IA
- Indicadores: consumo diario/semanal/mensal, hidricos, eficiencia, ranking
- 8 graficos Recharts: ARM, deficit, agua vs ETc vs chuva, energia, eficiencia
- Consome todos os motores existentes sem modificacoes

---

### Sprint 9 - Motor de Energia e Rateio Inteligente
**Commit:** `169c318`

**Arquivos criados:**
- `supabase/migrations/00011_energy_rateio_engine.sql`

**Arquivos modificados:**
- `modules/energy/services/energy.service.ts` (reescrita completa)
- `app/(app)/energia/page.tsx` (reescrita completa)
- `app/(app)/rateio/page.tsx` (reescrita completa)
- `constants/brazil.ts` (3 constantes adicionadas)

**Funcionalidades:**
- 3 modalidades tarifarias (Verde, Azul, Convencional)
- Consumo ponta/fora ponta com calculo minuto a minuto
- Agregacao em 8 dimensoes (pivo, casa de bomba, cultura, modulo, safra, data, semana, mes)
- Analise de demanda com 5 niveis de risco e estimativa de multa
- 5 metodos de rateio (volume, area, horas, igual, personalizado)
- 6 simulacoes de cenarios energeticos
- 5 sugestoes inteligentes de otimizacao
- Tabelas: energy_tariffs, energy_consumption, energy_demand, energy_apportionment
- Centro de Energia com 5 abas e Rateio de Custos com 4 abas

---

### Sprint 8 - Motor de Programacao Operacional Inteligente
**Commit:** `64d9371`

**Arquivos criados:**
- `supabase/migrations/00010_scheduling_engine.sql`
- `modules/scheduling/services/scheduling.service.ts`
- `modules/scheduling/services/index.ts`

**Arquivos modificados:**
- `app/(app)/programacao/page.tsx` (reescrita completa)

**Funcionalidades:**
- Sequenciamento automatico por score de prioridade
- Restricoes hidraulicas (linhas, simultaneidade por casa de bomba)
- Controle de demanda contratada com deslocamento fora de ponta
- Irrigacao deficitaria automatica (50%) quando recursos limitados
- Gestao de reservatorios com nivel minimo operacional
- Calculo de energia e custo por slot (ponta/fora ponta)
- Deteccao de grupos simultaneos
- Validacao completa de programacao
- Tabelas: pump_houses, pump_house_pivots, daily_schedules, schedule_slots

---

### Sprint 7 - Motor de Recomendacao de Irrigacao
**Commit:** `9af7e9a`

**Arquivos criados:**
- `supabase/migrations/00009_recommendation_engine.sql`
- `modules/recommendation/services/recommendation.service.ts`
- `modules/recommendation/services/index.ts`

**Arquivos modificados:**
- `app/(app)/balanco-hidrico/page.tsx` (aba recomendacoes adicionada)

**Funcionalidades:**
- Algoritmo de prioridade ponderada: deficit (40%), fase (20%), risco (20%), urgencia (20%)
- 5 niveis de prioridade e 5 status operacionais
- Calculo de risco produtivo por fase fenologica
- Horario recomendado com restricao de ponta
- Simulacao de 6 cenarios por pivo
- Ranking automatico por score
- Tabela: irrigation_recommendations

---

### Sprint 6 - Motor de Balanco Hidrico FAO-56
**Commit:** `f30948e`

**Arquivos criados:**
- `supabase/migrations/00008_water_balance_engine.sql`
- `modules/water-balance/services/water-balance.service.ts`
- `modules/water-balance/services/index.ts`

**Arquivos modificados:**
- `app/(app)/balanco-hidrico/page.tsx` (reescrita completa)

**Funcionalidades:**
- ETc = ET0 x Kc (FAO-56 eq. 58)
- CAD dinamico com profundidade de raiz (eq. 82)
- AFD dinamico (eq. 83)
- Fator de deplecao ajustado (eq. 84)
- Balanco diario: ARM(t) = ARM(t-1) + Pe + Irrigacao - ETc
- 5 niveis de status hidrico
- Lamina liquida/bruta, volume, tempo de irrigacao
- Simulacao multi-dia
- Resumo estatistico e validacao

---

### Sprint 5 - Motor de Cultura
**Commit:** `15108df`

**Arquivos criados:**
- `supabase/migrations/00007_culture_engine.sql`
- `modules/culture/services/culture.service.ts`
- `modules/culture/services/index.ts`

**Arquivos modificados:**
- `app/(app)/culturas/page.tsx` (abas variedades, fases, historico)
- `constants/agronomic.ts` (Kc, raiz, deplecao por cultura)

**Funcionalidades:**
- Coeficientes Kc por cultura e fase fenologica (FAO-56)
- Variedades/cultivares com ciclo e tipo de maturidade
- Fases fenologicas com duracao e parametros
- Historico de plantio
- Tabelas: culture_varieties, culture_phases, culture_history

---

### Sprint 4 - Motor de Dados de Solo
**Commit:** `20a601b`

**Arquivos criados:**
- `supabase/migrations/00006_soil_engine.sql`
- `modules/soil/services/soil.service.ts`
- `modules/soil/services/index.ts`

**Arquivos modificados:**
- `app/(app)/solos/page.tsx` (abas camadas, historico)
- `constants/brazil.ts` (texturas de solo)

**Funcionalidades:**
- Perfil de solo com camadas
- Parametros por textura (CC, PMP)
- Historico de analises laboratoriais
- Tabelas: soil_layers, soil_history

---

### Sprint 3 - Motor de Dados Climaticos
**Commit:** `a392641`

**Arquivos criados:**
- `supabase/migrations/00005_weather_station_fields.sql`
- `modules/weather/services/weather.service.ts`
- `modules/weather/services/index.ts`

**Arquivos modificados:**
- `app/(app)/clima/page.tsx` (reescrita completa)

**Funcionalidades:**
- Leituras meteorologicas diarias (8 variaveis)
- Precipitacao efetiva (USDA SCS)
- Validacao de dados atipicos
- Selecao de estacao prioritaria
- Resumo de periodo

---

### Sprint 2 - Cadastro Mestre
**Commit:** `c9e97b0`

**Funcionalidades:**
- CRUD completo para 7 entidades
- Fazendas com safras e modulos
- Pivos com atribuicao de cultura
- Culturas com cadastro base
- Solos com perfil
- Estacoes meteorologicas
- Reservatorios
- Interface em abas com hook useCrud

---

### Sprint 1 - Fundacao da Plataforma
**Commit:** `41b2688`

**Funcionalidades:**
- Setup Next.js 14 com TypeScript strict
- Supabase com @supabase/ssr
- Autenticacao (login, logout, recuperar senha)
- Layout com Sidebar e Topbar
- Theme provider (claro/escuro)
- 13 componentes UI
- 22 tabelas PostgreSQL (migration 00001-00004)
- RLS multi-tenant
- Middleware de protecao de rotas

---

### Pre-Sprint - Arquitetura
**Commits:** `a46c753`, `19413ec`, `62bd697`

- Scaffold inicial do projeto
- Reestruturacao para arquitetura modular (Feature-Based)
- Documento de regras de negocio (ETAPA 3)
