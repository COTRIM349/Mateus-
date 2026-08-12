-- ============================================================================
-- Sprint 13 · Etapa 1c — Parcelas (extensão de pivot_crop_assignments)
-- ----------------------------------------------------------------------------
-- Estratégia: NÃO criamos tabela nova. Estendemos `pivot_crop_assignments`
-- para virar a entidade rica "parcela" (safra ativa em um pivô).
--
-- Por que: preserva foreign keys existentes de water_balances, irrigation_*,
-- schedule_slots, etc. Zero refactor nos motores.
--
-- Adiciona:
--   • Identidade da parcela (nome, área plantada)
--   • Variedade (referência a cultures com variety_of_id preenchido)
--   • Fonte de água + config de clima/chuva
--   • Espaçamento da cultura
--   • Manejo (fase atual, datas, tipo de irrigação, Ks/Kl overrides)
--   • Umidade inicial do solo
--   • Lifecycle (ativa/encerrada/cancelada) + yield final
--
-- Nada é removido. Migração de dados existente automática (defaults sensatos).
-- ============================================================================

-- ── IDENTIDADE DA PARCELA ──────────────────────────────────────────────────
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS planted_area DOUBLE PRECISION
  CHECK (planted_area IS NULL OR planted_area > 0);

COMMENT ON COLUMN pivot_crop_assignments.name IS
  'Nome da parcela (ex.: "Pivô 05 · Algodão 2025/26"). Se NULL, gera automático.';

COMMENT ON COLUMN pivot_crop_assignments.planted_area IS
  'Área efetivamente plantada (ha). Pode diferir da área total do pivô. Se NULL, motor usa pivots.area.';

-- ── VARIEDADE ──────────────────────────────────────────────────────────────
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS variety_id UUID
  REFERENCES cultures(id) ON DELETE SET NULL;

COMMENT ON COLUMN pivot_crop_assignments.variety_id IS
  'Variedade específica (aponta pra cultures.id onde variety_of_id = culture_id da parcela).';

CREATE INDEX IF NOT EXISTS idx_pca_variety ON pivot_crop_assignments(variety_id);

-- ── FONTE DE ÁGUA + CLIMA ──────────────────────────────────────────────────
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS water_source TEXT
  CHECK (water_source IS NULL OR water_source IN (
    'rio','poco','reservatorio','canal','outorga','misto','outro'
  ));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS water_source_note TEXT;

COMMENT ON COLUMN pivot_crop_assignments.water_source IS
  'Origem da água. Rio, poço, reservatório, canal, outorga, misto ou outro.';

-- Configuração de clima (herda da fazenda ou personalizada)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS climate_config TEXT
  DEFAULT 'farm_default'
  CHECK (climate_config IN ('farm_default','virtual_station','nearest_station','manual'));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS climate_station_id UUID
  REFERENCES weather_stations(id) ON DELETE SET NULL;

COMMENT ON COLUMN pivot_crop_assignments.climate_config IS
  'Fonte de clima usada por esta parcela. farm_default = padrão da fazenda; virtual_station = estação virtual; nearest_station = estação física mais próxima; manual = registros manuais.';

-- Opções de chuva (auto, manual, ignora)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS rain_option TEXT
  DEFAULT 'auto'
  CHECK (rain_option IN ('auto','manual','pluviometer','ignore'));

COMMENT ON COLUMN pivot_crop_assignments.rain_option IS
  'Fonte da chuva. auto = do provedor; manual = digitada; pluviometer = do pluviômetro da fazenda; ignore = não considera chuva.';

-- ── ESPAÇAMENTO DA CULTURA ─────────────────────────────────────────────────
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS plant_spacing_m DOUBLE PRECISION
  CHECK (plant_spacing_m IS NULL OR plant_spacing_m > 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS row_spacing_m DOUBLE PRECISION
  CHECK (row_spacing_m IS NULL OR row_spacing_m > 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS additional_row_spacing_m DOUBLE PRECISION
  CHECK (additional_row_spacing_m IS NULL OR additional_row_spacing_m > 0);

COMMENT ON COLUMN pivot_crop_assignments.plant_spacing_m IS 'Espaçamento entre plantas (m).';
COMMENT ON COLUMN pivot_crop_assignments.row_spacing_m IS 'Espaçamento entre linhas (m).';
COMMENT ON COLUMN pivot_crop_assignments.additional_row_spacing_m IS 'Linha adicional (m) — plantio adensado.';

-- ── MANEJO ─────────────────────────────────────────────────────────────────

-- Fase atual (referência direta em vez de string "vegetativo" solta)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS current_phase_id UUID
  REFERENCES culture_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pca_phase ON pivot_crop_assignments(current_phase_id);

COMMENT ON COLUMN pivot_crop_assignments.current_phase_id IS
  'Fase atual da parcela. Alternativa mais precisa que crop_stage (string).';

-- Datas de manejo (podem diferir do plantio)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS management_start_date DATE;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS management_end_date DATE;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS end_at_cycle_end BOOLEAN
  DEFAULT true;

COMMENT ON COLUMN pivot_crop_assignments.management_start_date IS
  'Data em que o manejo de irrigação começa (pode ser antes ou depois do plantio).';

COMMENT ON COLUMN pivot_crop_assignments.management_end_date IS
  'Data em que o manejo termina. NULL + end_at_cycle_end=true = termina no fim do ciclo automaticamente.';

-- Tipo de irrigação
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS deficit_irrigation BOOLEAN
  DEFAULT false;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS stress_point_irrigation BOOLEAN
  DEFAULT false;

COMMENT ON COLUMN pivot_crop_assignments.deficit_irrigation IS
  'Se true, aplica irrigação deficitária controlada (ITN < 100% nas fases não-críticas).';

COMMENT ON COLUMN pivot_crop_assignments.stress_point_irrigation IS
  'Se true, irriga apenas quando atinge o ponto crítico de estresse (p × ADT).';

-- Overrides da cultura (parcela-específicos)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS ks_function_override TEXT
  CHECK (ks_function_override IS NULL OR ks_function_override IN ('linear','exponential','sigmoid','none'));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS kl_override DOUBLE PRECISION
  CHECK (kl_override IS NULL OR (kl_override BETWEEN 0 AND 1));

COMMENT ON COLUMN pivot_crop_assignments.ks_function_override IS
  'Override do Ks da cultura para esta parcela. NULL = usa o da cultura.';

COMMENT ON COLUMN pivot_crop_assignments.kl_override IS
  'Override do Kl da cultura para esta parcela. NULL = usa o da cultura.';

-- Umidade inicial do solo (ao começar o manejo)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS initial_soil_moisture_pct DOUBLE PRECISION
  CHECK (initial_soil_moisture_pct IS NULL OR (initial_soil_moisture_pct BETWEEN 0 AND 100));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS initial_moisture_unit TEXT
  DEFAULT 'field_capacity_fraction'
  CHECK (initial_moisture_unit IN ('field_capacity_fraction','weight_pct','volume_pct'));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS initial_moisture_is_cc BOOLEAN
  DEFAULT true;

COMMENT ON COLUMN pivot_crop_assignments.initial_soil_moisture_pct IS
  'Umidade do solo no início do manejo. Interpretação depende de initial_moisture_unit.';

COMMENT ON COLUMN pivot_crop_assignments.initial_moisture_unit IS
  'Unidade da umidade inicial. field_capacity_fraction = fração da CC (0-100); weight_pct = % em peso; volume_pct = % em volume.';

COMMENT ON COLUMN pivot_crop_assignments.initial_moisture_is_cc IS
  'Se true, assume solo em CC no início do manejo (pré-plantio irrigado).';

-- Capacidade de campo após excesso (compactação/deep percolation)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS field_capacity_after_excess DOUBLE PRECISION
  CHECK (field_capacity_after_excess IS NULL OR (field_capacity_after_excess BETWEEN 0 AND 100));

COMMENT ON COLUMN pivot_crop_assignments.field_capacity_after_excess IS
  'CC ajustada após evento de excesso (chuva forte). Se NULL, usa CC do solo.';

-- ── LIFECYCLE ──────────────────────────────────────────────────────────────
-- Substitui semanticamente o `active` (bool) por um estado explícito.
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS status TEXT
  DEFAULT 'ativa'
  CHECK (status IN ('rascunho','ativa','encerrada','cancelada'));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS close_reason TEXT
  CHECK (close_reason IS NULL OR close_reason IN (
    'colheita','falha_lavoura','clima_adverso','decisao_gerencial','outro'
  ));
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS close_note TEXT;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS closed_by UUID
  REFERENCES users(id) ON DELETE SET NULL;

-- Resultados finais (preenchidos ao encerrar)
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS yield_kg_ha DOUBLE PRECISION
  CHECK (yield_kg_ha IS NULL OR yield_kg_ha >= 0);

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS total_water_applied_mm DOUBLE PRECISION
  CHECK (total_water_applied_mm IS NULL OR total_water_applied_mm >= 0);

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS total_energy_kwh DOUBLE PRECISION
  CHECK (total_energy_kwh IS NULL OR total_energy_kwh >= 0);

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS total_cost DOUBLE PRECISION
  CHECK (total_cost IS NULL OR total_cost >= 0);

COMMENT ON COLUMN pivot_crop_assignments.status IS
  'Ciclo de vida da parcela. rascunho = em cadastro; ativa = em manejo; encerrada = colheita/finalização; cancelada = descartada.';

COMMENT ON COLUMN pivot_crop_assignments.yield_kg_ha IS 'Produtividade final (kg/ha). Preenchido no encerramento.';
COMMENT ON COLUMN pivot_crop_assignments.total_water_applied_mm IS 'Lâmina total aplicada no ciclo (mm). Preenchido no encerramento.';
COMMENT ON COLUMN pivot_crop_assignments.total_energy_kwh IS 'Energia total consumida (kWh). Preenchido no encerramento.';
COMMENT ON COLUMN pivot_crop_assignments.total_cost IS 'Custo total (R$). Preenchido no encerramento.';

-- Backfill do status a partir do `active` existente
UPDATE pivot_crop_assignments
   SET status = CASE WHEN active THEN 'ativa' ELSE 'encerrada' END
 WHERE status = 'ativa' AND active IS NOT NULL;

COMMENT ON COLUMN pivot_crop_assignments.active IS
  'DEPRECATED (Sprint 13). Use `status`. Mantido para compatibilidade com queries existentes.';

-- ── VIEW: Parcelas Ativas + Histórico ──────────────────────────────────────
CREATE OR REPLACE VIEW parcels_active AS
  SELECT * FROM pivot_crop_assignments WHERE status = 'ativa';

CREATE OR REPLACE VIEW parcels_history AS
  SELECT * FROM pivot_crop_assignments WHERE status IN ('encerrada','cancelada');

COMMENT ON VIEW parcels_active IS 'Parcelas em manejo. Uso preferencial das telas operacionais.';
COMMENT ON VIEW parcels_history IS 'Parcelas encerradas ou canceladas. Base do histórico e relatórios comparativos entre safras.';

-- ── ÍNDICES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pca_status ON pivot_crop_assignments(status);
CREATE INDEX IF NOT EXISTS idx_pca_closed_at ON pivot_crop_assignments(closed_at) WHERE closed_at IS NOT NULL;

-- ── Fim ────────────────────────────────────────────────────────────────────
