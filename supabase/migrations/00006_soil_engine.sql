-- ============================================================================
-- Sprint 4: Motor de Solo — novos campos, camadas e histórico
-- ============================================================================

-- 1. Novos campos na tabela soils
ALTER TABLE soils
  ADD COLUMN sand_pct      DOUBLE PRECISION DEFAULT 0 CHECK (sand_pct BETWEEN 0 AND 100),
  ADD COLUMN silt_pct      DOUBLE PRECISION DEFAULT 0 CHECK (silt_pct BETWEEN 0 AND 100),
  ADD COLUMN clay_pct      DOUBLE PRECISION DEFAULT 0 CHECK (clay_pct BETWEEN 0 AND 100),
  ADD COLUMN cad            DOUBLE PRECISION,
  ADD COLUMN afd            DOUBLE PRECISION,
  ADD COLUMN hydraulic_conductivity DOUBLE PRECISION,
  ADD COLUMN effective_depth DOUBLE PRECISION DEFAULT 0.6,
  ADD COLUMN observations   TEXT,
  ADD CONSTRAINT chk_granulometry CHECK (
    sand_pct + silt_pct + clay_pct BETWEEN 99.5 AND 100.5
    OR (sand_pct = 0 AND silt_pct = 0 AND clay_pct = 0)
  );

-- 2. Camadas do solo
CREATE TABLE soil_layers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soil_id          UUID NOT NULL REFERENCES soils(id) ON DELETE CASCADE,
  depth_start      INTEGER NOT NULL,
  depth_end        INTEGER NOT NULL,
  texture          TEXT NOT NULL
                   CHECK (texture IN ('arenoso','franco-arenoso','franco','franco-argiloso','argiloso','muito-argiloso')),
  bulk_density     DOUBLE PRECISION NOT NULL,
  field_capacity   DOUBLE PRECISION NOT NULL,
  wilting_point    DOUBLE PRECISION NOT NULL,
  cad              DOUBLE PRECISION,
  afd              DOUBLE PRECISION,
  infiltration_rate DOUBLE PRECISION,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (depth_end > depth_start),
  CHECK (field_capacity > wilting_point),
  UNIQUE(soil_id, depth_start)
);

CREATE INDEX idx_soil_layers_soil ON soil_layers(soil_id);
CREATE TRIGGER trg_soil_layers_updated BEFORE UPDATE ON soil_layers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Histórico de alterações do solo
CREATE TABLE soil_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soil_id     UUID NOT NULL REFERENCES soils(id) ON DELETE CASCADE,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('criacao', 'edicao', 'camada_add', 'camada_edit', 'camada_del', 'associacao')),
  description TEXT NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_soil_history_soil ON soil_history(soil_id);
CREATE INDEX idx_soil_history_date ON soil_history(created_at DESC);
