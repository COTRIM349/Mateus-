-- ============================================================================
-- Sprint 14 · Etapa 1b — Ks e Kl com opções expandidas
-- ----------------------------------------------------------------------------
-- Sprint 13 adicionou Ks (linear/exponential/sigmoid/none) e Kl (número).
-- Agora expandimos para incluir as funções clássicas de irrigação:
--
--   Ks — coeficiente de estresse hídrico:
--     linear        FAO-56 padrão (Allen et al., 1998)
--     fao33         FAO Paper 33, Doorenbos & Kassam 1979 (Ky por fase)
--     exponential   decai côncavo (nosso)
--     sigmoid       transição suave (nosso)
--     none          Ks fixo em 1 (sem estresse)
--
--   Kl — coeficiente de localização (função):
--     fereres           Fereres, 1981 (padrão iCrop)
--     keller_karmeli    Keller & Karmeli, 1975
--     freitas           Vermeiren-Jobling, 1980
--     bernardo          Bernardo et al., 2019 (Manual Brasil)
--     constant          Kl fixo (default 1.0 — pivô central)
--     custom            usuário digita direto
--
-- Mudança: colunas ks_function e kl_function ganham novos valores no CHECK.
-- Estratégia: DROP + ADD CHECK (Postgres não deixa alterar CHECK in place).
-- ============================================================================

-- ── CULTURES · ks_function ────────────────────────────────────────────────

-- Remove CHECK antigo (pode ter nome variável dependendo de como foi criado).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'cultures'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%ks_function%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE cultures DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE cultures
  ADD CONSTRAINT cultures_ks_function_check
  CHECK (ks_function IS NULL OR ks_function IN (
    'linear','fao33','exponential','sigmoid','none'
  ));

COMMENT ON COLUMN cultures.ks_function IS
  'Função de cálculo do Ks. linear = FAO-56 padrão; fao33 = Doorenbos-Kassam (Ky); exponential/sigmoid = nossos; none = Ks fixo em 1.';

-- ── CULTURES · kl_function (nova coluna) ──────────────────────────────────

-- A coluna cultures.kl (valor numérico) permanece para o caso "constant"/"custom".
-- Adicionamos kl_function para dizer QUAL fórmula usar.
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kl_function TEXT
  DEFAULT 'constant'
  CHECK (kl_function IN (
    'constant','custom','fereres','keller_karmeli','freitas','bernardo'
  ));

COMMENT ON COLUMN cultures.kl_function IS
  'Função de cálculo do Kl. constant/custom = usa valor fixo em cultures.kl; demais = calcula dinamicamente a partir de área sombreada, espaçamento etc.';

-- ── CULTURE_PHASES · ks_function (override por fase) ──────────────────────

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'culture_phases'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%ks_function%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE culture_phases DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE culture_phases
  ADD CONSTRAINT culture_phases_ks_function_check
  CHECK (ks_function IS NULL OR ks_function IN (
    'linear','fao33','exponential','sigmoid','none'
  ));

-- ── CULTURE_PHASES · Ky (para FAO 33) ─────────────────────────────────────

-- FAO 33 usa Ky (coeficiente de resposta ao rendimento) por fase.
-- Cada cultura tem Ky diferente em cada fase — valores clássicos:
--   Algodão: floração=0.5, enchimento=0.25
--   Milho: floração=1.5, enchimento=0.5
--   Soja: floração=0.8, enchimento=1.0
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS ky DOUBLE PRECISION
  CHECK (ky IS NULL OR (ky BETWEEN 0 AND 3));

COMMENT ON COLUMN culture_phases.ky IS
  'Coeficiente de resposta ao rendimento (FAO 33, Doorenbos-Kassam 1979). Usado somente quando ks_function=fao33.';

-- ── PARCEL OVERRIDES ──────────────────────────────────────────────────────

-- pivot_crop_assignments.ks_function_override já existia (Sprint 13, 00027)
-- com CHECK ('linear','exponential','sigmoid','none'). Amplia.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'pivot_crop_assignments'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%ks_function_override%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pivot_crop_assignments DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE pivot_crop_assignments
  ADD CONSTRAINT pca_ks_function_override_check
  CHECK (ks_function_override IS NULL OR ks_function_override IN (
    'linear','fao33','exponential','sigmoid','none'
  ));

-- ── Fim ────────────────────────────────────────────────────────────────────
