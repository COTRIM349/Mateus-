-- Gate 0 da versão 2.0: integridade das coordenadas operacionais.
--
-- NOT VALID preserva registros históricos já existentes para correção auditada,
-- mas a regra passa a valer imediatamente para novos INSERT/UPDATE. Assim, uma
-- fazenda/estação inválida pode ser desativada, porém não pode continuar ativa
-- após uma nova gravação sem corrigir latitude e longitude.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.farms'::regclass
       AND conname = 'farms_active_requires_valid_coordinates_chk'
  ) THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT farms_active_requires_valid_coordinates_chk
      CHECK (
        active IS NOT TRUE OR (
          latitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND
          longitude IS NOT NULL AND longitude BETWEEN -180 AND 180
        )
      ) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT farms_active_requires_valid_coordinates_chk ON public.farms IS
  'Fazenda ativa exige latitude/longitude decimais dentro dos limites geográficos.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.weather_stations'::regclass
       AND conname = 'weather_stations_active_requires_valid_coordinates_chk'
  ) THEN
    ALTER TABLE public.weather_stations
      ADD CONSTRAINT weather_stations_active_requires_valid_coordinates_chk
      CHECK (
        active IS NOT TRUE OR (
          latitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND
          longitude IS NOT NULL AND longitude BETWEEN -180 AND 180
        )
      ) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT weather_stations_active_requires_valid_coordinates_chk ON public.weather_stations IS
  'Estação ativa exige latitude/longitude decimais dentro dos limites geográficos.';
