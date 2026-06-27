-- ============================================================================
-- Cotrim Irrigação Pro — Row Level Security
-- Isolamento multi-tenant: cada usuário vê apenas dados da sua empresa
-- ============================================================================

-- Ativar RLS em todas as tabelas
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

-- ============================================================================
-- Função auxiliar: company_id do usuário logado
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- Função auxiliar: farm_ids acessíveis pelo usuário logado
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_farm_ids()
RETURNS SETOF UUID AS $$
  SELECT farm_id FROM user_farm_access WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- Função auxiliar: role do usuário logado
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- COMPANIES
-- ============================================================================
CREATE POLICY "users_view_own_company" ON companies
  FOR SELECT USING (id = auth_company_id());

CREATE POLICY "admins_update_own_company" ON companies
  FOR UPDATE USING (id = auth_company_id() AND auth_user_role() = 'admin');

-- ============================================================================
-- USERS
-- ============================================================================
CREATE POLICY "users_view_company_users" ON users
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "admins_manage_users" ON users
  FOR ALL USING (company_id = auth_company_id() AND auth_user_role() = 'admin');

-- ============================================================================
-- FARMS
-- ============================================================================
CREATE POLICY "users_view_accessible_farms" ON farms
  FOR SELECT USING (
    company_id = auth_company_id()
    AND id IN (SELECT auth_farm_ids())
  );

CREATE POLICY "admins_manage_farms" ON farms
  FOR ALL USING (company_id = auth_company_id() AND auth_user_role() IN ('admin', 'manager'));

-- ============================================================================
-- USER_FARM_ACCESS
-- ============================================================================
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

-- ============================================================================
-- FARM-SCOPED TABLES (padrão: acesso pela fazenda)
-- ============================================================================

-- Macro: política padrão para tabelas com farm_id
-- Seasons
CREATE POLICY "farm_access_seasons" ON seasons
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Production Modules
CREATE POLICY "farm_access_modules" ON production_modules
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Soils
CREATE POLICY "farm_access_soils" ON soils
  FOR ALL USING (farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids()));

-- Pivots
CREATE POLICY "farm_access_pivots" ON pivots
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Weather Stations
CREATE POLICY "farm_access_stations" ON weather_stations
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Sensors
CREATE POLICY "farm_access_sensors" ON sensors
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Reservoirs
CREATE POLICY "farm_access_reservoirs" ON reservoirs
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Energy Tariffs
CREATE POLICY "farm_access_tariffs" ON energy_tariffs
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Cost Centers
CREATE POLICY "farm_access_cost_centers" ON cost_centers
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Cost Entries
CREATE POLICY "farm_access_cost_entries" ON cost_entries
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Alerts
CREATE POLICY "farm_access_alerts" ON alerts
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Irrigation Schedules
CREATE POLICY "farm_access_schedules" ON irrigation_schedules
  FOR ALL USING (
    pivot_id IN (SELECT id FROM pivots WHERE farm_id IN (SELECT auth_farm_ids()))
  );

-- Irrigation Events
CREATE POLICY "farm_access_events" ON irrigation_events
  FOR ALL USING (
    pivot_id IN (SELECT id FROM pivots WHERE farm_id IN (SELECT auth_farm_ids()))
  );

-- ============================================================================
-- CULTURES (globais — visíveis a todos os autenticados)
-- ============================================================================
CREATE POLICY "authenticated_view_cultures" ON cultures
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admins_manage_cultures" ON cultures
  FOR ALL USING (auth_user_role() = 'admin');

-- ============================================================================
-- TABELAS COM FK COMPOSTA (acesso via joins)
-- ============================================================================

-- Pivot Crop Assignments
CREATE POLICY "farm_access_pca" ON pivot_crop_assignments
  FOR ALL USING (
    pivot_id IN (SELECT id FROM pivots WHERE farm_id IN (SELECT auth_farm_ids()))
  );

-- Water Balances
CREATE POLICY "farm_access_wb" ON water_balances
  FOR ALL USING (
    pivot_crop_assignment_id IN (
      SELECT pca.id FROM pivot_crop_assignments pca
      JOIN pivots p ON p.id = pca.pivot_id
      WHERE p.farm_id IN (SELECT auth_farm_ids())
    )
  );

-- Weather Readings
CREATE POLICY "farm_access_readings" ON weather_readings
  FOR ALL USING (
    station_id IN (SELECT id FROM weather_stations WHERE farm_id IN (SELECT auth_farm_ids()))
  );

-- Sensor Readings
CREATE POLICY "farm_access_sensor_readings" ON sensor_readings
  FOR ALL USING (
    sensor_id IN (SELECT id FROM sensors WHERE farm_id IN (SELECT auth_farm_ids()))
  );
