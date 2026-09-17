/**
 * Presets de curva Kc no padrão FAO-56 (Allen et al., 1998 — Irrigation and
 * Drainage Paper 56, Tabelas 11 e 12), como as plataformas profissionais de
 * irrigação adotam.
 *
 * A curva clássica tem 4 estádios: inicial e média com Kc constante (patamar),
 * desenvolvimento e senescência com Kc linear (rampa). Convertendo para pontos
 * âncora no eixo DAE, o formato "patamar → rampa → patamar → rampa" nasce de 5
 * pontos, e a interpolação linear por trechos do motor reproduz exatamente o
 * comportamento FAO-56.
 *
 * Valores são ponto de partida rastreável (fonte FAO-56) — o agrônomo revisa,
 * ajusta à realidade local e aprova antes de ativar para cálculo.
 */

export interface Fao56Preset {
  key: string;
  crop: string;
  /** Kc dos três estádios de referência. */
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  /** Durações dos estádios em dias (inicial, desenvolvimento, média, final). */
  lIni: number;
  lDev: number;
  lMid: number;
  lLate: number;
  /** Profundidade radicular máxima (m) e fração de depleção p — referência. */
  rootMaxM: number;
  depletionP: number;
  notes: string;
}

// Faixas típicas FAO-56; adotamos valores centrais representativos para clima
// quente/seco (Cerrado). Kc_end para colheita com solo seco.
export const FAO56_CROP_PRESETS: Fao56Preset[] = [
  {
    key: "soja", crop: "Soja",
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.50,
    lIni: 20, lDev: 30, lMid: 60, lLate: 25,
    rootMaxM: 1.0, depletionP: 0.50,
    notes: "FAO-56 Tab. 12 — soja (soybean). Kc_end 0,50 para colheita com folha verde; 0,30 se secar em campo.",
  },
  {
    key: "milho", crop: "Milho (grão)",
    kcIni: 0.30, kcMid: 1.20, kcEnd: 0.60,
    lIni: 30, lDev: 40, lMid: 50, lLate: 30,
    rootMaxM: 1.3, depletionP: 0.55,
    notes: "FAO-56 Tab. 12 — milho grão (maize, field). Kc_end 0,35 quando colhido seco.",
  },
  {
    key: "algodao", crop: "Algodão",
    kcIni: 0.35, kcMid: 1.18, kcEnd: 0.60,
    lIni: 30, lDev: 50, lMid: 60, lLate: 55,
    rootMaxM: 1.4, depletionP: 0.65,
    notes: "FAO-56 Tab. 12 — algodão (cotton). Kc_mid 1,15–1,20; Kc_end 0,70–0,50 conforme manejo de desfolha.",
  },
  {
    key: "feijao", crop: "Feijão",
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.35,
    lIni: 20, lDev: 30, lMid: 40, lLate: 20,
    rootMaxM: 0.7, depletionP: 0.45,
    notes: "FAO-56 Tab. 12 — feijão seco (dry bean). Ciclo curto; ajustar às cultivares locais.",
  },
  {
    key: "tabaco", crop: "Tabaco",
    kcIni: 0.35, kcMid: 1.15, kcEnd: 0.80,
    lIni: 20, lDev: 30, lMid: 30, lLate: 30,
    rootMaxM: 0.8, depletionP: 0.35,
    notes: "FAO-56 Tab. 12 — tabaco (tobacco). Kc_end alto porque a colheita ocorre com folha ainda ativa.",
  },
];

export interface GeneratedAnchor {
  sequence_no: number;
  x_value: number;
  kc_value: number;
  stage: string;
}

/**
 * Gera os 5 pontos âncora (eixo DAE) que reproduzem a curva FAO-56 por trechos.
 * Patamares: inicial (0 → Lini) e média (após Ldev até Lmid). Rampas:
 * desenvolvimento (Lini → +Ldev) e senescência (Lmid → +Llate).
 */
export function buildFao56Anchors(p: {
  kcIni: number; kcMid: number; kcEnd: number;
  lIni: number; lDev: number; lMid: number; lLate: number;
}): GeneratedAnchor[] {
  const dIni = Math.max(0, Math.round(p.lIni));
  const dDev = Math.max(0, Math.round(p.lDev));
  const dMid = Math.max(0, Math.round(p.lMid));
  const dLate = Math.max(0, Math.round(p.lLate));
  const xIniEnd = dIni;
  const xDevEnd = dIni + dDev;
  const xMidEnd = dIni + dDev + dMid;
  const xLateEnd = dIni + dDev + dMid + dLate;
  const kc = (v: number) => Math.round(v * 1000) / 1000;
  return [
    { sequence_no: 1, x_value: 0, kc_value: kc(p.kcIni), stage: "Inicial" },
    { sequence_no: 2, x_value: xIniEnd, kc_value: kc(p.kcIni), stage: "Fim do inicial" },
    { sequence_no: 3, x_value: xDevEnd, kc_value: kc(p.kcMid), stage: "Fim do desenvolvimento" },
    { sequence_no: 4, x_value: xMidEnd, kc_value: kc(p.kcMid), stage: "Fim da fase média" },
    { sequence_no: 5, x_value: xLateEnd, kc_value: kc(p.kcEnd), stage: "Fim do ciclo" },
  ];
}
