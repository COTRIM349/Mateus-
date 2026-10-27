-- Tarifação mensal + bandeira tarifária por competência.
-- A bandeira é adicional de energia (R$/kWh), nunca demanda (R$/kW).

ALTER TABLE public.energy_tariffs
  ADD COLUMN IF NOT EXISTS tariff_flag text NOT NULL DEFAULT 'verde',
  ADD COLUMN IF NOT EXISTS flag_surcharge_per_kwh double precision NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'energy_tariffs_tariff_flag_check'
  ) THEN
    ALTER TABLE public.energy_tariffs
      ADD CONSTRAINT energy_tariffs_tariff_flag_check
      CHECK (tariff_flag IN ('verde','amarela','vermelha_p1','vermelha_p2','personalizada'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'energy_tariffs_flag_surcharge_nonnegative'
  ) THEN
    ALTER TABLE public.energy_tariffs
      ADD CONSTRAINT energy_tariffs_flag_surcharge_nonnegative
      CHECK (flag_surcharge_per_kwh >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.energy_tariffs.tariff_flag IS
  'Bandeira tarifária da competência. Adicional aplicado à energia, não à demanda.';
COMMENT ON COLUMN public.energy_tariffs.flag_surcharge_per_kwh IS
  'Adicional da bandeira em R$/kWh. Mantido separado da tarifa base e da demanda.';

ALTER TABLE public.irrigation_events
  ADD COLUMN IF NOT EXISTS base_energy_cost double precision,
  ADD COLUMN IF NOT EXISTS flag_cost double precision,
  ADD COLUMN IF NOT EXISTS tariff_flag text,
  ADD COLUMN IF NOT EXISTS flag_surcharge_per_kwh double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'irrigation_events_tariff_flag_check'
  ) THEN
    ALTER TABLE public.irrigation_events
      ADD CONSTRAINT irrigation_events_tariff_flag_check
      CHECK (tariff_flag IS NULL OR tariff_flag IN ('verde','amarela','vermelha_p1','vermelha_p2','personalizada'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'irrigation_events_flag_surcharge_nonnegative'
  ) THEN
    ALTER TABLE public.irrigation_events
      ADD CONSTRAINT irrigation_events_flag_surcharge_nonnegative
      CHECK (flag_surcharge_per_kwh IS NULL OR flag_surcharge_per_kwh >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.irrigation_events.base_energy_cost IS
  'Custo de energia antes do adicional de bandeira.';
COMMENT ON COLUMN public.irrigation_events.flag_cost IS
  'Custo adicional da bandeira tarifária no evento.';
