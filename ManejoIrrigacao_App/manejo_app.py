# -*- coding: utf-8 -*-
"""
Manejo de Irrigacao - App de mesa (offline) - Karitel / RDM
Programa de computador (Tkinter). NAO usa internet, NAO usa navegador.
Dados em app_data.json (mesma pasta). Estado salvo em manejo_estado.json.

Rodar:  python manejo_app.py     (Windows: clique em Abrir_App.bat)

Logica (topo do arquivo) usa so biblioteca padrao -> pode ser testada sem tela.
A interface (Tkinter) so e carregada quando o programa e executado.
"""
import os, json, csv, datetime as dt

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.join(BASE, "app_data.json")
STATE_FILE = os.path.join(BASE, "manejo_estado.json")

# ---------- parametros agronomicos ----------
KY = {"SOJA":0.85, "ALGODÃO":0.85, "MILHO":1.25, "TABACO":0.90, "CACAU":None}
EMERG = 5          # dias de emergencia (soja/algodao)
JANELA_H = 168     # horas na semana (acima disso: gargalo)
DIAS = ["Seg","Ter","Qua","Qui","Sex","Sab","Dom"]

# ---------- carregar dados ----------
def load_data():
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)

DATA = load_data()
PIVOS = {p["num"]: p for p in DATA["pivos"]}
CROPS = DATA["crops"]
PCTS  = DATA["pcts"]
KC    = DATA["kc"]

# ---------- estado (o que o usuario preenche) ----------
def default_state():
    return {"dataRef": dt.date.today().isoformat(), "etoK": "", "etoR": "",
            "chuva": "0", "ef": 0.90, "resp": "", "piv": {}, "os": {}}

def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            s = json.load(f)
        d = default_state(); d.update(s); d.setdefault("piv", {}); d.setdefault("os", {})
        return d
    except Exception:
        return default_state()

def save_state(S):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(S, f, ensure_ascii=False, indent=1)
    except Exception as e:
        print("erro ao salvar:", e)

def pstate(S, num):
    k = str(num)
    if k not in S["piv"]:
        S["piv"][k] = {"plantado": False, "plantio": "", "chuva": ""}
    return S["piv"][k]

# ---------- agronomia ----------
def dias_entre(a, b):
    if not a or not b: return None
    try:
        d1 = dt.date.fromisoformat(a); d2 = dt.date.fromisoformat(b)
    except Exception:
        return None
    return (d2 - d1).days

def eh_soja_alg(c): return c in ("SOJA", "ALGODÃO")

def kc_dia(colk, dae):
    arr = KC.get(colk)
    if not arr or dae is None or dae < 1: return None
    return arr[min(dae, len(arr)) - 1]

def eto_faz(S, faz):
    v = S["etoR"] if faz == "RDM" else S["etoK"]
    try: return float(v)
    except Exception: return None

def ky_de(cult):
    c = "MILHO" if cult.startswith("MILHO") else cult
    return KY.get(c)

def recomendar(pivo, nec_bruta):
    """Retorna (pct, horas, passes, gargalo). Horas = necessidade / vazao de lamina (constante)."""
    if nec_bruta is None or nec_bruta <= 0: return None
    lam, hor = pivo["lam"], pivo["hor"]
    vaz = lam[0] / hor[0]
    horas = nec_bruta / vaz
    idx = len(lam) - 1; passes = 1
    for i, l in enumerate(lam):
        if l >= nec_bruta: idx = i; break
    if lam[idx] < nec_bruta:
        passes = int((nec_bruta // lam[idx]) + (1 if nec_bruta % lam[idx] else 0))
    return {"pct": PCTS[idx], "horas": horas, "passes": passes, "gargalo": horas > JANELA_H}

def calc(S, num):
    pivo = PIVOS.get(num)
    if not pivo: return None
    crop = CROPS.get(str(num), {})
    st = pstate(S, num)
    plantio = st.get("plantio") or crop.get("plantio") or ""
    data_ref = S.get("dataRef") or dt.date.today().isoformat()
    dap = dias_entre(plantio, data_ref)
    cult = crop.get("cultura", "")
    dae = None if dap is None else (dap - EMERG if eh_soja_alg(cult) else dap)
    colk = crop.get("colk")
    kc = kc_dia(colk, dae) if colk else None
    eto = eto_faz(S, pivo["faz"])
    etc = kc * eto if (kc is not None and eto is not None) else None
    try: chuva = float(st["chuva"]) if st.get("chuva") not in ("", None) else float(S.get("chuva") or 0)
    except Exception: chuva = 0.0
    nec_liq = max(etc - chuva, 0) if etc is not None else None
    ef = float(S.get("ef") or 0.90)
    nec_bruta = nec_liq / ef if nec_liq is not None else None
    rec = recomendar(pivo, nec_bruta) if nec_bruta is not None else None
    energia = pivo["potkw"] * rec["horas"] if rec else None
    volume = nec_bruta * pivo["area"] * 10 if nec_bruta is not None else None
    ky = ky_de(cult)
    # perda se so chover (nao irrigar) esta semana
    perda = None
    if etc and etc > 0 and ky is not None:
        etreal = min(etc, chuva)
        perda = max(0.0, ky * (etc - etreal) / etc * 100)
    return {"pivo": pivo, "crop": crop, "cult": cult, "plantio": plantio, "dap": dap, "dae": dae,
            "kc": kc, "eto": eto, "etc": etc, "chuva": chuva, "nec_liq": nec_liq, "nec_bruta": nec_bruta,
            "rec": rec, "energia": energia, "volume": volume, "ky": ky, "perda": perda}

def decisao(r):
    if r is None or r["nec_bruta"] is None: return "dados incompletos"
    if r["nec_bruta"] <= 0.1: return "nao irrigar"
    if r["rec"] and r["rec"]["gargalo"]: return "IRRIGAR (gargalo!)"
    return "IRRIGAR"

def plantados(S):
    out = []
    for num, p in PIVOS.items():
        if pstate(S, num).get("plantado"): out.append(num)
    out.sort(key=lambda n: (PIVOS[n]["mod"], n))
    return out

def fmt(v, d=1):
    if v is None: return "-"
    try: return f"{float(v):,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception: return str(v)

# ====================================================================
# INTERFACE (Tkinter) - so carrega ao executar o programa
# ====================================================================
def main():
    import tkinter as tk
    from tkinter import ttk, messagebox, filedialog

    VERDE="#1f6b3b"; VERDE2="#2e8b51"; AREIA="#f5f2ea"; TERRA="#7a5230"
    MODCOR={"M1":"#2e8b51","M2":"#17607d","M3":"#c0622a","RDM":"#b58b1f"}
    MODNOME={"M1":"Modulo 1","M2":"Modulo 2","M3":"Modulo 3","RDM":"RDM"}

    S = load_state()
    root = tk.Tk()
    root.title("Manejo de Irrigacao - Karitel / RDM (offline)")
    root.geometry("1180x720"); root.configure(bg=AREIA)

    style = ttk.Style()
    try: style.theme_use("clam")
    except Exception: pass
    style.configure("Treeview", rowheight=24, font=("Segoe UI", 10))
    style.configure("Treeview.Heading", font=("Segoe UI", 9, "bold"), background=VERDE, foreground="white")
    style.configure("TNotebook.Tab", padding=(14,7), font=("Segoe UI", 10, "bold"))
    style.configure("TButton", font=("Segoe UI", 10))

    # cabecalho
    hdr = tk.Frame(root, bg=VERDE, height=52); hdr.pack(fill="x")
    tk.Label(hdr, text="  Manejo de Irrigacao", bg=VERDE, fg="white",
             font=("Segoe UI", 15, "bold")).pack(side="left", pady=10)
    tk.Label(hdr, text="Karitel - Rio do Meio - Safra 26/27   ", bg=VERDE, fg="#d8ead8",
             font=("Segoe UI", 10)).pack(side="right", pady=14)

    nb = ttk.Notebook(root); nb.pack(fill="both", expand=True, padx=8, pady=8)

    # ---------------- aba INICIO ----------------
    f_ini = tk.Frame(nb, bg=AREIA); nb.add(f_ini, text="  Inicio  ")
    tk.Label(f_ini, text="Parametros da semana", bg=AREIA, fg=VERDE,
             font=("Segoe UI", 13, "bold")).grid(row=0, column=0, columnspan=4, sticky="w", padx=12, pady=(14,4))
    tk.Label(f_ini, text="Informe a ETo acumulada da semana (mm). O resto o app calcula.",
             bg=AREIA, fg="#555").grid(row=1, column=0, columnspan=4, sticky="w", padx=12)
    campos = [("Data de referencia (AAAA-MM-DD)","dataRef"),("ETo semana - Karitel (mm)","etoK"),
              ("ETo semana - RDM (mm)","etoR"),("Chuva padrao da semana (mm)","chuva"),
              ("Eficiencia (0-1)","ef"),("Responsavel (OS)","resp")]
    ent = {}
    for i,(lbl,key) in enumerate(campos):
        tk.Label(f_ini, text=lbl, bg=AREIA, anchor="w").grid(row=2+i, column=0, sticky="w", padx=12, pady=5)
        e = tk.Entry(f_ini, width=24, font=("Segoe UI",11)); e.insert(0, str(S.get(key,"")))
        e.grid(row=2+i, column=1, sticky="w", pady=5); ent[key] = e
    def salvar_ini():
        for key,e in ent.items():
            v = e.get().strip()
            S[key] = float(v) if key=="ef" and v else v
        save_state(S); lbl_ok.config(text="Salvo."); atualizar_tudo()
    tk.Button(f_ini, text="Salvar", command=salvar_ini, bg=VERDE, fg="white",
              font=("Segoe UI",10,"bold"), padx=16, pady=4).grid(row=9, column=0, sticky="w", padx=12, pady=12)
    lbl_ok = tk.Label(f_ini, text="", bg=AREIA, fg=VERDE); lbl_ok.grid(row=9, column=1, sticky="w")
    lbl_kpi = tk.Label(f_ini, text="", bg=AREIA, fg=TERRA, font=("Segoe UI",10,"bold"), justify="left")
    lbl_kpi.grid(row=10, column=0, columnspan=4, sticky="w", padx=12, pady=8)

    # ---------------- aba PLANTIO ----------------
    f_pl = tk.Frame(nb, bg=AREIA); nb.add(f_pl, text="  Plantio  ")
    tk.Label(f_pl, text="Marque os pivos plantados e a data real (duplo-clique para editar).",
             bg=AREIA, fg="#555").pack(anchor="w", padx=10, pady=(10,4))
    tv_pl = ttk.Treeview(f_pl, columns=("mod","cult","var","plantio","plantado"), show="headings", height=22)
    for c,t,w in [("mod","Mod.",60),("cult","Cultura",90),("var","Variedade",160),
                  ("plantio","Data plantio",110),("plantado","Plantado?",90)]:
        tv_pl.heading(c, text=t); tv_pl.column(c, width=w, anchor="center")
    tv_pl.column("var", anchor="w")
    tv_pl.pack(fill="both", expand=True, padx=10, pady=6)
    def preencher_plantio():
        tv_pl.delete(*tv_pl.get_children())
        for num,p in sorted(PIVOS.items(), key=lambda kv:(kv[1]["mod"],kv[0])):
            crop = CROPS.get(str(num), {}); st = pstate(S, num)
            plantio = st.get("plantio") or crop.get("plantio") or ""
            tv_pl.insert("", "end", iid=str(num), values=(p["mod"], crop.get("cultura","-"),
                crop.get("variedade","-"), plantio, "SIM" if st.get("plantado") else "nao"))
    def editar_plantio(event):
        iid = tv_pl.focus()
        if not iid: return
        num = int(iid); st = pstate(S, num)
        win = tk.Toplevel(root); win.title(PIVOS[num]["nome"]); win.configure(bg=AREIA); win.grab_set()
        tk.Label(win, text=PIVOS[num]["nome"], bg=AREIA, font=("Segoe UI",12,"bold"), fg=VERDE).pack(padx=16,pady=8)
        tk.Label(win, text="Data de plantio (AAAA-MM-DD):", bg=AREIA).pack(padx=16, anchor="w")
        e = tk.Entry(win, width=20); e.insert(0, st.get("plantio") or CROPS.get(str(num),{}).get("plantio","")); e.pack(padx=16,pady=4)
        var = tk.BooleanVar(value=st.get("plantado", False))
        tk.Checkbutton(win, text="Plantado (aparece no manejo/OS)", variable=var, bg=AREIA).pack(padx=16, pady=6, anchor="w")
        def ok():
            st["plantio"] = e.get().strip(); st["plantado"] = var.get()
            save_state(S); preencher_plantio(); atualizar_tudo(); win.destroy()
        tk.Button(win, text="Salvar", command=ok, bg=VERDE, fg="white", padx=14, pady=3).pack(pady=10)
    tv_pl.bind("<Double-1>", editar_plantio)
    bar_pl = tk.Frame(f_pl, bg=AREIA); bar_pl.pack(fill="x", padx=10, pady=(0,8))
    def marcar_todos(v):
        for num in PIVOS: pstate(S,num)["plantado"]=v
        save_state(S); preencher_plantio(); atualizar_tudo()
    tk.Button(bar_pl, text="Marcar todos", command=lambda:marcar_todos(True)).pack(side="left", padx=4)
    tk.Button(bar_pl, text="Desmarcar todos", command=lambda:marcar_todos(False)).pack(side="left", padx=4)

    # ---------------- aba MANEJO & RECOMENDACAO ----------------
    f_mj = tk.Frame(nb, bg=AREIA); nb.add(f_mj, text="  Manejo e Recomendacao  ")
    top_mj = tk.Frame(f_mj, bg=AREIA); top_mj.pack(fill="x", padx=10, pady=8)
    tk.Label(top_mj, text="Cultura:", bg=AREIA).pack(side="left")
    cmb_cult = ttk.Combobox(top_mj, width=14, state="readonly", values=["(todas)"]); cmb_cult.set("(todas)")
    cmb_cult.pack(side="left", padx=6)
    cols_mj = ("pivo","mod","cult","dap","dae","kc","etc","nec","pct","horas","dec","perda")
    heads = [("pivo","Pivo",90),("mod","Mod.",55),("cult","Cultura",80),("dap","DAP",45),("dae","DAE",45),
             ("kc","Kc",50),("etc","ETc",60),("nec","Nec.bruta",80),("pct","% recom.",70),
             ("horas","Horas",60),("dec","Decisao",120),("perda","Perda s/irrig %",95)]
    tv_mj = ttk.Treeview(f_mj, columns=cols_mj, show="headings", height=20)
    for c,t,w in heads:
        tv_mj.heading(c, text=t); tv_mj.column(c, width=w, anchor="center")
    tv_mj.column("pivo", anchor="w")
    tv_mj.tag_configure("irr", background="#e2efda")
    tv_mj.tag_configure("garg", background="#f8cbad")
    tv_mj.pack(fill="both", expand=True, padx=10, pady=6)
    def preencher_manejo(*_):
        tv_mj.delete(*tv_mj.get_children())
        pls = plantados(S)
        culturas = sorted({CROPS.get(str(n),{}).get("cultura","") for n in pls if CROPS.get(str(n))})
        cmb_cult["values"] = ["(todas)"] + [c for c in culturas if c]
        filtro = cmb_cult.get()
        for num in pls:
            r = calc(S, num)
            if not r: continue
            if filtro not in ("(todas)","") and r["cult"] != filtro: continue
            dec = decisao(r); tag = ""
            if dec.startswith("IRRIGAR"): tag = "garg" if "gargalo" in dec else "irr"
            rec = r["rec"]
            tv_mj.insert("", "end", values=(r["pivo"]["nome"], r["pivo"]["mod"], r["cult"],
                r["dap"] if r["dap"] is not None else "-", r["dae"] if r["dae"] is not None else "-",
                fmt(r["kc"],2), fmt(r["etc"]), fmt(r["nec_bruta"]),
                (str(rec["pct"])+"%") if rec else "-", fmt(rec["horas"]) if rec else "-",
                dec, fmt(r["perda"],0)), tags=(tag,))
    cmb_cult.bind("<<ComboboxSelected>>", preencher_manejo)

    # ---------------- aba OS DO DIA ----------------
    f_os = tk.Frame(nb, bg=AREIA); nb.add(f_os, text="  OS do dia  ")
    top_os = tk.Frame(f_os, bg=AREIA); top_os.pack(fill="x", padx=10, pady=8)
    tk.Label(top_os, text="Data da OS:", bg=AREIA).pack(side="left")
    e_osdate = tk.Entry(top_os, width=13); e_osdate.insert(0, S.get("dataRef","")); e_osdate.pack(side="left", padx=6)
    lbl_dia = tk.Label(top_os, text="", bg=AREIA, fg=VERDE, font=("Segoe UI",10,"bold")); lbl_dia.pack(side="left", padx=6)
    tk.Label(f_os, text="Recomendacao do dia por modulo. Duplo-clique p/ horimetro e observacoes. "
             "A OS usa a recomendacao automatica (quem precisa irrigar).", bg=AREIA, fg="#555").pack(anchor="w", padx=10)
    cols_os = ("mod","pivo","casa","cult","pct","lam","horas","hi","hf","obs")
    heads_os=[("mod","Mod.",55),("pivo","Pivo",90),("casa","Casa",55),("cult","Cultura",80),
              ("pct","%",50),("lam","Lamina",65),("horas","Horas",60),
              ("hi","Horim.ini",80),("hf","Horim.fim",80),("obs","Observacoes",200)]
    tv_os = ttk.Treeview(f_os, columns=cols_os, show="headings", height=18)
    for c,t,w in heads_os:
        tv_os.heading(c, text=t); tv_os.column(c, width=w, anchor="center")
    tv_os.column("pivo", anchor="w"); tv_os.column("obs", anchor="w")
    tv_os.tag_configure("garg", background="#f8cbad")
    tv_os.pack(fill="both", expand=True, padx=10, pady=6)
    lbl_os_tot = tk.Label(f_os, text="", bg=AREIA, fg=TERRA, font=("Segoe UI",10,"bold")); lbl_os_tot.pack(anchor="w", padx=10)

    def os_rows():
        date = e_osdate.get().strip() or S.get("dataRef","")
        # recomendacao do dia = pivos plantados que precisam irrigar (nec_bruta>0.1)
        linhas=[]
        for num in plantados(S):
            r = calc(S, num)
            if not r or not r["rec"] or r["nec_bruta"] is None or r["nec_bruta"]<=0.1: continue
            linhas.append((num, r))
        return date, linhas
    def preencher_os(*_):
        tv_os.delete(*tv_os.get_children())
        date, linhas = os_rows()
        try: dsem = DIAS[dt.date.fromisoformat(date).weekday()]
        except Exception: dsem = "-"
        lbl_dia.config(text="("+dsem+")")
        totH=0; totN=0
        osd_all = S["os"].get(date, {})
        for mod in ["M1","M2","M3","RDM"]:
            grp=[(n,r) for n,r in linhas if r["pivo"]["mod"]==mod]
            if not grp: continue
            tv_os.insert("", "end", values=(MODNOME[mod], f"-- {len(grp)} pivos --","","","","","","","",""))
            for num,r in grp:
                rec=r["rec"]; cod=r["pivo"]["cod"]; osd=osd_all.get(cod,{})
                totH+=rec["horas"]; totN+=1
                tv_os.insert("", "end", iid=f"{date}|{cod}", values=(mod, r["pivo"]["nome"], r["pivo"]["casa"],
                    r["cult"], str(rec["pct"])+"%", fmt(r["volume"] and r["nec_bruta"]) if False else fmt(r["nec_bruta"]),
                    fmt(rec["horas"]), osd.get("hi",""), osd.get("hf",""), osd.get("obs","")),
                    tags=("garg",) if rec["gargalo"] else ())
        lbl_os_tot.config(text=f"Total do dia: {totN} pivos  -  {fmt(totH)} horas")
    def editar_os(event):
        iid = tv_os.focus()
        if not iid or "|" not in iid: return
        date, cod = iid.split("|",1)
        osd = S["os"].setdefault(date, {}).setdefault(cod, {})
        win=tk.Toplevel(root); win.title("OS "+cod); win.configure(bg=AREIA); win.grab_set()
        tk.Label(win, text="Horimetro inicial:", bg=AREIA).grid(row=0,column=0,sticky="w",padx=12,pady=6)
        e1=tk.Entry(win,width=16); e1.insert(0,osd.get("hi","")); e1.grid(row=0,column=1,padx=8)
        tk.Label(win, text="Horimetro final:", bg=AREIA).grid(row=1,column=0,sticky="w",padx=12,pady=6)
        e2=tk.Entry(win,width=16); e2.insert(0,osd.get("hf","")); e2.grid(row=1,column=1,padx=8)
        tk.Label(win, text="Observacoes:", bg=AREIA).grid(row=2,column=0,sticky="w",padx=12,pady=6)
        e3=tk.Entry(win,width=40); e3.insert(0,osd.get("obs","")); e3.grid(row=2,column=1,padx=8)
        def ok():
            osd["hi"]=e1.get().strip(); osd["hf"]=e2.get().strip(); osd["obs"]=e3.get().strip()
            save_state(S); preencher_os(); win.destroy()
        tk.Button(win,text="Salvar",command=ok,bg=VERDE,fg="white",padx=14,pady=3).grid(row=3,column=0,columnspan=2,pady=12)
    tv_os.bind("<Double-1>", editar_os)
    bar_os=tk.Frame(f_os,bg=AREIA); bar_os.pack(fill="x",padx=10,pady=(0,10))
    e_osdate.bind("<Return>", preencher_os)
    tk.Button(bar_os,text="Atualizar", command=preencher_os).pack(side="left",padx=4)
    def exportar_os():
        date, linhas = os_rows()
        if not linhas:
            messagebox.showinfo("OS do dia","Nenhum pivo precisa irrigar nesta data."); return
        path = filedialog.asksaveasfilename(defaultextension=".csv",
            initialfile=f"OS_{date}.csv", filetypes=[("CSV (Excel)","*.csv")])
        if not path: return
        osd_all=S["os"].get(date,{})
        with open(path,"w",newline="",encoding="utf-8-sig") as fp:
            w=csv.writer(fp,delimiter=";")
            w.writerow([f"ORDEM DE SERVICO - {date}","","Resp.:",S.get("resp","")])
            w.writerow([])
            w.writerow(["Modulo","Pivo","Casa","Cultura","Percentimetro","Lamina(mm)","Horas prev.",
                        "Horim.inicial","Horim.final","Observacoes"])
            for mod in ["M1","M2","M3","RDM"]:
                grp=[(n,r) for n,r in linhas if r["pivo"]["mod"]==mod]
                if not grp: continue
                for num,r in grp:
                    rec=r["rec"]; cod=r["pivo"]["cod"]; osd=osd_all.get(cod,{})
                    w.writerow([MODNOME[mod], r["pivo"]["nome"], r["pivo"]["casa"], r["cult"],
                        f"{rec['pct']}%", fmt(r["nec_bruta"]), fmt(rec["horas"]),
                        osd.get("hi",""), osd.get("hf",""), osd.get("obs","")])
        messagebox.showinfo("OS do dia", "OS exportada:\n"+path)
    tk.Button(bar_os, text="Exportar OS (Excel/CSV)", command=exportar_os, bg=TERRA, fg="white",
              font=("Segoe UI",10,"bold"), padx=12, pady=3).pack(side="left", padx=8)

    # ---------------- aba SOBRE ----------------
    f_sb = tk.Frame(nb, bg=AREIA); nb.add(f_sb, text="  Sobre  ")
    sobre=("App de Manejo de Irrigacao - offline\n\n"
           "Rotina:\n"
           "  1) Inicio: informe a ETo da semana (Karitel/RDM), data e chuva.\n"
           "  2) Plantio: marque os pivos plantados e a data real.\n"
           "  3) Manejo e Recomendacao: o app calcula Kc, ETc, necessidade e JA RECOMENDA\n"
           "     o percentimetro e as horas, com a decisao (irrigar / nao / gargalo).\n"
           "  4) OS do dia: escolha a data, preencha horimetro/observacoes e exporte.\n\n"
           "Base tecnica: Kc FAO-56 (linear por DAE); emergencia 5 dias (soja/algodao);\n"
           "necessidade bruta = liquida / eficiencia; horas = necessidade / vazao de lamina;\n"
           "gargalo quando horas > 168h/semana; perda por deficit via Ky (FAO-33).\n\n"
           "Tudo offline. Seus dados ficam em manejo_estado.json (nesta pasta).")
    tk.Label(f_sb, text=sobre, bg=AREIA, justify="left", font=("Consolas",10)).pack(anchor="w", padx=14, pady=14)

    # ---------------- atualizacao geral ----------------
    def atualizar_tudo():
        n_pl = len(plantados(S))
        falta = []
        if not S.get("etoK"): falta.append("ETo Karitel")
        if not S.get("etoR"): falta.append("ETo RDM")
        txt = f"Pivos plantados: {n_pl}   |   Pivos cadastrados: {len(PIVOS)}"
        if falta: txt += "\nFalta informar: " + ", ".join(falta) + " (aba Inicio)."
        lbl_kpi.config(text=txt)
        preencher_plantio(); preencher_manejo(); preencher_os()

    preencher_plantio(); atualizar_tudo()
    nb.bind("<<NotebookTabChanged>>", lambda e: atualizar_tudo())
    root.mainloop()

if __name__ == "__main__":
    main()
