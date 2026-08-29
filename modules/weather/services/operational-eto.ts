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
