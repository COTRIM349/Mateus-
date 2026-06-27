-- ============================================================================
-- Sprint 3: Campos adicionais em weather_stations para motor climático
-- ============================================================================

ALTER TABLE weather_stations
  ADD COLUMN station_type TEXT NOT NULL DEFAULT 'automatica'
    CHECK (station_type IN ('automatica', 'manual', 'virtual')),
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (data_source IN ('manual', 'api_inmet', 'api_nasa_power', 'davis_link', 'campo_station', 'outro')),
  ADD COLUMN source_priority INTEGER NOT NULL DEFAULT 1
    CHECK (source_priority BETWEEN 1 AND 10);

COMMENT ON COLUMN weather_stations.station_type IS 'Tipo: automática, manual ou virtual (calculada)';
COMMENT ON COLUMN weather_stations.data_source IS 'Fonte dos dados climáticos';
COMMENT ON COLUMN weather_stations.source_priority IS 'Prioridade da fonte (1 = maior prioridade)';
