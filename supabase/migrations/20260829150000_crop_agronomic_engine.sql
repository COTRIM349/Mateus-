-- ============================================================================
-- Motor agronômico V2 — extensão compatível com 00056_crop_agronomic_calibration
-- Data: 2026-08-29
-- ----------------------------------------------------------------------------
-- Fundação já existente:
--   agronomic_sources, culture_phenology_markers,
--   culture_variety_phenology_targets, phenology_observations,
--   culture_calibrations.
--
-- Esta migration NÃO duplica CAD/CC/PMP/camadas. O domínio de cultura fornece
-- Kc, Zr e p; CAD continua pertencendo ao domínio Solo/Balanço Hídrico.
-- ============================================================================

-- ── FONTES: ESTENDER CATÁLOGO EXISTENTE ─────────────────────────────────────

ALTER TABLE agronomic_sources ADD COLUMN IF NOT EXISTS experimental_location TEXT;
ALTER TABLE agronomic_sources ADD COLUMN IF NOT EXISTS methodology TEXT;
ALTER TABLE agronomic_sources ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE agronomic_sources ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DROP POLICY IF EXISTS admins_manage_agronomic_sources ON agronomic_sources;
CREATE POLICY admins_manage_agronomic_sources ON agronomic_sources
  FOR ALL
  USING (auth_user_role() = 'admin')
  WITH CHECK (auth_user_role() = 'admin');

COMMENT ON COLUMN agronomic_sources.active IS
  'Fonte arquivada permanece referenciável historicamente; não apagar fonte utilizada.';

-- ── CADASTRO MESTRE: NÃO OBRIGAR PARÂMETRO AGRONÔMICO LEGADO ────────────────

ALTER TABLE cultures ALTER COLUMN root_depth DROP NOT NULL;
ALTER TABLE cultures ALTER COLUMN depletion_factor DROP NOT NULL;
ALTER TABLE cultures ALTER COLUMN cycle_days DROP NOT NULL;

COMMENT ON COLUMN cultures.root_depth IS
  'Campo legado. Novas curvas operacionais de raiz usam root_depth_curves.';
COMMENT ON COLUMN cultures.depletion_factor IS
  'Campo legado. Novos valores de p rastreáveis usam agronomic_parameter_values.';

-- ── CULTIVARES: EXTENSÕES SEM INVENTAR VALORES ──────────────────────────────

ALTER TABLE culture_varieties ALTER COLUMN maturity DROP NOT NULL;
ALTER TABLE culture_varieties ALTER COLUMN maturity DROP DEFAULT;

ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS breeder TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS technology TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS manufacturer_cycle_days INTEGER;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS planning_occupancy_days INTEGER;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS adaptation_region TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS recommended_population_min DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS recommended_population_max DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS recommended_spacing_m DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS expected_height_m DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS architecture TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS lodging_sensitivity TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS regulator_sensitivity TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS data_source_id UUID
  REFERENCES agronomic_sources(id) ON DELETE RESTRICT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS data_confidence TEXT NOT NULL DEFAULT 'nao_validada'
  CHECK (data_confidence IN ('alta','media','baixa','nao_validada'));

COMMENT ON COLUMN culture_varieties.planning_occupancy_days IS
  'Janela de ocupação operacional; não é automaticamente ciclo fenológico.';
COMMENT ON COLUMN culture_varieties.data_source_id IS
  'Fonte do cadastro importado/fornecido da cultivar. Não implica validação de Kc/Tb/GDA.';

-- ── JANELAS DE SEMEADURA PARA AGRUPAR CALIBRAÇÃO ────────────────────────────

CREATE TABLE IF NOT EXISTS planting_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_month_day TEXT,
  end_month_day TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_planting_window_scope_name
  ON planting_windows(culture_id, COALESCE(cultivar_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- ── PARÂMETROS VERSIONADOS (p, Tb LOCAL, ETC.) ──────────────────────────────

CREATE TABLE IF NOT EXISTS agronomic_parameter_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_code TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN (
    'culture','cultivar','regional','local_calibration','provisional'
  )),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
  planting_window_id UUID REFERENCES planting_windows(id) ON DELETE SET NULL,
  numeric_value DOUBLE PRECISION,
  text_value TEXT,
  unit TEXT,
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  validation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft','review','approved','rejected','superseded')),
  method TEXT,
  model_version TEXT,
  active_for_calculation BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE,
  effective_to DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  CHECK (numeric_value IS NOT NULL OR text_value IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_agronomic_parameter_resolution
  ON agronomic_parameter_values(
    parameter_code, culture_id, cultivar_id, farm_id,
    validation_status, active_for_calculation
  );

-- ── PROVENIÊNCIA FENOLÓGICA: ESPERADO ≠ CALIBRADO ──────────────────────────

ALTER TABLE culture_variety_phenology_targets
  ADD COLUMN IF NOT EXISTS expected_source_id UUID
    REFERENCES agronomic_sources(id) ON DELETE RESTRICT;
ALTER TABLE culture_variety_phenology_targets
  ADD COLUMN IF NOT EXISTS calibrated_source_id UUID
    REFERENCES agronomic_sources(id) ON DELETE RESTRICT;
ALTER TABLE culture_variety_phenology_targets
  ADD COLUMN IF NOT EXISTS calibration_id UUID
    REFERENCES culture_calibrations(id) ON DELETE SET NULL;
ALTER TABLE culture_variety_phenology_targets
  ADD COLUMN IF NOT EXISTS calibration_confidence TEXT
    CHECK (calibration_confidence IS NULL OR calibration_confidence IN (
      'alta','media','baixa','nao_validada'
    ));

UPDATE culture_variety_phenology_targets
SET expected_source_id = COALESCE(expected_source_id, source_id)
WHERE source_id IS NOT NULL;

-- ── CURVAS Kc LINEARES POR TRECHOS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kc_curves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  planting_window_id UUID REFERENCES planting_windows(id) ON DELETE SET NULL,
  curve_name TEXT NOT NULL,
  curve_type TEXT NOT NULL CHECK (curve_type IN (
    'bibliographic','manufacturer','regional','local_calibrated',
    'phenology_adjusted','legacy_study','provisional'
  )),
  axis_type TEXT NOT NULL CHECK (axis_type IN ('DAE','GDA','PHENOLOGY_PROGRESS')),
  eto_reference_method TEXT,
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  validation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft','review','approved','rejected','superseded')),
  active_for_calculation BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kc_anchor_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curve_id UUID NOT NULL REFERENCES kc_curves(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  x_value DOUBLE PRECISION NOT NULL,
  kc_value DOUBLE PRECISION NOT NULL CHECK (kc_value BETWEEN 0 AND 2.5),
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  notes TEXT,
  UNIQUE(curve_id, sequence_no),
  UNIQUE(curve_id, x_value)
);

CREATE INDEX IF NOT EXISTS idx_kc_curves_resolution
  ON kc_curves(culture_id, cultivar_id, farm_id, planting_window_id, validation_status, active_for_calculation);

COMMENT ON TABLE kc_curves IS
  'Kc potencial rastreável; Ks permanece separado e nunca é embutido na curva.';

-- ── CURVAS DE PROFUNDIDADE RADICULAR ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS root_depth_curves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  planting_window_id UUID REFERENCES planting_windows(id) ON DELETE SET NULL,
  curve_name TEXT NOT NULL,
  curve_type TEXT NOT NULL CHECK (curve_type IN (
    'bibliographic','manufacturer','regional','local_calibrated','legacy_study','provisional'
  )),
  axis_type TEXT NOT NULL CHECK (axis_type IN ('DAE','GDA','PHENOLOGY_PROGRESS')),
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  validation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft','review','approved','rejected','superseded')),
  active_for_calculation BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS root_depth_anchor_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curve_id UUID NOT NULL REFERENCES root_depth_curves(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  x_value DOUBLE PRECISION NOT NULL,
  root_depth_m DOUBLE PRECISION NOT NULL CHECK (root_depth_m > 0 AND root_depth_m <= 5),
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  notes TEXT,
  UNIQUE(curve_id, sequence_no),
  UNIQUE(curve_id, x_value)
);

CREATE INDEX IF NOT EXISTS idx_root_curves_resolution
  ON root_depth_curves(culture_id, cultivar_id, farm_id, planting_window_id, validation_status, active_for_calculation);

-- ── SENSIBILIDADE HÍDRICA POR MARCADOR FENOLÓGICO ───────────────────────────

CREATE TABLE IF NOT EXISTS hydric_sensitivity_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  marker_id UUID NOT NULL REFERENCES culture_phenology_markers(id) ON DELETE CASCADE,
  sensitivity_level TEXT NOT NULL CHECK (
    sensitivity_level IN ('baixa','media','alta','muito_alta')
  ),
  physiological_process TEXT NOT NULL,
  yield_component_at_risk TEXT,
  irrigation_priority_weight DOUBLE PRECISION CHECK (
    irrigation_priority_weight IS NULL OR
    (irrigation_priority_weight >= 0 AND irrigation_priority_weight <= 10)
  ),
  source_id UUID NOT NULL REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  validation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft','review','approved','rejected','superseded')),
  active_for_calculation BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hydric_sensitivity_resolution
  ON hydric_sensitivity_stages(
    culture_id, cultivar_id, marker_id, validation_status, active_for_calculation
  );

-- ── OBSERVAÇÃO FENOLÓGICA: AMOSTRAGEM E DATAS ──────────────────────────────

ALTER TABLE phenology_observations ADD COLUMN IF NOT EXISTS sowing_date DATE;
ALTER TABLE phenology_observations ADD COLUMN IF NOT EXISTS emergence_date DATE;
ALTER TABLE phenology_observations ADD COLUMN IF NOT EXISTS das INTEGER CHECK (das IS NULL OR das >= 0);
ALTER TABLE phenology_observations ADD COLUMN IF NOT EXISTS sample_size INTEGER CHECK (sample_size IS NULL OR sample_size > 0);
ALTER TABLE phenology_observations ADD COLUMN IF NOT EXISTS sample_stage_pct DOUBLE PRECISION
  CHECK (sample_stage_pct IS NULL OR sample_stage_pct BETWEEN 0 AND 100);

-- ── TEMPO TÉRMICO DIÁRIO AUDITÁVEL ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_thermal_time (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tmax_c DOUBLE PRECISION NOT NULL,
  tmin_c DOUBLE PRECISION NOT NULL,
  tmean_c DOUBLE PRECISION NOT NULL,
  base_temperature_c DOUBLE PRECISION NOT NULL,
  upper_temperature_c DOUBLE PRECISION,
  degree_day_method TEXT NOT NULL DEFAULT 'simple_mean',
  daily_gdd DOUBLE PRECISION NOT NULL CHECK (daily_gdd >= 0),
  accumulated_gdd DOUBLE PRECISION NOT NULL CHECK (accumulated_gdd >= 0),
  weather_source TEXT,
  weather_record_id UUID,
  photoperiod_hours DOUBLE PRECISION,
  model_version TEXT NOT NULL DEFAULT 'agronomic-engine-v2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, date)
);

-- ── SNAPSHOT DIÁRIO DO ESTADO AGRONÔMICO ────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_crop_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  das INTEGER,
  dae INTEGER,
  accumulated_gdd DOUBLE PRECISION,
  photoperiod_hours DOUBLE PRECISION,
  predicted_marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  observed_marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  effective_marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  phenology_model_level INTEGER CHECK (
    phenology_model_level IS NULL OR phenology_model_level BETWEEN 1 AND 4
  ),
  kc DOUBLE PRECISION CHECK (kc IS NULL OR kc BETWEEN 0 AND 2.5),
  kc_curve_id UUID REFERENCES kc_curves(id) ON DELETE SET NULL,
  eto_mm DOUBLE PRECISION,
  eto_method TEXT,
  etc_potential_mm DOUBLE PRECISION,
  root_depth_m DOUBLE PRECISION,
  root_curve_id UUID REFERENCES root_depth_curves(id) ON DELETE SET NULL,

  -- CAD É RECEBIDA DO DOMÍNIO SOLO/BALANÇO. Não há CC/PMP/camadas aqui.
  cad_mm DOUBLE PRECISION CHECK (cad_mm IS NULL OR cad_mm >= 0),
  depletion_fraction_p DOUBLE PRECISION CHECK (
    depletion_fraction_p IS NULL OR depletion_fraction_p BETWEEN 0 AND 1
  ),
  raw_afd_mm DOUBLE PRECISION CHECK (raw_afd_mm IS NULL OR raw_afd_mm >= 0),
  depletion_mm DOUBLE PRECISION CHECK (depletion_mm IS NULL OR depletion_mm >= 0),
  ks DOUBLE PRECISION CHECK (ks IS NULL OR ks BETWEEN 0 AND 1),
  etc_adjusted_mm DOUBLE PRECISION,
  parameter_origin JSONB,
  confidence TEXT CHECK (
    confidence IS NULL OR confidence IN ('alta','media','baixa','nao_validada')
  ),
  model_version TEXT NOT NULL DEFAULT 'agronomic-engine-v2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, date)
);

COMMENT ON COLUMN daily_crop_state.cad_mm IS
  'Snapshot da CAD recebida do motor hídrico/solo; nunca calculada pelo cadastro de culturas.';

-- ── CALIBRAÇÃO: ESTENDER culture_calibrations EXISTENTE ─────────────────────

ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS planting_window_id UUID
  REFERENCES planting_windows(id) ON DELETE SET NULL;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS min_observations_required INTEGER
  CHECK (min_observations_required IS NULL OR min_observations_required >= 1);
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS mean_value DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS median_value DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS stddev_value DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS min_value DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS max_value DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS p10 DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS p25 DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS p50 DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS p75 DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS p90 DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS mean_error DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS mae DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS rmse DOUBLE PRECISION;
ALTER TABLE culture_calibrations ADD COLUMN IF NOT EXISTS result_json JSONB;

CREATE TABLE IF NOT EXISTS base_temperature_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_id UUID NOT NULL REFERENCES culture_calibrations(id) ON DELETE CASCADE,
  base_temperature_c DOUBLE PRECISION NOT NULL,
  n_observations INTEGER NOT NULL CHECK (n_observations >= 0),
  mean_gdd DOUBLE PRECISION,
  stddev_gdd DOUBLE PRECISION,
  cv_pct DOUBLE PRECISION,
  mean_error_days DOUBLE PRECISION,
  mae_days DOUBLE PRECISION,
  rmse_days DOUBLE PRECISION,
  rank_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ETc INDEPENDENTE PARA CALIBRAÇÃO DE Kc ──────────────────────────────────

CREATE TABLE IF NOT EXISTS kc_calibration_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE SET NULL,
  observation_start DATE NOT NULL,
  observation_end DATE NOT NULL,
  marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  dae DOUBLE PRECISION,
  accumulated_gdd DOUBLE PRECISION,
  eto_mm DOUBLE PRECISION NOT NULL CHECK (eto_mm > 0),
  etc_observed_mm DOUBLE PRECISION NOT NULL CHECK (etc_observed_mm >= 0),
  kc_observed DOUBLE PRECISION GENERATED ALWAYS AS (
    CASE WHEN eto_mm > 0 THEN etc_observed_mm / eto_mm ELSE NULL END
  ) STORED,
  observation_level TEXT NOT NULL CHECK (observation_level IN ('A','B','C','D')),
  etc_method TEXT NOT NULL,
  ks_mean DOUBLE PRECISION CHECK (ks_mean IS NULL OR ks_mean BETWEEN 0 AND 1),
  precipitation_mm DOUBLE PRECISION,
  irrigation_mm DOUBLE PRECISION,
  capillary_rise_mm DOUBLE PRECISION,
  runoff_mm DOUBLE PRECISION,
  deep_percolation_mm DOUBLE PRECISION,
  storage_change_mm DOUBLE PRECISION,
  data_quality_status TEXT NOT NULL DEFAULT 'review'
    CHECK (data_quality_status IN ('accepted','review','excluded')),
  exclusion_reasons TEXT[],
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  observer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (observation_end >= observation_start)
);

CREATE TABLE IF NOT EXISTS kc_calibration_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_id UUID NOT NULL REFERENCES culture_calibrations(id) ON DELETE CASCADE,
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID NOT NULL REFERENCES culture_varieties(id) ON DELETE CASCADE,
  marker_id UUID REFERENCES culture_phenology_markers(id) ON DELETE SET NULL,
  planting_window_id UUID REFERENCES planting_windows(id) ON DELETE SET NULL,
  axis_type TEXT NOT NULL CHECK (axis_type IN ('DAE','GDA','PHENOLOGY_PROGRESS')),
  x_value DOUBLE PRECISION NOT NULL,
  kc_value DOUBLE PRECISION NOT NULL CHECK (kc_value BETWEEN 0 AND 2.5),
  source_id UUID NOT NULL REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── LEGADO: PRESERVAR SEM PROMOVER AUTOMATICAMENTE ──────────────────────────

CREATE TABLE IF NOT EXISTS legacy_agronomic_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  legacy_table TEXT NOT NULL,
  legacy_record_id UUID,
  parameter_code TEXT,
  raw_value JSONB NOT NULL,
  classification TEXT NOT NULL DEFAULT 'study_only'
    CHECK (classification IN ('study_only','requires_source','approved_reference','discarded')),
  operational_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO legacy_agronomic_data(
  culture_id, legacy_table, legacy_record_id, parameter_code,
  raw_value, classification, operational_active, notes
)
SELECT
  cp.culture_id,
  'culture_phases',
  cp.id,
  'legacy_phase_parameters',
  jsonb_build_object(
    'phase_order',cp.phase_order,
    'name',cp.name,
    'days_after_plant',cp.days_after_plant,
    'duration_days',cp.duration_days,
    'kc_start',cp.kc_start,
    'kc_end',cp.kc_end,
    'root_depth_start',cp.root_depth_start,
    'root_depth_end',cp.root_depth_end,
    'depletion_factor',cp.depletion_factor
  ),
  'requires_source',
  false,
  'Preservado como legado; não é automaticamente parâmetro oficial da cultivar.'
FROM culture_phases cp
WHERE NOT EXISTS(
  SELECT 1 FROM legacy_agronomic_data l
  WHERE l.legacy_table='culture_phases' AND l.legacy_record_id=cp.id
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE planting_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE agronomic_parameter_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_anchor_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE root_depth_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE root_depth_anchor_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE hydric_sensitivity_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_thermal_time ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_crop_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_temperature_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_calibration_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_calibration_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_agronomic_data ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'planting_windows','agronomic_parameter_values','kc_curves','kc_anchor_points',
    'root_depth_curves','root_depth_anchor_points','hydric_sensitivity_stages',
    'base_temperature_candidates','kc_calibration_points','legacy_agronomic_data'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I','authenticated_read_'||t,t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)',
      'authenticated_read_'||t,t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I','admins_manage_'||t,t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth_user_role() = ''admin'') WITH CHECK (auth_user_role() = ''admin'')',
      'admins_manage_'||t,t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS farm_access_daily_thermal_time ON daily_thermal_time;
CREATE POLICY farm_access_daily_thermal_time ON daily_thermal_time FOR ALL
USING (
  assignment_id IN (
    SELECT pca.id
    FROM pivot_crop_assignments pca
    JOIN pivots p ON p.id=pca.pivot_id
    WHERE p.farm_id IN (SELECT auth_farm_ids())
  )
)
WITH CHECK (
  assignment_id IN (
    SELECT pca.id
    FROM pivot_crop_assignments pca
    JOIN pivots p ON p.id=pca.pivot_id
    WHERE p.farm_id IN (SELECT auth_farm_ids())
  )
);

DROP POLICY IF EXISTS farm_access_daily_crop_state ON daily_crop_state;
CREATE POLICY farm_access_daily_crop_state ON daily_crop_state FOR ALL
USING (
  assignment_id IN (
    SELECT pca.id
    FROM pivot_crop_assignments pca
    JOIN pivots p ON p.id=pca.pivot_id
    WHERE p.farm_id IN (SELECT auth_farm_ids())
  )
)
WITH CHECK (
  assignment_id IN (
    SELECT pca.id
    FROM pivot_crop_assignments pca
    JOIN pivots p ON p.id=pca.pivot_id
    WHERE p.farm_id IN (SELECT auth_farm_ids())
  )
);

DROP POLICY IF EXISTS farm_access_kc_calibration_observations ON kc_calibration_observations;
CREATE POLICY farm_access_kc_calibration_observations ON kc_calibration_observations FOR ALL
USING (farm_id IN (SELECT auth_farm_ids()))
WITH CHECK (farm_id IN (SELECT auth_farm_ids()));

-- ── FINAL ───────────────────────────────────────────────────────────────────

COMMENT ON TABLE kc_calibration_observations IS
  'Nível D não autoriza chamar resultado de Kc calibrado.';
COMMENT ON TABLE hydric_sensitivity_stages IS
  'Sensibilidade hídrica possui fonte própria; não inferir apenas pelo código fenológico.';
