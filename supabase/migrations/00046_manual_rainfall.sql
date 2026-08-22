-- ============================================================================
-- Lançamento de Chuva Manual (ground truth de precipitação)
-- ----------------------------------------------------------------------------
-- Quando a estação falha ou o pluviômetro de campo é a referência, o operador
-- registra chuva por fazenda/data. Com use_in_balance=true, a precipitação
-- sobrescreve a chuva da leitura climática aprovada no motor do balanço.
-- Não inventa ETo — só a lâmina de chuva bruta (mm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS manual_rainfall (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id            UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  reading_date       DATE NOT NULL,
  precipitation_mm   DOUBLE PRECISION NOT NULL
                     CHECK (precipitation_mm >= 0 AND precipitation_mm <= 500),
  -- Se true, o motor do balanço usa esta chuva no lugar da estação/provedor.
  use_in_balance     BOOLEAN NOT NULL DEFAULT true,
  notes              TEXT,
  observed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (farm_id, reading_date)
);

COMMENT ON TABLE manual_rainfall IS
  'Chuva medida em pluviômetro ou observada em campo. Ground truth de precipitação por fazenda/data; não substitui ETo.';

COMMENT ON COLUMN manual_rainfall.precipitation_mm IS
  'Chuva bruta do dia (mm). Pe USDA-SCS é calculada no motor a partir deste valor.';

COMMENT ON COLUMN manual_rainfall.use_in_balance IS
  'Se true, sobrescreve a precipitação da leitura climática aprovada no balanço hídrico.';

CREATE INDEX IF NOT EXISTS idx_manual_rainfall_farm_date
  ON manual_rainfall(farm_id, reading_date DESC);

CREATE INDEX IF NOT EXISTS idx_manual_rainfall_balance
  ON manual_rainfall(farm_id, reading_date)
  WHERE use_in_balance = true;

ALTER TABLE manual_rainfall ENABLE ROW LEVEL SECURITY;

CREATE POLICY farm_access_manual_rainfall ON manual_rainfall
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- ── Fim ────────────────────────────────────────────────────────────────────
