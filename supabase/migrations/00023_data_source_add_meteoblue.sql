-- ============================================================================
-- Migration 00023: adicionar 'meteoblue' ao CHECK constraint de data_source
-- ============================================================================

ALTER TABLE weather_stations
  DROP CONSTRAINT IF EXISTS weather_stations_data_source_check;

ALTER TABLE weather_stations
  ADD CONSTRAINT weather_stations_data_source_check
    CHECK (data_source IN (
      'manual',
      'open_meteo',
      'meteoblue',
      'br_dwgd',
      'api_inmet',
      'api_nasa_power',
      'davis_link',
      'campo_station',
      'outro'
    ));
