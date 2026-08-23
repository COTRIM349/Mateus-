-- Guardrails operacionais descobertos na auditoria final do motor hídrico.
-- Objetivo: nunca assumir condição inicial, seed ou ciclo ativo sem evidência.

-- 1) Condição inicial da parcela: capacidade de campo deixa de ser default.
ALTER TABLE public.pivot_crop_assignments
  ALTER COLUMN initial_moisture_is_cc SET DEFAULT false;

ALTER TABLE public.pivot_crop_assignments
  ADD COLUMN IF NOT EXISTS initial_condition_source text;

ALTER TABLE public.pivot_crop_assignments
  DROP CONSTRAINT IF EXISTS pca_initial_condition_source_check;
ALTER TABLE public.pivot_crop_assignments
  ADD CONSTRAINT pca_initial_condition_source_check
  CHECK (
    initial_condition_source IS NULL OR
    initial_condition_source IN ('measured', 'field_capacity_confirmed')
  );

COMMENT ON COLUMN public.pivot_crop_assignments.initial_condition_source IS
  'Origem explícita da condição inicial. field_capacity_confirmed exige confirmação do operador; measured exige valor medido.';

-- Registros legados com CC=true e sem medida não podem ser tratados como confirmação explícita.
UPDATE public.pivot_crop_assignments
   SET initial_moisture_is_cc = false,
       initial_condition_source = NULL,
       updated_at = now()
 WHERE initial_moisture_is_cc = true
   AND initial_soil_moisture_pct IS NULL
   AND initial_condition_source IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_parcel_initial_condition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A UI antiga enviava true por padrão. Só aceitamos CC quando a origem foi
  -- explicitamente marcada como confirmação de campo pelo operador.
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_parcel_initial_condition ON public.pivot_crop_assignments;
CREATE TRIGGER trg_normalize_parcel_initial_condition
BEFORE INSERT OR UPDATE OF initial_moisture_is_cc, initial_soil_moisture_pct, initial_condition_source
ON public.pivot_crop_assignments
FOR EACH ROW EXECUTE FUNCTION public.normalize_parcel_initial_condition();

REVOKE ALL ON FUNCTION public.normalize_parcel_initial_condition() FROM PUBLIC, anon, authenticated;

-- 2) Plantio futuro nunca nasce como ciclo operacional ativo.
CREATE OR REPLACE FUNCTION public.normalize_future_parcel_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.planting_date IS NOT NULL
     AND NEW.planting_date > CURRENT_DATE
     AND COALESCE(NEW.status, 'ativa') = 'ativa' THEN
    NEW.status := 'rascunho';
    NEW.active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_future_parcel_status ON public.pivot_crop_assignments;
CREATE TRIGGER trg_normalize_future_parcel_status
BEFORE INSERT OR UPDATE OF planting_date, status, active
ON public.pivot_crop_assignments
FOR EACH ROW EXECUTE FUNCTION public.normalize_future_parcel_status();

REVOKE ALL ON FUNCTION public.normalize_future_parcel_status() FROM PUBLIC, anon, authenticated;

-- 3) Não permitir criar nova inconsistência pivô inativo + parcela ativa.
CREATE OR REPLACE FUNCTION public.prevent_pivot_deactivation_with_active_parcel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.active IS TRUE AND NEW.active IS FALSE AND EXISTS (
    SELECT 1
      FROM public.pivot_crop_assignments pca
     WHERE pca.pivot_id = OLD.id
       AND pca.active IS TRUE
       AND COALESCE(pca.status, 'ativa') = 'ativa'
  ) THEN
    RAISE EXCEPTION 'Encerre ou cancele a parcela ativa antes de desativar o pivô';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pivot_deactivation_with_active_parcel ON public.pivots;
CREATE TRIGGER trg_prevent_pivot_deactivation_with_active_parcel
BEFORE UPDATE OF active ON public.pivots
FOR EACH ROW EXECUTE FUNCTION public.prevent_pivot_deactivation_with_active_parcel();

REVOKE ALL ON FUNCTION public.prevent_pivot_deactivation_with_active_parcel() FROM PUBLIC, anon, authenticated;

-- 4) Versiona balanços persistidos. Tudo que já existia é legado e não pode
-- ser usado automaticamente como seed do motor V2.
ALTER TABLE public.water_balances
  ADD COLUMN IF NOT EXISTS engine_version text;
ALTER TABLE public.water_balances
  ADD COLUMN IF NOT EXISTS initial_condition_source text;

UPDATE public.water_balances
   SET engine_version = 'legacy'
 WHERE engine_version IS NULL;

ALTER TABLE public.water_balances
  DROP CONSTRAINT IF EXISTS water_balances_engine_version_check;
ALTER TABLE public.water_balances
  ADD CONSTRAINT water_balances_engine_version_check
  CHECK (engine_version IS NULL OR engine_version IN ('legacy', 'hydric-v2'));

ALTER TABLE public.water_balances
  DROP CONSTRAINT IF EXISTS water_balances_initial_condition_source_check;
ALTER TABLE public.water_balances
  ADD CONSTRAINT water_balances_initial_condition_source_check
  CHECK (
    initial_condition_source IS NULL OR
    initial_condition_source IN ('measured', 'field_capacity_confirmed', 'prior_v2')
  );

COMMENT ON COLUMN public.water_balances.engine_version IS
  'Versão do motor que produziu o balanço. Apenas hydric-v2 pode alimentar continuidade automática do V2.';
COMMENT ON COLUMN public.water_balances.initial_condition_source IS
  'Origem da condição inicial usada no cálculo: measured, field_capacity_confirmed ou prior_v2.';

CREATE INDEX IF NOT EXISTS idx_water_balances_v2_seed
  ON public.water_balances(pivot_crop_assignment_id, date DESC)
  WHERE engine_version = 'hydric-v2';
