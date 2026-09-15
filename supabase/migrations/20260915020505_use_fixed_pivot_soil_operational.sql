-- O cadastro físico 1:1 em pivot_soils/pivot_soil_layers é a fonte do pivô.
-- A coluna soil_id da parcela permanece apenas para leitura histórica e pode
-- ficar nula quando o pivô não usa mais o catálogo legado soils.

ALTER TABLE public.pivot_crop_assignments
  ALTER COLUMN soil_id DROP NOT NULL;

COMMENT ON COLUMN public.pivot_crop_assignments.soil_id IS
  'LEGADO e não editável. Quando presente, espelha pivots.soil_id; o perfil operacional atual vem de pivot_soils/pivot_soil_layers.';

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

  -- Compatibilidade: replica o vínculo antigo quando ele existe, mas não
  -- exige nem aceita uma escolha independente no cadastro da parcela.
  NEW.soil_id := pivot_soil_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_assignment_soil_from_pivot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_assignment_soil_from_pivot() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_assignment_soil_from_pivot() FROM authenticated;

COMMENT ON FUNCTION public.enforce_assignment_soil_from_pivot() IS
  'Mantém soil_id da parcela como espelho legado opcional; o solo fixo do pivô vive em pivot_soils.';
