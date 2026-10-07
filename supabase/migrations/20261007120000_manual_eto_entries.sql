-- =============================================================================
-- Lancamento MANUAL de ETo (modo "por clima" sem API).
-- Espelha manual_rainfall_entries: um valor por fazenda/dia.
-- A tela lanca a ETo MEDIA da semana replicando o valor nos 7 dias (seg..dom);
-- o motor hidrico (use-farm-hydric-state-v2) usa esta ETo e, quando nao ha
-- selecao climatica aprovada, CRIA o dia a partir dela (unica fonte de ETo no
-- modo manual). Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.manual_eto_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  eto_mm     DOUBLE PRECISION NOT NULL CHECK (eto_mm > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id, date)
);

CREATE INDEX IF NOT EXISTS idx_manual_eto_entries_farm_date
  ON public.manual_eto_entries(farm_id, date DESC);

ALTER TABLE public.manual_eto_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_access_manual_eto" ON public.manual_eto_entries;
CREATE POLICY "farm_access_manual_eto" ON public.manual_eto_entries
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

REVOKE ALL ON public.manual_eto_entries FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.manual_eto_entries FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_eto_entries TO authenticated;
