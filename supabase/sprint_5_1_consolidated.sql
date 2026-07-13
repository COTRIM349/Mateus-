-- =============================================================================
-- COTRIM IRRIGAÇÃO PRO — SPRINT 5.1
-- Fundação Climática (Open-Meteo + Estação Virtual + Multi-fonte)
-- =============================================================================
-- Consolidação das migrations 00017, 00018 e 00019 para aplicação em um único
-- passo no Supabase SQL Editor. Idempotente e seguro para re-execução.
--
-- REQUISITOS PRÉVIOS (já satisfeitos no banco atual):
--   • Tabelas: farms, weather_stations, weather_readings
--   • Função: auth_farm_ids() (criada em 00002_rls_policies.sql)
--
-- IMPACTO EM DADOS:
--   • Nenhuma linha existente é destruída, movida ou renomeada.
--   • Colunas adicionadas com DEFAULT compatível: registros antigos ficam
--     com data_kind='manual', origin='manual', data_quality='ok'.
--   • CHECK constraints substituídos apenas para expandir enums.
--
-- ORDEM DE EXECUÇÃO (respeitada abaixo):
--   1) Colunas em weather_stations e weather_readings + farms.timezone
--   2) Tabelas novas + RLS
--   3) Preparo multi-fonte (br_dwgd, historical_grid, índice em origin)
-- =============================================================================

BEGIN;

-- ===========================================================================
-- 1) COLUNAS ADICIONAIS EM TABELAS EXISTENTES  (ex-00017)
-- ===========================================================================

-- 1.1 weather_stations: sincronização, provedor, fuso e diagnóstico
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

-- 1.2 weather_readings: origem, qualidade, ET₀ da fonte e trava manual
ALTER TABLE weather_readings
  ADD COLUMN IF NOT EXISTS data_kind        TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origin           TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS imported_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS data_quality     TEXT NOT NULL DEFAULT 'ok'
    CHECK (data_quality IN ('ok', 'degraded', 'missing')),
  ADD COLUMN IF NOT EXISTS et0_source       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS effective_precip DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS is_locked        BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN weather_readings.data_kind        IS 'observed = medido por estação/provedor em tempo real; manual = entrada humana; historical_grid = série interpolada de grade histórica (ex.: BR-DWGD).';
COMMENT ON COLUMN weather_readings.origin           IS 'Fonte legível (ex.: open_meteo, manual, davis).';
COMMENT ON COLUMN weather_readings.imported_at      IS 'Momento da inserção/atualização da leitura.';
COMMENT ON COLUMN weather_readings.data_quality     IS 'Qualidade agregada da leitura para o dia.';
COMMENT ON COLUMN weather_readings.et0_source       IS 'ET₀ fornecida pela fonte externa (mm/dia), quando disponível.';
COMMENT ON COLUMN weather_readings.et0_calculated   IS 'ET₀ calculada pela Cotrim (mm/dia) via Penman-Monteith FAO-56.';
COMMENT ON COLUMN weather_readings.effective_precip IS 'Precipitação efetiva (mm) calculada pela Cotrim.';
COMMENT ON COLUMN weather_readings.is_locked        IS 'Se true, ingestão automática não sobrescreve esta leitura.';

CREATE INDEX IF NOT EXISTS idx_weather_readings_date
  ON weather_readings(date DESC);

-- 1.3 farms.timezone (pré-requisito para agregação diária correta)
ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

COMMENT ON COLUMN farms.timezone IS 'Fuso horário IANA da fazenda (usado para agregação diária do balanço).';

-- ===========================================================================
-- 2) TABELAS NOVAS + RLS  (ex-00018)
-- ===========================================================================

-- 2.1 weather_forecasts — previsão meteorológica separada da observação
CREATE TABLE IF NOT EXISTS weather_forecasts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                   UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  station_id                UUID REFERENCES weather_stations(id) ON DELETE SET NULL,
  issued_at                 TIMESTAMPTZ NOT NULL,
  target_date               DATE NOT NULL,
  horizon_days              INTEGER NOT NULL,
  provider                  TEXT NOT NULL,
  external_id               TEXT,
  temp_max                  DOUBLE PRECISION,
  temp_min                  DOUBLE PRECISION,
  temp_mean                 DOUBLE PRECISION,
  humidity                  DOUBLE PRECISION,
  wind_speed                DOUBLE PRECISION,
  solar_radiation           DOUBLE PRECISION,
  precipitation             DOUBLE PRECISION,
  precipitation_probability DOUBLE PRECISION,
  et0_source                DOUBLE PRECISION,
  et0_calculated            DOUBLE PRECISION,
  imported_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, issued_at, target_date)
);

CREATE INDEX IF NOT EXISTS idx_weather_forecasts_farm_target
  ON weather_forecasts(farm_id, target_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_issued
  ON weather_forecasts(issued_at DESC);

COMMENT ON TABLE  weather_forecasts              IS 'Previsão meteorológica; nunca é misturada com dados observados.';
COMMENT ON COLUMN weather_forecasts.issued_at    IS 'Instante em que a previsão foi emitida pelo provedor.';
COMMENT ON COLUMN weather_forecasts.target_date  IS 'Data para a qual a previsão é feita.';
COMMENT ON COLUMN weather_forecasts.horizon_days IS 'target_date − data de issued_at (dias).';

-- 2.2 weather_daily_selection — escolha auditável de fonte por fazenda/dia
CREATE TABLE IF NOT EXISTS weather_daily_selection (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  selected_station_id UUID REFERENCES weather_stations(id) ON DELETE SET NULL,
  selected_reading_id UUID REFERENCES weather_readings(id) ON DELETE SET NULL,
  priority_used       INTEGER,
  quality_used        TEXT,
  reason              TEXT NOT NULL,
  rejected_sources    JSONB NOT NULL DEFAULT '[]'::jsonb,
  fallback_used       BOOLEAN NOT NULL DEFAULT false,
  selected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id, date)
);

CREATE INDEX IF NOT EXISTS idx_wds_farm_date
  ON weather_daily_selection(farm_id, date DESC);

COMMENT ON TABLE  weather_daily_selection                  IS 'Registro auditável da fonte climática escolhida para cada fazenda e dia.';
COMMENT ON COLUMN weather_daily_selection.reason           IS 'Motivo humano-legível da escolha (ex.: prioridade máxima com qualidade ok).';
COMMENT ON COLUMN weather_daily_selection.rejected_sources IS 'JSONB com estações descartadas e razões.';
COMMENT ON COLUMN weather_daily_selection.fallback_used    IS 'true quando a estação prioritária não tinha dado para a data.';

-- 2.3 climate_ingestion_runs — log das execuções de ingestão automática
CREATE TABLE IF NOT EXISTS climate_ingestion_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  farm_id        UUID REFERENCES farms(id) ON DELETE CASCADE,
  station_id     UUID REFERENCES weather_stations(id) ON DELETE SET NULL,
  provider       TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  rows_inserted  INTEGER NOT NULL DEFAULT 0,
  rows_updated   INTEGER NOT NULL DEFAULT 0,
  rows_skipped   INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT,
  duration_ms    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cir_run_at
  ON climate_ingestion_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_cir_farm_run_at
  ON climate_ingestion_runs(farm_id, run_at DESC);

COMMENT ON TABLE climate_ingestion_runs IS 'Log de execuções da ingestão climática automática.';

-- 2.4 RLS multi-tenant nas três tabelas novas
ALTER TABLE weather_forecasts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_daily_selection  ENABLE ROW LEVEL SECURITY;
ALTER TABLE climate_ingestion_runs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_access_weather_forecasts" ON weather_forecasts;
CREATE POLICY "farm_access_weather_forecasts" ON weather_forecasts
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_weather_daily_selection" ON weather_daily_selection;
CREATE POLICY "farm_access_weather_daily_selection" ON weather_daily_selection
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_climate_ingestion_runs" ON climate_ingestion_runs;
CREATE POLICY "farm_access_climate_ingestion_runs" ON climate_ingestion_runs
  FOR ALL USING (
    farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids())
  );

-- ===========================================================================
-- 3) ENUMS EXPANDIDOS + ÍNDICE DE ORIGEM  (ex-00019)
-- ===========================================================================

-- 3.1 weather_stations.data_source: aceita 'open_meteo' e 'br_dwgd'
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

-- 3.2 weather_readings.data_kind: aceita observed | manual | historical_grid
ALTER TABLE weather_readings
  DROP CONSTRAINT IF EXISTS weather_readings_data_kind_check;

ALTER TABLE weather_readings
  ADD CONSTRAINT weather_readings_data_kind_check
    CHECK (data_kind IN ('observed', 'manual', 'historical_grid'));

-- 3.3 índice para filtragem por provedor de origem
CREATE INDEX IF NOT EXISTS idx_weather_readings_origin
  ON weather_readings(origin);

-- =============================================================================
-- FIM DA SPRINT 5.1
-- =============================================================================
-- Verificações rápidas pós-execução (opcional, execute manualmente após o COMMIT):
--   SELECT COUNT(*) FROM weather_forecasts;                  -- deve retornar 0
--   SELECT COUNT(*) FROM weather_daily_selection;            -- deve retornar 0
--   SELECT COUNT(*) FROM climate_ingestion_runs;             -- deve retornar 0
--   SELECT DISTINCT data_kind FROM weather_readings;         -- deve conter 'manual'
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'weather_stations' AND column_name IN
--       ('timezone','provider','external_id','last_sync_at','sync_status');
-- =============================================================================

COMMIT;
