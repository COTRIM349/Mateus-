-- ============================================================================
-- Sprint 5.2+ — Fonte secundária WeatherAPI.com
-- ----------------------------------------------------------------------------
-- Habilita 'weather_api' no enum data_source e adiciona colunas para dados
-- que a WeatherAPI fornece e o Open-Meteo não (pressão, condição). Também
-- permite solar_radiation NULL — a WeatherAPI free não fornece Rs.
--
-- REGRAS (por decisão do usuário — não são impostas pelo schema, mas
-- documentadas para o serviço respeitar):
--   • Pressão só é gravada quando o provedor fornece.
--   • Pressão NÃO é usada em cálculo de ETo (Cotrim continua derivando
--     pressão da altitude via FAO-56 eq. 7).
--   • ETo NÃO é gravada nem calculada para leituras WeatherAPI.
--   • Cada leitura pertence a um único provider (rastreado por `origin`).
-- Idempotente.
-- ============================================================================

-- 1) Enum data_source aceita 'weather_api'
ALTER TABLE weather_stations
  DROP CONSTRAINT IF EXISTS weather_stations_data_source_check;

ALTER TABLE weather_stations
  ADD CONSTRAINT weather_stations_data_source_check
    CHECK (data_source IN (
      'manual',
      'open_meteo',
      'weather_api',
      'br_dwgd',
      'api_inmet',
      'api_nasa_power',
      'davis_link',
      'campo_station',
      'outro'
    ));

-- 2) Colunas para pressão atmosférica, sua origem e descrição textual
ALTER TABLE weather_readings
  ADD COLUMN IF NOT EXISTS atmospheric_pressure_hpa DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pressure_origin          TEXT,
  ADD COLUMN IF NOT EXISTS condition_text           TEXT;

COMMENT ON COLUMN weather_readings.atmospheric_pressure_hpa IS
  'Pressão atmosférica em hPa fornecida pelo provedor. NULL quando o provedor não mede. NÃO é usada no cálculo de ETo Cotrim — a pressão para Penman-Monteith continua sendo derivada da altitude (FAO-56 eq. 7). Uso: comparação e auditoria.';

COMMENT ON COLUMN weather_readings.pressure_origin IS
  'Provedor que forneceu a pressão (open_meteo, weather_api, manual). NULL quando não fornecida. Redundante com `origin` por design — permite rastreio explícito.';

COMMENT ON COLUMN weather_readings.condition_text IS
  'Descrição textual do tempo (ex.: "Sunny", "Partly cloudy"). Apenas informativo — nunca usado em cálculo.';

-- 3) solar_radiation passa a aceitar NULL — WeatherAPI free não fornece Rs.
--    Nenhum dado existente é alterado; consumidores devem tratar NULL.
ALTER TABLE weather_readings
  ALTER COLUMN solar_radiation DROP NOT NULL;

COMMENT ON COLUMN weather_readings.solar_radiation IS
  'Radiação solar acumulada diária (MJ/m²/dia). NULL quando o provedor não fornece (ex.: WeatherAPI free). Consumidores devem tratar NULL antes de usar em cálculos.';

-- 4) Índice adicional para busca por origem × data (comparações WeatherAPI × Open-Meteo)
CREATE INDEX IF NOT EXISTS idx_weather_readings_origin_date
  ON weather_readings(origin, date DESC);
