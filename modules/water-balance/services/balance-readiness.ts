/**
 * Checklist de prontidão do balanço hídrico operacional.
 */

export type ReadinessLevel = "ok" | "warn" | "error";

export interface ReadinessItem {
  id: string;
  label: string;
  level: ReadinessLevel;
  detail: string;
  href?: string;
}

export interface BalanceReadinessInput {
  hasAssignment: boolean;
  hasCulture: boolean;
  hasSoil: boolean;
  phaseCount: number;
  soilUsable: boolean;
  layerCount: number;
  totalDaysInRange: number;
  approvedClimateDays: number;
  missingClimateSample: string[];
  /** Dias >= hoje sem ETo fechada — aviso, não bloqueia. */
  openClimateMissing?: string[];
}

export interface BalanceReadinessResult {
  ready: boolean;
  items: ReadinessItem[];
  blockingCount: number;
}

export function assessBalanceReadiness(input: BalanceReadinessInput): BalanceReadinessResult {
  const items: ReadinessItem[] = [];

  items.push(
    input.hasAssignment
      ? { id: "parcel", label: "Parcela ativa", level: "ok", detail: "Vínculo operacional encontrado." }
      : {
          id: "parcel",
          label: "Parcela ativa",
          level: "error",
          detail: "Cadastre uma parcela em manejo (Vinculação).",
          href: "/vinculacao",
        },
  );

  items.push(
    input.hasCulture
      ? { id: "culture", label: "Cultura", level: "ok", detail: "Cultura vinculada à parcela." }
      : {
          id: "culture",
          label: "Cultura",
          level: "error",
          detail: "Cultura não encontrada.",
          href: "/culturas",
        },
  );

  items.push(
    input.hasSoil && input.soilUsable
      ? {
          id: "soil",
          label: "Solo",
          level: input.layerCount > 0 ? "ok" : "warn",
          detail:
            input.layerCount > 0
              ? `${input.layerCount} camada(s) no perfil.`
              : "Solo homogêneo — camadas opcionais refinam o CAD.",
          href: "/solos",
        }
      : {
          id: "soil",
          label: "Solo",
          level: "error",
          detail: "CC/PMP ou profundidade efetiva inválidos.",
          href: "/solos",
        },
  );

  items.push(
    input.phaseCount > 0
      ? { id: "phases", label: "Fases fenológicas", level: "ok", detail: `${input.phaseCount} fase(s) com Kc.` }
      : {
          id: "phases",
          label: "Fases fenológicas",
          level: "error",
          detail: "Cadastre fases da cultura para Kc e raiz.",
          href: "/culturas",
        },
  );

  const openMissing = input.openClimateMissing ?? [];
  const historicalMissing = input.totalDaysInRange - input.approvedClimateDays - openMissing.length;
  const climateOk =
    input.totalDaysInRange > 0 &&
    historicalMissing <= 0 &&
    (input.approvedClimateDays > 0 || openMissing.length < input.totalDaysInRange);
  const climatePartial = historicalMissing > 0 && input.approvedClimateDays > 0;

  if (climateOk) {
    items.push({
      id: "climate",
      label: "Clima operacional",
      level: openMissing.length > 0 ? "warn" : "ok",
      detail:
        openMissing.length > 0
          ? `${input.approvedClimateDays} dia(s) com ETo. ${openMissing.join(", ")} ainda em atualização automática.`
          : `${input.approvedClimateDays}/${input.totalDaysInRange} dias com ETo operacional (automático).`,
      href: "/clima",
    });
  } else if (climatePartial) {
    items.push({
      id: "climate",
      label: "Clima operacional",
      level: "error",
      detail: `Faltam ${historicalMissing} dia(s) encerrado(s) sem ETo (ex.: ${input.missingClimateSample.join(", ")}).`,
      href: "/clima",
    });
  } else {
    items.push({
      id: "climate",
      label: "Clima operacional",
      level: "error",
      detail: "Nenhum dia com ETo operacional no período — o clima sincroniza automaticamente em Clima.",
      href: "/clima",
    });
  }

  const blockingCount = items.filter((i) => i.level === "error").length;
  return { ready: blockingCount === 0, items, blockingCount };
}
