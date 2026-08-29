-- Fechamento climático diário — campos necessários para auditoria da ETo FAO-56.
-- Mantém UR média por compatibilidade e adiciona extremos diários usados
-- preferencialmente no cálculo de pressão real de vapor.

ALTER TABLE weather_readings
  ADD COLUMN IF NOT EXISTS humidity_min DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS humidity_max DOUBLE PRECISION;

ALTER TABLE weather_forecasts
  ADD COLUMN IF NOT EXISTS humidity_min DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS humidity_max DOUBLE PRECISION;

COMMENT ON COLUMN weather_readings.humidity_min IS
  'Umidade relativa mínima diária (%), usada preferencialmente na ETo FAO-56.';
COMMENT ON COLUMN weather_readings.humidity_max IS
  'Umidade relativa máxima diária (%), usada preferencialmente na ETo FAO-56.';
COMMENT ON COLUMN weather_forecasts.humidity_min IS
  'Umidade relativa mínima prevista no dia (%).';
COMMENT ON COLUMN weather_forecasts.humidity_max IS
  'Umidade relativa máxima prevista no dia (%).';
