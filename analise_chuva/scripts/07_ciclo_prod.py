# -*- coding: utf-8 -*-
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D = BASE/"dados"
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
alg  = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
alg["fazenda"] = alg.fazenda.str.strip()
soja["ciclo"] = (soja.colheita-soja.plantio).dt.days
soja["dia_plantio"] = (soja.plantio - pd.Timestamp("2025-09-01")).dt.days

print("="*80); print("A. CICLO DA SOJA x DATA DE PLANTIO (ha efeito fisiologico ou espera?)")
for faz,g in soja.groupby("fazenda"):
    r = np.corrcoef(g.dia_plantio, g.ciclo)[0,1]
    b = np.polyfit(g.dia_plantio, g.ciclo, 1)
    print(f"  {faz}: n={len(g)} corr(data plantio, ciclo)={r:+.2f} | "
          f"inclinacao {b[0]:+.2f} dias de ciclo por dia de atraso no plantio")
    print(f"       ciclo: P25={g.ciclo.quantile(.25):.0f} mediana={g.ciclo.median():.0f} "
          f"P75={g.ciclo.quantile(.75):.0f} max={g.ciclo.max():.0f}")
print("  => ciclo praticamente constante/decrescente: a variacao NAO e so fisiologica;")
print("     ciclos longos indicam espera para colher (fila/chuva).")

print("\n"+"="*80); print("B. PRODUTIVIDADE DO ALGODAO x DATA DE PLANTIO (dados disponiveis)")
a = alg[alg.arrobas_ha.notna()].copy()
a["dia"] = (a.plantio - pd.Timestamp("2025-12-01")).dt.days
print(f"  pivos com produtividade: {len(a)} de {len(alg)} | area {a.area_ha.sum():.0f} de "
      f"{alg.area_ha.sum():.0f} ha ({a.area_ha.sum()/alg.area_ha.sum():.0%})")
print(f"  janela de plantio COM produtividade: {a.plantio.min().date()} a {a.plantio.max().date()}")
print(f"  janela de plantio SEM produtividade: {alg[alg.arrobas_ha.isna()].plantio.min().date()} "
      f"a {alg[alg.arrobas_ha.isna()].plantio.max().date()}")
r = np.corrcoef(a.dia, a.arrobas_ha)[0,1]; b = np.polyfit(a.dia, a.arrobas_ha, 1)
# IC bootstrap da inclinacao
rng = np.random.default_rng(1); sl=[]
for _ in range(5000):
    i = rng.choice(len(a), len(a), True)
    sl.append(np.polyfit(a.dia.values[i], a.arrobas_ha.values[i], 1)[0])
lo,hi = np.percentile(sl,[2.5,97.5])
print(f"  corr = {r:+.2f} | inclinacao = {b[0]:+.2f} @/ha por dia de atraso "
      f"(IC95% {lo:+.2f} a {hi:+.2f})")
print(f"  R2 = {r**2:.2f} | media {a.arrobas_ha.mean():.0f} @/ha, amplitude "
      f"{a.arrobas_ha.min():.0f} a {a.arrobas_ha.max():.0f}")
print(a[["pivo_id","plantio","area_ha","variedades","arrobas_ha"]].sort_values("plantio").to_string(index=False))
print("\n  ATENCAO: a amostra so cobre plantios de 02/12 a 06/01. Os 79% da area plantados")
print("  depois de 06/01 ainda nao tem produtividade fechada. A inclinacao acima NAO pode")
print("  ser extrapolada para fevereiro/marco.")
