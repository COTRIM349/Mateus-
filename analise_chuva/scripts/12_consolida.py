# -*- coding: utf-8 -*-
"""Tabela consolidada por talhao com todas as metricas pedidas + serie diaria de API."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
R_CAL, LIM, K_API = 2, 5.0, 0.85

T   = pd.read_csv(S/"talhao_metricas.csv", parse_dates=["soja_plantio","soja_colheita",
        "liberacao","algodao_plantio","algodao_emergencia"])
_c  = pd.read_csv(S/"cenarios_por_talhao.csv")
C   = pd.read_csv(S/"cenarios_por_talhao.csv",
        parse_dates=[c for c in _c.columns if c[0] in "ABCDE" or c == "plantio"])
C   = C.rename(columns={"plantio": "algodao_plantio"})
soja= pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
medf= pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
soja["ciclo"] = (soja.colheita-soja.plantio).dt.days
CICLO = soja.groupby("fazenda").ciclo.quantile(.25).to_dict()

# --- atraso da SEMEADURA da soja: real x fila sem restricao (so capacidade) ----
at_soja = {}
for faz, g in soja.groupby("fazenda"):
    cap = g.groupby("plantio").area_ha.sum().quantile(.90)
    rest, fim = dict(zip(g.pivo_id, g.area_ha)), {}
    ordem = g.sort_values("plantio").pivo_id.tolist()
    for dd in pd.date_range(g.plantio.min(), g.plantio.min()+pd.Timedelta(days=200)):
        livre = cap
        for p in ordem:
            if rest[p] <= 0 or livre <= 0: continue
            u = min(livre, rest[p]); rest[p]-=u; livre-=u
            if rest[p] <= 1e-9: fim[p]=dd
        if all(v<=1e-9 for v in rest.values()): break
    for p, d in fim.items():
        at_soja[p] = ((g.set_index("pivo_id").plantio[p]-d).days, d)

F = T.merge(C[["pivo_id","algodao_plantio","A_H1","B_H1","C_H1","D_H1","A_H2","B_H2","D_H2"]],
            on=["pivo_id","algodao_plantio"], how="left")
assert len(F) == len(T) and abs(F.area_ha.sum()-8305) < 1, (len(F), len(T), F.area_ha.sum())
F["soja_maturidade"] = F.apply(lambda r: r.soja_plantio+pd.Timedelta(days=CICLO[r.fazenda])
                               if pd.notna(r.soja_plantio) else pd.NaT, axis=1)
F["atraso_semeadura_soja_d"] = F.pivo_id.map(lambda p: at_soja.get(p,(np.nan,None))[0])
F["atraso_colheita_soja_d"]  = (F.soja_colheita - F.soja_maturidade).dt.days
F["disponivel_sem_atraso_soja"] = F.soja_maturidade.fillna(F.liberacao)
F["atraso_liberacao_ate_plantio_d"] = F.espera_pos_colheita_soja
F["atraso_total_algodao_H1_d"] = (F.A_H1 - F.D_H1).dt.days
F["atraso_total_algodao_H2_d"] = (F.A_H2 - F.D_H2).dt.days
F["atraso_chuva_algodao_H1_d"] = (F.A_H1 - F.B_H1).dt.days
F["atraso_chuva_algodao_H2_d"] = (F.A_H2 - F.B_H2).dt.days
for c in ["atraso_total_algodao_H1_d","atraso_total_algodao_H2_d",
          "atraso_chuva_algodao_H1_d","atraso_chuva_algodao_H2_d","atraso_colheita_soja_d"]:
    F[c.replace("_d","_ha_dia")] = F[c].clip(lower=0)*F.area_ha

cols = ["fazenda","pivo_id","area_ha","variedades","pluviometro","soja_plantio","soja_colheita",
 "soja_ciclo","soja_maturidade","soja_prod_sc_ha","atraso_semeadura_soja_d","atraso_colheita_soja_d",
 "disponivel_sem_atraso_soja","liberacao","algodao_plantio","algodao_emergencia","arrobas_ha",
 "atraso_liberacao_ate_plantio_d","camp_chuva_mm","camp_maior_seq_bloq","camp_api_medio","camp_api_max","camp_dias_maior5","camp_dias_resid",
 "camp_dias_bloq","jan_dias","jan_chuva_mm","jan_dias_maior5","jan_dias_resid","jan_dias_bloq",
 "jan_maior_seq_bloq","jan_api_medio","jan_api_max","atraso_chuva_algodao_H1_d",
 "atraso_chuva_algodao_H2_d","atraso_total_algodao_H1_d","atraso_total_algodao_H2_d",
 "atraso_total_algodao_H1_ha_dia","atraso_total_algodao_H2_ha_dia"]
F[cols].sort_values(["fazenda","algodao_plantio"]).to_csv(S/"TALHAO_CONSOLIDADO.csv", index=False)

print("="*90); print("CONSOLIDADO — TOTAIS PONDERADOS PELA AREA")
A = F.area_ha.sum()
def wm(c): return np.average(F[c].fillna(0), weights=F.area_ha)
print(f"  area total de algodao: {A:,.0f} ha em {len(F)} eventos de plantio")
for c,n in [("camp_dias_maior5","dias com chuva >5mm na campanha"),
            ("camp_dias_resid","dias bloqueados por efeito residual"),
            ("camp_dias_bloq","TOTAL de dias nao agricultaveis"),
            ("camp_maior_seq_bloq","maior sequencia de dias bloqueados seguidos"),
            ("camp_api_medio","API medio na campanha (mm)"),
            ("camp_chuva_mm","chuva acumulada na campanha (mm)")]:
    print(f"  {n:52s}: media pond. {wm(c):6.1f} | min {F[c].min():.0f} | max {F[c].max():.0f}")
print()
for c,n in [("atraso_semeadura_soja_d","atraso da semeadura da soja (vs fila sem restricao)"),
            ("atraso_colheita_soja_d","atraso da colheita da soja (vs maturidade P25)"),
            ("atraso_liberacao_ate_plantio_d","espera colheita da soja -> plantio (so 25 pivos)"),
            ("atraso_chuva_algodao_H1_d","atraso do algodao pela chuva (H1, limite inferior)"),
            ("atraso_chuva_algodao_H2_d","atraso do algodao pela chuva (H2, limite superior)"),
            ("atraso_total_algodao_H1_d","atraso TOTAL do algodao (H1)"),
            ("atraso_total_algodao_H2_d","atraso TOTAL do algodao (H2)")]:
    v = F[c].dropna()
    print(f"  {n:52s}: media pond. {np.average(F[c].fillna(0),weights=F.area_ha):5.1f} d | "
          f"mediana {v.median():4.0f} | max {v.max():4.0f} | ha-dia {(v.clip(lower=0)*F.loc[v.index,'area_ha']).sum():>10,.0f}")

print("\n"+"="*90); print("SERIE DIARIA DE API POR FAZENDA (K=0.85) — exportada")
api = []
for faz, g in medf.groupby("fazenda"):
    s = g.set_index("data").mm_fazenda
    a = sum(s.shift(i)*(K_API**i) for i in range(21)).fillna(0)
    d = s > LIM; r = pd.Series(False, index=s.index)
    for k in range(1,R_CAL+1): r |= d.shift(k).fillna(False)
    api.append(pd.DataFrame(dict(fazenda=faz, data=s.index, mm=s.values, api=a.values,
        bloq_direto=d.values, bloq_residual=(r&~d).values, agricultavel=~(d|(r&~d)).values)))
API = pd.concat(api); API.to_csv(S/"serie_diaria_api.csv", index=False)
cam = API[(API.data>="2025-12-02")&(API.data<="2026-03-19")]
print(cam.groupby("fazenda").agg(dias=("data","size"), chuva_mm=("mm","sum"),
    api_medio=("api","mean"), api_max=("api","max"), diretos=("bloq_direto","sum"),
    residuais=("bloq_residual","sum"), agricultaveis=("agricultavel","sum")).round(1).to_string())
