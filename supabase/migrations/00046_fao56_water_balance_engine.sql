-- ============================================================================
-- Motor FAO-56 v2 — unidade de umidade, FD dinâmico, auditoria diária
-- Aditivo. Sem DROP. Default m3_m3 preserva CC/PMP volumétricos existentes.
-- ============================================================================

ALTER TABLE soils
  ADD COLUMN IF NOT EXISTS moisture_unit TEXT NOT NULL DEFAULT 'm3_m3'
    CHECK (moisture_unit IN ('gravimetric_percent', 'volumetric_percent', 'm3_m3'));

COMMENT ON COLUMN soils.moisture_unit IS
  'Unidade de CC/PMP: gravimetric_percent (% em peso), volumetric_percent (% vol), m3_m3 (cm³/cm³). A fórmula de DTA muda com a unidade.';

ALTER TABLE soil_layers
  ADD COLUMN IF NOT EXISTS moisture_unit TEXT
    CHECK (moisture_unit IS NULL OR moisture_unit IN ('gravimetric_percent', 'volumetric_percent', 'm3_m3'));

COMMENT ON COLUMN soil_layers.moisture_unit IS
  'Se NULL, herda soils.moisture_unit.';

ALTER TABLE pivot_crop_assignments
  ADD COLUMN IF NOT EXISTS fd_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (fd_mode IN ('fixed', 'auto'));

COMMENT ON COLUMN pivot_crop_assignments.fd_mode IS
  'fixed = p de tabela. auto = p_ajustado = p + 0,04×(5 − ETc_pot), limitado a 0,10–0,80 (FAO-56).';

ALTER TABLE water_balances
  ADD COLUMN IF NOT EXISTS dr_start_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dr_end_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dta_mm_per_cm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fd_original DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fd_adjusted DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS etc_for_fd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zr_method TEXT,
  ADD COLUMN IF NOT EXISTS zr_max_cm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS deep_percolation_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS runoff_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ks_formula TEXT,
  ADD COLUMN IF NOT EXISTS agronomic_status TEXT,
  ADD COLUMN IF NOT EXISTS engine_version TEXT,
  ADD COLUMN IF NOT EXISTS missing_params TEXT[],
  ADD COLUMN IF NOT EXISTS data_kind TEXT NOT NULL DEFAULT 'observed'
    CHECK (data_kind IN ('observed', 'forecast')),
  ADD COLUMN IF NOT EXISTS days_to_cra DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS days_to_cra_note TEXT;

COMMENT ON COLUMN water_balances.dr_start_mm IS 'Depleção no início do dia (mm) = CTA − ARM₀.';
COMMENT ON COLUMN water_balances.dr_end_mm IS 'Depleção no fim do dia (mm).';
COMMENT ON COLUMN water_balances.data_kind IS 'observed = realizado. forecast = projeção. Nunca misturar.';
COMMENT ON COLUMN water_balances.engine_version IS 'Versão do motor que gerou a linha (ex.: fao56-wb-2.0).';

ALTER TABLE soil_sensory_readings
  ADD COLUMN IF NOT EXISTS measured_moisture_pct DOUBLE PRECISION
    CHECK (measured_moisture_pct IS NULL OR (measured_moisture_pct >= 0 AND measured_moisture_pct <= 100));

COMMENT ON COLUMN soil_sensory_readings.measured_moisture_pct IS
  'Umidade medida em % (validação/calibração). Não substitui o balanço hídrico calculado.';
