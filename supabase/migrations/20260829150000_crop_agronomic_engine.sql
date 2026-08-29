-- ============================================================================
-- Motor agronômico de culturas e cultivares
-- Data: 2026-08-29
-- ----------------------------------------------------------------------------
-- Regras centrais:
-- 1) cultura, cultivar e calibração local são camadas distintas;
-- 2) nenhum parâmetro agronômico novo é inventado para completar cadastro;
-- 3) valores bibliográficos/fabricante/local ficam versionados e rastreáveis;
-- 4) CAD NÃO é calculada neste domínio. A CAD é fornecida pelo módulo de solo /
--    balanço hídrico e apenas consumida como entrada pelos cálculos de AFD/RAW/Ks;
-- 5) curvas de Kc e profundidade radicular são lineares por trechos;
-- 6) calibração só vira operacional após aprovação explícita.
-- ============================================================================

-- ── FONTES / RASTREABILIDADE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agronomic_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'fao','embrapa','artigo_cientifico','universidade','obtentor_fabricante',
    'assistencia_tecnica','historico_fazenda','calibracao_local','estimativa_provisoria'
  )),
  institution TEXT,
  authors TEXT,
  year INTEGER CHECK (year IS NULL OR (year BETWEEN 1800 AND 2200)),
  title TEXT,
  reference TEXT,
  url TEXT,
  experimental_location TEXT,
  methodology TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agronomic_sources_type ON agronomic_sources(source_type);

-- ── ESCALAS FENOLÓGICAS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phenology_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(culture_id, name)
);

CREATE TABLE IF NOT EXISTS phenology_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id UUID NOT NULL REFERENCES phenology_scales(id) ON DELETE CASCADE,
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  stage_order NUMERIC(8,3) NOT NULL,
  stage_group TEXT,
  description TEXT,
  critical_for_irrigation BOOLEAN NOT NULL DEFAULT false,
  physiological_process TEXT,
  yield_component_at_risk TEXT,
  sensitivity_level TEXT CHECK (
    sensitivity_level IS NULL OR sensitivity_level IN ('baixa','media','alta','muito_alta')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scale_id, code)
);

CREATE INDEX IF NOT EXISTS idx_phenology_stages_scale_order
  ON phenology_stages(scale_id, stage_order);

ALTER TABLE cultures ADD COLUMN IF NOT EXISTS phenology_scale_id UUID
  REFERENCES phenology_scales(id) ON DELETE SET NULL;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS lower_base_temperature_c DOUBLE PRECISION;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS upper_base_temperature_c DOUBLE PRECISION;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS degree_day_method TEXT DEFAULT 'simple_average';
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS thermal_parameters_source_id UUID
  REFERENCES agronomic_sources(id) ON DELETE RESTRICT;

COMMENT ON COLUMN cultures.lower_base_temperature_c IS
  'Tb bibliográfica/referencial da espécie. Nunca substitui silenciosamente valor específico da cultivar ou calibração local.';
COMMENT ON COLUMN cultures.degree_day_method IS
  'Método térmico ativo da cultura; V1 usa simple_average = max(0, ((Tmax+Tmin)/2)-Tb).';

-- ── CULTIVARES ─────────────────────────────────────────────────────────────

-- O schema legado obrigava uma classe precoce/médio/tardio e default médio.
-- Isso inventa classificação quando só existe GRM. A partir daqui o campo é opcional.
ALTER TABLE culture_varieties ALTER COLUMN maturity DROP NOT NULL;
ALTER TABLE culture_varieties ALTER COLUMN maturity DROP DEFAULT;

ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS breeder TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS technology TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS relative_maturity_group NUMERIC(4,2);
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS manufacturer_cycle_days INTEGER;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS planning_occupancy_days INTEGER;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS growth_habit TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS long_juvenile_period BOOLEAN;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS photoperiod_sensitivity TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS adaptation_region TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS recommended_population_min DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS recommended_population_max DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS recommended_spacing_m DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS expected_height_m DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS architecture TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS lodging_sensitivity TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS regulator_sensitivity TEXT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS lower_base_temperature_c DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS upper_base_temperature_c DOUBLE PRECISION;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS calibration_status TEXT NOT NULL DEFAULT 'nao_calibrada'
  CHECK (calibration_status IN (
    'nao_calibrada','em_coleta','calibracao_parcial','calibrada_localmente'
  ));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS data_source_id UUID
  REFERENCES agronomic_sources(id) ON DELETE RESTRICT;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS data_confidence TEXT NOT NULL DEFAULT 'nao_validada'
  CHECK (data_confidence IN ('alta','media','baixa','nao_validada'));

COMMENT ON COLUMN culture_varieties.planning_occupancy_days IS
  'Janela de ocupação operacional. Não equivale automaticamente ao ciclo fenológico observado.';
COMMENT ON COLUMN culture_varieties.relative_maturity_group IS
  'GRM/RMG informado para soja. Não converter automaticamente em precoce/médio/tardio sem regra operacional configurada.';

-- ── JANELAS DE SEMEADURA ──────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_planting_windows_culture_cultivar
  ON planting_windows(culture_id, cultivar_id);

-- ── VALORES DE PARÂMETROS VERSIONADOS ─────────────────────────────────────

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
  ON agronomic_parameter_values(parameter_code, culture_id, cultivar_id, farm_id, validation_status, active_for_calculation);

COMMENT ON COLUMN agronomic_parameter_values.active_for_calculation IS
  'Somente valores aprovados e explicitamente ativados podem prevalecer no motor.';

-- ── ALVOS FENOLÓGICOS POR CULTIVAR ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cultivar_phenology_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cultivar_id UUID NOT NULL REFERENCES culture_varieties(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES phenology_stages(id) ON DELETE CASCADE,
  planting_window_id UUID REFERENCES planting_windows(id) ON DELETE SET NULL,
  dae_bibliographic DOUBLE PRECISION,
  dae_expected DOUBLE PRECISION,
  gdd_expected DOUBLE PRECISION,
  dae_calibrated DOUBLE PRECISION,
  gdd_calibrated DOUBLE PRECISION,
  -- source_id permanece por compatibilidade com o schema V1; novos registros
  -- devem preferir expected_source_id/calibrated_source_id.
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  expected_source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  calibrated_source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  calibration_confidence TEXT CHECK (
    calibration_confidence IS NULL OR calibration_confidence IN ('alta','media','baixa','nao_validada')
  ),
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  validation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft','review','approved','rejected','superseded')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cultivar_phenology_targets
  ON cultivar_phenology_targets(cultivar_id, stage_id, planting_window_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cultivar_phenology_target_global
  ON cultivar_phenology_targets(cultivar_id, stage_id)
  WHERE planting_window_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cultivar_phenology_target_window
  ON cultivar_phenology_targets(cultivar_id, stage_id, planting_window_id)
  WHERE planting_window_id IS NOT NULL;

-- ── CURVAS DE Kc ───────────────────────────────────────────────────────────

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
  stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
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

-- ── CURVAS DE PROFUNDIDADE RADICULAR ───────────────────────────────────────

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
  stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
  x_value DOUBLE PRECISION NOT NULL,
  root_depth_m DOUBLE PRECISION NOT NULL CHECK (root_depth_m > 0 AND root_depth_m <= 5),
  source_id UUID REFERENCES agronomic_sources(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL DEFAULT 'nao_validada'
    CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  notes TEXT,
  UNIQUE(curve_id, sequence_no),
  UNIQUE(curve_id, x_value)
);

-- ── SENSIBILIDADE HÍDRICA POR ESTÁDIO ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS hydric_sensitivity_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES phenology_stages(id) ON DELETE CASCADE,
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
    culture_id, cultivar_id, stage_id, validation_status, active_for_calculation
  );

COMMENT ON TABLE hydric_sensitivity_stages IS
  'Sensibilidade hídrica rastreável e separada da definição da escala fenológica. Não inferir nível de sensibilidade apenas pelo código do estádio.';

-- ── OBSERVAÇÕES DE CAMPO ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_phenology_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE SET NULL,
  stage_id UUID NOT NULL REFERENCES phenology_stages(id) ON DELETE RESTRICT,
  observation_date DATE NOT NULL,
  sowing_date DATE,
  emergence_date DATE,
  das INTEGER CHECK (das IS NULL OR das >= 0),
  dae INTEGER CHECK (dae IS NULL OR dae >= 0),
  accumulated_gdd DOUBLE PRECISION CHECK (accumulated_gdd IS NULL OR accumulated_gdd >= 0),
  photoperiod_hours DOUBLE PRECISION,
  sample_size INTEGER CHECK (sample_size IS NULL OR sample_size > 0),
  sample_stage_pct DOUBLE PRECISION CHECK (
    sample_stage_pct IS NULL OR (sample_stage_pct BETWEEN 0 AND 100)
  ),
  observer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_phenology_assignment_date
  ON field_phenology_observations(assignment_id, observation_date DESC);

-- ── TEMPO TÉRMICO DIÁRIO ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_thermal_time (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tmax_c DOUBLE PRECISION NOT NULL,
  tmin_c DOUBLE PRECISION NOT NULL,
  tmean_c DOUBLE PRECISION NOT NULL,
  base_temperature_c DOUBLE PRECISION NOT NULL,
  upper_temperature_c DOUBLE PRECISION,
  degree_day_method TEXT NOT NULL DEFAULT 'simple_average',
  daily_gdd DOUBLE PRECISION NOT NULL CHECK (daily_gdd >= 0),
  accumulated_gdd DOUBLE PRECISION NOT NULL CHECK (accumulated_gdd >= 0),
  weather_source TEXT,
  weather_record_id UUID,
  photoperiod_hours DOUBLE PRECISION,
  model_version TEXT NOT NULL DEFAULT 'agronomic-engine-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, date)
);

-- ── SNAPSHOT DIÁRIO DO MOTOR AGRONÔMICO ───────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_crop_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  das INTEGER,
  dae INTEGER,
  accumulated_gdd DOUBLE PRECISION,
  photoperiod_hours DOUBLE PRECISION,
  predicted_stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
  observed_stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
  effective_stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
  phenology_model_level INTEGER CHECK (phenology_model_level IS NULL OR phenology_model_level BETWEEN 1 AND 4),
  kc DOUBLE PRECISION CHECK (kc IS NULL OR (kc BETWEEN 0 AND 2.5)),
  kc_curve_id UUID REFERENCES kc_curves(id) ON DELETE SET NULL,
  eto_mm DOUBLE PRECISION,
  eto_method TEXT,
  etc_potential_mm DOUBLE PRECISION,
  root_depth_m DOUBLE PRECISION,
  root_curve_id UUID REFERENCES root_depth_curves(id) ON DELETE SET NULL,

  -- CAD é CONSUMIDA do módulo de solo/balanço. Nenhum campo de CC/PMP/camada
  -- é criado neste domínio.
  cad_mm DOUBLE PRECISION CHECK (cad_mm IS NULL OR cad_mm >= 0),
  depletion_fraction_p DOUBLE PRECISION CHECK (
    depletion_fraction_p IS NULL OR (depletion_fraction_p BETWEEN 0 AND 1)
  ),
  raw_afd_mm DOUBLE PRECISION CHECK (raw_afd_mm IS NULL OR raw_afd_mm >= 0),
  depletion_mm DOUBLE PRECISION CHECK (depletion_mm IS NULL OR depletion_mm >= 0),
  ks DOUBLE PRECISION CHECK (ks IS NULL OR (ks BETWEEN 0 AND 1)),
  etc_adjusted_mm DOUBLE PRECISION,
  parameter_origin JSONB,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('alta','media','baixa','nao_validada')),
  model_version TEXT NOT NULL DEFAULT 'agronomic-engine-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, date)
);

COMMENT ON COLUMN daily_crop_state.cad_mm IS
  'CAD fornecida pelo domínio de solo/balanço hídrico. O motor de cultura não calcula CC/PMP/camadas.';

-- ── CALIBRAÇÃO ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agronomic_calibration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_type TEXT NOT NULL CHECK (calibration_type IN (
    'phenology','base_temperature','kc'
  )),
  culture_id UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  cultivar_id UUID NOT NULL REFERENCES culture_varieties(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  planting_window_id UUID REFERENCES planting_windows(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
  min_observations_required INTEGER CHECK (
    min_observations_required IS NULL OR min_observations_required >= 1
  ),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','rejected')),
  n_observations INTEGER NOT NULL DEFAULT 0 CHECK (n_observations >= 0),
  seasons_used TEXT[],
  mean_value DOUBLE PRECISION,
  median_value DOUBLE PRECISION,
  stddev_value DOUBLE PRECISION,
  cv_pct DOUBLE PRECISION,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  p10 DOUBLE PRECISION,
  p25 DOUBLE PRECISION,
  p50 DOUBLE PRECISION,
  p75 DOUBLE PRECISION,
  p90 DOUBLE PRECISION,
  mean_error DOUBLE PRECISION,
  mae DOUBLE PRECISION,
  rmse DOUBLE PRECISION,
  result_json JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE cultivar_phenology_targets
  ADD COLUMN IF NOT EXISTS calibration_run_id UUID
    REFERENCES agronomic_calibration_runs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS base_temperature_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_run_id UUID NOT NULL REFERENCES agronomic_calibration_runs(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
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

-- ── OBSERVAÇÕES PARA CALIBRAÇÃO DE Kc ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS kc_calibration_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  cultivar_id UUID REFERENCES culture_varieties(id) ON DELETE SET NULL,
  observation_start DATE NOT NULL,
  observation_end DATE NOT NULL,
  stage_id UUID REFERENCES phenology_stages(id) ON DELETE SET NULL,
  dae DOUBLE PRECISION,
  accumulated_gdd DOUBLE PRECISION,
  eto_mm DOUBLE PRECISION NOT NULL CHECK (eto_mm > 0),
  etc_observed_mm DOUBLE PRECISION NOT NULL CHECK (etc_observed_mm >= 0),
  kc_observed DOUBLE PRECISION GENERATED ALWAYS AS (
    CASE WHEN eto_mm > 0 THEN etc_observed_mm / eto_mm ELSE NULL END
  ) STORED,
  observation_level TEXT NOT NULL CHECK (
    observation_level IN ('A','B','C','D')
  ),
  etc_method TEXT NOT NULL,
  ks_mean DOUBLE PRECISION CHECK (ks_mean IS NULL OR (ks_mean BETWEEN 0 AND 1)),
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

CREATE INDEX IF NOT EXISTS idx_kc_calibration_obs_cultivar
  ON kc_calibration_observations(cultivar_id, observation_start, data_quality_status);

COMMENT ON TABLE kc_calibration_observations IS
  'ETc observada independentemente para calibração de Kc. Nível D não autoriza chamar o resultado de Kc calibrado.';

-- ── LEGADO ─────────────────────────────────────────────────────────────────

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

COMMENT ON TABLE legacy_agronomic_data IS
  'Preserva dados antigos sem promovê-los automaticamente a parâmetros agronômicos operacionais.';

-- Registra fases legadas existentes sem apagá-las nem ativá-las no novo motor.
INSERT INTO legacy_agronomic_data (
  culture_id, legacy_table, legacy_record_id, parameter_code, raw_value, classification, operational_active, notes
)
SELECT
  cp.culture_id,
  'culture_phases',
  cp.id,
  'legacy_phase_parameters',
  jsonb_build_object(
    'phase_order', cp.phase_order,
    'name', cp.name,
    'days_after_plant', cp.days_after_plant,
    'duration_days', cp.duration_days,
    'kc_start', cp.kc_start,
    'kc_end', cp.kc_end,
    'root_depth_start', cp.root_depth_start,
    'root_depth_end', cp.root_depth_end,
    'depletion_factor', cp.depletion_factor
  ),
  'requires_source',
  false,
  'Fase anterior ao motor agronômico rastreável. Preservada como legado; não é automaticamente parâmetro oficial.'
FROM culture_phases cp
WHERE NOT EXISTS (
  SELECT 1
  FROM legacy_agronomic_data l
  WHERE l.legacy_table = 'culture_phases' AND l.legacy_record_id = cp.id
);

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE agronomic_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE phenology_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE phenology_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE planting_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE agronomic_parameter_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE cultivar_phenology_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_anchor_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE root_depth_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE root_depth_anchor_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_phenology_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_thermal_time ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_crop_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE agronomic_calibration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_temperature_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_agronomic_data ENABLE ROW LEVEL SECURITY;

-- Catálogos globais: leitura autenticada; gestão somente admin.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agronomic_sources','phenology_scales','phenology_stages','planting_windows',
    'agronomic_parameter_values','cultivar_phenology_targets','kc_curves','kc_anchor_points',
    'root_depth_curves','root_depth_anchor_points','hydric_sensitivity_stages','legacy_agronomic_data'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'authenticated_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)',
      'authenticated_read_' || t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'admins_manage_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth_user_role() = ''admin'') WITH CHECK (auth_user_role() = ''admin'')',
      'admins_manage_' || t, t
    );
  END LOOP;
END $$;

-- Dados operacionais por parcela: acesso apenas quando a parcela pertence a fazenda autorizada.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'field_phenology_observations','daily_thermal_time','daily_crop_state','kc_calibration_observations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'farm_access_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
         assignment_id IN (
           SELECT pca.id
           FROM pivot_crop_assignments pca
           JOIN pivots p ON p.id = pca.pivot_id
           WHERE p.farm_id IN (SELECT auth_farm_ids())
         )
       ) WITH CHECK (
         assignment_id IN (
           SELECT pca.id
           FROM pivot_crop_assignments pca
           JOIN pivots p ON p.id = pca.pivot_id
           WHERE p.farm_id IN (SELECT auth_farm_ids())
         )
       )',
      'farm_access_' || t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS authenticated_read_agronomic_calibration_runs ON agronomic_calibration_runs;
CREATE POLICY authenticated_read_agronomic_calibration_runs ON agronomic_calibration_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS admins_manage_agronomic_calibration_runs ON agronomic_calibration_runs;
CREATE POLICY admins_manage_agronomic_calibration_runs ON agronomic_calibration_runs
  FOR ALL USING (auth_user_role() = 'admin') WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS authenticated_read_base_temperature_candidates ON base_temperature_candidates;
CREATE POLICY authenticated_read_base_temperature_candidates ON base_temperature_candidates
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS admins_manage_base_temperature_candidates ON base_temperature_candidates;
CREATE POLICY admins_manage_base_temperature_candidates ON base_temperature_candidates
  FOR ALL USING (auth_user_role() = 'admin') WITH CHECK (auth_user_role() = 'admin');

-- ── DOCUMENTAÇÃO FINAL ─────────────────────────────────────────────────────

COMMENT ON TABLE kc_curves IS
  'Curvas de Kc versionadas e rastreáveis. Kc não representa estresse hídrico; Ks é separado.';
COMMENT ON TABLE field_phenology_observations IS
  'Observação real da parcela prevalece sobre previsão, mas não altera parâmetros mestres sem calibração aprovada.';
COMMENT ON TABLE agronomic_calibration_runs IS
  'Calibração estatística determinística; não utilizar Monte Carlo.';
