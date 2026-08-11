-- ============================================================================
-- Sprint 13 · Etapa 1b — Cultura + Fases enriquecidas
-- ----------------------------------------------------------------------------
-- Adiciona variáveis agronômicas de manejo de irrigação que faltavam:
--   • Cultura: variedade (self-ref), Kl, Ks base, T ótima/basal, por fase.
--   • Fases: cor, graus-dia, kc constante, área sombreada, função Ks, ITN%,
--            próxima fase (self-ref), ciclos.
--
-- Nada é removido. Campos novos são NULLABLE para não quebrar culturas
-- já cadastradas.
-- ============================================================================

-- ── CULTURAS ───────────────────────────────────────────────────────────────

-- Variedade: uma "variedade" é uma linha em cultures que aponta pra outra
-- linha em cultures (a "cultura base"). Ex.: cultura base "Algodão" tem
-- variedades "FM 985 GLTP", "IMA 5675 B2RF", etc. Assim reaproveitamos a
-- mesma tabela.
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS variety_of_id UUID
  REFERENCES cultures(id) ON DELETE SET NULL;

COMMENT ON COLUMN cultures.variety_of_id IS
  'Se preenchido, indica que esta linha é uma VARIEDADE da cultura apontada. NULL = cultura base. Ex.: "FM 985 GLTP" tem variety_of_id apontando pra "Algodão".';

CREATE INDEX IF NOT EXISTS idx_cultures_variety_of ON cultures(variety_of_id);

-- Kl: coeficiente de localização — fração da área efetivamente molhada
-- (relevante em gotejamento e aspersão localizada; em pivô central típico ~1).
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kl DOUBLE PRECISION
  DEFAULT 1.0
  CHECK (kl IS NULL OR (kl BETWEEN 0 AND 1));

COMMENT ON COLUMN cultures.kl IS
  'Coeficiente de localização (0-1). Fração da área molhada. Pivô central típico = 1.0.';

-- Ks função: como calcular o coeficiente de estresse hídrico dinamicamente.
-- Linear é FAO-56 padrão; alternativas para culturas com curva conhecida.
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS ks_function TEXT
  DEFAULT 'linear'
  CHECK (ks_function IN ('linear','exponential','sigmoid','none'));

COMMENT ON COLUMN cultures.ks_function IS
  'Função de cálculo do Ks. linear = FAO-56 padrão. none = sem estresse (Ks fixo em 1).';

-- Temperaturas para graus-dia
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS optimal_temperature_c DOUBLE PRECISION
  CHECK (optimal_temperature_c IS NULL OR (optimal_temperature_c BETWEEN 0 AND 45));

ALTER TABLE cultures ADD COLUMN IF NOT EXISTS basal_temperature_c DOUBLE PRECISION
  CHECK (basal_temperature_c IS NULL OR (basal_temperature_c BETWEEN 0 AND 30));

COMMENT ON COLUMN cultures.optimal_temperature_c IS
  'Temperatura ótima da cultura (°C). Ex.: algodão ~28, milho ~26.';

COMMENT ON COLUMN cultures.basal_temperature_c IS
  'Temperatura basal (°C) — abaixo desta não há acúmulo de graus-dia. Ex.: algodão 10, milho 8.';

-- Manejo por fase (sim/não): se sim, o motor usa parâmetros da fase atual;
-- se não, usa os globais da cultura.
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS by_phase BOOLEAN
  DEFAULT true;

COMMENT ON COLUMN cultures.by_phase IS
  'Se true, cálculos usam parâmetros da fase atual (culture_phases). Se false, usa os globais da cultura.';

-- Kc constante: se a cultura tem Kc fixo no ciclo (raro, mas possível
-- para pastagens permanentes).
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kc_constant BOOLEAN
  DEFAULT false;

COMMENT ON COLUMN cultures.kc_constant IS
  'Se true, Kc é o mesmo no ciclo inteiro (pastagens perenes). Se false, Kc varia por fase.';

-- ── FASES DA CULTURA ───────────────────────────────────────────────────────

-- Cor da fase na timeline (hex ou nome tailwind).
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS color TEXT
  DEFAULT '#94a3b8';

COMMENT ON COLUMN culture_phases.color IS
  'Cor da fase na timeline visual. Formato hex (#rrggbb). Padrão cinza-slate.';

-- Duração alternativa em graus-dia (soma de graus-dia acima da T basal).
-- Mais preciso que dias corridos para culturas em climas variáveis.
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS duration_degree_days DOUBLE PRECISION
  CHECK (duration_degree_days IS NULL OR duration_degree_days > 0);

COMMENT ON COLUMN culture_phases.duration_degree_days IS
  'Duração da fase em graus-dia acumulados (°C·dia). Alternativa mais precisa a duration_days.';

-- Kc constante nessa fase (usa só kc_start, ignora kc_end).
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS kc_constant BOOLEAN
  DEFAULT false;

COMMENT ON COLUMN culture_phases.kc_constant IS
  'Se true, Kc é constante nesta fase (usa kc_start). Se false, interpola entre kc_start e kc_end.';

-- Área sombreada (%): cobertura do dossel — importante para Ke (evaporação).
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS shaded_area_pct DOUBLE PRECISION
  CHECK (shaded_area_pct IS NULL OR (shaded_area_pct BETWEEN 0 AND 100));

COMMENT ON COLUMN culture_phases.shaded_area_pct IS
  'Percentual de cobertura do dossel (0-100). Usado para separar Kc = Kcb + Ke.';

-- Função Ks para esta fase (sobrescreve o padrão da cultura).
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS ks_function TEXT
  CHECK (ks_function IS NULL OR ks_function IN ('linear','exponential','sigmoid','none'));

COMMENT ON COLUMN culture_phases.ks_function IS
  'Função Ks nesta fase. NULL = herda de cultures.ks_function.';

-- ITN — Irrigação Total Necessária (%): pode reduzir a lâmina em fases
-- menos críticas (irrigação deficitária controlada).
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS itn_pct DOUBLE PRECISION
  DEFAULT 100
  CHECK (itn_pct IS NULL OR (itn_pct BETWEEN 0 AND 150));

COMMENT ON COLUMN culture_phases.itn_pct IS
  'Irrigação Total Necessária (%). 100 = repõe 100% do déficit. Fases menos críticas podem usar 70-80%.';

-- Encadeamento explícito para ciclos com rebrota (ex.: cana, capim).
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS next_phase_id UUID
  REFERENCES culture_phases(id) ON DELETE SET NULL;

ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS cycle_count INTEGER
  DEFAULT 1
  CHECK (cycle_count IS NULL OR cycle_count > 0);

ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS ends_cycle BOOLEAN
  DEFAULT false;

COMMENT ON COLUMN culture_phases.next_phase_id IS
  'Próxima fase (self-ref). Se NULL, usa phase_order + 1.';

COMMENT ON COLUMN culture_phases.cycle_count IS
  'Quantas vezes esta fase se repete no ciclo (relevante para rebrotas).';

COMMENT ON COLUMN culture_phases.ends_cycle IS
  'Se true, ao final desta fase reinicia o ciclo (rebrota).';

CREATE INDEX IF NOT EXISTS idx_culture_phases_next ON culture_phases(next_phase_id);

-- ── Fim ────────────────────────────────────────────────────────────────────
