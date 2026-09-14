-- ============================================================================
-- Âncora hídrica operacional — tabela ausente nas migrations (schema drift)
-- ----------------------------------------------------------------------------
-- O código operacional lê e grava `hydric_initial_conditions` (PLURAL) em:
--   • components/water-balance/HydricInitialConditionForm.tsx  (INSERT)
--   • app/(app)/balanco-hidrico/page.tsx                       (SELECT)
--   • lib/hooks/use-farm-hydric-state-v2.ts                    (SELECT)
-- mas NENHUMA migration do repositório cria essa tabela. Só existe a tabela
-- v4 (singular) `hydric_initial_condition`, que é outra coisa e ainda não foi
-- aplicada. Sem esta tabela, "Salvar condição inicial" falha e o balanço fica
-- permanentemente bloqueado ("defina uma condição inicial confiável do solo").
--
-- IDEMPOTENTE (IF NOT EXISTS): se a tabela já existir no banco (criada fora do
-- repositório), esta migration é inócua e apenas restaura a reprodutibilidade
-- do schema a partir das migrations. NÃO-DESTRUTIVA.
--
-- Colunas espelham exatamente o que o app grava/lê.
-- ATENÇÃO: aplicar somente com autorização explícita (política do projeto).
-- ============================================================================

CREATE TABLE IF NOT EXISTS hydric_initial_conditions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                   UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_crop_assignment_id  UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,

  effective_date            DATE NOT NULL,                 -- data da âncora
  measured_at               TIMESTAMPTZ,                   -- quando foi registrada
  source                    TEXT NOT NULL CHECK (source IN ('measured','field_capacity_confirmed')),

  -- Umidade observada (nula quando a âncora é capacidade de campo confirmada).
  moisture_value            DOUBLE PRECISION CHECK (moisture_value IS NULL OR moisture_value >= 0),
  moisture_unit             TEXT,                          -- ex.: volume_pct, weight_pct, field_capacity_fraction
  is_field_capacity         BOOLEAN NOT NULL DEFAULT false,

  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE hydric_initial_conditions IS
  'Âncora hídrica datada por parcela (condição inicial do balanço). O sistema não presume ARM inicial: sem âncora, o balanço fica bloqueado.';

CREATE INDEX IF NOT EXISTS idx_hydric_initial_conditions_parcel_date
  ON hydric_initial_conditions(pivot_crop_assignment_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_hydric_initial_conditions_farm
  ON hydric_initial_conditions(farm_id);

-- RLS no padrão do repositório (auth_farm_ids()).
ALTER TABLE hydric_initial_conditions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hydric_initial_conditions'
      AND policyname = 'farm_access_hydric_initial_conditions'
  ) THEN
    CREATE POLICY farm_access_hydric_initial_conditions ON hydric_initial_conditions
      FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (manual): DROP TABLE IF EXISTS hydric_initial_conditions;
-- Não remover sem confirmar que a tabela não guarda âncoras já registradas.
-- ============================================================================
