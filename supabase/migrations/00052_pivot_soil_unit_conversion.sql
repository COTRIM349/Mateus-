-- ============================================================================
-- 00052 — Conversão segura da unidade de CC/PMP no cadastro de solo por pivô
-- ----------------------------------------------------------------------------
-- Ao trocar % em peso <-> % volumétrica, converte CC/PMP em todas as camadas
-- usando a densidade aparente da própria camada. DTA e CAD permanecem
-- fisicamente equivalentes porque são derivados pela view calculada.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_pivot_soil_cc_pmp_unit(
  p_pivot_id UUID,
  p_new_unit TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old_unit TEXT;
BEGIN
  IF p_new_unit NOT IN ('gravimetric_pct', 'volumetric_pct') THEN
    RAISE EXCEPTION 'Unidade inválida: %', p_new_unit;
  END IF;

  SELECT cc_pmp_unit
    INTO v_old_unit
  FROM pivot_soils
  WHERE pivot_id = p_pivot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro de solo do pivô não encontrado';
  END IF;

  IF v_old_unit = p_new_unit THEN
    RETURN;
  END IF;

  -- Se a unidade anterior ainda não estava definida, apenas registra a unidade.
  IF v_old_unit IS NULL THEN
    UPDATE pivot_soils
       SET cc_pmp_unit = p_new_unit
     WHERE pivot_id = p_pivot_id;
    RETURN;
  END IF;

  -- Conversão em qualquer direção exige densidade aparente quando há CC/PMP.
  IF EXISTS (
    SELECT 1
    FROM pivot_soil_layers
    WHERE pivot_id = p_pivot_id
      AND (field_capacity_pct IS NOT NULL OR wilting_point_pct IS NOT NULL)
      AND bulk_density_g_cm3 IS NULL
  ) THEN
    RAISE EXCEPTION
      'Não é possível converter a unidade: existe camada com CC/PMP e sem densidade aparente';
  END IF;

  IF v_old_unit = 'gravimetric_pct' AND p_new_unit = 'volumetric_pct' THEN
    UPDATE pivot_soil_layers
       SET field_capacity_pct = CASE
             WHEN field_capacity_pct IS NULL THEN NULL
             ELSE field_capacity_pct * bulk_density_g_cm3
           END,
           wilting_point_pct = CASE
             WHEN wilting_point_pct IS NULL THEN NULL
             ELSE wilting_point_pct * bulk_density_g_cm3
           END
     WHERE pivot_id = p_pivot_id;

  ELSIF v_old_unit = 'volumetric_pct' AND p_new_unit = 'gravimetric_pct' THEN
    UPDATE pivot_soil_layers
       SET field_capacity_pct = CASE
             WHEN field_capacity_pct IS NULL THEN NULL
             ELSE field_capacity_pct / bulk_density_g_cm3
           END,
           wilting_point_pct = CASE
             WHEN wilting_point_pct IS NULL THEN NULL
             ELSE wilting_point_pct / bulk_density_g_cm3
           END
     WHERE pivot_id = p_pivot_id;

  ELSE
    RAISE EXCEPTION 'Conversão de unidade não suportada: % -> %', v_old_unit, p_new_unit;
  END IF;

  UPDATE pivot_soils
     SET cc_pmp_unit = p_new_unit
   WHERE pivot_id = p_pivot_id;
END;
$$;

REVOKE ALL ON FUNCTION set_pivot_soil_cc_pmp_unit(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_pivot_soil_cc_pmp_unit(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION set_pivot_soil_cc_pmp_unit(UUID, TEXT) IS
  'Converte CC/PMP entre % em peso e % volumétrica usando Da por camada e atualiza a unidade do cadastro.';
