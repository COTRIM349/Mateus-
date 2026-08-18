# -*- coding: utf-8 -*-
"""Significancia do efeito residual e API defasado (excluindo a chuva do proprio dia)."""
import pandas as pd, numpy as np
from pathlib import Path
from math import comb
BASE = Path(__file__).resolve().parent.parent
S = BASE/"saidas"; rng = np.random.default_rng(7)
p = pd.read_csv(S/"calib_painel.csv", parse_dates=["data"])

def fisher(a,b,c,d):   # tabela 2x2, bilateral
    n = a+b+c+d
    def pr(x): 
        return comb(a+b,x)*comb(c+d,a+c-x)/comb(n,a+c)
    lo, hi = max(0,a+c-(c+d)), min(a+b,a+c)
    p0 = pr(a)
    return sum(pr(x) for x in range(lo,hi+1) if pr(x) <= p0*1.000001)

sec = p[p.mm <= 5].copy()
sec["desde"] = sec.apply(lambda r: next((k for k in range(1,6)
                   if pd.notna(r.get(f"mm_l{k}")) and r[f"mm_l{k}"] > 5), 99), axis=1)
b = sec[sec.desde == 99]
print("="*80); print("TESTE: cada janela residual contra a BASE (solo recuperado)")
print(f"  BASE: {b.op.sum()}/{len(b)} operaram = {b.op.mean():.2f}")
for k in (1,2,3,4):
    g = sec[sec.desde == k]
    pv = fisher(g.op.sum(), len(g)-g.op.sum(), b.op.sum(), len(b)-b.op.sum())
    print(f"  D+{k}: {g.op.sum():2d}/{len(g):2d} = {g.op.mean():.2f}  | Fisher p = {pv:.4f}"
          f"  {'*** significativo' if pv<0.05 else '(nao significativo)'}")
g12 = sec[sec.desde.isin([1,2])]
pv = fisher(g12.op.sum(), len(g12)-g12.op.sum(), b.op.sum(), len(b)-b.op.sum())
print(f"  D+1 e D+2 juntos: {g12.op.sum()}/{len(g12)} = {g12.op.mean():.2f} | Fisher p = {pv:.4f}")
print(f"  => queda de {(1-g12.op.mean()/b.op.mean())*100:.0f}% na chance de operar nos 2 dias seguintes.")

print("="*80); print("API DEFASADO (so chuva de D-1 em diante; exclui a chuva do proprio dia)")
def auc(y,x):
    r = pd.Series(x).rank().values; n1,n0 = y.sum(), (1-y).sum()
    return (r[y==1].sum() - n1*(n1+1)/2)/(n1*n0)
best = None
for k in np.arange(0.30, 0.96, 0.05):
    a = p.groupby("fazenda").mm.transform(
        lambda s: sum(s.shift(i)*(k**(i-1)) for i in range(1,15)).fillna(0))
    A = 1-auc(p.op.values, a.values)
    print(f"  k={k:.2f}  AUC bloqueio = {A:.3f}")
    if best is None or A > best[1]: best = (round(k,2), A, a)
k, A, a = best
p["api_lag"] = a
nul = [1-auc(rng.permutation(p.op.values), a.values) for _ in range(4000)]
print(f"  => melhor k = {k} | AUC = {A:.3f} | p (permutacao) = {np.mean(np.array(nul)>=A):.4f}")
cand = np.unique(p.api_lag.round(1))
J = [((p.op[p.api_lag<=t].mean()) - (p.op[p.api_lag>t].mean()), t) for t in cand
     if 8 <= (p.api_lag<=t).sum() <= len(p)-8]
lim = max(J)[1]
print(f"  => limiar de Youden: API defasado = {lim:.1f} mm")
print(f"     P(operar) <= limiar: {p.op[p.api_lag<=lim].mean():.2f} "
      f"({(p.api_lag<=lim).sum()} dias) | > limiar: {p.op[p.api_lag>lim].mean():.2f} "
      f"({(p.api_lag>lim).sum()} dias)")
p["fx"] = pd.qcut(p.api_lag, 6, duplicates="drop")
print(p.groupby("fx", observed=True).agg(dias=("op","size"), p_operar=("op","mean"),
      ha_medio=("ha","mean")).round(2).to_string())
p.to_csv(S/"calib_painel.csv", index=False)
open(S/"calib_params.txt","a").write(f"K_LAG={k}\nAPI_LAG_LIM={lim}\nAUC_LAG={A}\n")
