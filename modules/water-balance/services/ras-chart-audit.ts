/**
 * Auditoria de coerência: compara as séries plotadas com o motor diário.
 * Não substitui aferição de umidade no campo, sensores, ou validação do cadastro.
 */
import type { DailyBalanceRow } from "./water-balance.service";
import type { RasPoint } from "./ras-panel-model";
import type { RasDisplayPoint, RasDisplayUnit } from "./ras-display-modes";

export interface RasAuditIssue {
  date: string;
  field: string;
  detail: string;
}

export interface RasAuditReport {
  checkedDays: number;
  issues: RasAuditIssue[];
  passed: boolean;
}

const close = (a: number, b: number, tolerance = .12) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;

export function auditRasGraph(
  rows: DailyBalanceRow[],
  points: RasPoint[],
  displayed: RasDisplayPoint[] | null,
  unit: RasDisplayUnit,
): RasAuditReport {
  const issues: RasAuditIssue[] = [];
  const add = (date: string, field: string, detail: string) => issues.push({ date, field, detail });
  if (rows.length !== points.length)
    add("Série", "Dias", "Existem dias do balanço sem ponto válido no gráfico; confira CC, PMP e raiz.");
  if (displayed === null) {
    add("Perfil", "Densidade", "A conversão em % em peso não está disponível para todas as camadas radiculares.");
  } else if (displayed.length !== points.length) {
    add("Série", "Pontos", "A quantidade de pontos desenhados não coincide com o balanço.");
  }
  const byDate = new Map(rows.map(r => [r.date, r]));
  const seen = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    const p = points[i], d = displayed?.[i];
    const r = byDate.get(p.date);
    if (!r) { add(p.date, "Data", "A data plotada não existe na série do motor."); continue; }
    if (seen.has(p.date) || (i > 0 && p.date <= points[i-1].date))
      add(p.date, "Data", "Data repetida ou fora da ordem cronológica.");
    seen.add(p.date);
    if (!Number.isFinite(r.cad) || r.cad <= 0 || !Number.isFinite(r.afd) || r.afd <= 0 || r.afd > r.cad)
      add(p.date, "CAD/AFD", "CAD ou AFD está fora dos limites físicos do solo.");
    if (!Number.isFinite(r.storedWater) || r.storedWater < -.12 || r.storedWater > r.cad + .12)
      add(p.date, "ARM", "ARM fora do intervalo entre zero e CAD.");
    if (!close(p.ctaMm, r.cad) || !close(p.afdMm, r.afd) || !close(p.armMm, r.storedWater))
      add(p.date, "Reservatório", "ARM, CAD ou AFD plotado não corresponde ao resultado do motor.");
    if (!close(p.rootDepth, r.rootDepth, .001))
      add(p.date, "Raiz", "Profundidade radicular do gráfico difere do balanço.");
    const pmpPercentCc = 100 * p.wiltingPoint / p.fieldCapacity;
    const expectedPercentCc = pmpPercentCc + (100-pmpPercentCc) * (p.armMm/p.ctaMm);
    const expectedSafetyCc = pmpPercentCc + (100-pmpPercentCc) * (1-p.afdMm/p.ctaMm);
    if (!close(p.pmpPercentCc, pmpPercentCc, .16)
      || !close(p.ccPercent, expectedPercentCc, .16)
      || !close(p.limitPercentCc, expectedSafetyCc, .16))
      add(p.date, "%CC", "PMP, umidade ou limite em % da CC diverge da conversão volumétrica.");
    if (r.ks != null && r.etcPotential != null) {
      if (!close(r.etcPotential, r.et0 * r.kc, .06))
        add(p.date, "ETc potencial", "O valor deve ser ETo × Kc, sem Kl.");
      if (!close(r.etc, r.etcPotential * r.ks, .07))
        add(p.date, "ETc real", "A ETc real deve ser ETc potencial × Ks.");
    }
    const precip = r.precipitation ?? 0, irri = r.irrigationApplied ?? 0;
    if (!close(p.rainRecordedMm, Math.max(0, precip))
      || !close(p.rainEffectiveMm, Math.max(0, r.effectivePrecipitation ?? 0))
      || !close(p.irrigationAppliedMm, Math.max(0, irri))
      || !close(p.irrigationEffectiveMm, Math.max(0, r.effectiveIrrigation ?? 0))
      || !close(p.et0, r.et0, .01))
      add(p.date, "Eventos", "Chuva, irrigação ou ETo não coincide com o balanço.");
    if (p.rainEffectiveMm > p.rainRecordedMm + .12 ||
        p.irrigationEffectiveMm > p.irrigationAppliedMm + .12)
      add(p.date, "Lâminas", "Água efetiva superior à lâmina registrada.");
    if (i > 0) {
      const prev = points[i-1];
      const armStart = Math.round(prev.armMm * (p.ctaMm / prev.ctaMm) * 100) / 100;
      const balance = Math.max(0, Math.min(p.ctaMm, armStart + p.rainRecordedMm + p.irrigationEffectiveMm - r.etc));
      if (!close(p.armMm, balance, .16))
        add(p.date, "Balanço diário", "ARM diverge de ARM inicial reajustado + chuva + irrigação efetiva − ETc.");
    }
    if (d) {
      if (d.date !== p.date)
        add(p.date, "Gráfico", "Data dos valores desenhados difere da série calculada.");
      if (![d.current, d.capacity, d.safety, d.pmp].every(Number.isFinite)
        || d.current < d.pmp - .15 || d.current > d.capacity + .15
        || d.safety < d.pmp - .15 || d.safety > d.capacity + .15)
        add(p.date, "Escala", "Valores fora dos limites da unidade selecionada.");
      if (unit === "mm") {
        if (!close(d.current,p.armMm) || !close(d.capacity,p.ctaMm)
          || !close(d.safety,p.ctaMm-p.afdMm) || !close(d.pmp,0))
          add(p.date, "Água disponível", "ARM, CAD, limite ou PMP em mm divergem do motor.");
      } else if (unit === "cc") {
        if (!close(d.current,p.ccPercent) || !close(d.capacity,100)
          || !close(d.safety,p.limitPercentCc) || !close(d.pmp,p.pmpPercentCc))
          add(p.date, "%CC desenhado", "Uma das linhas em %CC não corresponde à conversão do solo.");
      }
    }
  }
  return { checkedDays: points.length, issues, passed: issues.length === 0 };
}
