# -*- coding: utf-8 -*-
"""Reconstrucao diaria da semeadura e cenarios contrafactuais A-E."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
R_CAL, LIM = 2, 5.0

medf = pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
alg  = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
alg["fazenda"] = alg.fazenda.str.strip()
soja["ciclo"] = (soja.colheita - soja.plantio).dt.days

INI, FIM = alg.plantio.min(), alg.plantio.max()
HORIZ = pd.date_range(INI, FIM + pd.Timedelta(days=120))

def agric(faz, R=R_CAL):
    s = medf[medf.fazenda == faz].set_index("data").mm_fazenda.reindex(HORIZ).fillna(0)
    d = s > LIM
    r = pd.Series(False, index=s.index)
    for k in range(1, R+1): r |= d.shift(k).fillna(False)
    return ~(d | (r & ~d))

# --------- capacidade operacional observada (p90 dos dias com plantio) ---------
CAP = {}
for faz, g in alg.groupby("fazenda"):
    dd = g.groupby("plantio").area_ha.sum()
    CAP[faz] = float(dd.quantile(.90))
print("Capacidade operacional calibrada (p90 do ha/dia observado):", CAP)

# --------- datas de liberacao -------------------------------------------------
GAP_MED = 2
sj = soja.set_index("pivo_id")
alg["tem_soja"] = alg.pivo_id.isin(sj.index)
alg["soja_colheita"] = alg.pivo_id.map(sj.colheita)
alg["soja_plantio"]  = alg.pivo_id.map(sj.plantio)
CICLO_REF = soja.groupby("fazenda").ciclo.quantile(.25).to_dict()
print("Ciclo de referencia da soja (P25, colheita sem espera):", CICLO_REF)
alg["maturidade_soja"] = alg.apply(
    lambda r: r.soja_plantio + pd.Timedelta(days=CICLO_REF[r.fazenda])
    if pd.notna(r.soja_plantio) else pd.NaT, axis=1)
alg["lib_obs"] = alg.apply(
    lambda r: r.soja_colheita if pd.notna(r.soja_colheita)
    else r.plantio - pd.Timedelta(days=GAP_MED), axis=1)
alg["lib_semAtrasoSoja"] = alg.apply(
    lambda r: min(r.maturidade_soja, r.lib_obs) if pd.notna(r.maturidade_soja) else r.lib_obs, axis=1)
alg["atraso_colheita_soja"] = (alg.soja_colheita - alg.maturidade_soja).dt.days

# --------- motor de fila ------------------------------------------------------
def simula(df, col_lib, cap_mult=1.0, sem_chuva=False, R=R_CAL):
    fim = {}
    for faz, g in df.groupby("fazenda"):
        ok = pd.Series(True, index=HORIZ) if sem_chuva else agric(faz, R)
        cap = CAP[faz] * cap_mult
        fila = g.sort_values(["plantio", "pivo_id"])[["pivo_id", col_lib, "area_ha"]].values
        rest = {p: a for p, _, a in fila}
        for dia in HORIZ:
            if not ok[dia]: continue
            livre = cap
            for p, lib, _ in fila:
                if rest[p] <= 0 or lib > dia or livre <= 0: continue
                usa = min(livre, rest[p]); rest[p] -= usa; livre -= usa
                if rest[p] <= 1e-9: fim[p] = dia
            if all(v <= 1e-9 for v in rest.values()): break
    return pd.Series(fim)

cen = {
 "A_sim (observado, motor)": dict(col_lib="lib_obs"),
 "B (sem chuva no algodao)": dict(col_lib="lib_obs", sem_chuva=True),
 "C (sem atraso da soja)":   dict(col_lib="lib_semAtrasoSoja"),
 "D (sem chuva na sucessao)":dict(col_lib="lib_semAtrasoSoja", sem_chuva=True),
 "E1 (capacidade +25%)":     dict(col_lib="lib_obs", cap_mult=1.25),
 "E2 (capacidade +50%)":     dict(col_lib="lib_obs", cap_mult=1.50),
 "E3 (capacidade +100%)":    dict(col_lib="lib_obs", cap_mult=2.00),
}
res = alg[["fazenda","pivo_id","area_ha","plantio","lib_obs","lib_semAtrasoSoja",
           "tem_soja","atraso_colheita_soja"]].copy()
for nome, kw in cen.items():
    res[nome] = res.pivo_id.map(simula(alg, **kw))

# --------- validacao do motor -------------------------------------------------
print("\n"+"="*80); print("VALIDACAO DO MOTOR (cenario A simulado x datas reais)")
er = (res["A_sim (observado, motor)"] - res.plantio).dt.days
print(f"  vies mediano {er.median():+.0f} d | erro absoluto mediano {er.abs().median():.0f} d | "
      f"|erro|<=5d em {(er.abs()<=5).mean():.0%} dos pivos | ultimo plantio: real "
      f"{res.plantio.max().date()} x simulado {res['A_sim (observado, motor)'].max().date()}")
res["erro_motor_d"] = er

# --------- resultados por cenario --------------------------------------------
print("\n"+"="*80); print("CENARIOS — data de termino do plantio e antecipacao media")
lin = []
for nome in cen:
    a = res[nome]
    dif = (res["A_sim (observado, motor)"] - a).dt.days       # dias antecipados
    lin.append(dict(cenario=nome, ultimo_plantio=a.max().date(),
                    p50_data=a.quantile(.5).date(), 
                    antecip_media_d=round(dif.mean(),1),
                    antecip_ponderada_d=round(np.average(dif, weights=res.area_ha),1),
                    ha_dia_ganhos=round((dif*res.area_ha).sum(),0),
                    ha_plantados_ate_31dez=round(res.area_ha[a<="2025-12-31"].sum(),0),
                    ha_plantados_ate_31jan=round(res.area_ha[a<="2026-01-31"].sum(),0)))
C = pd.DataFrame(lin)
print(C.to_string(index=False))

# --------- atraso por talhao --------------------------------------------------
for nome in cen:
    res["atraso_vs_"+nome[:2]] = (res["A_sim (observado, motor)"] - res[nome]).dt.days
res["atraso_ha_dia_B"] = res["atraso_vs_B "] * res.area_ha
res.to_csv(S/"cenarios_por_talhao.csv", index=False)
C.to_csv(S/"cenarios_resumo.csv", index=False)

print("\n"+"="*80); print("ATRASO DA COLHEITA DA SOJA (obs. x maturidade = plantio + ciclo P25)")
q = alg[alg.atraso_colheita_soja.notna()]
print(f"  n={len(q)} pivos | mediana {q.atraso_colheita_soja.median():.0f} d | "
      f"media {q.atraso_colheita_soja.mean():.1f} d | max {q.atraso_colheita_soja.max():.0f} d | "
      f"ha-dia {(q.atraso_colheita_soja.clip(lower=0)*q.area_ha).sum():,.0f}")
print("\n"+"="*80); print("SENSIBILIDADE AO CENARIO DE RECUPERACAO (R)")
for R in (1,2,3):
    b = simula(alg, "lib_obs", R=R)
    print(f"  R={R}: ultimo plantio simulado {b.max().date()} | "
          f"antecipacao media vs R=2: {((res['A_sim (observado, motor)']-res.pivo_id.map(b)).dt.days).mean():+.1f} d")
