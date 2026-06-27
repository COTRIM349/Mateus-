/**
 * Dados fictícios da Cotrim Irrigação Pro.
 *
 * Esta etapa NÃO usa banco de dados, autenticação ou APIs externas.
 * Todos os valores abaixo são simulados apenas para visualizar a plataforma
 * funcionando localmente. Em produção, serão substituídos por dados reais.
 */

import { formatBRL, formatNumber } from "./format";
import type {
  Cultura,
  MetricaDashboard,
  Modulo,
  Pivo,
  PontoGrafico,
} from "./types";

/** Lista das 4 culturas trabalhadas nesta etapa. */
export const culturas: Cultura[] = ["Soja", "Milho", "Algodão", "Cacau"];

/** Lista dos 3 módulos produtivos. */
export const modulos: Modulo[] = ["RDM", "M1", "M2/M3"];

/**
 * 10 pivôs fictícios com indicadores agronômicos, energéticos e de custo.
 * Os identificadores (P14, P126, etc.) seguem a nomenclatura usada na fazenda.
 */
export const pivos: Pivo[] = [
  {
    id: "P14",
    nome: "Pivô 14",
    modulo: "RDM",
    cultura: "Soja",
    fase: "Floração",
    area: 92,
    deficit: 18.4,
    laminaRecomendada: 12.5,
    tempoIrrigacao: 9.2,
    volume: 11500,
    energia: 3420,
    custo: 4980,
    prioridade: "alta",
    status: "irrigando",
    risco: 82,
  },
  {
    id: "P126",
    nome: "Pivô 126",
    modulo: "M1",
    cultura: "Milho",
    fase: "Enchimento de grãos",
    area: 110,
    deficit: 17.1,
    laminaRecomendada: 11.8,
    tempoIrrigacao: 10.4,
    volume: 12980,
    energia: 3910,
    custo: 5640,
    prioridade: "alta",
    status: "irrigando",
    risco: 78,
  },
  {
    id: "P31",
    nome: "Pivô 31",
    modulo: "M2/M3",
    cultura: "Algodão",
    fase: "Desenvolvimento vegetativo",
    area: 88,
    deficit: 15.9,
    laminaRecomendada: 10.6,
    tempoIrrigacao: 8.1,
    volume: 9330,
    energia: 2980,
    custo: 4310,
    prioridade: "alta",
    status: "alerta",
    risco: 74,
  },
  {
    id: "P58",
    nome: "Pivô 58",
    modulo: "M1",
    cultura: "Soja",
    fase: "Vegetativo",
    area: 76,
    deficit: 9.7,
    laminaRecomendada: 7.2,
    tempoIrrigacao: 5.9,
    volume: 5470,
    energia: 1840,
    custo: 2510,
    prioridade: "media",
    status: "irrigando",
    risco: 48,
  },
  {
    id: "P77",
    nome: "Pivô 77",
    modulo: "RDM",
    cultura: "Milho",
    fase: "Floração",
    area: 64,
    deficit: 11.2,
    laminaRecomendada: 8.4,
    tempoIrrigacao: 6.3,
    volume: 5380,
    energia: 1720,
    custo: 2390,
    prioridade: "media",
    status: "irrigando",
    risco: 55,
  },
  {
    id: "P89",
    nome: "Pivô 89",
    modulo: "M2/M3",
    cultura: "Cacau",
    fase: "Frutificação",
    area: 41,
    deficit: 7.4,
    laminaRecomendada: 6.1,
    tempoIrrigacao: 4.2,
    volume: 2500,
    energia: 980,
    custo: 1430,
    prioridade: "media",
    status: "irrigando",
    risco: 39,
  },
  {
    id: "P102",
    nome: "Pivô 102",
    modulo: "M1",
    cultura: "Algodão",
    fase: "Maturação",
    area: 95,
    deficit: 6.1,
    laminaRecomendada: 4.8,
    tempoIrrigacao: 4.5,
    volume: 4560,
    energia: 1510,
    custo: 2080,
    prioridade: "baixa",
    status: "parado",
    risco: 27,
  },
  {
    id: "P109",
    nome: "Pivô 109",
    modulo: "RDM",
    cultura: "Soja",
    fase: "Maturação",
    area: 70,
    deficit: 3.8,
    laminaRecomendada: 3.0,
    tempoIrrigacao: 2.6,
    volume: 2100,
    energia: 720,
    custo: 1010,
    prioridade: "baixa",
    status: "parado",
    risco: 18,
  },
  {
    id: "P133",
    nome: "Pivô 133",
    modulo: "M2/M3",
    cultura: "Cacau",
    fase: "Desenvolvimento",
    area: 38,
    deficit: 8.9,
    laminaRecomendada: 6.7,
    tempoIrrigacao: 4.8,
    volume: 2546,
    energia: 1010,
    custo: 1480,
    prioridade: "media",
    status: "manutencao",
    risco: 44,
  },
  {
    id: "P140",
    nome: "Pivô 140",
    modulo: "M1",
    cultura: "Milho",
    fase: "Vegetativo",
    area: 83,
    deficit: 5.2,
    laminaRecomendada: 4.1,
    tempoIrrigacao: 3.7,
    volume: 3403,
    energia: 1150,
    custo: 1620,
    prioridade: "baixa",
    status: "parado",
    risco: 24,
  },
];

/* -------------------------------------------------------------------------- */
/*  Agregações derivadas (calculadas a partir dos pivôs acima)                */
/* -------------------------------------------------------------------------- */

const pivosAtivos = pivos.filter((p) => p.status === "irrigando").length;
const deficitMedio =
  pivos.reduce((soma, p) => soma + p.deficit, 0) / pivos.length;
const laminaMedia =
  pivos.reduce((soma, p) => soma + p.laminaRecomendada, 0) / pivos.length;
const volumeTotal = pivos.reduce((soma, p) => soma + p.volume, 0);
const energiaTotal = pivos.reduce((soma, p) => soma + p.energia, 0);
const custoTotal = pivos.reduce((soma, p) => soma + p.custo, 0);
const alertasCriticos = pivos.filter(
  (p) => p.status === "alerta" || p.risco >= 75,
).length;
const riscoMedio = Math.round(
  pivos.reduce((soma, p) => soma + p.risco, 0) / pivos.length,
);

/** As 8 métricas exibidas nos cards do topo do dashboard. */
export const metricasDashboard: MetricaDashboard[] = [
  {
    id: "pivos-ativos",
    titulo: "Pivôs ativos",
    valor: `${pivosAtivos}/${pivos.length}`,
    descricao: "Irrigando neste momento",
    variacao: "+2 vs ontem",
    tendencia: "positiva",
  },
  {
    id: "deficit-medio",
    titulo: "Déficit médio",
    valor: `${formatNumber(deficitMedio, 1)} mm`,
    descricao: "Média entre todos os pivôs",
    variacao: "+1,3 mm vs ontem",
    tendencia: "negativa",
  },
  {
    id: "lamina-hoje",
    titulo: "Lâmina recomendada hoje",
    valor: `${formatNumber(laminaMedia, 1)} mm`,
    descricao: "Média recomendada para hoje",
    tendencia: "neutra",
  },
  {
    id: "volume-necessario",
    titulo: "Volume necessário",
    valor: `${formatNumber(volumeTotal)} m³`,
    descricao: "Demanda hídrica total do dia",
    tendencia: "neutra",
  },
  {
    id: "energia-estimada",
    titulo: "Energia estimada",
    valor: `${formatNumber(energiaTotal)} kWh`,
    descricao: "Consumo previsto para hoje",
    variacao: "+4% vs ontem",
    tendencia: "negativa",
  },
  {
    id: "custo-estimado",
    titulo: "Custo estimado",
    valor: formatBRL(custoTotal),
    descricao: "Custo operacional do dia",
    tendencia: "neutra",
  },
  {
    id: "alertas-criticos",
    titulo: "Alertas críticos",
    valor: `${alertasCriticos}`,
    descricao: "Pivôs exigindo atenção imediata",
    variacao: "+1 vs ontem",
    tendencia: "negativa",
  },
  {
    id: "risco-produtivo",
    titulo: "Risco produtivo",
    valor: `${riscoMedio}%`,
    descricao: "Índice médio de risco à produção",
    tendencia: riscoMedio >= 50 ? "negativa" : "positiva",
  },
];

/* -------------------------------------------------------------------------- */
/*  Conjuntos de dados para os gráficos do dashboard                          */
/* -------------------------------------------------------------------------- */

/** Déficit hídrico (mm) por pivô. */
export const deficitPorPivo: PontoGrafico[] = pivos.map((p) => ({
  rotulo: p.id,
  valor: p.deficit,
}));

/** Custo total estimado (R$) agrupado por cultura. */
export const custoPorCultura: PontoGrafico[] = culturas.map((cultura) => ({
  rotulo: cultura,
  valor: pivos
    .filter((p) => p.cultura === cultura)
    .reduce((soma, p) => soma + p.custo, 0),
}));

/** Volume aplicado (m³) agrupado por módulo. */
export const volumePorModulo: PontoGrafico[] = modulos.map((modulo) => ({
  rotulo: modulo,
  valor: pivos
    .filter((p) => p.modulo === modulo)
    .reduce((soma, p) => soma + p.volume, 0),
}));

/** Energia estimada (kWh) agrupada por cultura. */
export const energiaPorCultura: PontoGrafico[] = culturas.map((cultura) => ({
  rotulo: cultura,
  valor: pivos
    .filter((p) => p.cultura === cultura)
    .reduce((soma, p) => soma + p.energia, 0),
}));

/* -------------------------------------------------------------------------- */
/*  Cotrim AI - recomendação simulada                                         */
/* -------------------------------------------------------------------------- */

/** Recomendação fictícia exibida no card da Cotrim AI no dashboard. */
export const recomendacaoIA =
  "Priorizar P14, P126 e P31. Eles apresentam maior déficit hídrico e maior " +
  "risco produtivo. Adiar P109 por 24 horas é seguro devido ao baixo déficit.";
