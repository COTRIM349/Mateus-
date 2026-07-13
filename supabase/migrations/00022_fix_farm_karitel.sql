-- ============================================================================
-- Correção de dados — Fazenda Karitel
-- ----------------------------------------------------------------------------
-- Coordenadas confirmadas no Google Earth:
--     14°46'33.55"S / 45°33'59.60"O → -14.775986 / -45.566556
-- Valores errados atualmente gravados: -14.1 / -46.63
--
-- Após a correção, invalida todos os dados climáticos derivados das coordenadas
-- erradas e reseta a origem da altitude para 'unknown' — a próxima sincronização
-- consultará a elevation real do grid Open-Meteo (~853 m) e a persistirá com
-- altitude_origin='open_meteo'.
--
-- SEGURANÇA:
--   • Só toca em registros cujo nome contenha 'karitel' (case-insensitive)
--     E cujas coordenadas atuais estejam na faixa incorreta específica.
--   • Idempotente — se rodar duas vezes, o segundo run não encontra nada.
-- ============================================================================

DO $$
DECLARE
  v_farm_id UUID;
BEGIN
  -- 1) Corrige a fazenda somente se a coordenada atual bater com o padrão errado.
  UPDATE farms
     SET latitude  = -14.775986,
         longitude = -45.566556
   WHERE name ILIKE '%karitel%'
     AND latitude  BETWEEN -14.15 AND -14.05
     AND longitude BETWEEN -46.70 AND -46.55
  RETURNING id INTO v_farm_id;

  IF v_farm_id IS NULL THEN
    RAISE NOTICE 'Fazenda Karitel não encontrada na faixa errada; nada a fazer.';
    RETURN;
  END IF;

  RAISE NOTICE 'Corrigida fazenda Karitel (id=%). Coord agora: -14.775986 / -45.566556.', v_farm_id;

  -- 2) Sincroniza coordenadas da estação virtual e limpa a altitude para forçar
  --    consulta ao Open-Meteo na próxima sincronização.
  UPDATE weather_stations
     SET latitude        = -14.775986,
         longitude       = -45.566556,
         altitude        = 0,
         altitude_origin = 'unknown',
         sync_status     = 'idle',
         sync_error      = 'coordenadas corrigidas — nova sincronização necessária',
         last_sync_at    = NULL
   WHERE farm_id      = v_farm_id
     AND station_type = 'virtual';

  -- 3) Invalida seleções diárias vinculadas às coordenadas erradas.
  DELETE FROM weather_daily_selection
   WHERE farm_id = v_farm_id;

  -- 4) Invalida previsões geradas com coordenada errada.
  DELETE FROM weather_forecasts
   WHERE farm_id = v_farm_id;

  -- 5) Invalida leituras observadas geradas com coordenada errada
  --    (somente da estação virtual — leituras de estações físicas, se
  --    existirem, são preservadas).
  DELETE FROM weather_readings wr
   USING weather_stations ws
   WHERE ws.id = wr.station_id
     AND ws.farm_id = v_farm_id
     AND ws.station_type = 'virtual';

  -- 6) Histórico de climate_ingestion_runs é preservado para auditoria.
  --    O contexto (request_latitude/longitude) das runs anteriores permite
  --    rastrear que aquelas execuções usaram as coordenadas erradas.
END $$;
