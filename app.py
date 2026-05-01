import io
import random

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from datetime import date, timedelta
from plotly.subplots import make_subplots

st.set_page_config(
    page_title="Manejo de Irrigação — Pivô Central",
    page_icon="💧",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─────────────────────────────────────────────────────────────
# CONSTANTES FAO-56
# ─────────────────────────────────────────────────────────────
CROPS = {
    "Soja": {
        "kcb_ini": 0.15, "kcb_mid": 1.10, "kcb_end": 0.50,
        "l_ini": 15, "l_dev": 30, "l_mid": 40, "l_late": 15,
        "height": 0.8, "p": 0.55, "Zr": 1.0, "Ze": 0.10, "few": 0.30,
    },
    "Algodão": {
        "kcb_ini": 0.15, "kcb_mid": 1.10, "kcb_end": 0.50,
        "l_ini": 30, "l_dev": 50, "l_mid": 55, "l_late": 45,
        "height": 1.2, "p": 0.65, "Zr": 1.3, "Ze": 0.10, "few": 0.35,
    },
    "Cacau": {
        "kcb_ini": 0.90, "kcb_mid": 1.00, "kcb_end": 0.90,
        "l_ini": 60, "l_dev": 90, "l_mid": 120, "l_late": 60,
        "height": 3.0, "p": 0.50, "Zr": 0.8, "Ze": 0.10, "few": 0.20,
    },
    "Milho": {
        "kcb_ini": 0.15, "kcb_mid": 1.15, "kcb_end": 0.50,
        "l_ini": 20, "l_dev": 35, "l_mid": 40, "l_late": 30,
        "height": 2.0, "p": 0.55, "Zr": 1.3, "Ze": 0.10, "few": 0.30,
    },
    "Tabaco": {
        "kcb_ini": 0.30, "kcb_mid": 1.00, "kcb_end": 0.90,
        "l_ini": 30, "l_dev": 45, "l_mid": 45, "l_late": 25,
        "height": 1.5, "p": 0.50, "Zr": 0.7, "Ze": 0.10, "few": 0.35,
    },
}

SOILS = {
    "Areia":           {"FC": 0.10, "PWP": 0.04, "REW": 6},
    "Franco-Arenosa":  {"FC": 0.18, "PWP": 0.08, "REW": 8},
    "Franco":          {"FC": 0.25, "PWP": 0.12, "REW": 10},
    "Franco-Argilosa": {"FC": 0.30, "PWP": 0.16, "REW": 10},
    "Argila":          {"FC": 0.37, "PWP": 0.21, "REW": 12},
}

STAGE_COLORS = {
    "Inicial": "#7c3aed",
    "Desenvolvimento": "#059669",
    "Médio": "#d97706",
    "Final": "#dc2626",
}

# ─────────────────────────────────────────────────────────────
# FUNÇÕES AUXILIARES
# ─────────────────────────────────────────────────────────────

def get_kcb(day, l_ini, l_dev, l_mid, l_late, kcb_ini, kcb_mid, kcb_end):
    d1 = l_ini
    d2 = l_ini + l_dev
    d3 = d2 + l_mid
    if day <= d1:
        return "Inicial", kcb_ini
    elif day <= d2:
        frac = (day - d1) / l_dev
        return "Desenvolvimento", kcb_ini + frac * (kcb_mid - kcb_ini)
    elif day <= d3:
        return "Médio", kcb_mid
    else:
        frac = min(1.0, (day - d3) / max(l_late, 1))
        return "Final", kcb_mid + frac * (kcb_end - kcb_mid)


def calc_soil_params(FC, PWP, Zr, Ze, p, REW):
    TAW = 1000 * (FC - PWP) * Zr
    RAW = p * TAW
    TEW = 1000 * (FC - 0.5 * PWP) * Ze
    return TAW, RAW, TEW


def calc_water_balance(climate_df: pd.DataFrame, params: dict):
    FC, PWP = params["FC"], params["PWP"]
    Zr, Ze, p = params["Zr"], params["Ze"], params["p"]
    few, h, REW = params["few"], params["height"], params["REW"]
    kcb_ini, kcb_mid, kcb_end = params["kcb_ini"], params["kcb_mid"], params["kcb_end"]
    l_ini, l_dev = params["l_ini"], params["l_dev"]
    l_mid, l_late = params["l_mid"], params["l_late"]
    pivot_eff = params["pivot_eff"]

    TAW, RAW, TEW = calc_soil_params(FC, PWP, Zr, Ze, p, REW)

    Dr = RAW * 0.5
    De = 0.0
    rows = []

    for i, row in climate_df.reset_index(drop=True).iterrows():
        day = i + 1
        ETo   = float(row["ETo (mm)"])
        P     = float(row["Precip (mm)"])
        u2    = float(row["u2 (m/s)"])
        RHmin = float(row["RHmin (%)"])

        stage, Kcb = get_kcb(day, l_ini, l_dev, l_mid, l_late, kcb_ini, kcb_mid, kcb_end)

        Kc_max = max(
            1.2 + (0.04 * (u2 - 2) - 0.004 * (RHmin - 45)) * (h / 3) ** 0.3,
            Kcb + 0.05,
        )

        Kr = 1.0 if De <= REW else max(0.0, (TEW - De) / (TEW - REW))
        Ke = min(Kr * (Kc_max - Kcb), few * Kc_max)

        Ks = 1.0 if Dr <= RAW else max(0.0, (TAW - Dr) / ((1 - p) * TAW))
        ETc_adj = (Kcb * Ks + Ke) * ETo

        irrigated = Dr >= RAW
        I_liq = Dr if irrigated else 0.0

        P_ef = P * 0.9
        Dr = max(0.0, min(TAW, Dr - P_ef - I_liq + ETc_adj))
        De = max(0.0, min(TEW, De - P_ef - I_liq + Ke * ETo))

        rows.append({
            "Dia": day,
            "Data": row.get("Data", f"Dia {day}"),
            "Estádio": stage,
            "Kcb": round(Kcb, 3),
            "Ke": round(Ke, 3),
            "Ks": round(Ks, 2),
            "ETo (mm)": round(ETo, 1),
            "ETc (mm)": round(ETc_adj, 1),
            "Precip (mm)": round(P, 1),
            "Irrig Líq (mm)": round(I_liq, 1),
            "Irrig Bruta (mm)": round(I_liq / pivot_eff, 1) if I_liq > 0 else 0.0,
            "Dr (mm)": round(Dr, 1),
            "Dr/TAW (%)": round(Dr / TAW * 100, 1),
            "TAW": round(TAW, 1),
            "RAW": round(RAW, 1),
            "Irrigou": irrigated,
        })

    return pd.DataFrame(rows), TAW, RAW


def generate_typical_climate(n_days: int, start_date: date) -> pd.DataFrame:
    rng = random.Random(42)
    data = []
    for i in range(n_days):
        d = start_date + timedelta(days=i)
        data.append({
            "Data": d.strftime("%d/%m/%Y"),
            "ETo (mm)": round(5.0 + 2.0 * np.sin(i / 30 * np.pi), 1),
            "Precip (mm)": round(rng.random() * 25, 1) if rng.random() < 0.25 else 0.0,
            "Tmax (°C)": round(30 + 3 * np.sin(i / 60 * np.pi), 1),
            "Tmin (°C)": round(20 + 2 * np.sin(i / 60 * np.pi), 1),
            "u2 (m/s)": round(1.5 + rng.random(), 1),
            "RHmin (%)": int(40 + 15 * rng.random()),
        })
    return pd.DataFrame(data)


def to_csv(df: pd.DataFrame) -> bytes:
    buf = io.StringIO()
    df.to_csv(buf, index=False, encoding="utf-8-sig")
    return buf.getvalue().encode("utf-8-sig")


# ─────────────────────────────────────────────────────────────
# SIDEBAR — PARÂMETROS GLOBAIS
# ─────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("💧 Parâmetros")

    st.subheader("🌱 Cultura & Solo")
    crop_name = st.selectbox("Cultura", list(CROPS.keys()))
    soil_name = st.selectbox("Tipo de Solo", list(SOILS.keys()), index=2)
    plant_date = st.date_input("Data de Plantio", value=date.today())

    crop = CROPS[crop_name].copy()
    soil = SOILS[soil_name].copy()

    st.subheader("📐 Kc Dual (FAO-56)")
    c1, c2, c3 = st.columns(3)
    with c1:
        crop["kcb_ini"] = st.number_input("Kcb ini", value=crop["kcb_ini"], step=0.01, min_value=0.0, max_value=2.0, format="%.2f")
    with c2:
        crop["kcb_mid"] = st.number_input("Kcb mid", value=crop["kcb_mid"], step=0.01, min_value=0.0, max_value=2.0, format="%.2f")
    with c3:
        crop["kcb_end"] = st.number_input("Kcb end", value=crop["kcb_end"], step=0.01, min_value=0.0, max_value=2.0, format="%.2f")

    st.subheader("📅 Estádios (dias)")
    c1, c2 = st.columns(2)
    with c1:
        crop["l_ini"]  = st.number_input("L inicial", value=crop["l_ini"],  min_value=1, max_value=120)
        crop["l_mid"]  = st.number_input("L médio",   value=crop["l_mid"],  min_value=1, max_value=180)
    with c2:
        crop["l_dev"]  = st.number_input("L desenv.", value=crop["l_dev"],  min_value=1, max_value=120)
        crop["l_late"] = st.number_input("L final",   value=crop["l_late"], min_value=1, max_value=120)

    total_days = crop["l_ini"] + crop["l_dev"] + crop["l_mid"] + crop["l_late"]
    st.info(f"Ciclo total: **{total_days} dias**")

    st.subheader("🪱 Solo")
    c1, c2 = st.columns(2)
    with c1:
        soil["FC"]  = st.number_input("θFC",         value=soil["FC"],  step=0.01, min_value=0.05, max_value=0.60, format="%.2f")
        crop["Zr"]  = st.number_input("Zr (m)",      value=crop["Zr"],  step=0.1,  min_value=0.2,  max_value=2.5,  format="%.1f")
        crop["Ze"]  = st.number_input("Ze (m)",      value=crop["Ze"],  step=0.01, min_value=0.05, max_value=0.20, format="%.2f")
    with c2:
        soil["PWP"] = st.number_input("θPWP",        value=soil["PWP"], step=0.01, min_value=0.02, max_value=0.40, format="%.2f")
        crop["p"]   = st.number_input("p (depleção)", value=crop["p"],  step=0.01, min_value=0.10, max_value=0.80, format="%.2f")
        crop["few"] = st.number_input("few",          value=crop["few"], step=0.01, min_value=0.05, max_value=1.00, format="%.2f")

    TAW_s, RAW_s, TEW_s = calc_soil_params(soil["FC"], soil["PWP"], crop["Zr"], crop["Ze"], crop["p"], soil["REW"])
    st.info(f"TAW: **{TAW_s:.0f} mm** | RAW: **{RAW_s:.0f} mm** | TEW: **{TEW_s:.0f} mm**")

    st.subheader("🔄 Pivô Central")
    pivot_area      = st.number_input("Área (ha)",                    value=100.0, step=1.0,  min_value=1.0)
    pivot_flow      = st.number_input("Vazão (m³/h)",                 value=300.0, step=10.0, min_value=1.0)
    pivot_eff_pct   = st.number_input("Eficiência (%)",               value=85.0,  step=1.0,  min_value=50.0, max_value=100.0)
    pivot_ref_depth = st.number_input("Lâmina ref. 100% timer (mm)", value=10.0,  step=0.5,  min_value=0.5)
    pivot_ref_time  = st.number_input("Tempo de 1 volta a 100% (h)", value=24.0,  step=1.0,  min_value=1.0)

    pivot_eff = pivot_eff_pct / 100.0

    params = {
        **crop, **soil,
        "pivot_eff": pivot_eff,
        "pivot_ref_depth": pivot_ref_depth,
        "pivot_ref_time": pivot_ref_time,
        "height": crop["height"],
    }

# ─────────────────────────────────────────────────────────────
# TÍTULO
# ─────────────────────────────────────────────────────────────
st.title(f"💧 Manejo de Irrigação — Pivô Central | {crop_name}")
st.caption("Balanço Hídrico · Kc Dual (FAO-56) · Turno de Rega")

tab1, tab2, tab3, tab4, tab5 = st.tabs(
    ["⚙️ Parâmetros", "🌤️ Clima / ETo", "💧 Balanço Hídrico", "📅 Turno de Rega", "📊 Relatório"]
)

# ─────────────────────────────────────────────────────────────
# ABA 1 — PARÂMETROS
# ─────────────────────────────────────────────────────────────
with tab1:
    c1, c2, c3 = st.columns(3)

    with c1:
        st.subheader("🌱 Cultura")
        st.dataframe(
            pd.DataFrame({
                "Parâmetro": ["Cultura", "Ciclo (dias)", "Kcb ini", "Kcb mid", "Kcb end",
                              "L ini", "L dev", "L mid", "L late", "Altura (m)", "p", "Zr (m)"],
                "Valor": [crop_name, total_days, crop["kcb_ini"], crop["kcb_mid"], crop["kcb_end"],
                          crop["l_ini"], crop["l_dev"], crop["l_mid"], crop["l_late"],
                          crop["height"], crop["p"], crop["Zr"]],
            }),
            hide_index=True, use_container_width=True,
        )

    with c2:
        st.subheader("🪱 Solo")
        st.dataframe(
            pd.DataFrame({
                "Parâmetro": ["Solo", "θFC", "θPWP", "REW (mm)", "Ze (m)", "few",
                              "TAW (mm)", "RAW (mm)", "TEW (mm)"],
                "Valor": [soil_name, soil["FC"], soil["PWP"], soil["REW"], crop["Ze"], crop["few"],
                          round(TAW_s, 1), round(RAW_s, 1), round(TEW_s, 1)],
            }),
            hide_index=True, use_container_width=True,
        )

    with c3:
        st.subheader("🔄 Pivô")
        st.dataframe(
            pd.DataFrame({
                "Parâmetro": ["Área (ha)", "Vazão (m³/h)", "Eficiência", "Lâm. ref. (mm)", "Tempo volta (h)"],
                "Valor": [pivot_area, pivot_flow, f"{pivot_eff_pct:.0f}%", pivot_ref_depth, pivot_ref_time],
            }),
            hide_index=True, use_container_width=True,
        )

    st.divider()
    st.subheader("Curva Kcb ao longo do ciclo")
    days_range = list(range(1, total_days + 1))
    kcb_curve = [
        get_kcb(d, crop["l_ini"], crop["l_dev"], crop["l_mid"], crop["l_late"],
                crop["kcb_ini"], crop["kcb_mid"], crop["kcb_end"])[1]
        for d in days_range
    ]
    stages_band = [
        get_kcb(d, crop["l_ini"], crop["l_dev"], crop["l_mid"], crop["l_late"],
                crop["kcb_ini"], crop["kcb_mid"], crop["kcb_end"])[0]
        for d in days_range
    ]

    fig_kcb = go.Figure()
    fig_kcb.add_trace(go.Scatter(
        x=days_range, y=kcb_curve, mode="lines", name="Kcb",
        line=dict(color="#1a6b3c", width=3),
        fill="tozeroy", fillcolor="rgba(26,107,60,0.08)",
    ))
    for stage, color in STAGE_COLORS.items():
        mask = [i for i, s in enumerate(stages_band) if s == stage]
        if mask:
            fig_kcb.add_vrect(
                x0=days_range[mask[0]], x1=days_range[mask[-1]],
                fillcolor=color, opacity=0.06, line_width=0,
                annotation_text=stage, annotation_position="top left",
                annotation_font_size=11, annotation_font_color=color,
            )
    fig_kcb.update_layout(
        xaxis_title="Dias após plantio", yaxis_title="Kcb",
        height=300, margin=dict(t=30, b=30),
        hovermode="x unified",
    )
    st.plotly_chart(fig_kcb, use_container_width=True)

# ─────────────────────────────────────────────────────────────
# ABA 2 — CLIMA / ETo
# ─────────────────────────────────────────────────────────────
with tab2:
    st.subheader("Dados Climáticos Diários")

    c1, c2, c3 = st.columns([2, 1, 1])
    with c1:
        if st.button("🔄 Gerar Dados Típicos", use_container_width=True):
            st.session_state["climate_df"] = generate_typical_climate(total_days, plant_date)
    with c2:
        uploaded = st.file_uploader("Importar CSV", type=["csv"], label_visibility="collapsed")
        if uploaded:
            st.session_state["climate_df"] = pd.read_csv(uploaded)
    with c3:
        st.write("")

    if "climate_df" not in st.session_state or len(st.session_state["climate_df"]) != total_days:
        st.session_state["climate_df"] = generate_typical_climate(total_days, plant_date)

    st.info(
        "**ETo:** Evapotranspiração de referência (Penman-Monteith FAO-56). "
        "Preencha com dados da estação meteorológica local ou use os dados típicos gerados."
    )

    edited_df = st.data_editor(
        st.session_state["climate_df"],
        use_container_width=True,
        hide_index=True,
        num_rows="fixed",
        column_config={
            "Data":       st.column_config.TextColumn("Data", disabled=True),
            "ETo (mm)":   st.column_config.NumberColumn("ETo (mm)",    min_value=0.0, max_value=15.0,  step=0.1, format="%.1f"),
            "Precip (mm)":st.column_config.NumberColumn("Precip (mm)", min_value=0.0, max_value=300.0, step=0.1, format="%.1f"),
            "Tmax (°C)":  st.column_config.NumberColumn("Tmax (°C)",   min_value=-10, max_value=50,    step=0.1, format="%.1f"),
            "Tmin (°C)":  st.column_config.NumberColumn("Tmin (°C)",   min_value=-10, max_value=40,    step=0.1, format="%.1f"),
            "u2 (m/s)":   st.column_config.NumberColumn("u2 (m/s)",    min_value=0.0, max_value=20.0,  step=0.1, format="%.1f"),
            "RHmin (%)":  st.column_config.NumberColumn("RHmin (%)",   min_value=0,   max_value=100,   step=1),
        },
    )
    st.session_state["climate_df"] = edited_df

    c1, c2 = st.columns(2)
    with c1:
        st.download_button(
            "📥 Exportar CSV", to_csv(edited_df), "clima_irrigacao.csv", "text/csv",
            use_container_width=True,
        )
    with c2:
        if st.button("▶️ Calcular Balanço Hídrico", type="primary", use_container_width=True):
            result, TAW_r, RAW_r = calc_water_balance(edited_df, params)
            st.session_state["balance_df"] = result
            st.session_state["TAW"] = TAW_r
            st.session_state["RAW"] = RAW_r
            st.success("✅ Cálculo concluído! Veja as abas **Balanço Hídrico** e **Turno de Rega**.")

# ─────────────────────────────────────────────────────────────
# ABA 3 — BALANÇO HÍDRICO
# ─────────────────────────────────────────────────────────────
with tab3:
    if "balance_df" not in st.session_state:
        st.info("⬅️ Vá até **Clima / ETo** e clique em **▶️ Calcular Balanço Hídrico**.")
    else:
        df = st.session_state["balance_df"]
        TAW = st.session_state["TAW"]
        RAW = st.session_state["RAW"]

        total_etc    = df["ETc (mm)"].sum()
        total_i_liq  = df["Irrig Líq (mm)"].sum()
        total_i_bruta= df["Irrig Bruta (mm)"].sum()
        total_precip = df["Precip (mm)"].sum()
        n_irrig      = int(df["Irrigou"].sum())
        n_stress     = int((df["Ks"] < 0.95).sum())

        c1, c2, c3, c4, c5, c6 = st.columns(6)
        c1.metric("ETc Total (mm)",       f"{total_etc:.0f}")
        c2.metric("Irrig. Líq. (mm)",     f"{total_i_liq:.0f}")
        c3.metric("Irrig. Bruta (mm)",    f"{total_i_bruta:.0f}")
        c4.metric("Precipitação (mm)",    f"{total_precip:.0f}")
        c5.metric("Nº de Irrigações",     f"{n_irrig}")
        c6.metric("Dias c/ Estresse",     f"{n_stress}", delta_color="inverse")

        st.divider()

        fig = make_subplots(
            rows=2, cols=1, shared_xaxes=True,
            subplot_titles=["Depleção da Zona Radicular Dr (mm)", "ETc / Precip / Irrigação (mm)"],
            vertical_spacing=0.12, row_heights=[0.55, 0.45],
        )

        fig.add_trace(go.Scatter(
            x=df["Dia"], y=df["Dr (mm)"], name="Dr (depleção)",
            fill="tozeroy", line=dict(color="#e05c5c", width=2),
            fillcolor="rgba(224,92,92,0.12)",
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df["Dia"], y=[RAW] * len(df), name=f"RAW ({RAW:.0f} mm)",
            line=dict(color="#f0a500", dash="dash", width=2), mode="lines",
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df["Dia"], y=[TAW] * len(df), name=f"TAW ({TAW:.0f} mm)",
            line=dict(color="#e05c5c", dash="dot", width=1.5), mode="lines",
        ), row=1, col=1)

        irrig_rows = df[df["Irrigou"]]
        fig.add_trace(go.Scatter(
            x=irrig_rows["Dia"], y=irrig_rows["Dr (mm)"],
            mode="markers", name="Irrigação acionada",
            marker=dict(color="#1e40af", size=9, symbol="triangle-down"),
        ), row=1, col=1)

        fig.add_trace(go.Bar(x=df["Dia"], y=df["ETc (mm)"],       name="ETc (mm)",    marker_color="rgba(26,107,60,0.7)"),  row=2, col=1)
        fig.add_trace(go.Bar(x=df["Dia"], y=df["Precip (mm)"],    name="Precip (mm)", marker_color="rgba(74,144,217,0.7)"), row=2, col=1)
        fig.add_trace(go.Bar(x=df["Dia"], y=df["Irrig Líq (mm)"], name="Irrig (mm)",  marker_color="rgba(100,200,255,0.9)"),row=2, col=1)

        fig.update_layout(
            height=580, hovermode="x unified", barmode="overlay",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
        )
        fig.update_xaxes(title_text="Dias após plantio", row=2, col=1)
        st.plotly_chart(fig, use_container_width=True)

        st.subheader("Balanço Hídrico Diário")

        display_cols = [
            "Dia", "Data", "Estádio", "Kcb", "Ke", "Ks",
            "ETo (mm)", "ETc (mm)", "Precip (mm)",
            "Irrig Líq (mm)", "Dr (mm)", "Dr/TAW (%)",
        ]

        def highlight_rows(row):
            if row["Irrigou"]:
                return ["background-color: #dbeafe; color: #1e3a5f"] * len(row)
            if row["Ks"] < 0.95:
                return ["background-color: #fee2e2; color: #7f1d1d"] * len(row)
            return [""] * len(row)

        styled = df[display_cols + ["Irrigou"]].style.apply(highlight_rows, axis=1)
        st.dataframe(styled, use_container_width=True, hide_index=True, height=380)

        st.download_button(
            "📥 Exportar Balanço CSV", to_csv(df[display_cols]),
            "balanco_hidrico.csv", "text/csv",
        )

# ─────────────────────────────────────────────────────────────
# ABA 4 — TURNO DE REGA
# ─────────────────────────────────────────────────────────────
with tab4:
    if "balance_df" not in st.session_state:
        st.info("⬅️ Calcule o Balanço Hídrico primeiro.")
    else:
        df = st.session_state["balance_df"]

        schedule = []
        irrig_idx = df[df["Irrigou"]].index.tolist()

        for n, idx in enumerate(irrig_idx):
            row      = df.loc[idx]
            I_liq    = float(row["Irrig Líq (mm)"])
            I_bruta  = float(row["Irrig Bruta (mm)"])
            Dr_antes = round(float(row["Dr (mm)"]) + I_liq, 1)

            timer_pct = min(100.0, pivot_ref_depth / I_bruta * 100) if I_bruta > 0 else 100.0
            turn_time = pivot_ref_time * (I_bruta / pivot_ref_depth) if pivot_ref_depth > 0 else 0.0

            next_in: object = "—"
            if n + 1 < len(irrig_idx):
                next_in = int(df.loc[irrig_idx[n + 1], "Dia"]) - int(row["Dia"])

            schedule.append({
                "#":                     n + 1,
                "Data":                  row["Data"],
                "Dia":                   int(row["Dia"]),
                "Estádio":               row["Estádio"],
                "Dr antes (mm)":         Dr_antes,
                "Lâm. Líq (mm)":         round(I_liq, 1),
                "Lâm. Bruta (mm)":       round(I_bruta, 1),
                "Timer (%)":             f"{timer_pct:.0f}%",
                "Tempo de Volta (h)":    f"{turn_time:.1f}",
                "Próx. Irrig. (dias)":   next_in,
            })

        sched_df = pd.DataFrame(schedule)

        c1, c2, c3 = st.columns(3)
        if len(sched_df) > 0:
            lam_media = sched_df["Lâm. Bruta (mm)"].mean()
            intervalo = total_days / len(sched_df)
            c1.metric("Nº de Irrigações",       len(sched_df))
            c2.metric("Lâm. Bruta Média (mm)",  f"{lam_media:.1f}")
            c3.metric("Intervalo Médio (dias)",  f"{intervalo:.0f}")

        st.divider()
        st.subheader("📅 Programa de Irrigação — Pivô Central")

        if len(sched_df) > 0:
            st.dataframe(sched_df, use_container_width=True, hide_index=True)
            st.download_button(
                "📥 Exportar Turno de Rega CSV",
                to_csv(sched_df), "turno_rega.csv", "text/csv",
            )
        else:
            st.success("Nenhuma irrigação necessária no período simulado.")

        st.info(
            f"**Referência do Pivô:**  \n"
            f"- Lâmina a 100% timer: **{pivot_ref_depth} mm** por volta completa  \n"
            f"- Tempo de 1 volta a 100%: **{pivot_ref_time} h**  \n"
            f"- Eficiência de aplicação: **{pivot_eff_pct:.0f}%**  \n\n"
            f"> 🔄 Timer% menor → pivô mais lento → mais água por volta  \n"
            f"> Timer% = (Lâm. ref / Lâm. bruta) × 100%"
        )

# ─────────────────────────────────────────────────────────────
# ABA 5 — RELATÓRIO
# ─────────────────────────────────────────────────────────────
with tab5:
    if "balance_df" not in st.session_state:
        st.info("⬅️ Calcule o Balanço Hídrico primeiro.")
    else:
        df   = st.session_state["balance_df"]
        TAW  = st.session_state["TAW"]
        RAW  = st.session_state["RAW"]

        total_etc     = df["ETc (mm)"].sum()
        total_i_liq   = df["Irrig Líq (mm)"].sum()
        total_i_bruta = df["Irrig Bruta (mm)"].sum()
        total_precip  = df["Precip (mm)"].sum()
        n_irrig       = int(df["Irrigou"].sum())
        n_stress      = int((df["Ks"] < 0.95).sum())

        c1, c2 = st.columns(2)

        with c1:
            st.subheader("📋 Resumo da Safra")
            lam_media  = f"{(total_i_liq  / n_irrig):.1f} mm" if n_irrig > 0 else "—"
            intervalo  = f"{(total_days   / n_irrig):.0f} dias" if n_irrig > 0 else "—"
            summary_df = pd.DataFrame({
                "Parâmetro": [
                    "Cultura", "Solo", "Ciclo",
                    "TAW", "RAW",
                    "ETc Total", "Precipitação Total",
                    "Irrigação Líq. Total", "Irrigação Bruta Total",
                    "Nº de Irrigações", "Dias c/ Estresse Hídrico",
                    "Lâmina Média por Irrigação", "Intervalo Médio",
                ],
                "Valor": [
                    crop_name, soil_name, f"{total_days} dias",
                    f"{TAW:.0f} mm", f"{RAW:.0f} mm",
                    f"{total_etc:.0f} mm", f"{total_precip:.0f} mm",
                    f"{total_i_liq:.0f} mm", f"{total_i_bruta:.0f} mm",
                    n_irrig, n_stress,
                    lam_media, intervalo,
                ],
            })
            st.dataframe(summary_df, hide_index=True, use_container_width=True)

        with c2:
            st.subheader("📅 Resumo Mensal")
            df_m = df.copy()
            df_m["_dt"] = pd.to_datetime(df_m["Data"], format="%d/%m/%Y", errors="coerce")
            df_m["Mês"] = df_m["_dt"].dt.to_period("M")
            monthly = (
                df_m.groupby("Mês")
                .agg(
                    ETc       =("ETc (mm)",        "sum"),
                    Precip    =("Precip (mm)",      "sum"),
                    Irrig_Liq =("Irrig Líq (mm)",   "sum"),
                    Irrig_Bruta=("Irrig Bruta (mm)","sum"),
                    Irrigacoes=("Irrigou",          "sum"),
                )
                .reset_index()
            )
            monthly.columns = ["Mês", "ETc (mm)", "Precip (mm)", "Irrig Líq (mm)", "Irrig Bruta (mm)", "Nº Irrig"]
            monthly["Mês"] = monthly["Mês"].astype(str)
            for col in ["ETc (mm)", "Precip (mm)", "Irrig Líq (mm)", "Irrig Bruta (mm)"]:
                monthly[col] = monthly[col].round(1)
            st.dataframe(monthly, hide_index=True, use_container_width=True)

        st.divider()
        st.subheader("💡 Recomendações e Eficiência")

        if n_stress == 0:
            st.success("✅ Nenhum dia com estresse hídrico detectado. O manejo está adequado.")
        else:
            st.warning(
                f"⚠️ **{n_stress} dia(s)** com estresse hídrico (Ks < 0.95). "
                "Considere antecipar as irrigações ou aumentar a lâmina aplicada."
            )

        frac_chuva  = (total_precip   / total_etc * 100) if total_etc > 0 else 0
        frac_irrig  = (total_i_liq    / total_etc * 100) if total_etc > 0 else 0
        perda_inef  = total_i_bruta - total_i_liq
        st.info(
            f"**Eficiência do uso da água:**\n"
            f"- Fração atendida pela chuva: **{frac_chuva:.0f}%**\n"
            f"- Fração atendida por irrigação: **{frac_irrig:.0f}%**\n"
            f"- Perda por ineficiência de aplicação: **{perda_inef:.0f} mm**"
        )

        st.divider()
        st.subheader("ETc por Estádio Fenológico")
        stage_etc = df.groupby("Estádio")["ETc (mm)"].sum().reset_index()
        stage_etc["ETc (mm)"] = stage_etc["ETc (mm)"].round(1)
        colors = [STAGE_COLORS.get(s, "#888") for s in stage_etc["Estádio"]]

        fig_pie = go.Figure(go.Pie(
            labels=stage_etc["Estádio"],
            values=stage_etc["ETc (mm)"],
            hole=0.42,
            marker_colors=colors,
            textinfo="label+percent",
        ))
        fig_pie.update_layout(height=350, margin=dict(t=20, b=20), showlegend=True)
        st.plotly_chart(fig_pie, use_container_width=True)
