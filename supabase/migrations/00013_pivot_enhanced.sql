-- Sprint 12: Cadastro Profissional de Pivôs
-- ===================================================

-- ── Novas colunas na tabela pivots ─────────────────────────────────────

-- Geral
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS culture_id UUID REFERENCES cultures(id) ON DELETE SET NULL;

-- Características
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS pivot_type TEXT DEFAULT 'central'
  CHECK (pivot_type IN ('central', 'linear', 'rebocavel'));
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS last_tower_radius DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS service_pressure DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS speed_100_pct DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS full_turn_time DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS depth_100_pct DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS max_operating_time DOUBLE PRECISION DEFAULT 24;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS installed_power_kw DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS specific_consumption DOUBLE PRECISION;

-- Custos
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS energy_cost DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS cost_per_mm DOUBLE PRECISION;
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS cost_per_hectare DOUBLE PRECISION;

-- ── Índice para busca por cultura ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pivots_culture ON pivots(culture_id);
