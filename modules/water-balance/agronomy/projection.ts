/**
 * Projeção e dias até CRA.
 * Chuva/ETo previstas NÃO entram no saldo realizado.
 * Simulação diária usa Kc, Zr e ETo variáveis — não CRA/ETc simples, salvo aproximação marcada.
 */

import { calculateKsFromDr } from "./ks";
import { applyDepletionStep } from "./depletion";
import { calculateAdjustedFd, type FdMode } from "./fd";
import { calculateRootZoneStorage, type AgronomicLayerInput } from "./root-zone";
import type { MoistureUnit } from "./trace";

export interface ProjectionDayInput {
  date: string;
  et0Mm: number | null;
  rainMm: number;
  kc: number | null;
  kl: number;
  zrCm: number | null;
  zrMaxCm?: number | null;
  zrMethod?: string | null;
  pTable: number | null;
  fdMode: FdMode;
  plannedIrrigationGrossMm: number;
  efficiency: number;
  kind: "observed" | "forecast";
}

export interface ProjectionDayResult {
  date: string;
  kind: "observed" | "forecast";
  drStartMm: number | null;
  drEndMm: number | null;
  ks: number | null;
  kc: number | null;
  etcPotentialMm: number | null;
  etcAdjustedMm: number | null;
  ctaMm: number | null;
  craMm: number | null;
  fd: number | null;
  rainMm: number;
  missing: string[];
}

export function projectWaterBalance(input: {
  drStartMm: number;
  layers: AgronomicLayerInput[];
  unit: MoistureUnit;
  days: ProjectionDayInput[];
}): ProjectionDayResult[] {
  let dr = input.drStartMm;
  const out: ProjectionDayResult[] = [];

  for (const day of input.days) {
    const missing: string[] = [];
    if (day.et0Mm == null) missing.push("ETo");
    if (day.kc == null) missing.push("Kc");
    if (day.zrCm == null) missing.push("Zr");

    const zone = calculateRootZoneStorage({
      layers: input.layers,
      unit: input.unit,
      zrCm: day.zrCm,
      zrMaxCm: day.zrMaxCm,
      zrMethod: day.zrMethod,
      fd: day.pTable,
    });

    const etcPot = day.et0Mm != null && day.kc != null
      ? Math.max(day.et0Mm * day.kc * day.kl, 0)
      : null;

    const fdAdj = calculateAdjustedFd({
      mode: day.fdMode,
      pTable: day.pTable,
      etcPotentialMm: etcPot,
    });
    const fd = fdAdj.pAdjusted.value;
    const zoneAdj = fd != null && fd !== day.pTable
      ? calculateRootZoneStorage({
          layers: input.layers,
          unit: input.unit,
          zrCm: day.zrCm,
          zrMaxCm: day.zrMaxCm,
          zrMethod: day.zrMethod,
          fd,
        })
      : zone;

    const cta = zoneAdj.cta.value;
    const cra = zoneAdj.cra.value;
    const ksTrace = calculateKsFromDr({ ctaMm: cta, craMm: cra, drMm: dr });
    const ks = ksTrace.value;
    const etcAdj = etcPot != null && ks != null ? etcPot * ks : null;

    if (cta == null || etcAdj == null) {
      out.push({
        date: day.date,
        kind: day.kind,
        drStartMm: dr,
        drEndMm: null,
        ks,
        kc: day.kc,
        etcPotentialMm: etcPot,
        etcAdjustedMm: etcAdj,
        ctaMm: cta,
        craMm: cra,
        fd,
        rainMm: day.rainMm,
        missing: [...missing, ...zoneAdj.missing, ...ksTrace.missing],
      });
      continue;
    }

    const iEf = Math.max(day.plannedIrrigationGrossMm, 0) * Math.max(day.efficiency, 0);
    const step = applyDepletionStep({
      drStartMm: dr,
      ctaMm: cta,
      etcRealMm: etcAdj,
      rainGrossMm: day.rainMm,
      effectiveRainMm: day.rainMm,
      effectiveIrrigationMm: iEf,
      capillaryRiseMm: 0,
    });
    out.push({
      date: day.date,
      kind: day.kind,
      drStartMm: dr,
      drEndMm: step.drEndMm,
      ks,
      kc: day.kc,
      etcPotentialMm: etcPot,
      etcAdjustedMm: etcAdj,
      ctaMm: cta,
      craMm: cra,
      fd,
      rainMm: day.rainMm,
      missing,
    });
    dr = step.drEndMm;
  }

  return out;
}

export interface DaysToCraResult {
  days: number | null;
  method: "simulacao" | "aproximacao";
  note: string;
}

export function estimateDaysToCra(input: {
  drMm: number | null;
  craMm: number | null;
  projected: ProjectionDayResult[];
  etcFallbackMm?: number | null;
}): DaysToCraResult {
  if (input.drMm == null || input.craMm == null) {
    return { days: null, method: "simulacao", note: "Dado ausente: Dr ou CRA" };
  }
  if (input.drMm >= input.craMm) {
    return { days: 0, method: "simulacao", note: "CRA já ultrapassada." };
  }

  let dr = input.drMm;
  for (let i = 0; i < input.projected.length; i += 1) {
    const day = input.projected[i];
    if (day.drEndMm == null) break;
    dr = day.drEndMm;
    const cra = day.craMm ?? input.craMm;
    if (dr >= cra) {
      return {
        days: i + 1,
        method: "simulacao",
        note: `Simulação diária com ETo/Kc/Zr variáveis. CRA atingida em ${i + 1} dia(s).`,
      };
    }
  }

  if (input.etcFallbackMm != null && input.etcFallbackMm > 0) {
    const approx = (input.craMm - input.drMm) / input.etcFallbackMm;
    return {
      days: approx,
      method: "aproximacao",
      note: "Aproximação (CRA − Dr) / ETc — não substitui a simulação quando há previsão variável.",
    };
  }

  return {
    days: null,
    method: "simulacao",
    note: "Horizonte de previsão insuficiente para atingir a CRA.",
  };
}
