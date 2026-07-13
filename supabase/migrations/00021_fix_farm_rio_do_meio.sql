-- ============================================================================
-- Correção de dados — Fazenda Rio do Meio
-- ----------------------------------------------------------------------------
-- Ajusta as coordenadas cadastradas erradas (≈14.1 / 46.63, hemisfério norte
-- e Península Arábica) para os valores corretos derivados do Google Earth:
--     14°38'56.75"S / 45°14'02.49"O  →  -14.6491 / -45.2340
--
-- SEGURANÇA:
--   • Só toca em registros cujo nome contenha 'rio do meio' (case-insensitive)
--     E cujas coordenadas atuais estejam na faixa incorreta específica —
--     assim não atropelamos nenhum outro registro nem sobrescrevemos dados já
--     corretos. Idempotente.
--   • Após corrigir a fazenda, sincroniza latitude/longitude da estação virtual
--     vinculada e limpa a última sincronização para forçar nova ingestão.
--   • Limpa weather_readings, weather_forecasts e weather_daily_selection
--     que foram gerados com a coordenada errada.
-- ============================================================================

DO $$
DECLARE
  v_farm_id UUID;
BEGIN
  -- 1) Corrige a fazenda somente se a coordenada atual bater com o padrão errado.
  UPDATE farms
     SET latitude  = -14.6491,
         longitude = -45.2340
   WHERE name ILIKE '%rio do meio%'
     AND latitude BETWEEN 13.9 AND 14.3       -- faixa do valor errado (positivo)
     AND longitude BETWEEN 46.4 AND 46.9      -- faixa do valor errado
  RETURNING id INTO v_farm_id;

  IF v_farm_id IS NULL THEN
    RAISE NOTICE 'Fazenda Rio do Meio não encontrada na faixa errada; nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'Corrigida fazenda %.', v_farm_id;

  -- 2) Sincroniza coordenadas da estação virtual da fazenda (só afeta virtual).
  UPDATE weather_stations
     SET latitude       = -14.6491,
         longitude      = -45.2340,
         sync_status    = 'idle',
         sync_error     = 'coordenadas corrigidas — nova sincronização necessária'
   WHERE farm_id      = v_farm_id
     AND station_type = 'virtual';

  -- 3) Limpa leituras, previsões e seleções geradas com coordenada errada.
  DELETE FROM weather_daily_selection
   WHERE farm_id = v_farm_id;

  DELETE FROM weather_forecasts
   WHERE farm_id = v_farm_id;

  DELETE FROM weather_readings wr
   USING weather_stations ws
   WHERE ws.id = wr.station_id
     AND ws.farm_id = v_farm_id
     AND ws.station_type = 'virtual';

  -- 4) Mantém histórico de climate_ingestion_runs para auditoria (não apaga).
END $$;
