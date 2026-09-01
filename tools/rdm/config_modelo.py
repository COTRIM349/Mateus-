# -*- coding: utf-8 -*-
"""Parametros de configuracao do modelo hidrico da RDM.

Tudo o que nao veio dos dois arquivos oficiais esta neste arquivo, com a
origem declarada em ORIGEM. Nada aqui e escrito "escondido" dentro de
formulas: cada valor vira celula editavel na planilha.
"""

# ---------------------------------------------------------------- horizonte
SEMANA_1_SEGUNDA = "2026-08-31"   # segunda-feira da semana que contem 01/09/2026
N_SEMANAS = 65                    # cobre ate 28/11/2027 (ultimo ciclo da rotacao)
SAFRA = "2026/2027 - RDM"

# ------------------------------------------------------- parametros gerais
PARAMETROS = [
    # (nome_definido, rotulo, valor, unidade, origem, editavel)
    ("HORAS_OPERACAO_DIA", "Horas de operacao disponiveis por dia", 21, "h/dia",
     "Turno de rega do arquivo oficial RDM (Dashboard!C13 = 21 h)", True),
    ("HORAS_OPERACAO_SEMANA", "Horas de operacao disponiveis por semana", None, "h/semana",
     "Calculado: HORAS_OPERACAO_DIA x DIAS_POR_SEMANA", False),
    ("DIAS_POR_SEMANA", "Dias por semana", 7, "dias", "Definicao do modelo", True),
    ("HORAS_CAPTACAO_DIA", "Turno de captacao dos pocos", 18, "h/dia",
     "Arquivo oficial RDM (Dashboard, linha 'Turno de captacao')", True),
    ("MM_PARA_M3_HA", "Conversao lamina -> volume", 10, "m3/(mm.ha)",
     "1 mm em 1 ha = 10 m3", False),
    ("EFICIENCIA_PADRAO", "Eficiencia de aplicacao padrao", 0.85, "fracao",
     "DADO PENDENTE - nao consta nos arquivos oficiais. Valor provisorio.", True),
    ("FATOR_CHUVA_UTIL", "Fator de aproveitamento da chuva", 0.80, "fracao",
     "DADO PENDENTE - definir com base no historico da fazenda.", True),
    ("LIMITE_CHUVA_UTIL_DIA", "Limite diario de chuva util", 25, "mm/dia",
     "DADO PENDENTE - teto de infiltracao/armazenamento. Valor provisorio.", True),
    ("CENARIO_CLIMA", "Cenario climatico ativo", "REFERENCIA", "texto",
     "REFERENCIA = curva provisoria | USUARIO = colunas preenchidas pelo usuario", True),
    ("LIMITE_CONFORTAVEL", "Limite superior da faixa CONFORTAVEL", 0.80, "fracao",
     "Faixa editavel de classificacao", True),
    ("LIMITE_ATENCAO", "Limite superior da faixa ATENCAO", 0.90, "fracao",
     "Faixa editavel de classificacao", True),
    ("LIMITE_CRITICO", "Limite superior da faixa CRITICO", 1.00, "fracao",
     "Acima deste valor: INVIAVEL em 21 h/dia", True),
]

# --------------------------------------------------- clima de referencia
# ATENCAO: curva PROVISORIA. Os arquivos oficiais nao trazem ETo nem chuva.
# Deve ser substituida por serie de estacao / INMET / banco climatico antes
# de qualquer decisao operacional. Listada em PENDENCIAS_CADASTRO.
ETO_REF_MM_DIA = {1: 4.2, 2: 4.1, 3: 4.2, 4: 4.1, 5: 3.8, 6: 3.6,
                  7: 3.9, 8: 4.7, 9: 5.4, 10: 5.4, 11: 4.7, 12: 4.3}
CHUVA_REF_MM_MES = {1: 190, 2: 160, 3: 170, 4: 80, 5: 20, 6: 5,
                    7: 3, 8: 5, 9: 25, 10: 110, 11: 190, 12: 220}
FONTE_CLIMA = "CURVA DE REFERENCIA PROVISORIA - SUBSTITUIR POR DADO OFICIAL"

# --------------------------------------------------- curvas de Kc (FAO-56)
# Fonte: FAO Irrigation and Drainage Paper 56, Tabelas 11 e 12.
# f_* = fracao do ciclo em cada fase (inicial, desenvolvimento, media, final).
# Chave = CULTURA|GRUPO. Editaveis na aba PARAMETROS_CULTURAS.
CURVAS_KC = [
    # chave, cultura, grupo, dur_ref, f_ini, f_dev, f_mid, f_end, Kc_ini, Kc_mid, Kc_end
    ("SOJA|PRECOCE",        "SOJA",          "PRECOCE", 108, 0.18, 0.24, 0.40, 0.18, 0.40, 1.15, 0.50),
    ("SOJA|MEDIA",          "SOJA",          "MEDIA",   120, 0.16, 0.23, 0.42, 0.19, 0.40, 1.15, 0.50),
    ("SOJA|TARDIA",         "SOJA",          "TARDIA",  135, 0.15, 0.22, 0.44, 0.19, 0.40, 1.15, 0.50),
    ("ALGODAO|PRECOCE",     "ALGODAO",       "PRECOCE", 180, 0.17, 0.27, 0.31, 0.25, 0.35, 1.15, 0.60),
    ("ALGODAO|MEDIA",       "ALGODAO",       "MEDIA",   195, 0.15, 0.26, 0.31, 0.28, 0.35, 1.15, 0.60),
    ("ALGODAO|TARDIA",      "ALGODAO",       "TARDIA",  210, 0.14, 0.24, 0.33, 0.29, 0.35, 1.15, 0.60),
    ("MILHO_SEMENTE|PADRAO", "MILHO_SEMENTE", "PADRAO", 160, 0.19, 0.25, 0.31, 0.25, 0.30, 1.15, 0.60),
    ("MILHO_GRAO|PADRAO",   "MILHO_GRAO",    "PADRAO",  160, 0.19, 0.25, 0.31, 0.25, 0.30, 1.20, 0.60),
    ("TABACO|PADRAO",       "TABACO",        "PADRAO",  160, 0.18, 0.27, 0.27, 0.28, 0.35, 1.10, 0.80),
    ("GERGELIM|PADRAO",     "GERGELIM",      "PADRAO",  110, 0.18, 0.27, 0.37, 0.18, 0.35, 1.10, 0.25),
    ("FEIJAO|PADRAO",       "FEIJAO",        "PADRAO",   95, 0.21, 0.32, 0.31, 0.16, 0.40, 1.15, 0.35),
    ("SORGO|PADRAO",        "SORGO",         "PADRAO",  130, 0.15, 0.27, 0.31, 0.27, 0.30, 1.10, 0.55),
    ("MILHETO|PADRAO",      "MILHETO",       "PADRAO",   90, 0.17, 0.28, 0.33, 0.22, 0.30, 1.00, 0.30),
    ("CROTALARIA|PADRAO",   "CROTALARIA",    "PADRAO",   90, 0.17, 0.28, 0.33, 0.22, 0.30, 1.00, 0.45),
    ("BRACHIARIA|PADRAO",   "BRACHIARIA",    "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 0.55, 0.95, 0.80),
    ("MIX COBERTURA|PADRAO", "MIX COBERTURA", "PADRAO",  90, 0.17, 0.28, 0.33, 0.22, 0.30, 1.00, 0.45),
    ("CACAU|PADRAO",        "CACAU",         "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 1.00, 1.05, 1.05),
    ("EUCALIPTO|PADRAO",    "EUCALIPTO",     "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 0.80, 1.00, 1.00),
    ("MYAGUI|PADRAO",       "MYAGUI",        "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 0.55, 0.95, 0.80),
    ("CARINATA|PADRAO",     "CARINATA",      "PADRAO",  120, 0.17, 0.25, 0.35, 0.23, 0.35, 1.10, 0.35),
    ("FEIJAO CAUPI|PADRAO", "FEIJAO CAUPI",  "PADRAO",  100, 0.20, 0.30, 0.30, 0.20, 0.40, 1.05, 0.35),
    ("FEIJAO MUNGO|PADRAO", "FEIJAO MUNGO",  "PADRAO",   95, 0.21, 0.32, 0.31, 0.16, 0.40, 1.05, 0.35),
    ("MILHO PESQUISA|PADRAO", "MILHO PESQUISA", "PADRAO", 160, 0.19, 0.25, 0.31, 0.25, 0.30, 1.20, 0.60),
]
FONTE_KC = "FAO-56 (Irrigation and Drainage Paper 56), Tabelas 11 e 12 - valores de partida, editaveis"

# duracao de referencia por cultura, usada quando a data de plantio e desconhecida
DURACAO_REF = {"ALGODAO": 195, "SOJA": 116, "TABACO": 160, "MILHO_SEMENTE": 160,
               "MILHO_GRAO": 160, "GERGELIM": 110, "MILHETO": 90, "FEIJAO": 95}

# classificacao de grupo da soja/algodao a partir da duracao real do ciclo
def grupo_por_duracao(cultura, dias):
    if cultura == "SOJA":
        return "PRECOCE" if dias <= 110 else ("MEDIA" if dias <= 125 else "TARDIA")
    if cultura == "ALGODAO":
        return "PRECOCE" if dias <= 185 else ("MEDIA" if dias <= 200 else "TARDIA")
    return "PADRAO"
