# -*- coding: utf-8 -*-
"""Preenche a aba Planejamento_Irrigacao do arquivo RDM (REV10) com a rotacao
pedida, SEM usar openpyxl para salvar (que destruiria graficos/VBA/modelo).

Edita apenas xl/worksheets/sheet1.xml dentro do zip, trocando o indice de
shared-string das celulas de Cultura dos pivos alvo; todas as demais partes do
arquivo sao copiadas byte a byte.

Uso: python3 -I preencher_planejamento.py <entrada.xlsm> <saida.xlsm>
"""
import re
import shutil
import sys
import zipfile
from datetime import datetime, timedelta

import openpyxl
from openpyxl.utils import get_column_letter as gcl

# indices de shared-string (ja existentes no arquivo)
SI = {"PREPARO": 46, "SOJA": 47, "PLANTIO": 48, "ALGODAO": 49,
      "COLHIDO": 50, "VAZIO": 51, "COLHEITA": 52, "MILHO_SEMENTE": 74, "MILHO_GRAO": 84}

ENTRADA, SAIDA = sys.argv[1], sys.argv[2]

# ----- geometria lida via openpyxl (apenas leitura; salvar seria destrutivo)
wb = openpyxl.load_workbook(ENTRADA, read_only=True, data_only=True)
ws = wb["Planejamento_Irrigacao"]
rows = list(ws.iter_rows(min_row=1, max_row=535, max_col=205, values_only=True))
date_rows = [i for i, r in enumerate(rows, 1) if r[2] is None and isinstance(r[5], datetime)]
cult_rows = {}
for i, r in enumerate(rows, 1):
    if r[2] == "Cultura":
        cult_rows.setdefault(r[1], []).append(i)


def drow_for(cr):
    return max(d for d in date_rows if d < cr)


def celulas_por_data(pid):
    """{data_segunda: (ref_celula, col_idx)} para o pivo."""
    out = {}
    for cr in cult_rows[pid]:
        dr = drow_for(cr)
        for m in range(18):
            col = 6 + 10 * m
            d = rows[dr - 1][col - 1]
            if isinstance(d, datetime):
                out[d.date()] = "%s%d" % (gcl(col), cr)
    return out


# mesma data -> indice SI atual do pivo 113 (para espelhar no 112)
def indices_atuais(pid):
    out = {}
    for cr in cult_rows[pid]:
        dr = drow_for(cr)
        for m in range(18):
            col = 6 + 10 * m
            d = rows[dr - 1][col - 1]
            lab = rows[cr - 1][col - 1]
            if isinstance(d, datetime):
                out[d.date()] = lab
    return out


LABEL2SI = {"🚜 PREPARO SOLO": 46, "🌱 SOJA": 47, "🚜 PLANTIO": 48, "🌱 ALGODÃO": 49,
            "🚜 COLHIDO": 50, "📅 VAZIO SANITARIO": 51, "🚜 COLHEITA": 52, "🌱 MILHO SEMENTE": 74}


def plano(legs, mondays):
    """Convencao limpa: VAZIO default; 2 semanas de PREPARO antes do plantio;
    PLANTIO na semana do plantio; cultura ate a colheita; COLHEITA na semana da
    colheita; 2 semanas de COLHIDO depois."""
    mondays = sorted(mondays)

    def week_of(d):
        cand = [mo for mo in mondays if mo <= d]
        return max(cand) if cand else mondays[0]

    lab = {mo: SI["VAZIO"] for mo in mondays}
    for crop_si, p, h in legs:
        pw, hw = week_of(p), week_of(h)
        for mo in mondays:
            if pw < mo < hw:
                lab[mo] = crop_si
        lab[pw] = SI["PLANTIO"]
        lab[hw] = SI["COLHEITA"]
        for k in (1, 2):                        # PREPARO antes do plantio
            d = pw - timedelta(days=7 * k)
            if d in lab and lab[d] == SI["VAZIO"]:
                lab[d] = SI["PREPARO"]
        for k in (1, 2):                        # COLHIDO depois da colheita
            d = hw + timedelta(days=7 * k)
            if d in lab and lab[d] == SI["VAZIO"]:
                lab[d] = SI["COLHIDO"]
    return lab


# ----- alvos: ref_celula -> novo indice SI
alvos = {}

# PV112 espelha PV113 (mesmo plano soja -> milho semente)
cel112 = celulas_por_data(112)
lab113 = indices_atuais(113)
for d, ref in cel112.items():
    if d in lab113 and lab113[d] in LABEL2SI:
        alvos[ref] = LABEL2SI[lab113[d]]

# PV125/131/132: algodao -> milho semente (datas da rotacao)
LEGS = {
    125: [(SI["ALGODAO"], datetime(2026, 12, 1).date(), datetime(2027, 6, 14).date()),
          (SI["MILHO_SEMENTE"], datetime(2027, 6, 24).date(), datetime(2027, 11, 16).date())],
    131: [(SI["ALGODAO"], datetime(2026, 12, 1).date(), datetime(2027, 6, 29).date()),
          (SI["MILHO_SEMENTE"], datetime(2027, 7, 2).date(), datetime(2027, 11, 24).date())],
    132: [(SI["ALGODAO"], datetime(2026, 12, 1).date(), datetime(2027, 6, 29).date()),
          (SI["MILHO_SEMENTE"], datetime(2027, 6, 28).date(), datetime(2027, 11, 20).date())],
}
for pid, legs in LEGS.items():
    cel = celulas_por_data(pid)
    lab = plano(legs, cel.keys())
    for d, ref in cel.items():
        alvos[ref] = lab[d]

# PV126: milho grao APOS o tabaco - preenche so a janela vaga (jul/2027 -> jan/2028),
# sem tocar nos ciclos de tabaco ja existentes no arquivo.
from datetime import date as _date
cel126 = celulas_por_data(126)
_jan_ini, _jan_fim = _date(2027, 7, 12), _date(2028, 1, 3)
_mondays_126 = [d for d in cel126 if _jan_ini <= d <= _jan_fim]
_lab126 = plano([(SI["MILHO_GRAO"], _date(2027, 7, 19), _date(2027, 12, 20))], _mondays_126)
for d in _mondays_126:
    alvos[cel126[d]] = _lab126[d]

print("celulas a alterar:", len(alvos))

# ----- edicao cirurgica do sheet1.xml
zin = zipfile.ZipFile(ENTRADA)
sheet = zin.read("xl/worksheets/sheet1.xml").decode("utf-8")


def set_cell(xml, ref, si):
    # casa a celula <c r="REF" ...> self-closing ou com conteudo
    pat = re.compile(r'<c r="%s"((?: [a-zA-Z]+="[^"]*")*)\s*(/>|>.*?</c>)' % re.escape(ref), re.S)
    mm = pat.search(xml)
    if not mm:
        raise RuntimeError("celula nao encontrada: " + ref)
    attrs = mm.group(1)
    s_attr = re.search(r' s="\d+"', attrs)
    s_attr = s_attr.group(0) if s_attr else ""
    novo = '<c r="%s"%s t="s"><v>%d</v></c>' % (ref, s_attr, si)
    return xml[:mm.start()] + novo + xml[mm.end():]


faltando = []
for ref, si in alvos.items():
    try:
        sheet = set_cell(sheet, ref, si)
    except RuntimeError:
        faltando.append(ref)
if faltando:
    print("AVISO: celulas nao encontradas (%d):" % len(faltando), faltando[:10])

# ----- repackage: copia tudo, troca so o sheet1.xml
shutil.copy(ENTRADA, SAIDA)  # nao; recriar zip preservando ordem
import os
os.remove(SAIDA)
with zipfile.ZipFile(ENTRADA) as zsrc, \
     zipfile.ZipFile(SAIDA, "w", zipfile.ZIP_DEFLATED) as zdst:
    for item in zsrc.infolist():
        data = zsrc.read(item.filename)
        if item.filename == "xl/worksheets/sheet1.xml":
            data = sheet.encode("utf-8")
        # preserva o tipo de compressao original de cada item
        zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
        zi.compress_type = item.compress_type
        zi.external_attr = item.external_attr
        zi.internal_attr = item.internal_attr
        zi.create_system = item.create_system
        zdst.writestr(zi, data)
print("salvo:", SAIDA)
