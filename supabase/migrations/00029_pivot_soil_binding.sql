-- ============================================================================
-- Sprint 14 · Etapa 1a — Solo passa a ser do PIVÔ (equipamento)
-- ----------------------------------------------------------------------------
-- Mudança de modelo: no Sprint 13, o solo era vinculado à parcela
-- (pivot_crop_assignments.soil_id). A partir de agora, o solo é uma
-- característica do PIVÔ (equipamento) — cada pivô ocupa uma área com
-- um solo dominante, que herda para todas as parcelas dele.
--
-- Estratégia (aditiva, zero break):
--   1. Adiciona pivots.soil_id (nullable)
--   2. Backfill: preenche pivots.soil_id com o soil_id da parcela ATIVA
--      mais recente daquele pivô (se houver)
--   3. Mantém pivot_crop_assignments.soil_id preenchido e funcional
--      (motor lê como fallback) — deprecado via COMMENT
--   4. Adaptações do motor de balanço serão em Etapa 7 (parcela puxa do
--      pivô se não tiver override próprio)
-- ============================================================================

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS soil_id UUID
  REFERENCES soils(id) ON DELETE SET NULL;

COMMENT ON COLUMN pivots.soil_id IS
  'Solo dominante do pivô. Novas parcelas herdam este solo automaticamente. NULL = solo não definido no equipamento (parcela deve informar).';

CREATE INDEX IF NOT EXISTS idx_pivots_soil ON pivots(soil_id);

-- Backfill: pega o soil_id da parcela ativa mais recente por pivô.
UPDATE pivots p
   SET soil_id = pca.soil_id
  FROM (
    SELECT DISTINCT ON (pivot_id)
           pivot_id, soil_id, created_at
      FROM pivot_crop_assignments
     WHERE active = true
       AND soil_id IS NOT NULL
       AND (status IS NULL OR status = 'ativa')
     ORDER BY pivot_id, created_at DESC
  ) pca
 WHERE p.id = pca.pivot_id
   AND p.soil_id IS NULL;

-- Marca a coluna da parcela como deprecada. Continua funcionando (não
-- removida) — motor pode ler dela como fallback quando pivots.soil_id
-- estiver NULL, mas a UI de parcela deixa de pedir esse campo.
COMMENT ON COLUMN pivot_crop_assignments.soil_id IS
  'DEPRECATED (Sprint 14). Solo agora é característica do pivô (pivots.soil_id). Este campo persiste apenas para compatibilidade histórica. UI de parcela não expõe mais.';
