-- Modo de validação climática.
-- 1. Distingue estimativa de modelo de observação física.
-- 2. Exige aprovação humana explícita antes do uso operacional diário.

ALTER TABLE weather_readings
  DROP CONSTRAINT IF EXISTS weather_readings_data_kind_check;

ALTER TABLE weather_readings
  ADD CONSTRAINT weather_readings_data_kind_check
    CHECK (data_kind IN ('observed', 'manual', 'model_estimate', 'historical_grid'));

UPDATE weather_readings
SET data_kind = 'model_estimate'
WHERE origin IN ('open_meteo', 'meteoblue')
  AND data_kind = 'observed';

ALTER TABLE weather_daily_selection
  ADD COLUMN IF NOT EXISTS operational_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_note TEXT;

COMMENT ON COLUMN weather_daily_selection.operational_approved IS
  'Aprovação humana explícita para liberar a leitura diária ao balanço hídrico e à programação.';
