/**
 * Guarda pura usada pelo cron Climate V2 antes de qualquer ingestão.
 * Mantida fora de route.ts para permitir teste unitário sem carregar
 * dependências server-only do Next/Supabase.
 */
export function validFarmCoordinate(
  latitude: number | null,
  longitude: number | null,
): boolean {
  return latitude != null && longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

export interface DailySelectionAuditRow {
  date: string;
  operational_approved: boolean;
  reason: string;
}

export interface DailySelectionSummary {
  selections: number;
  approved: number;
  blocked: number;
  blockedDates: Array<{ date: string; reason: string }>;
}

/**
 * Resume o fechamento diário sem esconder exceções. A rota continua retornando
 * sucesso técnico quando processa a fazenda, mas informa quantas datas ficaram
 * bloqueadas pelo gate operacional e por quê.
 */
export function summarizeDailySelections(
  rows: readonly DailySelectionAuditRow[],
  blockedDateLimit = 10,
): DailySelectionSummary {
  const blockedRows = rows.filter((row) => !row.operational_approved);
  const safeLimit = Math.max(0, Math.trunc(blockedDateLimit));

  return {
    selections: rows.length,
    approved: rows.length - blockedRows.length,
    blocked: blockedRows.length,
    blockedDates: blockedRows
      .slice(0, safeLimit)
      .map((row) => ({ date: row.date, reason: row.reason })),
  };
}
