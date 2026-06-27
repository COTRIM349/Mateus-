-- ============================================================================
-- Sprint 9: Motor de Energia e Rateio Inteligente
-- ============================================================================

-- 1. Configuração tarifária por fazenda
CREATE TABLE energy_tariffs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tariff_type       TEXT NOT NULL DEFAULT 'verde'
    CHECK (tariff_type IN ('verde','azul','convencional')),
  rate_peak         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rate_off_peak     DOUBLE PRECISION NOT NULL DEFAULT 0,
  rate_reserved     DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_rate       DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_start        INTEGER NOT NULL DEFAULT 18,
  peak_end          INTEGER NOT NULL DEFAULT 21,
  contracted_demand_kw  DOUBLE PRECISION NOT NULL DEFAULT 0,
  valid_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to          DATE,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_et_farm ON energy_tariffs(farm_id);
CREATE TRIGGER trg_et_updated BEFORE UPDATE ON energy_tariffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Registro de consumo energético por slot/pivô
CREATE TABLE energy_consumption (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id          UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  pump_house_id     UUID REFERENCES pump_houses(id) ON DELETE SET NULL,
  schedule_slot_id  UUID REFERENCES schedule_slots(id) ON DELETE SET NULL,
  consumption_date  DATE NOT NULL,
  operating_hours   DOUBLE PRECISION NOT NULL DEFAULT 0,
  power_kw          DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumption_kwh   DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_kwh          DOUBLE PRECISION NOT NULL DEFAULT 0,
  off_peak_kwh      DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_peak         DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_off_peak     DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_total        DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_kw         DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3         DOUBLE PRECISION NOT NULL DEFAULT 0,
  depth_mm          DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_m3        DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_mm        DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_m3       DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_mm       DOUBLE PRECISION NOT NULL DEFAULT 0,
  tariff_type       TEXT NOT NULL DEFAULT 'verde',
  source            TEXT NOT NULL DEFAULT 'calculated'
    CHECK (source IN ('calculated','manual','import')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ec_farm ON energy_consumption(farm_id);
CREATE INDEX idx_ec_pivot ON energy_consumption(pivot_id);
CREATE INDEX idx_ec_pump ON energy_consumption(pump_house_id);
CREATE INDEX idx_ec_date ON energy_consumption(consumption_date DESC);
CREATE TRIGGER trg_ec_updated BEFORE UPDATE ON energy_consumption
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Demanda elétrica (registro mensal)
CREATE TABLE energy_demand (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  reference_month       DATE NOT NULL,
  contracted_demand_kw  DOUBLE PRECISION NOT NULL DEFAULT 0,
  measured_demand_kw    DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_demand_kw        DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_margin_kw      DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_margin_pct     DOUBLE PRECISION NOT NULL DEFAULT 0,
  exceeds_contracted    BOOLEAN NOT NULL DEFAULT false,
  penalty_risk          DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_consumption_kwh DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_cost            DOUBLE PRECISION NOT NULL DEFAULT 0,
  demand_cost           DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumption_cost      DOUBLE PRECISION NOT NULL DEFAULT 0,
  observations          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(farm_id, reference_month)
);

CREATE INDEX idx_ed_farm ON energy_demand(farm_id);
CREATE INDEX idx_ed_month ON energy_demand(reference_month DESC);
CREATE TRIGGER trg_ed_updated BEFORE UPDATE ON energy_demand
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Rateio de custos energéticos
CREATE TABLE energy_apportionment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  reference_month   DATE NOT NULL,
  pivot_id          UUID REFERENCES pivots(id) ON DELETE SET NULL,
  culture_id        UUID REFERENCES cultures(id) ON DELETE SET NULL,
  season_id         UUID REFERENCES seasons(id) ON DELETE SET NULL,
  pump_house_id     UUID REFERENCES pump_houses(id) ON DELETE SET NULL,
  module_name       TEXT,
  cost_center       TEXT,
  method            TEXT NOT NULL DEFAULT 'volume'
    CHECK (method IN ('volume','area','hours','equal','custom')),
  total_kwh         DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_cost        DOUBLE PRECISION NOT NULL DEFAULT 0,
  apportioned_kwh   DOUBLE PRECISION NOT NULL DEFAULT 0,
  apportioned_cost  DOUBLE PRECISION NOT NULL DEFAULT 0,
  share_pct         DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_ha        DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_ha       DOUBLE PRECISION NOT NULL DEFAULT 0,
  kwh_per_m3        DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_per_m3       DOUBLE PRECISION NOT NULL DEFAULT 0,
  area_ha           DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3         DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ea_farm ON energy_apportionment(farm_id);
CREATE INDEX idx_ea_month ON energy_apportionment(reference_month DESC);
CREATE INDEX idx_ea_pivot ON energy_apportionment(pivot_id);
CREATE INDEX idx_ea_culture ON energy_apportionment(culture_id);
CREATE TRIGGER trg_ea_updated BEFORE UPDATE ON energy_apportionment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
