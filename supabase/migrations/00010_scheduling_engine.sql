-- ============================================================================
-- Sprint 8: Motor de Programação Operacional
-- ============================================================================

-- 1. Casas de bomba
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
CREATE TRIGGER trg_pump_houses_updated BEFORE UPDATE ON pump_houses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Vínculo casa de bomba ↔ pivô
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

-- 3. Programação diária da fazenda
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
CREATE TRIGGER trg_ds_updated BEFORE UPDATE ON daily_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Slots individuais dentro da programação
CREATE TABLE schedule_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id         UUID NOT NULL REFERENCES daily_schedules(id) ON DELETE CASCADE,
  pivot_id            UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  recommendation_id   UUID REFERENCES irrigation_recommendations(id) ON DELETE SET NULL,
  pump_house_id       UUID REFERENCES pump_houses(id) ON DELETE SET NULL,
  sequence_order      INTEGER NOT NULL,
  start_time          TEXT NOT NULL,
  end_time            TEXT NOT NULL,
  duration_h          DOUBLE PRECISION NOT NULL,
  net_depth           DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_depth         DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3           DOUBLE PRECISION NOT NULL DEFAULT 0,
  energy_kwh          DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost                DOUBLE PRECISION NOT NULL DEFAULT 0,
  slot_status         TEXT NOT NULL DEFAULT 'agendado'
    CHECK (slot_status IN ('agendado','executando','concluido','cancelado','bloqueado')),
  can_simultaneous    BOOLEAN NOT NULL DEFAULT false,
  simultaneous_group  INTEGER,
  hydraulic_line      TEXT,
  deficit_irrigation  BOOLEAN NOT NULL DEFAULT false,
  justification       TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ss_schedule ON schedule_slots(schedule_id);
CREATE INDEX idx_ss_pivot ON schedule_slots(pivot_id);
CREATE INDEX idx_ss_status ON schedule_slots(slot_status);
CREATE TRIGGER trg_ss_updated BEFORE UPDATE ON schedule_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
