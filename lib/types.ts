/**
 * Tipagem do domínio da Cotrim Irrigação Pro.
 * Centraliza os tipos usados por dados fictícios, componentes e páginas.
 */

/** Status operacional de um pivô / recomendação. */
export type StatusOperacional = "irrigando" | "parado" | "manutencao" | "alerta";

/** Nível de prioridade de irrigação. */
export type Prioridade = "alta" | "media" | "baixa";

/** Culturas suportadas nesta etapa. */
export type Cultura = "Soja" | "Milho" | "Algodão" | "Cacau";

/** Módulos produtivos da fazenda. */
export type Modulo = "RDM" | "M1" | "M2/M3";

/** Representa um pivô central e seus indicadores agronômicos. */
export interface Pivo {
  id: string;
  nome: string;
  modulo: Modulo;
  cultura: Cultura;
  fase: string;
  /** Área irrigada em hectares. */
  area: number;
  /** Déficit hídrico em milímetros. */
  deficit: number;
  /** Lâmina recomendada para hoje em milímetros. */
  laminaRecomendada: number;
  /** Tempo de irrigação estimado em horas. */
  tempoIrrigacao: number;
  /** Volume de água necessário em m³. */
  volume: number;
  /** Energia estimada em kWh. */
  energia: number;
  /** Custo estimado da operação em R$. */
  custo: number;
  prioridade: Prioridade;
  status: StatusOperacional;
  /** Risco produtivo associado (0 a 100). */
  risco: number;
}

/** Métrica exibida nos cards do dashboard. */
export interface MetricaDashboard {
  id: string;
  titulo: string;
  valor: string;
  descricao: string;
  /** Variação textual (ex.: "+3 vs ontem"). */
  variacao?: string;
  /** Tendência usada para colorir o indicador. */
  tendencia?: "positiva" | "negativa" | "neutra";
}

/** Ponto genérico para gráficos de barras/colunas. */
export interface PontoGrafico {
  rotulo: string;
  valor: number;
}
