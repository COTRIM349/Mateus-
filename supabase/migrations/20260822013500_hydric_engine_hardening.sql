-- Motor hídrico V2: compatibilidade e integridade estrutural.

-- 1) Eficiência de aplicação explícita. CUC continua sendo uniformidade.
ALTER TABLE public.pivots
  ADD COLUMN IF NOT EXISTS application_efficiency double precision;

ALTER TABLE public.pivots
  DROP CONSTRAINT IF EXISTS pivots_application_efficiency_check;
ALTER TABLE public.pivots
  ADD CONSTRAINT pivots_application_efficiency_check
  CHECK (application_efficiency IS NULL OR (application_efficiency > 0 AND application_efficiency <= 1));

-- Migra apenas valores fisicamente válidos. Legado 0/nulo permanece NULL para
-- que o motor bloqueie a recomendação até a ficha técnica ser corrigida.
UPDATE public.pivots
   SET application_efficiency = efficiency
 WHERE application_efficiency IS NULL
   AND efficiency IS NOT NULL
   AND efficiency > 0
   AND efficiency <= 1;

COMMENT ON COLUMN public.pivots.application_efficiency IS
  'Eficiência de aplicação Ea (0-1). Usada para converter lâmina bruta em irrigação efetiva. Não confundir com CUC.';
COMMENT ON COLUMN public.pivots.cuc IS
  'Coeficiente de Uniformidade de Christiansen (0-1). Mede uniformidade espacial; não substitui eficiência de aplicação.';
COMMENT ON COLUMN public.pivots.efficiency IS
  'LEGADO. Espelho temporário de application_efficiency para leitores antigos. Não usar como CUC.';

-- 2) Pivô é equipamento: cultura pertence exclusivamente à parcela/safra.
UPDATE public.pivots SET culture_id = NULL WHERE culture_id IS NOT NULL;

ALTER TABLE public.pivots
  DROP CONSTRAINT IF EXISTS pivots_no_direct_culture;
ALTER TABLE public.pivots
  ADD CONSTRAINT pivots_no_direct_culture CHECK (culture_id IS NULL);

COMMENT ON COLUMN public.pivots.culture_id IS
  'DEPRECATED. Deve permanecer NULL. Cultura/cultivar/safra pertencem a pivot_crop_assignments (parcela).';

-- 3) Parcela com plantio futuro não pode ser tratada como manejo ativo.
UPDATE public.pivot_crop_assignments
   SET status = 'rascunho', active = false, updated_at = now()
 WHERE planting_date > CURRENT_DATE
   AND active = true
   AND COALESCE(status, 'ativa') = 'ativa';

-- 4) Views operacionais devem respeitar RLS do usuário que consulta.
ALTER VIEW public.v_pivot_overview SET (security_invoker = true);
ALTER VIEW public.v_latest_water_balance SET (security_invoker = true);
ALTER VIEW public.v_active_alerts SET (security_invoker = true);
ALTER VIEW public.v_sensor_status SET (security_invoker = true);

-- 5) Índices de FKs mais usadas no fluxo operacional.
CREATE INDEX IF NOT EXISTS idx_pca_climate_station_id ON public.pivot_crop_assignments(climate_station_id);
CREATE INDEX IF NOT EXISTS idx_pca_current_phase_id ON public.pivot_crop_assignments(current_phase_id);
CREATE INDEX IF NOT EXISTS idx_pca_soil_id ON public.pivot_crop_assignments(soil_id);
CREATE INDEX IF NOT EXISTS idx_weather_daily_selection_reading ON public.weather_daily_selection(selected_reading_id);
CREATE INDEX IF NOT EXISTS idx_weather_daily_selection_station ON public.weather_daily_selection(selected_station_id);
CREATE INDEX IF NOT EXISTS idx_weather_daily_selection_approved_by ON public.weather_daily_selection(approved_by);
CREATE INDEX IF NOT EXISTS idx_irrigation_recommendations_assignment ON public.irrigation_recommendations(crop_assignment_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_events_schedule ON public.irrigation_events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_recommendation ON public.schedule_slots(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_pump_house ON public.schedule_slots(pump_house_id);
CREATE INDEX IF NOT EXISTS idx_climate_ingestion_runs_station ON public.climate_ingestion_runs(station_id);
