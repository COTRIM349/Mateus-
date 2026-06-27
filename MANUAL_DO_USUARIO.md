# Manual do Usuario - Cotrim Irrigacao Pro v1.0

## 1. Primeiro Acesso

### Cadastro e Login

1. Acesse a plataforma pelo navegador
2. Na tela de login, insira seu email e senha
3. Caso nao tenha conta, solicite ao administrador da empresa
4. Apos o login, voce sera redirecionado ao Dashboard

### Perfis de Acesso

| Perfil | Permissoes |
|--------|-----------|
| Admin | Acesso total, gerenciar usuarios |
| Manager | Gerenciar fazendas e operacoes |
| Operator | Operar irrigacao e registrar dados |
| Viewer | Visualizar dados e relatorios |

### Selecao de Fazenda

- No topo da tela, selecione a fazenda ativa
- Todos os dados exibidos serao filtrados pela fazenda selecionada
- Voce pode trocar de fazenda a qualquer momento

## 2. Fazendas

### Cadastrar Nova Fazenda
1. Acesse **Fazendas** no menu lateral
2. Clique em **Nova Fazenda**
3. Preencha: Nome, Cidade, Estado, Latitude, Longitude, Altitude, Area total
4. Clique em **Salvar**

### Gerenciar Safras
1. Na pagina de Fazendas, selecione uma fazenda
2. Na aba **Safras**, clique em **Nova Safra**
3. Preencha: Nome da safra, Data inicio, Data fim, Status
4. Cada safra representa um ciclo produtivo

### Modulos de Producao
1. Na aba **Modulos**, cadastre as divisoes da fazenda
2. Cada modulo agrupa pivos por area geografica

## 3. Pivos

### Cadastrar Pivo
1. Acesse **Pivos** no menu lateral
2. Clique em **Novo Pivo**
3. Preencha os dados:
   - **Nome**: Identificacao do pivo
   - **Area (ha)**: Area irrigada
   - **Vazao (m3/h)**: Vazao do sistema
   - **Eficiencia (%)**: Eficiencia de aplicacao (ex: 85%)
   - **Potencia (CV)**: Potencia da bomba
   - **Status**: Irrigando, Parado, Manutencao, Alerta

### Atribuir Cultura ao Pivo
1. Na aba **Culturas**, vincule uma cultura e safra ao pivo
2. Defina a fase fenologica atual
3. O sistema usara o Kc correspondente nos calculos

## 4. Solos

### Cadastrar Perfil de Solo
1. Acesse **Solos** no menu lateral
2. Clique em **Novo Solo**
3. Preencha:
   - **Nome**: Identificacao do perfil
   - **Textura**: Arenoso a Muito argiloso
   - **Capacidade de Campo (CC)**: Em cm3/cm3
   - **Ponto de Murcha Permanente (PMP)**: Em cm3/cm3
   - **Profundidade efetiva**: Em metros
   - **Velocidade de infiltracao**: mm/h

### Camadas do Solo
1. Na aba **Camadas**, adicione camadas com diferentes propriedades
2. Cada camada tem profundidade, CC e PMP proprios

### Historico de Analises
1. Na aba **Historico**, registre analises laboratoriais
2. Acompanhe a evolucao das propriedades ao longo do tempo

## 5. Culturas

### Cadastrar Cultura
1. Acesse **Culturas** no menu lateral
2. Clique em **Nova Cultura**
3. Preencha: Nome, Grupo (Graos, Fibras, etc.), Status
4. O sistema carrega Kc padrao (FAO-56) automaticamente

### Variedades
1. Na aba **Variedades**, cadastre cultivares especificos
2. Defina: Nome, Ciclo (dias), Tipo maturidade (Precoce/Medio/Tardio)

### Fases Fenologicas
1. Na aba **Fases**, defina as fases da cultura
2. Para cada fase: Nome, Duracao (dias), Kc, Profundidade de raiz, Fator de deplecao
3. Estas informacoes alimentam o balanco hidrico

## 6. Clima

### Estacoes Meteorologicas
1. Acesse **Clima** no menu lateral
2. Cadastre estacoes: Nome, Tipo (Automatica/Manual/Virtual), Fonte de dados
3. Defina a prioridade de cada estacao

### Dados Climaticos
1. Na aba **Dados**, visualize as leituras diarias
2. Dados registrados: Temperatura (max/min/media), Umidade, Vento, Radiacao, Precipitacao, ET0
3. O sistema valida dados atipicos automaticamente

### Indicadores
- **ET0**: Evapotranspiracao de referencia (Penman-Monteith)
- **Precipitacao efetiva**: Calculada pelo metodo USDA SCS
- **Tendencias**: Graficos de evolucao temporal

## 7. Balanco Hidrico

### Visualizacao
1. Acesse **Balanco Hidrico** no menu lateral
2. Selecione o pivo desejado
3. Visualize o balanco diario com:
   - **ARM**: Armazenamento atual (mm)
   - **CAD**: Capacidade de agua disponivel (mm)
   - **AFD**: Agua facilmente disponivel (mm)
   - **Deficit**: Deficit hidrico (mm)
   - **ETc**: Evapotranspiracao da cultura (mm/dia)

### Interpretacao dos Status

| Status | Significado | Acao |
|--------|------------|------|
| Saturado | ARM >= CAD | Nao irrigar |
| Ideal | ARM acima do limiar de estresse | Monitorar |
| Atencao | ARM entre 30-55% do CAD | Programar irrigacao |
| Deficit | ARM entre 10-30% do CAD | Irrigar em breve |
| Deficit Critico | ARM < 10% do CAD | Irrigar imediatamente |

### Graficos
- Evolucao do ARM ao longo do tempo
- Comparativo ARM vs CAD por pivo
- Deficit acumulado
- Irrigacao aplicada vs ETc vs Chuva

## 8. Recomendacoes

O sistema gera recomendacoes automaticas de irrigacao baseadas em:
- Estado hidrico atual (ARM, deficit)
- Fase fenologica da cultura
- Risco produtivo
- Urgencia temporal

### Niveis de Prioridade

| Prioridade | Score | Acao Sugerida |
|-----------|-------|---------------|
| Critica | >= 80 | Irrigar imediatamente |
| Alta | 60-79 | Irrigar hoje |
| Media | 40-59 | Irrigar amanha |
| Baixa | 20-39 | Monitorar |
| Sem Necessidade | < 20 | Nao irrigar |

### Informacoes da Recomendacao
- Lamina liquida e bruta (mm)
- Volume necessario (m3)
- Tempo estimado de irrigacao (h)
- Horario recomendado (evita ponta)
- Motivo detalhado
- Observacoes operacionais

## 9. Programacao Operacional

### Programacao Diaria
1. Acesse **Programacao** no menu lateral
2. O sistema gera automaticamente a programacao do dia
3. Visualize:
   - **Fila**: Pivos aguardando irrigacao
   - **Em andamento**: Irrigacoes em execucao
   - **Concluidos**: Irrigacoes finalizadas
   - **Bloqueados**: Pivos com restricoes

### Slots de Irrigacao
Cada slot mostra:
- Pivo, Casa de bomba, Horario inicio/fim
- Lamina, Volume, Duracao
- Energia estimada, Custo
- Status (Agendado, Executando, Concluido, Cancelado, Bloqueado)
- Justificativa operacional

### Restricoes Respeitadas
- Limite de pivos simultaneos por casa de bomba
- Conflitos de linha hidraulica
- Demanda contratada de energia
- Disponibilidade de agua (reservatorios)
- Horario de ponta energetico

## 10. Energia

### Centro de Energia
1. Acesse **Energia** no menu lateral
2. Visualize consumo total, ponta/fora ponta, custo acumulado
3. Graficos de consumo diario, por cultura, perfil horario

### Consumo
- Tabela com consumo por pivo, casa de bomba, cultura ou modulo
- kWh total, ponta, fora ponta
- Custo total, R$/m3, R$/mm, R$/ha

### Demanda
- Demanda contratada vs medida
- Margem de seguranca
- Risco de ultrapassagem
- Multa estimada

### Simulacoes
O sistema simula 6 cenarios:
1. Operacao atual (base)
2. Tudo fora de ponta
3. Reduzir potencia (70%)
4. Reduzir lamina (80%)
5. Distribuir carga
6. Concentrar operacao

### Inteligencia
Sugestoes automaticas:
- Deslocar irrigacao para fora de ponta
- Risco de ultrapassagem de demanda
- Consolidar casas de bomba
- Melhor horario para irrigar
- Projecao de custo mensal

## 11. Rateio de Custos

1. Acesse **Rateio de Custos** no menu lateral
2. Visualize o rateio por: Pivo, Cultura, Modulo, Comparativo
3. 5 metodos disponiveis: Volume, Area, Horas, Igual, Personalizado
4. Indicadores: kWh rateado, R$ rateado, % participacao, R$/ha

## 12. Dashboard (Centro de Controle)

### Aba Dashboard
- 8 KPIs: Area irrigada, Area pendente, Agua aplicada, Energia, Custo, R$/mm, Eficiencia irrigacao, Eficiencia energetica
- 7 Smart Cards: Maior risco, Melhor pivo, Maior consumo, Economia possivel, Irrigacao atrasada, Reservatorios, Casas de bomba
- Graficos de status e consumo por cultura

### Aba Mapa Operacional
- Cards de pivo com ARM%, deficit, ETc
- 6 cores de status: Irrigando (azul), Programado (roxo), Aguardando (amarelo), Alerta (vermelho), Parado (cinza), Manutencao (laranja)

### Aba Centro de Operacoes
- Fila de irrigacao, operacoes em andamento
- Alertas criticos
- Top 5 recomendacoes IA

### Aba Indicadores
- Consumo diario/semanal/mensal
- Indicadores hidricos e de eficiencia
- Ranking completo de pivos

### Aba Graficos
- 8 graficos interativos com evolucao temporal

## 13. Relatorios

### Gerar Relatorio
1. Acesse **Relatorios** no menu lateral
2. Selecione o tipo de relatorio (8 opcoes)
3. Escolha o formato (PDF, Excel, CSV)
4. Clique em **Gerar Relatorio**
5. Visualize a pre-visualizacao antes de exportar

### Tipos Disponiveis
| Tipo | Conteudo |
|------|---------|
| Diario | Clima, irrigacoes, recomendacoes, alertas do dia |
| Semanal | Consolidacao com tendencias e ranking |
| Mensal | Analise completa com KPIs e evolucao |
| Por Pivo | Desempenho individual com historico |
| Por Cultura | Indicadores agrupados com eficiencia |
| Energetico | Consumo, demanda, ponta/fora ponta |
| Financeiro | Custos, rateio, projecoes |
| Executivo | Visao estrategica para diretoria |

### Historico
- 6 dimensoes: Irrigacoes, Recomendacoes, Agua, Energia, Custos, Clima
- Tabelas detalhadas com todos os registros
- Exportacao em CSV

### Comparativos
- 7 dimensoes: Pivos, Culturas, Modulos, Periodos, Safras, Casas de Bomba, Fazendas
- Tabela comparativa + 4 graficos

### Indicadores
- 11 KPIs com cards visuais
- Radar de desempenho (6 eixos)
- Graficos por pivo e cultura

### Auditoria
- Log completo de todas as acoes
- Filtro por tipo de acao
- Timeline de atividade recente
- Quem, o que, quando alterou

## 14. Cotrim AI

Assistente inteligente integrado para:
- Consultas sobre dados da fazenda
- Recomendacoes personalizadas
- Analise de tendencias
- Suporte operacional

(Funcionalidade prevista para expansao na versao 2.0)

## 15. Configuracoes

1. Acesse **Configuracoes** no menu lateral
2. Gerencie: Perfil do usuario, Preferencias de notificacao, Tema (claro/escuro)

## Suporte

Para duvidas ou problemas, entre em contato com o administrador do sistema.
