-- O solo é uma característica fixa do pivô. A parcela mantém soil_id apenas
-- como coluna de compatibilidade para os motores legados, sem permitir escolha
-- independente pela interface ou pela Data API.

CREATE OR REPLACE FUNCTION public.enforce_assignment_soil_from_pivot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  pivot_soil_id uuid;
BEGIN
  SELECT p.soil_id
    INTO pivot_soil_id
    FROM public.pivots p
   WHERE p.id = NEW.pivot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pivô não encontrado para a parcela.'
      USING ERRCODE = '23503';
  END IF;

  IF pivot_soil_id IS NULL THEN
    RAISE EXCEPTION 'O pivô não possui solo operacional cadastrado no equipamento.'
      USING ERRCODE = '23514';
  END IF;

  NEW.soil_id := pivot_soil_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_assignment_soil_from_pivot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_assignment_soil_from_pivot() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_assignment_soil_from_pivot() FROM authenticated;

DROP TRIGGER IF EXISTS trg_assignment_soil_from_pivot
  ON public.pivot_crop_assignments;

CREATE TRIGGER trg_assignment_soil_from_pivot
  BEFORE INSERT OR UPDATE OF pivot_id, soil_id
  ON public.pivot_crop_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignment_soil_from_pivot();

COMMENT ON FUNCTION public.enforce_assignment_soil_from_pivot() IS
  'Impede solo independente na parcela: soil_id é sempre herdado de pivots.soil_id.';
