-- A função é interna ao trigger de pivôs e não deve ficar exposta como RPC.
-- Mantemos SECURITY DEFINER para o trigger criar/atualizar o registro físico
-- mesmo quando a operação do usuário está limitada pelas policies de solo.

ALTER FUNCTION public.ensure_pivot_soil_registry()
  SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.ensure_pivot_soil_registry()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.ensure_pivot_soil_registry() IS
  'Função interna de trigger: mantém o cadastro físico 1:1 do solo ao criar ou mover um pivô. Não é RPC pública.';
