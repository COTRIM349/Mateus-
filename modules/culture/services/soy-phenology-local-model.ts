import type { PhenologyChartMarker } from "./phenology-chart-markers";

/**
 * Modelo fenológico local da soja usado SOMENTE para posicionar o estádio.
 *
 * Regras trazidas da planilha "fenologia plataforma.xlsx":
 * - VE = 0 DAE;
 * - VC = 3 DAE;
 * - emissão de nós pelo plastocrono (Tb = 10 °C);
 * - plastocrono 64,1 °C.d/nó para hábito indeterminado;
 * - plastocrono 59,7 °C.d/nó para determinado/semideterminado;
 * - temperatura média mensal da estação Karitel;
 * - R1 ≈ 40% do ciclo emergência→R8;
 * - R2...R8 escalados pela fração acumulada R1→R8 de Fehr & Caviness
 *   adotada na planilha.
 *
 * Observação de campo é tratada fora deste serviço e sempre tem precedência.
 * Marcadores calibrados da aba Fenologia substituem o valor calculado.
 */

export interface SoyLocalPhenologyInput {
  emergenceDate: string | null | undefined;
  planningOccupancyDays: number | null | undefined;
  growthHabit: string | null | undefined;
  registeredMarkers?: PhenologyChartMarker[];
}

const TB_C = 10;
const PLASTOCHRON_INDETERMINATE = 64.1;
const PLASTOCHRON_DETERMINATE = 59.7;
const PLANTING_TO_EMERGENCE_DAYS = 6;
const R8_TO_HARVEST_DAYS = 7;
const VC_DAE = 3;

const MONTHLY_TMEAN_C: Record<number, number> = {
  1: 25.1,
  2: 23.9,
  3: 24.3,
  4: 23.9,
  5: 23.0,
  6: 21.9,
  7: 20.8,
  8: 22.8,
  9: 25.0,
  10: 25.9,
  11: 24.1,
  12: 24.2,
};

const REPRODUCTIVE_FRACTION_FROM_R1_TO_R8: Record<string, number> = {
  R1: 0,
  R2: 0.0410958904109589,
  R3: 0.1780821917808219,
  R4: 0.3013698630136986,
  R5: 0.4246575342465753,
  R6: 0.6301369863013698,
  R7: 0.8767123287671232,
  R8: 1,
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const normalize = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function emergenceMonth(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const month = Number(iso.slice(5, 7));
  return month >= 1 && month <= 12 ? month : null;
}

function plastochronForHabit(habit: string | null | undefined): number {
  const normalized = normalize(habit);
  if (normalized.includes("semi") || (normalized.includes("determin") && !normalized.includes("indetermin"))) {
    return PLASTOCHRON_DETERMINATE;
  }
  if (normalized.includes("indetermin")) return PLASTOCHRON_INDETERMINATE;
  // Sem confirmação, usa a alternativa conservadora da planilha: emissão um
  // pouco mais rápida, evitando manter a cultura artificialmente em V baixo.
  return PLASTOCHRON_DETERMINATE;
}

function calibratedByCode(markers: PhenologyChartMarker[] | undefined) {
  return new Map(
    (markers ?? [])
      .filter((marker) => marker.origin === "calibrado" && Number.isFinite(marker.dae))
      .map((marker) => [marker.code.trim().toUpperCase(), marker] as const),
  );
}

export function buildSoyLocalPhenologyMarkers(
  input: SoyLocalPhenologyInput,
): PhenologyChartMarker[] {
  const month = emergenceMonth(input.emergenceDate);
  const occupancy = Number(input.planningOccupancyDays);
  if (month == null || !Number.isFinite(occupancy) || occupancy <= PLANTING_TO_EMERGENCE_DAYS + R8_TO_HARVEST_DAYS) {
    return [];
  }

  const r8 = Math.max(
    1,
    Math.round(occupancy - PLANTING_TO_EMERGENCE_DAYS - R8_TO_HARVEST_DAYS),
  );
  const r1 = Math.max(VC_DAE + 1, Math.round(r8 * 0.4));
  const tmean = MONTHLY_TMEAN_C[month];
  const thermalRate = Math.max(0.1, tmean - TB_C);
  const daysPerNode = plastochronForHabit(input.growthHabit) / thermalRate;

  const markers: PhenologyChartMarker[] = [
    { code: "VE", label: "Emergência", dae: 0, origin: "esperado", confidence: "media" },
    { code: "VC", label: "Cotilédones desenvolvidos", dae: VC_DAE, origin: "esperado", confidence: "media" },
  ];

  // V1...Vn: o número do nó avança pelo plastocrono até R1.
  for (let node = 1; node <= 30; node++) {
    const dae = round1(VC_DAE + node * daysPerNode);
    if (dae >= r1) break;
    markers.push({
      code: `V${node}`,
      label: node === 1 ? "Primeiro nó" : `${node}º nó`,
      dae,
      origin: "esperado",
      confidence: "media",
    });
  }

  for (const [code, fraction] of Object.entries(REPRODUCTIVE_FRACTION_FROM_R1_TO_R8)) {
    const dae = Math.round(r1 + fraction * (r8 - r1));
    markers.push({
      code,
      label: code,
      dae,
      origin: "esperado",
      confidence: "media",
    });
  }

  // A calibração local cadastrada na aba Fenologia prevalece sobre o modelo.
  const calibrated = calibratedByCode(input.registeredMarkers);
  const byCode = new Map(markers.map((marker) => [marker.code, marker]));
  for (const [code, marker] of calibrated) byCode.set(code, marker);

  return Array.from(byCode.values())
    .filter((marker) => Number.isFinite(marker.dae) && marker.dae >= 0)
    .sort((a, b) => a.dae - b.dae || a.code.localeCompare(b.code));
}

export function resolveSoyLocalPhenologyStage(
  currentDae: number | null | undefined,
  input: SoyLocalPhenologyInput,
): PhenologyChartMarker | null {
  if (currentDae == null || !Number.isFinite(currentDae)) return null;
  const dae = Math.max(0, currentDae);
  return [...buildSoyLocalPhenologyMarkers(input)]
    .filter((marker) => marker.dae <= dae)
    .sort((a, b) => a.dae - b.dae)
    .at(-1) ?? null;
}
