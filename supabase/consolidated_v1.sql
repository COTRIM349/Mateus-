-- ============================================================================
-- COTRIM IRRIGACAO PRO v1.0.0 — SCRIPT SQL CONSOLIDADO
-- ============================================================================
-- Este script cria TODAS as tabelas, indices, funcoes, triggers, RLS policies,
-- views e seeds minimos para o Supabase.
--
-- INSTRUCOES:
--   1. Acesse o Supabase Dashboard do seu projeto
--   2. Va em SQL Editor (menu lateral)
--   3. Clique em "New Query"
--   4. Cole TODO este script
--   5. Clique em "Run" (ou Ctrl+Enter)
--   6. Aguarde a execucao completa (pode levar alguns segundos)
--
-- IMPORTANTE: Execute em um projeto Supabase LIMPO (sem tabelas anteriores).
-- Se ja existirem tabelas, faca backup antes e remova-as.
-- ============================================================================


-- ============================================================================
-- PARTE 1: FUNCOES AUXILIARES
-- ============================================================================

-- Funcao para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PARTE 2: TABELAS (38 tabelas em ordem de dependencia)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. COMPANIES (raiz multi-tenant)
-- --------------------------------------------------------------------------
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  cnpj          TEXT NOT NULL UNIQUE,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  address       TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2. USERS (perfis de usuario — estende auth.users)
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'manager', 'operator', 'viewer')),
  active        BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);

-- --------------------------------------------------------------------------
-- 3. FARMS (fazendas)
-- --------------------------------------------------------------------------
CREATE TABLE farms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  altitude        DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_area      DOUBLE PRECISION NOT NULL,
  irrigated_area  DOUBLE PRECISION NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_farms_company ON farms(company_id);

-- --------------------------------------------------------------------------
-- 4. USER_FARM_ACCESS (acesso usuario <-> fazenda)
-- --------------------------------------------------------------------------
CREATE TABLE user_farm_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, farm_id)
);

CREATE INDEX idx_user_farm_user ON user_farm_access(user_id);
CREATE INDEX idx_user_farm_farm ON user_farm_access(farm_id);

-- --------------------------------------------------------------------------
-- 5. SEASONS (safras)
-- --------------------------------------------------------------------------
CREATE TABLE seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

CREATE INDEX idx_seasons_farm ON seasons(farm_id);
CREATE INDEX idx_seasons_active ON seasons(farm_id, active) WHERE active = true;

-- --------------------------------------------------------------------------
-- 6. PRODUCTION_MODULES (modulos produtivos)
-- --------------------------------------------------------------------------
CREATE TABLE production_modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  total_area    DOUBLE PRECISION NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modules_farm ON production_modules(farm_id);

-- --------------------------------------------------------------------------
-- 7. CULTURES (culturas — inclui campos do Sprint 5)
-- --------------------------------------------------------------------------
CREATE TABLE cultures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  scientific_name   TEXT,
  kc_by_stage       JSONB NOT NULL DEFAULT '{}',
  root_depth        DOUBLE PRECISION NOT NULL,
  depletion_factor  DOUBLE PRECISION NOT NULL CHECK (depletion_factor BETWEEN 0 AND 1),
  cycle_days        INTEGER NOT NULL,
  culture_group     TEXT DEFAULT 'graos'
                    CHECK (culture_group IN ('graos','fibras','frutas','hortalicas','forrageiras','perenes','outro')),
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo','inativo','em_teste')),
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 8. SOILS (perfis de solo — inclui campos do Sprint 4)
-- --------------------------------------------------------------------------
CREATE TABLE soils (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                 UUID REFERENCES farms(id) ON DELETE SET NULL,
  name                    TEXT NOT NULL,
  texture                 TEXT NOT NULL
                          CHECK (texture IN ('arenoso','franco-arenoso','franco','franco-argiloso','argiloso','muito-argiloso')),
  field_capacity          DOUBLE PRECISION NOT NULL,
  wilting_point           DOUBLE PRECISION NOT NULL,
  bulk_density            DOUBLE PRECISION NOT NULL,
  infiltration_rate       DOUBLE PRECISION NOT NULL,
  sand_pct                DOUBLE PRECISION DEFAULT 0 CHECK (sand_pct BETWEEN 0 AND 100),
  silt_pct                DOUBLE PRECISION DEFAULT 0 CHECK (silt_pct BETWEEN 0 AND 100),
  clay_pct                DOUBLE PRECISION DEFAULT 0 CHECK (clay_pct BETWEEN 0 AND 100),
  cad                     DOUBLE PRECISION,
  afd                     DOUBLE PRECISION,
  hydraulic_conductivity  DOUBLE PRECISION,
  effective_depth         DOUBLE PRECISION DEFAULT 0.6,
  observations            TEXT,
  active                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (field_capacity > wilting_point),
  CONSTRAINT chk_granulometry CHECK (
    sand_pct + silt_pct + clay_pct BETWEEN 99.5 AND 100.5
    OR (sand_pct = 0 AND silt_pct = 0 AND clay_pct = 0)
  )
);

CREATE INDEX idx_soils_farm ON soils(farm_id);

-- --------------------------------------------------------------------------
-- 9. PIVOTS (pivos centrais)
-- --------------------------------------------------------------------------
CREATE TABLE pivots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  module_id             UUID REFERENCES production_modules(id) ON DELETE SET NULL,
  culture_id            UUID REFERENCES cultures(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  code                  TEXT,
  area                  DOUBLE PRECISION NOT NULL,
  radius                DOUBLE PRECISION NOT NULL,
  flow_rate             DOUBLE PRECISION NOT NULL,
  pump_power            DOUBLE PRECISION NOT NULL,
  motor_efficiency      DOUBLE PRECISION NOT NULL DEFAULT 0.88,
  efficiency            DOUBLE PRECISION NOT NULL CHECK (efficiency BETWEEN 0 AND 1),
  latitude              DOUBLE PRECISION NOT NULL,
  longitude             DOUBLE PRECISION NOT NULL,
  status                TEXT NOT NULL DEFAULT 'parado'
                        CHECK (status IN ('irrigando','parado','manutencao','alerta')),
  manufacturer          TEXT,
  model                 TEXT,
  pivot_type            TEXT DEFAULT 'central'
                        CHECK (pivot_type IN ('central','linear','rebocavel')),
  last_tower_radius     DOUBLE PRECISION,
  service_pressure      DOUBLE PRECISION,
  speed_100_pct         DOUBLE PRECISION,
  full_turn_time        DOUBLE PRECISION,
  depth_100_pct         DOUBLE PRECISION,
  max_operating_time    DOUBLE PRECISION DEFAULT 24,
  installed_power_kw    DOUBLE PRECISION,
  specific_consumption  DOUBLE PRECISION,
  energy_cost           DOUBLE PRECISION,
  cost_per_mm           DOUBLE PRECISION,
  cost_per_hectare      DOUBLE PRECISION,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pivots_farm ON pivots(farm_id);
CREATE INDEX idx_pivots_module ON pivots(module_id);
CREATE INDEX idx_pivots_culture ON pivots(culture_id);
CREATE INDEX idx_pivots_status ON pivots(status);

-- --------------------------------------------------------------------------
-- 10. PIVOT_CROP_ASSIGNMENTS (vinculo pivo <-> safra <-> cultura <-> solo)
-- --------------------------------------------------------------------------
CREATE TABLE pivot_crop_assignments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id                UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  season_id               UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  culture_id              UUID NOT NULL REFERENCES cultures(id) ON DELETE RESTRICT,
  soil_id                 UUID NOT NULL REFERENCES soils(id) ON DELETE RESTRICT,
  crop_stage              TEXT NOT NULL DEFAULT 'germinacao'
                          CHECK (crop_stage IN ('germinacao','vegetativo','floracao','enchimento','maturacao','colheita')),
  planting_date           DATE NOT NULL,
  expected_harvest_date   DATE,
  active                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_id, season_id)
);

CREATE INDEX idx_pca_pivot ON pivot_crop_assignments(pivot_id);
CREATE INDEX idx_pca_season ON pivot_crop_assignments(season_id);
CREATE INDEX idx_pca_culture ON pivot_crop_assignments(culture_id);

-- --------------------------------------------------------------------------
-- 11. WEATHER_STATIONS (estacoes meteorologicas — inclui campos Sprint 3)
-- --------------------------------------------------------------------------
CREATE TABLE weather_stations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  model             TEXT,
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  altitude          DOUBLE PRECISION NOT NULL DEFAULT 0,
  station_type      TEXT NOT NULL DEFAULT 'automatica'
                    CHECK (station_type IN ('automatica', 'manual', 'virtual')),
  data_source       TEXT NOT NULL DEFAULT 'manual'
                    CHECK (data_source IN ('manual', 'api_inmet', 'api_nasa_power', 'davis_link', 'campo_station', 'outro')),
  source_priority   INTEGER NOT NULL DEFAULT 1
                    CHECK (source_priority BETWEEN 1 AND 10),
  active            BOOLEAN NOT NULL DEFAULT true,
  installed_at      DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_weather_stations_farm ON weather_stations(farm_id);

-- --------------------------------------------------------------------------
-- 12. WEATHER_READINGS (leituras meteorologicas)
-- --------------------------------------------------------------------------
CREATE TABLE weather_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id        UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  temp_max          DOUBLE PRECISION NOT NULL,
  temp_min          DOUBLE PRECISION NOT NULL,
  temp_mean         DOUBLE PRECISION NOT NULL,
  humidity          DOUBLE PRECISION NOT NULL,
  wind_speed        DOUBLE PRECISION NOT NULL,
  solar_radiation   DOUBLE PRECISION NOT NULL,
  precipitation     DOUBLE PRECISION NOT NULL DEFAULT 0,
  sunshine          DOUBLE PRECISION,
  et0_calculated    DOUBLE PRECISION,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(station_id, date)
);

CREATE INDEX idx_weather_readings_station_date ON weather_readings(station_id, date DESC);

-- --------------------------------------------------------------------------
-- 13. WATER_BALANCES (balanco hidrico — inclui campos Sprint 6)
-- --------------------------------------------------------------------------
CREATE TABLE water_balances (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_crop_assignment_id    UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  date                        DATE NOT NULL,
  et0                         DOUBLE PRECISION NOT NULL,
  kc                          DOUBLE PRECISION NOT NULL,
  etc                         DOUBLE PRECISION NOT NULL,
  effective_precipitation     DOUBLE PRECISION NOT NULL DEFAULT 0,
  applied_depth               DOUBLE PRECISION NOT NULL DEFAULT 0,
  deficit                     DOUBLE PRECISION NOT NULL DEFAULT 0,
  cad                         DOUBLE PRECISION NOT NULL,
  afd                         DOUBLE PRECISION NOT NULL,
  soil_storage                DOUBLE PRECISION NOT NULL,
  recommended_depth           DOUBLE PRECISION,
  recommended_volume          DOUBLE PRECISION,
  recommended_time            DOUBLE PRECISION,
  estimated_energy            DOUBLE PRECISION,
  estimated_cost              DOUBLE PRECISION,
  priority                    TEXT CHECK (priority IN ('alta','media','baixa')),
  productive_risk             DOUBLE PRECISION CHECK (productive_risk BETWEEN 0 AND 100),
  precipitation               DOUBLE PRECISION NOT NULL DEFAULT 0,
  root_depth                  DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  depletion_factor            DOUBLE PRECISION NOT NULL DEFAULT 0.5
                              CHECK (depletion_factor BETWEEN 0 AND 1),
  surplus                     DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_depth                   DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_depth                 DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_needed               DOUBLE PRECISION NOT NULL DEFAULT 0,
  irrigation_time             DOUBLE PRECISION NOT NULL DEFAULT 0,
  water_status                TEXT NOT NULL DEFAULT 'ideal'
                              CHECK (water_status IN ('saturado','ideal','atencao','deficit','deficit_critico')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_crop_assignment_id, date)
);

CREATE INDEX idx_wb_pca_date ON water_balances(pivot_crop_assignment_id, date DESC);
CREATE INDEX idx_wb_priority ON water_balances(priority) WHERE priority = 'alta';
CREATE INDEX idx_wb_status ON water_balances(water_status);
CREATE INDEX idx_wb_date ON water_balances(date);

-- --------------------------------------------------------------------------
-- 14. IRRIGATION_SCHEDULES (programacao de irrigacao)
-- --------------------------------------------------------------------------
CREATE TABLE irrigation_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id          UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  season_id         UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  scheduled_date    DATE NOT NULL,
  scheduled_start   TIMESTAMPTZ,
  depth_mm          DOUBLE PRECISION NOT NULL,
  volume_m3         DOUBLE PRECISION NOT NULL,
  duration_hours    DOUBLE PRECISION NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','confirmada','em_execucao','concluida','cancelada')),
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_pivot ON irrigation_schedules(pivot_id);
CREATE INDEX idx_schedules_date ON irrigation_schedules(scheduled_date);
CREATE INDEX idx_schedules_status ON irrigation_schedules(status);

-- --------------------------------------------------------------------------
-- 15. IRRIGATION_EVENTS (eventos reais de irrigacao)
-- --------------------------------------------------------------------------
CREATE TABLE irrigation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id        UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  schedule_id     UUID REFERENCES irrigation_schedules(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  depth_mm        DOUBLE PRECISION NOT NULL,
  volume_m3       DOUBLE PRECISION NOT NULL,
  energy_kwh      DOUBLE PRECISION,
  cost            DOUBLE PRECISION,
  status          TEXT NOT NULL DEFAULT 'em_execucao'
                  CHECK (status IN ('em_execucao','concluida','interrompida')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_pivot ON irrigation_events(pivot_id);
CREATE INDEX idx_events_started ON irrigation_events(started_at DESC);

-- --------------------------------------------------------------------------
-- 16. SENSORS (sensores IoT)
-- --------------------------------------------------------------------------
CREATE TABLE sensors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id            UUID REFERENCES pivots(id) ON DELETE SET NULL,
  reservoir_id        UUID,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL
                      CHECK (type IN ('umidade_solo','temperatura_solo','nivel_reservatorio','vazao','pressao','pluviometro','estacao_meteorologica')),
  model               TEXT,
  unit                TEXT NOT NULL,
  reading_interval    INTEGER NOT NULL DEFAULT 15,
  status              TEXT NOT NULL DEFAULT 'offline'
                      CHECK (status IN ('online','offline','alerta','manutencao')),
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  installed_at        DATE,
  last_reading_at     TIMESTAMPTZ,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sensors_farm ON sensors(farm_id);
CREATE INDEX idx_sensors_pivot ON sensors(pivot_id);
CREATE INDEX idx_sensors_type ON sensors(type);
CREATE INDEX idx_sensors_status ON sensors(status);

-- --------------------------------------------------------------------------
-- 17. SENSOR_READINGS (leituras de sensores)
-- --------------------------------------------------------------------------
CREATE TABLE sensor_readings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id   UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  value       DOUBLE PRECISION NOT NULL,
  unit        TEXT NOT NULL
);

CREATE INDEX idx_sensor_readings_sensor_ts ON sensor_readings(sensor_id, timestamp DESC);

-- --------------------------------------------------------------------------
-- 18. RESERVOIRS (reservatorios de agua)
-- --------------------------------------------------------------------------
CREATE TABLE reservoirs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                 UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL
                          CHECK (type IN ('represa','lago','poco','rio','reservatorio')),
  max_capacity            DOUBLE PRECISION NOT NULL,
  current_volume          DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_operational_level   DOUBLE PRECISION NOT NULL DEFAULT 0,
  recharge_rate           DOUBLE PRECISION NOT NULL DEFAULT 0,
  latitude                DOUBLE PRECISION,
  longitude               DOUBLE PRECISION,
  active                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservoirs_farm ON reservoirs(farm_id);

-- FK de sensors.reservoir_id -> reservoirs
ALTER TABLE sensors
  ADD CONSTRAINT fk_sensors_reservoir
  FOREIGN KEY (reservoir_id) REFERENCES reservoirs(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------------
-- 19. ENERGY_TARIFFS (tarifas de energia — versao completa Sprint 9)
-- --------------------------------------------------------------------------
CREATE TABLE energy_tariffs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tariff_type           TEXT NOT NULL DEFAULT 'verde'
                        CHECK (tariff_type IN ('verde','azul','convencional')),
  rate_peak             DOUBLE PRECISION NOT NULL DEFAULT 0,
  rate_off_peak         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rate_reserved         DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_rate           DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_start            INTEGER NOT NULL DEFAULT 18,
  peak_end              INTEGER NOT NULL DEFAULT 21,
  contracted_demand_kw  DOUBLE PRECISION NOT NULL DEFAULT 0,
  valid_from            DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to              DATE,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_et_farm ON energy_tariffs(farm_id);

-- --------------------------------------------------------------------------
-- 20. COST_CENTERS (centros de custo)
-- --------------------------------------------------------------------------
CREATE TABLE cost_centers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_centers_farm ON cost_centers(farm_id);

-- --------------------------------------------------------------------------
-- 21. COST_ENTRIES (lancamentos de custo)
-- --------------------------------------------------------------------------
CREATE TABLE cost_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cost_center_id    UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  pivot_id          UUID REFERENCES pivots(id) ON DELETE SET NULL,
  culture_id        UUID REFERENCES cultures(id) ON DELETE SET NULL,
  season_id         UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category          TEXT NOT NULL
                    CHECK (category IN ('energia','manutencao','mao_de_obra','insumos','depreciacao','outros')),
  description       TEXT NOT NULL,
  amount            DOUBLE PRECISION NOT NULL,
  date              DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_entries_farm ON cost_entries(farm_id);
CREATE INDEX idx_cost_entries_season ON cost_entries(season_id);
CREATE INDEX idx_cost_entries_category ON cost_entries(category);

-- --------------------------------------------------------------------------
-- 22. ALERTS (alertas do sistema)
-- --------------------------------------------------------------------------
CREATE TABLE alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id          UUID REFERENCES pivots(id) ON DELETE SET NULL,
  sensor_id         UUID REFERENCES sensors(id) ON DELETE SET NULL,
  reservoir_id      UUID REFERENCES reservoirs(id) ON DELETE SET NULL,
  severity          TEXT NOT NULL
                    CHECK (severity IN ('critico','alto','medio','baixo','info')),
  category          TEXT NOT NULL
                    CHECK (category IN ('deficit_hidrico','equipamento','sensor','reservatorio','energia','clima','sistema')),
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  acknowledged      BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by   UUID REFERENCES users(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_farm ON alerts(farm_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_unresolved ON alerts(farm_id, resolved_at) WHERE resolved_at IS NULL;

-- --------------------------------------------------------------------------
-- 23. SOIL_LAYERS (camadas do solo — Sprint 4)
-- --------------------------------------------------------------------------
CREATE TABLE soil_layers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soil_id             UUID NOT NULL REFERENCES soils(id) ON DELETE CASCADE,
  depth_start         INTEGER NOT NULL,
  depth_end           INTEGER NOT NULL,
  texture             TEXT NOT NULL
                      CHECK (texture IN ('arenoso','franco-arenoso','franco','franco-argiloso','argiloso','muito-argiloso')),
  bulk_density        DOUBLE PRECISION NOT NULL,
  field_capacity      DOUBLE PRECISION NOT NULL,
  wilting_point       DOUBLE PRECISION NOT NULL,
  cad                 DOUBLE PRECISION,
  afd                 DOUBLE PRECISION,
  infiltration_rate   DOUBLE PRECISION,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (depth_end > depth_start),
  CHECK (field_capacity > wilting_point),
  UNIQUE(soil_id, depth_start)
);

CREATE INDEX idx_soil_layers_soil ON soil_layers(soil_id);

-- --------------------------------------------------------------------------
-- 24. SOIL_HISTORY (historico de analises do solo — Sprint 4)
-- --------------------------------------------------------------------------
CREATE TABLE soil_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soil_id       UUID NOT NULL REFERENCES soils(id) ON DELETE CASCADE,
  changed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  change_type   TEXT NOT NULL CHECK (change_type IN ('criacao', 'edicao', 'camada_add', 'camada_edit', 'camada_del', 'associacao')),
  description   TEXT NOT NULL,
  old_values    JSONB,
  new_values    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_soil_history_soil ON soil_history(soil_id);
CREATE INDEX idx_soil_history_date ON soil_history(created_at DESC);

-- --------------------------------------------------------------------------
-- 25. CULTURE_VARIETIES (variedades/cultivares — Sprint 5)
-- --------------------------------------------------------------------------
CREATE TABLE culture_varieties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id      UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  company         TEXT,
  maturity        TEXT NOT NULL DEFAULT 'medio'
                  CHECK (maturity IN ('precoce','medio','tardio')),
  cycle_days      INTEGER,
  observations    TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(culture_id, name)
);

CREATE INDEX idx_culture_varieties_culture ON culture_varieties(culture_id);

-- --------------------------------------------------------------------------
-- 26. CULTURE_PHASES (fases fenologicas — Sprint 5)
-- --------------------------------------------------------------------------
CREATE TABLE culture_phases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id          UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  phase_order         INTEGER NOT NULL,
  name                TEXT NOT NULL,
  days_after_plant    INTEGER NOT NULL,
  duration_days       INTEGER NOT NULL,
  kc_start            DOUBLE PRECISION NOT NULL CHECK (kc_start BETWEEN 0 AND 2.5),
  kc_end              DOUBLE PRECISION NOT NULL CHECK (kc_end BETWEEN 0 AND 2.5),
  root_depth_start    DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  root_depth_end      DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  depletion_factor    DOUBLE PRECISION NOT NULL DEFAULT 0.5
                      CHECK (depletion_factor BETWEEN 0 AND 1),
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(culture_id, phase_order)
);

CREATE INDEX idx_culture_phases_culture ON culture_phases(culture_id);

-- --------------------------------------------------------------------------
-- 27. CULTURE_HISTORY (historico de cultura — Sprint 5)
-- --------------------------------------------------------------------------
CREATE TABLE culture_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id      UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  changed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  change_type     TEXT NOT NULL CHECK (change_type IN (
    'criacao','edicao','variedade_add','variedade_edit','variedade_del',
    'fase_add','fase_edit','fase_del','associacao'
  )),
  description     TEXT NOT NULL,
  old_values      JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_culture_history_culture ON culture_history(culture_id);
CREATE INDEX idx_culture_history_date ON culture_history(created_at DESC);

-- --------------------------------------------------------------------------
-- 28. IRRIGATION_RECOMMENDATIONS (recomendacoes — Sprint 7)
-- --------------------------------------------------------------------------
CREATE TABLE irrigation_recommendations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id              UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  crop_assignment_id    UUID REFERENCES pivot_crop_assignments(id) ON DELETE SET NULL,
  recommendation_date   DATE NOT NULL,
  should_irrigate       BOOLEAN NOT NULL DEFAULT false,
  operational_status    TEXT NOT NULL DEFAULT 'monitorar'
    CHECK (operational_status IN (
      'irrigar_imediatamente','irrigar_hoje','irrigar_amanha','monitorar','nao_irrigar'
    )),
  priority              TEXT NOT NULL DEFAULT 'sem_necessidade'
    CHECK (priority IN ('critica','alta','media','baixa','sem_necessidade')),
  priority_score        DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (priority_score BETWEEN 0 AND 100),
  productive_risk       DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (productive_risk BETWEEN 0 AND 100),
  net_depth             DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_depth           DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3             DOUBLE PRECISION NOT NULL DEFAULT 0,
  irrigation_time_h     DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_arm           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_cad           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_afd           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_deficit       DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_etc           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_kc            DOUBLE PRECISION NOT NULL DEFAULT 1,
  root_depth            DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  crop_phase            TEXT,
  depletion_factor      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  peak_restricted       BOOLEAN NOT NULL DEFAULT false,
  recommended_start     TEXT,
  reason                TEXT NOT NULL,
  observations          TEXT,
  accepted              BOOLEAN,
  accepted_at           TIMESTAMPTZ,
  accepted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_id, recommendation_date)
);

CREATE INDEX idx_rec_farm ON irrigation_recommendations(farm_id);
CREATE INDEX idx_rec_pivot ON irrigation_recommendations(pivot_id);
CREATE INDEX idx_rec_date ON irrigation_recommendations(recommendation_date DESC);
CREATE INDEX idx_rec_priority ON irrigation_recommendations(priority);
CREATE INDEX idx_rec_status ON irrigation_recommendations(operational_status);

-- --------------------------------------------------------------------------
-- 29. PUMP_HOUSES (casas de bomba — Sprint 8)
-- --------------------------------------------------------------------------
CREATE TABLE pump_houses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  max_flow_rate         DOUBLE PRECISION NOT NULL,
  max_simultaneous      INTEGER NOT NULL DEFAULT 2,
  power_kw              DOUBLE PRECISION NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'ativa'
    CHECK (status IN ('ativa','inativa','manutencao')),
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pump_houses_farm ON pump_houses(farm_id);

-- --------------------------------------------------------------------------
-- 30. PUMP_HOUSE_PIVOTS (vinculo casa de bomba <-> pivo — Sprint 8)
-- --------------------------------------------------------------------------
CREATE TABLE pump_house_pivots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_house_id     UUID NOT NULL REFERENCES pump_houses(id) ON DELETE CASCADE,
  pivot_id          UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  hydraulic_line    TEXT NOT NULL DEFAULT 'A',
  priority_order    INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pump_house_id, pivot_id)
);

CREATE INDEX idx_php_pump ON pump_house_pivots(pump_house_id);
CREATE INDEX idx_php_pivot ON pump_house_pivots(pivot_id);

-- --------------------------------------------------------------------------
-- 31. DAILY_SCHEDULES (programacao diaria — Sprint 8)
-- --------------------------------------------------------------------------
CREATE TABLE daily_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  schedule_date         DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aprovado','executando','concluido','cancelado')),
  total_volume_m3       DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_energy_kwh      DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_cost            DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_duration_h      DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_demand_kw        DOUBLE PRECISION NOT NULL DEFAULT 0,
  contracted_demand_kw  DOUBLE PRECISION NOT NULL DEFAULT 0,
  observations          TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(farm_id, schedule_date)
);

CREATE INDEX idx_ds_farm ON daily_schedules(farm_id);
CREATE INDEX idx_ds_date ON daily_schedules(schedule_date DESC);
CREATE INDEX idx_ds_status ON daily_schedules(status);

-- --------------------------------------------------------------------------
-- 32. SCHEDULE_SLOTS (slots individuais de irrigacao — Sprint 8)
-- --------------------------------------------------------------------------
CREATE TABLE schedule_slots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           UUID NOT NULL REFERENCES daily_schedules(id) ON DELETE CASCADE,
  pivot_id              UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  recommendation_id     UUID REFERENCES irrigation_recommendations(id) ON DELETE SET NULL,
  pump_house_id         UUID REFERENCES pump_houses(id) ON DELETE SET NULL,
  sequence_order        INTEGER NOT NULL,
  start_time            TEXT NOT NULL,
  end_time              TEXT NOT NULL,
  duration_h            DOUBLE PRECISION NOT NULL,
  net_depth             DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_depth           DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3             DOUBLE PRECISION NOT NULL DEFAULT 0,
  energy_kwh            DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost                  DOUBLE PRECISION NOT NULL DEFAULT 0,
  slot_status           TEXT NOT NULL DEFAULT 'agendado'
    CHECK (slot_status IN ('agendado','executando','concluido','cancelado','bloqueado')),
  can_simultaneous      BOOLEAN NOT NULL DEFAULT false,
  simultaneous_group    INTEGER,
  hydraulic_line        TEXT,
  deficit_irrigation    BOOLEAN NOT NULL DEFAULT false,
  justification         TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ss_schedule ON schedule_slots(schedule_id);
CREATE INDEX idx_ss_pivot ON schedule_slots(pivot_id);
CREATE INDEX idx_ss_status ON schedule_slots(slot_status);

-- --------------------------------------------------------------------------
-- 33. ENERGY_CONSUMPTION (consumo energetico — Sprint 9)
-- --------------------------------------------------------------------------
CREATE TABLE energy_consumption (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id              UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  pump_house_id         UUID REFERENCES pump_houses(id) ON DELETE SET NULL,
  schedule_slot_id      UUID REFERENCES schedule_slots(id) ON DELETE SET NULL,
  consumption_date      DATE NOT NULL,
  operating_hours       DOUBLE PRECISION NOT NULL DEFAULT 0,
  power_kw              DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumption_kwh       DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_kwh              DOUBLE PRECISION NOT NULL DEFAULT 0,
  off_peak_kwh          DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_peak             DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_off_peak         DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_total            DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_kw             DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3             DOUBLE PRECISION NOT NULL DEFAULT 0,
  depth_mm              DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_m3            DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_mm            DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_m3           DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_mm           DOUBLE PRECISION NOT NULL DEFAULT 0,
  tariff_type           TEXT NOT NULL DEFAULT 'verde',
  source                TEXT NOT NULL DEFAULT 'calculated'
    CHECK (source IN ('calculated','manual','import')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ec_farm ON energy_consumption(farm_id);
CREATE INDEX idx_ec_pivot ON energy_consumption(pivot_id);
CREATE INDEX idx_ec_pump ON energy_consumption(pump_house_id);
CREATE INDEX idx_ec_date ON energy_consumption(consumption_date DESC);

-- --------------------------------------------------------------------------
-- 34. ENERGY_DEMAND (demanda eletrica mensal — Sprint 9)
-- --------------------------------------------------------------------------
CREATE TABLE energy_demand (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                 UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  reference_month         DATE NOT NULL,
  contracted_demand_kw    DOUBLE PRECISION NOT NULL DEFAULT 0,
  measured_demand_kw      DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_demand_kw          DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_margin_kw        DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_margin_pct       DOUBLE PRECISION NOT NULL DEFAULT 0,
  exceeds_contracted      BOOLEAN NOT NULL DEFAULT false,
  penalty_risk            DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_consumption_kwh   DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_cost              DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_cost             DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumption_cost        DOUBLE PRECISION NOT NULL DEFAULT 0,
  observations            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(farm_id, reference_month)
);

CREATE INDEX idx_ed_farm ON energy_demand(farm_id);
CREATE INDEX idx_ed_month ON energy_demand(reference_month DESC);

-- --------------------------------------------------------------------------
-- 35. ENERGY_APPORTIONMENT (rateio de custos energeticos — Sprint 9)
-- --------------------------------------------------------------------------
CREATE TABLE energy_apportionment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  reference_month       DATE NOT NULL,
  pivot_id              UUID REFERENCES pivots(id) ON DELETE SET NULL,
  culture_id            UUID REFERENCES cultures(id) ON DELETE SET NULL,
  season_id             UUID REFERENCES seasons(id) ON DELETE SET NULL,
  pump_house_id         UUID REFERENCES pump_houses(id) ON DELETE SET NULL,
  module_name           TEXT,
  cost_center           TEXT,
  method                TEXT NOT NULL DEFAULT 'volume'
    CHECK (method IN ('volume','area','hours','equal','custom')),
  total_kwh             DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_cost            DOUBLE PRECISION NOT NULL DEFAULT 0,
  apportioned_kwh       DOUBLE PRECISION NOT NULL DEFAULT 0,
  apportioned_cost      DOUBLE PRECISION NOT NULL DEFAULT 0,
  share_pct             DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_ha            DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_ha           DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_m3            DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_m3           DOUBLE PRECISION NOT NULL DEFAULT 0,
  area_ha               DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3             DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ea_farm ON energy_apportionment(farm_id);
CREATE INDEX idx_ea_month ON energy_apportionment(reference_month DESC);
CREATE INDEX idx_ea_pivot ON energy_apportionment(pivot_id);
CREATE INDEX idx_ea_culture ON energy_apportionment(culture_id);

-- --------------------------------------------------------------------------
-- 36. AUDIT_LOG (log de auditoria — Sprint 11)
-- --------------------------------------------------------------------------
CREATE TABLE audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  user_name     TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL CHECK (action IN ('create','update','delete','export','generate','approve','reject','login','logout')),
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  entity_name   TEXT DEFAULT '',
  changes       JSONB DEFAULT '{}',
  metadata      JSONB DEFAULT '{}',
  ip_address    TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_farm ON audit_log(farm_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- --------------------------------------------------------------------------
-- 37. REPORT_HISTORY (historico de relatorios — Sprint 11)
-- --------------------------------------------------------------------------
CREATE TABLE report_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  user_name     TEXT NOT NULL DEFAULT '',
  report_type   TEXT NOT NULL CHECK (report_type IN ('diario','semanal','mensal','por_pivo','por_cultura','energetico','financeiro','executivo')),
  report_name   TEXT NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  parameters    JSONB DEFAULT '{}',
  format        TEXT NOT NULL CHECK (format IN ('pdf','xlsx','csv')),
  status        TEXT NOT NULL DEFAULT 'gerado' CHECK (status IN ('gerando','gerado','erro','expirado')),
  file_size_kb  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_report_history_farm ON report_history(farm_id);
CREATE INDEX idx_report_history_type ON report_history(report_type);
CREATE INDEX idx_report_history_created ON report_history(created_at DESC);


-- ============================================================================
-- PARTE 3: TRIGGERS DE UPDATED_AT
-- ============================================================================

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_farms_updated BEFORE UPDATE ON farms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_seasons_updated BEFORE UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_modules_updated BEFORE UPDATE ON production_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cultures_updated BEFORE UPDATE ON cultures FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_soils_updated BEFORE UPDATE ON soils FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pivots_updated BEFORE UPDATE ON pivots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pca_updated BEFORE UPDATE ON pivot_crop_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_stations_updated BEFORE UPDATE ON weather_stations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON irrigation_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sensors_updated BEFORE UPDATE ON sensors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reservoirs_updated BEFORE UPDATE ON reservoirs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tariffs_updated BEFORE UPDATE ON energy_tariffs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cost_centers_updated BEFORE UPDATE ON cost_centers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cost_entries_updated BEFORE UPDATE ON cost_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_soil_layers_updated BEFORE UPDATE ON soil_layers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_culture_varieties_updated BEFORE UPDATE ON culture_varieties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_culture_phases_updated BEFORE UPDATE ON culture_phases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON irrigation_recommendations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pump_houses_updated BEFORE UPDATE ON pump_houses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ds_updated BEFORE UPDATE ON daily_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ss_updated BEFORE UPDATE ON schedule_slots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ec_updated BEFORE UPDATE ON energy_consumption FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ed_updated BEFORE UPDATE ON energy_demand FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ea_updated BEFORE UPDATE ON energy_apportionment FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- PARTE 4: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Ativar RLS em TODAS as tabelas
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_farm_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cultures ENABLE ROW LEVEL SECURITY;
ALTER TABLE soils ENABLE ROW LEVEL SECURITY;
ALTER TABLE pivots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pivot_crop_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservoirs ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_house_pivots ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_demand ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_apportionment ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

-- Funcoes auxiliares de RLS
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth_farm_ids()
RETURNS SETOF UUID AS $$
  SELECT farm_id FROM user_farm_access WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── COMPANIES ──
CREATE POLICY "users_view_own_company" ON companies
  FOR SELECT USING (id = auth_company_id());
CREATE POLICY "admins_update_own_company" ON companies
  FOR UPDATE USING (id = auth_company_id() AND auth_user_role() = 'admin');

-- ── USERS ──
CREATE POLICY "users_view_company_users" ON users
  FOR SELECT USING (company_id = auth_company_id());
CREATE POLICY "admins_manage_users" ON users
  FOR ALL USING (company_id = auth_company_id() AND auth_user_role() = 'admin');

-- ── FARMS ──
CREATE POLICY "users_view_accessible_farms" ON farms
  FOR SELECT USING (
    company_id = auth_company_id()
    AND id IN (SELECT auth_farm_ids())
  );
CREATE POLICY "admins_manage_farms" ON farms
  FOR ALL USING (company_id = auth_company_id() AND auth_user_role() IN ('admin', 'manager'));

-- ── USER_FARM_ACCESS ──
CREATE POLICY "users_view_own_access" ON user_farm_access
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "admins_manage_access" ON user_farm_access
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.company_id = auth_company_id()
      AND users.role = 'admin'
    )
  );

-- ── TABELAS COM farm_id (padrao) ──
CREATE POLICY "farm_access_seasons" ON seasons
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_modules" ON production_modules
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_soils" ON soils
  FOR ALL USING (farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_pivots" ON pivots
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_stations" ON weather_stations
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_sensors" ON sensors
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_reservoirs" ON reservoirs
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_tariffs" ON energy_tariffs
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_cost_centers" ON cost_centers
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_cost_entries" ON cost_entries
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_alerts" ON alerts
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_recommendations" ON irrigation_recommendations
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_pump_houses" ON pump_houses
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_daily_schedules" ON daily_schedules
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_energy_consumption" ON energy_consumption
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_energy_demand" ON energy_demand
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "farm_access_energy_apportionment" ON energy_apportionment
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- ── CULTURES (globais — visiveis a todos autenticados) ──
CREATE POLICY "authenticated_view_cultures" ON cultures
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins_manage_cultures" ON cultures
  FOR ALL USING (auth_user_role() = 'admin');

-- ── CULTURE sub-tabelas (mesma regra: global para autenticados) ──
CREATE POLICY "authenticated_view_culture_varieties" ON culture_varieties
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins_manage_culture_varieties" ON culture_varieties
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "authenticated_view_culture_phases" ON culture_phases
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins_manage_culture_phases" ON culture_phases
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "authenticated_view_culture_history" ON culture_history
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins_manage_culture_history" ON culture_history
  FOR ALL USING (auth_user_role() = 'admin');

-- ── TABELAS COM FK composta (acesso via joins) ──
CREATE POLICY "farm_access_pca" ON pivot_crop_assignments
  FOR ALL USING (
    pivot_id IN (SELECT id FROM pivots WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_wb" ON water_balances
  FOR ALL USING (
    pivot_crop_assignment_id IN (
      SELECT pca.id FROM pivot_crop_assignments pca
      JOIN pivots p ON p.id = pca.pivot_id
      WHERE p.farm_id IN (SELECT auth_farm_ids())
    )
  );

CREATE POLICY "farm_access_readings" ON weather_readings
  FOR ALL USING (
    station_id IN (SELECT id FROM weather_stations WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_sensor_readings" ON sensor_readings
  FOR ALL USING (
    sensor_id IN (SELECT id FROM sensors WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_schedules" ON irrigation_schedules
  FOR ALL USING (
    pivot_id IN (SELECT id FROM pivots WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_events" ON irrigation_events
  FOR ALL USING (
    pivot_id IN (SELECT id FROM pivots WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_pump_house_pivots" ON pump_house_pivots
  FOR ALL USING (
    pump_house_id IN (SELECT id FROM pump_houses WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_schedule_slots" ON schedule_slots
  FOR ALL USING (
    schedule_id IN (SELECT id FROM daily_schedules WHERE farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_soil_layers" ON soil_layers
  FOR ALL USING (
    soil_id IN (SELECT id FROM soils WHERE farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids()))
  );

CREATE POLICY "farm_access_soil_history" ON soil_history
  FOR ALL USING (
    soil_id IN (SELECT id FROM soils WHERE farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids()))
  );

-- ── AUDIT_LOG e REPORT_HISTORY ──
CREATE POLICY "audit_log_select" ON audit_log
  FOR SELECT USING (farm_id IN (SELECT auth_farm_ids()));
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (farm_id IN (SELECT auth_farm_ids()));

CREATE POLICY "report_history_select" ON report_history
  FOR SELECT USING (farm_id IN (SELECT auth_farm_ids()));
CREATE POLICY "report_history_insert" ON report_history
  FOR INSERT WITH CHECK (farm_id IN (SELECT auth_farm_ids()));


-- ============================================================================
-- PARTE 5: VIEWS
-- ============================================================================

-- View: pivos com cultura e modulo da safra ativa
CREATE OR REPLACE VIEW v_pivot_overview AS
SELECT
  p.id AS pivot_id,
  p.name AS pivot_name,
  p.area,
  p.flow_rate,
  p.pump_power,
  p.efficiency,
  p.status,
  p.latitude,
  p.longitude,
  p.farm_id,
  pm.name AS module_name,
  c.name AS culture_name,
  pca.crop_stage,
  pca.planting_date,
  s.name AS soil_name,
  s.field_capacity,
  s.wilting_point,
  c.root_depth,
  c.depletion_factor,
  c.kc_by_stage,
  se.name AS season_name,
  pca.id AS assignment_id
FROM pivots p
LEFT JOIN pivot_crop_assignments pca ON pca.pivot_id = p.id AND pca.active = true
LEFT JOIN cultures c ON c.id = pca.culture_id
LEFT JOIN soils s ON s.id = pca.soil_id
LEFT JOIN seasons se ON se.id = pca.season_id
LEFT JOIN production_modules pm ON pm.id = p.module_id
WHERE p.active = true;

-- View: ultimo balanco hidrico por pivo
CREATE OR REPLACE VIEW v_latest_water_balance AS
SELECT DISTINCT ON (wb.pivot_crop_assignment_id)
  wb.*,
  pca.pivot_id,
  pca.season_id,
  pca.culture_id,
  pca.crop_stage
FROM water_balances wb
JOIN pivot_crop_assignments pca ON pca.id = wb.pivot_crop_assignment_id
ORDER BY wb.pivot_crop_assignment_id, wb.date DESC;

-- View: resumo de alertas nao resolvidos por fazenda
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT
  a.farm_id,
  a.severity,
  COUNT(*) AS count
FROM alerts a
WHERE a.resolved_at IS NULL
GROUP BY a.farm_id, a.severity;

-- View: status dos sensores por fazenda
CREATE OR REPLACE VIEW v_sensor_status AS
SELECT
  s.farm_id,
  s.type,
  s.status,
  COUNT(*) AS count
FROM sensors s
WHERE s.active = true
GROUP BY s.farm_id, s.type, s.status;


-- ============================================================================
-- PARTE 6: TRIGGER DE AUTH (criacao automatica de perfil)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, company_id, name, email, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'company_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove trigger se existir (seguranca)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================================
-- PARTE 7: SEEDS MINIMOS (culturas padrao FAO-56)
-- ============================================================================

INSERT INTO cultures (name, scientific_name, kc_by_stage, root_depth, depletion_factor, cycle_days, culture_group, description, status)
VALUES
  (
    'Soja',
    'Glycine max',
    '{"germinacao": 0.4, "vegetativo": 0.8, "floracao": 1.15, "enchimento": 1.0, "maturacao": 0.5, "colheita": 0.3}',
    0.6,
    0.5,
    120,
    'graos',
    'Soja — coeficientes Kc padrao FAO-56',
    'ativo'
  ),
  (
    'Milho',
    'Zea mays',
    '{"germinacao": 0.3, "vegetativo": 0.7, "floracao": 1.2, "enchimento": 1.05, "maturacao": 0.6, "colheita": 0.35}',
    0.7,
    0.55,
    140,
    'graos',
    'Milho — coeficientes Kc padrao FAO-56',
    'ativo'
  ),
  (
    'Algodao',
    'Gossypium hirsutum',
    '{"germinacao": 0.35, "vegetativo": 0.75, "floracao": 1.2, "enchimento": 1.05, "maturacao": 0.65, "colheita": 0.4}',
    0.8,
    0.65,
    180,
    'fibras',
    'Algodao — coeficientes Kc padrao FAO-56',
    'ativo'
  ),
  (
    'Feijao',
    'Phaseolus vulgaris',
    '{"germinacao": 0.4, "vegetativo": 0.7, "floracao": 1.1, "enchimento": 0.9, "maturacao": 0.35, "colheita": 0.3}',
    0.4,
    0.45,
    90,
    'graos',
    'Feijao — coeficientes Kc padrao FAO-56',
    'ativo'
  ),
  (
    'Cafe',
    'Coffea arabica',
    '{"germinacao": 0.9, "vegetativo": 0.95, "floracao": 1.1, "enchimento": 1.05, "maturacao": 0.95, "colheita": 0.9}',
    1.0,
    0.4,
    365,
    'perenes',
    'Cafe arabica — coeficientes Kc adaptados',
    'ativo'
  ),
  (
    'Cana-de-acucar',
    'Saccharum officinarum',
    '{"germinacao": 0.4, "vegetativo": 0.8, "floracao": 1.25, "enchimento": 1.1, "maturacao": 0.75, "colheita": 0.5}',
    0.8,
    0.65,
    365,
    'perenes',
    'Cana-de-acucar — coeficientes Kc padrao FAO-56',
    'ativo'
  ),
  (
    'Trigo',
    'Triticum aestivum',
    '{"germinacao": 0.3, "vegetativo": 0.7, "floracao": 1.15, "enchimento": 0.95, "maturacao": 0.4, "colheita": 0.25}',
    0.6,
    0.55,
    120,
    'graos',
    'Trigo — coeficientes Kc padrao FAO-56',
    'ativo'
  ),
  (
    'Sorgo',
    'Sorghum bicolor',
    '{"germinacao": 0.3, "vegetativo": 0.7, "floracao": 1.1, "enchimento": 0.95, "maturacao": 0.55, "colheita": 0.35}',
    0.6,
    0.55,
    120,
    'graos',
    'Sorgo — coeficientes Kc padrao FAO-56',
    'ativo'
  )
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- FIM DO SCRIPT — Todas as 38 tabelas criadas com sucesso
-- ============================================================================
-- Para verificar, execute:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================================
