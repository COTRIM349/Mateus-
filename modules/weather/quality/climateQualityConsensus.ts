export type ClimateProvider = "open_meteo" | "meteoblue" | "weatherapi" | "met_norway";

export type ConsensusField =
  | "temperatureC"
  | "relativeHumidityPct"
  | "dewPointC"
  | "surfacePressureKpa"
  | "windSpeed10mMs"
  | "windSpeed2mMs"
  | "windDirectionDeg"
  | "solarRadiationWm2"
  | "precipitationMm"
  | "vapourPressureDeficitKpa";

export interface ConsensusCandidate {
  id: string;
  provider: ClimateProvider;
  modelName: string | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  dewPointC: number | null;
  surfacePressureKpa: number | null;
  windSpeed10mMs: number | null;
  windSpeed2mMs: number | null;
  windDirectionDeg: number | null;
  solarRadiationWm2: number | null;
  precipitationMm: number | null;
  vapourPressureDeficitKpa: number | null;
}

export interface QualityFlag {
  candidateId: string;
  provider: ClimateProvider;
  modelName: string | null;
  fieldName: ConsensusField;
  originalValue: number | null;
  status: "accepted" | "outlier" | "invalid" | "suspicious" | "missing" | "excluded";
  reason: string;
  referenceValue: number | null;
  absoluteDifference: number | null;
  relativeDifferencePct: number | null;
}

export interface FieldConsensus {
  value: number | null;
  confidence: "high" | "medium" | "low" | "disputed" | "unavailable";
  providers: ClimateProvider[];
  outliers: ClimateProvider[];
  disputed: boolean;
  flags: QualityFlag[];
}

export interface ClimateConsensusResult {
  fields: Record<ConsensusField, FieldConsensus>;
  confidence: "high" | "medium" | "low" | "disputed" | "unavailable";
  contributingProviders: ClimateProvider[];
  outlierProviders: ClimateProvider[];
  disputedFields: ConsensusField[];
  independenceAssumed: false;
  warnings: string[];
}

interface Threshold {
  absolute: number;
  relativePct?: number;
}

export const CLIMA6_DIVERGENCE_THRESHOLDS: Partial<Record<ConsensusField, Threshold>> = {
  temperatureC: { absolute: 2 },
  relativeHumidityPct: { absolute: 10 },
  dewPointC: { absolute: 2.5 },
  surfacePressureKpa: { absolute: 1.5 },
  windSpeed10mMs: { absolute: 2, relativePct: 60 },
  windSpeed2mMs: { absolute: 2, relativePct: 60 },
  solarRadiationWm2: { absolute: 120, relativePct: 20 },
  vapourPressureDeficitKpa: { absolute: 0.6, relativePct: 35 },
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function relativeDifferencePct(value: number, reference: number): number | null {
  const denominator = Math.abs(reference);
  if (denominator < 1e-9) return null;
  return (Math.abs(value - reference) / denominator) * 100;
}

function physicalRange(field: ConsensusField, value: number): boolean {
  switch (field) {
    case "temperatureC": return value >= -50 && value <= 60;
    case "relativeHumidityPct": return value >= 0 && value <= 100;
    case "dewPointC": return value >= -60 && value <= 45;
    case "surfacePressureKpa": return value >= 70 && value <= 110;
    case "windSpeed10mMs":
    case "windSpeed2mMs": return value >= 0 && value <= 60;
    case "windDirectionDeg": return value >= 0 && value <= 360;
    case "solarRadiationWm2": return value >= 0 && value <= 1500;
    case "precipitationMm": return value >= 0 && value <= 250;
    case "vapourPressureDeficitKpa": return value >= 0 && value <= 10;
  }
}

function confidenceFor(count: number, outliers: number, disputed: boolean): FieldConsensus["confidence"] {
  if (disputed) return "disputed";
  if (count >= 3 && outliers === 0) return "high";
  if (count >= 2) return "medium";
  if (count === 1) return "low";
  return "unavailable";
}

function consensusNumeric(field: ConsensusField, candidates: ConsensusCandidate[]): FieldConsensus {
  const flags: QualityFlag[] = [];
  const valid: Array<{ candidate: ConsensusCandidate; value: number }> = [];

  for (const candidate of candidates) {
    const value = candidate[field] as number | null;
    if (value === null || !Number.isFinite(value)) {
      flags.push({ candidateId: candidate.id, provider: candidate.provider, modelName: candidate.modelName, fieldName: field, originalValue: value, status: "missing", reason: "valor ausente", referenceValue: null, absoluteDifference: null, relativeDifferencePct: null });
      continue;
    }
    if (!physicalRange(field, value)) {
      flags.push({ candidateId: candidate.id, provider: candidate.provider, modelName: candidate.modelName, fieldName: field, originalValue: value, status: "invalid", reason: "fora da faixa fisica configurada", referenceValue: null, absoluteDifference: null, relativeDifferencePct: null });
      continue;
    }
    valid.push({ candidate, value });
  }

  if (valid.length === 0) return { value: null, confidence: "unavailable", providers: [], outliers: [], disputed: false, flags };
  if (valid.length === 1) {
    const item = valid[0];
    flags.push({ candidateId: item.candidate.id, provider: item.candidate.provider, modelName: item.candidate.modelName, fieldName: field, originalValue: item.value, status: "accepted", reason: "unica fonte valida", referenceValue: item.value, absoluteDifference: 0, relativeDifferencePct: 0 });
    return { value: item.value, confidence: "low", providers: [item.candidate.provider], outliers: [], disputed: false, flags };
  }

  const reference = median(valid.map((x) => x.value));
  const threshold = CLIMA6_DIVERGENCE_THRESHOLDS[field];
  const accepted: typeof valid = [];
  const outliers: typeof valid = [];

  for (const item of valid) {
    const abs = Math.abs(item.value - reference);
    const rel = relativeDifferencePct(item.value, reference);
    const exceedsAbs = threshold ? abs > threshold.absolute : false;
    const exceedsRel = threshold?.relativePct != null && rel != null ? rel > threshold.relativePct : false;
    const isOutlier = threshold ? exceedsAbs && (threshold.relativePct == null || exceedsRel) : false;
    (isOutlier ? outliers : accepted).push(item);
    flags.push({ candidateId: item.candidate.id, provider: item.candidate.provider, modelName: item.candidate.modelName, fieldName: field, originalValue: item.value, status: isOutlier ? "outlier" : "accepted", reason: isOutlier ? "divergencia robusta em relacao a mediana" : "dentro da tolerancia do consenso", referenceValue: reference, absoluteDifference: abs, relativeDifferencePct: rel });
  }

  const twoVsTwo = valid.length === 4 && accepted.length === 2 && outliers.length === 2;
  const disputed = twoVsTwo || accepted.length === 0;
  const value = disputed ? null : median(accepted.map((x) => x.value));
  return {
    value,
    confidence: confidenceFor(accepted.length, outliers.length, disputed),
    providers: accepted.map((x) => x.candidate.provider),
    outliers: outliers.map((x) => x.candidate.provider),
    disputed,
    flags,
  };
}

function consensusRain(candidates: ConsensusCandidate[]): FieldConsensus {
  const flags: QualityFlag[] = [];
  const valid = candidates
    .map((candidate) => ({ candidate, value: candidate.precipitationMm }))
    .filter((x): x is { candidate: ConsensusCandidate; value: number } => x.value !== null && Number.isFinite(x.value) && x.value >= 0);

  for (const candidate of candidates) {
    if (candidate.precipitationMm === null) {
      flags.push({ candidateId: candidate.id, provider: candidate.provider, modelName: candidate.modelName, fieldName: "precipitationMm", originalValue: null, status: "missing", reason: "chuva sub-horaria indisponivel", referenceValue: null, absoluteDifference: null, relativeDifferencePct: null });
    }
  }
  if (valid.length === 0) return { value: null, confidence: "unavailable", providers: [], outliers: [], disputed: false, flags };

  const wet = valid.filter((x) => x.value >= 0.2);
  const dry = valid.filter((x) => x.value < 0.2);
  if (wet.length > 0 && dry.length > 0) {
    for (const item of valid) {
      flags.push({ candidateId: item.candidate.id, provider: item.candidate.provider, modelName: item.candidate.modelName, fieldName: "precipitationMm", originalValue: item.value, status: "suspicious", reason: "discordancia chuva/seco entre fontes; nao calcular media", referenceValue: null, absoluteDifference: null, relativeDifferencePct: null });
    }
    return { value: null, confidence: "disputed", providers: [], outliers: [], disputed: true, flags };
  }

  const values = valid.map((x) => x.value);
  const value = wet.length > 0 ? median(values) : 0;
  for (const item of valid) {
    flags.push({ candidateId: item.candidate.id, provider: item.candidate.provider, modelName: item.candidate.modelName, fieldName: "precipitationMm", originalValue: item.value, status: "accepted", reason: wet.length > 0 ? "fontes validas concordam em chuva" : "fontes validas concordam em seco", referenceValue: value, absoluteDifference: Math.abs(item.value - value), relativeDifferencePct: relativeDifferencePct(item.value, value) });
  }
  return { value, confidence: valid.length >= 3 ? "high" : valid.length === 2 ? "medium" : "low", providers: valid.map((x) => x.candidate.provider), outliers: [], disputed: false, flags };
}

export function buildClimateConsensus(candidates: ConsensusCandidate[]): ClimateConsensusResult {
  const fields = {} as Record<ConsensusField, FieldConsensus>;
  const numericFields: ConsensusField[] = ["temperatureC", "relativeHumidityPct", "dewPointC", "surfacePressureKpa", "windSpeed10mMs", "windSpeed2mMs", "windDirectionDeg", "solarRadiationWm2", "vapourPressureDeficitKpa"];
  for (const field of numericFields) fields[field] = consensusNumeric(field, candidates);
  fields.precipitationMm = consensusRain(candidates);

  const disputedFields = (Object.keys(fields) as ConsensusField[]).filter((field) => fields[field].disputed);
  const contributingProviders = Array.from(new Set((Object.keys(fields) as ConsensusField[]).flatMap((field) => fields[field].providers)));
  const outlierProviders = Array.from(new Set((Object.keys(fields) as ConsensusField[]).flatMap((field) => fields[field].outliers)));
  const available = (Object.keys(fields) as ConsensusField[]).map((f) => fields[f]).filter((f) => f.value !== null);
  let confidence: ClimateConsensusResult["confidence"] = "unavailable";
  if (disputedFields.length > 0) confidence = "disputed";
  else if (available.length >= 6 && available.filter((x) => x.confidence === "high").length >= 3) confidence = "high";
  else if (available.length >= 4) confidence = "medium";
  else if (available.length > 0) confidence = "low";

  return {
    fields,
    confidence,
    contributingProviders,
    outlierProviders,
    disputedFields,
    independenceAssumed: false,
    warnings: [
      "Consenso entre providers nao implica independencia entre modelos meteorologicos.",
      "Limiares CLIMA 6 v1 sao iniciais e devem ser recalibrados com desempenho historico por estacao.",
      "Precipitacao e tratada separadamente; discordancia chuva/seco produz valor null/disputed.",
    ],
  };
}
