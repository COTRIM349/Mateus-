-- ============================================================================
-- Balanço v4 · Fatia 2 — Persistência versionada do motor hídrico canônico
-- ----------------------------------------------------------------------------
-- NÃO-DESTRUTIVO. Cria tabelas NOVAS ao lado das legadas (water_balances,
-- irrigation_recommendations permanecem intactas). Permite modo sombra:
-- v4 e legado rodam lado a lado até a validação (Fatia 6).
--
-- Reversível — rollback no fim do arquivo (comentado).
--
-- Referências: prompt mestre §10; prompt detalhado §25, §40.
-- ============================================================================

-- ── 1. Condição hídrica inicial (âncora datada — §7.5 / §8) ────────────────
-- Nenhuma parcela pode iniciar cálculo oficial sem uma âncora datada.
CREATE TABLE IF NOT EXISTS hydric_initial_condition (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id          UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  -- Parcela pode ser null se a âncora for do pivô antes de abrir parcela.
  parcel_id         UUID REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  zone              TEXT,                              -- setor/zona, quando aplicável

  anchor_date       DATE NOT NULL,                     -- data da âncora
  method            TEXT NOT NULL CHECK (method IN (
                      'field_measurement','validated_sensor','tactile',
                      'previous_balance','confirmed_irrigation_to_cc','manual'
                    )),

  -- Valor da âncora: informar ARM OU Dr (um dos dois), com unidade.
  arm_mm            DOUBLE PRECISION CHECK (arm_mm IS NULL OR arm_mm >= 0),
  dr_mm             DOUBLE PRECISION CHECK (dr_mm  IS NULL OR dr_mm  >= 0),
  considered_depth_cm DOUBLE PRECISION CHECK (considered_depth_cm IS NULL OR considered_depth_cm > 0),

  confidence        TEXT NOT NULL DEFAULT 'media'
                    CHECK (confidence IN ('alta','media','baixa')),
  responsible       UUID REFERENCES users(id) ON DELETE SET NULL,
  evidence          TEXT,                              -- observação/evidência
  justification     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- EXATAMENTE um dos dois valores de âncora (ARM xor Dr) — evita estado
  -- ambíguo em que ambos são informados e podem divergir.
  CHECK ((arm_mm IS NOT NULL) <> (dr_mm IS NOT NULL))
);

COMMENT ON TABLE hydric_initial_condition IS
  'Âncora hídrica datada por parcela/pivô (spec §7.5). Obrigatória para o cálculo oficial. Não assumir capacidade de campo automaticamente.';

CREATE INDEX IF NOT EXISTS idx_hic_farm ON hydric_initial_condition(farm_id);
CREATE INDEX IF NOT EXISTS idx_hic_pivot_date ON hydric_initial_condition(pivot_id, anchor_date DESC);

-- Unicidade null-safe: um índice para âncoras de PARCELA (parcel_id não nulo)
-- e outro para âncoras de PIVÔ (parcel_id nulo — que a UNIQUE comum não cobre,
-- pois no Postgres cada NULL é distinto). Garante 1 âncora por escopo/data.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hic_parcel_anchor
  ON hydric_initial_condition(pivot_id, parcel_id, anchor_date)
  WHERE parcel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hic_pivot_anchor
  ON hydric_initial_condition(pivot_id, anchor_date)
  WHERE parcel_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_hic_parcel ON hydric_initial_condition(parcel_id);

-- ── 2. Balanço diário canônico versionado (§10, §25, §40) ──────────────────
CREATE TABLE IF NOT EXISTS hydric_balance_daily (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave lógica (spec §10): empresa/fazenda, pivô, parcela, zona, data, versão.
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id          UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  parcel_id         UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  zone              TEXT NOT NULL DEFAULT 'default',
  balance_date      DATE NOT NULL,
  engine_version    TEXT NOT NULL,                     -- ex.: hydric_engine_v4.0.0
  coefficient_mode  TEXT NOT NULL CHECK (coefficient_mode IN ('single','dual')),

  -- Entradas do dia (snapshot para rastreabilidade — §40)
  eto_mm            DOUBLE PRECISION,                  -- null = indisponível
  eto_source        TEXT,
  eto_nature        TEXT CHECK (eto_nature IS NULL OR eto_nature IN ('observed','estimated','forecast')),
  kc                DOUBLE PRECISION,
  kl                DOUBLE PRECISION,
  ke                DOUBLE PRECISION,
  root_depth_m      DOUBLE PRECISION,
  p_base            DOUBLE PRECISION,
  rainfall_mm       DOUBLE PRECISION,                  -- bruta; null = indisponível
  rainfall_effective_mm DOUBLE PRECISION,
  irrigation_gross_mm DOUBLE PRECISION,
  irrigation_effective_mm DOUBLE PRECISION,
  application_efficiency DOUBLE PRECISION,
  capillary_rise_mm DOUBLE PRECISION,
  previous_arm_mm   DOUBLE PRECISION,

  -- Resultados canônicos
  cad_mm            DOUBLE PRECISION,
  afd_mm            DOUBLE PRECISION,
  arm_critico_mm    DOUBLE PRECISION,
  p_adjusted        DOUBLE PRECISION,
  etc_potential_mm  DOUBLE PRECISION,
  ks                DOUBLE PRECISION CHECK (ks IS NULL OR (ks BETWEEN 0 AND 1)),
  etc_real_mm       DOUBLE PRECISION,
  arm_mm            DOUBLE PRECISION,
  dr_mm             DOUBLE PRECISION,
  pct_arm           DOUBLE PRECISION,
  deep_percolation_mm DOUBLE PRECISION,
  hydric_state      TEXT,

  -- Meta de cálculo
  computed          BOOLEAN NOT NULL DEFAULT false,     -- false = faltou dado
  missing_inputs    JSONB,                              -- requisitos faltantes
  input_snapshot    JSONB,                              -- entradas completas (auditoria)
  formula_version   TEXT,                               -- versão das fórmulas

  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unicidade lógica (§10): não sobrescrever versões antigas — nova versão
  -- do motor cria linha nova identificável.
  UNIQUE (farm_id, pivot_id, parcel_id, zone, balance_date, engine_version)
);

COMMENT ON TABLE hydric_balance_daily IS
  'Balanço hídrico diário canônico versionado (spec §10). Cada dia tem seu registro com snapshot de entradas e versão do motor. Não sobrescreve versões anteriores (backfill cria versão nova).';

CREATE INDEX IF NOT EXISTS idx_hbd_farm_date ON hydric_balance_daily(farm_id, balance_date DESC);
CREATE INDEX IF NOT EXISTS idx_hbd_parcel_date ON hydric_balance_daily(parcel_id, balance_date DESC);
CREATE INDEX IF NOT EXISTS idx_hbd_version ON hydric_balance_daily(engine_version);
CREATE INDEX IF NOT EXISTS idx_hbd_blocked ON hydric_balance_daily(computed) WHERE computed = false;

-- ── 3. Observação sensorial/umidade de campo (§36) ─────────────────────────
-- Reusa soil_sensory_readings (Sprint 14) para nota tátil. Aqui só um vínculo
-- opcional de calibração: nota manual NÃO substitui o balanço calculado.
-- (nada a criar — soil_sensory_readings já existe.)

-- ── 4. RLS (padrão do repositório: auth_farm_ids()) ────────────────────────
ALTER TABLE hydric_initial_condition ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_access_hydric_initial_condition ON hydric_initial_condition
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

ALTER TABLE hydric_balance_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_access_hydric_balance_daily ON hydric_balance_daily
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- ============================================================================
-- ROLLBACK (aplicar manualmente se necessário reverter):
--   DROP TABLE IF EXISTS hydric_balance_daily;
--   DROP TABLE IF EXISTS hydric_initial_condition;
-- Nenhuma tabela legada é tocada — reverter não perde dados existentes.
-- ============================================================================
