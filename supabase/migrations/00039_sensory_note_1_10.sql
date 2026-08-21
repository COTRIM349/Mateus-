-- ============================================================================
-- Etapa G — Avaliação sensorial 1–10 (nota bruta, sem % CC automático)
-- ----------------------------------------------------------------------------
-- Aditivo. Sem DROP. Se 00031 já existir, só acrescenta colunas.
-- A nota operacional é inteiro 1–10. Não alimenta o motor de balanço.
-- ============================================================================

CREATE TABLE IF NOT EXISTS soil_sensory_readings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id              UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id             UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  reading_date         DATE NOT NULL,
  moisture_unit        TEXT NOT NULL DEFAULT 'volume'
                       CHECK (moisture_unit IN ('weight','volume')),
  use_in_balance       BOOLEAN NOT NULL DEFAULT false,
  layer_1_note         NUMERIC(2,1)
                       CHECK (layer_1_note IS NULL OR (layer_1_note BETWEEN 1.0 AND 9.0)),
  layer_2_note         NUMERIC(2,1)
                       CHECK (layer_2_note IS NULL OR (layer_2_note BETWEEN 1.0 AND 9.0)),
  layer_3_note         NUMERIC(2,1)
                       CHECK (layer_3_note IS NULL OR (layer_3_note BETWEEN 1.0 AND 9.0)),
  layer_1_moisture_pct NUMERIC(5,2)
                       CHECK (layer_1_moisture_pct IS NULL OR (layer_1_moisture_pct BETWEEN 0 AND 100)),
  layer_2_moisture_pct NUMERIC(5,2)
                       CHECK (layer_2_moisture_pct IS NULL OR (layer_2_moisture_pct BETWEEN 0 AND 100)),
  layer_3_moisture_pct NUMERIC(5,2)
                       CHECK (layer_3_moisture_pct IS NULL OR (layer_3_moisture_pct BETWEEN 0 AND 100)),
  notes                TEXT,
  observed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_id, reading_date)
);

ALTER TABLE soil_sensory_readings ADD COLUMN IF NOT EXISTS note INTEGER
  CHECK (note IS NULL OR (note BETWEEN 1 AND 10));
ALTER TABLE soil_sensory_readings ADD COLUMN IF NOT EXISTS depth_cm DOUBLE PRECISION
  CHECK (depth_cm IS NULL OR (depth_cm > 0 AND depth_cm <= 300));
ALTER TABLE soil_sensory_readings ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;
ALTER TABLE soil_sensory_readings ADD COLUMN IF NOT EXISTS parcel_id UUID
  REFERENCES pivot_crop_assignments(id) ON DELETE SET NULL;

ALTER TABLE soil_sensory_readings ALTER COLUMN use_in_balance SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ssr_farm ON soil_sensory_readings(farm_id);
CREATE INDEX IF NOT EXISTS idx_ssr_pivot ON soil_sensory_readings(pivot_id);
CREATE INDEX IF NOT EXISTS idx_ssr_date ON soil_sensory_readings(reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_ssr_parcel ON soil_sensory_readings(parcel_id);
CREATE INDEX IF NOT EXISTS idx_ssr_observed ON soil_sensory_readings(observed_at DESC);

COMMENT ON TABLE soil_sensory_readings IS
  'Avaliação sensorial de campo. Nota operacional 1–10. Não converte para % da CC e não substitui o ARM.';
COMMENT ON COLUMN soil_sensory_readings.note IS
  'Nota sensorial operacional 1–10. Subjetiva. NÃO converter automaticamente para % da CC.';
COMMENT ON COLUMN soil_sensory_readings.depth_cm IS
  'Profundidade avaliada (cm).';
COMMENT ON COLUMN soil_sensory_readings.observed_at IS
  'Data e hora da avaliação de campo.';
COMMENT ON COLUMN soil_sensory_readings.parcel_id IS
  'Parcela (ciclo) ativa no momento da leitura. NULL em registros legados.';
COMMENT ON COLUMN soil_sensory_readings.use_in_balance IS
  'Etapa G: default false. A nota não substitui o ARM calculado.';
COMMENT ON COLUMN soil_sensory_readings.layer_1_moisture_pct IS
  'Legado. Não gravar conversão automática nota→%CC na Etapa G.';
COMMENT ON COLUMN soil_sensory_readings.layer_2_moisture_pct IS
  'Legado. Não gravar conversão automática nota→%CC na Etapa G.';
COMMENT ON COLUMN soil_sensory_readings.layer_3_moisture_pct IS
  'Legado. Não gravar conversão automática nota→%CC na Etapa G.';

ALTER TABLE soil_sensory_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_access_soil_sensory_readings ON soil_sensory_readings;
CREATE POLICY farm_access_soil_sensory_readings ON soil_sensory_readings
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));
