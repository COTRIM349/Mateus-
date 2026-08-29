/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GLOSSÁRIO HÍDRICO CANÔNICO — fonte única de termos e unidades
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este arquivo é a AUTORIDADE sobre nomenclatura hídrica da plataforma.
 * Todo motor, tela, relatório e persistência DEVE usar estes termos e
 * unidades — nunca redefinir localmente.
 *
 * Regra de ouro sobre valores ausentes (spec §2):
 *   • `0` só representa valor real quando a fonte retornou explicitamente 0.
 *   • Dado ausente é `null` e deve aparecer como "indisponível" com motivo.
 *   • Nunca assumir chuva=0, ETo=0, solo padrão, condição na CC ou Ea padrão.
 *
 * Referências: FAO-56 (Allen et al., 1998); FAO-33 (Doorenbos & Kassam, 1979);
 * Bernardo, Mantovani & Soares (2019).
 */

// ── Versão do motor canônico ───────────────────────────────────────────────
export const HYDRIC_ENGINE_VERSION = "hydric_engine_v4.0.0" as const;

// ── Modo de coeficiente ────────────────────────────────────────────────────
/**
 * single = Kc único (ETc = ETo × Kc × Kl). Padrão oficial.
 * dual   = Kcb + Ke (ETc = (Kcb×Ks + Ke) × ETo). Opt-in por parcela, só com
 *          dados de Ke validados. NUNCA misturar single e dual no mesmo dia.
 */
export type CoefficientMode = "single" | "dual";

// ── Origem/qualidade de um dado (spec §2, §6.2) ────────────────────────────
export type DataNature = "observed" | "estimated" | "forecast" | "unavailable";
export type DataQuality = "ok" | "degraded" | "stale" | "missing";

/** Um valor que carrega sua procedência. Ausente = value:null + reason. */
export interface Provenanced<T = number> {
  value: T | null;
  unit: string;
  nature: DataNature;
  quality: DataQuality;
  /** Fonte legível (ex.: "Open-Meteo ECMWF", "sensor tátil", "cadastro manual"). */
  source: string | null;
  /** ISO-8601. Quando o dado foi produzido/observado/emitido. */
  timestamp: string | null;
  /** Motivo quando value é null ou quality != ok. */
  reason: string | null;
}

// ── Termos canônicos (spec §7.2) ───────────────────────────────────────────
/**
 * Cada termo tem UMA definição e UMA unidade. `CTA` é sinônimo configurado
 * de CAD — não é conceito novo.
 */
export const HYDRIC_TERMS = {
  DTA: {
    code: "DTA",
    name: "Disponibilidade Total de Água",
    unit: "mm/cm",
    def: "Água disponível por unidade de profundidade. (θCC − θPMP) × 10 se volumétrico.",
  },
  CAD: {
    code: "CAD",
    name: "Capacidade de Água Disponível (TAW)",
    unit: "mm",
    def: "Água total disponível na zona radicular. Σ[(θCC − θPMP) × Z_explorada × 1000].",
    aliases: ["TAW", "CTA"],
  },
  AFD: {
    code: "AFD",
    name: "Água Facilmente Disponível (RAW)",
    unit: "mm",
    def: "Depleção permitida antes do estresse. p_ajustado × CAD.",
    aliases: ["RAW"],
  },
  ARM: {
    code: "ARM",
    name: "Armazenamento atual",
    unit: "mm",
    def: "Água atual acima do PMP na zona radicular. clamp(0, CAD).",
  },
  ARM_CRITICO: {
    code: "ARM_critico",
    name: "Armazenamento crítico",
    unit: "mm",
    def: "Limite de segurança. CAD − AFD. Abaixo disso há estresse (Ks < 1).",
  },
  DR: {
    code: "Dr",
    name: "Depleção atual",
    unit: "mm",
    def: "Água consumida abaixo da CC. CAD − ARM. Indicador diário primário.",
  },
  P: {
    code: "p",
    name: "Fração de depleção permitida",
    unit: "adimensional (0-1)",
    def: "Fração da CAD que pode depletar sem estresse. Ajustada pela demanda.",
  },
  KS: {
    code: "Ks",
    name: "Coeficiente de estresse hídrico",
    unit: "adimensional (0-1)",
    def: "1 quando Dr ≤ AFD; (CAD − Dr)/((1 − p)×CAD) quando Dr > AFD.",
  },
  PCT_ARM: {
    code: "%ARM",
    name: "Percentual de armazenamento",
    unit: "%",
    def: "ARM / CAD × 100. NÃO confundir com % da CC volumétrica.",
  },
  THETA: {
    code: "θ",
    name: "Umidade volumétrica atual",
    unit: "cm³/cm³",
    def: "Fração volumétrica de água no solo, quando medida.",
  },
} as const;

// ── Estados hídricos (spec §8.5 — derivados de Dr, AFD, Ks, qualidade) ──────
export type HydricState =
  | "capacidade"      // azul — próximo à CC
  | "otimo"           // verde escuro — faixa ótima
  | "adequado"        // verde claro — adequado, aproximando do limite
  | "alerta"          // amarelo/laranja — alerta operacional
  | "abaixo_seguranca"// vermelho — abaixo da faixa de segurança
  | "critico"         // preto — déficit crítico / forte estresse
  | "indisponivel";   // cinza — cálculo indisponível

export const HYDRIC_STATE_CONFIG: Record<
  HydricState,
  { label: string; color: string; icon: string; bgClass: string }
> = {
  capacidade:       { label: "Capacidade de campo", color: "#3b82f6", icon: "▲", bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  otimo:            { label: "Ótimo",                color: "#15803d", icon: "●", bgClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  adequado:         { label: "Adequado",            color: "#65a30d", icon: "●", bgClass: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300" },
  alerta:           { label: "Alerta",              color: "#f59e0b", icon: "◆", bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  abaixo_seguranca: { label: "Abaixo da segurança", color: "#ef4444", icon: "▼", bgClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  critico:          { label: "Crítico",             color: "#171717", icon: "■", bgClass: "bg-neutral-800 text-white dark:bg-black dark:text-neutral-200" },
  indisponivel:     { label: "Indisponível",        color: "#9ca3af", icon: "—", bgClass: "bg-gray-100 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400" },
};

// ── Prontidão do manejo (spec §9) ──────────────────────────────────────────
export type ReadinessLevel = "pronto" | "pronto_com_ressalvas" | "bloqueado";

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  /** Ação exata para resolver quando ok=false. */
  actionRequired: string | null;
}

export interface ReadinessReport {
  level: ReadinessLevel;
  items: ReadinessItem[];
  /** Motivos que causam bloqueio (ok=false que impede cálculo oficial). */
  blockers: string[];
}

// ── Confiança da recomendação ──────────────────────────────────────────────
export type Confidence = "alta" | "media" | "baixa" | "insuficiente";
