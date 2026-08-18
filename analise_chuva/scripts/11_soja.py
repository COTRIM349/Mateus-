# -*- coding: utf-8 -*-
"""Etapa 1 da sucessao: a semeadura da soja foi limitada por chuva/maquina ou escalonada?"""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
R_CAL, LIM = 2, 5.0
medf = pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
soja["ciclo"] = (soja.colheita-soja.plantio).dt.days

for faz, g in soja.groupby("fazenda"):
    ini, fim = g.plantio.min(), g.plantio.max()
    cal = pd.date_range(ini, fim)
    s = medf[medf.fazenda==faz].set_index("data").mm_fazenda.reindex(cal).fillna(0)
    d = s > LIM; r = pd.Series(False, index=cal)
    for k in range(1,R_CAL+1): r |= d.shift(k).fillna(False)
    ok = ~(d | (r & ~d))
    dia = g.groupby("plantio").area_ha.sum()
    cap = dia.quantile(.90)
    print("="*80); print(f"SOJA — {faz}")
    print(f"  janela de plantio: {ini.date()} a {fim.date()} ({len(cal)} dias) | {g.area_ha.sum():.0f} ha")
    print(f"  dias >5mm: {int(d.sum())} | residuais: {int((r&~d).sum())} | "
          f"BLOQUEADOS {int((~ok).sum())}/{len(cal)} ({(~ok).mean():.0%}) | agricultaveis {int(ok.sum())}")
    print(f"  capacidade (p90 ha/dia): {cap:.0f} | dias de maquina necessarios: "
          f"{g.area_ha.sum()/cap:.0f} | dias com plantio registrado: {len(dia)}")
    print(f"  plantou em dia bloqueado: {dia[[x for x in dia.index if not ok[x]]].sum():.0f} ha "
          f"de {g.area_ha.sum():.0f}")
    # fila sem chuva, capacidade observada, comecando na 1a data real
    rest, fimp = dict(zip(g.pivo_id, g.area_ha)), {}
    ordem = g.sort_values("plantio").pivo_id.tolist()
    for dd in pd.date_range(ini, ini+pd.Timedelta(days=200)):
        livre = cap
        for p in ordem:
            if rest[p] <= 0 or livre <= 0: continue
            u = min(livre, rest[p]); rest[p]-=u; livre-=u
            if rest[p] <= 1e-9: fimp[p]=dd
        if all(v<=1e-9 for v in rest.values()): break
    fimp = pd.Series(fimp)
    at = (g.set_index("pivo_id").plantio - fimp).dt.days
    print(f"  ATRASO vs fila sem restricao (so capacidade): mediana {at.median():.0f} d | "
          f"media {at.mean():.0f} d | max {at.max():.0f} d | ha-dia {(at*g.set_index('pivo_id').area_ha).sum():,.0f}")
    print(f"  => a fila sem restricao terminaria em {fimp.max().date()}, o real terminou em {fim.date()}:")
    print(f"     {(fim-fimp.max()).days} dias de escalonamento DELIBERADO, nao explicados por chuva")
    print(f"     (so {int((~ok).sum())} dias bloqueados, e sobravam {int(ok.sum())-len(dia)} dias agricultaveis ociosos)")
