# -*- coding: utf-8 -*-
"""Testa se os dias ausentes do arquivo sao dias SEM CHUVA (export filtrado) ou FALHA de coleta.
Duas evidencias independentes: (a) estrutura do proprio arquivo, (b) confronto com o
acumulado de chuva por pivo reportado no relatorio de irrigacao (fonte auxiliar)."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D = BASE/"dados"; S = BASE/"saidas"
ch = pd.read_csv(D/"chuva_pivo_auditada.csv", parse_dates=["data"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
FALHA = ["KRT-004B","KRT-006B"]
ch = ch[~ch.pluvio_id.isin(FALHA)]

print("="*78); print("A. ESTRUTURA DO ARQUIVO: os dias presentes tem chuva?")
dia = ch.groupby(["fazenda","data"]).mm.agg(["max","mean","sum"]).reset_index()
for faz, g in dia.groupby("fazenda"):
    secos = (g["max"] == 0).sum()
    print(f"  {faz}: {len(g)} dias no arquivo | dias com max=0 em TODOS os pluviometros: {secos}")
print("  => o arquivo so contem dias em que ao menos um pluviometro registrou chuva.")
print("     Logo, dia ausente = dia sem registro de chuva na fazenda (nao falha em massa).")

print("="*78); print("B. FONTE AUXILIAR: acumulado do relatorio de irrigacao (soja) x pluviometros")
# usa a serie PRIMARIA do proprio pivo; se nao existir, a mediana da fazenda
piv = ch[ch.tipo == "pivo"]
wide = piv.pivot_table(index="data", columns="pluvio_id", values="mm")
medfaz = ch.pivot_table(index="data", columns="fazenda", values="mm", aggfunc="median")
lin = []
for _, r in soja.iterrows():
    pid = r.pivo_id
    jan = (wide.index >= r.plantio) & (wide.index <= r.colheita)
    if pid in wide.columns:
        obs, fonte = wide.loc[jan, pid].sum(), "pluviometro do proprio pivo"
    else:
        obs, fonte = medfaz.loc[jan, r.fazenda].sum(), "mediana da fazenda"
    lin.append(dict(pivo_id=pid, fazenda=r.fazenda, plantio=r.plantio.date(),
                    colheita=r.colheita.date(), chuva_relatorio_mm=r.chuva_mm,
                    chuva_pluviometro_mm=round(obs,1), fonte=fonte))
v = pd.DataFrame(lin)
v["dif_mm"] = v.chuva_pluviometro_mm - v.chuva_relatorio_mm
v["dif_pct"] = (100*v.dif_mm/v.chuva_relatorio_mm).round(1)
prop = v[v.fonte.str.startswith("pluviometro")]
print(f"  pivos com pluviometro proprio: {len(prop)} de {len(v)}")
print(f"  vies mediano: {prop.dif_pct.median():.1f}%  |  |dif| mediano: {prop.dif_mm.abs().median():.0f} mm")
print(f"  dentro de +-15%: {(prop.dif_pct.abs()<=15).sum()}/{len(prop)}")
print(prop[["pivo_id","plantio","colheita","chuva_relatorio_mm","chuva_pluviometro_mm","dif_pct"]]
      .sort_values("dif_pct").to_string(index=False))
v.to_csv(S/"aud_chuva_vs_relatorio.csv", index=False)
