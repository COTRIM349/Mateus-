import streamlit as st
st.set_page_config(
    page_title="Manejo de Irrigação",
    page_icon="💧",
    layout="wide",
    initial_sidebar_state="expanded",
)

import pandas as pd
import numpy as np
import plotly.graph_objects as go
from datetime import date, timedelta

# ─── Dados Mock ────────────────────────────────────────────────────────────────

@st.cache_data
def gerar_dados_mock():
    np.random.seed(42)

    FASES = [
        {"nome": "Plantio / Germinação", "kc": 0.40, "dias": 7},
        {"nome": "Desenvolvimento",       "kc": 0.75, "dias": 10},
        {"nome": "Intermediário",         "kc": 1.15, "dias": 8},
        {"nome": "Final",                 "kc": 0.80, "dias": 8},
    ]
    SOLO = {
        "textura": "Franco-argilosa",
        "cc_pct": 32.0,
        "pmp_pct": 14.0,
        "profundidade_cm": 40.0,
        "densidade_g_cm3": 1.35,
        "adt_mm": (32.0 - 14.0) * 40.0 / 10,   # 72 mm
        "fad": 0.50,
        "afd_mm": (32.0 - 14.0) * 40.0 / 10 * 0.50,  # 36 mm
        "sistema": "Gotejamento",
        "eficiencia_pct": 90.0,
        "vazao_m3h": 12.0,
        "area_ha": 5.0,
    }

    inicio = date(2024, 1, 15)
    n_dias = 30
    cc_mm = SOLO["cc_pct"] / 100 * SOLO["profundidade_cm"] * 10 * SOLO["densidade_g_cm3"]
    pmp_mm = SOLO["pmp_pct"] / 100 * SOLO["profundidade_cm"] * 10 * SOLO["densidade_g_cm3"]
    afd_mm = SOLO["afd_mm"]
    trigger_mm = cc_mm - afd_mm   # nível mínimo aceitável de água no solo

    # Gera ETo senoidal (verão Brasil, 4.5–6.5 mm/dia)
    dias_idx = np.arange(n_dias)
    eto_arr = 5.5 + 1.0 * np.sin(dias_idx * 2 * np.pi / 30)

    # Gera precipitação esparsa (~6 eventos)
    chuva_arr = np.zeros(n_dias)
    dias_chuva = np.random.choice(n_dias, size=6, replace=False)
    chuva_arr[dias_chuva] = np.random.uniform(5, 20, size=6)

    # Monta fase por dia
    fase_por_dia = []
    kc_por_dia = []
    d = 0
    for f in FASES:
        for _ in range(f["dias"]):
            if d < n_dias:
                fase_por_dia.append(f["nome"])
                kc_por_dia.append(f["kc"])
                d += 1

    # Máquina de estados: umidade do solo
    umidade_mm = cc_mm * 0.70   # começa em 70% da CC
    rows = []
    for i in range(n_dias):
        kc = kc_por_dia[i]
        eto = eto_arr[i]
        etc = eto * kc
        chuva = chuva_arr[i]
        irrigacao = 0.0

        umidade_mm += chuva - etc
        if umidade_mm < trigger_mm:
            irrigacao = cc_mm - umidade_mm
            umidade_mm = cc_mm

        umidade_mm = min(cc_mm, max(pmp_mm, umidade_mm))
        umidade_pct = umidade_mm / cc_mm * SOLO["cc_pct"]
        saldo = chuva + irrigacao - etc

        rows.append({
            "data": inicio + timedelta(days=i),
            "fase": fase_por_dia[i],
            "kc": kc,
            "eto_mm": round(eto, 2),
            "etc_mm": round(etc, 2),
            "precipitacao_mm": round(chuva, 2),
            "irrigacao_mm": round(irrigacao, 2),
            "saldo_hidrico_mm": round(saldo, 2),
            "umidade_solo_pct": round(umidade_pct, 1),
            "irrigar": "S" if irrigacao > 0 else "N",
        })

    df_balanco = pd.DataFrame(rows)

    # Agenda de irrigação: dias que foram irrigados
    ef = SOLO["eficiencia_pct"] / 100
    agenda_rows = []
    for _, r in df_balanco[df_balanco["irrigar"] == "S"].iterrows():
        liq = r["irrigacao_mm"]
        bruta = liq / ef
        vol = bruta * SOLO["area_ha"] * 10
        tempo = vol / SOLO["vazao_m3h"]
        agenda_rows.append({
            "Data Prevista": r["data"],
            "Fase": r["fase"],
            "Lâmina Líquida (mm)": round(liq, 1),
            "Lâmina Bruta (mm)": round(bruta, 1),
            "Volume (m³)": round(vol, 0),
            "Tempo (h)": round(tempo, 1),
        })
    df_agenda = pd.DataFrame(agenda_rows)

    # Resumo da safra
    total_irr_mm = df_balanco["irrigacao_mm"].sum()
    total_irr_m3 = (total_irr_mm / ef) * SOLO["area_ha"] * 10
    resumo = {
        "total_irrigado_mm": round(total_irr_mm, 1),
        "total_irrigado_m3": round(total_irr_m3, 0),
        "n_irrigacoes": int((df_balanco["irrigacao_mm"] > 0).sum()),
        "precipitacao_total_mm": round(df_balanco["precipitacao_mm"].sum(), 1),
        "etc_total_mm": round(df_balanco["etc_mm"].sum(), 1),
        "deficit_superavit_mm": round(df_balanco["saldo_hidrico_mm"].sum(), 1),
        "custo_energia_brl": round(total_irr_m3 * 0.08 * 0.75, 2),
    }

    return df_balanco, df_agenda, SOLO, resumo

df_balanco, df_agenda, solo, resumo = gerar_dados_mock()

# ─── Sidebar ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.title("💧 Manejo de Irrigação")
    st.divider()
    st.metric("Cultura", "Soja")
    st.metric("Área", f"{solo['area_ha']} ha")
    st.metric("Sistema", solo["sistema"])
    st.metric("Eficiência", f"{solo['eficiencia_pct']}%")
    st.metric("Vazão", f"{solo['vazao_m3h']} m³/h")
    st.divider()
    st.info("Fazenda Demo\nResponsável: Mateus\n\nDados simulados para fins demonstrativos.")
    st.caption("Metodologia FAO-56 (Allen et al., 1998)")

# ─── Seção 1: Balanço Hídrico Diário ──────────────────────────────────────────

st.header("Balanço Hídrico Diário")
col_graf, col_met = st.columns([3, 1])

with col_graf:
    fig1 = go.Figure()
    fig1.add_trace(go.Bar(
        x=df_balanco["data"], y=df_balanco["precipitacao_mm"],
        name="Precipitação (mm)", marker_color="#4A90D9",
    ))
    fig1.add_trace(go.Bar(
        x=df_balanco["data"], y=df_balanco["irrigacao_mm"],
        name="Irrigação Aplicada (mm)", marker_color="#27AE60",
    ))
    fig1.add_trace(go.Scatter(
        x=df_balanco["data"], y=df_balanco["etc_mm"],
        name="ETc (mm)", mode="lines+markers",
        line=dict(color="#E67E22", width=2),
        marker=dict(size=5),
    ))
    fig1.update_layout(
        barmode="group",
        template="plotly_white",
        legend=dict(orientation="h", y=1.12),
        xaxis=dict(tickformat="%d/%m"),
        yaxis_title="mm",
        margin=dict(t=40, b=20),
        height=320,
    )
    st.plotly_chart(fig1, use_container_width=True)

with col_met:
    st.metric("ETc Média (mm/dia)", f"{df_balanco['etc_mm'].mean():.1f}")
    st.metric("Dias Irrigados", resumo["n_irrigacoes"])
    st.metric("Dias com Chuva", int((df_balanco["precipitacao_mm"] > 0).sum()))
    delta_val = resumo["deficit_superavit_mm"]
    st.metric(
        "Saldo Hídrico Total",
        f"{delta_val:+.1f} mm",
        delta=f"{delta_val:+.1f} mm",
        delta_color="normal",
    )

st.divider()

# ─── Seção 2: Agenda de Irrigação ─────────────────────────────────────────────

st.header("Agenda de Irrigação")

proximo = df_agenda.iloc[0] if not df_agenda.empty else None
if proximo is not None:
    st.info(
        f"Próxima irrigação: **{proximo['Data Prevista'].strftime('%d/%m/%Y')}** — "
        f"Fase: {proximo['Fase']} — "
        f"Lâmina recomendada: **{proximo['Lâmina Líquida (mm)']} mm** "
        f"({proximo['Volume (m³)']:.0f} m³ em {proximo['Tempo (h)']} h)"
    )

st.dataframe(
    df_agenda,
    column_config={
        "Data Prevista":        st.column_config.DateColumn("Data Prevista", format="DD/MM/YYYY"),
        "Fase":                 st.column_config.TextColumn("Fase"),
        "Lâmina Líquida (mm)":  st.column_config.NumberColumn("Lâmina Líquida (mm)", format="%.1f"),
        "Lâmina Bruta (mm)":    st.column_config.NumberColumn("Lâmina Bruta (mm)", format="%.1f"),
        "Volume (m³)":          st.column_config.NumberColumn("Volume (m³)", format="%.0f"),
        "Tempo (h)":            st.column_config.NumberColumn("Tempo (h)", format="%.1f"),
    },
    use_container_width=True,
    hide_index=True,
)

st.divider()

# ─── Seção 3: Dados do Solo e Cultura ─────────────────────────────────────────

st.header("Dados do Solo e Cultura")

ultima = df_balanco.iloc[-1]
c1, c2, c3, c4 = st.columns(4)
c1.metric("Umidade Atual do Solo", f"{ultima['umidade_solo_pct']:.1f} %",
          delta=f"{ultima['umidade_solo_pct'] - solo['cc_pct']:.1f} % vs. CC")
c2.metric("Fase Fenológica", ultima["fase"])
c3.metric("Kc Atual", f"{ultima['kc']:.2f}")
c4.metric("ETo (último dia)", f"{ultima['eto_mm']:.1f} mm/dia")

c5, c6, c7 = st.columns(3)
c5.metric("Capacidade de Campo (CC)", f"{solo['cc_pct']} %")
c6.metric("Ponto de Murcha (PMP)", f"{solo['pmp_pct']} %")
c7.metric("Água Facilmente Disponível (AFD)", f"{solo['afd_mm']:.0f} mm")

col_gauge, col_kc = st.columns(2)

with col_gauge:
    fig_gauge = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=ultima["umidade_solo_pct"],
        title={"text": "Umidade Atual do Solo (%)"},
        delta={"reference": solo["cc_pct"], "valueformat": ".1f"},
        gauge={
            "axis": {"range": [solo["pmp_pct"] - 2, solo["cc_pct"] + 2]},
            "bar": {"color": "#27AE60"},
            "steps": [
                {"range": [solo["pmp_pct"] - 2, solo["pmp_pct"]], "color": "#E74C3C"},
                {"range": [solo["pmp_pct"], solo["cc_pct"] - solo["afd_mm"] / 10], "color": "#F39C12"},
                {"range": [solo["cc_pct"] - solo["afd_mm"] / 10, solo["cc_pct"] + 2], "color": "#ABEBC6"},
            ],
            "threshold": {
                "line": {"color": "#E74C3C", "width": 3},
                "thickness": 0.75,
                "value": solo["cc_pct"] - solo["afd_mm"] / 10,
            },
        },
    ))
    fig_gauge.update_layout(height=280, margin=dict(t=40, b=10))
    st.plotly_chart(fig_gauge, use_container_width=True)
    st.caption("Vermelho = abaixo do PMP | Laranja = zona de alerta | Verde = zona segura")

with col_kc:
    fig_kc = go.Figure()
    fig_kc.add_trace(go.Scatter(
        x=df_balanco["data"], y=df_balanco["kc"],
        mode="lines", line=dict(color="#8E44AD", width=2, shape="hv"),
        fill="tozeroy", fillcolor="rgba(142,68,173,0.1)",
        name="Kc",
    ))
    # Linhas de transição de fase
    fases_unicas = df_balanco.drop_duplicates("fase", keep="first")
    shapes = []
    for _, fr in fases_unicas.iloc[1:].iterrows():
        shapes.append(dict(
            type="line", x0=fr["data"], x1=fr["data"],
            y0=0, y1=1.3, xref="x", yref="y",
            line=dict(color="gray", width=1, dash="dot"),
        ))
    fig_kc.update_layout(
        title="Evolução do Kc — Ciclo da Soja",
        template="plotly_white",
        xaxis=dict(tickformat="%d/%m"),
        yaxis=dict(range=[0, 1.4], title="Kc"),
        shapes=shapes,
        height=280,
        margin=dict(t=50, b=20),
    )
    st.plotly_chart(fig_kc, use_container_width=True)
    st.caption("Linhas tracejadas = transições entre fases fenológicas")

st.divider()

# ─── Seção 4: Resumo da Safra ──────────────────────────────────────────────────

st.header("Resumo da Safra")

r1, r2, r3, r4 = st.columns(4)
r1.metric("Total Irrigado", f"{resumo['total_irrigado_mm']} mm",
          delta=f"{resumo['total_irrigado_m3']:.0f} m³")
r2.metric("ETc Acumulada", f"{resumo['etc_total_mm']} mm")
deficit = resumo["deficit_superavit_mm"]
r3.metric("Déficit / Superávit", f"{deficit:+.1f} mm",
          delta=f"{deficit:+.1f} mm", delta_color="normal")
r4.metric("Custo Est. de Energia", f"R$ {resumo['custo_energia_brl']:.2f}")

col_pie, col_fases = st.columns(2)

with col_pie:
    fig_pie = go.Figure(go.Pie(
        labels=["Irrigação", "Precipitação"],
        values=[resumo["total_irrigado_mm"], resumo["precipitacao_total_mm"]],
        hole=0.4,
        marker_colors=["#27AE60", "#4A90D9"],
    ))
    fig_pie.update_layout(
        title="Origem da Água (mm)",
        template="plotly_white",
        height=320,
        margin=dict(t=50, b=10),
    )
    st.plotly_chart(fig_pie, use_container_width=True)

with col_fases:
    df_fase = df_balanco.groupby("fase", sort=False).agg(
        etc_mm=("etc_mm", "sum"),
        irrigacao_mm=("irrigacao_mm", "sum"),
        precipitacao_mm=("precipitacao_mm", "sum"),
    ).reset_index()

    fig_fases = go.Figure()
    fig_fases.add_trace(go.Bar(x=df_fase["fase"], y=df_fase["etc_mm"],
                                name="ETc (mm)", marker_color="#E67E22"))
    fig_fases.add_trace(go.Bar(x=df_fase["fase"], y=df_fase["irrigacao_mm"],
                                name="Irrigação (mm)", marker_color="#27AE60"))
    fig_fases.add_trace(go.Bar(x=df_fase["fase"], y=df_fase["precipitacao_mm"],
                                name="Precipitação (mm)", marker_color="#4A90D9"))
    fig_fases.update_layout(
        title="Resumo por Fase Fenológica",
        barmode="group",
        template="plotly_white",
        yaxis_title="mm",
        legend=dict(orientation="h", y=1.12),
        height=320,
        margin=dict(t=50, b=10),
    )
    st.plotly_chart(fig_fases, use_container_width=True)

st.divider()
st.caption("Modelo de referência baseado na metodologia FAO-56 (Allen et al., 1998). Dados simulados para fins demonstrativos.")
