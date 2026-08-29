-- ============================================================================
-- 00055 — Pausar atualização automática de propriedades ao trocar classe
-- ----------------------------------------------------------------------------
-- A classe do solo volta a ser apenas classificatória.
-- CC, PMP e densidade aparente permanecem com os valores atuais/fornecidos.
-- Mantém a tabela de referência para possível uso futuro, mas desabilita a
-- função automática para evitar qualquer alteração acidental.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION apply_pivot_soil_class_reference(UUID, TEXT)
FROM authenticated;

COMMENT ON FUNCTION apply_pivot_soil_class_reference(UUID, TEXT) IS
  'Função de referência temporariamente desabilitada. Alterar classe do solo não deve modificar CC, PMP ou densidade aparente.';
