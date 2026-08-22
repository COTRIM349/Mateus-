import { parcelManagedAreaHa } from "./parcel-geometry";

export interface OperationalSeason {
  id: string;
  name: string;
  startDate: string;
  active: boolean;
}

export interface OperationalPivot {
  id: string;
  name: string;
  areaHa: number;
  active: boolean;
}

export interface OperationalParcel {
  id: string;
  name: string | null;
  pivotId: string;
  seasonId: string;
  cultureId: string | null;
  cultureName: string | null;
  soilId: string | null;
  plantingDate: string | null;
  plantedAreaHa: number | null;
  startAngleDeg: number | null;
  endAngleDeg: number | null;
  status: string | null;
  active: boolean | null;
}

export type OperationalModelGapCode =
  | "no_active_season"
  | "multiple_active_seasons"
  | "no_active_pivots"
  | "pivot_without_parcel"
  | "parcel_without_culture"
  | "parcel_without_soil"
  | "parcel_without_planting_date"
  | "parcel_without_area";

export interface OperationalModelGap {
  code: OperationalModelGapCode;
  message: string;
  pivotId: string | null;
  parcelId: string | null;
  blocking: boolean;
}

export interface OperationalModelRow {
  pivotId: string;
  pivotName: string;
  pivotAreaHa: number;
  parcelId: string | null;
  parcelName: string | null;
  cultureName: string | null;
  plantingDate: string | null;
  managedAreaHa: number | null;
  complete: boolean;
}

export interface OperationalModelAssessment {
  season: OperationalSeason | null;
  isComplete: boolean;
  coveragePct: number;
  coveredPivots: number;
  totalPivots: number;
  totalManagedAreaHa: number;
  gaps: OperationalModelGap[];
  rows: OperationalModelRow[];
}

/** A safra operacional é a safra ativa mais recente da fazenda. */
export function selectOperationalSeason(
  seasons: OperationalSeason[],
): { season: OperationalSeason | null; activeCount: number } {
  const active = seasons
    .filter((season) => season.active)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return { season: active[0] ?? null, activeCount: active.length };
}

function activeParcel(parcel: OperationalParcel): boolean {
  return parcel.status === "ativa" || (parcel.status == null && parcel.active !== false);
}

export function assessOperationalModel(input: {
  seasons: OperationalSeason[];
  pivots: OperationalPivot[];
  parcels: OperationalParcel[];
}): OperationalModelAssessment {
  const { season, activeCount } = selectOperationalSeason(input.seasons);
  const pivots = input.pivots.filter((pivot) => pivot.active);
  const gaps: OperationalModelGap[] = [];

  if (!season) {
    gaps.push({
      code: "no_active_season",
      message: "Defina uma safra ativa para organizar a operação da fazenda.",
      pivotId: null,
      parcelId: null,
      blocking: true,
    });
  } else if (activeCount > 1) {
    gaps.push({
      code: "multiple_active_seasons",
      message: `${activeCount} safras estão ativas. A safra mais recente foi usada; encerre as demais.`,
      pivotId: null,
      parcelId: null,
      blocking: true,
    });
  }

  if (pivots.length === 0) {
    gaps.push({
      code: "no_active_pivots",
      message: "Cadastre ao menos um pivô ativo para montar o modelo operacional.",
      pivotId: null,
      parcelId: null,
      blocking: true,
    });
  }

  const parcelsByPivot = new Map<string, OperationalParcel>();
  if (season) {
    for (const parcel of input.parcels) {
      if (parcel.seasonId === season.id && activeParcel(parcel)) {
        parcelsByPivot.set(parcel.pivotId, parcel);
      }
    }
  }

  const rows = pivots.map<OperationalModelRow>((pivot) => {
    const parcel = parcelsByPivot.get(pivot.id) ?? null;
    if (!parcel) {
      gaps.push({
        code: "pivot_without_parcel",
        message: `${pivot.name} não possui parcela ativa na safra operacional.`,
        pivotId: pivot.id,
        parcelId: null,
        blocking: true,
      });
      return {
        pivotId: pivot.id,
        pivotName: pivot.name,
        pivotAreaHa: pivot.areaHa,
        parcelId: null,
        parcelName: null,
        cultureName: null,
        plantingDate: null,
        managedAreaHa: null,
        complete: false,
      };
    }

    const managedAreaHa = parcelManagedAreaHa(
      pivot.areaHa,
      parcel.plantedAreaHa,
      parcel.startAngleDeg,
      parcel.endAngleDeg,
    );
    const parcelGaps: OperationalModelGap[] = [];
    if (!parcel.cultureId) {
      parcelGaps.push({
        code: "parcel_without_culture",
        message: `${parcel.name || pivot.name} está sem cultura.`,
        pivotId: pivot.id,
        parcelId: parcel.id,
        blocking: true,
      });
    }
    if (!parcel.soilId) {
      parcelGaps.push({
        code: "parcel_without_soil",
        message: `${parcel.name || pivot.name} está sem solo.`,
        pivotId: pivot.id,
        parcelId: parcel.id,
        blocking: true,
      });
    }
    if (!parcel.plantingDate) {
      parcelGaps.push({
        code: "parcel_without_planting_date",
        message: `${parcel.name || pivot.name} está sem data de plantio.`,
        pivotId: pivot.id,
        parcelId: parcel.id,
        blocking: true,
      });
    }
    if (managedAreaHa <= 0) {
      parcelGaps.push({
        code: "parcel_without_area",
        message: `${parcel.name || pivot.name} está sem área de manejo válida.`,
        pivotId: pivot.id,
        parcelId: parcel.id,
        blocking: true,
      });
    }
    gaps.push(...parcelGaps);

    return {
      pivotId: pivot.id,
      pivotName: pivot.name,
      pivotAreaHa: pivot.areaHa,
      parcelId: parcel.id,
      parcelName: parcel.name,
      cultureName: parcel.cultureName,
      plantingDate: parcel.plantingDate,
      managedAreaHa,
      complete: parcelGaps.length === 0,
    };
  });

  const coveredPivots = rows.filter((row) => row.parcelId != null).length;
  const totalManagedAreaHa = rows.reduce(
    (total, row) => total + (row.managedAreaHa ?? 0),
    0,
  );

  return {
    season,
    isComplete:
      season != null &&
      pivots.length > 0 &&
      gaps.every((gap) => !gap.blocking),
    coveragePct:
      pivots.length === 0 ? 0 : Math.round((coveredPivots / pivots.length) * 100),
    coveredPivots,
    totalPivots: pivots.length,
    totalManagedAreaHa,
    gaps,
    rows,
  };
}
