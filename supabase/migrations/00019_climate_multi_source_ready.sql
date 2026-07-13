-- ============================================================================
-- Sprint 5.1 (addendum) — Prepara arquitetura climática para múltiplas fontes
-- ----------------------------------------------------------------------------
-- Adiciona proativamente 'br_dwgd' ao enum data_source e 'historical_grid' ao
-- enum data_kind, para que a Sprint 5.3 (integração BR-DWGD) não exija DDL.
-- Seguro para re-executar.
-- ============================================================================

-- ── 1. weather_stations.data_source: incluir 'br_dwgd' ──────────────────────

ALTER TABLE weather_stations
  DROP CONSTRAINT IF EXISTS weather_stations_data_source_check;

ALTER TABLE weather_stations
  ADD CONSTRAINT weather_stations_data_source_check
    CHECK (data_source IN (
      'manual',
      'open_meteo',
      'br_dwgd',
      'api_inmet',
      'api_nasa_power',
      'davis_link',
      'campo_station',
      'outro'
    ));

-- ── 2. weather_readings.data_kind: incluir 'historical_grid' ────────────────

ALTER TABLE weather_readings
  DROP CONSTRAINT IF EXISTS weather_readings_data_kind_check;

ALTER TABLE weather_readings
  ADD CONSTRAINT weather_readings_data_kind_check
    CHECK (data_kind IN ('observed', 'manual', 'historical_grid'));

COMMENT ON COLUMN weather_readings.data_kind IS
  'observed = medido por estação/provedor em tempo real; manual = entrada humana; historical_grid = série interpolada de grade histórica (ex.: BR-DWGD).';

-- ── 3. Índice em origin para filtragem por provedor ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_weather_readings_origin
  ON weather_readings(origin);
