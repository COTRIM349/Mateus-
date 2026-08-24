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
