# -*- coding: utf-8 -*-
"""Parametros de configuracao do modelo hidrico da RDM (base REV10 / rotacao v.21).

Tudo que nao veio dos arquivos oficiais mora aqui, com a origem declarada. Cada
valor vira celula editavel na planilha - nada escrito escondido em formula.
"""

# ---------------------------------------------------------------- horizonte
SEMANA_1_SEGUNDA = "2026-08-31"   # segunda-feira da semana que contem 01/09/2026
N_SEMANAS = 66                    # cobre ate ~06/12/2027 (ultimo milho semente da rotacao)
SAFRA = "2026/2027 - RDM"

# ----------------------------------------------- overrides de rotacao do usuario
# Culturas a remover de talhoes especificos (instrucao explicita do usuario):
# PV 121 e 124 = soja -> algodao, sem o milho semente que o arquivo traz sobreposto.
DROP_CULTURA_POR_TALHAO = {"121": ["MILHO_SEMENTE"], "124": ["MILHO_SEMENTE"]}

# ------------------------------------------------------- parametros gerais
PARAMETROS = [
    ("HORAS_OPERACAO_DIA", "Horas de operacao disponiveis por dia", 21, "h/dia",
     "Turno de rega do arquivo oficial RDM (Dashboard = 21 h)", True),
    ("HORAS_OPERACAO_SEMANA", "Horas de operacao disponiveis por semana", None, "h/semana",
     "Calculado: HORAS_OPERACAO_DIA x DIAS_POR_SEMANA", False),
    ("DIAS_POR_SEMANA", "Dias por semana", 7, "dias", "Definicao do modelo", True),
    ("HORAS_CAPTACAO_DIA", "Turno de captacao dos pocos", 18, "h/dia",
     "Base do volume de captacao do arquivo oficial (volume/dia = vazao x 18 h)", True),
    ("MM_PARA_M3_HA", "Conversao lamina -> volume", 10, "m3/(mm.ha)",
     "1 mm em 1 ha = 10 m3", False),
    ("EFICIENCIA_PADRAO", "Eficiencia de aplicacao padrao", 0.85, "fracao",
     "DADO PENDENTE - nao consta nos arquivos oficiais. Valor provisorio.", True),
    ("FATOR_CHUVA_UTIL", "Fator de aproveitamento da chuva", 0.80, "fracao",
     "DADO PENDENTE - definir com base no historico da fazenda.", True),
    ("LIMITE_CHUVA_UTIL_DIA", "Limite diario de chuva util", 25, "mm/dia",
     "DADO PENDENTE - teto de infiltracao/armazenamento. Valor provisorio.", True),
    ("CENARIO_CLIMA", "Cenario climatico ativo", "REFERENCIA", "texto",
     "REFERENCIA = climatologia regional | USUARIO = colunas preenchidas pelo usuario", True),
    ("LIMITE_CONFORTAVEL", "Limite superior da faixa CONFORTAVEL", 0.80, "fracao",
     "Faixa editavel de classificacao", True),
    ("LIMITE_ATENCAO", "Limite superior da faixa ATENCAO", 0.90, "fracao",
     "Faixa editavel de classificacao", True),
    ("LIMITE_CRITICO", "Limite superior da faixa CRITICO", 1.00, "fracao",
     "Acima deste valor: INVIAVEL em 21 h/dia", True),
]

# ----------------------------------- climatologia de referencia do Oeste da Bahia
# Cerrado, ~12S, regiao Barreiras/LEM. SUBSTITUIR pela serie da estacao da fazenda.
ETO_REF_MM_DIA = {1: 4.8, 2: 4.7, 3: 4.6, 4: 4.5, 5: 4.2, 6: 4.0,
                  7: 4.3, 8: 5.2, 9: 5.8, 10: 5.6, 11: 4.9, 12: 4.7}
CHUVA_REF_MM_MES = {1: 200, 2: 160, 3: 165, 4: 70, 5: 15, 6: 5,
                    7: 3, 8: 5, 9: 30, 10: 120, 11: 200, 12: 215}
FONTE_CLIMA = ("Climatologia de referencia - Oeste da Bahia (Cerrado, ~12S, regiao "
               "Barreiras/LEM). SUBSTITUIR pela serie da estacao da fazenda quando disponivel.")

# --------------------------------------------------- curvas de Kc (FAO-56)
# chave, cultura, grupo, dur_ref, f_ini, f_dev, f_mid, f_end, Kc_ini, Kc_mid, Kc_end
CURVAS_KC = [
    ("SOJA|PRECOCE",         "SOJA",           "PRECOCE", 108, 0.18, 0.24, 0.40, 0.18, 0.40, 1.15, 0.50),
    ("SOJA|MEDIA",           "SOJA",           "MEDIA",   120, 0.16, 0.23, 0.42, 0.19, 0.40, 1.15, 0.50),
    ("SOJA|TARDIA",          "SOJA",           "TARDIA",  135, 0.15, 0.22, 0.44, 0.19, 0.40, 1.15, 0.50),
    ("ALGODAO|PRECOCE",      "ALGODAO",        "PRECOCE", 180, 0.17, 0.27, 0.31, 0.25, 0.35, 1.15, 0.60),
    ("ALGODAO|MEDIA",        "ALGODAO",        "MEDIA",   195, 0.15, 0.26, 0.31, 0.28, 0.35, 1.15, 0.60),
    ("ALGODAO|TARDIA",       "ALGODAO",        "TARDIA",  210, 0.14, 0.24, 0.33, 0.29, 0.35, 1.15, 0.60),
    ("MILHO_SEMENTE|PADRAO", "MILHO_SEMENTE",  "PADRAO",  160, 0.19, 0.25, 0.31, 0.25, 0.30, 1.15, 0.60),
    ("MILHO_GRAO|PADRAO",    "MILHO_GRAO",     "PADRAO",  160, 0.19, 0.25, 0.31, 0.25, 0.30, 1.20, 0.60),
    ("TABACO|PADRAO",        "TABACO",         "PADRAO",  160, 0.18, 0.27, 0.27, 0.28, 0.35, 1.10, 0.80),
    ("GERGELIM|PADRAO",      "GERGELIM",       "PADRAO",  110, 0.18, 0.27, 0.37, 0.18, 0.35, 1.10, 0.25),
    ("FEIJAO|PADRAO",        "FEIJAO",         "PADRAO",   95, 0.21, 0.32, 0.31, 0.16, 0.40, 1.15, 0.35),
    ("SORGO|PADRAO",         "SORGO",          "PADRAO",  130, 0.15, 0.27, 0.31, 0.27, 0.30, 1.10, 0.55),
    ("MILHETO|PADRAO",       "MILHETO",        "PADRAO",   90, 0.17, 0.28, 0.33, 0.22, 0.30, 1.00, 0.30),
    ("CROTALARIA|PADRAO",    "CROTALARIA",     "PADRAO",   90, 0.17, 0.28, 0.33, 0.22, 0.30, 1.00, 0.45),
    ("BRACHIARIA|PADRAO",    "BRACHIARIA",     "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 0.55, 0.95, 0.80),
    ("MIX COBERTURA|PADRAO", "MIX COBERTURA",  "PADRAO",   90, 0.17, 0.28, 0.33, 0.22, 0.30, 1.00, 0.45),
    ("CACAU|PADRAO",         "CACAU",          "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 1.00, 1.05, 1.05),
    ("EUCALIPTO|PADRAO",     "EUCALIPTO",      "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 0.80, 1.00, 1.00),
    ("MYAGUI|PADRAO",        "MYAGUI",         "PADRAO",  365, 0.10, 0.15, 0.60, 0.15, 0.55, 0.95, 0.80),
    ("CARINATA|PADRAO",      "CARINATA",       "PADRAO",  120, 0.17, 0.25, 0.35, 0.23, 0.35, 1.10, 0.35),
    ("FEIJAO CAUPI|PADRAO",  "FEIJAO CAUPI",   "PADRAO",  100, 0.20, 0.30, 0.30, 0.20, 0.40, 1.05, 0.35),
    ("FEIJAO MUNGO|PADRAO",  "FEIJAO MUNGO",   "PADRAO",   95, 0.21, 0.32, 0.31, 0.16, 0.40, 1.05, 0.35),
    ("MILHO PESQUISA|PADRAO", "MILHO PESQUISA", "PADRAO", 160, 0.19, 0.25, 0.31, 0.25, 0.30, 1.20, 0.60),
]
FONTE_KC = "FAO-56 (Irrigation and Drainage Paper 56), Tabelas 11 e 12 - valores de partida, editaveis"

DURACAO_REF = {"ALGODAO": 195, "SOJA": 116, "TABACO": 160, "MILHO_SEMENTE": 160,
               "MILHO_GRAO": 160, "GERGELIM": 110, "MILHETO": 90, "FEIJAO": 95}


def grupo_por_duracao(cultura, dias):
    if cultura == "SOJA":
        return "PRECOCE" if dias <= 110 else ("MEDIA" if dias <= 125 else "TARDIA")
    if cultura == "ALGODAO":
        return "PRECOCE" if dias <= 185 else ("MEDIA" if dias <= 200 else "TARDIA")
    return "PADRAO"
