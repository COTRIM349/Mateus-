-- Marcador de alinhamento do ambiente produtivo.
-- A migration `hydric_engine_hardening_v2` foi aplicada diretamente no projeto
-- Supabase conectado após a primeira tentativa ser rejeitada por um registro
-- legado com efficiency=0. O arquivo 20260822013500 contém o SQL idempotente
-- corrigido que representa o estado desejado para ambientes novos.
SELECT 1;
