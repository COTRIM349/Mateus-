-- ============================================================================
-- 00014 — Vinculação Operacional (Fase 2)
-- Enriquece pivot_crop_assignments com os parâmetros de manejo por pivô/safra.
-- Todas as colunas são aditivas e opcionais (exceto parameter_mode, que tem
-- default 'padrao'), portanto o balanço hídrico existente segue inalterado.
-- ============================================================================

ALTER TABLE pivot_crop_assignments
  ADD COLUMN IF NOT EXISTS culture_variety_id    UUID REFERENCES culture_varieties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emergence_date        DATE,
  ADD COLUMN IF NOT EXISTS parameter_mode        TEXT NOT NULL DEFAULT 'padrao'
                                                 CHECK (parameter_mode IN ('padrao','personalizado')),
  ADD COLUMN IF NOT EXISTS initial_root_depth    DOUBLE PRECISION
                                                 CHECK (initial_root_depth IS NULL OR initial_root_depth > 0),
  ADD COLUMN IF NOT EXISTS max_root_depth        DOUBLE PRECISION
                                                 CHECK (max_root_depth IS NULL OR (max_root_depth > 0 AND max_root_depth <= 5)),
  ADD COLUMN IF NOT EXISTS irrigation_efficiency DOUBLE PRECISION
                                                 CHECK (irrigation_efficiency IS NULL OR (irrigation_efficiency > 0 AND irrigation_efficiency <= 1)),
  ADD COLUMN IF NOT EXISTS depletion_factor      DOUBLE PRECISION
                                                 CHECK (depletion_factor IS NULL OR (depletion_factor > 0 AND depletion_factor <= 1)),
  ADD COLUMN IF NOT EXISTS notes                 TEXT;

CREATE INDEX IF NOT EXISTS idx_pca_variety ON pivot_crop_assignments(culture_variety_id);

COMMENT ON COLUMN pivot_crop_assignments.emergence_date IS
  'Data de emergência. Quando presente, é a base do cálculo de DAE; caso contrário usa-se planting_date.';
COMMENT ON COLUMN pivot_crop_assignments.parameter_mode IS
  'Origem dos parâmetros de manejo: padrao (herda da cultura/pivô) ou personalizado (usa os overrides deste vínculo).';
COMMENT ON COLUMN pivot_crop_assignments.initial_root_depth IS
  'Profundidade inicial da raiz (m). Limite inferior do crescimento radicular calculado.';
COMMENT ON COLUMN pivot_crop_assignments.max_root_depth IS
  'Profundidade máxima da raiz (m). Limite superior do crescimento radicular calculado.';
