-- ============================================================================
-- Correção pós-Sprint 5.2 — Altitude com origem + rastreabilidade completa
-- ----------------------------------------------------------------------------
-- Adiciona:
--   • weather_stations.altitude_origin  → manual | open_meteo | physical | unknown
--   • weather_readings.et0_delta        → diferença absoluta (calc - source)
--   • weather_readings.et0_delta_pct    → diferença percentual sobre source
--   • climate_ingestion_runs colunas de contexto: coordenadas enviadas,
--     altitude usada e sua origem, URL da requisição, timezone, elevação
--     retornada pelo provedor e médias/deltas de ET₀.
-- Seguro para re-execução.
-- ============================================================================

-- 1) weather_stations: origem da altitude
ALTER TABLE weather_stations
  ADD COLUMN IF NOT EXISTS altitude_origin TEXT NOT NULL DEFAULT 'unknown'
    CHECK (altitude_origin IN ('manual','open_meteo','physical','unknown'));

COMMENT ON COLUMN weather_stations.altitude_origin IS
  'Como a altitude foi determinada: manual (fazenda informou), open_meteo (elevation do grid), physical (estação física), unknown.';

-- Backfill: estações existentes cuja altitude > 0 foram informadas manualmente
UPDATE weather_stations
   SET altitude_origin = 'manual'
 WHERE altitude_origin = 'unknown'
   AND altitude IS NOT NULL
   AND altitude > 0;

-- 2) weather_readings: deltas entre ET₀ Cotrim × ET₀ fonte
ALTER TABLE weather_readings
  ADD COLUMN IF NOT EXISTS et0_delta      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS et0_delta_pct  DOUBLE PRECISION;

COMMENT ON COLUMN weather_readings.et0_delta     IS 'ET₀ Cotrim − ET₀ fonte (mm/dia). NULL quando alguma das duas ausente.';
COMMENT ON COLUMN weather_readings.et0_delta_pct IS 'Percentual da diferença: (et0_delta / et0_source) × 100.';

-- Backfill: calcula delta para linhas existentes que têm as duas ET₀
UPDATE weather_readings
   SET et0_delta = et0_calculated - et0_source,
       et0_delta_pct = CASE
         WHEN et0_source IS NOT NULL AND et0_source <> 0
         THEN ((et0_calculated - et0_source) / et0_source) * 100
         ELSE NULL
       END
 WHERE et0_source IS NOT NULL
   AND et0_calculated IS NOT NULL
   AND et0_delta IS NULL;

-- 3) climate_ingestion_runs: contexto de requisição e agregados
ALTER TABLE climate_ingestion_runs
  ADD COLUMN IF NOT EXISTS request_latitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS request_longitude   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS request_timezone    TEXT,
  ADD COLUMN IF NOT EXISTS request_url         TEXT,
  ADD COLUMN IF NOT EXISTS altitude_used       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS altitude_origin     TEXT,
  ADD COLUMN IF NOT EXISTS response_elevation  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS et0_source_avg      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS et0_calculated_avg  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS et0_delta_pct_avg   DOUBLE PRECISION;

COMMENT ON COLUMN climate_ingestion_runs.request_latitude    IS 'Latitude enviada ao provedor.';
COMMENT ON COLUMN climate_ingestion_runs.request_longitude   IS 'Longitude enviada ao provedor.';
COMMENT ON COLUMN climate_ingestion_runs.request_timezone    IS 'Timezone enviado ao provedor.';
COMMENT ON COLUMN climate_ingestion_runs.request_url         IS 'URL efetiva da requisição (sem chaves de API).';
COMMENT ON COLUMN climate_ingestion_runs.altitude_used       IS 'Altitude usada no cálculo local de ET₀ (m).';
COMMENT ON COLUMN climate_ingestion_runs.altitude_origin     IS 'Origem da altitude usada.';
COMMENT ON COLUMN climate_ingestion_runs.response_elevation  IS 'Elevação da grade retornada pelo provedor (m).';
