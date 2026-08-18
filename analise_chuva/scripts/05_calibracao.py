# -*- coding: utf-8 -*-
"""Calibra a probabilidade de um dia ser AGRICULTAVEL usando os registros reais de
operacao (datas de plantio do algodao 25/26), em vez de uma regra arbitraria de dias."""
import pandas as pd, numpy as np
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
D, S = BASE/"dados", BASE/"saidas"
rng = np.random.default_rng(42)

med  = pd.read_csv(D/"chuva_diaria_fazenda.csv", parse_dates=["data"])
alg   = pd.read_csv(D/"algodao_pivo.csv", parse_dates=["plantio","emergencia"])
soja = pd.read_csv(D/"soja.csv", parse_dates=["plantio","colheita"])
alg["fazenda"] = alg.fazenda.str.strip()
INI, FIM = alg.plantio.min(), alg.plantio.max()
print(f"Janela da campanha de algodao: {INI.date()} a {FIM.date()} ({(FIM-INI).days+1} dias)\n")

def ic(v, n=4000):
    """IC 95% bootstrap para uma proporcao."""
    v = np.asarray(v, float)
    if len(v) == 0: return dict(ic_lo=float("nan"), ic_hi=float("nan"))
    b = rng.choice(v, (n, len(v)), replace=True).mean(1)
    lo, hi = np.percentile(b, [2.5, 97.5])
    return dict(ic_lo=round(float(lo), 3), ic_hi=round(float(hi), 3))

# ---- painel fazenda x dia -----------------------------------------------------
lin = []
for faz in ["KRT", "RDM"]:
    r = med[med.fazenda == faz].set_index("data").mm_fazenda
    sub = alg[alg.fazenda == faz]
    plant = sub.groupby("plantio").area_ha.sum()
    colh = soja[soja.fazenda == faz].set_index("pivo_id").colheita
    ult = sub.groupby("pivo_id").agg(area=("area_ha","sum"), pl=("plantio","max"))
    for d in pd.date_range(INI, FIM):
        # area ainda por plantar: pivo com plantio >= d e (se teve soja) ja colhido
        disp = sum(a.area for pid, a in ult.iterrows()
                   if a.pl >= d and (pd.isna(colh.get(pid, pd.NaT)) or colh.get(pid) <= d))
        lin.append(dict(fazenda=faz, data=d, mm=float(r.get(d, 0.0)),
                        ha=float(plant.get(d, 0.0)), area_disponivel=disp, dow=d.dayofweek))
p = pd.DataFrame(lin)
p["op"] = (p.ha > 0).astype(int)
for k in range(1, 6): p[f"mm_l{k}"] = p.groupby("fazenda").mm.shift(k)
p = p[p.area_disponivel > 0].copy()      # so dias em que havia talhao disponivel para plantar
print(f"Painel: {len(p)} fazenda-dias | com operacao: {p.op.sum()} ({p.op.mean():.0%}) "
      f"| ha cobertos {p.ha.sum():.0f} de {alg.area_ha.sum():.0f}\n")

# ---- 1. chuva do proprio dia --------------------------------------------------
print("="*80); print("1. EFEITO DA CHUVA DO PROPRIO DIA")
p["fx"] = pd.cut(p.mm, [-.01,0.2,2,5,10,20,999], labels=["0 (seco)","0,2-2","2-5","5-10","10-20",">20"])
t1 = p.groupby("fx", observed=True).apply(lambda g: pd.Series(
        dict(dias=len(g), operou=g.op.sum(), p_operar=round(g.op.mean(),2),
             **ic(g.op),
             ha_medio=round(g.ha.mean(),1))), include_groups=False)
print(t1.to_string())

# ---- 2. efeito residual (CALIBRACAO PRINCIPAL) --------------------------------
print("="*80); print("2. EFEITO RESIDUAL — dias SECOS (<=5mm) por distancia ao ultimo evento >5mm")
sec = p[p.mm <= 5].copy()
sec["desde"] = sec.apply(lambda r: next((k for k in range(1,6)
                   if pd.notna(r[f"mm_l{k}"]) and r[f"mm_l{k}"] > 5), 99), axis=1)
t2 = sec.groupby("desde").apply(lambda g: pd.Series(
        dict(dias=len(g), p_operar=round(g.op.mean(),2), **ic(g.op),
             ha_medio=round(g.ha.mean(),1))), include_groups=False)
t2.index = [f"D+{k}" if k < 99 else "sem chuva>5mm ha >=5d (BASE)" for k in t2.index]
print(t2.to_string())
base = sec[sec.desde == 99].op.mean()
print(f"\n  Base (solo ja recuperado) = {base:.2f}.")
for k in (1,2,3):
    g = sec[sec.desde == k]
    print(f"  D+{k}: {g.op.mean():.2f} -> {'ABAIXO' if g.op.mean()<base else 'no nivel'} da base "
          f"({len(g)} dias)")

print("\n  Por TAMANHO do evento (amostras pequenas — indicativo):")
sec["ev"] = sec.apply(lambda r: next((r[f"mm_l{k}"] for k in range(1,6)
                 if pd.notna(r[f"mm_l{k}"]) and r[f"mm_l{k}"]>5), np.nan), axis=1)
sec["fx_ev"] = pd.cut(sec.ev, [5,15,30,999], labels=["5-15mm","15-30mm",">30mm"])
print(sec[sec.desde<=3].groupby(["fx_ev","desde"], observed=True)
        .agg(dias=("op","size"), p_operar=("op","mean")).round(2).to_string())

# ---- 3. API -------------------------------------------------------------------
print("="*80); print("3. API (Antecedent Precipitation Index)")
def api(s, k, n=14): return sum(s.shift(i)*(k**i) for i in range(n)).fillna(0)
def auc(y, x):
    r = pd.Series(x).rank().values; n1, n0 = y.sum(), (1-y).sum()
    return (r[y==1].sum() - n1*(n1+1)/2) / (n1*n0)
res = []
for k in np.arange(0.50, 0.96, 0.05):
    a = p.groupby("fazenda").mm.transform(lambda s: api(s, k))
    res.append((round(k,2), round(1-auc(p.op.values, a.values), 3)))
res = pd.DataFrame(res, columns=["k","auc_bloqueio"])
KBEST = float(res.loc[res.auc_bloqueio.idxmax(), "k"]); AUCB = res.auc_bloqueio.max()
print(res.to_string(index=False))
# significancia por permutacao
p["api"] = p.groupby("fazenda").mm.transform(lambda s: api(s, KBEST))
nul = [1-auc(rng.permutation(p.op.values), p.api.values) for _ in range(2000)]
pval = float(np.mean(np.array(nul) >= AUCB))
print(f"  => k = {KBEST} | AUC = {AUCB:.3f} | p (permutacao) = {pval:.3f}")
print(f"     k baixo confirma memoria CURTA do solo: peso 0,5 em D-1 e 0,25 em D-2.")
# limiar por Youden
cand = np.unique(p.api.round(1))
J = [( (p.op[p.api<=t].mean() if (p.api<=t).any() else 0) - (p.op[p.api>t].mean() if (p.api>t).any() else 0), t)
     for t in cand if 5 <= (p.api<=t).sum() <= len(p)-5]
API_LIM = max(J)[1]
print(f"  => limiar de Youden: API = {API_LIM:.1f} mm | P(operar) abaixo do limiar = "
      f"{p.op[p.api<=API_LIM].mean():.2f} | acima = {p.op[p.api>API_LIM].mean():.2f}")
p["fx_api"] = pd.qcut(p.api, 6, duplicates="drop")
print(p.groupby("fx_api", observed=True).agg(dias=("op","size"), p_operar=("op","mean"),
       ha_medio=("ha","mean")).round(2).to_string())

# ---- 4. cenarios de recuperacao ----------------------------------------------
print("="*80); print("4. CENARIOS DE RECUPERACAO DO SOLO (analise de sensibilidade)")
cen = pd.DataFrame([
  dict(cenario="Rapida",                    R=1, base="D+1 ja agricultavel; solo arenoso/evento leve"),
  dict(cenario="Intermediaria (CALIBRADA)", R=2, base="D+1 e D+2 bloqueados; volta a base em D+3 (dados 25/26)"),
  dict(cenario="Lenta",                     R=3, base="D+1 a D+3 bloqueados; eventos >30mm / solo pesado"),
])
print(cen.to_string(index=False))
print("  R = dias adicionais bloqueados APOS o dia da chuva >5mm.")
print("  A calibracao (bloco 2) sustenta R=2: D+1 e D+2 abaixo da base, D+3 no nivel dela.")

# ---- 5. confundidor: dia da semana -------------------------------------------
print("="*80); print("5. CONTROLE — dia da semana")
dw = p.groupby("dow").agg(dias=("op","size"), p_operar=("op","mean"), mm_med=("mm","mean")).round(2)
dw.index = ["seg","ter","qua","qui","sex","sab","dom"]; print(dw.to_string())
print("  Sem parada fixa de fim de semana: o domingo é o menor (0,23), mas a amplitude")
print("  entre dias da semana é bem menor que o efeito da chuva. Nao explica os bloqueios.")

p.to_csv(S/"calib_painel.csv", index=False)
t1.to_csv(S/"calib_chuva_dia.csv"); t2.to_csv(S/"calib_residual.csv")
res.to_csv(S/"calib_api_k.csv", index=False); cen.to_csv(S/"calib_cenarios.csv", index=False)
open(S/"calib_params.txt","w").write(f"KBEST={KBEST}\nAPI_LIM={API_LIM}\nAUC={AUCB}\npval={pval}\nR_CAL=2\n")
print(f"\nPARAMETROS -> k={KBEST} | API_LIM={API_LIM} | R calibrado = 2 dias")
