"""
Gerador de relatório PDF – Manejo de Irrigação
Dependências: reportlab, matplotlib, pandas
"""
from __future__ import annotations

import io
from datetime import date

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, Image, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.flowables import KeepTogether

# ─── Paleta ───────────────────────────────────────────────────────────────────
C_VERDE   = colors.HexColor("#27AE60")
C_AZUL    = colors.HexColor("#2980B9")
C_LARANJA = colors.HexColor("#E67E22")
C_DARK    = colors.HexColor("#2C3E50")
C_GRAY    = colors.HexColor("#7F8C8D")
C_LIGHT   = colors.HexColor("#ECF0F1")
C_WHITE   = colors.white
C_STRIPE  = colors.HexColor("#F8F9FA")

W, H = A4  # 210 x 297 mm

# ─── Estilos ──────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def _style(**kw):
    base = ParagraphStyle("_", **kw)
    return base

TITLE_S    = _style(fontSize=18, textColor=C_VERDE, alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=2)
SUBTITLE_S = _style(fontSize=9,  textColor=C_GRAY,  alignment=TA_CENTER, fontName="Helvetica",      spaceAfter=8)
SECTION_S  = _style(fontSize=11, textColor=C_WHITE, fontName="Helvetica-Bold", leftIndent=4, leading=16)
BODY_S     = _style(fontSize=8,  textColor=C_DARK,  fontName="Helvetica", leading=12)
LABEL_S    = _style(fontSize=7,  textColor=C_GRAY,  fontName="Helvetica")
OBS_S      = _style(fontSize=8,  textColor=C_GRAY,  fontName="Helvetica", leading=12, leftIndent=4)

# ─── Helpers matplotlib ───────────────────────────────────────────────────────

def _fig_to_img(fig, w_mm: float = 170) -> Image:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    # reportlab Image: w em pontos (1 mm = 2.8346 pt)
    w_pt = w_mm * mm
    img = Image(buf, width=w_pt)
    img._restrictSize(w_pt, 999 * mm)
    return img


def chart_balanco(df: pd.DataFrame) -> Image:
    fig, ax = plt.subplots(figsize=(10, 3.4))
    x = np.arange(len(df))
    w = 0.3
    ax.bar(x - w/2, df["precipitacao_mm"], width=w, color="#4A90D9", label="Precipitação (mm)", alpha=0.85)
    ax.bar(x + w/2, df["irrigacao_mm"],    width=w, color="#27AE60", label="Irrigação (mm)",    alpha=0.85)
    ax2 = ax.twinx()
    ax2.plot(x, df["etc_mm"], color="#E67E22", lw=2, marker="o", ms=3, label="ETc (mm)")
    ax2.set_ylabel("ETc (mm)", color="#E67E22", fontsize=8)
    ax2.tick_params(axis="y", labelcolor="#E67E22", labelsize=7)
    labels = [d.strftime("%d/%m") if i % 5 == 0 else "" for i, d in enumerate(df["data"])]
    ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=7)
    ax.set_ylabel("mm", fontsize=8); ax.tick_params(labelsize=7)
    ax.set_title("Balanço Hídrico Diário", fontsize=10, fontweight="bold", pad=6)
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1+h2, l1+l2, fontsize=7, loc="upper right"); ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _fig_to_img(fig, 170)


def chart_umidade(df: pd.DataFrame, cc: float, pmp: float, afd: float) -> Image:
    trigger = cc - afd / 10
    fig, ax = plt.subplots(figsize=(10, 2.8))
    ax.plot(df["data"], df["umidade_solo_pct"], color="#8E44AD", lw=2, label="Umidade (%)")
    ax.axhline(cc,      color="#27AE60", ls="--", lw=1.2, label=f"CC ({cc}%)")
    ax.axhline(trigger, color="#E67E22", ls="--", lw=1.2, label=f"Gatilho ({trigger:.1f}%)")
    ax.axhline(pmp,     color="#E74C3C", ls="--", lw=1.2, label=f"PMP ({pmp}%)")
    ax.fill_between(df["data"], pmp, trigger, alpha=0.07, color="#E74C3C")
    ax.fill_between(df["data"], trigger, cc,  alpha=0.07, color="#27AE60")
    ticks = df["data"].iloc[::5]
    ax.set_xticks(ticks); ax.set_xticklabels([d.strftime("%d/%m") for d in ticks], fontsize=7)
    ax.set_ylabel("%", fontsize=8); ax.tick_params(labelsize=7)
    ax.set_title("Evolução da Umidade do Solo", fontsize=10, fontweight="bold", pad=6)
    ax.legend(fontsize=7, loc="lower right"); ax.grid(alpha=0.3)
    fig.tight_layout()
    return _fig_to_img(fig, 170)


def chart_fases(df: pd.DataFrame) -> Image:
    df_f = df.groupby("fase", sort=False).agg(
        etc=("etc_mm","sum"), irr=("irrigacao_mm","sum"), chu=("precipitacao_mm","sum")
    ).reset_index()
    x = np.arange(len(df_f)); w = 0.25
    fig, ax = plt.subplots(figsize=(8, 3))
    ax.bar(x-w, df_f["etc"], width=w, color="#E67E22", label="ETc (mm)",         alpha=0.85)
    ax.bar(x,   df_f["irr"], width=w, color="#27AE60", label="Irrigação (mm)",    alpha=0.85)
    ax.bar(x+w, df_f["chu"], width=w, color="#4A90D9", label="Precipitação (mm)", alpha=0.85)
    ax.set_xticks(x); ax.set_xticklabels(df_f["fase"], fontsize=8)
    ax.set_ylabel("mm", fontsize=8); ax.tick_params(labelsize=7)
    ax.set_title("Resumo por Fase Fenológica", fontsize=10, fontweight="bold", pad=6)
    ax.legend(fontsize=7); ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _fig_to_img(fig, 170)

# ─── Layout helpers ───────────────────────────────────────────────────────────

def _section_header(text: str):
    tbl = Table([[Paragraph(text, SECTION_S)]], colWidths=[170*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_DARK),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("LINEBELOW",     (0,0), (-1,-1), 2, C_VERDE),
    ]))
    return tbl


def _kpi_table(kpis: list[tuple]) -> Table:
    """kpis = [(label, valor, sub, cor_hex), ...]"""
    n = len(kpis)
    cw = [170*mm / n] * n

    def cell(label, valor, sub, cor):
        return Table([
            [Paragraph(label, _style(fontSize=7,  textColor=C_GRAY,  fontName="Helvetica", alignment=TA_CENTER))],
            [Paragraph(valor, _style(fontSize=14, textColor=C_DARK,  fontName="Helvetica-Bold", alignment=TA_CENTER))],
            [Paragraph(sub,   _style(fontSize=7,  textColor=colors.HexColor(cor), fontName="Helvetica", alignment=TA_CENTER))],
        ], colWidths=[(170*mm/n) - 4])

    cells = [cell(l, v, s, c) for l, v, s, c in kpis]
    tbl = Table([cells], colWidths=cw)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_LIGHT),
        ("BOX",           (0,0), (-1,-1), 0.5, C_GRAY),
        ("INNERGRID",     (0,0), (-1,-1), 0.5, C_GRAY),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 4),
        ("RIGHTPADDING",  (0,0), (-1,-1), 4),
        ("LINEABOVE",     (0,0), (0,-1),  3, C_VERDE),
        ("LINEABOVE",     (1,0), (1,-1),  3, C_LARANJA),
        ("LINEABOVE",     (2,0), (2,-1),  3, C_AZUL),
        ("LINEABOVE",     (3,0), (3,-1),  3, C_GRAY),
    ]))
    return tbl


def _info_table(pairs: list[tuple]) -> Table:
    rows = [[
        Paragraph(f"<b>{k}:</b>", BODY_S),
        Paragraph(v, _style(fontSize=8, textColor=C_GRAY, fontName="Helvetica")),
    ] for k, v in pairs]
    tbl = Table(rows, colWidths=[60*mm, 110*mm])
    tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0,0), (-1,-1), 2),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
        ("LEFTPADDING",   (0,0), (-1,-1), 2),
    ]))
    return tbl


def _agenda_table(df: pd.DataFrame) -> Table:
    headers = ["Data", "Fase", "Lâm. Líquida\n(mm)", "Lâm. Bruta\n(mm)", "Volume\n(m³)", "Tempo\n(h)"]
    col_w = [25*mm, 55*mm, 28*mm, 28*mm, 22*mm, 18*mm]
    hdr_style = _style(fontSize=8, textColor=C_WHITE, fontName="Helvetica-Bold", alignment=TA_CENTER)
    cell_style = _style(fontSize=8, textColor=C_DARK, fontName="Helvetica", alignment=TA_CENTER)

    data = [[Paragraph(h, hdr_style) for h in headers]]
    for _, r in df.iterrows():
        data.append([
            Paragraph(r["Data Prevista"].strftime("%d/%m/%Y"), cell_style),
            Paragraph(r["Fase"], _style(fontSize=7, textColor=C_DARK, fontName="Helvetica", alignment=TA_LEFT)),
            Paragraph(f"{r['Lâmina Líquida (mm)']:.1f}", cell_style),
            Paragraph(f"{r['Lâmina Bruta (mm)']:.1f}",  cell_style),
            Paragraph(f"{r['Volume (m³)']:.0f}",         cell_style),
            Paragraph(f"{r['Tempo (h)']:.1f}",           cell_style),
        ])

    tbl = Table(data, colWidths=col_w, repeatRows=1)
    stripe = [
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [C_WHITE, C_STRIPE]),
        ("BACKGROUND",    (0,0), (-1,0),  C_DARK),
        ("GRID",          (0,0), (-1,-1), 0.4, C_GRAY),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 3),
        ("RIGHTPADDING",  (0,0), (-1,-1), 3),
    ]
    tbl.setStyle(TableStyle(stripe))
    return tbl


def _fases_table(df: pd.DataFrame) -> Table:
    df_f = df.groupby("fase", sort=False).agg(
        dias=("data","count"), kc=("kc","first"),
        etc=("etc_mm","sum"), irr=("irrigacao_mm","sum"), chu=("precipitacao_mm","sum"),
    ).reset_index()

    headers = ["Fase", "Dias", "Kc", "ETc (mm)", "Irrigação (mm)", "Precipitação (mm)"]
    col_w   = [55*mm, 14*mm, 14*mm, 28*mm, 32*mm, 32*mm]
    hdr_s   = _style(fontSize=8, textColor=C_WHITE, fontName="Helvetica-Bold", alignment=TA_CENTER)
    cs      = _style(fontSize=8, textColor=C_DARK,  fontName="Helvetica",      alignment=TA_CENTER)
    cs_l    = _style(fontSize=7.5, textColor=C_DARK, fontName="Helvetica",     alignment=TA_LEFT)

    data = [[Paragraph(h, hdr_s) for h in headers]]
    for _, r in df_f.iterrows():
        data.append([
            Paragraph(r["fase"], cs_l),
            Paragraph(str(int(r["dias"])), cs),
            Paragraph(f"{r['kc']:.2f}", cs),
            Paragraph(f"{r['etc']:.1f}", cs),
            Paragraph(f"{r['irr']:.1f}", cs),
            Paragraph(f"{r['chu']:.1f}", cs),
        ])

    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [C_WHITE, C_STRIPE]),
        ("BACKGROUND",    (0,0), (-1,0),  C_DARK),
        ("GRID",          (0,0), (-1,-1), 0.4, C_GRAY),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 3),
    ]))
    return tbl

# ─── Header / footer da página ────────────────────────────────────────────────

def _page_header_footer(canvas, doc):
    canvas.saveState()
    # topo
    canvas.setFillColor(C_DARK)
    canvas.rect(0, H - 14*mm, W, 14*mm, fill=1, stroke=0)
    canvas.setFillColor(C_WHITE)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawCentredString(W/2, H - 8*mm, "Relatório de Manejo de Irrigação — Soja")
    # barra verde sob o header
    canvas.setFillColor(C_VERDE)
    canvas.rect(0, H - 16*mm, W, 2*mm, fill=1, stroke=0)
    # rodapé
    canvas.setFillColor(C_GRAY)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(15*mm, 8*mm, "Metodologia FAO-56 (Allen et al., 1998)  |  Dados simulados para fins demonstrativos")
    canvas.drawRightString(W - 15*mm, 8*mm, f"Pág. {doc.page}")
    canvas.restoreState()

# ─── Função principal ─────────────────────────────────────────────────────────

def gerar_pdf(
    df_balanco: pd.DataFrame,
    df_agenda: pd.DataFrame,
    solo: dict,
    resumo: dict,
) -> bytes:
    buf = io.BytesIO()

    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=20*mm, bottomMargin=18*mm,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin,
                  doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame],
                                       onPage=_page_header_footer)])

    story = []

    # ── Cabeçalho do relatório ────────────────────────────────────────────────
    story.append(Paragraph("Manejo de Irrigação — Soja", TITLE_S))
    story.append(Paragraph(f"Gerado em: {date.today().strftime('%d/%m/%Y')}", SUBTITLE_S))
    story.append(HRFlowable(width="100%", thickness=1, color=C_VERDE, spaceAfter=6))

    # ── Informações da propriedade ────────────────────────────────────────────
    story.append(_section_header("Informações da Propriedade"))
    story.append(Spacer(1, 3*mm))
    story.append(_info_table([
        ("Propriedade",     "Fazenda Demo"),
        ("Responsável",     "Mateus"),
        ("Cultura",         "Soja"),
        ("Área irrigada",   f"{solo['area_ha']} ha"),
        ("Sistema",         solo["sistema"]),
        ("Eficiência",      f"{solo['eficiencia_pct']}%  |  Vazão: {solo['vazao_m3h']} m³/h"),
        ("Período",
         f"{df_balanco['data'].iloc[0].strftime('%d/%m/%Y')} a "
         f"{df_balanco['data'].iloc[-1].strftime('%d/%m/%Y')}"),
    ]))
    story.append(Spacer(1, 5*mm))

    # ── KPIs ──────────────────────────────────────────────────────────────────
    story.append(_section_header("Indicadores da Safra"))
    story.append(Spacer(1, 3*mm))
    story.append(_kpi_table([
        ("Total Irrigado",     f"{resumo['total_irrigado_mm']} mm",
         f"{resumo['total_irrigado_m3']:.0f} m³",  "#27AE60"),
        ("ETc Acumulada",      f"{resumo['etc_total_mm']} mm",
         f"{df_balanco['etc_mm'].mean():.1f} mm/dia (média)", "#E67E22"),
        ("Déficit / Superávit", f"{resumo['deficit_superavit_mm']:+.1f} mm",
         "saldo hídrico",       "#2980B9"),
        ("Custo de Energia",   f"R$ {resumo['custo_energia_brl']:.2f}",
         f"{resumo['n_irrigacoes']} irrigações",   "#7F8C8D"),
    ]))
    story.append(Spacer(1, 5*mm))

    # ── Parâmetros do solo ────────────────────────────────────────────────────
    story.append(_section_header("Parâmetros do Solo e Sistema de Irrigação"))
    story.append(Spacer(1, 3*mm))
    story.append(_info_table([
        ("Textura do solo",         solo["textura"]),
        ("Capacidade de Campo (CC)", f"{solo['cc_pct']} %"),
        ("Ponto de Murcha (PMP)",   f"{solo['pmp_pct']} %"),
        ("Profund. efetiva raízes",  f"{solo['profundidade_cm']} cm"),
        ("Densidade aparente",       f"{solo['densidade_g_cm3']} g/cm³"),
        ("Água Disponível Total",    f"{solo['adt_mm']:.0f} mm"),
        ("Fração disp. (f)",         f"{solo['fad']}"),
        ("Água Fac. Disponível (AFD)", f"{solo['afd_mm']:.0f} mm"),
    ]))
    story.append(Spacer(1, 5*mm))

    # ── Balanço hídrico – gráfico ─────────────────────────────────────────────
    story.append(KeepTogether([
        _section_header("Balanço Hídrico Diário"),
        Spacer(1, 3*mm),
        chart_balanco(df_balanco),
    ]))
    story.append(Spacer(1, 5*mm))

    # ── Umidade do solo ───────────────────────────────────────────────────────
    story.append(KeepTogether([
        _section_header("Evolução da Umidade do Solo"),
        Spacer(1, 3*mm),
        chart_umidade(df_balanco, solo["cc_pct"], solo["pmp_pct"], solo["afd_mm"]),
    ]))
    story.append(Spacer(1, 5*mm))

    # ── Agenda de irrigação ───────────────────────────────────────────────────
    story.append(_section_header("Agenda de Irrigação"))
    story.append(Spacer(1, 3*mm))
    story.append(_agenda_table(df_agenda))
    total_vol = df_agenda["Volume (m³)"].sum()
    total_liq = df_agenda["Lâmina Líquida (mm)"].sum()
    story.append(Paragraph(
        f"<b>Total:</b> {total_liq:.1f} mm líquidos  |  {total_vol:.0f} m³  |  {len(df_agenda)} eventos de irrigação",
        _style(fontSize=8, textColor=C_DARK, fontName="Helvetica", spaceAfter=4)
    ))
    story.append(Spacer(1, 5*mm))

    # ── Resumo por fase ───────────────────────────────────────────────────────
    story.append(KeepTogether([
        _section_header("Resumo por Fase Fenológica"),
        Spacer(1, 3*mm),
        chart_fases(df_balanco),
        Spacer(1, 3*mm),
        _fases_table(df_balanco),
    ]))
    story.append(Spacer(1, 5*mm))

    # ── Observações ───────────────────────────────────────────────────────────
    story.append(_section_header("Observações"))
    story.append(Spacer(1, 3*mm))
    for obs in [
        "• Os valores de ETo foram estimados com base em curva senoidal representativa do verão brasileiro (jan/fev).",
        "• A recomendação de irrigação é baseada no critério de depleção da Água Facilmente Disponível (AFD = 50% da ADT).",
        "• A eficiência do sistema de gotejamento adotada é de 90%, conforme literatura técnica.",
        "• Substituir os dados de precipitação simulados por leituras reais do pluviômetro de campo.",
    ]:
        story.append(Paragraph(obs, OBS_S))
        story.append(Spacer(1, 1.5*mm))

    doc.build(story)
    buf.seek(0)
    return buf.read()
