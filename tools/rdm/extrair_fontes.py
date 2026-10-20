# -*- coding: utf-8 -*-
"""Extrai o dataset canonico da RDM a partir dos arquivos oficiais (REV10 / v.21).

Fontes:
  1) STC_RDM ... REV10.xlsm  -> hidraulica (casas, pivos, areas, pocos, reservacao,
     captacao diaria, topologia de reserva compartilhada entre casas)
  2) ROTACAO DE CULTURAS BIENAL 26-28 v.21.xlsx -> rotacao agricola da RDM, fundindo
     a aba 'Rotacao' (ciclos 26/27) com 'Rotacao Milho semente' (milho semente 27).

Uso: python3 -I extrair_fontes.py <RDM.xlsm> <ROTACAO.xlsx> <saida.json>
Saida consumida por construir_planilha.py.
"""
import json
import sys
import unicodedata
from datetime import datetime

import openpyxl


def norm(s):
    if s is None:
        return ""
    s = "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")
    return s.strip().upper()


def d(x):
    return x.strftime("%Y-%m-%d") if isinstance(x, datetime) else None


# ------------------------------------------------------------------ hidraulica
def extrair_hidraulica(caminho):
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    ws = wb["Parametros"] if "Parametros" in wb.sheetnames else wb["Parâmetros"]

    pivos, reservacao = [], {}
    for r in ws.iter_rows(min_row=6, max_row=60, max_col=6, values_only=True):
        casa, pivo, area = r[0], r[1], r[2]
        if not casa or norm(casa) == "TOTAL" or pivo is None:
            continue
        casa = str(casa).strip()
        pivos.append({"pivo": "PV %s" % str(int(pivo)).strip(), "casa": casa, "area_ha": float(area)})
        for chave, val in (("reservatorio_m3", r[3]), ("canal_m3", r[4]), ("capacidade_total_m3", r[5])):
            if isinstance(val, (int, float)):
                reservacao.setdefault(casa, {})[chave] = float(val)

    # pocos de captacao (col 11 nome, 13 vazao)
    pocos = []
    for r in ws.iter_rows(min_row=6, max_row=60, min_col=11, max_col=13, values_only=True):
        if r[0] and str(r[0]).strip().upper().startswith("PRM"):
            pocos.append({"poco": str(r[0]).strip(),
                          "id": (str(r[1]).strip() if r[1] else None),
                          "vazao_m3h": float(r[2]) if isinstance(r[2], (int, float)) else None})

    # topologia de reserva: casa (15) recebe volume de (16); grupo_pivot (18) <- poco contribuinte (19)
    topologia = []
    for r in ws.iter_rows(min_row=6, max_row=60, min_col=15, max_col=19, values_only=True):
        if r[0] or r[3]:
            topologia.append({"casa": (str(r[0]).strip() if r[0] else None),
                              "recebe_de": (str(r[1]).strip() if r[1] else None),
                              "grupo_pivot": (str(r[3]).strip() if r[3] else None),
                              "poco_contribuinte": (str(r[4]).strip() if r[4] else None)})

    # Dashboard: blocos de 19 linhas; capta/dia (C11), capacidade reservatorio (J14), turno rega (C13)
    dsh = wb["Dashboard"]
    L = {i: r for i, r in enumerate(dsh.iter_rows(min_row=1, max_row=200, max_col=12, values_only=True), 1)}
    casas = []
    k = 0
    while True:
        o = k * 19
        base = 2 + o
        if base not in L or not (isinstance(L[base][1], str) and L[base][1].strip().startswith("RM")):
            break
        casa = L[base][1].strip()
        casas.append({
            "casa": casa,
            "volume_captacao_m3_dia": float(L[11 + o][2] or 0),
            "turno_rega_h": float(L[13 + o][2] or 0),
            "capacidade_total_m3": float(L[14 + o][9] or 0),
        })
        k += 1

    # lamina nominal por pivo = maior lamina/dia registrada em data_Base.
    # A chave RMxx_PV_yyy (linha 2) se repete em tres blocos (lamina, cultura, irrigacao);
    # so o bloco de LAMINA tem o cabecalho 'Lamina (mm/dia)' na linha 3. Restringe a ele
    # para nao sobrescrever com o flag de irrigacao (0/1).
    base = wb["data_Base"]
    chaves = list(base.iter_rows(min_row=2, max_row=2, min_col=1, max_col=260, values_only=True))[0]
    h3 = list(base.iter_rows(min_row=3, max_row=3, min_col=1, max_col=260, values_only=True))[0]
    bloco = list(base.iter_rows(min_row=4, max_row=583, min_col=1, max_col=260, values_only=True))
    lamina = {}
    for j, h in enumerate(chaves):
        if not h or "PV_" not in str(h):
            continue
        if not (h3[j] and "MINA" in norm(h3[j])):   # so o bloco de lamina (mm/dia)
            continue
        vals = [row[j] for row in bloco if isinstance(row[j], (int, float)) and row[j] > 0]
        if vals:
            lamina["PV %s" % str(h).split("PV_")[1].strip()] = {
                "lamina_max_mm_dia": max(vals),
                "lamina_media_mm_dia": round(sum(vals) / len(vals), 2),
                "dias_com_lamina": len(vals)}
    for p in pivos:
        p.update(lamina.get(p["pivo"], {}))
    wb.close()
    return {"pivos": pivos, "casas": casas, "pocos": pocos, "reservacao": reservacao,
            "topologia_reserva": topologia}


# -------------------------------------------------------------------- rotacao
def _linhas_rdm(ws, min_row):
    """Gera (talhao, area, [ (occ,var,ini,fim), ... ]) por pivo RDM irrigado.
    Layout v.21: FAZENDA=col3, Talhao=4, Tipo=5, Area=6, antOcc=7..antFim=9,
    C1 occ=10 var=11 ini=12 fim=13, C2 14-17, C3 18-21."""
    for r in ws.iter_rows(min_row=min_row, max_row=220, max_col=21, values_only=True):
        if norm(r[2]) != "RDM" or norm(r[4]) != "IRRIGADO":
            continue
        talhao = str(r[3]).strip() if r[3] is not None else ""
        if not talhao.replace(".0", "").isdigit():
            continue
        yield r


def extrair_rotacao(caminho):
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    ws = wb["Rotação"]
    ciclos = []

    def add(talhao, area, ordem, rotulo, occ, var, ini, fim):
        if not (occ or ini or fim):
            return
        ciclos.append({"talhao": talhao, "pivo": "PV %s" % talhao, "area_rotacao_ha": area,
                       "ordem": ordem, "rotulo": rotulo,
                       "cultura": (str(occ).strip() if occ else None),
                       "cultivar": (str(var).strip() if var else None),
                       "plantio": d(ini), "fim": d(fim)})

    for r in _linhas_rdm(ws, 10):
        talhao = str(int(float(r[3])))
        area = r[5]
        add(talhao, area, "C0", "ANTERIOR", r[6], r[7], None, r[8])
        add(talhao, area, "C1", "CICLO 1", r[9], r[10], r[11], r[12])
        add(talhao, area, "C2", "CICLO 2", r[13], r[14], r[15], r[16])
        add(talhao, area, "C3", "CICLO 3", r[17], r[18], r[19], r[20])

    # aba Milho semente: occ=7 var=8 ini=9 fim=10 (ocupacao principal do pivo na safra 27)
    wm = wb["Rotação Milho semente"]
    for r in _linhas_rdm(wm, 10):
        talhao = str(int(float(r[3])))
        occ = r[6]
        if occ and "MILHO" in norm(occ):
            add(talhao, r[5], "MS", "MILHO SEMENTE", occ, r[7], r[8], r[9])

    # duracao de ciclo por cultivar (aba de validacao)
    v = wb["Base de dados validação"]
    cultivares = []
    for r in v.iter_rows(min_row=4, max_row=40, max_col=28, values_only=True):
        if r[1]:
            cultivares.append({"cultura": "SOJA", "cultivar": str(r[1]).strip(),
                               "grm": r[2], "duracao_dias": r[3]})
        if r[4]:
            cultivares.append({"cultura": "ALGODAO", "cultivar": str(r[4]).strip(),
                               "grm": (str(r[5]).strip() if r[5] else None), "duracao_dias": r[6]})
        if len(r) > 14 and r[12]:
            cultivares.append({"cultura": "MILHO_GRAO", "cultivar": str(r[12]).strip(),
                               "grm": (str(r[13]).strip() if r[13] else None), "duracao_dias": r[14]})
    wb.close()
    return {"ciclos": ciclos, "cultivares": cultivares}


if __name__ == "__main__":
    hid = extrair_hidraulica(sys.argv[1])
    rot = extrair_rotacao(sys.argv[2])
    dados = dict(hid, **rot)
    with open(sys.argv[3], "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, indent=1)
    print("pivos=%d casas=%d pocos=%d ciclos=%d cultivares=%d topologia=%d"
          % (len(dados["pivos"]), len(dados["casas"]), len(dados["pocos"]),
             len(dados["ciclos"]), len(dados["cultivares"]), len(dados["topologia_reserva"])))
