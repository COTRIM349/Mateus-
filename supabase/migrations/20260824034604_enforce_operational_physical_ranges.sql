-- Proteções físicas no nível do banco. Não mudam a estrutura da UI.

ALTER TABLE public.irrigation_events
  ADD CONSTRAINT irrigation_events_depth_mm_operational_check
  CHECK (depth_mm > 0 AND depth_mm <= 200),
  ADD CONSTRAINT irrigation_events_volume_m3_nonnegative_check
  CHECK (volume_m3 IS NULL OR volume_m3 >= 0),
  ADD CONSTRAINT irrigation_events_hours_operational_check
  CHECK (operating_hours IS NULL OR (operating_hours >= 0 AND operating_hours <= 72));

ALTER TABLE public.weather_readings
  ADD CONSTRAINT weather_readings_et0_nonnegative_check
  CHECK (et0_calculated IS NULL OR et0_calculated >= 0),
  ADD CONSTRAINT weather_readings_precip_nonnegative_check
  CHECK (precipitation IS NULL OR precipitation >= 0);

ALTER TABLE public.soils
  ADD CONSTRAINT soils_effective_depth_positive_check
  CHECK (effective_depth IS NULL OR effective_depth > 0),
  ADD CONSTRAINT soils_field_capacity_physical_check
  CHECK (field_capacity IS NULL OR (field_capacity > 0 AND field_capacity <= 0.7)),
  ADD CONSTRAINT soils_wilting_point_physical_check
  CHECK (wilting_point IS NULL OR (wilting_point >= 0 AND wilting_point <= 0.5));

ALTER TABLE public.pivots
  ADD CONSTRAINT pivots_active_technical_minimum_check
  CHECK (
    active = false OR (
      area IS NOT NULL AND area > 0 AND
      flow_rate IS NOT NULL AND flow_rate > 0 AND
      COALESCE(application_efficiency, efficiency) > 0 AND
      COALESCE(application_efficiency, efficiency) <= 1
    )
  );
