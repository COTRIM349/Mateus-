-- Segurança: fixa search_path e reduz exposição RPC de funções SECURITY DEFINER.
-- Os helpers auth_* continuam executáveis por authenticated porque são usados
-- nas próprias políticas RLS.

ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_company_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_farm_ids() SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_user_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_grant_farm_access() SET search_path = public, pg_temp;
ALTER FUNCTION public.attach_default_virtual_weather_providers() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_virtual_weather_station_scope_farm() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_reuse_closed_parcel() SET search_path = public, pg_temp;
ALTER FUNCTION public.require_active_parcel_for_launch() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.auth_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_farm_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_farm_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;

-- Estas funções são acionadas por triggers; não precisam ficar disponíveis via RPC.
REVOKE EXECUTE ON FUNCTION public.auto_grant_farm_access() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
