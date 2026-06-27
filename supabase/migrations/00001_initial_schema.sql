-- ============================================================================
-- Cotrim Irrigação Pro — Migração inicial
-- 22 tabelas baseadas na modelagem aprovada (ETAPA 2)
-- Foco: 70% irrigação / 20% energia+custos / 10% futuro
-- ============================================================================

-- ============================================================================
-- 1. EMPRESAS (multi-tenant root)
-- ============================================================================
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  cnpj        TEXT NOT NULL UNIQUE,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  address     TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. PERFIS DE USUÁRIO (estende auth.users do Supabase)
-- ============================================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin', 'manager', 'operator', 'viewer')),
  active      BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- 3. FAZENDAS
-- ============================================================================
CREATE TABLE farms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  altitude      DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_area    DOUBLE PRECISION NOT NULL,
  irrigated_area DOUBLE PRECISION NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_farms_company ON farms(company_id);

-- ============================================================================
-- 4. ACESSO USUÁRIO ↔ FAZENDA (multi-fazenda)
-- ============================================================================
CREATE TABLE user_farm_access (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id   UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, farm_id)
);

CREATE INDEX idx_user_farm_user ON user_farm_access(user_id);
CREATE INDEX idx_user_farm_farm ON user_farm_access(farm_id);

-- ============================================================================
-- 5. SAFRAS
-- ============================================================================
CREATE TABLE seasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

CREATE INDEX idx_seasons_farm ON seasons(farm_id);
CREATE INDEX idx_seasons_active ON seasons(farm_id, active) WHERE active = true;

-- ============================================================================
-- 6. MÓDULOS PRODUTIVOS
-- ============================================================================
CREATE TABLE production_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  total_area  DOUBLE PRECISION NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modules_farm ON production_modules(farm_id);

-- ============================================================================
-- 7. CULTURAS
-- ============================================================================
CREATE TABLE cultures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  scientific_name TEXT,
  kc_by_stage     JSONB NOT NULL DEFAULT '{}',
  root_depth      DOUBLE PRECISION NOT NULL,
  depletion_factor DOUBLE PRECISION NOT NULL CHECK (depletion_factor BETWEEN 0 AND 1),
  cycle_days      INTEGER NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. SOLOS
-- ============================================================================
CREATE TABLE soils (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID REFERENCES farms(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  texture          TEXT NOT NULL
                   CHECK (texture IN ('arenoso','franco-arenoso','franco','franco-argiloso','argiloso','muito-argiloso')),
  field_capacity   DOUBLE PRECISION NOT NULL,
  wilting_point    DOUBLE PRECISION NOT NULL,
  bulk_density     DOUBLE PRECISION NOT NULL,
  infiltration_rate DOUBLE PRECISION NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (field_capacity > wilting_point)
);

CREATE INDEX idx_soils_farm ON soils(farm_id);

-- ============================================================================
-- 9. PIVÔS CENTRAIS
-- ============================================================================
CREATE TABLE pivots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  module_id     UUID REFERENCES production_modules(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  area          DOUBLE PRECISION NOT NULL,
  radius        DOUBLE PRECISION NOT NULL,
  flow_rate     DOUBLE PRECISION NOT NULL,
  pump_power    DOUBLE PRECISION NOT NULL,
  motor_efficiency DOUBLE PRECISION NOT NULL DEFAULT 0.88,
  efficiency    DOUBLE PRECISION NOT NULL CHECK (efficiency BETWEEN 0 AND 1),
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  status        TEXT NOT NULL DEFAULT 'parado'
                CHECK (status IN ('irrigando','parado','manutencao','alerta')),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pivots_farm ON pivots(farm_id);
CREATE INDEX idx_pivots_module ON pivots(module_id);
CREATE INDEX idx_pivots_status ON pivots(status);

-- ============================================================================
-- 10. VÍNCULO PIVÔ ↔ SAFRA ↔ CULTURA ↔ SOLO
-- ============================================================================
CREATE TABLE pivot_crop_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id    UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  season_id   UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  culture_id  UUID NOT NULL REFERENCES cultures(id) ON DELETE RESTRICT,
  soil_id     UUID NOT NULL REFERENCES soils(id) ON DELETE RESTRICT,
  crop_stage  TEXT NOT NULL DEFAULT 'germinacao'
              CHECK (crop_stage IN ('germinacao','vegetativo','floracao','enchimento','maturacao','colheita')),
  planting_date DATE NOT NULL,
  expected_harvest_date DATE,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_id, season_id)
);

CREATE INDEX idx_pca_pivot ON pivot_crop_assignments(pivot_id);
CREATE INDEX idx_pca_season ON pivot_crop_assignments(season_id);
CREATE INDEX idx_pca_culture ON pivot_crop_assignments(culture_id);

-- ============================================================================
-- 11. ESTAÇÕES METEOROLÓGICAS
-- ============================================================================
CREATE TABLE weather_stations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  model       TEXT,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  altitude    DOUBLE PRECISION NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  installed_at DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_weather_stations_farm ON weather_stations(farm_id);

-- ============================================================================
-- 12. LEITURAS METEOROLÓGICAS
-- ============================================================================
CREATE TABLE weather_readings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  temp_max        DOUBLE PRECISION NOT NULL,
  temp_min        DOUBLE PRECISION NOT NULL,
  temp_mean       DOUBLE PRECISION NOT NULL,
  humidity        DOUBLE PRECISION NOT NULL,
  wind_speed      DOUBLE PRECISION NOT NULL,
  solar_radiation DOUBLE PRECISION NOT NULL,
  precipitation   DOUBLE PRECISION NOT NULL DEFAULT 0,
  sunshine        DOUBLE PRECISION,
  et0_calculated  DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(station_id, date)
);

CREATE INDEX idx_weather_readings_station_date ON weather_readings(station_id, date DESC);

-- ============================================================================
-- 13. BALANÇO HÍDRICO (com recomendação embutida)
-- ============================================================================
CREATE TABLE water_balances (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_crop_assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  date                    DATE NOT NULL,
  et0                     DOUBLE PRECISION NOT NULL,
  kc                      DOUBLE PRECISION NOT NULL,
  etc                     DOUBLE PRECISION NOT NULL,
  effective_precipitation DOUBLE PRECISION NOT NULL DEFAULT 0,
  applied_depth           DOUBLE PRECISION NOT NULL DEFAULT 0,
  deficit                 DOUBLE PRECISION NOT NULL DEFAULT 0,
  cad                     DOUBLE PRECISION NOT NULL,
  afd                     DOUBLE PRECISION NOT NULL,
  soil_storage            DOUBLE PRECISION NOT NULL,
  -- Recomendação embutida
  recommended_depth       DOUBLE PRECISION,
  recommended_volume      DOUBLE PRECISION,
  recommended_time        DOUBLE PRECISION,
  estimated_energy        DOUBLE PRECISION,
  estimated_cost          DOUBLE PRECISION,
  priority                TEXT CHECK (priority IN ('alta','media','baixa')),
  productive_risk         DOUBLE PRECISION CHECK (productive_risk BETWEEN 0 AND 100),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_crop_assignment_id, date)
);

CREATE INDEX idx_wb_pca_date ON water_balances(pivot_crop_assignment_id, date DESC);
CREATE INDEX idx_wb_priority ON water_balances(priority) WHERE priority = 'alta';

-- ============================================================================
-- 14. PROGRAMAÇÃO DE IRRIGAÇÃO (planejamento)
-- ============================================================================
CREATE TABLE irrigation_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id      UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  season_id     UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_start TIMESTAMPTZ,
  depth_mm      DOUBLE PRECISION NOT NULL,
  volume_m3     DOUBLE PRECISION NOT NULL,
  duration_hours DOUBLE PRECISION NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','confirmada','em_execucao','concluida','cancelada')),
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_pivot ON irrigation_schedules(pivot_id);
CREATE INDEX idx_schedules_date ON irrigation_schedules(scheduled_date);
CREATE INDEX idx_schedules_status ON irrigation_schedules(status);

-- ============================================================================
-- 15. EVENTOS DE IRRIGAÇÃO (execução real)
-- ============================================================================
CREATE TABLE irrigation_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id      UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  schedule_id   UUID REFERENCES irrigation_schedules(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ,
  depth_mm      DOUBLE PRECISION NOT NULL,
  volume_m3     DOUBLE PRECISION NOT NULL,
  energy_kwh    DOUBLE PRECISION,
  cost          DOUBLE PRECISION,
  status        TEXT NOT NULL DEFAULT 'em_execucao'
                CHECK (status IN ('em_execucao','concluida','interrompida')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_pivot ON irrigation_events(pivot_id);
CREATE INDEX idx_events_started ON irrigation_events(started_at DESC);

-- ============================================================================
-- 16. SENSORES
-- ============================================================================
CREATE TABLE sensors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id         UUID REFERENCES pivots(id) ON DELETE SET NULL,
  reservoir_id     UUID,  -- FK added after reservoirs table
  name             TEXT NOT NULL,
  type             TEXT NOT NULL
                   CHECK (type IN ('umidade_solo','temperatura_solo','nivel_reservatorio','vazao','pressao','pluviometro','estacao_meteorologica')),
  model            TEXT,
  unit             TEXT NOT NULL,
  reading_interval INTEGER NOT NULL DEFAULT 15,
  status           TEXT NOT NULL DEFAULT 'offline'
                   CHECK (status IN ('online','offline','alerta','manutencao')),
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  installed_at     DATE,
  last_reading_at  TIMESTAMPTZ,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sensors_farm ON sensors(farm_id);
CREATE INDEX idx_sensors_pivot ON sensors(pivot_id);
CREATE INDEX idx_sensors_type ON sensors(type);
CREATE INDEX idx_sensors_status ON sensors(status);

-- ============================================================================
-- 17. LEITURAS DE SENSORES
-- ============================================================================
CREATE TABLE sensor_readings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id  UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT now(),
  value      DOUBLE PRECISION NOT NULL,
  unit       TEXT NOT NULL
);

CREATE INDEX idx_sensor_readings_sensor_ts ON sensor_readings(sensor_id, timestamp DESC);

-- ============================================================================
-- 18. RESERVATÓRIOS
-- ============================================================================
CREATE TABLE reservoirs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL
                        CHECK (type IN ('represa','lago','poco','rio','reservatorio')),
  max_capacity          DOUBLE PRECISION NOT NULL,
  current_volume        DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_operational_level DOUBLE PRECISION NOT NULL DEFAULT 0,
  recharge_rate         DOUBLE PRECISION NOT NULL DEFAULT 0,
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservoirs_farm ON reservoirs(farm_id);

-- FK de sensors.reservoir_id
ALTER TABLE sensors
  ADD CONSTRAINT fk_sensors_reservoir
  FOREIGN KEY (reservoir_id) REFERENCES reservoirs(id) ON DELETE SET NULL;

-- ============================================================================
-- 19. TARIFAS DE ENERGIA
-- ============================================================================
CREATE TABLE energy_tariffs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tariff_type      TEXT NOT NULL CHECK (tariff_type IN ('verde','azul','convencional')),
  demand_rate      DOUBLE PRECISION NOT NULL DEFAULT 0,
  rate_peak        DOUBLE PRECISION NOT NULL,
  rate_off_peak    DOUBLE PRECISION NOT NULL,
  rate_reserved    DOUBLE PRECISION,
  peak_start       INTEGER NOT NULL DEFAULT 18,
  peak_end         INTEGER NOT NULL DEFAULT 21,
  valid_from       DATE NOT NULL,
  valid_to         DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tariffs_farm ON energy_tariffs(farm_id);

-- ============================================================================
-- 20. CENTROS DE CUSTO
-- ============================================================================
CREATE TABLE cost_centers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_centers_farm ON cost_centers(farm_id);

-- ============================================================================
-- 21. LANÇAMENTOS DE CUSTO
-- ============================================================================
CREATE TABLE cost_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id        UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  pivot_id       UUID REFERENCES pivots(id) ON DELETE SET NULL,
  culture_id     UUID REFERENCES cultures(id) ON DELETE SET NULL,
  season_id      UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category       TEXT NOT NULL
                 CHECK (category IN ('energia','manutencao','mao_de_obra','insumos','depreciacao','outros')),
  description    TEXT NOT NULL,
  amount         DOUBLE PRECISION NOT NULL,
  date           DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_entries_farm ON cost_entries(farm_id);
CREATE INDEX idx_cost_entries_season ON cost_entries(season_id);
CREATE INDEX idx_cost_entries_category ON cost_entries(category);

-- ============================================================================
-- 22. ALERTAS
-- ============================================================================
CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id        UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id       UUID REFERENCES pivots(id) ON DELETE SET NULL,
  sensor_id      UUID REFERENCES sensors(id) ON DELETE SET NULL,
  reservoir_id   UUID REFERENCES reservoirs(id) ON DELETE SET NULL,
  severity       TEXT NOT NULL
                 CHECK (severity IN ('critico','alto','medio','baixo','info')),
  category       TEXT NOT NULL
                 CHECK (category IN ('deficit_hidrico','equipamento','sensor','reservatorio','energia','clima','sistema')),
  title          TEXT NOT NULL,
  message        TEXT NOT NULL,
  acknowledged   BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_farm ON alerts(farm_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_unresolved ON alerts(farm_id, resolved_at) WHERE resolved_at IS NULL;

-- ============================================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
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
