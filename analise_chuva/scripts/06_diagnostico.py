# -*- coding: utf-8 -*-
"""Diagnostico da sucessao soja->algodao e da capacidade operacional real."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D = BASE/"dados"
alg  = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
alg["fazenda"] = alg.fazenda.str.strip()

print("="*80); print("A. SUCESSAO SOJA -> ALGODAO (mesmo pivo)")
m = alg.merge(soja[["pivo_id","plantio","colheita","area_ha","prod_sc_ha","dias_manejados"]]
              .rename(columns={"plantio":"soja_plantio","colheita":"soja_colheita",
                               "area_ha":"soja_area","prod_sc_ha":"soja_prod"}),
              on="pivo_id", how="left")
m["ciclo_soja"] = (m.soja_colheita - m.soja_plantio).dt.days
m["gap_colh_plantio"] = (m.plantio - m.soja_colheita).dt.days
suc = m[m.soja_colheita.notna()]
print(f"  pivos de algodao: {len(m)} | com soja 25/26 no mesmo pivo: {len(suc)} "
      f"({suc.area_ha.sum():.0f} ha de {m.area_ha.sum():.0f})")
print(f"  gap colheita da soja -> plantio do algodao (dias): min {suc.gap_colh_plantio.min()}, "
      f"mediana {suc.gap_colh_plantio.median():.0f}, media {suc.gap_colh_plantio.mean():.1f}, "
      f"max {suc.gap_colh_plantio.max()}")
print(f"  gaps negativos (algodao antes da colheita da soja): {(suc.gap_colh_plantio<0).sum()}")
print(suc[["pivo_id","soja_plantio","soja_colheita","plantio","gap_colh_plantio","area_ha"]]
      .sort_values("gap_colh_plantio").to_string(index=False))

print("\n"+"="*80); print("B. CAPACIDADE OPERACIONAL REAL (ha/dia)")
dia = alg.groupby(["fazenda","plantio"], as_index=False).area_ha.sum()
for faz, g in dia.groupby("fazenda"):
    print(f"  {faz}: dias com plantio {len(g)} | ha/dia  mediana {g.area_ha.median():.0f}"
          f"  media {g.area_ha.mean():.0f}  p90 {g.area_ha.quantile(.9):.0f}  max {g.area_ha.max():.0f}")
print("  maiores dias:"); print(dia.nlargest(6,"area_ha").to_string(index=False))

print("\n"+"="*80); print("C. CICLO DA SOJA E SEQUENCIAMENTO")
soja["ciclo"] = (soja.colheita - soja.plantio).dt.days
for faz, g in soja.groupby("fazenda"):
    print(f"  {faz}: plantio {g.plantio.min().date()} a {g.plantio.max().date()} "
          f"(amplitude {(g.plantio.max()-g.plantio.min()).days} d) | "
          f"ciclo mediana {g.ciclo.median():.0f} d (min {g.ciclo.min()}, max {g.ciclo.max()})")

print("\n"+"="*80); print("D. CHUVA NA JANELA DE PLANTIO DA SOJA x DO ALGODAO")
medf = pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
for nome, (a,b) in {"plantio soja (20/09 a 24/12/2025)": ("2025-09-20","2025-12-24"),
                    "plantio algodao (02/12/25 a 19/03/26)": ("2025-12-02","2026-03-19")}.items():
    g = medf[(medf.data>=a)&(medf.data<=b)]
    for faz, gg in g.groupby("fazenda"):
        print(f"  {faz} | {nome}: {len(gg)} dias | acum {gg.mm_fazenda.sum():.0f} mm | "
              f"dias >5mm: {(gg.mm_fazenda>5).sum()} ({(gg.mm_fazenda>5).mean():.0%})")
m.to_csv(D/"sucessao.csv", index=False)
