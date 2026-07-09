================================================================================
  PROJETO FERTIRRIGACAO EM CAIXAS - SISTEMA PARA PIVO CENTRAL
  Modelo 3D para importacao no SketchUp
================================================================================

ARQUIVOS INCLUIDOS:

  fertirrigacao_caixas_10mil.obj  - Modelo 3D principal (Wavefront OBJ)
  fertirrigacao_caixas_10mil.mtl  - Biblioteca de materiais/cores (MTL)
  fertirrigacao_caixas_10mil.stl  - Modelo alternativo (STL binario)
  README_IMPORTACAO_SKETCHUP.txt  - Este arquivo

================================================================================
ESPECIFICACOES DO PROJETO
================================================================================

  Configuracao: 2 caixas de 10.000 L em paralelo
  Capacidade total: 20.000 L
  Autonomia de referencia: ~7 horas
  Vazao media (2 caixas): 2.857 L/h = 47,6 L/min = 0,79 L/s
  Vazao media (1 caixa):  1.428 L/h = 23,8 L/min = 0,39 L/s
  Unidade do modelo: METROS
  Escala: 1:1 (tamanho real)

================================================================================
COMO IMPORTAR NO SKETCHUP - ARQUIVO OBJ (RECOMENDADO)
================================================================================

  1. Abra o SketchUp.

  2. Va em: Arquivo > Importar  (ou File > Import)

  3. No campo "Tipo de arquivo", selecione:
     "OBJ Files (*.obj)"
     (Se nao aparecer, pode ser necessario instalar o plugin de importacao OBJ
      ou usar o SketchUp Pro/Studio que suporta nativamente)

  4. Navegue ate a pasta onde estao os arquivos e selecione:
     fertirrigacao_caixas_10mil.obj

  5. IMPORTANTE: Antes de clicar "Importar", clique em "Opcoes" e verifique:
     - Unidade: Metros (Model Units = Meters)
     - Preservar orientacao das normais: SIM

  6. Clique em "Importar".

  7. O modelo sera inserido na cena. Posicione conforme necessario.

  ATENCAO:
  - O arquivo .MTL DEVE estar na MESMA PASTA que o .OBJ
  - Se o MTL nao estiver junto, as cores/materiais nao serao carregados
  - Mantenha os dois arquivos sempre juntos

================================================================================
COMO IMPORTAR - ARQUIVO STL (ALTERNATIVA)
================================================================================

  1. Abra o SketchUp.

  2. Va em: Arquivo > Importar

  3. Selecione "STL Files (*.stl)" no tipo de arquivo.

  4. Selecione: fertirrigacao_caixas_10mil.stl

  5. Em Opcoes, defina:
     - Unidade: Metros
     - Mesclar faces coplanares: SIM (recomendado)

  6. Clique em Importar.

  NOTA: O formato STL nao suporta cores/materiais.
  O modelo sera importado em uma unica cor.
  Voce pode aplicar materiais manualmente no SketchUp depois.

================================================================================
CENAS SUGERIDAS NO SKETCHUP
================================================================================

  Apos importar, crie as seguintes cenas (Pages) para apresentacao:

  Cena 1 - VISTA GERAL 3D
    Camera em perspectiva, angulo ~45 graus, mostrando todo o sistema.
    Ideal para visao de conjunto.

  Cena 2 - VISTA SUPERIOR (PLANTA)
    Camera de cima (Top View), mostrando layout em planta.
    Util para dimensionamento e posicionamento.

  Cena 3 - DETALHE DAS CAIXAS
    Zoom nas duas caixas, mostrando:
    - Tampas, nivel, saida inferior, drenos
    - Registros individuais
    - Ligacao em paralelo

  Cena 4 - DETALHE BOMBA / FILTRO
    Zoom no conjunto de injecao:
    - Filtro, bomba dosadora, medidor de vazao
    - Manometro, valvula de retencao
    - Registro de bloqueio

  Cena 5 - PONTO DE INJECAO
    Zoom no ponto onde a calda entra na adutora do pivo.
    Mostrar valvula de retencao e registro.

  Cena 6 - RECIRCULACAO
    Mostrar a linha verde de recirculacao:
    - Saida do coletor inferior
    - Retorno pela parte superior das caixas
    - Registros de controle

================================================================================
COMPONENTES DO MODELO
================================================================================

  ESTRUTURA:
    - Base de concreto (8,0 x 5,0 x 0,15 m)
    - Abrigo tecnico com cobertura (4 pilares + telhado)
    - Painel de controle

  CAIXAS (2 unidades):
    - Corpo cilindrico (D = 2,30 m / H = 2,40 m / 10.000 L cada)
    - Tampa superior de inspecao
    - Indicador de nivel (faixa lateral)
    - Placa de identificacao
    - Saida inferior com registro individual
    - Dreno inferior para limpeza

  TUBULACAO VERDE (calda/fertilizante):
    - Descidas individuais de cada caixa
    - Coletor principal (manifold)
    - Linha de recirculacao com risers e retornos
    - Tubulacao ate filtro, bomba, medidor, valvulas
    - Linha de injecao ate adutora

  TUBULACAO AZUL (agua limpa):
    - Linha principal de abastecimento
    - Descidas para cada caixa
    - Linha de lavagem ate adutora

  CONJUNTO DE INJECAO:
    - Filtro
    - Bomba dosadora / injetora
    - Medidor de vazao
    - Manometro
    - Valvula de retencao (vermelha)
    - Registro de bloqueio

  ADUTORA / LINHA DO PIVO:
    - Tubulacao principal (D ~300 mm)
    - Ponto de injecao (tee amarelo)
    - Valvula de retencao no ponto de injecao

================================================================================
CODIGO DE CORES
================================================================================

  VERDE ........... Calda / fertilizante
  AZUL ............ Agua limpa / lavagem
  CINZA ........... Estrutura, concreto, tubulacao geral
  VERMELHO ........ Valvulas de retencao e seguranca
  AMARELO ......... Pontos de atencao
  BRANCO/BEGE ..... Caixas d'agua

================================================================================
SEQUENCIA OPERACIONAL
================================================================================

  1. Abastecer a caixa com parte da agua
  2. Adicionar o fertilizante aos poucos
  3. Completar o volume de agua
  4. Acionar a recirculacao para misturar bem
  5. Ligar o pivo apenas com agua limpa
  6. Apos pressurizar, iniciar a injecao da calda
  7. Regular a bomba para ~7 horas de aplicacao
  8. Apos acabar a calda, continuar com agua limpa para lavagem
  9. Lavar caixa, filtro, bomba e tubulacoes

================================================================================
OPERACAO EM PARALELO
================================================================================

  Com registros individuais em cada caixa, o sistema permite:

  - Somente Caixa 1 (registro 1 aberto, registro 2 fechado)
  - Somente Caixa 2 (registro 2 aberto, registro 1 fechado)
  - Ambas as caixas (ambos abertos)
  - Uma em operacao, outra sendo preparada ou limpa

================================================================================
DICAS PARA O SKETCHUP
================================================================================

  - Apos importar, use "Zoom Extents" para enquadrar todo o modelo
  - Use a ferramenta "Section Plane" para criar cortes
  - Exporte cenas como imagens em alta resolucao para apresentacoes
  - Use o plugin "V-Ray" ou "Enscape" para renderizacao realista
  - Para editar componentes, clique duas vezes para entrar no grupo
  - Salve como .skp para trabalhar nativamente no SketchUp

================================================================================
  Projeto: Sistema de Fertirrigacao em Caixas para Pivo Central
  Escala: 1:1 (metros)
  Modelo gerado para uso tecnico e operacional em fazenda
================================================================================
