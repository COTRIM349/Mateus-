export interface ActiveParcelPivotLink {
  pivot_id: string | null;
  active: boolean | null;
  status: string | null;
}

/**
 * Filtra a lista operacional do balanço hídrico. Aceita status null apenas para
 * ciclos legados que ainda estejam explicitamente ativos.
 */
export function activeParcelPivotIds(
  assignments: readonly ActiveParcelPivotLink[],
): Set<string> {
  return new Set(
    assignments
      .filter((assignment) => (
        typeof assignment.pivot_id === "string"
        && assignment.pivot_id.length > 0
        && assignment.active === true
        && (assignment.status == null || assignment.status === "ativa")
      ))
      .map((assignment) => assignment.pivot_id as string),
  );
}

export function filterPivotsWithActiveParcel<T extends { id: string }>(
  pivots: readonly T[],
  assignments: readonly ActiveParcelPivotLink[],
): T[] {
  const eligibleIds = activeParcelPivotIds(assignments);
  return pivots.filter((pivot) => eligibleIds.has(pivot.id));
}
