-- ============================================================================
-- Sprint 6: Motor de Balanço Hídrico — campos adicionais, índices
-- ============================================================================

-- 1. Novos campos na tabela water_balances
ALTER TABLE water_balances
  ADD COLUMN precipitation       DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN root_depth          DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  ADD COLUMN depletion_factor    DOUBLE PRECISION NOT NULL DEFAULT 0.5
             CHECK (depletion_factor BETWEEN 0 AND 1),
  ADD COLUMN surplus             DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN net_depth           DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN gross_depth         DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN volume_needed       DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN irrigation_time     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN water_status        TEXT NOT NULL DEFAULT 'ideal'
             CHECK (water_status IN ('saturado','ideal','atencao','deficit','deficit_critico'));

-- 2. Índices para consultas de status e período
CREATE INDEX idx_wb_status ON water_balances(water_status);
CREATE INDEX idx_wb_date ON water_balances(date);
