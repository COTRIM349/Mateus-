# -*- coding: utf-8 -*-
"""Cenarios A-E sob DUAS hipoteses de liberacao dos pivos sem soja 25/26 registrada,
mais a decomposicao dos 108 dias da campanha."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
R_CAL, LIM, GAP_MED = 2, 5.0, 2

medf = pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
alg  = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
alg["fazenda"] = alg.fazenda.str.strip(); soja["ciclo"] = (soja.colheita-soja.plantio).dt.days
INI, FIM = alg.plantio.min(), alg.plantio.max()
CAL   = pd.date_range(INI, FIM)
HORIZ = pd.date_range(INI, FIM + pd.Timedelta(days=150))

def agric(faz, R=R_CAL):
    s = medf[medf.fazenda==faz].set_index("data").mm_fazenda.reindex(HORIZ).fillna(0)
    d = s > LIM; r = pd.Series(False, index=s.index)
    for k in range(1,R+1): r |= d.shift(k).fillna(False)
    return ~(d | (r & ~d))

CAP = {f: float(g.groupby("plantio").area_ha.sum().quantile(.90)) for f,g in alg.groupby("fazenda")}
sj = soja.set_index("pivo_id")
alg["soja_colheita"] = alg.pivo_id.map(sj.colheita); alg["soja_plantio"] = alg.pivo_id.map(sj.plantio)
CICLO = soja.groupby("fazenda").ciclo.quantile(.25).to_dict()
alg["maturidade"] = alg.apply(lambda r: r.soja_plantio+pd.Timedelta(days=CICLO[r.fazenda])
                              if pd.notna(r.soja_plantio) else pd.NaT, axis=1)
alg["tem_soja"] = alg.soja_colheita.notna()

# H1 conservadora: pivo sem soja registrada fica preso a data real (nao pode antecipar)
# H2 superior:     pivo sem soja registrada estava livre desde o inicio da campanha
for H, fb in [("H1", lambda r: r.plantio - pd.Timedelta(days=GAP_MED)), ("H2", lambda r: INI)]:
    alg[f"lib_obs_{H}"] = alg.apply(lambda r: r.soja_colheita if r.tem_soja else fb(r), axis=1)
    alg[f"lib_semSoja_{H}"] = alg.apply(
        lambda r: min(r.maturidade, r.soja_colheita) if r.tem_soja else fb(r), axis=1)

def simula(col, cap_mult=1.0, sem_chuva=False, R=R_CAL):
    fim = {}
    for faz, g in alg.groupby("fazenda"):
        ok = pd.Series(True, index=HORIZ) if sem_chuva else agric(faz, R)
        cap = CAP[faz]*cap_mult
        fila = g.sort_values(["plantio","pivo_id"])[["pivo_id", col, "area_ha"]].values
        rest = {p:a for p,_,a in fila}
        for dia in HORIZ:
            if not ok[dia]: continue
            livre = cap
            for p, lib, _ in fila:
                if rest[p] <= 0 or lib > dia or livre <= 0: continue
                u = min(livre, rest[p]); rest[p] -= u; livre -= u
                if rest[p] <= 1e-9: fim[p] = dia
            if all(v <= 1e-9 for v in rest.values()): break
    return pd.Series(fim)

print("Capacidade (p90 ha/dia):", CAP, "| ciclo P25 soja:", CICLO)
out = alg[["fazenda","pivo_id","area_ha","plantio","tem_soja"]].copy()
resumo = []
for H in ("H1","H2"):
    cen = {"A":dict(col=f"lib_obs_{H}"), "B":dict(col=f"lib_obs_{H}", sem_chuva=True),
           "C":dict(col=f"lib_semSoja_{H}"), "D":dict(col=f"lib_semSoja_{H}", sem_chuva=True),
           "E1":dict(col=f"lib_obs_{H}",cap_mult=1.25), "E2":dict(col=f"lib_obs_{H}",cap_mult=1.5),
           "E3":dict(col=f"lib_obs_{H}",cap_mult=2.0)}
    for k,kw in cen.items():
        out[f"{k}_{H}"] = out.pivo_id.map(simula(**kw))
    A = out[f"A_{H}"]
    for k in cen:
        x = out[f"{k}_{H}"]; dif = (A-x).dt.days
        resumo.append(dict(hipotese=H, cenario=k, ultimo=x.max().date(),
            antecip_media=round(dif.mean(),1),
            antecip_pond=round(np.average(dif, weights=out.area_ha),1),
            ha_dia=round((dif*out.area_ha).sum()),
            ha_ate_31dez=round(out.area_ha[x<="2025-12-31"].sum()),
            ha_ate_31jan=round(out.area_ha[x<="2026-01-31"].sum()),
            pct_ate_31jan=f"{out.area_ha[x<='2026-01-31'].sum()/out.area_ha.sum():.0%}"))
Rz = pd.DataFrame(resumo)
print("\n"+"="*90); print("CENARIOS (A=observado no motor; antecipacao em dias vs A)")
print("  H1 = pivos sem soja registrada presos a data real (LIMITE INFERIOR do efeito da chuva)")
print("  H2 = pivos sem soja registrada livres desde 02/12  (LIMITE SUPERIOR)")
for H in ("H1","H2"):
    print(f"\n  --- {H} ---")
    print(Rz[Rz.hipotese==H].drop(columns="hipotese").to_string(index=False))

err = (out.A_H1 - out.plantio).dt.days
print(f"\nVALIDACAO (A_H1 x real): vies {err.median():+.0f} d | MAE {err.abs().median():.0f} d | "
      f"<=5d em {(err.abs()<=5).mean():.0%} | ultimo real {out.plantio.max().date()} x sim {out.A_H1.max().date()}")

# ---------------- decomposicao dos dias da campanha ---------------------------
print("\n"+"="*90); print("DECOMPOSICAO DOS 108 DIAS DA CAMPANHA (por fazenda)")
lin=[]
for faz, g in alg.groupby("fazenda"):
    ok = agric(faz).loc[CAL]
    plant = g.groupby("plantio").area_ha.sum()
    ult = g.groupby("pivo_id").agg(area=("area_ha","sum"), pl=("plantio","max"),
                                   lib=(f"lib_obs_H1","max"))
    for d in CAL:
        disp = sum(a.area for _,a in ult.iterrows() if a.lib <= d and a.pl >= d)
        ha = float(plant.get(d,0))
        lin.append(dict(fazenda=faz, data=d, agricultavel=bool(ok[d]),
                        area_liberada=disp, ha=ha))
P = pd.DataFrame(lin)
def classe(r):
    if r.area_liberada <= 0: return "sem area liberada (espera da soja/cultura anterior)"
    if not r.agricultavel:   return "BLOQUEADO PELA CHUVA com area liberada"
    return "agricultavel e trabalhou" if r.ha > 0 else "agricultavel, area liberada, sem registro"
P["classe"] = P.apply(classe, axis=1)
tab = (P.groupby(["fazenda","classe"]).agg(dias=("data","size"), ha=("ha","sum"))
        .assign(pct=lambda d: (100*d.dias/108).round(0)))
print(tab.to_string())
P.to_csv(S/"decomposicao_dias.csv", index=False)
out.to_csv(S/"cenarios_por_talhao.csv", index=False); Rz.to_csv(S/"cenarios_resumo.csv", index=False)

print("\n"+"="*90); print("QUANTO TEMPO DE MAQUINA A CAMPANHA REALMENTE EXIGIU")
for faz,g in alg.groupby("fazenda"):
    n = g.area_ha.sum()/CAP[faz]
    ok = agric(faz).loc[CAL]
    print(f"  {faz}: {g.area_ha.sum():.0f} ha / {CAP[faz]:.0f} ha-dia = {n:.0f} dias de maquina | "
          f"dias agricultaveis na campanha: {int(ok.sum())} | span real: 108 dias")
