-- ============================================================================
-- 00016 — RLS para tabelas dos Sprints 4–9
-- Habilita Row Level Security e cria políticas de acesso para as 13 tabelas
-- que foram criadas após a migration 00002 (RLS original).
-- Seguro para re-executar: DROP POLICY IF EXISTS antes de cada CREATE.
-- ============================================================================

-- ── 1. Habilitar RLS ────────────────────────────────────────────────────────

ALTER TABLE soil_layers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_varieties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_phases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_houses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_house_pivots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_consumption       ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_demand            ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_apportionment     ENABLE ROW LEVEL SECURITY;

-- ── 2. Políticas para tabelas com farm_id direto ────────────────────────────

DROP POLICY IF EXISTS "farm_access_recommendations" ON irrigation_recommendations;
CREATE POLICY "farm_access_recommendations" ON irrigation_recommendations
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_pump_houses" ON pump_houses;
CREATE POLICY "farm_access_pump_houses" ON pump_houses
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_daily_schedules" ON daily_schedules;
CREATE POLICY "farm_access_daily_schedules" ON daily_schedules
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_energy_consumption" ON energy_consumption;
CREATE POLICY "farm_access_energy_consumption" ON energy_consumption
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_energy_demand" ON energy_demand;
CREATE POLICY "farm_access_energy_demand" ON energy_demand
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_energy_apportionment" ON energy_apportionment;
CREATE POLICY "farm_access_energy_apportionment" ON energy_apportionment
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- ── 3. Políticas para tabelas com FK composta ───────────────────────────────

DROP POLICY IF EXISTS "farm_access_pump_house_pivots" ON pump_house_pivots;
CREATE POLICY "farm_access_pump_house_pivots" ON pump_house_pivots
  FOR ALL USING (
    pump_house_id IN (SELECT id FROM pump_houses WHERE farm_id IN (SELECT auth_farm_ids()))
  );

DROP POLICY IF EXISTS "farm_access_schedule_slots" ON schedule_slots;
CREATE POLICY "farm_access_schedule_slots" ON schedule_slots
  FOR ALL USING (
    schedule_id IN (SELECT id FROM daily_schedules WHERE farm_id IN (SELECT auth_farm_ids()))
  );

DROP POLICY IF EXISTS "farm_access_soil_layers" ON soil_layers;
CREATE POLICY "farm_access_soil_layers" ON soil_layers
  FOR ALL USING (
    soil_id IN (SELECT id FROM soils WHERE farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids()))
  );

DROP POLICY IF EXISTS "farm_access_soil_history" ON soil_history;
CREATE POLICY "farm_access_soil_history" ON soil_history
  FOR ALL USING (
    soil_id IN (SELECT id FROM soils WHERE farm_id IS NULL OR farm_id IN (SELECT auth_farm_ids()))
  );

-- ── 4. Culturas (globais — visíveis a todos os autenticados) ────────────────

DROP POLICY IF EXISTS "authenticated_view_culture_varieties" ON culture_varieties;
CREATE POLICY "authenticated_view_culture_varieties" ON culture_varieties
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins_manage_culture_varieties" ON culture_varieties;
CREATE POLICY "admins_manage_culture_varieties" ON culture_varieties
  FOR ALL USING (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "authenticated_view_culture_phases" ON culture_phases;
CREATE POLICY "authenticated_view_culture_phases" ON culture_phases
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins_manage_culture_phases" ON culture_phases;
CREATE POLICY "admins_manage_culture_phases" ON culture_phases
  FOR ALL USING (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "authenticated_view_culture_history" ON culture_history;
CREATE POLICY "authenticated_view_culture_history" ON culture_history
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins_manage_culture_history" ON culture_history;
CREATE POLICY "admins_manage_culture_history" ON culture_history
  FOR ALL USING (auth_user_role() = 'admin');
