-- Condição inicial e parâmetros de manejo alteram toda a trajetória do ARM.
-- Compatibilidade: medições numéricas de formulários antigos recebem origem
-- measured; capacidade de campo continua exigindo confirmação explícita.

CREATE OR REPLACE FUNCTION public.normalize_parcel_initial_condition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.initial_condition_source IS NULL
     AND NEW.initial_moisture_is_cc IS NOT TRUE
     AND NEW.initial_soil_moisture_pct IS NOT NULL THEN
    NEW.initial_condition_source := 'measured';
  END IF;

  IF NEW.initial_moisture_is_cc IS TRUE
     AND COALESCE(NEW.initial_condition_source, '') <> 'field_capacity_confirmed' THEN
    NEW.initial_moisture_is_cc := false;
  END IF;

  IF NEW.initial_condition_source = 'measured'
     AND NEW.initial_soil_moisture_pct IS NULL THEN
    RAISE EXCEPTION 'Condição inicial measured exige initial_soil_moisture_pct';
  END IF;

  IF NEW.initial_condition_source = 'field_capacity_confirmed' THEN
    NEW.initial_moisture_is_cc := true;
    NEW.initial_soil_moisture_pct := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_v2_after_assignment_parameters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.water_balances
   WHERE pivot_crop_assignment_id = NEW.id
     AND engine_version = 'hydric-v2';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_v2_after_assignment_parameters ON public.pivot_crop_assignments;
CREATE TRIGGER trg_invalidate_v2_after_assignment_parameters
AFTER UPDATE OF
  culture_id,
  soil_id,
  planting_date,
  emergence_date,
  management_start_date,
  parameter_mode,
  initial_root_depth,
  max_root_depth,
  irrigation_efficiency,
  depletion_factor,
  kl_override,
  ks_function_override,
  initial_soil_moisture_pct,
  initial_moisture_unit,
  initial_moisture_is_cc,
  initial_condition_source,
  deficit_irrigation,
  stress_point_irrigation
ON public.pivot_crop_assignments
FOR EACH ROW EXECUTE FUNCTION public.invalidate_v2_after_assignment_parameters();

REVOKE ALL ON FUNCTION public.invalidate_v2_after_assignment_parameters() FROM PUBLIC, anon, authenticated;
