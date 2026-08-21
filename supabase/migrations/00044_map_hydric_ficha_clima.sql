-- ============================================================================
-- Mapa hídrico + ficha técnica + camadas de solo + clima (sem DROP)
-- ----------------------------------------------------------------------------
-- Aditivo: não apaga dados operacionais.
-- Pivô continua equipamento; cultura permanece na parcela.
-- ============================================================================

-- ── Ficha técnica: geometria e hidráulica faltantes ────────────────────────
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS overhang_m DOUBLE PRECISION
  CHECK (overhang_m IS NULL OR overhang_m >= 0);

COMMENT ON COLUMN pivots.overhang_m IS
  'Vão em balanço / faixa irrigada após a última torre (m). Raio irrigado = raio da última torre + vão, quando ambos existirem.';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS min_nozzle_mm DOUBLE PRECISION
  CHECK (min_nozzle_mm IS NULL OR min_nozzle_mm >= 0);

COMMENT ON COLUMN pivots.min_nozzle_mm IS
  'Diâmetro do menor bocal (mm).';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS max_nozzle_mm DOUBLE PRECISION
  CHECK (max_nozzle_mm IS NULL OR max_nozzle_mm >= 0);

COMMENT ON COLUMN pivots.max_nozzle_mm IS
  'Diâmetro do maior bocal (mm).';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS conduction_losses TEXT
  CHECK (conduction_losses IS NULL OR conduction_losses IN (
    'condicoes_padrao','baixa','media','alta'
  ));

COMMENT ON COLUMN pivots.conduction_losses IS
  'Perdas na condução cadastradas na ficha (qualitativo). Não inventar coeficiente.';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS power_factor DOUBLE PRECISION
  CHECK (power_factor IS NULL OR (power_factor >= 0 AND power_factor <= 1));

COMMENT ON COLUMN pivots.power_factor IS
  'Fator de potência do motor (0–1).';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS loading_index DOUBLE PRECISION
  CHECK (loading_index IS NULL OR (loading_index >= 0 AND loading_index <= 1));

COMMENT ON COLUMN pivots.loading_index IS
  'Índice de carregamento (0–1).';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS aerial_part_pct DOUBLE PRECISION
  CHECK (aerial_part_pct IS NULL OR (aerial_part_pct >= 0 AND aerial_part_pct <= 100));

COMMENT ON COLUMN pivots.aerial_part_pct IS
  'Parte aérea (%) usada em relatórios da ficha. Não entra no mapa.';

-- ── Camadas: granulometria por camada ──────────────────────────────────────
ALTER TABLE soil_layers ADD COLUMN IF NOT EXISTS sand_pct DOUBLE PRECISION
  CHECK (sand_pct IS NULL OR (sand_pct >= 0 AND sand_pct <= 100));

ALTER TABLE soil_layers ADD COLUMN IF NOT EXISTS silt_pct DOUBLE PRECISION
  CHECK (silt_pct IS NULL OR (silt_pct >= 0 AND silt_pct <= 100));

ALTER TABLE soil_layers ADD COLUMN IF NOT EXISTS clay_pct DOUBLE PRECISION
  CHECK (clay_pct IS NULL OR (clay_pct >= 0 AND clay_pct <= 100));

COMMENT ON COLUMN soil_layers.sand_pct IS 'Areia da camada (%). Opcional.';
COMMENT ON COLUMN soil_layers.silt_pct IS 'Silte da camada (%). Opcional.';
COMMENT ON COLUMN soil_layers.clay_pct IS 'Argila da camada (%). Opcional.';

-- ── Clima: não forçar 0 quando a API omitir o dado ─────────────────────────
ALTER TABLE weather_readings
  ALTER COLUMN temp_max DROP NOT NULL,
  ALTER COLUMN temp_min DROP NOT NULL,
  ALTER COLUMN temp_mean DROP NOT NULL,
  ALTER COLUMN humidity DROP NOT NULL,
  ALTER COLUMN wind_speed DROP NOT NULL,
  ALTER COLUMN precipitation DROP NOT NULL;

COMMENT ON COLUMN weather_readings.precipitation IS
  'Chuva do dia (mm). NULL = sem dado da API. 0 = precipitação realmente zero. Não preencher ausência com zero.';

-- ── Fuso da operação na Bahia ──────────────────────────────────────────────
UPDATE farms
   SET timezone = 'America/Bahia'
 WHERE state = 'BA'
   AND (timezone IS NULL OR timezone = 'America/Sao_Paulo');

UPDATE weather_stations ws
   SET timezone = 'America/Bahia'
  FROM farms f
 WHERE ws.farm_id = f.id
   AND f.state = 'BA'
   AND (ws.timezone IS NULL OR ws.timezone = 'America/Sao_Paulo');

UPDATE virtual_weather_stations v
   SET timezone = 'America/Bahia'
  FROM farms f
 WHERE v.farm_id = f.id
   AND f.state = 'BA'
   AND (v.timezone IS NULL OR v.timezone = 'America/Sao_Paulo');
