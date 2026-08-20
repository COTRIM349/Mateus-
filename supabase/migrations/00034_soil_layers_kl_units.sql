-- ============================================================================
-- Etapa B — Solo físico + camadas (perfil no pivô)
-- ----------------------------------------------------------------------------
-- O solo é o perfil físico do equipamento (Fazenda → Pivô → solo).
-- Camadas descrevem o perfil (ex.: 0–20 / 20–40 / 40–60 cm).
-- Não há coluna de "origem da informação".
--
-- Unidades (nunca misturar sem conversão explícita):
--   CC / PMP  → cm³/cm³ (volumétrico)
--   Da        → g/cm³ (informativa; CAD volumétrica NÃO multiplica Da)
--   profundidade da camada → cm
--   CAD / AFD → mm
--   KL        → adimensional 0–1 (NULL = 1 em pivô central com molhamento total)
-- ============================================================================

-- Garante o vínculo pivô → perfil (Sprint 14 / 00029 pode não ter sido
-- aplicada neste banco). Aditivo: não apaga dados nem remove colunas.
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS soil_id UUID
  REFERENCES soils(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pivots_soil ON pivots(soil_id);

UPDATE pivots p
   SET soil_id = pca.soil_id
  FROM (
    SELECT DISTINCT ON (pivot_id)
           pivot_id, soil_id, created_at
      FROM pivot_crop_assignments
     WHERE active = true
       AND soil_id IS NOT NULL
     ORDER BY pivot_id, created_at DESC
  ) pca
 WHERE p.id = pca.pivot_id
   AND p.soil_id IS NULL;

ALTER TABLE soil_layers ADD COLUMN IF NOT EXISTS kl DOUBLE PRECISION
  CHECK (kl IS NULL OR (kl >= 0 AND kl <= 1));

COMMENT ON COLUMN soil_layers.kl IS
  'Coeficiente de localização (adimensional, 0–1). NULL trata-se como 1 (pivô central com molhamento total). Não aplicar cegamente. ETc × KL entra na Etapa E.';

ALTER TABLE soil_layers ADD COLUMN IF NOT EXISTS observations TEXT;

COMMENT ON COLUMN soil_layers.observations IS
  'Observações da camada. Sem campo de origem da informação.';

COMMENT ON COLUMN soil_layers.depth_start IS
  'Profundidade inicial da camada (cm).';

COMMENT ON COLUMN soil_layers.depth_end IS
  'Profundidade final da camada (cm).';

COMMENT ON COLUMN soil_layers.field_capacity IS
  'Capacidade de campo volumétrica (cm³/cm³). Não usar % em massa; converter explicitamente θv = θg × Da.';

COMMENT ON COLUMN soil_layers.wilting_point IS
  'Ponto de murcha permanente volumétrico (cm³/cm³). Não usar % em massa; converter explicitamente θv = θg × Da.';

COMMENT ON COLUMN soil_layers.bulk_density IS
  'Densidade aparente (g/cm³). Informativa para conversão gravimétrica; a CAD volumétrica não multiplica Da.';

COMMENT ON COLUMN soil_layers.cad IS
  'CAD da camada (mm) = (CC − PMP) × espessura_m × 1000, com CC/PMP volumétricos.';

COMMENT ON COLUMN soil_layers.afd IS
  'Água facilmente disponível da camada (mm) = CAD × p.';

COMMENT ON COLUMN soils.field_capacity IS
  'Capacidade de campo volumétrica do perfil homogêneo (cm³/cm³). Fallback quando não há camadas.';

COMMENT ON COLUMN soils.wilting_point IS
  'Ponto de murcha permanente volumétrico do perfil homogêneo (cm³/cm³). Fallback quando não há camadas.';

COMMENT ON COLUMN soils.bulk_density IS
  'Densidade aparente do perfil homogêneo (g/cm³). Informativa; CAD volumétrica não multiplica Da.';

COMMENT ON COLUMN soils.effective_depth IS
  'Profundidade efetiva do perfil homogêneo (m). Usada só no fallback sem camadas; com camadas a profundidade vem do recorte em Z.';

COMMENT ON COLUMN soils.cad IS
  'CAD do perfil homogêneo (mm). Com camadas, o motor calcula CAD recortada pela profundidade radicular Z.';

COMMENT ON COLUMN pivots.soil_id IS
  'Perfil de solo físico deste pivô (Fazenda → Pivô → solo). Camadas vivem em soil_layers. Não usar pivot_crop_assignments.soil_id (depreciado).';
