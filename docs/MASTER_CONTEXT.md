# Contexto Geral — Cotrim Irrigação Pro

## O que é

Cotrim Irrigação Pro é um software comercial para gestão completa de irrigação agrícola. O foco principal é a operação com **pivôs centrais**, mas a arquitetura é extensível para outros métodos (gotejamento, aspersão convencional, sulcos).

## Público-alvo

- Gestores agrícolas de fazendas irrigadas.
- Técnicos de irrigação e agrônomos.
- Empresas de consultoria agronômica.
- Grupos empresariais com múltiplas fazendas e safras simultâneas.

## Domínio de negócio

### Entidades principais

| Entidade | Descrição |
|---|---|
| **Empresa** | Organização dona de uma ou mais fazendas. Multi-tenant. |
| **Fazenda** | Unidade produtiva com localização geográfica, módulos e infraestrutura. |
| **Módulo produtivo** | Divisão lógica da fazenda (ex.: RDM, M1, M2/M3). |
| **Safra** | Período produtivo (ex.: Safra 2025/2026). |
| **Pivô central** | Equipamento de irrigação circular. Possui cultura associada, solo, área e parâmetros operacionais. |
| **Cultura** | Soja, Milho, Algodão, Cacau e futuramente outras. Cada cultura tem coeficientes agronômicos (Kc, profundidade de raiz, fator de depleção). |
| **Solo** | Tipo de solo com parâmetros hídricos (capacidade de campo, ponto de murcha, infiltração). |
| **Sensor** | Dispositivos IoT (umidade do solo, temperatura, nível de reservatório, pluviômetro, estação meteorológica). |
| **Reservatório** | Fonte hídrica (represa, poço, rio). Possui capacidade, nível atual e recarga. |
| **Balanço hídrico** | Registro diário de ETc, precipitação, irrigação e déficit acumulado por pivô. |
| **Tarifação** | Estrutura tarifária de energia (verde, azul, convencional) com horários de ponta. |
| **Centro de custo** | Agrupamento para rateio de custos operacionais. |
| **Alerta** | Notificação gerada automaticamente com base em regras de negócio (déficit alto, sensor offline, nível baixo de reservatório). |

### Fluxo operacional diário

1. Dados climáticos são coletados (estação meteorológica ou manual).
2. O sistema calcula a **ET0** (Penman-Monteith FAO-56).
3. Para cada pivô, calcula a **ETc** usando o Kc do estágio da cultura.
4. Atualiza o **balanço hídrico** (ETc - precipitação efetiva - irrigação aplicada).
5. Calcula o **déficit acumulado**, a **lâmina recomendada** e o **volume**.
6. Estima **tempo de irrigação**, **energia** e **custo**.
7. Classifica a **prioridade** e o **risco produtivo**.
8. A **Cotrim AI** gera recomendação automatizada.
9. O operador programa os pivôs no módulo de **Programação**.
10. O sistema registra a execução e atualiza o balanço.

### Escala prevista

| Dimensão | Escala alvo |
|---|---|
| Empresas | Centenas |
| Fazendas | Milhares |
| Pivôs | Dezenas de milhares |
| Sensores | Centenas de milhares |
| Leituras de sensor/dia | Milhões |
| Safras simultâneas | Múltiplas por fazenda |
| Usuários | Milhares |

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14+, TypeScript, Tailwind CSS, App Router |
| Gráficos | Recharts |
| Estado (futuro) | React Context / Zustand |
| Backend (futuro) | Next.js API Routes → migração para serviço dedicado |
| Banco de dados (futuro) | PostgreSQL + TimescaleDB (séries temporais de sensores) |
| Autenticação (futuro) | NextAuth.js / Clerk |
| IoT (futuro) | MQTT / WebSocket para ingestão de dados de sensores |
| IA (futuro) | Modelos proprietários de recomendação |
| Infra (futuro) | Vercel / AWS |

## Princípios de engenharia

1. **Módulos independentes** — cada domínio é um módulo isolado.
2. **Services puros** — toda regra de negócio em funções testáveis sem React.
3. **Páginas thin** — sem lógica, apenas composição visual.
4. **Design System único** — tokens centralizados, componentes padronizados.
5. **TypeScript estrito** — `strict: true`, sem `any`.
6. **Escalabilidade primeiro** — arquitetura multi-tenant, multi-farm, multi-season desde o início.
