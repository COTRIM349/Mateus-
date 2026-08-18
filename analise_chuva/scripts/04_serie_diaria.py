# -*- coding: utf-8 -*-
"""Constroi a serie diaria COMPLETA (dias ausentes = 0 mm, conforme validado na auditoria)
e a base operacional (soja + algodao) usada em toda a analise."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D = BASE/"dados"
FALHA = ["KRT-004B", "KRT-006B"]

ch = pd.read_csv(D/"chuva_pivo_auditada.csv", parse_dates=["data"])
ch = ch[(~ch.pluvio_id.isin(FALHA)) & (ch.tipo == "pivo")]

# grade completa de dias: uma linha por data (colunas de cada fazenda so no periodo dela)
blocos = {}
for faz, g in ch.groupby("fazenda"):
    idx = pd.date_range(g.data.min(), g.data.max(), freq="D")
    w = g.pivot_table(index="data", columns="pluvio_id", values="mm").reindex(idx).fillna(0.0)
    w.index.name = "data"
    blocos[faz] = w
uni = sorted(set().union(*[set(w.index) for w in blocos.values()]))
wide = pd.concat([w.reindex(uni) for w in blocos.values()], axis=1)   # colunas lado a lado
wide.index.name = "data"
assert not wide.index.duplicated().any()
wide.to_csv(D/"chuva_diaria_wide.csv")

lg = (wide.stack().rename("mm").reset_index()
        .rename(columns={"level_1": "pluvio_id"}).dropna(subset=["mm"]))
lg["fazenda"] = lg.pluvio_id.str[:3]
lg.to_csv(D/"chuva_diaria_long.csv", index=False)

med = lg.groupby(["fazenda", "data"], as_index=False).mm.median().rename(columns={"mm": "mm_fazenda"})
med.to_csv(D/"chuva_diaria_fazenda.csv", index=False)

print("grade completa:", wide.shape, "| pluviometros:", lg.pluvio_id.nunique())
for faz, g in med.groupby("fazenda"):
    print(f"  {faz}: {g.data.min().date()} a {g.data.max().date()} | {len(g)} dias | "
          f"acum mediano {g.mm_fazenda.sum():.0f} mm | dias >5mm: {(g.mm_fazenda>5).sum()}")

# ---- janela de plantio do algodao
alg = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
print("\nALGODAO: janela", alg.plantio.min().date(), "a", alg.plantio.max().date(),
      "|", len(alg), "eventos |", alg.area_ha.sum(), "ha")
dia = alg.groupby(["fazenda","plantio"], as_index=False).area_ha.sum()
print("  ha/dia observado: max", dia.area_ha.max(), "| media nos dias com plantio",
      round(dia.area_ha.mean(),1), "| dias com plantio:", alg.plantio.nunique())
tot = alg.groupby("plantio", as_index=False).area_ha.sum()
print("  ha/dia agregando as 2 fazendas: max", tot.area_ha.max(), "| p90",
      round(tot.area_ha.quantile(.9),1))
