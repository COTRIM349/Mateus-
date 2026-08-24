-- P0 hardening: protect operational truth tables and invalidate V3 after any retroactive source change.

DROP POLICY IF EXISTS farm_access_readings ON public.weather_readings;
CREATE POLICY authenticated_read_weather_readings
  ON public.weather_readings
  FOR SELECT
  TO authenticated
  USING (
    station_id IN (
      SELECT ws.id
      FROM public.weather_stations ws
      WHERE ws.farm_id IN (SELECT public.auth_farm_ids())
    )
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.weather_readings FROM anon, authenticated;
GRANT SELECT ON public.weather_readings TO authenticated;

DROP POLICY IF EXISTS farm_access_weather_daily_selection ON public.weather_daily_selection;
CREATE POLICY authenticated_read_weather_daily_selection
  ON public.weather_daily_selection
  FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT public.auth_farm_ids()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.weather_daily_selection FROM anon, authenticated;
GRANT SELECT ON public.weather_daily_selection TO authenticated;

DROP POLICY IF EXISTS farm_access_hydric_initial_conditions ON public.hydric_initial_conditions;
CREATE POLICY authenticated_manage_hydric_initial_conditions
  ON public.hydric_initial_conditions
  FOR ALL
  TO authenticated
  USING (farm_id IN (SELECT public.auth_farm_ids()))
  WITH CHECK (farm_id IN (SELECT public.auth_farm_ids()));
REVOKE ALL ON public.hydric_initial_conditions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.hydric_initial_conditions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hydric_initial_conditions TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_water_balances_dual_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    RETURN NULL;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_water_balances_dual_client_write ON public.water_balances_dual;
CREATE TRIGGER trg_guard_water_balances_dual_client_write
BEFORE INSERT OR UPDATE OR DELETE ON public.water_balances_dual
FOR EACH ROW EXECUTE FUNCTION public.guard_water_balances_dual_client_write();

COMMENT ON TABLE public.water_balances_dual IS
'Histórico V3 server-managed. Escritas de anon/authenticated são descartadas por trigger; o cliente não é fonte de verdade.';

CREATE OR REPLACE FUNCTION public.invalidate_dual_assignment_from(p_assignment_id uuid, p_from_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_assignment_id IS NULL OR p_from_date IS NULL THEN RETURN; END IF;
  DELETE FROM public.water_balances_dual
   WHERE pivot_crop_assignment_id = p_assignment_id
     AND date >= p_from_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_dual_pivot_from(p_pivot_id uuid, p_from_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_pivot_id IS NULL OR p_from_date IS NULL THEN RETURN; END IF;
  DELETE FROM public.water_balances_dual wb
  USING public.pivot_crop_assignments pca
  WHERE wb.pivot_crop_assignment_id = pca.id
    AND pca.pivot_id = p_pivot_id
    AND wb.date >= p_from_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_dual_farm_from(p_farm_id uuid, p_from_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_farm_id IS NULL OR p_from_date IS NULL THEN RETURN; END IF;
  DELETE FROM public.water_balances_dual wb
  USING public.pivot_crop_assignments pca, public.pivots p
  WHERE wb.pivot_crop_assignment_id = pca.id
    AND pca.pivot_id = p.id
    AND p.farm_id = p_farm_id
    AND wb.date >= p_from_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_irrigation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.parcel_id IS NOT NULL THEN
      PERFORM public.invalidate_dual_assignment_from(OLD.parcel_id, OLD.started_at::date);
    ELSE
      PERFORM public.invalidate_dual_pivot_from(OLD.pivot_id, OLD.started_at::date);
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.parcel_id IS NOT NULL THEN
      PERFORM public.invalidate_dual_assignment_from(NEW.parcel_id, NEW.started_at::date);
    ELSE
      PERFORM public.invalidate_dual_pivot_from(NEW.pivot_id, NEW.started_at::date);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_irrigation_change ON public.irrigation_events;
CREATE TRIGGER trg_invalidate_dual_after_irrigation_change
AFTER INSERT OR UPDATE OR DELETE ON public.irrigation_events
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_irrigation_change();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_manual_rain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.invalidate_dual_farm_from(OLD.farm_id, OLD.date);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.invalidate_dual_farm_from(NEW.farm_id, NEW.date);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_manual_rain ON public.manual_rainfall_entries;
CREATE TRIGGER trg_invalidate_dual_after_manual_rain
AFTER INSERT OR UPDATE OR DELETE ON public.manual_rainfall_entries
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_manual_rain();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_assignment_parameters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.water_balances_dual WHERE pivot_crop_assignment_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_assignment_parameters ON public.pivot_crop_assignments;
CREATE TRIGGER trg_invalidate_dual_after_assignment_parameters
AFTER UPDATE OF culture_id, soil_id, planting_date, emergence_date, management_start_date,
  parameter_mode, initial_root_depth, max_root_depth, irrigation_efficiency,
  depletion_factor, kl_override, ks_function_override, initial_soil_moisture_pct,
  initial_moisture_unit, initial_moisture_is_cc, initial_condition_source,
  deficit_irrigation, stress_point_irrigation, planted_area, start_angle_deg, end_angle_deg
ON public.pivot_crop_assignments
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_assignment_parameters();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_weather_selection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.invalidate_dual_farm_from(OLD.farm_id, OLD.date);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.invalidate_dual_farm_from(NEW.farm_id, NEW.date);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_weather_selection ON public.weather_daily_selection;
CREATE TRIGGER trg_invalidate_dual_after_weather_selection
AFTER INSERT OR UPDATE OR DELETE ON public.weather_daily_selection
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_weather_selection();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_selected_weather_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reading_id uuid;
  v_date date;
  v_farm_id uuid;
BEGIN
  v_reading_id := COALESCE(NEW.id, OLD.id);
  v_date := COALESCE(NEW.date, OLD.date);
  SELECT s.farm_id INTO v_farm_id
  FROM public.weather_daily_selection s
  WHERE s.selected_reading_id = v_reading_id
    AND s.operational_approved = true
  LIMIT 1;
  IF v_farm_id IS NOT NULL THEN
    PERFORM public.invalidate_dual_farm_from(v_farm_id, v_date);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_selected_weather_reading ON public.weather_readings;
CREATE TRIGGER trg_invalidate_dual_after_selected_weather_reading
AFTER UPDATE OF et0_calculated, precipitation, wind_speed OR DELETE ON public.weather_readings
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_selected_weather_reading();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_culture_phase_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.culture_id ELSE NULL END;
  v_new uuid := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.culture_id ELSE NULL END;
BEGIN
  DELETE FROM public.water_balances_dual wb
  USING public.pivot_crop_assignments pca
  WHERE wb.pivot_crop_assignment_id = pca.id
    AND pca.culture_id IN (SELECT x FROM unnest(ARRAY[v_old, v_new]) x WHERE x IS NOT NULL);
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_culture_phase_change ON public.culture_phases;
CREATE TRIGGER trg_invalidate_dual_after_culture_phase_change
AFTER INSERT OR UPDATE OR DELETE ON public.culture_phases
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_culture_phase_change();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_culture_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.water_balances_dual wb
  USING public.pivot_crop_assignments pca
  WHERE wb.pivot_crop_assignment_id = pca.id
    AND pca.culture_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_culture_change ON public.cultures;
CREATE TRIGGER trg_invalidate_dual_after_culture_change
AFTER UPDATE OF root_depth, depletion_factor, kl, ks_function, ky,
  coefficient_method, kcb_reference_source, cycle_days
ON public.cultures
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_culture_change();

CREATE OR REPLACE FUNCTION public.invalidate_dual_for_soil(p_soil_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_soil_id IS NULL THEN RETURN; END IF;
  DELETE FROM public.water_balances_dual wb
  USING public.pivot_crop_assignments pca, public.pivots p
  WHERE wb.pivot_crop_assignment_id = pca.id
    AND pca.pivot_id = p.id
    AND (p.soil_id = p_soil_id OR pca.soil_id = p_soil_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_soil_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.invalidate_dual_for_soil(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_soil_change ON public.soils;
CREATE TRIGGER trg_invalidate_dual_after_soil_change
AFTER UPDATE OF field_capacity, wilting_point, bulk_density, effective_depth,
  texture, evaporation_layer_depth_m, readily_evaporable_water_mm
ON public.soils
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_soil_change();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_soil_layer_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM public.invalidate_dual_for_soil(OLD.soil_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM public.invalidate_dual_for_soil(NEW.soil_id); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_soil_layer_change ON public.soil_layers;
CREATE TRIGGER trg_invalidate_dual_after_soil_layer_change
AFTER INSERT OR UPDATE OR DELETE ON public.soil_layers
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_soil_layer_change();

CREATE OR REPLACE FUNCTION public.invalidate_dual_after_pivot_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.water_balances_dual wb
  USING public.pivot_crop_assignments pca
  WHERE wb.pivot_crop_assignment_id = pca.id
    AND pca.pivot_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invalidate_dual_after_pivot_change ON public.pivots;
CREATE TRIGGER trg_invalidate_dual_after_pivot_change
AFTER UPDATE OF application_efficiency, efficiency, soil_id, area, flow_rate
ON public.pivots
FOR EACH ROW EXECUTE FUNCTION public.invalidate_dual_after_pivot_change();
