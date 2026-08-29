/**
 * ETo usada pelo balanço hídrico e programação operacional.
 * Prioriza o cálculo Cotrim (PM FAO-56); fallback à fonte externa.
 */
export function operationalEtoMm(reading: {
  et0_calculated?: number | null;
  et0_source?: number | null;
}): number | null {
  const calculated = reading.et0_calculated;
  if (calculated != null && Number.isFinite(calculated)) return calculated;
  const source = reading.et0_source;
  if (source != null && Number.isFinite(source)) return source;
  return null;
}

export const AUTO_APPROVAL_NOTE = "aprovação automática na resolução da fonte";

export function autoApprovalFieldsForReading(
  reading: { et0_calculated?: number | null; et0_source?: number | null } | null | undefined,
): {
  operational_approved: boolean;
  approved_at: string | null;
  approved_by: null;
  approval_note: string | null;
} {
  if (!reading || operationalEtoMm(reading) == null) {
    return {
      operational_approved: false,
      approved_at: null,
      approved_by: null,
      approval_note: null,
    };
  }
  return {
    operational_approved: true,
    approved_at: new Date().toISOString(),
    approved_by: null,
    approval_note: AUTO_APPROVAL_NOTE,
  };
}
