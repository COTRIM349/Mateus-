-- ============================================================================
-- Sprint 7: Motor de Recomendação de Irrigação
-- ============================================================================

-- 1. Tabela de recomendações diárias por pivô
CREATE TABLE irrigation_recommendations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id              UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  crop_assignment_id    UUID REFERENCES pivot_crop_assignments(id) ON DELETE SET NULL,
  recommendation_date   DATE NOT NULL,

  -- Decisão
  should_irrigate       BOOLEAN NOT NULL DEFAULT false,
  operational_status    TEXT NOT NULL DEFAULT 'monitorar'
    CHECK (operational_status IN (
      'irrigar_imediatamente','irrigar_hoje','irrigar_amanha','monitorar','nao_irrigar'
    )),
  priority              TEXT NOT NULL DEFAULT 'sem_necessidade'
    CHECK (priority IN ('critica','alta','media','baixa','sem_necessidade')),
  priority_score        DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (priority_score BETWEEN 0 AND 100),
  productive_risk       DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (productive_risk BETWEEN 0 AND 100),

  -- Quantidades
  net_depth             DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_depth           DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_m3             DOUBLE PRECISION NOT NULL DEFAULT 0,
  irrigation_time_h     DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- Contexto hídrico
  current_arm           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_cad           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_afd           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_deficit       DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_etc           DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_kc            DOUBLE PRECISION NOT NULL DEFAULT 1,
  root_depth            DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  crop_phase            TEXT,
  depletion_factor      DOUBLE PRECISION NOT NULL DEFAULT 0.5,

  -- Restrições
  peak_restricted       BOOLEAN NOT NULL DEFAULT false,
  recommended_start     TEXT,
  reason                TEXT NOT NULL,
  observations          TEXT,

  -- Acompanhamento
  accepted              BOOLEAN,
  accepted_at           TIMESTAMPTZ,
  accepted_by           UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_id, recommendation_date)
);

CREATE INDEX idx_rec_farm ON irrigation_recommendations(farm_id);
CREATE INDEX idx_rec_pivot ON irrigation_recommendations(pivot_id);
CREATE INDEX idx_rec_date ON irrigation_recommendations(recommendation_date DESC);
CREATE INDEX idx_rec_priority ON irrigation_recommendations(priority);
CREATE INDEX idx_rec_status ON irrigation_recommendations(operational_status);
CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON irrigation_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
