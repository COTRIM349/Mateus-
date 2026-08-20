-- ============================================================================
-- Etapa D — Cultura e fases (cadastro)
-- ----------------------------------------------------------------------------
-- Cultura/cultivar/ciclo na parcela; fases com duração, DAP derivado, Kc/Ks/KL/Ky/p.
-- Este banco pode não ter recebido 00026/00030; colunas abaixo são IF NOT EXISTS.
-- Sem DROP de crop_stage nem de dados operacionais.
-- Duração (dias) é a linha do tempo; days_after_plant é derivado na aplicação.
-- ============================================================================

-- ── CULTURES (enriquecimento 00026/00030) ──────────────────────────────────

ALTER TABLE cultures ADD COLUMN IF NOT EXISTS variety_of_id UUID
  REFERENCES cultures(id) ON DELETE SET NULL;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kl DOUBLE PRECISION
  DEFAULT 1.0
  CHECK (kl IS NULL OR (kl BETWEEN 0 AND 1));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS ks_function TEXT DEFAULT 'linear';
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS optimal_temperature_c DOUBLE PRECISION
  CHECK (optimal_temperature_c IS NULL OR (optimal_temperature_c BETWEEN 0 AND 45));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS basal_temperature_c DOUBLE PRECISION
  CHECK (basal_temperature_c IS NULL OR (basal_temperature_c BETWEEN 0 AND 30));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS by_phase BOOLEAN DEFAULT true;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kc_constant BOOLEAN DEFAULT false;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kl_function TEXT DEFAULT 'constant';
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS ky DOUBLE PRECISION
  CHECK (ky IS NULL OR (ky BETWEEN 0 AND 3));

CREATE INDEX IF NOT EXISTS idx_cultures_variety_of ON cultures(variety_of_id);

COMMENT ON COLUMN cultures.kl IS
  'Coeficiente de localização (0-1). Pivô central com molhamento pleno = 1. Cadastro; motor usa na Etapa E.';
COMMENT ON COLUMN cultures.by_phase IS
  'Se true, o manejo usa parâmetros da fase atual (culture_phases).';
COMMENT ON COLUMN cultures.ky IS
  'Ky padrão da cultura (FAO 33). Override por fase em culture_phases.ky. Risco produtivo, não lâmina diária.';

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'cultures'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%ks_function%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE cultures DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE cultures DROP CONSTRAINT IF EXISTS cultures_ks_function_check;
ALTER TABLE cultures
  ADD CONSTRAINT cultures_ks_function_check
  CHECK (ks_function IS NULL OR ks_function IN (
    'linear','fao33','exponential','sigmoid','none'
  ));

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'cultures'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%kl_function%'
     AND conname <> 'cultures_kl_function_check';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE cultures DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE cultures DROP CONSTRAINT IF EXISTS cultures_kl_function_check;
ALTER TABLE cultures
  ADD CONSTRAINT cultures_kl_function_check
  CHECK (kl_function IS NULL OR kl_function IN (
    'constant','custom','fereres','keller_karmeli','freitas','bernardo'
  ));

COMMENT ON COLUMN cultures.ks_function IS
  'Função Ks do cadastro. linear = FAO-56; fao33 = Ky por fase. Aplicação no motor = Etapa E.';
COMMENT ON COLUMN cultures.kl_function IS
  'Função Kl do cadastro. constant = usa cultures.kl (pivô central típico = 1).';

-- ── CULTURE_PHASES ─────────────────────────────────────────────────────────

ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#94a3b8';
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS duration_degree_days DOUBLE PRECISION
  CHECK (duration_degree_days IS NULL OR duration_degree_days > 0);
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS kc_constant BOOLEAN DEFAULT false;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS shaded_area_pct DOUBLE PRECISION
  CHECK (shaded_area_pct IS NULL OR (shaded_area_pct BETWEEN 0 AND 100));
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS ks_function TEXT;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS itn_pct DOUBLE PRECISION
  DEFAULT 100
  CHECK (itn_pct IS NULL OR (itn_pct BETWEEN 0 AND 150));
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS next_phase_id UUID
  REFERENCES culture_phases(id) ON DELETE SET NULL;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS cycle_count INTEGER
  DEFAULT 1
  CHECK (cycle_count IS NULL OR cycle_count > 0);
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS ends_cycle BOOLEAN DEFAULT false;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS ky DOUBLE PRECISION
  CHECK (ky IS NULL OR (ky BETWEEN 0 AND 3));
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS kl DOUBLE PRECISION
  DEFAULT 1.0
  CHECK (kl IS NULL OR (kl BETWEEN 0 AND 1));
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS phase_key TEXT;

CREATE INDEX IF NOT EXISTS idx_culture_phases_next ON culture_phases(next_phase_id);
CREATE INDEX IF NOT EXISTS idx_culture_phases_key ON culture_phases(culture_id, phase_key);

COMMENT ON COLUMN culture_phases.duration_days IS
  'Duração da fase em dias corridos. Fonte da verdade da linha do tempo. DAP é derivado da soma sequencial.';
COMMENT ON COLUMN culture_phases.days_after_plant IS
  'DAP de início, derivado das durações anteriores. Não interpola Kc sozinho — isso é Etapa E.';
COMMENT ON COLUMN culture_phases.phase_key IS
  'Chave estável da fase (emergencia, vegetativo, florescimento, formacao_vagens, enchimento_graos, maturacao, botoes, formacao_macas, enchimento).';
COMMENT ON COLUMN culture_phases.kl IS
  'KL da fase (0-1). NULL ou 1 = pivô central com molhamento pleno. Cadastro; motor na Etapa E.';
COMMENT ON COLUMN culture_phases.ky IS
  'Ky da fase (FAO 33). Risco produtivo, não profundidade diária.';
COMMENT ON COLUMN culture_phases.kc_start IS
  'Kc no início da fase (adimensional). Interpolação linear contínua = Etapa E.';
COMMENT ON COLUMN culture_phases.kc_end IS
  'Kc no fim da fase (adimensional).';
COMMENT ON COLUMN culture_phases.root_depth_start IS
  'Profundidade radicular no início da fase (m).';
COMMENT ON COLUMN culture_phases.root_depth_end IS
  'Profundidade radicular no fim da fase (m).';
COMMENT ON COLUMN culture_phases.depletion_factor IS
  'Fator p (0-1) desta fase.';

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'culture_phases'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%ks_function%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE culture_phases DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE culture_phases DROP CONSTRAINT IF EXISTS culture_phases_ks_function_check;
ALTER TABLE culture_phases
  ADD CONSTRAINT culture_phases_ks_function_check
  CHECK (ks_function IS NULL OR ks_function IN (
    'linear','fao33','exponential','sigmoid','none'
  ));

-- ── PARCELA: estádio manual (já criado em 00035; só documenta) ─────────────

COMMENT ON COLUMN pivot_crop_assignments.current_phase_id IS
  'Estádio manual da parcela. NULL = automático pelo DAP nas fases da cultura. Não altera crop_stage (enum legado).';
COMMENT ON COLUMN pivot_crop_assignments.management_start_date IS
  'Início do manejo de irrigação neste ciclo (pode diferir do plantio).';
COMMENT ON COLUMN pivot_crop_assignments.management_end_date IS
  'Fim do manejo. NULL = segue o ciclo da cultura.';

-- ── Fim ────────────────────────────────────────────────────────────────────
