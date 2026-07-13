-- ============================================================================
-- Sprint 5.1 — Fundação Climática
-- Expande weather_stations e weather_readings sem alterar dados existentes.
-- Seguro para re-executar: usa ADD COLUMN IF NOT EXISTS e ALTER CHECK.
-- ============================================================================

-- ── 1. weather_stations: fonte, sincronização e fuso ────────────────────────

ALTER TABLE weather_stations
  ADD COLUMN IF NOT EXISTS timezone       TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS provider       TEXT,
  ADD COLUMN IF NOT EXISTS external_id    TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status    TEXT NOT NULL DEFAULT 'idle'
    CHECK (sync_status IN ('idle', 'ok', 'degraded', 'failed')),
  ADD COLUMN IF NOT EXISTS sync_error     TEXT;

COMMENT ON COLUMN weather_stations.timezone     IS 'Fuso horário IANA da estação (ex.: America/Sao_Paulo).';
COMMENT ON COLUMN weather_stations.provider     IS 'Provedor de dados quando aplicável (ex.: open-meteo, davis, inmet).';
COMMENT ON COLUMN weather_stations.external_id  IS 'Identificador externo no provedor (código INMET, ID Davis, etc.).';
COMMENT ON COLUMN weather_stations.last_sync_at IS 'Momento da última sincronização bem-sucedida.';
COMMENT ON COLUMN weather_stations.sync_status  IS 'Estado da última sincronização: idle | ok | degraded | failed.';
COMMENT ON COLUMN weather_stations.sync_error   IS 'Mensagem do erro da última sincronização (quando failed).';

-- ── 2. weather_stations.data_source: expandir enum p/ incluir open_meteo ────

ALTER TABLE weather_stations
  DROP CONSTRAINT IF EXISTS weather_stations_data_source_check;

ALTER TABLE weather_stations
  ADD CONSTRAINT weather_stations_data_source_check
    CHECK (data_source IN (
      'manual',
      'open_meteo',
      'api_inmet',
      'api_nasa_power',
      'davis_link',
      'campo_station',
      'outro'
    ));

-- ── 3. weather_readings: origem, qualidade, ET₀ da fonte, trava manual ─────

ALTER TABLE weather_readings
  ADD COLUMN IF NOT EXISTS data_kind      TEXT NOT NULL DEFAULT 'manual'
    CHECK (data_kind IN ('observed', 'manual')),
  ADD COLUMN IF NOT EXISTS origin         TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS imported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS data_quality   TEXT NOT NULL DEFAULT 'ok'
    CHECK (data_quality IN ('ok', 'degraded', 'missing')),
  ADD COLUMN IF NOT EXISTS et0_source     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS effective_precip DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS is_locked      BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN weather_readings.data_kind        IS 'observed = ingerido de fonte automática; manual = digitado pelo operador.';
COMMENT ON COLUMN weather_readings.origin           IS 'Fonte legível (ex.: open_meteo, manual, davis).';
COMMENT ON COLUMN weather_readings.imported_at      IS 'Momento da inserção/atualização da leitura.';
COMMENT ON COLUMN weather_readings.data_quality     IS 'Qualidade agregada da leitura para o dia.';
COMMENT ON COLUMN weather_readings.et0_source       IS 'ET₀ fornecida pela fonte externa (mm/dia), quando disponível.';
COMMENT ON COLUMN weather_readings.et0_calculated   IS 'ET₀ calculada pela Cotrim (mm/dia) via Penman-Monteith FAO-56.';
COMMENT ON COLUMN weather_readings.effective_precip IS 'Precipitação efetiva (mm) calculada pela Cotrim.';
COMMENT ON COLUMN weather_readings.is_locked        IS 'Se true, ingestão automática não sobrescreve esta leitura.';

-- Índice adicional para consultas por data (fazenda pode ter várias estações).
CREATE INDEX IF NOT EXISTS idx_weather_readings_date
  ON weather_readings(date DESC);

-- ── 4. farms.timezone (pré-requisito para agregação diária correta) ─────────

ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

COMMENT ON COLUMN farms.timezone IS 'Fuso horário IANA da fazenda (usado para agregação diária do balanço).';
