# Cotrim Irrigacao Pro

Sistema operacional completo para gestao inteligente de irrigacao agricola. Plataforma SaaS multi-tenant que integra dados climaticos, de solo, cultura, balanco hidrico, recomendacao de irrigacao, programacao operacional, energia e custos em uma central de controle unificada.

## Objetivos

- **Otimizar o uso da agua** por meio de calculos FAO-56 (Penman-Monteith) para balanco hidrico preciso
- **Reduzir custos energeticos** com gestao de demanda, rateio inteligente e simulacao de cenarios
- **Automatizar recomendacoes** de irrigacao usando algoritmo de prioridade ponderada
- **Centralizar operacoes** em um dashboard executivo com visao em tempo real
- **Gerar relatorios profissionais** para operacao, gestao e diretoria
- **Garantir rastreabilidade** com auditoria completa de todas as alteracoes

## Principais Funcionalidades

### Motor Agronomico
- Calculo de ET0 (Penman-Monteith FAO-56)
- Precipitacao efetiva (USDA SCS)
- Balanco hidrico diario com CAD, AFD e ARM dinamicos
- Coeficiente de cultura (Kc) por fase fenologica
- Fator de deplecao ajustado (FAO-56 eq. 84)

### Motor de Recomendacao
- Algoritmo de prioridade ponderada (deficit 40%, fase 20%, risco 20%, urgencia 20%)
- 5 niveis de prioridade (Critica, Alta, Media, Baixa, Sem Necessidade)
- 5 status operacionais (Irrigar Imediatamente, Irrigar Hoje, Irrigar Amanha, Monitorar, Nao Irrigar)
- Simulacao de 6 cenarios por pivo
- Restricao de horario de ponta

### Motor de Programacao
- Sequenciamento automatico por prioridade
- Respeito a restricoes hidraulicas (linhas, simultaneidade)
- Controle de demanda contratada
- Irrigacao deficitaria automatica quando recursos limitados
- Gestao de reservatorios

### Motor de Energia
- 3 modalidades tarifarias (Verde, Azul, Convencional)
- Consumo ponta/fora ponta com calculo minuto a minuto
- Analise de demanda com 5 niveis de risco
- 5 metodos de rateio (volume, area, horas, igual, personalizado)
- 6 simulacoes de cenarios energeticos
- 5 sugestoes inteligentes de otimizacao

### Centro de Controle
- Dashboard executivo com 8 KPIs e 7 Smart Cards
- Mapa operacional com 6 estados de pivo
- Centro de operacoes com fila, andamento e alertas
- 11 indicadores de eficiencia
- 8 graficos Recharts interativos

### Relatorios
- 8 tipos de relatorio (diario, semanal, mensal, por pivo, por cultura, energetico, financeiro, executivo)
- Exportacao em PDF, Excel e CSV
- 6 dimensoes de historico
- 7 dimensoes de comparativo
- 11 KPIs de indicadores
- Auditoria completa com timeline

### Cadastro Mestre
- CRUD completo para 7 entidades (Fazendas, Safras, Pivos, Solos, Culturas, Estacoes, Reservatorios)
- Interface em abas com entidades relacionadas
- Validacao de campos e confirmacao de exclusao

## Arquitetura do Sistema

```
                        Frontend
              Next.js 14 (App Router)
              TypeScript Strict Mode
              Tailwind CSS + Dark Mode
              Recharts 2.12

              Feature Modules
  +----------+ +--------+ +-----------+
  | Weather  | |  Soil  | |  Culture  |
  +----+-----+ +---+----+ +-----+-----+
       |           |             |
  +----v-----------v-------------v-----+
  |       Water Balance (FAO-56)       |
  +----------------+------------------+
                   |
       +-----------v----------+
       |   Recommendation     |
       +-----------+----------+
                   |
       +-----------v----------+
       |    Scheduling        |
       +-----------+----------+
                   |
       +-----------v----------+
       | Energy & Apportionment|
       +-----------+----------+
                   |
       +-----------v----------+
       |  Dashboard + Reports  |
       +-----------------------+

                Backend
         Supabase (PostgreSQL)
         Row Level Security
         Auth + Multi-tenant
```

## Tecnologias Utilizadas

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | Next.js | 14.2.5 |
| Linguagem | TypeScript | 5.5.3 (strict) |
| UI | React | 18.3.1 |
| Estilo | Tailwind CSS | 3.4.6 |
| Graficos | Recharts | 2.12.7 |
| Backend | Supabase | 2.108.2 |
| Auth SSR | @supabase/ssr | 0.12.0 |
| Database | PostgreSQL | 15+ (via Supabase) |
| Deploy | Vercel | - |

## Estrutura de Pastas

```
cotrim-irrigacao-pro/
  app/
    (app)/                    # Rotas autenticadas
      page.tsx                # Dashboard (Centro de Controle)
      fazendas/               # Cadastro de fazendas
      pivos/                  # Cadastro de pivos
      culturas/               # Cadastro de culturas
      solos/                  # Cadastro de solos
      clima/                  # Motor climatico
      balanco-hidrico/        # Motor de balanco hidrico
      programacao/            # Motor de programacao
      energia/                # Motor de energia
      rateio/                 # Rateio de custos
      relatorios/             # Relatorios inteligentes
      configuracoes/          # Configuracoes
      layout.tsx              # Layout com sidebar
    (auth)/                   # Rotas publicas
      login/
      recuperar-senha/
    layout.tsx                # Root layout
  components/
    ui/                       # 13 componentes reutilizaveis
    layout/                   # Sidebar, Topbar, PageHeader
    providers/                # Auth, Theme
  modules/
    weather/services/         # Motor climatico
    soil/services/            # Motor de solo
    culture/services/         # Motor de cultura
    water-balance/services/   # Motor FAO-56
    recommendation/services/  # Motor de recomendacao
    scheduling/services/      # Motor de programacao
    energy/services/          # Motor de energia
    reports/services/         # Motor de relatorios
    dashboard/                # Dashboard components
  supabase/
    migrations/               # 12 migrations SQL
  types/domain/               # 14 domain types
  constants/                  # Constantes agronomicas, Brasil, app
  utils/                      # math, format, cn
  lib/                        # Supabase client, hooks
  shared/data/                # Mock data
```

## Como Instalar

```bash
# Clonar o repositorio
git clone https://github.com/cotrim349/mateus-.git
cd mateus-

# Instalar dependencias
npm install

# Configurar variaveis de ambiente
cp .env.example .env.local
# Editar .env.local com as credenciais do Supabase:
# NEXT_PUBLIC_SUPABASE_URL=sua_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
```

## Como Executar

```bash
# Modo desenvolvimento
npm run dev

# Build de producao
npm run build

# Iniciar em producao
npm start
```

O servidor estara disponivel em `http://localhost:3000`.

## Como Fazer o Deploy

### Vercel (Recomendado)

1. Conecte o repositorio no Vercel (https://vercel.com)
2. Configure as variaveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy automatico a cada push

### Supabase

1. Crie um projeto no Supabase (https://supabase.com)
2. Execute as migrations em ordem (00001 a 00012)
3. Configure RLS e auth conforme as policies definidas
4. Atualize as variaveis de ambiente

## Roadmap Futuro

### Versao 2.0
- Motor Hidraulico completo
- Integracao com sensores e telemetria IoT
- API INMET e NASA POWER em tempo real
- Aplicativo mobile (React Native)
- Geracao de PDF real com @react-pdf/renderer
- Export Excel real com xlsx

### Versao 3.0
- Machine Learning para previsao de irrigacao
- Integracao com controladores de pivo
- API aberta para integracoes
- Marketplace de modulos

Consulte ROADMAP.md para detalhes completos.

## Documentacao

- [Documentacao Tecnica](DOCUMENTACAO_TECNICA.md)
- [Manual do Usuario](MANUAL_DO_USUARIO.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)

## Licenca

Projeto proprietario - Cotrim Irrigacao Pro. Todos os direitos reservados.
