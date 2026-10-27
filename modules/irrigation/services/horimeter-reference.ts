export interface HorimeterReferenceInput {
  baseValue: number | null;
  baseDate: string | null;
  eventValue: number | null;
  eventDate: string | null;
}

export interface HorimeterReference {
  value: number | null;
  date: string | null;
  source: "event" | "historical_base" | null;
}

/**
 * Resolve o horímetro inicial do próximo lançamento.
 *
 * A base histórica funciona como piso/âncora oficial. Um evento da plataforma
 * só substitui a base quando for cronologicamente posterior (quando há datas)
 * e seu horímetro final não regredir em relação ao valor histórico.
 */
export function resolveHorimeterReference(
  input: HorimeterReferenceInput,
): HorimeterReference {
  const { baseValue, baseDate, eventValue, eventDate } = input;

  const validEvent =
    eventValue != null &&
    Number.isFinite(eventValue) &&
    (
      baseValue == null ||
      (
        eventValue >= baseValue &&
        (!baseDate || !eventDate || eventDate >= baseDate)
      )
    );

  if (validEvent) {
    return {
      value: eventValue,
      date: eventDate,
      source: "event",
    };
  }

  if (baseValue != null && Number.isFinite(baseValue)) {
    return {
      value: baseValue,
      date: baseDate,
      source: "historical_base",
    };
  }

  return { value: null, date: null, source: null };
}
