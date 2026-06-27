# Roadmap — Cotrim Irrigação Pro

## Fase 1 — Estrutura e MVP visual (atual)

- [x] Arquitetura modular (Feature-Based Architecture)
- [x] Design System (tokens, componentes base)
- [x] Layout principal (Sidebar, Topbar, responsivo)
- [x] Sistema de tipos de domínio completo
- [x] Services de cálculo agronômico (ET0, ETc, CAD, AFD, lâmina, volume, energia, custo, prioridade, risco)
- [x] Dados fictícios calculados via services
- [x] Dashboard com 8 métricas, tabela de recomendação, 4 gráficos e Cotrim AI
- [x] Páginas iniciais (Pivôs, Culturas, Energia)
- [x] Documentação técnica (PROJECT_RULES, MASTER_CONTEXT, ROADMAP, FORMULAS)
- [ ] Páginas restantes com esqueleto funcional
- [ ] Validação de build e deploy local

## Fase 2 — Páginas completas com dados fictícios

- [ ] Fazendas: listagem, detalhe com módulos e mapa
- [ ] Solos: cadastro, parâmetros hídricos
- [ ] Clima: painel meteorológico, histórico de leituras
- [ ] Balanço Hídrico: tabela diária por pivô, gráfico de déficit acumulado
- [ ] Programação: agenda de irrigação, calendário
- [ ] Rateio de Custos: rateio por área e volume, relatório por cultura
- [ ] Reservatórios: níveis, autonomia, alertas
- [ ] Sensores: listagem, status, últimas leituras
- [ ] Alertas: painel de alertas com severidade e ações
- [ ] Relatórios: geração de relatórios operacionais
- [ ] Cotrim AI: página dedicada com histórico de recomendações
- [ ] Configurações: perfil, fazenda ativa, safra ativa

## Fase 3 — Backend e persistência

- [ ] API Routes para CRUD de todas as entidades
- [ ] PostgreSQL + Prisma ORM
- [ ] TimescaleDB para séries temporais (sensores, balanço hídrico)
- [ ] Migração dos dados fictícios para banco de dados
- [ ] Validação de dados com Zod

## Fase 4 — Autenticação e multi-tenancy

- [ ] Autenticação (NextAuth.js ou Clerk)
- [ ] Sistema de roles e permissões (admin, gestor, operador, visualizador)
- [ ] Multi-tenant: isolamento de dados por empresa
- [ ] Multi-farm: seletor de fazenda ativa
- [ ] Multi-season: seletor de safra ativa

## Fase 5 — IoT e sensores em tempo real

- [ ] Ingestão via MQTT/WebSocket
- [ ] Dashboard de sensores em tempo real
- [ ] Alertas automáticos por leitura fora do intervalo
- [ ] Histórico e gráficos de séries temporais

## Fase 6 — Inteligência artificial

- [ ] Modelo preditivo de déficit hídrico
- [ ] Otimização de programação de irrigação
- [ ] Análise de risco produtivo com machine learning
- [ ] Detecção de anomalias em sensores
- [ ] Recomendações contextuais em linguagem natural

## Fase 7 — Relatórios e exportação

- [ ] Geração de relatórios PDF
- [ ] Exportação de dados (CSV, Excel)
- [ ] Relatórios agronômicos por safra
- [ ] Dashboards comparativos entre safras

## Fase 8 — Mobile e campo

- [ ] PWA (Progressive Web App) para acesso em campo
- [ ] Modo offline com sincronização
- [ ] Notificações push
- [ ] Interface simplificada para operadores

## Fase 9 — Infraestrutura e escala

- [ ] CI/CD completo
- [ ] Monitoramento e observabilidade
- [ ] Cache e otimização de performance
- [ ] CDN para assets
- [ ] Backup automatizado
- [ ] Testes automatizados (unitários, integração, e2e)

## Fase 10 — Comercialização

- [ ] Planos e assinaturas
- [ ] Onboarding guiado
- [ ] Central de ajuda
- [ ] API pública para integrações
- [ ] Marketplace de extensões
