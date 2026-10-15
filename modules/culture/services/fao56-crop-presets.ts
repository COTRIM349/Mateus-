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
  /** Classe operacional de ciclo (ex.: Precoce/Médio/Tardio). Vazia quando a
   *  cultura tem pouca variação de ciclo e um preset único basta. */
  cycleClass?: string;
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

// Faixas típicas FAO-56 (Tab. 11/12); valores centrais para clima quente/seco
// (Cerrado). O Kc por estádio é o mesmo dentro de uma cultura — o que muda com
// a classe de ciclo é a DURAÇÃO dos estádios. Por isso a soja tem três presets
// (precoce/médio/tardio) e milho/algodão/feijão/tabaco têm um preset padrão
// (pouca variação relevante de ciclo para o Kc).
export const FAO56_CROP_PRESETS: Fao56Preset[] = [
  {
    key: "soja-precoce", crop: "Soja", cycleClass: "Precoce",
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.50,
    lIni: 15, lDev: 25, lMid: 45, lLate: 25,
    rootMaxM: 0.9, depletionP: 0.50,
    notes: "FAO-56 Tab. 12 — soja, ciclo precoce (~110 dias). Kc_end 0,50 (folha verde); 0,30 se secar em campo.",
  },
  {
    key: "soja-medio", crop: "Soja", cycleClass: "Médio",
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.50,
    lIni: 20, lDev: 30, lMid: 50, lLate: 25,
    rootMaxM: 1.0, depletionP: 0.50,
    notes: "FAO-56 Tab. 12 — soja, ciclo médio (~125 dias). Kc_end 0,50 (folha verde); 0,30 se secar em campo.",
  },
  {
    key: "soja-tardio", crop: "Soja", cycleClass: "Tardio",
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.50,
    lIni: 20, lDev: 35, lMid: 60, lLate: 25,
    rootMaxM: 1.1, depletionP: 0.50,
    notes: "FAO-56 Tab. 12 — soja, ciclo tardio (~140 dias). Kc_end 0,50 (folha verde); 0,30 se secar em campo.",
  },
  {
    key: "milho", crop: "Milho (grão)",
    kcIni: 0.30, kcMid: 1.20, kcEnd: 0.60,
    lIni: 30, lDev: 40, lMid: 50, lLate: 30,
    rootMaxM: 1.3, depletionP: 0.55,
    notes: "FAO-56 Tab. 12 — milho grão (maize, field, ~150 dias). Kc_end 0,35 quando colhido seco.",
  },
  {
    key: "algodao", crop: "Algodão",
    kcIni: 0.35, kcMid: 1.18, kcEnd: 0.60,
    lIni: 30, lDev: 50, lMid: 60, lLate: 55,
    rootMaxM: 1.4, depletionP: 0.65,
    notes: "FAO-56 Tab. 12 — algodão (cotton, ~195 dias). Kc_mid 1,15–1,20; Kc_end 0,70–0,50 conforme desfolha.",
  },
  {
    key: "feijao", crop: "Feijão",
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.35,
    lIni: 20, lDev: 30, lMid: 40, lLate: 20,
    rootMaxM: 0.7, depletionP: 0.45,
    notes: "FAO-56 Tab. 12 — feijão seco (dry bean, ~110 dias). Ajustar às cultivares locais.",
  },
  {
    key: "tabaco", crop: "Tabaco",
    kcIni: 0.35, kcMid: 1.15, kcEnd: 0.80,
    lIni: 20, lDev: 30, lMid: 30, lLate: 30,
    rootMaxM: 0.8, depletionP: 0.35,
    notes: "FAO-56 Tab. 12 — tabaco (tobacco, ~110 dias). Kc_end alto: colheita com folha ainda ativa.",
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

export interface GeneratedRootAnchor {
  sequence_no: number;
  x_value: number;
  root_depth_m: number;
  stage: string;
}

/**
 * Curva de profundidade radicular no padrão FAO-56 (eixo DAE): a raiz cresce da
 * emergência até a profundidade máxima ao fim do desenvolvimento (início da fase
 * média) e permanece constante até o fim do ciclo. Interpolação linear por
 * trechos → rampa + patamar.
 */
export function buildFao56RootAnchors(
  p: { lIni: number; lDev: number; lMid: number; lLate: number; rootMaxM: number },
  zrIniM = 0.1,
): GeneratedRootAnchor[] {
  const devEnd = Math.max(1, Math.round(p.lIni + p.lDev));
  const cycleEnd = Math.max(devEnd + 1, Math.round(p.lIni + p.lDev + p.lMid + p.lLate));
  const z = (v: number) => Math.round(Math.max(0.05, v) * 1000) / 1000;
  return [
    { sequence_no: 1, x_value: 0, root_depth_m: z(zrIniM), stage: "Emergência" },
    { sequence_no: 2, x_value: devEnd, root_depth_m: z(p.rootMaxM), stage: "Raiz máxima (fim do desenvolvimento)" },
    { sequence_no: 3, x_value: cycleEnd, root_depth_m: z(p.rootMaxM), stage: "Fim do ciclo" },
  ];
}
