-- ============================================================================
-- Etapa J — Custo do evento real de irrigação
-- ----------------------------------------------------------------------------
-- Aditivo. Sem DROP. energy_kwh e cost já existem em irrigation_events.
-- Sem tarifa / potência, permanecem NULL (não inventar).
-- ============================================================================

ALTER TABLE irrigation_events ADD COLUMN IF NOT EXISTS tariff_rate DOUBLE PRECISION
  CHECK (tariff_rate IS NULL OR tariff_rate >= 0);
ALTER TABLE irrigation_events ADD COLUMN IF NOT EXISTS energy_source TEXT
  CHECK (energy_source IS NULL OR energy_source IN (
    'specific_consumption','installed_kw','pump_power'
  ));

COMMENT ON COLUMN irrigation_events.energy_kwh IS
  'Energia do evento (kWh). E = (Pot CV × 0,7355 / η) × h, ou kWh/m³ × volume. NULL se a ficha não tem potência.';
COMMENT ON COLUMN irrigation_events.cost IS
  'Custo do evento (R$). C = E × tarifa. NULL se não há tarifa da fazenda nem R$/kWh na ficha.';
COMMENT ON COLUMN irrigation_events.tariff_rate IS
  'Tarifa efetiva usada no evento (R$/kWh). Auditoria da Etapa J.';
COMMENT ON COLUMN irrigation_events.energy_source IS
  'Origem da energia: consumo específico, kW instalado ou potência CV.';

COMMENT ON COLUMN pivot_crop_assignments.total_energy_kwh IS
  'Soma de energy_kwh dos eventos do ciclo no encerramento (Etapa J).';
COMMENT ON COLUMN pivot_crop_assignments.total_cost IS
  'Soma de cost dos eventos do ciclo no encerramento (Etapa J).';
