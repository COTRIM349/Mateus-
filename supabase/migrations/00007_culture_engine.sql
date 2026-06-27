-- ============================================================================
-- Sprint 5: Motor de Cultura — novos campos, variedades, fases, raízes, histórico
-- ============================================================================

-- 1. Novos campos na tabela cultures
ALTER TABLE cultures
  ADD COLUMN culture_group  TEXT DEFAULT 'graos'
    CHECK (culture_group IN ('graos','fibras','frutas','hortalicas','forrageiras','perenes','outro')),
  ADD COLUMN description    TEXT,
  ADD COLUMN status         TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','inativo','em_teste'));

-- 2. Variedades / cultivares
CREATE TABLE culture_varieties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id   UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  company      TEXT,
  maturity     TEXT NOT NULL DEFAULT 'medio'
               CHECK (maturity IN ('precoce','medio','tardio')),
  cycle_days   INTEGER,
  observations TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(culture_id, name)
);

CREATE INDEX idx_culture_varieties_culture ON culture_varieties(culture_id);
CREATE TRIGGER trg_culture_varieties_updated BEFORE UPDATE ON culture_varieties FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Fases fenológicas com Kc e sistema radicular
CREATE TABLE culture_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id      UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  phase_order     INTEGER NOT NULL,
  name            TEXT NOT NULL,
  days_after_plant INTEGER NOT NULL,
  duration_days   INTEGER NOT NULL,
  kc_start        DOUBLE PRECISION NOT NULL CHECK (kc_start BETWEEN 0 AND 2.5),
  kc_end          DOUBLE PRECISION NOT NULL CHECK (kc_end BETWEEN 0 AND 2.5),
  root_depth_start DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  root_depth_end   DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  depletion_factor DOUBLE PRECISION NOT NULL DEFAULT 0.5
                   CHECK (depletion_factor BETWEEN 0 AND 1),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(culture_id, phase_order)
);

CREATE INDEX idx_culture_phases_culture ON culture_phases(culture_id);
CREATE TRIGGER trg_culture_phases_updated BEFORE UPDATE ON culture_phases FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Histórico de alterações da cultura
CREATE TABLE culture_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id   UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  change_type  TEXT NOT NULL CHECK (change_type IN (
    'criacao','edicao','variedade_add','variedade_edit','variedade_del',
    'fase_add','fase_edit','fase_del','associacao'
  )),
  description  TEXT NOT NULL,
  old_values   JSONB,
  new_values   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_culture_history_culture ON culture_history(culture_id);
CREATE INDEX idx_culture_history_date ON culture_history(created_at DESC);
