-- ============================================================================
-- Sprint 13 · Etapa 1a — Pivô como Equipamento (dados técnicos puros)
-- ----------------------------------------------------------------------------
-- Adiciona campo `cuc` (Coeficiente de Uniformidade de Christiansen),
-- que substitui semanticamente o campo `efficiency` (que era ambíguo entre
-- "eficiência do motor" e "eficiência de aplicação").
--
-- Compatibilidade:
--   • `efficiency` NÃO é removido nesta migration — sprint futura (Etapa 6)
--     remove após todos os consumidores lerem `cuc`.
--   • `status` NÃO é removido — ainda usado por dashboard e alertas.
--   • `cost_per_hectare` NÃO é removido — reports ainda lê. Marca como
--     deprecated via COMMENT (vai virar campo calculado da parcela).
-- ============================================================================

-- ── CUC (Coeficiente de Uniformidade de Christiansen) ──────────────────────
-- Faixa típica de campo: 0,80 – 0,95 (valores baixos indicam bocais desgastados
-- ou pressão fora de especificação). É medido com pluviômetros embaixo do pivô.
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS cuc DOUBLE PRECISION
  CHECK (cuc IS NULL OR (cuc BETWEEN 0 AND 1));

COMMENT ON COLUMN pivots.cuc IS
  'Coeficiente de Uniformidade de Christiansen (0-1). Medido em teste de campo. Substitui o campo application efficiency.';

-- Migração de dados: copia efficiency existente para cuc (assume que
-- efficiency vinha sendo usado como eficiência de aplicação).
UPDATE pivots SET cuc = efficiency WHERE cuc IS NULL AND efficiency IS NOT NULL;

-- Marca campos deprecados via COMMENT
COMMENT ON COLUMN pivots.efficiency IS
  'DEPRECATED (Sprint 13). Use `cuc` para o Coeficiente de Uniformidade. Será removido em sprint futura.';

COMMENT ON COLUMN pivots.cost_per_hectare IS
  'DEPRECATED (Sprint 13). Custo por hectare depende da lâmina aplicada na safra — passa a ser calculado no relatório da parcela, não fixo no equipamento.';

COMMENT ON COLUMN pivots.status IS
  'DEPRECATED (Sprint 13) para tela de Equipamentos. Status operacional será derivado da parcela ativa + operações registradas.';

-- ── Metadados de auditoria de cálculos ─────────────────────────────────────
-- Marca se cada campo foi digitado (source='manual') ou auto-calculado
-- (source='auto'), pra debug/transparência.
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS radius_source TEXT DEFAULT 'manual'
  CHECK (radius_source IN ('manual','auto'));
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS full_turn_time_source TEXT DEFAULT 'manual'
  CHECK (full_turn_time_source IN ('manual','auto'));
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS depth_100_pct_source TEXT DEFAULT 'manual'
  CHECK (depth_100_pct_source IN ('manual','auto'));
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS installed_power_kw_source TEXT DEFAULT 'manual'
  CHECK (installed_power_kw_source IN ('manual','auto'));
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS specific_consumption_source TEXT DEFAULT 'manual'
  CHECK (specific_consumption_source IN ('manual','auto'));
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS cost_per_mm_source TEXT DEFAULT 'manual'
  CHECK (cost_per_mm_source IN ('manual','auto'));

-- ── Validações de faixa (safety net) ───────────────────────────────────────
-- Alertas suaves (não bloqueiam insert): app mostra warning se sair da faixa.
-- CHECK constraints só para valores fisicamente impossíveis.
ALTER TABLE pivots ADD CONSTRAINT chk_pivots_flow_positive
  CHECK (flow_rate IS NULL OR flow_rate > 0);
ALTER TABLE pivots ADD CONSTRAINT chk_pivots_pump_power_positive
  CHECK (pump_power IS NULL OR pump_power > 0);
ALTER TABLE pivots ADD CONSTRAINT chk_pivots_motor_efficiency_range
  CHECK (motor_efficiency IS NULL OR (motor_efficiency BETWEEN 0.5 AND 1.0));
ALTER TABLE pivots ADD CONSTRAINT chk_pivots_energy_cost_range
  CHECK (energy_cost IS NULL OR (energy_cost BETWEEN 0 AND 5));

-- ── Fim ────────────────────────────────────────────────────────────────────
