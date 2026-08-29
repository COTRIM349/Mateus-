-- ============================================================================
-- 00053 — Classe/tipo de solo por camada
-- ----------------------------------------------------------------------------
-- Permite que cada camada do perfil tenha uma classe textural própria,
-- editável independentemente da classe predominante do pivô.
-- ============================================================================

ALTER TABLE pivot_soil_layers
  ADD COLUMN IF NOT EXISTS soil_class TEXT;

COMMENT ON COLUMN pivot_soil_layers.soil_class IS
  'Classe/tipo de solo informado para esta camada. Pode diferir entre camadas do mesmo pivô.';

-- Usa a classe já informada no perfil apenas como valor inicial das camadas
-- que ainda não possuem classe própria.
UPDATE pivot_soil_layers l
SET soil_class = ps.soil_class
FROM pivot_soils ps
WHERE ps.pivot_id = l.pivot_id
  AND l.soil_class IS NULL
  AND ps.soil_class IS NOT NULL;

CREATE OR REPLACE VIEW pivot_soil_layers_calculated
WITH (security_invoker = true)
AS
SELECT
  l.id,
  l.pivot_id,
  l.layer_number,
  l.soil_class,
  l.thickness_m,
  l.field_capacity_pct,
  l.wilting_point_pct,
  l.bulk_density_g_cm3,
  ps.cc_pmp_unit,
  CASE
    WHEN l.field_capacity_pct IS NULL
      OR l.wilting_point_pct IS NULL
      OR ps.cc_pmp_unit IS NULL
    THEN NULL
    WHEN ps.cc_pmp_unit = 'gravimetric_pct' AND l.bulk_density_g_cm3 IS NOT NULL
    THEN ((l.field_capacity_pct - l.wilting_point_pct) * l.bulk_density_g_cm3) / 10.0
    WHEN ps.cc_pmp_unit = 'volumetric_pct'
    THEN (l.field_capacity_pct - l.wilting_point_pct) / 10.0
    ELSE NULL
  END AS dta_mm_cm,
  CASE
    WHEN l.thickness_m IS NULL
      OR l.field_capacity_pct IS NULL
      OR l.wilting_point_pct IS NULL
      OR ps.cc_pmp_unit IS NULL
    THEN NULL
    WHEN ps.cc_pmp_unit = 'gravimetric_pct' AND l.bulk_density_g_cm3 IS NOT NULL
    THEN (((l.field_capacity_pct - l.wilting_point_pct) * l.bulk_density_g_cm3) / 10.0)
         * (l.thickness_m * 100.0)
    WHEN ps.cc_pmp_unit = 'volumetric_pct'
    THEN ((l.field_capacity_pct - l.wilting_point_pct) / 10.0)
         * (l.thickness_m * 100.0)
    ELSE NULL
  END AS cad_mm,
  l.created_at,
  l.updated_at
FROM pivot_soil_layers l
JOIN pivot_soils ps ON ps.pivot_id = l.pivot_id;
