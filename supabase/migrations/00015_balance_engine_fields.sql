-- ============================================================================
-- 00015 — Motor central do balanço hídrico (Fase 3)
-- Persiste os resultados do motor por pivô/dia. Campos aditivos e opcionais;
-- o histórico existente permanece válido.
-- ============================================================================

ALTER TABLE water_balances
  ADD COLUMN IF NOT EXISTS dae                   INTEGER,
  ADD COLUMN IF NOT EXISTS phase                 TEXT,
  ADD COLUMN IF NOT EXISTS effective_irrigation  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depletion             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS should_irrigate       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recommendation_reason TEXT,
  ADD COLUMN IF NOT EXISTS hydric_status         TEXT
    CHECK (hydric_status IS NULL OR hydric_status IN ('verde','amarelo','vermelho','cinza'));

CREATE INDEX IF NOT EXISTS idx_wb_hydric_status ON water_balances(hydric_status);

COMMENT ON COLUMN water_balances.dae IS 'Dias após emergência/plantio no dia do balanço.';
COMMENT ON COLUMN water_balances.hydric_status IS 'Status hídrico do motor: verde (<70% AFD), amarelo (70–100% AFD), vermelho (>AFD), cinza (sem dados).';
COMMENT ON COLUMN water_balances.cad IS 'ADT — Água Disponível Total (mm).';
