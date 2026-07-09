================================================================================
  PROJETO FERTIRRIGACAO EM CAIXAS - PIVO CENTRAL
  Modelo 3D para SketchUp
================================================================================

ARQUIVOS:

  fertirrigacao_caixas_10mil.rb   - *** METODO 1: SCRIPT RUBY (mais confiavel)
  fertirrigacao_caixas_10mil.dae  - *** METODO 2: COLLADA (importar arquivo)
  fertirrigacao_caixas_10mil.stl  -     METODO 3: STL (sem cores, universal)
  README_IMPORTACAO_SKETCHUP.txt  -     Este arquivo

================================================================================
METODO 1 - SCRIPT RUBY (MAIS CONFIAVEL - RECOMENDADO)
================================================================================

  Este metodo cria o modelo DIRETO dentro do SketchUp usando a API nativa.
  Funciona no SketchUp Make e SketchUp Pro (versoes desktop).

  PASSO A PASSO:

  1. Abra o SketchUp (versao desktop - Make ou Pro)

  2. Va em:
     Janela > Console Ruby
     (ou Window > Ruby Console)

  3. No console que abrir, digite:

     load "C:/caminho/da/pasta/fertirrigacao_caixas_10mil.rb"

     Troque "C:/caminho/da/pasta/" pelo caminho real onde voce salvou o arquivo.
     Exemplo: load "C:/Users/Mateus/Desktop/fertirrigacao_caixas_10mil.rb"

     DICA: Use barras normais (/) e nao barras invertidas (\)

  4. Pressione Enter e aguarde.
     O modelo sera construido automaticamente com todas as cores.

  5. Pronto! Salve como .skp

  ALTERNATIVA mais facil:
  - Copie o arquivo .rb para a pasta de Plugins do SketchUp:
    C:\Users\SEU_USUARIO\AppData\Roaming\SketchUp\SketchUp 20XX\SketchUp\Plugins\
  - Reinicie o SketchUp
  - No Console Ruby, digite apenas:
    load "fertirrigacao_caixas_10mil.rb"

================================================================================
METODO 2 - IMPORTAR COLLADA (.DAE)
================================================================================

  Funciona no SketchUp Free (web), Make e Pro.

  --- SketchUp desktop (Make / Pro) ---

  1. Abra o SketchUp
  2. Arquivo > Importar (File > Import)
  3. Tipo: "COLLADA Files (*.dae)"
  4. Selecione: fertirrigacao_caixas_10mil.dae
  5. Clique em Importar

  --- SketchUp Free (web: app.sketchup.com) ---

  1. Abra o SketchUp Free no navegador
  2. Clique no icone de pasta/hamburguer no canto superior esquerdo
  3. Selecione "Inserir" ou "Insert"
  4. Arraste o .dae para a janela ou clique para selecionar
  5. Se pedir escala/unidade, escolha METROS

  Se nao abrir: tente o Metodo 1 (Script Ruby)

================================================================================
METODO 3 - IMPORTAR STL (SEM CORES)
================================================================================

  O STL funciona em todas as versoes, mas NAO tem cores.

  1. Arquivo > Importar > "STL Files (*.stl)"
  2. Unidade = Metros
  3. Selecione o arquivo .stl
  4. Aplique cores manualmente depois

================================================================================
QUAL METODO USAR?
================================================================================

  SketchUp Pro (desktop)  --> Metodo 1 (Ruby) = GARANTIDO
  SketchUp Make (desktop) --> Metodo 1 (Ruby) = GARANTIDO
  SketchUp Free (web)     --> Metodo 2 (DAE)
  Outros programas 3D     --> Metodo 2 (DAE) ou Metodo 3 (STL)

  Se nenhum funcionar, use o Metodo 3 (STL) que e o mais universal.

================================================================================
ESPECIFICACOES
================================================================================

  2 caixas de 10.000 L em paralelo = 20.000 L total
  Autonomia: ~7 horas
  Vazao (2 caixas): 2.857 L/h
  Vazao (1 caixa): 1.428 L/h
  Escala: 1:1 em METROS

================================================================================
COMPONENTES
================================================================================

  - Base de concreto (8 x 5 x 0,15 m)
  - 2 caixas cilindricas (D=2,30m / H=2,40m)
  - Tampas, indicadores de nivel, placas de ID
  - Saidas inferiores com registros individuais
  - Drenos de limpeza
  - Coletor em paralelo
  - Recirculacao (risers + retorno ao topo)
  - Filtro + bomba dosadora + medidor de vazao
  - Manometro + valvula de retencao + registro
  - Adutora do pivo (~300mm)
  - Ponto de injecao com valvula
  - Linha de agua limpa (abastecimento + lavagem)
  - Abrigo tecnico com cobertura
  - Painel de controle

================================================================================
CORES
================================================================================

  VERDE ........... Calda / fertilizante
  AZUL ............ Agua limpa / lavagem
  CINZA ........... Estrutura / concreto
  VERMELHO ........ Valvulas de retencao
  AMARELO ......... Pontos de atencao
  BRANCO/BEGE ..... Caixas d'agua

================================================================================
