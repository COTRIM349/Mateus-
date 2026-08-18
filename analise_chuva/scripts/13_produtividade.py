# -*- coding: utf-8 -*-
"""Produtividade do algodao x epoca de plantio, com os controles disponiveis."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
alg = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio"])
alg["fazenda"] = alg.fazenda.str.strip()
a = alg[alg.arrobas_ha.notna()].copy()
a["dia"] = (a.plantio - pd.Timestamp("2025-12-01")).dt.days
rng = np.random.default_rng(3)

print("="*80); print("COBERTURA DA AMOSTRA DE PRODUTIVIDADE")
print(f"  {len(a)} de {len(alg)} eventos | {a.area_ha.sum():.0f} de {alg.area_ha.sum():.0f} ha "
      f"({a.area_ha.sum()/alg.area_ha.sum():.0%}) | plantios de {a.plantio.min().date()} a {a.plantio.max().date()}")
print(f"  area SEM produtividade: {alg.area_ha.sum()-a.area_ha.sum():.0f} ha, plantada entre "
      f"{alg[alg.arrobas_ha.isna()].plantio.min().date()} e {alg[alg.arrobas_ha.isna()].plantio.max().date()}")
print(f"  => a amostra cobre apenas 40 dos 108 dias da campanha. Censura por colheita ainda em curso.")

print("\n"+"="*80); print("EFEITO FAZENDA (confundidor)")
print(a.groupby("fazenda").arrobas_ha.agg(["count","mean","std","min","max"]).round(1).to_string())

print("\n"+"="*80); print("REGRESSAO arrobas/ha ~ dia de plantio")
def fit(df, lab):
    x, y = df.dia.values.astype(float), df.arrobas_ha.values
    b = np.polyfit(x, y, 1); r = np.corrcoef(x, y)[0,1]
    sl = [np.polyfit(x[i], y[i], 1)[0] for i in
          (rng.choice(len(x), len(x), True) for _ in range(5000))]
    lo, hi = np.percentile(sl, [2.5, 97.5])
    sig = "significativo" if lo*hi > 0 else "NAO significativo (IC cruza zero)"
    print(f"  {lab:28s} n={len(df):2d} | inclinacao {b[0]:+6.2f} @/ha/dia "
          f"(IC95% {lo:+.2f} a {hi:+.2f}) | r={r:+.2f} R2={r**2:.2f} | {sig}")
fit(a, "todos")
for f, g in a.groupby("fazenda"):
    if len(g) > 4: fit(g, f"so {f}")
# controlando fazenda (dentro de cada fazenda, desvio da media)
a["y_c"] = a.arrobas_ha - a.groupby("fazenda").arrobas_ha.transform("mean")
x, y = a.dia.values.astype(float), a.y_c.values
b = np.polyfit(x, y, 1)
sl = [np.polyfit(x[i], y[i], 1)[0] for i in (rng.choice(len(x), len(x), True) for _ in range(5000))]
lo, hi = np.percentile(sl, [2.5, 97.5])
print(f"  {'controlando fazenda':28s} n={len(a)} | inclinacao {b[0]:+6.2f} @/ha/dia "
      f"(IC95% {lo:+.2f} a {hi:+.2f})")

print("\n"+"="*80); print("VARIABILIDADE NAO EXPLICADA PELA DATA")
print("  Pivos plantados na MESMA semana e suas produtividades:")
a["sem"] = a.plantio.dt.to_period("W").astype(str)
for s_, g in a.groupby("sem"):
    if len(g) >= 3:
        print(f"   {s_}: " + ", ".join(f"{r.pivo_id} {r.arrobas_ha:.0f}" for _, r in g.iterrows())
              + f"  -> amplitude {g.arrobas_ha.max()-g.arrobas_ha.min():.0f} @/ha")
print("  => a amplitude DENTRO da mesma semana chega a ~180 @/ha, maior que qualquer")
print("     tendencia atribuivel a data. Variedade, solo e manejo dominam nesta amostra.")
a.to_csv(S/"produtividade_algodao.csv", index=False)
