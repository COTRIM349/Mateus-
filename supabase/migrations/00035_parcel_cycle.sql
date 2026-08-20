-- ============================================================================
-- Etapa C — Parcela como ciclo agronômico
-- ----------------------------------------------------------------------------
-- Parcela = unidade temporal de manejo (cultura + plantio + safra no pivô).
-- Nova cultura = NOVO registro. Encerrar preserva dados. Nunca DROP de ciclo.
--
-- Este banco pode não ter recebido 00027; colunas abaixo são IF NOT EXISTS.
-- Troca UNIQUE(pivot_id, season_id) por no máximo UMA parcela ativa por pivô,
-- permitindo histórico de vários ciclos no mesmo equipamento/safra.
-- ============================================================================

-- ── Identidade ─────────────────────────────────────────────────────────────
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS planted_area DOUBLE PRECISION
  CHECK (planted_area IS NULL OR planted_area > 0);

COMMENT ON COLUMN pivot_crop_assignments.name IS
  'Nome da parcela (ciclo). Se NULL, a UI sugere "Pivô · Cultura · Safra".';
COMMENT ON COLUMN pivot_crop_assignments.planted_area IS
  'Área plantada (ha). Deve ser ≤ área do pivô. NULL = usa a área do equipamento.';

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS variety_id UUID
  REFERENCES cultures(id) ON DELETE SET NULL;

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS water_source TEXT
  CHECK (water_source IS NULL OR water_source IN (
    'rio','poco','reservatorio','canal','outorga','misto','outro'
  ));
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS water_source_note TEXT;

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS climate_config TEXT
  DEFAULT 'farm_default'
  CHECK (climate_config IN ('farm_default','virtual_station','nearest_station','manual'));
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS climate_station_id UUID
  REFERENCES weather_stations(id) ON DELETE SET NULL;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS rain_option TEXT
  DEFAULT 'auto'
  CHECK (rain_option IN ('auto','manual','pluviometer','ignore'));

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS plant_spacing_m DOUBLE PRECISION
  CHECK (plant_spacing_m IS NULL OR plant_spacing_m > 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS row_spacing_m DOUBLE PRECISION
  CHECK (row_spacing_m IS NULL OR row_spacing_m > 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS additional_row_spacing_m DOUBLE PRECISION
  CHECK (additional_row_spacing_m IS NULL OR additional_row_spacing_m > 0);

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS current_phase_id UUID
  REFERENCES culture_phases(id) ON DELETE SET NULL;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS management_start_date DATE;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS management_end_date DATE;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS end_at_cycle_end BOOLEAN DEFAULT true;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS deficit_irrigation BOOLEAN DEFAULT false;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS stress_point_irrigation BOOLEAN DEFAULT false;

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS ks_function_override TEXT
  CHECK (ks_function_override IS NULL OR ks_function_override IN (
    'linear','fao33','exponential','sigmoid','none'
  ));
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS kl_override DOUBLE PRECISION
  CHECK (kl_override IS NULL OR (kl_override BETWEEN 0 AND 1));

COMMENT ON COLUMN pivot_crop_assignments.kl_override IS
  'Override de KL (0–1) deste ciclo. NULL = 1 em pivô central / herda do perfil do solo. ETc × KL entra na Etapa E.';

ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS initial_soil_moisture_pct DOUBLE PRECISION
  CHECK (initial_soil_moisture_pct IS NULL OR (initial_soil_moisture_pct BETWEEN 0 AND 100));
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS initial_moisture_unit TEXT
  DEFAULT 'field_capacity_fraction'
  CHECK (initial_moisture_unit IN ('field_capacity_fraction','weight_pct','volume_pct'));
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS initial_moisture_is_cc BOOLEAN DEFAULT true;
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS field_capacity_after_excess DOUBLE PRECISION
  CHECK (field_capacity_after_excess IS NULL OR (field_capacity_after_excess BETWEEN 0 AND 100));

-- ── Lifecycle ──────────────────────────────────────────────────────────────
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
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS yield_kg_ha DOUBLE PRECISION
  CHECK (yield_kg_ha IS NULL OR yield_kg_ha >= 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS total_water_applied_mm DOUBLE PRECISION
  CHECK (total_water_applied_mm IS NULL OR total_water_applied_mm >= 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS total_energy_kwh DOUBLE PRECISION
  CHECK (total_energy_kwh IS NULL OR total_energy_kwh >= 0);
ALTER TABLE pivot_crop_assignments ADD COLUMN IF NOT EXISTS total_cost DOUBLE PRECISION
  CHECK (total_cost IS NULL OR total_cost >= 0);

COMMENT ON COLUMN pivot_crop_assignments.status IS
  'Ciclo da parcela. ativa = em manejo; encerrada/cancelada = histórico. Nunca reutilizar o registro para outra cultura.';
COMMENT ON COLUMN pivot_crop_assignments.active IS
  'DEPRECATED (Etapa C). Use status. Encerrar grava active=false só por compatibilidade com queries antigas. Não apagar a linha.';

UPDATE pivot_crop_assignments
   SET status = CASE WHEN active THEN 'ativa' ELSE 'encerrada' END
 WHERE status IS NULL OR (status = 'ativa' AND active = false);

-- ── Um ciclo ativo por pivô (substitui unique por safra) ───────────────────
ALTER TABLE pivot_crop_assignments
  DROP CONSTRAINT IF EXISTS pivot_crop_assignments_pivot_id_season_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pca_one_active_per_pivot
  ON pivot_crop_assignments (pivot_id)
  WHERE status = 'ativa';

CREATE INDEX IF NOT EXISTS idx_pca_status ON pivot_crop_assignments(status);
CREATE INDEX IF NOT EXISTS idx_pca_closed_at ON pivot_crop_assignments(closed_at)
  WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pca_variety_id ON pivot_crop_assignments(variety_id);

COMMENT ON TABLE pivot_crop_assignments IS
  'Parcela: ciclo agronômico no pivô (Etapa C). Solo pertence ao pivô. Nova cultura = nova linha. Encerrar move para histórico.';
