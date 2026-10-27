-- ============================================================================
-- Evento real de irrigação — percentímetro operacional
-- ----------------------------------------------------------------------------
-- O operador informa o percentímetro (%) e a plataforma deriva a lâmina bruta
-- usando a lâmina a 100% da ficha técnica do pivô:
--   lâmina = lâmina_100 × 100 / percentímetro
-- ============================================================================

ALTER TABLE public.irrigation_events
  ADD COLUMN IF NOT EXISTS percentimeter_pct DOUBLE PRECISION
  CHECK (
    percentimeter_pct IS NULL
    OR (percentimeter_pct > 0 AND percentimeter_pct <= 100)
  );

COMMENT ON COLUMN public.irrigation_events.percentimeter_pct IS
  'Percentímetro (%) usado no evento. A lâmina bruta é derivada da lâmina a 100% da ficha técnica do pivô.';
