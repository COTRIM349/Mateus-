-- ============================================================================
-- Etapa F — núcleo do balanço diário (CAD, AFD, ARM, Pe, umidade de segurança)
-- ----------------------------------------------------------------------------
-- Aditivo. Sem DROP. soil_storage continua sendo o ARM (mm); cad continua CAD/ADT (mm).
-- % da CC é volumétrico (100 × θ / θCC) — não é ARM/CAD.
-- Pe: USDA-SCS limitada pelo espaço até a CAD.
-- ============================================================================

ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS safety_moisture_mm DOUBLE PRECISION
  CHECK (safety_moisture_mm IS NULL OR safety_moisture_mm >= 0);
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS moisture_pct_cc DOUBLE PRECISION
  CHECK (moisture_pct_cc IS NULL OR (moisture_pct_cc BETWEEN 0 AND 100));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS safety_pct_cc DOUBLE PRECISION
  CHECK (safety_pct_cc IS NULL OR (safety_pct_cc BETWEEN 0 AND 100));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS field_capacity DOUBLE PRECISION
  CHECK (field_capacity IS NULL OR (field_capacity >= 0 AND field_capacity <= 1));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS wilting_point DOUBLE PRECISION
  CHECK (wilting_point IS NULL OR (wilting_point >= 0 AND wilting_point < 1));
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS pe_formula TEXT;
ALTER TABLE water_balances ADD COLUMN IF NOT EXISTS balance_formula TEXT;

COMMENT ON COLUMN water_balances.cad IS
  'CAD/ADT (mm) — água disponível total na zona radicular no dia.';
COMMENT ON COLUMN water_balances.afd IS
  'AFD (mm) = CAD × p.';
COMMENT ON COLUMN water_balances.soil_storage IS
  'ARM (mm) — água armazenada na zona radicular. 0 ≤ ARM ≤ CAD.';
COMMENT ON COLUMN water_balances.effective_precipitation IS
  'Pe (mm) — USDA-SCS limitada pelo espaço até a CAD.';
COMMENT ON COLUMN water_balances.safety_moisture_mm IS
  'Umidade de segurança (mm) = CAD − AFD. ARM no limite da AFD.';
COMMENT ON COLUMN water_balances.moisture_pct_cc IS
  'Umidade atual em % da CC (volumétrico). Não é % da CAD.';
COMMENT ON COLUMN water_balances.safety_pct_cc IS
  'Umidade de segurança em % da CC (volumétrico).';
COMMENT ON COLUMN water_balances.field_capacity IS
  'θCC volumétrico (cm³/cm³) usado no dia, até Z.';
COMMENT ON COLUMN water_balances.wilting_point IS
  'θPMP volumétrico (cm³/cm³) usado no dia, até Z.';
COMMENT ON COLUMN water_balances.pe_formula IS
  'Memória de cálculo da chuva efetiva.';
COMMENT ON COLUMN water_balances.balance_formula IS
  'Memória de cálculo: ARM = ARM₀ + Pe + I_ef − ETc.';
