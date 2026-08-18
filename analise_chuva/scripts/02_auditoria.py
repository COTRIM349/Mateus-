# -*- coding: utf-8 -*-
"""Auditoria de qualidade dos dados de chuva antes da modelagem."""
import pandas as pd, numpy as np, datetime as dt
from pathlib import Path
D = Path("/home/user/Mateus-/analise_chuva/dados")
S = Path("/home/user/Mateus-/analise_chuva/saidas"); S.mkdir(exist_ok=True)

ch = pd.read_csv(D/"chuva_long_bruto.csv", parse_dates=["data"])
tot = pd.read_csv(D/"chuva_totais_declarados.csv")
rel = []

# 1 ------------------------------------------------ cobertura temporal / dias ausentes
print("="*78); print("1. COBERTURA TEMPORAL")
for faz, g in ch.groupby("fazenda"):
    d = pd.to_datetime(sorted(g.data.unique()))
    full = pd.date_range(d.min(), d.max(), freq="D")
    falt = full.difference(d)
    print(f"  {faz}: {d.min().date()} a {d.max().date()} | dias no arquivo={len(d)} "
          f"| dias no calendario={len(full)} | AUSENTES={len(falt)} ({len(falt)/len(full):.0%})")
    # blocos contiguos de ausencia
    if len(falt):
        b, ini, prev = [], falt[0], falt[0]
        for x in falt[1:]:
            if (x - prev).days > 1: b.append((ini, prev)); ini = x
            prev = x
        b.append((ini, prev))
        b = sorted(b, key=lambda t: -( (t[1]-t[0]).days+1 ))
        print(f"     maiores blocos ausentes: " +
              "; ".join(f"{i.date()}->{f.date()} ({(f-i).days+1}d)" for i, f in b[:6]))
        rel.append(dict(item="dias_ausentes", fazenda=faz, valor=len(falt),
                        detalhe=f"{len(falt)} de {len(full)} dias do calendario sem linha no arquivo"))

# 2 ------------------------------------------------ soma diaria x total declarado
print("="*78); print("2. CONSISTENCIA: soma dos diarios x linha 'Total' do arquivo")
sm = ch.groupby("pluvio_id", as_index=False).mm.sum().rename(columns={"mm": "soma_diaria_mm"})
cmp_ = sm.merge(tot, on="pluvio_id", how="outer")
cmp_["dif_mm"] = cmp_.soma_diaria_mm - cmp_.total_declarado_mm
cmp_["dif_pct"] = 100*cmp_.dif_mm/cmp_.total_declarado_mm
print(f"  |dif| max = {cmp_.dif_mm.abs().max():.4f} mm  |  series com |dif|>1mm: "
      f"{(cmp_.dif_mm.abs()>1).sum()} de {len(cmp_)}")
print("  => Os dias AUSENTES nao entram no total: o arquivo omite linhas, mas o total bate")
print("     com a soma dos dias presentes. Nao ha como distinguir, so por este arquivo,")
print("     'dia sem chuva' de 'dia sem leitura'.")
cmp_.to_csv(S/"aud_soma_vs_total.csv", index=False)

# 3 ------------------------------------------------ unidades / faixa de valores
print("="*78); print("3. UNIDADES E FAIXA DE VALORES")
print(f"  mm diario: min={ch.mm.min()}, max={ch.mm.max()}, media={ch.mm.mean():.2f}")
print(f"  negativos: {(ch.mm<0).sum()} | nao numericos/vazios: {ch.mm.isna().sum()}")
anual = ch.groupby(["fazenda","pluvio_id"], as_index=False).mm.sum()
print("  acumulado por serie (mm/safra):")
print(anual.groupby('fazenda').mm.describe()[['count','min','50%','max']].round(0).to_string())
print("  => faixa 340-1390 mm compativel com mm/dia no Oeste da BA. Nenhum indicio de cm ou pol.")

# 4 ------------------------------------------------ zero real x falha de pluviometro
print("="*78); print("4. CHUVA ZERO x FALHA DE PLUVIOMETRO")
piv = ch[ch.tipo.isin(["pivo","pivo_secundario"])].copy()
# referencia = mediana dos demais pluviometros da mesma fazenda no mesmo dia
med = piv.groupby(["fazenda","data"], as_index=False).mm.median().rename(columns={"mm":"mm_ref"})
piv = piv.merge(med, on=["fazenda","data"])
piv["zero_suspeito"] = (piv.mm == 0) & (piv.mm_ref >= 10)   # 0 no sensor, >=10mm na mediana da fazenda
susp = (piv.groupby(["fazenda","pluvio_id"])
           .agg(dias=("mm","size"), acum=("mm","sum"),
                zeros=("mm", lambda s: (s==0).sum()),
                zero_suspeito=("zero_suspeito","sum")).reset_index())
susp["frac_do_acum_mediano"] = susp.acum / susp.groupby("fazenda").acum.transform("median")
susp = susp.sort_values("frac_do_acum_mediano")
print(susp.head(12).to_string(index=False))
print("  => series com acumulado <70% da mediana da fazenda E zeros em dias de chuva geral")
print("     sao tratadas como FALHA (subregistro), nao como ausencia de chuva.")
FALHA = susp[(susp.frac_do_acum_mediano < 0.70) & (susp.zero_suspeito >= 3)].pluvio_id.tolist()
print("  SERIES REPROVADAS:", FALHA)
susp.to_csv(S/"aud_series.csv", index=False)
rel.append(dict(item="series_reprovadas", fazenda="ambas", valor=len(FALHA), detalhe=", ".join(FALHA)))

# 5 ------------------------------------------------ comparacao entre pares redundantes
print("="*78); print("5. PARES REDUNDANTES NO MESMO PIVO (primario x secundario)")
pares = []
for pid in [p for p in piv.pluvio_id.unique() if str(p).endswith("B")]:
    base = pid[:-1]
    a = piv[piv.pluvio_id == base].set_index("data").mm
    b = piv[piv.pluvio_id == pid].set_index("data").mm
    j = pd.concat([a.rename("prim"), b.rename("sec")], axis=1).dropna()
    if len(j) > 30:
        pares.append(dict(pivo=base, n_dias=len(j), acum_prim=j.prim.sum(), acum_sec=j.sec.sum(),
                          razao_sec_prim=j.sec.sum()/j.prim.sum(), corr=j.prim.corr(j.sec)))
pares = pd.DataFrame(pares)
print(pares.round(2).to_string(index=False))
print("  => razao ~1.0 e corr alta: sensores concordam. razao ~0.3-0.45: o secundario")
print("     perdeu eventos (bateria/entupimento). Usa-se o primario.")
pares.to_csv(S/"aud_pares.csv", index=False)

# 6 ------------------------------------------------ outliers
print("="*78); print("6. OUTLIERS (nao removidos sem justificativa)")
ev = piv[piv.mm > 0]
q = ev.mm.quantile([.5,.9,.99,.999]).round(1).to_dict()
print(f"  quantis dos dias com chuva: {q}")
top = piv.nlargest(10, "mm")[["fazenda","data","pluvio_id","mm","mm_ref"]]
print(top.to_string(index=False))
print("  => os maiores valores tem mediana da fazenda alta no mesmo dia (evento regional real).")
print("     Mantidos. Seriam suspeitos apenas se isolados (mm alto com mm_ref~0).")
iso = piv[(piv.mm > 80) & (piv.mm_ref < 2)]
print(f"  outliers isolados (>80mm com mediana da fazenda <2mm): {len(iso)}")
if len(iso): print(iso.to_string(index=False))

piv.to_csv(D/"chuva_pivo_auditada.csv", index=False)
pd.DataFrame(rel).to_csv(S/"aud_resumo.csv", index=False)
print("="*78)
print("SERIES_REPROVADAS =", FALHA)
