/**
 * Escala secundária dos eventos diários no gráfico RAS.
 * Não converte água no solo (ARM/CAD), nem altera o balanço hídrico.
 * 0 mm fica na base das barras; o topo se ajusta à lâmina registrada
 * para manter a leitura visível e preservar os valores reais.
 */
import type { RasPoint } from "./ras-panel-model";

type DailyEvent = Pick<RasPoint, "rainEffectiveMm" | "irrigationAppliedMm" | "et0">;
type EventVisibility = { chuva: boolean; irrigacao: boolean; eto: boolean };

export function rasEventAxisCeiling(points: DailyEvent[], visible: EventVisibility): number {
  let maxEvent = 0;
  for (const point of points) {
    const values = [
      visible.chuva ? point.rainEffectiveMm : 0,
      visible.irrigacao ? point.irrigationAppliedMm : 0,
      visible.eto ? point.et0 : 0,
    ];
    for (const value of values) if (Number.isFinite(value)) maxEvent = Math.max(maxEvent, value);
  }
  const target = Math.max(2, maxEvent * 1.05);
  const base = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 2.5, 4, 5, 6, 8, 10].find((step) => step * base >= target) ?? 10) * base;
}

/** mm em eixo direito independente, começando no zero do plano principal. */
export function rasEventVerticalPosition(mm: number, axisMax: number, top: number, height: number): number {
  const valid = Number.isFinite(mm) ? mm : 0;
  const fraction = Number.isFinite(axisMax) && axisMax > 0
    ? Math.min(1, Math.max(0, valid / axisMax))
    : 0;
  return top + height * (1 - fraction);
}
