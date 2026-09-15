-- Gate 0 / v2.0: protege as tabelas fenológicas globais expostas pela Data API.
-- Usuários autenticados podem consultar os parâmetros; somente administradores
-- podem criar, alterar ou excluir marcadores e alvos de cultivar.

ALTER TABLE public.culture_phenology_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culture_variety_phenology_targets ENABLE ROW LEVEL SECURITY;

-- Remove privilégios amplos herdados das migrations históricas. Em especial,
-- anon não deve consultar nem modificar o cadastro agronômico interno.
REVOKE ALL ON TABLE public.culture_phenology_markers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.culture_variety_phenology_targets FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.culture_phenology_markers
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.culture_variety_phenology_targets
  TO authenticated;

DROP POLICY IF EXISTS authenticated_read_culture_phenology_markers
  ON public.culture_phenology_markers;
CREATE POLICY authenticated_read_culture_phenology_markers
  ON public.culture_phenology_markers
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS admins_manage_culture_phenology_markers
  ON public.culture_phenology_markers;
CREATE POLICY admins_manage_culture_phenology_markers
  ON public.culture_phenology_markers
  FOR ALL
  TO authenticated
  USING ((SELECT public.auth_user_role()) = 'admin')
  WITH CHECK ((SELECT public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS authenticated_read_culture_variety_phenology_targets
  ON public.culture_variety_phenology_targets;
CREATE POLICY authenticated_read_culture_variety_phenology_targets
  ON public.culture_variety_phenology_targets
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS admins_manage_culture_variety_phenology_targets
  ON public.culture_variety_phenology_targets;
CREATE POLICY admins_manage_culture_variety_phenology_targets
  ON public.culture_variety_phenology_targets
  FOR ALL
  TO authenticated
  USING ((SELECT public.auth_user_role()) = 'admin')
  WITH CHECK ((SELECT public.auth_user_role()) = 'admin');
