-- ============================================================================
-- 00054 — Parâmetros físicos de referência por classe de solo
-- ----------------------------------------------------------------------------
-- Objetivo:
--   Ao alterar a CLASSE DO SOLO do pivô, atualizar automaticamente CC, PMP e
--   densidade aparente de todas as camadas com valores de referência da classe.
--
-- Regras:
--   • A classe fica no nível do pivô, não por camada.
--   • CC/PMP continuam editáveis após a aplicação do padrão.
--   • Se a unidade for volumétrica, usa os valores volumétricos diretamente.
--   • Se a unidade for % em peso, converte: gravimétrico = volumétrico / Ds.
--   • VIB não é alterada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS soil_class_reference (
  soil_class TEXT PRIMARY KEY,
  field_capacity_vol_pct DOUBLE PRECISION NOT NULL,
  wilting_point_vol_pct DOUBLE PRECISION NOT NULL,
  bulk_density_g_cm3 DOUBLE PRECISION NOT NULL,
  source_note TEXT NOT NULL,
  CHECK (field_capacity_vol_pct > wilting_point_vol_pct),
  CHECK (bulk_density_g_cm3 > 0)
);

ALTER TABLE soil_class_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_soil_class_reference" ON soil_class_reference;
CREATE POLICY "authenticated_read_soil_class_reference"
  ON soil_class_reference
  FOR SELECT
  TO authenticated
  USING (true);

-- CC/PMP volumétricos: valores aproximados por classe textural adaptados de
-- Saxton & Rawls (2006), conforme tabela de extensão da South Dakota State University.
-- Ds: valores típicos por classe textural publicados em estudo do semiárido brasileiro;
-- para Siltoso, usa 1,44 g/cm³ de média observada em solos com >60% de silte.
INSERT INTO soil_class_reference (
  soil_class,
  field_capacity_vol_pct,
  wilting_point_vol_pct,
  bulk_density_g_cm3,
  source_note
)
VALUES
  ('Areia franca',             12.0,  5.0, 1.60, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Arenoso',                  10.0,  5.0, 1.65, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Argilo-arenoso',           36.0, 25.0, 1.40, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Argilo-siltoso',           41.0, 27.0, 1.45, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Argiloso',                 42.0, 30.0, 1.35, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Franco',                   28.0, 14.0, 1.50, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Franco-arenoso',           18.0,  8.0, 1.55, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Franco-argilo-arenoso',    27.0, 17.0, 1.50, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Franco-argilo-siltoso',    38.0, 22.0, 1.50, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Franco-argiloso',          36.0, 22.0, 1.45, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Franco-siltoso',           31.0, 11.0, 1.50, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: valor típico por textura'),
  ('Siltoso',                  30.0,  6.0, 1.44, 'FC/PWP: Saxton & Rawls 2006 via SDSU; Ds: média de solos com >60% silte')
ON CONFLICT (soil_class)
DO UPDATE SET
  field_capacity_vol_pct = EXCLUDED.field_capacity_vol_pct,
  wilting_point_vol_pct = EXCLUDED.wilting_point_vol_pct,
  bulk_density_g_cm3 = EXCLUDED.bulk_density_g_cm3,
  source_note = EXCLUDED.source_note;

CREATE OR REPLACE FUNCTION apply_pivot_soil_class_reference(
  p_pivot_id UUID,
  p_soil_class TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ref soil_class_reference%ROWTYPE;
  v_unit TEXT;
BEGIN
  SELECT *
    INTO v_ref
  FROM soil_class_reference
  WHERE soil_class = p_soil_class;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Classe de solo sem parâmetros de referência: %', p_soil_class;
  END IF;

  SELECT cc_pmp_unit
    INTO v_unit
  FROM pivot_soils
  WHERE pivot_id = p_pivot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro de solo do pivô não encontrado';
  END IF;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'Defina a unidade de CC/PMP antes de alterar a classe do solo';
  END IF;

  UPDATE pivot_soils
     SET soil_class = p_soil_class
   WHERE pivot_id = p_pivot_id;

  UPDATE pivot_soil_layers
     SET soil_class = NULL,
         bulk_density_g_cm3 = v_ref.bulk_density_g_cm3,
         field_capacity_pct = CASE
           WHEN v_unit = 'volumetric_pct'
             THEN v_ref.field_capacity_vol_pct
           WHEN v_unit = 'gravimetric_pct'
             THEN v_ref.field_capacity_vol_pct / v_ref.bulk_density_g_cm3
           ELSE field_capacity_pct
         END,
         wilting_point_pct = CASE
           WHEN v_unit = 'volumetric_pct'
             THEN v_ref.wilting_point_vol_pct
           WHEN v_unit = 'gravimetric_pct'
             THEN v_ref.wilting_point_vol_pct / v_ref.bulk_density_g_cm3
           ELSE wilting_point_pct
         END
   WHERE pivot_id = p_pivot_id;
END;
$$;

REVOKE ALL ON FUNCTION apply_pivot_soil_class_reference(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_pivot_soil_class_reference(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION apply_pivot_soil_class_reference(UUID, TEXT) IS
  'Atualiza a classe do solo e aplica CC, PMP e Ds de referência em todas as camadas, respeitando a unidade atual.';
