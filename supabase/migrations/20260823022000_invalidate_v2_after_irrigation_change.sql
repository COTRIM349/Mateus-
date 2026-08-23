-- Qualquer alteração em evento de irrigação muda o ARM a partir daquele dia.
-- Portanto, resultados V2 posteriores não podem permanecer válidos.

CREATE OR REPLACE FUNCTION public.invalidate_v2_balance_after_irrigation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcel_id uuid;
  v_pivot_id uuid;
  v_date date;
BEGIN
  v_parcel_id := COALESCE(NEW.parcel_id, OLD.parcel_id);
  v_pivot_id := COALESCE(NEW.pivot_id, OLD.pivot_id);
  v_date := COALESCE(NEW.started_at, OLD.started_at)::date;

  IF v_parcel_id IS NOT NULL THEN
    DELETE FROM public.water_balances
     WHERE pivot_crop_assignment_id = v_parcel_id
       AND engine_version = 'hydric-v2'
       AND date >= v_date;
  ELSIF v_pivot_id IS NOT NULL THEN
    DELETE FROM public.water_balances wb
     USING public.pivot_crop_assignments pca
     WHERE wb.pivot_crop_assignment_id = pca.id
       AND pca.pivot_id = v_pivot_id
       AND wb.engine_version = 'hydric-v2'
       AND wb.date >= v_date;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_v2_after_irrigation_change ON public.irrigation_events;
CREATE TRIGGER trg_invalidate_v2_after_irrigation_change
AFTER INSERT OR UPDATE OR DELETE ON public.irrigation_events
FOR EACH ROW EXECUTE FUNCTION public.invalidate_v2_balance_after_irrigation_change();

REVOKE ALL ON FUNCTION public.invalidate_v2_balance_after_irrigation_change() FROM PUBLIC, anon, authenticated;
