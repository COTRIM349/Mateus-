-- ============================================================================
-- Etapa E — Kc linear, Ks, KL e Ky (rastreio do dia)
-- ----------------------------------------------------------------------------
-- Persiste os coeficientes usados no motor. Sem DROP.
-- ETc (coluna etc) = ETo × Kc × KL × Ks (ajustada). etc_potential sem Ks.
-- Ky / yield_risk = risco produtivo (FAO-33). NÃO define lâmina diária.
-- ============================================================================

ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS ks DOUBLE PRECISION
  CHECK (ks IS NULL OR (ks BETWEEN 0 AND 1));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS kl DOUBLE PRECISION
  CHECK (kl IS NULL OR (kl BETWEEN 0 AND 1));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS kc_adjusted DOUBLE PRECISION
  CHECK (kc_adjusted IS NULL OR (kc_adjusted BETWEEN 0 AND 2.5));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS etc_potential DOUBLE PRECISION
  CHECK (etc_potential IS NULL OR etc_potential >= 0);
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS ky DOUBLE PRECISION
  CHECK (ky IS NULL OR (ky BETWEEN 0 AND 3));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS yield_risk DOUBLE PRECISION
  CHECK (yield_risk IS NULL OR yield_risk >= 0);
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS etc_formula TEXT;

COMMENT ON COLUMN water_balances.kc IS
  'Kc interpolado linearmente na fase (adimensional).';
COMMENT ON COLUMN water_balances.ks IS
  'Ks FAO-56 no início do dia. 1 enquanto Dr ≤ AFD. Não usa Ky.';
COMMENT ON COLUMN water_balances.kl IS
  'KL do dia. Pivô central com molhamento pleno = 1.';
COMMENT ON COLUMN water_balances.kc_adjusted IS
  'Kc × KL × Ks — coeficiente efetivo da ETc ajustada.';
COMMENT ON COLUMN water_balances.etc_potential IS
  'ETc potencial = ETo × Kc × KL (mm), sem estresse.';
COMMENT ON COLUMN water_balances.etc IS
  'ETc ajustada = ETo × Kc × KL × Ks (mm). Consome o balanço.';
COMMENT ON COLUMN water_balances.ky IS
  'Ky da fase/cultura (FAO-33). Risco produtivo, não lâmina.';
COMMENT ON COLUMN water_balances.yield_risk IS
  'Indicador diário Ky × (1 − Ks). Não entra na lâmina recomendada.';
COMMENT ON COLUMN water_balances.etc_formula IS
  'Memória de cálculo: ETc = ETo × Kc × KL × Ks.';
