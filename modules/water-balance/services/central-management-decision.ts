import { calculateManagementUrgency } from "./pivot-engine-operational";
import type { BalanceDay, PivotHydricState } from "./pivot-engine-v2";

export type DecisionDataQualityLevel = "completo" | "atencao" | "insuficiente";

export interface DecisionDataQuality {
  level: DecisionDataQualityLevel;
  label: string;
  reasons: string[];
}

export interface DecisionSummary {
  title: string;
  detail: string;
}

export interface DecisionAuditRow {
  date: string;
  phase: string;
  dae: number;
  decision: string;
  deficitMm: number;
  afdUsedPct: number;
  etcPotentialMm: number;
  irrigationAppliedMm: number;
  recommendedGrossDepthMm: number;
}

const fmt = (value: number, digits = 1) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function decisionDataQuality(state: PivotHydricState): DecisionDataQuality {
  const current = state.current;
  if (!current || current.status === "cinza") {
    return {
      level: "insuficiente",
      label: "Insuficiente",
      reasons: ["Balanço hídrico indisponível para a parcela."],
    };
  }

  const reasons: string[] = [];
  if (state.initialConditionAssumed === true) {
    reasons.push("Condição inicial assumida em capacidade de campo.");
  }
  if (!state.soilName) reasons.push("Solo sem identificação.");
  if (!state.plantingDate) reasons.push("Data de plantio ausente.");
  if (!state.varietyName) reasons.push("Cultivar não informada.");
  if (state.sheetIncomplete) reasons.push("Geometria do pivô incompleta.");
  if (!(state.area > 0)) reasons.push("Área manejada inválida.");

  if (
    !Number.isFinite(current.adt) || current.adt <= 0 ||
    !Number.isFinite(current.afd) || current.afd <= 0 ||
    !Number.isFinite(current.kc) || current.kc < 0 ||
    !Number.isFinite(current.rootDepth) || current.rootDepth <= 0 ||
    !Number.isFinite(current.et0) || current.et0 < 0
  ) {
    reasons.push("Parâmetros hídricos atuais incompletos.");
  }

  if (reasons.length > 0) {
    return { level: "atencao", label: "Atenção", reasons };
  }

  return { level: "completo", label: "Completo", reasons: [] };
}

export function decisionSummaryFromDay(day: BalanceDay): DecisionSummary {
  const urgency = calculateManagementUrgency({
    afd: day.afd,
    deficit: day.deficit,
    etcPotential: day.etcPotential ?? day.etc,
  });
  const armPct = day.adt > 0 ? Math.max(0, Math.min(100, (day.storage / day.adt) * 100)) : 0;
  const etc = day.etcPotential ?? day.etc;
  const autonomy = urgency.daysToAfd;

  if (day.shouldIrrigate) {
    return {
      title: `Irrigar ${fmt(day.recommendedGrossDepth)} mm · limite atingido`,
      detail: `ARM ${fmt(armPct, 0)}% da CAD · déficit ${fmt(day.deficit)}/${fmt(day.afd)} mm · ETc ${fmt(etc)} mm/d`,
    };
  }

  if (day.status === "amarelo" || urgency.afdUsedPct >= 70) {
    return {
      title: `Programar · ${fmt(urgency.afdUsedPct, 0)}% da AFD consumida`,
      detail: `ARM ${fmt(armPct, 0)}% da CAD · autonomia ${autonomy == null ? "—" : fmt(autonomy)} d · ETc ${fmt(etc)} mm/d`,
    };
  }

  return {
    title: `Sem irrigar · ${fmt(urgency.afdUsedPct, 0)}% da AFD consumida`,
    detail: `ARM ${fmt(armPct, 0)}% da CAD · autonomia ${autonomy == null ? "—" : fmt(autonomy)} d · ETc ${fmt(etc)} mm/d`,
  };
}

export function decisionSummary(state: PivotHydricState): DecisionSummary {
  if (!state.current || state.current.status === "cinza") {
    return {
      title: "Sem decisão",
      detail: "Dados insuficientes para recomendação confiável.",
    };
  }
  return decisionSummaryFromDay(state.current);
}

export function buildDecisionAudit(
  state: PivotHydricState,
  days = 7,
): DecisionAuditRow[] {
  return state.history
    .filter((day) => day.status !== "cinza")
    .slice(-Math.max(1, days))
    .reverse()
    .map((day) => {
      const urgency = calculateManagementUrgency({
        afd: day.afd,
        deficit: day.deficit,
        etcPotential: day.etcPotential ?? day.etc,
      });
      return {
        date: day.date,
        phase: day.phase,
        dae: day.dae,
        decision: decisionSummaryFromDay(day).title,
        deficitMm: day.deficit,
        afdUsedPct: urgency.afdUsedPct,
        etcPotentialMm: day.etcPotential ?? day.etc,
        irrigationAppliedMm: day.irrigation,
        recommendedGrossDepthMm: day.shouldIrrigate ? day.recommendedGrossDepth : 0,
      };
    });
}
