-- ============================================================================
-- Sprint 13 · Etapa 4a — Corrige FK de variety_id em parcelas
-- ----------------------------------------------------------------------------
-- Descoberto após aplicar 00027: já existe a tabela `culture_varieties`
-- (Sprint 5, migration 00007), com N variedades por cultura. A coluna
-- `variety_id` deve apontar para essa tabela, não para `cultures`.
--
-- Além disso, a self-ref `variety_of_id` em `cultures` (adicionada na
-- 00026) vira redundante — mantemos por hora (custo zero), mas o app usa
-- `culture_varieties` como fonte da verdade.
--
-- Como a coluna `variety_id` foi adicionada nova em 00027 e está NULL
-- em todas as linhas existentes, é seguro trocar a FK.
-- ============================================================================

-- Drop da FK antiga (variety_id → cultures)
ALTER TABLE pivot_crop_assignments
  DROP CONSTRAINT IF EXISTS pivot_crop_assignments_variety_id_fkey;

-- Nova FK (variety_id → culture_varieties)
ALTER TABLE pivot_crop_assignments
  ADD CONSTRAINT pivot_crop_assignments_variety_id_fkey
  FOREIGN KEY (variety_id) REFERENCES culture_varieties(id) ON DELETE SET NULL;

COMMENT ON COLUMN pivot_crop_assignments.variety_id IS
  'Variedade da parcela (aponta para culture_varieties.id). NULL = variedade não especificada.';

-- Mantém `variety_of_id` em cultures marcado como reserva futura
COMMENT ON COLUMN cultures.variety_of_id IS
  'RESERVADO (Sprint 13). Alternativa para modelar variedades por self-ref. Fonte da verdade atual é a tabela culture_varieties.';
