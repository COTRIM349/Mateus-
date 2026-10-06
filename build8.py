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

# ========== aba por cultura (manejo/programacao semanal - enxuta)
H=["Pivo","Modulo","Casa b.","Cultura","Area(ha)","Ciclo (dias)","Ocup (dias)","Colheita prev",
   "Data plantio","Plantado?","DAP","DAE","Kc",
   "Ult.irrig","ETo acum","Chuva acum","ETc acum","Nec liq (mm)","Nec BRUTA (mm)","% aplic","Lamina(mm)","Horas","CE(kWh/m3)","Vazao(m3/h)","Pot(kW)","Volume(m3)","Energia(kWh)","Decisao","Curva Kc","Cod"]
IDX={h:get_column_letter(i+1) for i,h in enumerate(H)}
# letras dinamicas das colunas de cultura (usadas no DASHBOARD) - se adaptam se H mudar
MOD_L=IDX["Modulo"];PCT_L=IDX["% aplic"];VAZ_L=IDX["Vazao(m3/h)"];POT_L=IDX["Pot(kW)"];VOL_L=IDX["Volume(m3)"];ENE_L=IDX["Energia(kWh)"]
CULT_CURVE_COLS={"SOJA":["SOJA_PRECOCE","SOJA_MEDIA","SOJA_TARDIA"],"ALGODÃO":["ALG_PRECOCE","ALG_MEDIO","ALG_TARDIO"],
                 "MILHO":["MILHO"],"TABACO":["TABACO"],"CACAU":["CACAU"]}
def cultura_tab(nome,cultgrp,cor,titulo,emerg):
    s=ws(nome,cor)
    setw(s,{"A":9,"B":8,"C":7,"D":9,"E":8,"F":8,"G":8,"H":11,"I":11,"J":8,"K":6,"L":6,"M":7,"N":11,"O":9,"P":9,"Q":9,
            "R":9,"S":11,"T":7,"U":9,"V":7,"W":9,"X":10,"Y":9,"Z":11,"AA":12,"AB":11,"AC":12,"AD":6})
    title(s,titulo,f"So pivos PLANTADOS (filtro Plantado=SIM). Avisar plantio = preencher Data plantio. Emergencia {emerg} dias. "
          f"Ciclo/Ocupacao/Curva Kc vem do CADASTRO (por Cod). ETc=Kc(DAE)xETo semanal.")
    hrow(s,4,H);s.freeze_panes="E5"
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
        C(s,f'{IDX["Colheita prev"]}{r}',f'=IF(OR(${IDX["Data plantio"]}{r}="",${IDX["Ocup (dias)"]}{r}=""),"",${IDX["Data plantio"]}{r}+${IDX["Ocup (dias)"]}{r})',C_TXT,F_CALC,CENTER,DATE)
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
        C(s,f'{IDX["% aplic"]}{r}',None,C_INPUT,F_INPUT,CENTER)
        cod=f'${IDX["Cod"]}{r}';pct=f'${IDX["% aplic"]}{r}'
        cc("Lamina(mm)",f'=IF(OR({cod}="",{pct}=""),"",IFERROR(INDEX({LAM_RANGE},MATCH({cod},{COD_COL},0),MATCH({pct},{LAM_PCT},0)),"?"))',NUM1,CENTER)
        cc("Horas",f'=IF(OR({cod}="",{pct}=""),"",IFERROR(INDEX({HOR_RANGE},MATCH({cod},{COD_COL},0),MATCH({pct},{HOR_PCT},0)),"?"))',NUM1,CENTER)
        # energia: CE (captacao+pressurizacao) x volume aplicado
        C(s,f'{IDX["CE(kWh/m3)"]}{r}',it["ce"],C_LINK if it["ce"] else C_PEND,F_IMP if it["ce"] else F_PEND,RIGHT,NUM3)
        C(s,f'{IDX["Vazao(m3/h)"]}{r}',it["vazao"],C_LINK if it["vazao"] else C_PEND,F_IMP if it["vazao"] else F_PEND,RIGHT,M3)
        C(s,f'{IDX["Pot(kW)"]}{r}',it["potkw"],C_LINK if it["potkw"] else C_PEND,F_IMP if it["potkw"] else F_PEND,RIGHT,NUM1)
        lam=f'${IDX["Lamina(mm)"]}{r}';ar=f'${IDX["Area(ha)"]}{r}';ce=f'${IDX["CE(kWh/m3)"]}{r}'
        cc("Volume(m3)",f'=IF(OR({lam}="",{lam}="?",{ar}=""),"",{lam}*{ar}*10)',M3)
        vol=f'${IDX["Volume(m3)"]}{r}'
        cc("Energia(kWh)",f'=IF(OR({vol}="",{ce}=""),"",{vol}*{ce})',M3)
        cc("Decisao",f'=IF({kc}="PENDENTE","Definir Kc",IF({nl}="","-",IF({nl}>={TURNO},"IRRIGAR",IF({nl}>={TURNO}*{GAT},"Acompanhar","Aguardar"))))',None,CENTER)
        # ocultar se nao plantado (data vazia ou futura)
        planted = bool(it["plantio"]) and it["plantio"]<=HOJE
        if not planted: s.row_dimensions[r].hidden=True
        r+=1
    last=r-1
    # filtro automatico: Plantado = SIM
    if last>=first:
        s.auto_filter.ref=f"A4:{IDX['Cod']}{last}"
        s.auto_filter.add_filter_column(H.index("Plantado?"),["SIM"])
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

# ========== DASHBOARD (energia por HORA por modulo) - APENAS PIVOS
from openpyxl.chart import BarChart
s=ws("DASHBOARD","7030A0");setw(s,{"A":11,"B":13,"C":14,"D":18,"E":16,"F":16})
title(s,"DASHBOARD - ENERGIA POR HORA (kW) por modulo - APENAS PIVOS",
      "Energia/hora = potencia (kW) dos pivos irrigando. So os pivos (nao inclui captacao). kWh/h = kW. Um pivo entra quando tem % preenchido.")
hrow(s,4,["Modulo","Pivos irrig.","Vazao (m3/h)","ENERGIA/HORA (kWh/h)","Volume evento (m3)","Energia evento (kWh)"])
SHEETS=["SOJA","ALGODAO","TABACO","CACAU","MILHO"]
# colunas de cultura (dinamicas): MOD_L=Modulo, PCT_L=% aplic, VAZ_L=Vazao, POT_L=Pot, VOL_L=Volume, ENE_L=Energia
def s_crit(col,crit):
    return "+".join([f'SUMIFS({sh}!${col}$5:${col}$300,{sh}!${MOD_L}$5:${MOD_L}$300,{crit},{sh}!${PCT_L}$5:${PCT_L}$300,">0")' for sh in SHEETS])
def s_mod(col,crit):
    return "+".join([f'SUMIFS({sh}!${col}$5:${col}$300,{sh}!${MOD_L}$5:${MOD_L}$300,{crit})' for sh in SHEETS])
def c_crit(crit):
    return "+".join([f'COUNTIFS({sh}!${MOD_L}$5:${MOD_L}$300,{crit},{sh}!${PCT_L}$5:${PCT_L}$300,">0")' for sh in SHEETS])
mods=["Modulo 1","Modulo 2","Modulo 3","RDM"];r=5;first=5
for m in mods:
    C(s,f"A{r}",m,C_TXT,F_CALC,CENTER);crit=f'$A{r}'
    C(s,f"B{r}",f'={c_crit(crit)}',C_TXT,F_OK,CENTER,INT)
    C(s,f"C{r}",f'={s_crit(VAZ_L,crit)}',C_TXT,F_OK,RIGHT,M3)
    C(s,f"D{r}",f'={s_crit(POT_L,crit)}',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,NUM1)  # ENERGIA/HORA = pot pivos (kW)
    C(s,f"E{r}",f'={s_mod(VOL_L,crit)}',C_TXT,F_OK,RIGHT,M3)
    C(s,f"F{r}",f'={s_mod(ENE_L,crit)}',C_TXT,F_OK,RIGHT,M3)
    r+=1
C(s,f"A{r}","TOTAL",Font(name=FONT,bold=True,color="FFFFFF"),F_HEAD2,CENTER)
for col,fmt in [("B",INT),("C",M3),("D",NUM1),("E",M3),("F",M3)]:
    C(s,f"{col}{r}",f'=SUM({col}{first}:{col}{r-1})',Font(name=FONT,bold=True),F_OK,RIGHT,fmt)
tot=r
bc=BarChart();bc.title="Energia por hora (kWh/h) por modulo - pivos";bc.type="col";bc.height=8;bc.width=16
bc.y_axis.title="kWh/h (kW)";bc.x_axis.title="Modulo";bc.legend=None
data=Reference(s,min_col=4,min_row=4,max_row=tot-1)
cats=Reference(s,min_col=1,min_row=first,max_row=tot-1)
bc.add_data(data,titles_from_data=True);bc.set_categories(cats)
s.add_chart(bc,f"A{tot+2}")
C(s,f"A{tot+17}","ENERGIA/HORA (kWh/h) = soma da potencia (kW) dos pivos que estao irrigando no modulo (APENAS pivos, sem captacao). "
  "Energia evento (kWh) = Volume x CE de pressurizacao do pivo. Preencha o % na aba da cultura para o pivo entrar.",C_NOTE)
s.merge_cells(start_row=tot+17,start_column=1,end_row=tot+17,end_column=6)

# ========== PROGRAMACAO SEMANAL POR MODULO (montar o cronograma)
s=ws("PROGRAMACAO","4472C4")
title(s,"PROGRAMACAO SEMANAL - por modulo (so pivos plantados)",
      "Digite o % (percentimetro) de cada pivo em cada dia. Lamina e horas automaticas. Energia = APENAS pivos. Depois gere a OS na aba OS_GERAL.")
C(s,"A2","Inicio da semana:",C_TXT,None,RIGHT);C(s,"B2",f"={DREF}",C_INPUT,F_INPUT,CENTER,DATE)
setw(s,{"A":9,"B":9,"C":6,"D":9,"E":8,"F":10})
hrow(s,4,["Modulo","Pivo","Cod","Cultura","Area(ha)","CE(kWh/m3)"])
pstart=7
for d in range(7):
    c0=pstart+3*d
    cx=s.cell(row=3,column=c0,value=f'=$B$2+{d}');cx.number_format="ddd dd/mm"
    cx.font=Font(name=FONT,bold=True,color="1F3864");cx.alignment=CENTER
    s.merge_cells(start_row=3,start_column=c0,end_row=3,end_column=c0+2)
    for j,t in enumerate(["%","Lam","h"]):
        cc2=s.cell(row=4,column=c0+j,value=t);cc2.font=C_HEAD;cc2.fill=F_HEAD2;cc2.alignment=CENTER;cc2.border=BORDER
        s.column_dimensions[get_column_letter(c0+j)].width=5.5
ptcol=pstart+21   # AB
for j,h in enumerate(["Lam total(mm)","Horas total","Volume(m3)","Energia(kWh)"]):
    cx=s.cell(row=4,column=ptcol+j,value=h);cx.font=C_HEAD;cx.fill=F_HEAD;cx.alignment=CENTER;cx.border=BORDER
    s.column_dimensions[get_column_letter(ptcol+j)].width=13
s.freeze_panes="G5"
PROG_COD_COL=f"PROGRAMACAO!$C$5:$C$400"
PROG_LT=f"PROGRAMACAO!${get_column_letter(ptcol)}$5:${get_column_letter(ptcol)}$400"       # Lam total
PROG_HT=f"PROGRAMACAO!${get_column_letter(ptcol+1)}$5:${get_column_letter(ptcol+1)}$400"   # Horas total
PROG_VT=f"PROGRAMACAO!${get_column_letter(ptcol+2)}$5:${get_column_letter(ptcol+2)}$400"   # Volume
PROG_ET=f"PROGRAMACAO!${get_column_letter(ptcol+3)}$5:${get_column_letter(ptcol+3)}$400"   # Energia
r=5
for mod in ["Modulo 1","Modulo 2","Modulo 3","RDM","Outros"]:
    mr=sorted([it for it in ROWS if it["cod"] and it["plantio"] and it["plantio"]<=HOJE and it["modop"]==mod],
              key=lambda x:int(x["num"]) if x["num"].isdigit() else 999)
    if not mr: continue
    sc=s.cell(row=r,column=1,value=f"{mod}  -  {len(mr)} pivos");sc.font=Font(name=FONT,size=11,bold=True,color="FFFFFF")
    sc.fill=PatternFill("solid",fgColor="2E5496");sc.alignment=LEFT
    s.merge_cells(start_row=r,start_column=1,end_row=r,end_column=ptcol+3);r+=1
    for it in mr:
        C(s,f"A{r}",it["modop"],C_LINK,F_IMP,CENTER);C(s,f"B{r}",it["pivo"],C_LINK,F_IMP,CENTER)
        C(s,f"C{r}",it["cod"],C_INPUT,F_INPUT,CENTER);C(s,f"D{r}",it["cultura"],C_LINK,F_IMP,CENTER)
        C(s,f"E{r}",it["area"],C_LINK,F_IMP,RIGHT,M3)
        C(s,f"F{r}",it["ce"],C_LINK if it["ce"] else C_PEND,F_IMP if it["ce"] else F_PEND,RIGHT,NUM3)
        lamcells=[];horcells=[]
        for d in range(7):
            c0=pstart+3*d;pcl=get_column_letter(c0);lcl=get_column_letter(c0+1);hcl=get_column_letter(c0+2)
            C(s,f"{pcl}{r}",None,C_INPUT,F_INPUT,CENTER)
            C(s,f"{lcl}{r}",f'=IF(OR($C{r}="",{pcl}{r}=""),"",IFERROR(INDEX({LAM_RANGE},MATCH($C{r},{COD_COL},0),MATCH({pcl}{r},{LAM_PCT},0)),"?"))',C_TXT,F_CALC,CENTER,NUM1)
            C(s,f"{hcl}{r}",f'=IF(OR($C{r}="",{pcl}{r}=""),"",IFERROR(INDEX({HOR_RANGE},MATCH($C{r},{COD_COL},0),MATCH({pcl}{r},{HOR_PCT},0)),"?"))',C_TXT,F_CALC,CENTER,NUM1)
            lamcells.append(f"{lcl}{r}");horcells.append(f"{hcl}{r}")
        lt=get_column_letter(ptcol);ht=get_column_letter(ptcol+1);vc=get_column_letter(ptcol+2);ec=get_column_letter(ptcol+3)
        C(s,f"{lt}{r}",f'=SUM({",".join(lamcells)})',C_TXT,F_CALC,RIGHT,NUM1)
        C(s,f"{ht}{r}",f'=SUM({",".join(horcells)})',C_TXT,F_CALC,RIGHT,NUM1)
        C(s,f"{vc}{r}",f'=IF(OR($E{r}="",{lt}{r}=""),"",{lt}{r}*$E{r}*10)',C_TXT,F_CALC,RIGHT,M3)
        C(s,f"{ec}{r}",f'=IF(OR({vc}{r}="",$F{r}=""),"",{vc}{r}*$F{r})',C_TXT,F_CALC,RIGHT,M3)
        r+=1
C(s,f"A{r+1}","Monte a semana por modulo: % de cada pivo por dia -> Lamina/Horas automaticas. Depois abra a aba OS_GERAL para a ordem de servico consolidada.",C_NOTE)
s.merge_cells(start_row=r+1,start_column=1,end_row=r+1,end_column=ptcol+3)

# ========== OS_GERAL (ordem de servico geral, gerada da programacao)
s=ws("OS_GERAL","C00000");setw(s,{"A":10,"B":9,"C":6,"D":8,"E":10,"F":13,"G":11,"H":12,"I":13,"J":9})
title(s,"OS GERAL - ordem de servico consolidada (gerada da PROGRAMACAO)",
      "Puxa automatico o que foi programado (por Cod) em todos os modulos. Filtro mostra so quem vai irrigar (Irriga=SIM).")
C(s,"A2","Semana:",C_TXT,None,RIGHT);C(s,"B2","=PROGRAMACAO!$B$2",C_LINK,F_OK,CENTER,DATE)
hrow(s,4,["Modulo","Pivo","Cod","Casa b.","Cultura","Lam semana(mm)","Horas semana","Volume(m3)","Energia(kWh)","Irriga?"])
s.freeze_panes="A5"
osrows=sorted([it for it in ROWS if it["cod"] and it["plantio"] and it["plantio"]<=HOJE],
              key=lambda x:(x["modop"],int(x["num"]) if x["num"].isdigit() else 999))
r=5;ofirst=5
for it in osrows:
    cod=it["cod"]
    C(s,f"A{r}",it["modop"],C_LINK,F_IMP,CENTER);C(s,f"B{r}",it["pivo"],C_LINK,F_IMP,CENTER)
    C(s,f"C{r}",cod,C_LINK,F_IMP,CENTER);C(s,f"D{r}",it["casa"],C_LINK,F_IMP,CENTER);C(s,f"E{r}",it["cultura"],C_LINK,F_IMP,CENTER)
    C(s,f"F{r}",f'=SUMIFS({PROG_LT},{PROG_COD_COL},$C{r})',C_TXT,F_CALC,RIGHT,NUM1)
    C(s,f"G{r}",f'=SUMIFS({PROG_HT},{PROG_COD_COL},$C{r})',C_TXT,F_CALC,RIGHT,NUM1)
    C(s,f"H{r}",f'=SUMIFS({PROG_VT},{PROG_COD_COL},$C{r})',C_TXT,F_CALC,RIGHT,M3)
    C(s,f"I{r}",f'=SUMIFS({PROG_ET},{PROG_COD_COL},$C{r})',Font(name=FONT,bold=True,color="C00000"),F_CALC,RIGHT,M3)
    C(s,f"J{r}",f'=IF($F{r}>0,"SIM","NAO")',C_TXT,F_CALC,CENTER)
    r+=1
olast=r-1
C(s,f"E{r}","TOTAL GERAL:",Font(name=FONT,bold=True),None,RIGHT)
C(s,f"F{r}",f'=SUM($F${ofirst}:$F${olast})',Font(name=FONT,bold=True),F_OK,RIGHT,NUM1)
C(s,f"G{r}",f'=SUM($G${ofirst}:$G${olast})',Font(name=FONT,bold=True),F_OK,RIGHT,NUM1)
C(s,f"H{r}",f'=SUM($H${ofirst}:$H${olast})',Font(name=FONT,bold=True),F_OK,RIGHT,M3)
C(s,f"I{r}",f'=SUM($I${ofirst}:$I${olast})',Font(name=FONT,bold=True,color="C00000"),F_OK,RIGHT,M3)
if olast>=ofirst:
    s.auto_filter.ref=f"A4:J{olast}";s.auto_filter.add_filter_column(9,["SIM"])
C(s,f"A{r+2}","A OS GERAL e gerada automatica da PROGRAMACAO (por Cod). Para 'gerar': preencha a programacao e use Dados > Reaplicar "
  "(o filtro Irriga=SIM mostra so os pivos que vao irrigar na semana). Energia = apenas pivos.",C_NOTE)
s.merge_cells(start_row=r+2,start_column=1,end_row=r+2,end_column=10)

# ========== LEIA-ME
s=ws("LEIA-ME","1F3864");setw(s,{"A":2,"B":100})
title(s,"Manejo de Irrigacao Karitel/RDM - v8","Manejo por cultura (enxuto) + CADASTRO separado. ETo semanal. Kc linear por DAE.")
for i,(a,b) in enumerate([
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

ordem=["LEIA-ME","DASHBOARD","PROGRAMACAO","OS_GERAL","SOJA","ALGODAO","TABACO","CACAU","MILHO","CADASTRO","ETO_SEMANAL","CURVAS_KC","LAMINA_HORA","PARAMETROS"]
wb._sheets.sort(key=lambda x: ordem.index(x.title) if x.title in ordem else 99)
wb.active=wb.sheetnames.index("SOJA")
try:
    from openpyxl.workbook.properties import CalcProperties
    wb.calculation=CalcProperties(fullCalcOnLoad=True,calcMode="auto")
except Exception as e:print("calcPr",e)
wb.save(OUT)
print("salvo:",OUT,"| abas:",len(wb.sheetnames))
pl=lambda cg:sum(1 for it in ROWS if it["cultgrp"]==cg and it["cod"] and it["plantio"] and it["plantio"]<=HOJE)
print("plantados hoje:",{cg:pl(cg) for cg in ["SOJA","ALGODÃO","TABACO","CACAU","MILHO"]})
