-- ============================================================================
-- Quadrante da parcela (ângulos no pivô)
-- ----------------------------------------------------------------------------
-- A parcela NÃO tem coordenada própria: centro e raio são sempre do pivô.
-- start/end NULL = círculo completo. 0° = Norte, sentido horário.
-- Vários quadrantes ativos no mesmo pivô, desde que não se sobreponham.
-- Sem DROP de dados operacionais.
-- ============================================================================

ALTER TABLE pivot_crop_assignments
  ADD COLUMN IF NOT EXISTS start_angle_deg DOUBLE PRECISION
  CHECK (start_angle_deg IS NULL OR (start_angle_deg >= 0 AND start_angle_deg < 360));

ALTER TABLE pivot_crop_assignments
  ADD COLUMN IF NOT EXISTS end_angle_deg DOUBLE PRECISION
  CHECK (end_angle_deg IS NULL OR (end_angle_deg > 0 AND end_angle_deg <= 360));

ALTER TABLE pivot_crop_assignments
  DROP CONSTRAINT IF EXISTS pca_quadrant_angles_pair;

ALTER TABLE pivot_crop_assignments
  ADD CONSTRAINT pca_quadrant_angles_pair CHECK (
    (start_angle_deg IS NULL AND end_angle_deg IS NULL)
    OR (start_angle_deg IS NOT NULL AND end_angle_deg IS NOT NULL)
  );

COMMENT ON COLUMN pivot_crop_assignments.start_angle_deg IS
  'Ângulo inicial do quadrante (0° = Norte, horário). Null com end Null = pivô inteiro. Geometria no centro/raio do equipamento.';
COMMENT ON COLUMN pivot_crop_assignments.end_angle_deg IS
  'Ângulo final do quadrante (0° = Norte, horário). 360° permitido no fechamento (ex.: 315–360).';

DROP INDEX IF EXISTS idx_pca_one_active_per_pivot;

-- No máximo uma parcela ativa cobrindo o pivô inteiro. Quadrantes coexistentes são validados na aplicação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pca_one_full_active_per_pivot
  ON pivot_crop_assignments (pivot_id)
  WHERE status = 'ativa'
    AND start_angle_deg IS NULL
    AND end_angle_deg IS NULL;
