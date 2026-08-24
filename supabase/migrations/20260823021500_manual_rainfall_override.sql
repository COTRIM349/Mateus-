-- Chuva manual medida em campo.
-- Substitui somente a precipitação no balanço; a ETo continua vindo da
-- seleção climática aprovada e auditável.

CREATE TABLE IF NOT EXISTS public.manual_rainfall_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  date date NOT NULL,
  precipitation_mm double precision NOT NULL,
  source text NOT NULL DEFAULT 'pluviometer',
  notes text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_rainfall_precip_check CHECK (precipitation_mm >= 0 AND precipitation_mm <= 500),
  CONSTRAINT manual_rainfall_source_check CHECK (source IN ('pluviometer','field_observation')),
  CONSTRAINT manual_rainfall_farm_date_key UNIQUE (farm_id, date)
);

ALTER TABLE public.manual_rainfall_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_access_manual_rainfall ON public.manual_rainfall_entries;
CREATE POLICY farm_access_manual_rainfall
ON public.manual_rainfall_entries
FOR ALL
TO authenticated
USING (farm_id IN (SELECT public.auth_farm_ids()))
WITH CHECK (farm_id IN (SELECT public.auth_farm_ids()));

CREATE INDEX IF NOT EXISTS idx_manual_rainfall_farm_date
  ON public.manual_rainfall_entries(farm_id, date DESC);

COMMENT ON TABLE public.manual_rainfall_entries IS
  'Chuva medida manualmente por fazenda/data. Substitui somente a precipitação no balanço; nunca substitui a ETo aprovada.';

CREATE OR REPLACE FUNCTION public.invalidate_v2_balance_after_manual_rain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_id uuid;
  v_date date;
BEGIN
  v_farm_id := COALESCE(NEW.farm_id, OLD.farm_id);
  v_date := COALESCE(NEW.date, OLD.date);

  DELETE FROM public.water_balances wb
   USING public.pivot_crop_assignments pca, public.pivots p
   WHERE wb.pivot_crop_assignment_id = pca.id
     AND pca.pivot_id = p.id
     AND p.farm_id = v_farm_id
     AND wb.engine_version = 'hydric-v2'
     AND wb.date >= v_date;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_v2_after_manual_rain ON public.manual_rainfall_entries;
CREATE TRIGGER trg_invalidate_v2_after_manual_rain
AFTER INSERT OR UPDATE OR DELETE ON public.manual_rainfall_entries
FOR EACH ROW EXECUTE FUNCTION public.invalidate_v2_balance_after_manual_rain();

REVOKE ALL ON FUNCTION public.invalidate_v2_balance_after_manual_rain() FROM PUBLIC, anon, authenticated;
