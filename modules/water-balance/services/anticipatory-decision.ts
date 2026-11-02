export type AnticipatoryDecisionLevel =
  | "confortavel"
  | "monitorar"
  | "programar"
  | "prioridade"
  | "critico";

export interface AnticipatoryDecisionInput {
  cadMm: number;
  armMm: number;
  afdMm: number;
  etcPotentialMmDay: number;
  areaHa: number | null;
  flowRateM3h: number | null;
  efficiencyFraction: number | null;
}

export interface AnticipatoryDecision {
  level: AnticipatoryDecisionLevel;
  deficitToCcNetMm: number;
  grossDepthToCcMm: number | null;
  volumeToCcM3: number | null;
  applicationHoursToCc: number | null;
  operationDaysToCc: number | null;
  remainingToAfdMm: number;
  daysToAfd: number | null;
  afdUsedPct: number;
  operationalMarginDays: number | null;
}

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function calculateAnticipatoryDecision(
  input: AnticipatoryDecisionInput,
): AnticipatoryDecision {
  const cad = Math.max(Number(input.cadMm) || 0, 0);
  const arm = Math.min(Math.max(Number(input.armMm) || 0, 0), cad);
  const afd = Math.max(Number(input.afdMm) || 0, 0);
  const etc = Math.max(Number(input.etcPotentialMmDay) || 0, 0);
  const deficit = Math.max(cad - arm, 0);
  const remainingToAfd = Math.max(afd - deficit, 0);
  const afdUsedPct = afd > 0 ? Math.max((deficit / afd) * 100, 0) : 0;
  const atOrBeyondAfd = afd > 0 && deficit >= afd;
  const daysToAfd = atOrBeyondAfd
    ? 0
    : etc > 0
      ? remainingToAfd / etc
      : null;

  const efficiency = input.efficiencyFraction != null
    && Number.isFinite(input.efficiencyFraction)
    && input.efficiencyFraction > 0
    && input.efficiencyFraction <= 1
    ? input.efficiencyFraction
    : null;
  const area = input.areaHa != null && Number.isFinite(input.areaHa) && input.areaHa > 0
    ? input.areaHa
    : null;
  const flow = input.flowRateM3h != null && Number.isFinite(input.flowRateM3h) && input.flowRateM3h > 0
    ? input.flowRateM3h
    : null;

  const grossDepth = efficiency ? deficit / efficiency : null;
  const volume = grossDepth != null && area != null ? grossDepth * area * 10 : null;
  const applicationHours = volume != null && flow != null ? volume / flow : null;
  const operationDays = applicationHours != null ? applicationHours / 24 : null;
  const operationalMarginDays = daysToAfd != null && operationDays != null
    ? daysToAfd - operationDays
    : null;

  let level: AnticipatoryDecisionLevel;
  if (afd > 0 && deficit > afd) {
    level = "critico";
  } else if (afd > 0 && Math.abs(deficit - afd) < 0.01) {
    level = "prioridade";
  } else if (operationalMarginDays != null && operationalMarginDays <= 0) {
    level = "programar";
  } else if (
    (operationDays != null && daysToAfd != null && daysToAfd <= operationDays * 2)
    || afdUsedPct >= 70
  ) {
    level = "monitorar";
  } else {
    level = "confortavel";
  }

  return {
    level,
    deficitToCcNetMm: round(deficit),
    grossDepthToCcMm: grossDepth == null ? null : round(grossDepth),
    volumeToCcM3: volume == null ? null : round(volume),
    applicationHoursToCc: applicationHours == null ? null : round(applicationHours),
    operationDaysToCc: operationDays == null ? null : round(operationDays),
    remainingToAfdMm: round(remainingToAfd),
    daysToAfd: daysToAfd == null ? null : round(daysToAfd),
    afdUsedPct: round(afdUsedPct, 1),
    operationalMarginDays: operationalMarginDays == null ? null : round(operationalMarginDays),
  };
}
