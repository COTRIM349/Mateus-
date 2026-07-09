================================================================================
  PROJETO FERTIRRIGACAO EM CAIXAS - SISTEMA PARA PIVO CENTRAL
  Modelo 3D para importacao no SketchUp
================================================================================

ARQUIVOS INCLUIDOS:

  fertirrigacao_caixas_10mil.dae  - *** ARQUIVO PRINCIPAL (COLLADA) ***
  fertirrigacao_caixas_10mil.obj  - Alternativa (Wavefront OBJ)
  fertirrigacao_caixas_10mil.mtl  - Materiais do OBJ (manter junto do .obj)
  fertirrigacao_caixas_10mil.stl  - Alternativa (STL binario, sem cores)
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
***  COMO IMPORTAR NO SKETCHUP - ARQUIVO .DAE (RECOMENDADO)  ***
================================================================================

  O formato COLLADA (.dae) e o formato nativo de importacao do SketchUp.
  Funciona em TODAS as versoes: Free (web), Make, Pro e Studio.

  --- SketchUp Pro / Make (desktop) ---

  1. Abra o SketchUp
  2. Va em: Arquivo > Importar  (File > Import)
  3. No campo "Tipo de arquivo", selecione:
     "COLLADA Files (*.dae)"
  4. Navegue ate a pasta e selecione:
     fertirrigacao_caixas_10mil.dae
  5. Clique em "Importar"
  6. O modelo aparecera na cena com cores e materiais
  7. Use "Zoom Extents" (Ctrl+Shift+E) para enquadrar

  --- SketchUp Free (web / app.sketchup.com) ---

  1. Abra o SketchUp Free no navegador
  2. Crie um novo projeto ou abra um existente
  3. Clique no icone de pasta (Open/Insert)
     ou arraste o arquivo .dae direto para a tela
  4. Selecione: fertirrigacao_caixas_10mil.dae
  5. O modelo sera importado com cores

  IMPORTANTE:
  - O arquivo .dae ja contem os materiais embutidos
  - Nao precisa de arquivo extra (diferente do OBJ)
  - O modelo esta em metros, escala 1:1

================================================================================
COMO IMPORTAR - ARQUIVO .OBJ (ALTERNATIVA)
================================================================================

  O formato OBJ funciona no SketchUp Pro e Studio.
  NAO funciona no SketchUp Free (web).

  1. Coloque o .obj E o .mtl na MESMA PASTA
  2. Arquivo > Importar > selecione "OBJ Files (*.obj)"
  3. Em "Opcoes", defina Unidade = Metros
  4. Selecione: fertirrigacao_caixas_10mil.obj
  5. Clique em Importar

  Se as cores nao aparecerem:
  - Verifique se o .mtl esta na mesma pasta que o .obj
  - O nome do .mtl nao pode ser alterado

================================================================================
COMO IMPORTAR - ARQUIVO .STL (ALTERNATIVA BASICA)
================================================================================

  O STL funciona em todas as versoes do SketchUp.
  Porem NAO CARREGA CORES - tudo fica em uma cor so.

  1. Arquivo > Importar > "STL Files (*.stl)"
  2. Em Opcoes: Unidade = Metros
  3. Selecione: fertirrigacao_caixas_10mil.stl
  4. Clique em Importar
  5. Aplique cores manualmente se necessario

================================================================================
RESUMO - QUAL FORMATO USAR?
================================================================================

  SketchUp Free (web)  -->  Use o .DAE (COLLADA)
  SketchUp Make        -->  Use o .DAE (COLLADA)
  SketchUp Pro         -->  Use o .DAE ou .OBJ
  SketchUp Studio      -->  Use o .DAE ou .OBJ
  Outros programas     -->  Use o .OBJ ou .STL

  Na duvida: USE SEMPRE O .DAE

================================================================================
CENAS SUGERIDAS NO SKETCHUP
================================================================================

  Apos importar, crie cenas (Pages) para apresentacao:

  Cena 1 - VISTA GERAL 3D
    Camera em perspectiva, angulo ~45 graus.

  Cena 2 - VISTA SUPERIOR (PLANTA)
    Camera de cima (Top View).

  Cena 3 - DETALHE DAS CAIXAS
    Zoom nas duas caixas, tampas, nivel, saida, drenos.

  Cena 4 - DETALHE BOMBA / FILTRO
    Zoom no conjunto de injecao.

  Cena 5 - PONTO DE INJECAO
    Zoom no ponto de entrada na adutora.

  Cena 6 - RECIRCULACAO
    Mostrar a linha verde de recirculacao.

================================================================================
COMPONENTES DO MODELO (69 objetos)
================================================================================

  ESTRUTURA:
    - Base de concreto (8,0 x 5,0 x 0,15 m)
    - Abrigo tecnico (4 pilares + cobertura)
    - Painel de controle

  CAIXAS (2 unidades):
    - Corpo cilindrico (D=2,30m / H=2,40m / 10.000L cada)
    - Tampa superior
    - Indicador de nivel
    - Placa de identificacao
    - Saida inferior com registro
    - Dreno inferior

  TUBULACAO VERDE (calda/fertilizante):
    - Descidas de cada caixa
    - Coletor principal
    - Recirculacao com risers e retornos
    - Linha ate filtro, bomba, medidor, valvulas
    - Linha de injecao ate adutora

  TUBULACAO AZUL (agua limpa):
    - Abastecimento de cada caixa
    - Linha de lavagem

  CONJUNTO DE INJECAO:
    - Filtro, bomba dosadora, medidor de vazao
    - Manometro, valvula de retencao, registro

  ADUTORA:
    - Linha principal (~300mm)
    - Ponto de injecao (tee amarelo)
    - Valvula de retencao

================================================================================
CODIGO DE CORES
================================================================================

  VERDE ........... Calda / fertilizante
  AZUL ............ Agua limpa / lavagem
  CINZA ........... Estrutura / concreto / tubulacao
  VERMELHO ........ Valvulas de retencao e seguranca
  AMARELO ......... Pontos de atencao
  BRANCO/BEGE ..... Caixas d'agua

================================================================================
  Escala: 1:1 (metros) | 69 objetos | 1.298 vertices | 2.320 triangulos
================================================================================
