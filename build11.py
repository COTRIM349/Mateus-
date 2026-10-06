# -*- coding: utf-8 -*-
"""
Manejo de Irrigacao Karitel/RDM - v7
- So aparecem pivos JA PLANTADOS (coluna Plantado? + filtro automatico SIM;
  nao plantados ficam ocultos). Avisar plantio = preencher a data real.
- Modulo como COLUNA (tabela plana, filtravel/ordenavel).
- Emergencia 5 dias SO para soja e algodao (DAE=DAP-5); outros DAE=DAP.
- Curva de Kc (grafico) e necessidade semanal visiveis em cada aba.
- ETo semanal; Kc linear por DAE.
"""
import sys, datetime as dt, collections, unicodedata
SP="/tmp/claude-0/-home-user-Mateus-/5434c11b-e297-56e9-a40e-44c7960db080/scratchpad"
sys.path.insert(0,SP)
import parse_sources as PS, parse_2627 as P27, kc_daily, parse_algodao as PA
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.chart import LineChart, Reference

OUT="/home/user/Mateus-/Manejo_Irrigacao_Karitel_RDM.xlsx"
HOJE=dt.date(2026,10,5)

PIVOS=PS.parse_pivos(); LAM_K,HOR_K=PS.parse_lamina_hora("Karitel"); LAM_R,HOR_R=PS.parse_lamina_hora("RDM")
CROP=P27.rows_2627(); PCTS=PS.PCTS; KCCOLS=kc_daily.build(); KCMAXD=len(KCCOLS["MILHO"])

def noacc(s): return "".join(c for c in unicodedata.normalize("NFD",s) if unicodedata.category(c)!="Mn")
def numonly(s):
    d="".join(c for c in str(s) if c.isdigit());return str(int(d)) if d else ""
PBN={numonly(p["pivo"]):p for p in PIVOS}
# CE de captacao por (fazenda, modulo cadastro) = soma potencia / soma vazao das bombas
CAPT=PS.parse_captacoes()
import collections as _col
_cap=_col.defaultdict(lambda:[0.0,0.0])
for _c in CAPT:
    if _c["vazao"] and _c["pot_kw"]:
        _cap[(_c["fazenda"].strip().title(),_c["modulo"])][0]+=_c["pot_kw"]
        _cap[(_c["fazenda"].strip().title(),_c["modulo"])][1]+=_c["vazao"]
CE_CAPT={k:(pw/vz if vz else None) for k,(pw,vz) in _cap.items()}
def ce_pivo(p):
    # SO pressurizacao (kW/vazao). A captacao e contada 1x no modulo (DASHBOARD), para nao somar 2x.
    if not p: return None
    press=(p["pot_kw"]/p["vazao"]) if (p.get("pot_kw") and p.get("vazao")) else 0
    return round(press,3) if press>0 else None
def modop(num,casa):
    n=int(num) if num.isdigit() else None
    if n and 101<=n<=133:return "RDM"
    if casa and casa.upper().startswith("RM"):return "RDM"
    if n and (1<=n<=34 or n in(75,76)):return "Modulo 1"
    if casa in {"R8","R9","R10","R11","R12"}:return "Modulo 2"
    if casa in {"R13","R14","R15","R16","R17","R18"}:return "Modulo 3"
    return "Outros"
SOJA_OCUP={"CZ 37B07 I2X":108,"COMBATE IPRO":114,"ATAQUE I2X":140,"NEO 761 I2X":116,"BMX Olimpo IPRO":122,
"NEO 690 I2X":108,"CZ 48B18 IPRO":125,"M8434 12X":130,"CZ 58B10 I2X":125,"COMPLETA IPRO":120,"MURALHA IPRO":125,
"BMX DOMINIO IPRO":130,"GUEPARDO":105,"NEO 780 CE":120,"ST 76KA72":116,"SPARTA I2X":120,"NEO 811 I2X":125}
ALGO_CL={"DP 1949 B3RF":"PRECOCE","FM 911 GLTP":"PRECOCE","FM 974 GLT":"MEDIO","FM 985 GLTP":"TARDIO",
"FM 990 STP":"TARDIO","TMG 33 B3RF":"PRECOCE","DP 2111 B3RF":"PRECOCE","IMA 5901 B2RF":"MEDIO",
"DP 2176 B3RF":"TARDIO","FM 933 STP":"MEDIO","TAURA B3XF":"PRECOCE","IMA 5801 B2RF":"MEDIO",
"DP 2104 B3XF":"MEDIO","FM 979 STP":"TARDIO","IMA 563 B3XF":"MEDIO"}
SOJA_GRM={"CZ 37B07 I2X":7.0,"COMBATE IPRO":7.4,"ATAQUE I2X":8.2,"NEO 761 I2X":7.6,"BMX Olimpo IPRO":7.7,
"NEO 690 I2X":6.9,"CZ 48B18 IPRO":8.1,"M8434 12X":8.4,"CZ 58B10 I2X":8.1,"COMPLETA IPRO":7.9,"MURALHA IPRO":8.2,
"BMX DOMINIO IPRO":8.4,"GUEPARDO":6.7,"NEO 780 CE":7.8,"ST 76KA72":7.6,"SPARTA I2X":7.7,"NEO 811 I2X":8.1}
ALGO_OCUP={"PRECOCE":180,"MEDIO":195,"TARDIO":210}
# Ky - fator de resposta da cultura (FAO-33, periodo total). Soja/algodao/milho com seguranca;
# tabaco referencia (verificar); cacau nao consolidado na FAO-33 -> deixar em branco.
KY={"SOJA":0.85,"ALGODÃO":0.85,"MILHO":1.25,"TABACO":0.90,"CACAU":None}
def ky_cult(cult):
    c="MILHO" if cult.startswith("MILHO") else cult
    return KY.get(c)
# populacao (sementes/ha) por talhao de soja (arquivo soja 26/27)
_sf=P27.soja_file() if hasattr(P27,"soja_file") else {}
SOJA_POP={}
for _k,_v in _sf.items():
    _faz,_tal=_k
    if str(_tal).isdigit(): SOJA_POP[(_faz,str(int(_tal)))]=_v.get("pop")
def classe_col(cult,var):
    if cult=="SOJA":
        c=noacc(PA.soja_classe(SOJA_OCUP.get(var,120)));return c,f"SOJA_{c}"
    if cult=="ALGODÃO":
        c=ALGO_CL.get(var,"MEDIO");return c,f"ALG_{c}"
    if cult.startswith("MILHO"):return "","MILHO"
    if cult=="TABACO":return "","TABACO"
    if cult=="CACAU":return "","CACAU"
    return "",""
def enrich(c):
    tal=str(c["talhao"]).strip()
    num=str(int(tal)) if tal.isdigit() else ""   # so talhao PURAMENTE numerico vira numero de pivo (C1/C2/ASV2 nao colidem)
    p=PBN.get(num) if num else None;casa=p["casa"] if p else ""
    cl,colk=classe_col(c["cultura"],c["variedade"])
    cultg="MILHO" if c["cultura"].startswith("MILHO") else c["cultura"]
    var=c["variedade"]
    grm=SOJA_GRM.get(var) if c["cultura"]=="SOJA" else None
    if c["cultura"]=="SOJA": ocup=SOJA_OCUP.get(var)
    elif c["cultura"]=="ALGODÃO": ocup=ALGO_OCUP.get(cl)
    else: ocup=None
    pop=SOJA_POP.get((str(c["fazenda"]).strip().title(),num)) if c["cultura"]=="SOJA" else None
    return dict(pivo=(p["pivo"] if p else f"T{c['talhao']}"),num=num,casa=casa,modop=modop(num,casa),
        cultura=c["cultura"],cultgrp=cultg,variedade=var,classe=cl,colkey=colk,plantio=c["plantio"],
        area=c["area"] or (p["area"] if p else None),cod=f"P{num}" if num else "",ce=ce_pivo(p),
        potkw=(p["pot_kw"] if p else None),vazao=(p["vazao"] if p else None),grm=grm,ocup=ocup,pop=pop,
        ky=ky_cult(c["cultura"]))
def _is_pivot(c):
    tal=str(c["talhao"]).strip()
    return tal.isdigit() and str(int(tal)) in PBN   # APENAS pivos reais (exclui C1/C2/C3, ASV2, etc.)
ROWS=[enrich(c) for c in CROP
      if (c["cultura"] in ("SOJA","ALGODÃO","TABACO","CACAU") or c["cultura"].startswith("MILHO"))
      and _is_pivot(c)]

# estilos
FONT="Arial"
C_TITLE=Font(name=FONT,size=14,bold=True,color="1F3864");C_SUB=Font(name=FONT,size=10,italic=True,color="595959")
C_HEAD=Font(name=FONT,size=9,bold=True,color="FFFFFF");C_TXT=Font(name=FONT,size=10,color="000000")
C_SML=Font(name=FONT,size=9,color="000000");C_INPUT=Font(name=FONT,size=10,color="0000FF")
C_LINK=Font(name=FONT,size=10,color="008000");C_PEND=Font(name=FONT,size=9,bold=True,color="C00000")
C_NOTE=Font(name=FONT,size=9,italic=True,color="7F7F7F");C_HELP=Font(name=FONT,size=8,color="BFBFBF")
F_HEAD=PatternFill("solid",fgColor="1F3864");F_HEAD2=PatternFill("solid",fgColor="2E5496")
F_INPUT=PatternFill("solid",fgColor="FFF2CC");F_PEND=PatternFill("solid",fgColor="FCE4D6")
F_CALC=PatternFill("solid",fgColor="F2F2F2");F_IMP=PatternFill("solid",fgColor="E2EFDA");F_OK=PatternFill("solid",fgColor="E2EFDA")
F_NEC=PatternFill("solid",fgColor="DDEBF7");F_HELPF=PatternFill("solid",fgColor="FAFAFA")
thin=Side(style="thin",color="D0D0D0");BORDER=Border(left=thin,right=thin,top=thin,bottom=thin)
CENTER=Alignment("center","center",wrap_text=True);LEFT=Alignment("left","center",wrap_text=True);RIGHT=Alignment("right","center")
NUM1="0.0";NUM2="0.00";NUM3="0.000";INT="#,##0";M3="#,##0.0";DATE="dd/mm/yyyy"

wb=Workbook();wb.remove(wb.active)
EF="EF_APLIC";TURNO="TURNO";GAT="FRAC_ACOMP";DREF="DATA_REF";ETOSEM="ETO_SEM";CHUVASEM="CHUVA_SEM"
def ws(n,c=None):
    s=wb.create_sheet(n)
    if c:s.sheet_properties.tabColor=c
    s.sheet_view.showGridLines=False;return s
def title(s,t,sub=None):
    s["A1"]=t;s["A1"].font=C_TITLE
    if sub:s["A2"]=sub;s["A2"].font=C_SUB
    s.row_dimensions[1].height=20
def hrow(s,row,hs,c0=1):
    for i,h in enumerate(hs):
        c=s.cell(row=row,column=c0+i,value=h);c.font=C_HEAD;c.fill=F_HEAD;c.alignment=CENTER;c.border=BORDER
    s.row_dimensions[row].height=30
def setw(s,w):
    for k,v in w.items():s.column_dimensions[k].width=v
def C(s,ref,val=None,font=C_TXT,fill=None,align=None,fmt=None,border=True):
    c=s[ref]
    if val is not None:c.value=val
    c.font=font
    if fill:c.fill=fill
    c.alignment=align or LEFT
    if fmt:c.number_format=fmt
    if border:c.border=BORDER
    return c

# ========== PARAMETROS
s=ws("PARAMETROS","808080");setw(s,{"A":38,"B":14,"C":11,"D":52})
title(s,"PARAMETROS","Manejo via clima (ETo semanal) + Kc por DAE.")
hrow(s,4,["Parametro","Valor","Unidade","Observacao"])
par=[("Eficiencia de aplicacao",0.90,"fracao","Lamina bruta = liquida / eficiencia."),
("Lamina alvo / turno (mm liq)",10,"mm","Irriga quando a necessidade liquida da semana atinge este valor."),
("Gatilho de acompanhamento",0.80,"fracao","Fracao do alvo para 'Acompanhar'."),
("Data de referencia (HOJE)",HOJE,"data","Base do DAP/DAE e da semana atual."),
("Dias p/ emergencia (soja/algodao)",5,"dias","DAE = DAP - este valor, so para soja e algodao."),]
r=5
for n,v,u,o in par:
    C(s,f"A{r}",n,C_TXT,F_CALC)
    fmt=DATE if isinstance(v,dt.date) else (NUM2 if isinstance(v,float) else None)
    C(s,f"B{r}",v,C_INPUT,F_INPUT,RIGHT if not isinstance(v,str) else CENTER,fmt)
    C(s,f"C{r}",u,C_NOTE,None,CENTER);C(s,f"D{r}",o,C_NOTE);r+=1
for nm,ref in {"EF_APLIC":"'PARAMETROS'!$B$5","TURNO":"'PARAMETROS'!$B$6","FRAC_ACOMP":"'PARAMETROS'!$B$7","DATA_REF":"'PARAMETROS'!$B$8"}.items():
    try:wb.defined_names[nm]=DefinedName(nm,attr_text=ref)
    except Exception:wb.defined_names.add(DefinedName(nm,attr_text=ref))
C(s,"A11","AVISAR PLANTIO: nas abas de cultura, preencha a DATA DE PLANTIO real do pivo. Ele vira 'Plantado=SIM' e aparece. "
  "Para atualizar a lista, use Dados > Reaplicar (o filtro mostra so os plantados).",C_NOTE)
s.merge_cells("A11:D11")

# ========== ETO_SEMANAL
s=ws("ETO_SEMANAL","2E75B6");setw(s,{"A":16,"B":14,"C":14,"D":34})
title(s,"ETO_SEMANAL - clima por semana (ATUALIZAR TODA SEMANA)","ETo (mm/sem) e chuva (mm/sem). Semana atual pela data de referencia.")
C(s,"A3","ETo da semana atual (mm):",C_TXT,None,RIGHT);C(s,"A2","Chuva da semana atual (mm):",C_TXT,None,RIGHT)
hrow(s,5,["Semana (inicio)","ETo (mm/sem)","Chuva (mm/sem)","Obs"]);s.freeze_panes="A6"
ETO_INI=6;d0=dt.date(2026,8,31);r=6
for k in range(60):
    d=d0+dt.timedelta(days=7*k);passou=d<=HOJE
    C(s,f"A{r}",d,C_LINK,F_IMP if passou else None,CENTER,DATE)
    C(s,f"B{r}",None,C_INPUT,F_INPUT,RIGHT,NUM1)   # ETo: VOCE insere (sem placeholder)
    C(s,f"C{r}",None,C_INPUT,F_INPUT,RIGHT,NUM1);C(s,f"D{r}",None,C_NOTE);r+=1
ETO_LAST=r-1
SEM_COL=f"ETO_SEMANAL!$A${ETO_INI}:$A${ETO_LAST}";ETOW=f"ETO_SEMANAL!$B${ETO_INI}:$B${ETO_LAST}";CHW=f"ETO_SEMANAL!$C${ETO_INI}:$C${ETO_LAST}"
C(s,"B3",f'=IFERROR(INDEX({ETOW},MATCH({DREF},{SEM_COL},1)),"")',C_TXT,F_OK,CENTER,NUM1)
C(s,"B2",f'=IFERROR(INDEX({CHW},MATCH({DREF},{SEM_COL},1)),"")',C_TXT,F_OK,CENTER,NUM1)
for nm,rf in {"ETO_SEM":"'ETO_SEMANAL'!$B$3","CHUVA_SEM":"'ETO_SEMANAL'!$B$2"}.items():
    try:wb.defined_names[nm]=DefinedName(nm,attr_text=rf)
    except Exception:wb.defined_names.add(DefinedName(nm,attr_text=rf))

# ========== CURVAS_KC (+ grafico geral)
s=ws("CURVAS_KC","548235")
title(s,"CURVAS_KC - Kc diario por cultura/classe (LINEAR, por DAE)","Fonte: FAO-56 Tabela 12. Soja 0,40/1,15/0,50; Algodao 0,35/1,20/0,60; Milho 0,30/1,20/0,60; Tabaco 0,35/1,10/0,90; Cacau 0,90/1,00/1,00.")
keys=list(KCCOLS.keys())
hrow(s,4,["DAE"]+keys);s.freeze_panes="B5";setw(s,{"A":7})
for i,k in enumerate(keys):setw(s,{get_column_letter(2+i):11})
KC_INI=5
for d in range(KCMAXD):
    rr=KC_INI+d;C(s,f"A{rr}",d+1,C_SML,F_HELPF,CENTER,INT)
    for i,k in enumerate(keys):C(s,f"{get_column_letter(2+i)}{rr}",KCCOLS[k][d],C_SML,F_IMP,CENTER,NUM2)
KC_LAST=KC_INI+KCMAXD-1
KC_RANGE=f"CURVAS_KC!$B${KC_INI}:${get_column_letter(1+len(keys))}${KC_LAST}"
KC_DAE=f"CURVAS_KC!$A${KC_INI}:$A${KC_LAST}";KC_HDR=f"CURVAS_KC!$B$4:${get_column_letter(1+len(keys))}$4"
KEY_COLLETTER={k:get_column_letter(2+i) for i,k in enumerate(keys)}

# ========== LAMINA_HORA
s=ws("LAMINA_HORA","4472C4")
title(s,"LAMINA_HORA - lamina (mm) e horas por percentimetro (importado)","Usado nas abas de cultura.")
hrow(s,4,["Cod","Faz"]+[f"L{p}" for p in PCTS])
HOFF=2+len(PCTS)+1
for i,p in enumerate(PCTS):
    c=s.cell(row=4,column=HOFF+i,value=f"H{p}");c.font=C_HEAD;c.fill=F_HEAD2;c.alignment=CENTER;c.border=BORDER
for i,p in enumerate(PCTS):
    s.cell(row=3,column=3+i,value=p).font=C_HELP;s.cell(row=3,column=HOFF+i,value=p).font=C_HELP
r=5
def putb(lam,hor,faz):
    global r
    for cod,vals in lam.items():
        C(s,f"A{r}",cod,C_LINK,F_IMP,CENTER);C(s,f"B{r}",faz,C_LINK,F_IMP,CENTER)
        for i,v in enumerate(vals):C(s,f"{get_column_letter(3+i)}{r}",v,C_SML,F_IMP,RIGHT,NUM2)
        for i,v in enumerate(hor.get(cod,[None]*len(PCTS))):C(s,f"{get_column_letter(HOFF+i)}{r}",v,C_SML,F_IMP,RIGHT,NUM2)
        r+=1
putb(LAM_K,HOR_K,"Karitel");putb(LAM_R,HOR_R,"RDM")
LH_LAST=r-1
setw(s,{"A":7,"B":8})
for i in range(len(PCTS)):
    s.column_dimensions[get_column_letter(3+i)].width=5;s.column_dimensions[get_column_letter(HOFF+i)].width=5
s.freeze_panes="C5"
LAM_RANGE=f"LAMINA_HORA!$C$5:${get_column_letter(2+len(PCTS))}${LH_LAST}";LAM_PCT=f"LAMINA_HORA!$C$3:${get_column_letter(2+len(PCTS))}$3"
HOR_RANGE=f"LAMINA_HORA!${get_column_letter(HOFF)}$5:${get_column_letter(HOFF+len(PCTS)-1)}${LH_LAST}";HOR_PCT=f"LAMINA_HORA!${get_column_letter(HOFF)}$3:${get_column_letter(HOFF+len(PCTS)-1)}$3"
COD_COL=f"LAMINA_HORA!$A$5:$A${LH_LAST}"

# ========== CADASTRO (dados fixos da lavoura: variedade, pop, plantas/m, GRM, Ky, ciclo, ocupacao)
HC=["Cod","Pivo","Modulo","Cultura","Variedade","Classe","Ciclo (dias)","Ocupacao (dias)","Pop (pl/ha)","Espac (m)","Plantas/m","GRM","Ky","Curva Kc"]
sc=ws("CADASTRO","00B050")
setw(sc,{"A":6,"B":9,"C":9,"D":10,"E":16,"F":9,"G":10,"H":12,"I":11,"J":8,"K":9,"L":7,"M":7,"N":12})
title(sc,"CADASTRO - dados agronomicos por pivo (fonte unica)",
      "Variedade, populacao, plantas/m, GRM, Ky, ciclo e ocupacao. As abas de manejo puxam ciclo/ocupacao/curva Kc daqui (por Cod).")
hrow(sc,4,HC);sc.freeze_panes="B5"
cadrows=sorted([it for it in ROWS if it["cod"]],
               key=lambda x:(["SOJA","ALGODÃO","MILHO","TABACO","CACAU"].index(x["cultgrp"]) if x["cultgrp"] in ["SOJA","ALGODÃO","MILHO","TABACO","CACAU"] else 9,
                             int(x["num"]) if x["num"].isdigit() else 999))
r=5
for it in cadrows:
    C(sc,f"A{r}",it["cod"],C_LINK,F_IMP,CENTER);C(sc,f"B{r}",it["pivo"],C_LINK,F_IMP,CENTER)
    C(sc,f"C{r}",it["modop"],C_LINK,F_IMP,CENTER);C(sc,f"D{r}",it["cultura"],C_LINK,F_IMP,CENTER)
    C(sc,f"E{r}",it["variedade"],C_INPUT,F_INPUT,LEFT)
    C(sc,f"F{r}",it["classe"],C_INPUT,F_INPUT,CENTER)
    # Ciclo (da cultivar): verde quando vem do cadastro; editavel quando nao tenho o dado
    C(sc,f"G{r}",it["ocup"],C_LINK if it["ocup"] else C_INPUT,F_IMP if it["ocup"] else F_INPUT,CENTER,INT)
    # Ocupacao em campo: editavel, default = ciclo (ajuste se o talhao fica ocupado alem da colheita)
    C(sc,f"H{r}",f'=IF($G{r}="","",$G{r})',C_INPUT,F_INPUT,CENTER,INT)
    C(sc,f"I{r}",it["pop"],C_INPUT,F_INPUT,RIGHT,INT)
    C(sc,f"J{r}",0.5,C_INPUT,F_INPUT,RIGHT,NUM2)
    C(sc,f"K{r}",f'=IF(OR($I{r}="",$J{r}=""),"",$I{r}*$J{r}/10000)',C_TXT,F_CALC,RIGHT,NUM1)
    C(sc,f"L{r}",it["grm"],C_LINK if it["grm"] else C_INPUT,F_IMP if it["grm"] else F_INPUT,CENTER,NUM1)
    # Ky: verde onde tenho (soja/algodao/milho); tabaco referencia; cacau em branco (verificar)
    C(sc,f"M{r}",it["ky"],C_LINK if it["ky"] else C_INPUT,F_IMP if it["ky"] else F_INPUT,CENTER,NUM2)
    C(sc,f"N{r}",it["colkey"],C_LINK,F_IMP,CENTER)
    r+=1
CADLAST=r-1
C(sc,f"A{CADLAST+1}","Ky (FAO-33, periodo total): soja 0,85 / algodao 0,85 / milho 1,25 (valores de literatura). "
  "Tabaco 0,90 = referencia, CONFERIR. Cacau: nao consolidado na FAO-33 (perene) - preencher se tiver o seu valor. "
  "Ciclo = ciclo da cultivar; Ocupacao = tempo que o talhao fica ocupado (default = ciclo, ajuste se precisar). "
  "Ky serve para estimar perda de produtividade quando falta agua: (1 - Ya/Ym) = Ky x (1 - ETreal/ETc).",C_NOTE)
sc.merge_cells(start_row=CADLAST+1,start_column=1,end_row=CADLAST+1,end_column=len(HC))
CAD_COD=f"CADASTRO!$A$5:$A${CADLAST}";CAD_TBL=f"CADASTRO!$A$5:$N${CADLAST}"

# ========== aba por cultura (manejo + PROGRAMACAO SEMANAL embutida: Seg..Dom)
DIAS=["Seg","Ter","Qua","Qui","Sex","Sab","Dom"]
H=["Pivo","Modulo","Casa b.","Cultura","Area(ha)","Ciclo (dias)","Ocup (dias)",
   "Data plantio","Plantado?","DAP","DAE","Kc",
   "Ult.irrig","ETo acum","Chuva acum","ETc acum","Nec liq (mm)","Nec BRUTA (mm)"]+DIAS+[
   "Lam sem(mm)","Horas sem","Volume(m3)","Energia(kWh)","Decisao","Perda % (deficit)","Ky","CE(kWh/m3)","Vazao(m3/h)","Pot(kW)","Curva Kc","Cod"]
JANELA_H=168  # horas na semana: acima disso o pivo nao repoe a demanda (gargalo)
FILL_SIM=PatternFill("solid",fgColor="E2EFDA")  # verde claro: vai irrigar
FILL_GARG=PatternFill("solid",fgColor="F8CBAD")  # laranja/vermelho: gargalo
FONT_GARG=Font(name="Arial",size=10,bold=True,color="9C0006")
IDX={h:get_column_letter(i+1) for i,h in enumerate(H)}
# letras dinamicas das colunas de cultura (usadas no DASHBOARD/OS) - se adaptam se H mudar
MOD_L=IDX["Modulo"];VAZ_L=IDX["Vazao(m3/h)"];POT_L=IDX["Pot(kW)"];VOL_L=IDX["Volume(m3)"];ENE_L=IDX["Energia(kWh)"]
HORAS_L=IDX["Horas sem"];LAM_L=IDX["Lam sem(mm)"];COD_L=IDX["Cod"];CASA_L=IDX["Casa b."];CULT_L=IDX["Cultura"]
DIA_L={d:IDX[d] for d in DIAS}
CULT_CURVE_COLS={"SOJA":["SOJA_PRECOCE","SOJA_MEDIA","SOJA_TARDIA"],"ALGODÃO":["ALG_PRECOCE","ALG_MEDIO","ALG_TARDIO"],
                 "MILHO":["MILHO"],"TABACO":["TABACO"],"CACAU":["CACAU"]}
def cultura_tab(nome,cultgrp,cor,titulo,emerg):
    s=ws(nome,cor)
    setw(s,{"A":9,"B":8,"C":7,"D":9,"E":8,"F":8,"G":8,"H":11,"I":8,"J":6,"K":6,"L":7,"M":11,"N":9,"O":9,"P":9,
            "Q":9,"R":11,"S":5,"T":5,"U":5,"V":5,"W":5,"X":5,"Y":5,"Z":10,"AA":10,"AB":11,"AC":12,"AD":11,
            "AE":11,"AF":6,"AG":9,"AH":10,"AI":9,"AJ":12,"AK":6})
    title(s,titulo,f"So pivos PLANTADOS. PROGRAMACAO SEMANAL: ponha o % (percentimetro) no dia (Seg..Dom) que o pivo vai rodar; "
          f"lamina/horas/energia da semana sao somadas. A OS por modulo (OS_GERAL) gera dessa programacao. Emergencia {emerg} dias.")
    hrow(s,4,H)
    # faixa 'PROGRAMACAO SEMANAL' sobre os dias
    sd=IDX[DIAS[0]];ed=IDX[DIAS[-1]]
    from openpyxl.utils import column_index_from_string as _ci
    mc=s.cell(row=3,column=_ci(sd),value="PROGRAMACAO SEMANAL (% por dia)")
    mc.font=Font(name=FONT,bold=True,color="1F3864");mc.alignment=CENTER
    s.merge_cells(start_row=3,start_column=_ci(sd),end_row=3,end_column=_ci(ed))
    s.freeze_panes="E5"
    rws=sorted([it for it in ROWS if it["cultgrp"]==cultgrp and it["cod"]],
               key=lambda x:(x["modop"],int(x["num"]) if x["num"].isdigit() else 999))
    r=5; first=5
    for it in rws:
        lk=lambda h,v,al=LEFT:C(s,f"{IDX[h]}{r}",v,C_LINK,F_IMP,al)
        cc=lambda h,f,fmt=None,al=RIGHT,fl=F_CALC:C(s,f"{IDX[h]}{r}",f,C_TXT,fl,al,fmt)
        lk("Pivo",it["pivo"],CENTER);lk("Modulo",it["modop"],CENTER);lk("Casa b.",it["casa"],CENTER);lk("Cultura",it["cultura"],CENTER)
        lk("Area(ha)",it["area"],RIGHT);s[f'{IDX["Area(ha)"]}{r}'].number_format=M3
        C(s,f'{IDX["Cod"]}{r}',it["cod"],C_INPUT,F_INPUT,CENTER)
        cod=f'${IDX["Cod"]}{r}'
        # ciclo / ocupacao / curva Kc puxados do CADASTRO (fonte unica) por Cod
        cc("Ciclo (dias)",f'=IFERROR(VLOOKUP({cod},{CAD_TBL},7,0),"")',INT,CENTER)
        cc("Ocup (dias)",f'=IFERROR(VLOOKUP({cod},{CAD_TBL},8,0),"")',INT,CENTER)
        C(s,f'{IDX["Curva Kc"]}{r}',f'=IFERROR(VLOOKUP({cod},{CAD_TBL},14,0),"")',C_LINK,F_IMP,CENTER)
        pl=it["plantio"];C(s,f'{IDX["Data plantio"]}{r}',pl,C_INPUT,F_INPUT,CENTER,DATE)  # SEMPRE editavel (avisar plantio)
        P=f'${IDX["Data plantio"]}{r}'
        cc("Plantado?",f'=IF(OR({P}="",{P}>{DREF}),"NAO","SIM")',None,CENTER)
        cc("DAP",f'=IF(OR({P}="",{P}>{DREF}),"",{DREF}-{P})',INT,CENTER)
        dap=f'${IDX["DAP"]}{r}'
        cc("DAE",f'=IF({dap}="","",MAX(0,{dap}-{emerg}))',INT,CENTER)
        dae=f'${IDX["DAE"]}{r}';colk=f'${IDX["Curva Kc"]}{r}'
        cc("Kc",f'=IF({colk}="","PENDENTE",IF({dap}="","",IFERROR(INDEX({KC_RANGE},MATCH(MIN(MAX({dae},1),{KCMAXD}),{KC_DAE},0),MATCH({colk},{KC_HDR},0)),"PENDENTE")))',NUM2,CENTER)
        C(s,f'{IDX["Ult.irrig"]}{r}',f'=IF({P}="","",{P})',C_INPUT,F_INPUT,CENTER,DATE)  # default=plantio; atualize ao irrigar
        ui=f'${IDX["Ult.irrig"]}{r}'
        cc("ETo acum",f'=IF({ui}="","",SUMIFS({ETOW},{SEM_COL},">"&{ui},{SEM_COL},"<="&{DREF}))',NUM1)  # SOMA das ETos semanais do periodo
        cc("Chuva acum",f'=IF({ui}="","",SUMIFS({CHW},{SEM_COL},">"&{ui},{SEM_COL},"<="&{DREF}))',NUM1)
        kc=f'${IDX["Kc"]}{r}';eto=f'${IDX["ETo acum"]}{r}';ch=f'${IDX["Chuva acum"]}{r}'
        cc("ETc acum",f'=IF(OR({kc}="",{kc}="PENDENTE",{eto}=""),"",{kc}*{eto})',NUM1)
        etc=f'${IDX["ETc acum"]}{r}'
        cc("Nec liq (mm)",f'=IF({etc}="","",MAX(0,{etc}-N({ch})))',NUM1)
        nl=f'${IDX["Nec liq (mm)"]}{r}'
        cc("Nec BRUTA (mm)",f'=IF({nl}="","",{nl}/{EF})',NUM1,RIGHT,F_NEC)   # necessidade semanal (bruta) destacada
        # ===== PROGRAMACAO SEMANAL: % por dia (voce preenche no dia que vai irrigar)
        for d in DIAS:
            C(s,f'{IDX[d]}{r}',None,C_INPUT,F_INPUT,CENTER,INT)
        lam_terms="+".join([f'IFERROR(INDEX({LAM_RANGE},MATCH({cod},{COD_COL},0),MATCH(${IDX[d]}{r},{LAM_PCT},0)),0)' for d in DIAS])
        hor_terms="+".join([f'IFERROR(INDEX({HOR_RANGE},MATCH({cod},{COD_COL},0),MATCH(${IDX[d]}{r},{HOR_PCT},0)),0)' for d in DIAS])
        cc("Lam sem(mm)",f'=IF({cod}="","",{lam_terms})',NUM1,CENTER)
        cc("Horas sem",f'=IF({cod}="","",{hor_terms})',NUM1,CENTER)
        # energia: CE de pressurizacao x volume aplicado na semana
        C(s,f'{IDX["CE(kWh/m3)"]}{r}',it["ce"],C_LINK if it["ce"] else C_PEND,F_IMP if it["ce"] else F_PEND,RIGHT,NUM3)
        C(s,f'{IDX["Vazao(m3/h)"]}{r}',it["vazao"],C_LINK if it["vazao"] else C_PEND,F_IMP if it["vazao"] else F_PEND,RIGHT,M3)
        C(s,f'{IDX["Pot(kW)"]}{r}',it["potkw"],C_LINK if it["potkw"] else C_PEND,F_IMP if it["potkw"] else F_PEND,RIGHT,NUM1)
        lam=f'${IDX["Lam sem(mm)"]}{r}';ar=f'${IDX["Area(ha)"]}{r}';ce=f'${IDX["CE(kWh/m3)"]}{r}'
        cc("Volume(m3)",f'=IF(OR({lam}="",{ar}=""),"",{lam}*{ar}*10)',M3)
        vol=f'${IDX["Volume(m3)"]}{r}'
        cc("Energia(kWh)",f'=IF(OR({vol}="",{ce}=""),"",{vol}*{ce})',M3)
        cc("Decisao",f'=IF({kc}="PENDENTE","Definir Kc",IF({nl}="","-",IF({nl}>={TURNO},"IRRIGAR",IF({nl}>={TURNO}*{GAT},"Acompanhar","Aguardar"))))',None,CENTER)
        # Ky (do CADASTRO) e perda potencial de produtividade por deficit (FAO-33)
        C(s,f'{IDX["Ky"]}{r}',f'=IFERROR(VLOOKUP({cod},{CAD_TBL},13,0),"")',C_LINK,F_IMP,CENTER,NUM2)
        kyc=f'${IDX["Ky"]}{r}';etcc=f'${IDX["ETc acum"]}{r}';lams=f'${IDX["Lam sem(mm)"]}{r}'
        # perda% = Ky * (1 - ETreal/ETc)*100 ; ETreal = min(ETc, chuva + lamina_liquida)  (lamina_liquida = Lam sem * eficiencia)
        cc("Perda % (deficit)",f'=IF(OR({etcc}="",{etcc}=0,{kyc}="",{lams}=""),"",MAX(0,{kyc}*({etcc}-MIN({etcc},N({ch})+{lams}*{EF}))/{etcc}*100))',NUM1,CENTER)
        # ocultar se nao plantado (data vazia ou futura)
        planted = bool(it["plantio"]) and it["plantio"]<=HOJE
        if not planted: s.row_dimensions[r].hidden=True
        r+=1
    last=r-1
    # filtro automatico: Plantado = SIM
    if last>=first:
        s.auto_filter.ref=f"A4:{IDX['Cod']}{last}"
        s.auto_filter.add_filter_column(H.index("Plantado?"),["SIM"])
        # ALERTA DE GARGALO: horas da semana acima da janela operacional -> vermelho
        hs=IDX["Horas sem"]
        s.conditional_formatting.add(f"{hs}5:{hs}{last}",
            CellIsRule(operator="greaterThan",formula=[str(JANELA_H)],fill=FILL_GARG,font=FONT_GARG))
    # grafico da curva de Kc dessa cultura
    cols=[KEY_COLLETTER[k] for k in CULT_CURVE_COLS.get(cultgrp,[]) if k in KEY_COLLETTER]
    if cols:
        ch=LineChart();ch.title=f"Curva de Kc - {nome}";ch.height=7;ch.width=14
        ch.x_axis.title="DAE (dias)";ch.y_axis.title="Kc"
        from openpyxl.utils import column_index_from_string
        cmin=min(column_index_from_string(c) for c in cols);cmax=max(column_index_from_string(c) for c in cols)
        data=Reference(wb["CURVAS_KC"],min_col=cmin,max_col=cmax,min_row=4,max_row=KC_LAST)
        cats=Reference(wb["CURVAS_KC"],min_col=1,min_row=KC_INI,max_row=KC_LAST)
        ch.add_data(data,titles_from_data=True);ch.set_categories(cats)
        anchor_row=max(last+3,8)
        s.add_chart(ch,f"A{anchor_row}")
    C(s,f"A{last+1}","Nec BRUTA (azul) = lamina bruta ACUMULADA desde a ultima irrigacao (soma das ETos semanais x Kc, menos chuva, /0,90). Ao irrigar, atualize 'Ult.irrig'. "
      "So aparecem pivos plantados; preencha a Data plantio para um novo pivo e use Dados>Reaplicar.",C_NOTE)
    s.merge_cells(start_row=last+1,start_column=1,end_row=last+1,end_column=len(H))

cultura_tab("SOJA","SOJA","70AD47","SOJA 26/27 - manejo",5)
cultura_tab("ALGODÃO".replace("Ã","A") if False else "ALGODAO","ALGODÃO","ED7D31","ALGODAO 26/27 - manejo",5)
cultura_tab("TABACO","TABACO","FFC000","TABACO 26/27 - manejo",0)
cultura_tab("CACAU","CACAU","843C0C","CACAU - manejo (perene)",0)
cultura_tab("MILHO","MILHO","FFD966","MILHO 26/27 - manejo",0)

# ===== helpers cross-sheet (puxam das abas de cultura por Cod/Modulo) =====
SHEETS=["SOJA","ALGODAO","TABACO","CACAU","MILHO"]
RNG=lambda sh,col:f'{sh}!${col}$5:${col}$300'
def xs_cod(col,cod):   # soma coluna por Cod (Cod e unico -> soma = valor do pivo)
    return "+".join([f'SUMIFS({RNG(sh,col)},{RNG(sh,COD_L)},{cod})' for sh in SHEETS])
def xs_mod(col,mcrit): # soma coluna por Modulo
    return "+".join([f'SUMIFS({RNG(sh,col)},{RNG(sh,MOD_L)},{mcrit})' for sh in SHEETS])
def xpot_dia(mcrit,dcol):  # potencia (kW) dos pivos do modulo que rodam NAQUELE dia (%>0)
    return "+".join([f'SUMIFS({RNG(sh,POT_L)},{RNG(sh,MOD_L)},{mcrit},{RNG(sh,dcol)},">0")' for sh in SHEETS])
def xcnt_mod(mcrit):   # pivos irrigando na semana no modulo (horas>0)
    return "+".join([f'COUNTIFS({RNG(sh,MOD_L)},{mcrit},{RNG(sh,HORAS_L)},">0")' for sh in SHEETS])
mods=["Modulo 1","Modulo 2","Modulo 3","RDM"]
from openpyxl.worksheet.properties import PageSetupProperties
MODFILL={"Modulo 1":PatternFill("solid",fgColor="E2EFDA"),"Modulo 2":PatternFill("solid",fgColor="DDEBF7"),
         "Modulo 3":PatternFill("solid",fgColor="FCE4D6"),"RDM":PatternFill("solid",fgColor="FFF2CC")}
def print_pdf_ready(s,ncols,last_row,title_row=4):
    s.page_setup.orientation="landscape";s.page_setup.fitToWidth=1;s.page_setup.fitToHeight=0
    s.sheet_properties.pageSetUpPr=PageSetupProperties(fitToPage=True)
    s.print_area=f"A1:{get_column_letter(ncols)}{last_row}"
    s.print_title_rows=f"{title_row}:{title_row}"
    s.page_margins.left=s.page_margins.right=0.3;s.page_margins.top=s.page_margins.bottom=0.4

# ========== DASHBOARD (demanda kW por modulo x dia da semana) - APENAS PIVOS
from openpyxl.chart import BarChart
s=ws("DASHBOARD","7030A0");setw(s,{"A":11,"B":7,"C":7,"D":7,"E":7,"F":7,"G":7,"H":7,"I":13,"J":14,"K":11})
title(s,"DASHBOARD - DEMANDA DE ENERGIA (kW) por modulo e por dia - APENAS PIVOS",
      "Para cada dia, soma a potencia (kW) dos pivos do modulo programados naquele dia (Seg..Dom nas abas de cultura). "
      "Pico = maior demanda da semana. Energia sem = kWh total do modulo. So pivos (sem captacao).")
hrow(s,4,["Modulo"]+DIAS+["Pico (kW)","Energia sem (kWh)","Pivos irrig."])
s.freeze_panes="B5";r=5;first=5
for m in mods:
    C(s,f"A{r}",m,C_TXT,F_CALC,CENTER);mc=f'$A{r}'
    for i,d in enumerate(DIAS):
        col=get_column_letter(2+i)
        C(s,f"{col}{r}",f'={xpot_dia(mc,DIA_L[d])}',C_TXT,F_OK,RIGHT,NUM1)
    pico=f'B{r}:H{r}'
    C(s,f"I{r}",f'=MAX({pico})',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,NUM1)
    C(s,f"J{r}",f'={xs_mod(ENE_L,mc)}',C_TXT,F_OK,RIGHT,M3)
    C(s,f"K{r}",f'={xcnt_mod(mc)}',C_TXT,F_OK,CENTER,INT)
    r+=1
C(s,f"A{r}","TOTAL",Font(name=FONT,bold=True,color="FFFFFF"),F_HEAD2,CENTER)
for i in range(len(DIAS)):
    col=get_column_letter(2+i);C(s,f"{col}{r}",f'=SUM({col}{first}:{col}{r-1})',Font(name=FONT,bold=True),F_OK,RIGHT,NUM1)
C(s,f"I{r}",f'=MAX(B{r}:H{r})',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,NUM1)
C(s,f"J{r}",f'=SUM(J{first}:J{r-1})',Font(name=FONT,bold=True),F_OK,RIGHT,M3)
C(s,f"K{r}",f'=SUM(K{first}:K{r-1})',Font(name=FONT,bold=True),F_OK,CENTER,INT)
tot=r
lc=LineChart();lc.title="Demanda de energia (kW) por dia - por modulo";lc.height=8;lc.width=18
lc.y_axis.title="kW";lc.x_axis.title="Dia da semana"
data=Reference(s,min_col=1,max_col=1+len(DIAS),min_row=first,max_row=tot-1)  # inclui coluna A (nomes) + dias
cats=Reference(s,min_col=2,max_col=1+len(DIAS),min_row=4,max_row=4)
lc.add_data(data,titles_from_data=True,from_rows=True);lc.set_categories(cats)
s.add_chart(lc,f"A{tot+2}")
C(s,f"A{tot+18}","A demanda de cada dia e o pico de kW se todos os pivos marcados naquele dia rodarem juntos. "
  "Use o Pico para dimensionar energia/contrato. Energia sem (kWh) = Volume semana x CE de pressurizacao.",C_NOTE)
s.merge_cells(start_row=tot+18,start_column=1,end_row=tot+18,end_column=11)

PLANTADOS=sorted([it for it in ROWS if it["cod"] and it["plantio"] and it["plantio"]<=HOJE],
                 key=lambda x:(mods.index(x["modop"]) if x["modop"] in mods else 9,int(x["num"]) if x["num"].isdigit() else 999))

# ========== OS_GERAL (semana, por modulo) - SO quem vai irrigar (filtro) - PDF/Excel
s=ws("OS_GERAL","C00000")
OH=["Modulo","Pivo","Cod","Casa b.","Cultura"]+DIAS+["Lam sem(mm)","Horas sem","Volume(m3)","Energia(kWh)","Irriga?"]
OIDX={h:get_column_letter(i+1) for i,h in enumerate(OH)}
wmap={"A":9,"B":9,"C":6,"D":7,"E":9}
for i in range(len(DIAS)):wmap[get_column_letter(6+i)]=5
for i,h in enumerate(["Lam sem(mm)","Horas sem","Volume(m3)","Energia(kWh)","Irriga?"]):wmap[OIDX[h]]=11
setw(s,wmap)
title(s,"OS DA SEMANA - por modulo (todos os pivos; quem irriga em VERDE)",
      "Mostra todos os plantados; quem vai irrigar fica destacado em verde. Horas em vermelho = gargalo (>"+str(JANELA_H)+"h). PDF: Arquivo>Exportar>PDF. Excel: o proprio arquivo.")
C(s,"A2","Semana (ref.):",C_TXT,None,RIGHT);C(s,"B2",f"={DREF}",C_LINK,F_OK,CENTER,DATE)
C(s,"D2",'=\"Pivos que vao irrigar: \"&COUNTIF($'+OIDX["Irriga?"]+'$5:$'+OIDX["Irriga?"]+'$'+str(4+len(PLANTADOS))+',\"SIM\")',C_TXT,None,LEFT)
s.merge_cells(f'D2:{OIDX["Horas sem"]}2')
hrow(s,4,OH);s.freeze_panes="A5"
r=5;ofirst=5
for it in PLANTADOS:
    cod=it["cod"];fill=MODFILL.get(it["modop"],F_IMP)
    C(s,f'{OIDX["Modulo"]}{r}',it["modop"],C_TXT,fill,CENTER)
    C(s,f'{OIDX["Pivo"]}{r}',it["pivo"],C_TXT,fill,CENTER)
    C(s,f'{OIDX["Cod"]}{r}',cod,C_TXT,fill,CENTER)
    C(s,f'{OIDX["Casa b."]}{r}',it["casa"],C_TXT,fill,CENTER)
    C(s,f'{OIDX["Cultura"]}{r}',it["cultura"],C_TXT,fill,CENTER)
    cq=f'${OIDX["Cod"]}{r}'
    for d in DIAS:
        C(s,f'{OIDX[d]}{r}',f'=IF({xs_cod(DIA_L[d],cq)}=0,"",{xs_cod(DIA_L[d],cq)})',C_TXT,F_CALC,CENTER,INT)
    C(s,f'{OIDX["Lam sem(mm)"]}{r}',f'={xs_cod(LAM_L,cq)}',C_TXT,F_CALC,RIGHT,NUM1)
    C(s,f'{OIDX["Horas sem"]}{r}',f'={xs_cod(HORAS_L,cq)}',C_TXT,F_CALC,RIGHT,NUM1)
    C(s,f'{OIDX["Volume(m3)"]}{r}',f'={xs_cod(VOL_L,cq)}',C_TXT,F_CALC,RIGHT,M3)
    C(s,f'{OIDX["Energia(kWh)"]}{r}',f'={xs_cod(ENE_L,cq)}',Font(name=FONT,bold=True,color="C00000"),F_CALC,RIGHT,M3)
    C(s,f'{OIDX["Irriga?"]}{r}',f'=IF(${OIDX["Horas sem"]}{r}>0,"SIM","NAO")',C_TXT,F_CALC,CENTER)
    r+=1
olast=r-1
# NAO filtra: mostra todos; filtro fica disponivel (dropdown) mas nao aplicado
s.auto_filter.ref=f"A4:{OIDX['Irriga?']}{olast}"
# DESTAQUE VERDE para quem vai irrigar (Irriga?=SIM) na linha inteira
irrCol=OIDX["Irriga?"]
s.conditional_formatting.add(f"A5:{irrCol}{olast}",
    FormulaRule(formula=[f'${irrCol}5="SIM"'],fill=FILL_SIM))
# GARGALO: horas da semana > janela -> vermelho
hsc=OIDX["Horas sem"]
s.conditional_formatting.add(f"{hsc}5:{hsc}{olast}",
    CellIsRule(operator="greaterThan",formula=[str(JANELA_H)],fill=FILL_GARG,font=FONT_GARG))
# resumo por modulo (sempre correto, independe do filtro) + total
rr=olast+2;C(s,f"A{rr}","RESUMO POR MODULO (semana)",Font(name=FONT,bold=True,color="FFFFFF"),F_HEAD2,LEFT);s.merge_cells(f"A{rr}:E{rr}")
MR=f'$A$5:$A${olast}';IR=f'${OIDX["Irriga?"]}$5:${OIDX["Irriga?"]}${olast}'
HS=f'${OIDX["Horas sem"]}$5:${OIDX["Horas sem"]}${olast}';ES=f'${OIDX["Energia(kWh)"]}$5:${OIDX["Energia(kWh)"]}${olast}';VS=f'${OIDX["Volume(m3)"]}$5:${OIDX["Volume(m3)"]}${olast}'
rr+=1
for m in mods:
    C(s,f"A{rr}",m,C_TXT,MODFILL.get(m),LEFT)
    C(s,f'{OIDX["Cod"]}{rr}',f'=COUNTIFS({MR},"{m}",{IR},"SIM")',C_TXT,F_OK,CENTER,INT)
    C(s,f'{OIDX["Horas sem"]}{rr}',f'=SUMIFS({HS},{MR},"{m}",{IR},"SIM")',C_TXT,F_OK,RIGHT,NUM1)
    C(s,f'{OIDX["Volume(m3)"]}{rr}',f'=SUMIFS({VS},{MR},"{m}",{IR},"SIM")',C_TXT,F_OK,RIGHT,M3)
    C(s,f'{OIDX["Energia(kWh)"]}{rr}',f'=SUMIFS({ES},{MR},"{m}",{IR},"SIM")',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,M3)
    rr+=1
C(s,f"A{rr}","TOTAL",Font(name=FONT,bold=True,color="FFFFFF"),F_HEAD2,LEFT)
C(s,f'{OIDX["Cod"]}{rr}',f'=COUNTIF({IR},"SIM")',Font(name=FONT,bold=True),F_OK,CENTER,INT)
C(s,f'{OIDX["Horas sem"]}{rr}',f'=SUM({OIDX["Horas sem"]}{rr-4}:{OIDX["Horas sem"]}{rr-1})',Font(name=FONT,bold=True),F_OK,RIGHT,NUM1)
C(s,f'{OIDX["Volume(m3)"]}{rr}',f'=SUM({OIDX["Volume(m3)"]}{rr-4}:{OIDX["Volume(m3)"]}{rr-1})',Font(name=FONT,bold=True),F_OK,RIGHT,M3)
C(s,f'{OIDX["Energia(kWh)"]}{rr}',f'=SUM({OIDX["Energia(kWh)"]}{rr-4}:{OIDX["Energia(kWh)"]}{rr-1})',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,M3)
C(s,f"A{rr+2}","Mostra TODOS os pivos plantados. Quem vai irrigar fica em VERDE (coluna Irriga?=SIM). Horas em vermelho = passou de "+str(JANELA_H)+"h/semana (gargalo). "
  "Baixar: PDF (Arquivo > Exportar > PDF) ou Excel (Salvar como / este arquivo).",C_NOTE)
s.merge_cells(start_row=rr+2,start_column=1,end_row=rr+2,end_column=len(OH))
print_pdf_ready(s,len(OH),rr)

# ========== OS_DIA (dia, por modulo) - SO quem vai irrigar (filtro) - PDF/Excel
AREA_L=IDX["Area(ha)"];CE_L=IDX["CE(kWh/m3)"]
s=ws("OS_DIA","C55A11")
DH=["Modulo","Pivo","Cod","Casa b.","Cultura","Percentimetro","Lamina (mm)","Horas prev.",
    "Horimetro inicial","Horimetro final","H. rodadas","Energia (kWh)","Observacoes","Irriga hoje?"]
DIDX={h:get_column_letter(i+1) for i,h in enumerate(DH)}
HID=get_column_letter(len(DH)+1)  # coluna oculta: % do dia (bruto)
wmap={"A":9,"B":9,"C":6,"D":7,"E":9,"F":11,"G":9,"H":9,"I":12,"J":12,"K":9,"L":11,"M":22,"N":9,HID:6}
setw(s,wmap)
title(s,"OS DO DIA - automatica por modulo (todos os pivos; quem irriga em VERDE) - imprimir/entregar",
      "Escolha a DATA: pega o % programado para aquele dia (Seg..Dom) nas abas de cultura. Quem vai rodar hoje fica em VERDE; horas em vermelho = volta >24h. "
      "PDF: Arquivo > Exportar > PDF. Excel: o proprio arquivo.")
C(s,"A2","Data da OS:",C_TXT,None,RIGHT);C(s,"B2",f"={DREF}",C_INPUT,F_INPUT,CENTER,DATE)
C(s,"C2","Dia:",C_TXT,None,RIGHT)
C(s,"D2",'=CHOOSE(WEEKDAY($B$2,2),"Seg","Ter","Qua","Qui","Sex","Sab","Dom")',C_LINK,F_OK,CENTER)
C(s,"E2","Responsavel:",C_TXT,None,RIGHT);C(s,"F2",None,C_INPUT,F_INPUT,LEFT)
s.column_dimensions[HID].hidden=True
hrow(s,4,DH);s.freeze_panes="A5"
dsel="$D$2";r=5;dfirst=5
for it in PLANTADOS:
    cod=it["cod"];cq=f'"{cod}"';fill=MODFILL.get(it["modop"],F_IMP)
    C(s,f'{DIDX["Modulo"]}{r}',it["modop"],C_TXT,fill,CENTER)
    C(s,f'{DIDX["Pivo"]}{r}',it["pivo"],C_TXT,fill,CENTER)
    C(s,f'{DIDX["Cod"]}{r}',cod,C_TXT,fill,CENTER)
    C(s,f'{DIDX["Casa b."]}{r}',it["casa"],C_TXT,fill,CENTER)
    C(s,f'{DIDX["Cultura"]}{r}',it["cultura"],C_TXT,fill,CENTER)
    blend="+".join([f'({xs_cod(DIA_L[d],cq)})*({dsel}="{d}")' for d in DIAS])
    C(s,f'{HID}{r}',f'={blend}',C_TXT,F_CALC,CENTER,INT);raw=f'${HID}{r}'
    C(s,f'{DIDX["Percentimetro"]}{r}',f'=IF({raw}=0,"",{raw})',Font(name=FONT,bold=True),F_CALC,CENTER,INT)
    C(s,f'{DIDX["Lamina (mm)"]}{r}',f'=IF({raw}=0,"",IFERROR(INDEX({LAM_RANGE},MATCH("{cod}",{COD_COL},0),MATCH({raw},{LAM_PCT},0)),"?"))',C_TXT,F_CALC,CENTER,NUM1)
    C(s,f'{DIDX["Horas prev."]}{r}',f'=IF({raw}=0,"",IFERROR(INDEX({HOR_RANGE},MATCH("{cod}",{COD_COL},0),MATCH({raw},{HOR_PCT},0)),"?"))',Font(name=FONT,bold=True),F_CALC,CENTER,NUM1)
    C(s,f'{DIDX["Horimetro inicial"]}{r}',None,C_INPUT,F_INPUT,CENTER,NUM1)
    C(s,f'{DIDX["Horimetro final"]}{r}',None,C_INPUT,F_INPUT,CENTER,NUM1)
    hi=f'${DIDX["Horimetro inicial"]}{r}';hf=f'${DIDX["Horimetro final"]}{r}'
    C(s,f'{DIDX["H. rodadas"]}{r}',f'=IF(OR({hi}="",{hf}=""),"",{hf}-{hi})',C_TXT,F_CALC,CENTER,NUM1)
    lam=f'${DIDX["Lamina (mm)"]}{r}'
    C(s,f'{DIDX["Energia (kWh)"]}{r}',f'=IF({lam}="","",{lam}*({xs_cod(AREA_L,cq)})*10*({xs_cod(CE_L,cq)}))',C_TXT,F_CALC,RIGHT,M3)
    C(s,f'{DIDX["Observacoes"]}{r}',None,C_INPUT,F_INPUT,LEFT)
    C(s,f'{DIDX["Irriga hoje?"]}{r}',f'=IF({raw}>0,"SIM","NAO")',C_TXT,F_CALC,CENTER)
    r+=1
dlast=r-1
# NAO filtra: mostra todos; dropdown disponivel mas nao aplicado
s.auto_filter.ref=f"A4:{DIDX['Irriga hoje?']}{dlast}"
# DESTAQUE VERDE para quem vai irrigar hoje
irrD=DIDX["Irriga hoje?"]
s.conditional_formatting.add(f"A5:{irrD}{dlast}",
    FormulaRule(formula=[f'${irrD}5="SIM"'],fill=FILL_SIM))
# GARGALO: volta do dia > 24h (nao fecha no mesmo dia) -> vermelho
hpc=DIDX["Horas prev."]
s.conditional_formatting.add(f"{hpc}5:{hpc}{dlast}",
    CellIsRule(operator="greaterThan",formula=["24"],fill=FILL_GARG,font=FONT_GARG))
# resumo por modulo do DIA
rr=dlast+2;C(s,f"A{rr}","RESUMO POR MODULO (dia)",Font(name=FONT,bold=True,color="FFFFFF"),F_HEAD2,LEFT);s.merge_cells(f"A{rr}:E{rr}")
MR=f'$A$5:$A${dlast}';IR=f'${DIDX["Irriga hoje?"]}$5:${DIDX["Irriga hoje?"]}${dlast}'
HP=f'${DIDX["Horas prev."]}$5:${DIDX["Horas prev."]}${dlast}';ED=f'${DIDX["Energia (kWh)"]}$5:${DIDX["Energia (kWh)"]}${dlast}'
rr+=1
for m in mods:
    C(s,f"A{rr}",m,C_TXT,MODFILL.get(m),LEFT)
    C(s,f'{DIDX["Cod"]}{rr}',f'=COUNTIFS({MR},"{m}",{IR},"SIM")',C_TXT,F_OK,CENTER,INT)
    C(s,f'{DIDX["Horas prev."]}{rr}',f'=SUMIFS({HP},{MR},"{m}",{IR},"SIM")',C_TXT,F_OK,CENTER,NUM1)
    C(s,f'{DIDX["Energia (kWh)"]}{rr}',f'=SUMIFS({ED},{MR},"{m}",{IR},"SIM")',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,M3)
    rr+=1
C(s,f"A{rr}","TOTAL DO DIA",Font(name=FONT,bold=True,color="FFFFFF"),F_HEAD2,LEFT)
C(s,f'{DIDX["Cod"]}{rr}',f'=COUNTIF({IR},"SIM")',Font(name=FONT,bold=True),F_OK,CENTER,INT)
C(s,f'{DIDX["Horas prev."]}{rr}',f'=SUM({DIDX["Horas prev."]}{rr-4}:{DIDX["Horas prev."]}{rr-1})',Font(name=FONT,bold=True),F_OK,CENTER,NUM1)
C(s,f'{DIDX["Energia (kWh)"]}{rr}',f'=SUM({DIDX["Energia (kWh)"]}{rr-4}:{DIDX["Energia (kWh)"]}{rr-1})',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,M3)
C(s,f"A{rr+2}","Mostra TODOS os pivos; quem vai irrigar hoje fica em VERDE (Irriga hoje?=SIM). Horas em vermelho = volta passa de 24h (nao fecha no dia). "
  "Horimetro inicial/final e observacoes preenchidos no campo. Baixar: PDF (Arquivo > Exportar > PDF) ou Excel.",C_NOTE)
s.merge_cells(start_row=rr+2,start_column=1,end_row=rr+2,end_column=len(DH))
# ASSINATURAS (para imprimir e entregar)
asg=rr+4
C(s,f"B{asg}","Operador: ____________________________",C_TXT,None,LEFT)
C(s,f'{DIDX["Energia (kWh)"]}{asg}',"Encarregado: ____________________________",C_TXT,None,LEFT)
C(s,f"B{asg+2}","Data / hora de inicio: ______ / ______",C_TXT,None,LEFT)
C(s,f'{DIDX["Energia (kWh)"]}{asg+2}',"Data / hora de termino: ______ / ______",C_TXT,None,LEFT)
print_pdf_ready(s,len(DH),asg+2)

# ========== LEIA-ME
s=ws("LEIA-ME","1F3864");setw(s,{"A":2,"B":100})
title(s,"Manejo de Irrigacao Karitel/RDM - v10","Programacao semanal -> OS por modulo. Destaque verde = vai irrigar. Alerta de gargalo. Perda por deficit (Ky).")
for i,(a,b) in enumerate([
("PROGRAMACAO SEMANAL","Em cada aba de cultura tem as colunas Seg..Dom. Ponha o % (percentimetro) no dia que o pivo vai rodar. A planilha soma lamina, horas, volume e energia da semana."),
("OS SEM FILTRO","As OS mostram TODOS os pivos; quem vai irrigar fica em VERDE (coluna Irriga?). Nao precisa de macro nem Reaplicar para ver o destaque. O filtro continua disponivel se quiser enxugar."),
("ALERTA DE GARGALO","Horas em VERMELHO: na semana acima de "+str(JANELA_H)+"h (pivo nao repoe a demanda) ou na OS do dia acima de 24h (a volta nao fecha no dia). Reveja % ou dias."),
("PERDA POR DEFICIT (Ky)","Nas abas de cultura, coluna 'Perda % (deficit)': estima a perda de produtividade quando a agua aplicada nao repoe a necessidade. Formula FAO-33: perda = Ky x (1 - ETreal/ETc)."),
("ASSINATURA","A OS do dia tem cabecalho (data/dia/responsavel) e linhas de assinatura do operador/encarregado para imprimir e entregar."),
("OS DO DIA","A aba OS_DIA gera a ordem AUTOMATICA do dia: escolha a DATA e ela pega o % programado para aquele dia, por modulo, com percentimetro, lamina, horas, horimetro inicial/final e observacoes. SO aparece quem vai irrigar (filtro Irriga hoje=SIM)."),
("OS DA SEMANA","A aba OS_GERAL mostra a semana por modulo (Seg..Dom). SO aparece quem vai irrigar (filtro Irriga=SIM)."),
("BAIXAR PDF/EXCEL","As duas OS ja vem prontas para impressao (paisagem, cabecalho repetido). PDF: Arquivo > Exportar > Criar PDF (ou Salvar como PDF). Excel: o proprio arquivo (Salvar como). Se mudar a programacao, use Dados > Reaplicar para o filtro atualizar."),
("DASHBOARD","Demanda de energia (kW) por modulo e por dia da semana, com o pico. Use o pico para dimensionar energia."),
("DUAS CAMADAS","Aba de MANEJO por cultura (operacao da semana) + aba CADASTRO (dados fixos: variedade, populacao, plantas/m, GRM, Ky, ciclo, ocupacao). O manejo puxa ciclo/ocupacao/curva Kc do CADASTRO por Cod."),
("Ky","Na aba CADASTRO. Fator de resposta da cultura (FAO-33): soja/algodao 0,85; milho 1,25. Tabaco 0,90 (conferir); cacau em branco (nao consolidado). Serve p/ estimar perda de produtividade no deficit."),
("SO PLANTADOS","Cada aba de cultura mostra so os pivos JA PLANTADOS (filtro Plantado=SIM). Os nao plantados ficam ocultos."),
("AVISAR PLANTIO","Para incluir um pivo: preencha a DATA DE PLANTIO real dele na aba da cultura. Ele vira Plantado=SIM. "
 "Depois use Dados > Reaplicar (ou abra o filtro da coluna Plantado) para a lista atualizar."),
("EMERGENCIA","Soja e algodao: DAE = DAP - 5 (5 dias de emergencia). Tabaco/cacau/milho: DAE = DAP."),
("Kc","Coluna Kc = curva diaria (CURVAS_KC) pelo DAE. Cada aba tem o GRAFICO da curva de Kc da cultura."),
("SOMA DA ETO","ETo acum = SOMA das ETos semanais (ETO_SEMANAL) desde a Ult.irrig ate hoje. ETc acum = Kc x ETo acum. Nec BRUTA = (ETc acum - chuva)/0,90."),
("EXECUCAO","Nas parcelas IRRIGAR, digite o % (percentimetro) -> Lamina (mm) e Horas."),
("ETO / IRRIGAR","Atualize ETO_SEMANAL a cada semana (ETo e chuva). Ao irrigar um pivo, coloque a data em 'Ult.irrig' para zerar a soma e recomecar o acumulo."),
("MODULOS","Coluna Modulo: M1 (1-34+75,76), M2 (R8-R12), M3 (R13-R18), RDM (101-133). De para filtrar/ordenar por modulo."),],0):
    s.cell(row=i+4,column=2,value=f"{a}:  {b}").font=C_TXT;s.cell(row=i+4,column=2).alignment=LEFT;s.row_dimensions[i+4].height=40

# ========== CAPA / INICIO (identidade + indice + legenda) - acabamento profissional
cp=ws("INICIO","1F6B3B")
cp.sheet_view.showGridLines=False
setw(cp,{"A":2,"B":26,"C":30,"D":26,"E":16,"F":16,"G":4})
F_BRAND=PatternFill("solid",fgColor="1F6B3B");F_BAND=PatternFill("solid",fgColor="E2EFDA")
cp.merge_cells("B2:F2");c=cp["B2"];c.value="MANEJO DE IRRIGACAO";c.font=Font(name=FONT,size=26,bold=True,color="1F6B3B");c.alignment=Alignment("left","center")
cp.row_dimensions[2].height=38
cp.merge_cells("B3:F3");c=cp["B3"];c.value="Fazenda Karitel  ·  Rio do Meio (RDM)   —   Safra 2026/27";c.font=Font(name=FONT,size=13,bold=True,color="7A5230");c.alignment=Alignment("left","center")
cp.merge_cells("B4:F4");c=cp["B4"];c.value=f"Atualizado em {HOJE.strftime('%d/%m/%Y')}  ·  Manejo via clima (ETo semanal + Kc FAO-56)  ·  Energia por pivo";c.font=C_NOTE;c.alignment=LEFT
# faixa
for col in range(2,7):cp.cell(row=5,column=col).fill=F_BRAND
cp.row_dimensions[5].height=6
# INDICE
r=7;c=cp.cell(row=r,column=2,value="ONDE FICA CADA COISA");c.font=Font(name=FONT,size=12,bold=True,color="FFFFFF");c.fill=F_HEAD2;c.alignment=LEFT
cp.merge_cells(start_row=r,start_column=2,end_row=r,end_column=6);r+=1
indice=[("OS_DIA","Ordem de servico do DIA, por modulo. Escolha a data -> sai pronta p/ imprimir."),
("OS_GERAL","Ordem da SEMANA por modulo (Seg a Dom). Quem irriga em verde."),
("DASHBOARD","Demanda de energia (kW) por modulo e por dia, com o pico da semana."),
("SOJA / ALGODAO / TABACO / CACAU / MILHO","Manejo + programacao semanal de cada cultura (DAP, DAE, Kc, ETc, necessidade, perda por deficit)."),
("CADASTRO","Dados fixos por pivo: variedade, ciclo, populacao, plantas/m, GRM, Ky."),
("ETO_SEMANAL","Clima da semana: ETo e chuva (ATUALIZAR toda semana)."),
("CURVAS_KC / LAMINA_HORA / PARAMETROS","Bases tecnicas (nao precisa mexer no dia a dia).")]
for nome,desc in indice:
    cp.cell(row=r,column=2,value=nome).font=Font(name=FONT,size=10,bold=True,color="1F6B3B")
    cp.cell(row=r,column=2).alignment=LEFT
    cc2=cp.cell(row=r,column=3,value=desc);cc2.font=C_TXT;cc2.alignment=LEFT
    cp.merge_cells(start_row=r,start_column=3,end_row=r,end_column=6)
    cp.row_dimensions[r].height=26;r+=1
# LEGENDA DE CORES
r+=1;c=cp.cell(row=r,column=2,value="LEGENDA DE CORES");c.font=Font(name=FONT,size=12,bold=True,color="FFFFFF");c.fill=F_HEAD2;c.alignment=LEFT
cp.merge_cells(start_row=r,start_column=2,end_row=r,end_column=6);r+=1
legenda=[(F_INPUT,"Voce preenche (amarelo): data de plantio, %, ETo, chuva, horimetro."),
(PatternFill("solid",fgColor="E2EFDA"),"Vai irrigar / calculado (verde): a planilha preenche sozinha."),
(PatternFill("solid",fgColor="F8CBAD"),"Gargalo (vermelho/laranja): horas acima do limite (>168h semana, >24h volta)."),
(F_HEAD2,"Cabecalho (azul): titulos das colunas.")]
for fill,txt in legenda:
    cp.cell(row=r,column=2).fill=fill
    cc2=cp.cell(row=r,column=3,value=txt);cc2.font=C_TXT;cc2.alignment=LEFT
    cp.merge_cells(start_row=r,start_column=3,end_row=r,end_column=6)
    cp.row_dimensions[r].height=22;r+=1
r+=1;cp.merge_cells(start_row=r,start_column=2,end_row=r,end_column=6)
c=cp.cell(row=r,column=2,value="Rotina: 1) ETO_SEMANAL  2) Plantio (nas abas de cultura)  3) Programacao (% Seg-Dom)  4) OS_DIA -> imprimir.")
c.font=Font(name=FONT,size=10,italic=True,color="7A5230");c.alignment=LEFT
cp.sheet_properties.tabColor="1F6B3B"
print_pdf_ready(cp,6,r)

# ========== ACABAMENTO: esconder colunas internas, impressao, propriedades
for sh in ["SOJA","ALGODAO","TABACO","CACAU","MILHO"]:
    w=wb[sh];hd={w.cell(4,c).value:c for c in range(1,w.max_column+1)}
    for col in ["Curva Kc","Cod"]:
        if col in hd: w.column_dimensions[get_column_letter(hd[col])].hidden=True
try:
    wb.properties.title="Manejo de Irrigacao - Karitel/RDM - Safra 26/27"
    wb.properties.creator="Consultoria Agronomica - Irrigacao"
    wb.properties.subject="Manejo de irrigacao via clima (ETo/Kc FAO-56)"
except Exception:pass

ordem=["INICIO","OS_DIA","OS_GERAL","DASHBOARD","SOJA","ALGODAO","TABACO","CACAU","MILHO","CADASTRO","ETO_SEMANAL","CURVAS_KC","LAMINA_HORA","PARAMETROS","LEIA-ME"]
wb._sheets.sort(key=lambda x: ordem.index(x.title) if x.title in ordem else 99)
wb.active=wb.sheetnames.index("INICIO")
try:
    from openpyxl.workbook.properties import CalcProperties
    wb.calculation=CalcProperties(fullCalcOnLoad=True,calcMode="auto")
except Exception as e:print("calcPr",e)
wb.save(OUT)
print("salvo:",OUT,"| abas:",len(wb.sheetnames))
pl=lambda cg:sum(1 for it in ROWS if it["cultgrp"]==cg and it["cod"] and it["plantio"] and it["plantio"]<=HOJE)
print("plantados hoje:",{cg:pl(cg) for cg in ["SOJA","ALGODÃO","TABACO","CACAU","MILHO"]})
