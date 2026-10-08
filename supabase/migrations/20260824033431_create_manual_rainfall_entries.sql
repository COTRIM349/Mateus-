-- =============================================================================
-- Cria a tabela manual_rainfall_entries (chuva manual por fazenda/dia).
-- No banco original ela foi criada fora das migrations rastreadas; esta migration
-- repoe o CREATE para que um banco NOVO (app separado) tenha a tabela antes da
-- migration de grants (20260824033432) que a referencia.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.manual_rainfall_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  precipitation_mm DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (precipitation_mm >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id, date)
);

CREATE INDEX IF NOT EXISTS idx_manual_rainfall_entries_farm_date
  ON public.manual_rainfall_entries(farm_id, date DESC);

ALTER TABLE public.manual_rainfall_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_access_manual_rainfall" ON public.manual_rainfall_entries;
CREATE POLICY "farm_access_manual_rainfall" ON public.manual_rainfall_entries
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));
