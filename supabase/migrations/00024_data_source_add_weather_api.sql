-- ============================================================================
-- Correção pontual — CHECK constraint de weather_stations.data_source
-- ----------------------------------------------------------------------------
-- OBJETIVO:
--   Permitir o valor 'weather_api' em weather_stations.data_source sem
--   remover nenhum valor já aceito nem alterar registros existentes.
--
-- POR QUÊ:
--   O provider WeatherAPI.com foi habilitado no código, mas o INSERT da
--   estação virtual está sendo rejeitado por violar
--   weather_stations_data_source_check em produção — sinal de que a
--   migration 00023 ainda não foi aplicada.
--
-- SEGURANÇA:
--   • Só altera o CHECK constraint homônimo — nenhum outro objeto do banco.
--   • DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT: idempotente.
--   • Não faz UPDATE em weather_stations nem em nenhuma outra tabela.
--   • Não mexe em priority, station_type, active, nem em qualquer coluna
--     de qualquer estação já cadastrada.
--   • Não altera dados do Open-Meteo, do balanço hídrico, nem
--     weather_daily_selection.
--   • A união abaixo cobre TODOS os valores historicamente aceitos
--     (00005 + 00017 + 00019) mais 'weather_api'.
--
-- PRÉ-VALIDAÇÃO (rode antes de aplicar, para conferir que a lista abaixo
-- cobre todos os valores hoje em uso):
--
--     SELECT DISTINCT data_source FROM weather_stations;
--
--   Todos os valores retornados devem aparecer na cláusula IN abaixo. Se
--   algum não aparecer, PARE — o DROP+ADD reprovaria a linha na
--   revalidação do CHECK. Nesse caso, acrescente o valor faltante à lista
--   antes de aplicar.
-- ============================================================================

BEGIN;

ALTER TABLE weather_stations
  DROP CONSTRAINT IF EXISTS weather_stations_data_source_check;

ALTER TABLE weather_stations
  ADD CONSTRAINT weather_stations_data_source_check
    CHECK (data_source IN (
      'manual',           -- sempre foi aceito (00005)
      'open_meteo',       -- aceito desde a Sprint 5.1 (00017)
      'weather_api',      -- NOVO: fonte secundária de comparação
      'br_dwgd',          -- aceito desde 00019 (reservado p/ Sprint 5.3)
      'api_inmet',        -- aceito desde 00005
      'api_nasa_power',   -- aceito desde 00005
      'davis_link',       -- aceito desde 00005
      'campo_station',    -- aceito desde 00005
      'outro'             -- aceito desde 00005
    ));

COMMIT;

-- ============================================================================
-- Pós-validação (opcional):
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'weather_stations_data_source_check';
--
--   → deve incluir 'weather_api' na lista IN.
--
-- Rollback (se algo der errado antes do COMMIT, o BEGIN acima protege):
--   ROLLBACK;
-- ============================================================================
