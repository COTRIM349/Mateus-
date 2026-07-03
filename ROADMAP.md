# Roadmap - Cotrim Irrigacao Pro

## Metodologia por Fases — Status Atual

Desenvolvimento incremental, uma fase por vez, validando completamente antes de avancar.
Esta versao trabalha **exclusivamente com dados reais** (Supabase); sem dados ficticios.

### ✅ Fase 1 — Fundacao de Dados (concluida)
- Fluxo guiado de implantacao (Fazenda → Solo → Cultura → Safra → Pivo)
- Validacao de pre-requisitos por tela (empty states orientados)

### ✅ Fase 2 — Vinculacao Operacional (concluida)
- Vinculo pivo × safra × cultura × cultivar × solo (`pivot_crop_assignments`)
- Datas de plantio/emergencia; parametros de manejo (padrao ou personalizado)

### ✅ Fase 3 — Motor do Balanco Hidrico (concluida e validada)
- DAE, fase fenologica, Kc diario, crescimento radicular automatico
- ADT = (CC−PMP)×Z×1000 (FAO-56 eq.82, base volumetrica); AFD = ADT×p
- ETc = ETo×Kc; saldo diario; deficit; deplecao
- Status hidrico: verde (<70% AFD) · amarelo (70–<100%) · vermelho (≥100%) · cinza (sem dados)
- Recomendacao: irrigar hoje, lamina liquida/bruta, volume, tempo, justificativa
- Persistencia diaria em `water_balances`
- Fonte unica de calculo: Dashboard Operacional, Mapa Hidrico e Tela de Balanco
- **Auditoria tecnica aprovada** (bloqueantes corrigidos: densidade na ADT; clima ausente → cinza)

### ⏳ Fase 4 — Modelo Operacional (escopo definido — nao implementada nesta versao)
- Conceito de safra ativa por fazenda
- Area plantada por vinculo (pode diferir da area total do pivo; alimenta o volume no motor)
- Tela consolidada do modelo operacional da safra ativa, com indicador de "modelo completo"

### ⏳ Fase 5 — Programacao da Irrigacao (planejada)
- Recomendacao diaria
- Lamina
- Tempo de irrigacao
- Volume
- Fila e prioridade dos pivos
- Agenda operacional

### ⏳ Fase 6 — Energia e Rateio (planejada)
- Consumo por pivo
- Consumo por cultura
- Consumo por fazenda
- Custo por mm
- Custo por hectare
- Custo por m³
- Rateio mensal e por safra

> **Encerramento desta versao:** a plataforma fecha na **Fase 3 validada**. Proximo passo antes de
> avancar para a Fase 4: **testar a plataforma com dados reais**.

---

## Versao 1.0 (Atual) - Funcionalidades Implementadas

### Infraestrutura
- [x] Next.js 14 App Router com TypeScript strict
- [x] Supabase (PostgreSQL) com RLS multi-tenant
- [x] Autenticacao com @supabase/ssr
- [x] Tailwind CSS com dark mode
- [x] Sistema de rotas com route groups (auth/app)
- [x] Middleware de protecao de rotas
- [x] 12 migrations SQL

### Cadastro Mestre (Sprint 2)
- [x] CRUD Fazendas com safras e modulos
- [x] CRUD Pivos com atribuicao de cultura
- [x] CRUD Culturas com variedades e fases
- [x] CRUD Solos com camadas e historico
- [x] CRUD Estacoes meteorologicas
- [x] Reservatorios
- [x] Sensores (placeholder)

### Motor Climatico (Sprint 3)
- [x] Leituras meteorologicas diarias
- [x] Calculo de precipitacao efetiva (USDA SCS)
- [x] Resumo de periodo
- [x] Validacao de dados atipicos
- [x] Selecao de estacao prioritaria

### Motor de Solo (Sprint 4)
- [x] Perfil de solo com camadas
- [x] Parametros por textura (CC, PMP)
- [x] Historico de analises

### Motor de Cultura (Sprint 5)
- [x] Coeficientes Kc por cultura e fase (FAO-56)
- [x] Fases fenologicas com duracao
- [x] Profundidade de raiz dinamica
- [x] Fator de deplecao por cultura

### Motor de Balanco Hidrico (Sprint 6)
- [x] ETc = ET0 x Kc (FAO-56 eq. 58)
- [x] CAD dinamico (eq. 82)
- [x] AFD dinamico (eq. 83)
- [x] Fator de deplecao ajustado (eq. 84)
- [x] Balanco diario: ARM(t) = ARM(t-1) + Pe + Irrigacao - ETc
- [x] 5 niveis de status hidrico
- [x] Lamina liquida, bruta, volume, tempo
- [x] Simulacao multi-dia
- [x] Resumo estatistico

### Motor de Recomendacao (Sprint 7)
- [x] Algoritmo de prioridade ponderada (4 fatores)
- [x] 5 niveis de prioridade
- [x] 5 status operacionais
- [x] Risco produtivo
- [x] Horario recomendado (evita ponta)
- [x] Simulacao de 6 cenarios
- [x] Ranking por score

### Motor de Programacao (Sprint 8)
- [x] Sequenciamento por prioridade
- [x] Restricoes hidraulicas (linhas, simultaneidade)
- [x] Controle de demanda contratada
- [x] Irrigacao deficitaria automatica
- [x] Gestao de reservatorios
- [x] Calculo de energia e custo por slot
- [x] Validacao de programacao

### Motor de Energia e Rateio (Sprint 9)
- [x] 3 modalidades tarifarias (Verde, Azul, Convencional)
- [x] Consumo ponta/fora ponta (minuto a minuto)
- [x] Agregacao em 8 dimensoes
- [x] Totais da fazenda com projecao mensal
- [x] Analise de demanda (5 niveis de risco)
- [x] 5 metodos de rateio
- [x] Simulacao de 6 cenarios
- [x] 5 sugestoes inteligentes
- [x] Perfil horario de custo
- [x] API legada para retrocompatibilidade

### Centro de Controle (Sprint 10)
- [x] Dashboard com 8 KPIs e 7 Smart Cards
- [x] Mapa operacional (6 cores de status)
- [x] Centro de operacoes (fila, andamento, alertas)
- [x] 11 indicadores de eficiencia
- [x] 8 graficos Recharts interativos
- [x] Ranking de pivos

### Relatorios Inteligentes (Sprint 11)
- [x] 8 tipos de relatorio com pre-visualizacao
- [x] 3 formatos de exportacao (PDF, XLSX, CSV)
- [x] 6 dimensoes de historico
- [x] 7 dimensoes de comparativo
- [x] 11 KPIs com radar de desempenho
- [x] Auditoria completa com timeline

## Versao 2.0 - Funcionalidades Planejadas

### Motor Hidraulico
- [ ] Modelagem de rede hidraulica completa
- [ ] Calculo de perda de carga
- [ ] Dimensionamento de tubulacoes
- [ ] Curvas de bombas
- [ ] Otimizacao de pontos de operacao

### Sensores e Telemetria
- [ ] Integracao com sensores de umidade do solo
- [ ] Telemetria de pivos (status em tempo real)
- [ ] Sensores de nivel de reservatorio
- [ ] Sensores de vazao
- [ ] Alertas automaticos por telemetria

### Integracoes Externas
- [ ] API INMET para dados climaticos automaticos
- [ ] NASA POWER para radiacao solar
- [ ] Davis WeatherLink
- [ ] Integracao com ERPs agricolas

### Exportacao Real
- [ ] Geracao de PDF com @react-pdf/renderer
- [ ] Export Excel real com biblioteca xlsx
- [ ] Envio automatico por email
- [ ] Armazenamento em storage (Supabase Storage)

### Cotrim AI Completo
- [ ] Chatbot com LLM integrado
- [ ] Analise preditiva de irrigacao
- [ ] Deteccao de anomalias
- [ ] Sugestoes proativas

### Mobile
- [ ] Aplicativo React Native
- [ ] Notificacoes push
- [ ] Modo offline
- [ ] Camera para registro de campo

## Versao 3.0 - Melhorias Futuras

### Machine Learning
- [ ] Previsao de demanda hidrica com ML
- [ ] Otimizacao de horario de irrigacao com RL
- [ ] Deteccao de falhas em equipamentos
- [ ] Previsao de produtividade

### Automacao
- [ ] Integracao com controladores de pivo
- [ ] Acionamento automatico de bombas
- [ ] Programacao autonoma baseada em IA
- [ ] Controle de valvulas remotas

### Plataforma
- [ ] API REST publica documentada
- [ ] Webhooks para integracoes
- [ ] Marketplace de modulos
- [ ] Multi-idioma (EN, ES)
- [ ] White-label para revendas

### Analytics Avancado
- [ ] Business Intelligence (BI) integrado
- [ ] Benchmarking entre fazendas
- [ ] Analise de ROI por investimento
- [ ] Simulacao de cenarios climaticos (mudancas climaticas)
