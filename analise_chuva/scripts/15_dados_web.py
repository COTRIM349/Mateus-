# -*- coding: utf-8 -*-
"""Exporta o payload JSON usado pelo relatorio."""
import pandas as pd, numpy as np, json, re
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
INI, FIM = pd.Timestamp("2025-12-02"), pd.Timestamp("2026-03-19")
CAL = pd.date_range(INI, FIM)

API = pd.read_csv(S/"serie_diaria_api.csv", parse_dates=["data"])
alg = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio"]); alg["fazenda"]=alg.fazenda.str.strip()
C   = pd.read_csv(S/"cenarios_por_talhao.csv", parse_dates=["plantio","A_H1","B_H1","D_H1","A_H2","B_H2","D_H2"])
prod= pd.read_csv(S/"produtividade_algodao.csv", parse_dates=["plantio"])
sec = pd.read_csv(S/"calib_residual.csv", index_col=0)

pay = {}
# 1) calendario diario
cal = []
for faz in ["KRT","RDM"]:
    g = API[(API.fazenda==faz)&(API.data>=INI)&(API.data<=FIM)].set_index("data")
    pl = alg[alg.fazenda==faz].groupby("plantio").area_ha.sum()
    cal.append(dict(fazenda=faz, dias=[dict(
        d=d.strftime("%d/%m"), iso=d.strftime("%Y-%m-%d"), mm=round(float(g.mm[d]),1),
        api=round(float(g.api[d]),1),
        st=("direto" if g.bloq_direto[d] else "residual" if g.bloq_residual[d] else "ok"),
        ha=float(pl.get(d,0))) for d in CAL]))
pay["calendario"] = cal

# 2) avanco acumulado
def curva(col, df):
    s = df.groupby(col).area_ha.sum().sort_index().cumsum()
    idx = pd.date_range(min(s.index.min(), INI), max(s.index.max(), FIM))
    s = s.reindex(idx).ffill().fillna(0)
    return [dict(iso=d.strftime("%Y-%m-%d"), ha=round(float(v))) for d, v in s.items()]
pay["avanco"] = {"observado": curva("plantio", C), "B_H1": curva("B_H1", C),
                 "B_H2": curva("B_H2", C), "D_H2": curva("D_H2", C)}

# 3) calibracao residual
pay["residual"] = [dict(lab=str(i), p=float(r.p_operar), n=int(r.dias),
                        lo=float(r.ic_lo), hi=float(r.ic_hi)) for i, r in sec.iterrows()]
# 4) produtividade
pay["prod"] = [dict(pivo=r.pivo_id, faz=r.fazenda, iso=r.plantio.strftime("%Y-%m-%d"),
                    dia=int(r.dia), ar=round(float(r.arrobas_ha),1), area=float(r.area_ha),
                    var=r.variedades) for _, r in prod.iterrows()]
# 5) cenarios
pay["cenarios"] = pd.read_csv(S/"cenarios_resumo.csv").to_dict("records")
# 6) decomposicao
dec = pd.read_csv(S/"decomposicao_dias.csv")
pay["decomp"] = (dec.groupby(["fazenda","classe"]).size().rename("dias").reset_index()
                 .to_dict("records"))
(S/"payload.json").write_text(json.dumps(pay, ensure_ascii=False))
print("payload:", len(json.dumps(pay))/1024, "KB")
print("chaves:", list(pay))
print("avanco observado final:", pay["avanco"]["observado"][-1])
print("residual:", pay["residual"])
