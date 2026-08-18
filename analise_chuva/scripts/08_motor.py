# -*- coding: utf-8 -*-
"""Motor operacional: metricas por talhao + reconstrucao diaria da semeadura (cenarios A-E)."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"

R_CAL = 2                     # dias residuais calibrados (bloco 05)
LIM   = 5.0                   # mm/dia: regra operacional
K_API = 0.85                  # decaimento do API (valor hidrologico padrao, uso descritivo)
TURN  = 0                     # dias entre colheita da soja e liberacao do talhao (gap mediano obs.=2)

wide = pd.read_csv(D/"chuva_diaria_wide.csv", parse_dates=["data"]).set_index("data")
medf = pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
alg  = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
alg["fazenda"] = alg.fazenda.str.strip()
soja["ciclo"] = (soja.colheita - soja.plantio).dt.days

INI, FIM = alg.plantio.min(), alg.plantio.max()
CAL = pd.date_range(INI, FIM)

# ---------------------------------------------------------------- bloqueio
def bloqueios(serie, R):
    """serie: mm/dia indexada por data. Devolve (direto, residual, agricultavel)."""
    dire = serie > LIM
    resid = pd.Series(False, index=serie.index)
    for k in range(1, R+1):
        resid |= dire.shift(k).fillna(False)
    resid &= ~dire
    return dire, resid, ~(dire | resid)

def api(serie, k=K_API, n=21):
    return sum(serie.shift(i)*(k**i) for i in range(n)).fillna(0)

# ---------------------------------------------------------------- 1. metricas por talhao
lin = []
for _, a in alg.iterrows():
    pid = a.pivo_id
    col = pid if pid in wide.columns else None
    s = (wide[col] if col else
         medf[medf.fazenda == a.fazenda].set_index("data").mm_fazenda).astype(float)
    sj = soja[soja.pivo_id == pid]
    # janela do talhao: do inicio da campanha (ou da colheita da soja) ate o plantio do algodao
    ini = sj.colheita.iloc[0] if len(sj) else INI
    jan = s.loc[(s.index >= min(ini, a.plantio)) & (s.index <= a.plantio)]
    d, r, ok = bloqueios(s, R_CAL)
    d, r, ok = d.loc[jan.index], r.loc[jan.index], ok.loc[jan.index]
    # maior sequencia bloqueada
    blk = (~ok).astype(int); mx = cur = 0
    for v in blk:
        cur = cur+1 if v else 0; mx = max(mx, cur)
    # mesma coisa na janela COMUM da campanha (comparavel entre talhoes)
    jc = s.loc[CAL]; dc, rc, okc = bloqueios(s, R_CAL); dc, rc, okc = dc.loc[CAL], rc.loc[CAL], okc.loc[CAL]
    mxc = curc = 0
    for v in (~okc).astype(int):
        curc = curc+1 if v else 0; mxc = max(mxc, curc)
    lin.append(dict(
        fazenda=a.fazenda, pivo_id=pid, area_ha=a.area_ha, variedades=a.variedades,
        pluviometro=col or f"mediana {a.fazenda}",
        soja_plantio=sj.plantio.iloc[0] if len(sj) else pd.NaT,
        soja_colheita=sj.colheita.iloc[0] if len(sj) else pd.NaT,
        soja_ciclo=sj.ciclo.iloc[0] if len(sj) else np.nan,
        soja_prod_sc_ha=sj.prod_sc_ha.iloc[0] if len(sj) else np.nan,
        liberacao=ini, algodao_plantio=a.plantio, algodao_emergencia=a.emergencia,
        arrobas_ha=a.arrobas_ha,
        jan_dias=len(jan), jan_chuva_mm=round(jan.sum(),1),
        jan_dias_maior5=int(d.sum()), jan_dias_resid=int(r.sum()),
        jan_dias_bloq=int((~ok).sum()), jan_dias_agric=int(ok.sum()),
        jan_maior_seq_bloq=mx,
        jan_api_medio=round(api(s).loc[jan.index].mean(),1),
        jan_api_max=round(api(s).loc[jan.index].max(),1),
        camp_chuva_mm=round(jc.sum(),1), camp_dias_maior5=int(dc.sum()),
        camp_dias_resid=int(rc.sum()), camp_dias_bloq=int((dc|rc).sum()),
        camp_maior_seq_bloq=mxc, camp_api_medio=round(api(s).loc[CAL].mean(),1),
        camp_api_max=round(api(s).loc[CAL].max(),1),
        espera_pos_colheita_soja=(a.plantio-ini).days if len(sj) else np.nan))
T = pd.DataFrame(lin)
T.to_csv(S/"talhao_metricas.csv", index=False)

print("="*80); print("METRICAS POR TALHAO — resumo (janela comum da campanha 02/12 a 19/03)")
print(T.groupby("fazenda")[["camp_chuva_mm","camp_dias_maior5","camp_dias_resid","camp_dias_bloq"]]
        .agg(["min","median","max"]).round(0).to_string())
print(f"\n  Janela da campanha: {len(CAL)} dias")
for faz, g in T.groupby("fazenda"):
    print(f"  {faz}: mediana de {g.camp_dias_maior5.median():.0f} dias >5mm + "
          f"{g.camp_dias_resid.median():.0f} residuais = {g.camp_dias_bloq.median():.0f} dias "
          f"bloqueados ({g.camp_dias_bloq.median()/len(CAL):.0%} da campanha)")

print("\n"+"="*80); print("BLOQUEIO NO NIVEL DA FAZENDA (chuva mediana — base da simulacao)")
blq = {}
for faz, g in medf.groupby("fazenda"):
    s = g.set_index("data").mm_fazenda
    for R in (1, 2, 3):
        d, r, ok = bloqueios(s, R)
        d, r, ok = d.loc[CAL], r.loc[CAL], ok.loc[CAL]
        if R == R_CAL: blq[faz] = ok
        mx = cur = 0
        for v in (~ok).astype(int):
            cur = cur+1 if v else 0; mx = max(mx, cur)
        print(f"  {faz} R={R}: diretos {int(d.sum()):2d} | residuais {int(r.sum()):2d} | "
              f"bloqueados {int((~ok).sum()):3d}/{len(CAL)} ({(~ok).mean():.0%}) | "
              f"agricultaveis {int(ok.sum()):2d} | maior sequencia bloqueada {mx} d")
pd.DataFrame(blq).to_csv(S/"agricultavel_fazenda.csv")
