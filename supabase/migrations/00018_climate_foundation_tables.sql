-- ============================================================================
-- Sprint 5.1 — Fundação Climática (tabelas novas)
-- weather_forecasts        : previsão meteorológica separada da observação
-- weather_daily_selection  : escolha auditável de fonte por fazenda/dia
-- climate_ingestion_runs   : log das execuções de ingestão automática
-- ============================================================================

-- ── 1. weather_forecasts ────────────────────────────────────────────────────

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

COMMENT ON TABLE  weather_forecasts        IS 'Previsão meteorológica; nunca é misturada com dados observados.';
COMMENT ON COLUMN weather_forecasts.issued_at    IS 'Instante em que a previsão foi emitida pelo provedor.';
COMMENT ON COLUMN weather_forecasts.target_date  IS 'Data para a qual a previsão é feita.';
COMMENT ON COLUMN weather_forecasts.horizon_days IS 'target_date − data de issued_at (dias).';

-- ── 2. weather_daily_selection ──────────────────────────────────────────────

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

COMMENT ON TABLE  weather_daily_selection             IS 'Registro auditável da fonte climática escolhida para cada fazenda e dia.';
COMMENT ON COLUMN weather_daily_selection.reason      IS 'Motivo humano-legível da escolha (ex.: prioridade máxima com qualidade ok).';
COMMENT ON COLUMN weather_daily_selection.rejected_sources IS 'JSONB com estações descartadas e razões.';
COMMENT ON COLUMN weather_daily_selection.fallback_used IS 'true quando a estação prioritária não tinha dado para a data.';

-- ── 3. climate_ingestion_runs ───────────────────────────────────────────────

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

-- ── 4. RLS ──────────────────────────────────────────────────────────────────

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
