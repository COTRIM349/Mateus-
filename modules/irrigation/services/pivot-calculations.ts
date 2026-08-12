/**
 * Cálculos técnicos do pivô (equipamento).
 *
 * Todas as fórmulas auto-calculáveis do cadastro de Pivô — raio, tempo de
 * volta, lâmina a 100%, potência instalada em kW, consumo específico e
 * custo por mm — em UM lugar só, puras e testadas.
 *
 * Regra de ouro: o motor NUNCA arredonda para exibição — devolve o número
 * completo. Formatação para UI é responsabilidade da camada de apresentação.
 *
 * Referências:
 *  - FAO-56 (Allen et al., 1998) para agronomia
 *  - Bernardo, Mantovani & Soares (2019) "Manual de Irrigação"
 *  - Marouelli et al. (2011) Embrapa Hortaliças, Circular 92
 */

// ── Faixas típicas (para warnings suaves na UI) ─────────────────────────────

export const PIVOT_TYPICAL_RANGES = {
  cuc:                        { min: 0.75, max: 0.95, unit: "" },
  motorEfficiency:            { min: 0.80, max: 0.96, unit: "" },
  applicationEfficiency:      { min: 0.75, max: 0.90, unit: "" },
  servicePressureBar:         { min: 1.5,  max: 4.5,  unit: "bar" },
  specificConsumptionKwhM3:   { min: 0.15, max: 0.80, unit: "kWh/m³" },
  costPerKwhReais:            { min: 0.30, max: 1.50, unit: "R$/kWh" },
  costPerMmReais:             { min: 0.50, max: 5.00, unit: "R$/mm/ha" },
  velocity100PctMh:           { min: 50,   max: 400,  unit: "m/h" },
  fullTurnTimeH:              { min: 8,    max: 60,   unit: "h" },
  depth100PctMm:              { min: 2,    max: 15,   unit: "mm" },
} as const;

// ── Constantes físicas ──────────────────────────────────────────────────────

/** 1 CV métrico = 0,7355 kW (potência de eixo/saída do motor). */
export const CV_TO_KW = 0.7355;

/** 1 ha = 10.000 m². */
export const M2_PER_HA = 10_000;

/** 1 mm de lâmina em 1 ha equivale a 10 m³ de volume aplicado. */
export const M3_PER_MM_HA = 10;

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface PivotCalculationInput {
  /** Área irrigada (ha). */
  areaHa?: number | null;
  /** Raio da última torre (m). Se ausente, calculado da área. */
  radiusM?: number | null;
  /** Vazão nominal do pivô (m³/h). */
  flowRateM3h?: number | null;
  /** Velocidade da última torre a 100% de velocidade (m/h). */
  velocity100PctMh?: number | null;
  /** Potência da bomba (CV, placa do motor). */
  pumpPowerCv?: number | null;
  /** Eficiência do motor (0-1). Padrão 0,88. */
  motorEfficiency?: number | null;
  /** Custo da energia (R$/kWh). */
  energyCostPerKwh?: number | null;
}

export interface PivotCalculations {
  radiusM: number | null;
  fullTurnTimeH: number | null;
  depth100PctMm: number | null;
  installedPowerKw: number | null;
  specificConsumptionKwhM3: number | null;
  costPerMmReais: number | null;
}

// ── Utilitários ─────────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function positiveOrNull(v: number | null | undefined): number | null {
  return isFiniteNumber(v) && v > 0 ? v : null;
}

// ── Fórmulas individuais (puras) ────────────────────────────────────────────

/**
 * Raio da última torre a partir da área irrigada.
 * Assume geometria de círculo cheio (pivô central completo).
 *
 * Fórmula: r = √(A × 10.000 / π)  onde A está em hectares.
 *
 * Ex.: 86 ha  →  r ≈ 523,3 m.
 */
export function calculateRadiusFromArea(areaHa: number | null | undefined): number | null {
  const a = positiveOrNull(areaHa);
  if (a == null) return null;
  return Math.sqrt((a * M2_PER_HA) / Math.PI);
}

/**
 * Tempo de uma volta completa a 100% de velocidade (h).
 *
 * Fórmula: t = 2π × raio / velocidade
 *          (velocidade em m/h → resultado em horas)
 *
 * Ex.: raio 523 m, velocidade 150 m/h  →  t ≈ 21,9 h.
 */
export function calculateFullTurnTime(
  radiusM: number | null | undefined,
  velocity100PctMh: number | null | undefined,
): number | null {
  const r = positiveOrNull(radiusM);
  const v = positiveOrNull(velocity100PctMh);
  if (r == null || v == null) return null;
  return (2 * Math.PI * r) / v;
}

/**
 * Lâmina aplicada em uma volta a 100% de velocidade (mm).
 *
 * Fórmula: L = (vazão × tempo_volta) / (área × 10)
 *          onde vazão em m³/h, tempo em h, área em ha, L em mm.
 *
 * Derivação: volume = vazão × tempo (m³); lâmina = volume / (área × 10)
 * pois 1 mm × 1 ha = 10 m³.
 *
 * Ex.: 300 m³/h × 21,9 h em 86 ha  →  L ≈ 7,64 mm.
 */
export function calculateDepth100Pct(
  flowRateM3h: number | null | undefined,
  fullTurnTimeH: number | null | undefined,
  areaHa: number | null | undefined,
): number | null {
  const q = positiveOrNull(flowRateM3h);
  const t = positiveOrNull(fullTurnTimeH);
  const a = positiveOrNull(areaHa);
  if (q == null || t == null || a == null) return null;
  return (q * t) / (a * M3_PER_MM_HA);
}

/**
 * Potência elétrica instalada (kW) — o que o motor puxa da rede.
 *
 * Fórmula: kW_elétrica = CV × 0,7355 / η_motor
 *          onde η_motor é fração (0-1).
 *
 * A conversão CV → kW dá a potência de EIXO. Para chegar na potência
 * ELÉTRICA consumida (a que vira kWh na conta), divide pela eficiência
 * do motor (perdas de conversão elétrica-mecânica).
 *
 * Ex.: 150 CV, motor 88%  →  150 × 0,7355 / 0,88 ≈ 125,4 kW elétricos.
 */
export function calculateInstalledPowerKw(
  pumpPowerCv: number | null | undefined,
  motorEfficiency: number | null | undefined = 0.88,
): number | null {
  const cv = positiveOrNull(pumpPowerCv);
  const eta = positiveOrNull(motorEfficiency);
  if (cv == null || eta == null || eta > 1) return null;
  return (cv * CV_TO_KW) / eta;
}

/**
 * Consumo específico (kWh/m³) — quanto de energia gasta para bombear 1 m³.
 *
 * Fórmula: cE = kW_instalada / vazão_m³h
 *
 * É o KPI energético principal do pivô. Valores típicos: 0,3–0,6 kWh/m³.
 * Acima de 0,8 sugere baixa eficiência (bocais desgastados, pressão alta,
 * motor mal dimensionado).
 *
 * Ex.: 125,4 kW / 300 m³/h  →  0,418 kWh/m³.
 */
export function calculateSpecificConsumption(
  installedPowerKw: number | null | undefined,
  flowRateM3h: number | null | undefined,
): number | null {
  const kw = positiveOrNull(installedPowerKw);
  const q = positiveOrNull(flowRateM3h);
  if (kw == null || q == null) return null;
  return kw / q;
}

/**
 * Custo de aplicar 1 mm de lâmina em 1 ha (R$/mm/ha).
 *
 * Fórmula: custo/mm = consumo_específico × 10 × R$/kWh
 *          (10 porque 1 mm × 1 ha = 10 m³)
 *
 * Ex.: cE 0,418 kWh/m³ × 10 × R$ 0,72/kWh  →  R$ 3,01/mm/ha.
 */
export function calculateCostPerMm(
  specificConsumptionKwhM3: number | null | undefined,
  energyCostPerKwh: number | null | undefined,
): number | null {
  const cE = positiveOrNull(specificConsumptionKwhM3);
  const cKwh = positiveOrNull(energyCostPerKwh);
  if (cE == null || cKwh == null) return null;
  return cE * M3_PER_MM_HA * cKwh;
}

// ── Motor consolidado (usa preferência a manual > auto) ─────────────────────

/**
 * Recalcula tudo que é auto-calculável, respeitando entradas manuais quando
 * presentes.
 *
 * Ordem de dependência:
 *   radius        (área)
 *   fullTurnTime  (radius, velocity100Pct)
 *   depth100Pct   (flow, fullTurnTime, area)
 *   installedKw   (pumpPowerCv, motorEfficiency)
 *   specificConsumption (installedKw, flow)
 *   costPerMm     (specificConsumption, energyCostPerKwh)
 */
export function calculatePivotAll(input: PivotCalculationInput): PivotCalculations {
  const radiusM =
    positiveOrNull(input.radiusM) ?? calculateRadiusFromArea(input.areaHa);

  const fullTurnTimeH = calculateFullTurnTime(radiusM, input.velocity100PctMh);

  const depth100PctMm = calculateDepth100Pct(
    input.flowRateM3h,
    fullTurnTimeH,
    input.areaHa,
  );

  const installedPowerKw = calculateInstalledPowerKw(
    input.pumpPowerCv,
    input.motorEfficiency ?? 0.88,
  );

  const specificConsumptionKwhM3 = calculateSpecificConsumption(
    installedPowerKw,
    input.flowRateM3h,
  );

  const costPerMmReais = calculateCostPerMm(
    specificConsumptionKwhM3,
    input.energyCostPerKwh,
  );

  return {
    radiusM,
    fullTurnTimeH,
    depth100PctMm,
    installedPowerKw,
    specificConsumptionKwhM3,
    costPerMmReais,
  };
}

// ── Validação de faixa (para warnings suaves na UI) ─────────────────────────

export interface RangeWarning {
  field: keyof typeof PIVOT_TYPICAL_RANGES;
  value: number;
  expected: { min: number; max: number; unit: string };
  message: string;
}

/**
 * Retorna warnings (não erros) quando um valor está fora da faixa típica.
 * A UI mostra como "⚠ atípico" mas permite salvar mesmo assim.
 */
export function checkTypicalRanges(input: {
  cuc?: number | null;
  motorEfficiency?: number | null;
  applicationEfficiency?: number | null;
  servicePressureBar?: number | null;
  specificConsumptionKwhM3?: number | null;
  costPerKwhReais?: number | null;
  costPerMmReais?: number | null;
  velocity100PctMh?: number | null;
  fullTurnTimeH?: number | null;
  depth100PctMm?: number | null;
}): RangeWarning[] {
  const warnings: RangeWarning[] = [];

  for (const [field, range] of Object.entries(PIVOT_TYPICAL_RANGES)) {
    const value = input[field as keyof typeof input];
    if (!isFiniteNumber(value)) continue;
    if (value < range.min || value > range.max) {
      warnings.push({
        field: field as keyof typeof PIVOT_TYPICAL_RANGES,
        value,
        expected: range,
        message: `Valor ${value.toLocaleString("pt-BR")} ${range.unit} fora da faixa típica (${range.min}–${range.max} ${range.unit}).`,
      });
    }
  }

  return warnings;
}

// ── Reverso: percentímetro ↔ lâmina ─────────────────────────────────────────

/**
 * Percentímetro a ajustar no painel do pivô para aplicar uma dada lâmina.
 *
 * Fórmula: % = (lâmina_a_100% / lâmina_desejada) × 100
 *
 * Ex.: pivô com lâmina a 100% = 7,64 mm; quero aplicar 4 mm →
 *      % = (7,64 / 4) × 100 = 191% (satura em 100 na UI — indica que
 *      esse pivô não consegue lâmina tão baixa em uma passada).
 *
 * Se lâmina_desejada > lâmina_100 (caso raro), retorna >100 e UI trata
 * como "múltiplas passadas necessárias".
 */
export function calculatePercentimeter(
  desiredDepthMm: number | null | undefined,
  depth100PctMm: number | null | undefined,
): number | null {
  const desired = positiveOrNull(desiredDepthMm);
  const d100 = positiveOrNull(depth100PctMm);
  if (desired == null || d100 == null) return null;
  return (d100 / desired) * 100;
}

/**
 * Tempo de irrigação (h) para aplicar uma dada lâmina.
 *
 * Fórmula: tempo = (lâmina × área × 10) / vazão
 *
 * Ex.: 5 mm em 86 ha com 300 m³/h  →  (5 × 86 × 10) / 300 ≈ 14,3 h.
 */
export function calculateIrrigationTime(
  desiredDepthMm: number | null | undefined,
  areaHa: number | null | undefined,
  flowRateM3h: number | null | undefined,
): number | null {
  const l = positiveOrNull(desiredDepthMm);
  const a = positiveOrNull(areaHa);
  const q = positiveOrNull(flowRateM3h);
  if (l == null || a == null || q == null) return null;
  return (l * a * M3_PER_MM_HA) / q;
}
