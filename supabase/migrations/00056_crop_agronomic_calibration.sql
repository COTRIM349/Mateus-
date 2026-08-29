-- ============================================================================
-- Etapa G — Cadastro agronômico, fenologia térmica e calibração local
-- ----------------------------------------------------------------------------
-- Escopo EXCLUSIVO de cultura/cultivar/fenologia.
-- CAD, CC, PMP e demais propriedades do solo continuam sendo fonte do módulo SOLO.
-- Nenhum parâmetro de solo é duplicado neste cadastro.
-- ============================================================================

-- ── Fontes agronômicas rastreáveis ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agronomic_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key    TEXT NOT NULL UNIQUE,
  source_type   TEXT NOT NULL CHECK (source_type IN (
    'fao','embrapa','artigo','universidade','obtentor','assistencia_tecnica',
    'historico_fazenda','calibracao_local','estimativa_provisoria','outro'
  )),
  title         TEXT NOT NULL,
  institution   TEXT,
  authors       TEXT,
  publication_year INTEGER CHECK (publication_year IS NULL OR publication_year BETWEEN 1800 AND 2200),
  citation      TEXT NOT NULL,
  source_url    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE agronomic_sources IS
  'Catálogo de fontes dos parâmetros de cultura/cultivar. Permite distinguir literatura, obtentor, dado local e estimativa.';

INSERT INTO agronomic_sources
(source_key, source_type, title, institution, authors, publication_year, citation, source_url, notes)
VALUES
(
  'fao56-kc-single',
  'fao',
  'FAO Irrigation and Drainage Paper 56 — Crop Evapotranspiration',
  'FAO',
  'Allen, Pereira, Raes & Smith',
  1998,
  'FAO-56, Chapter 6, Table 12. Kc único e construção da curva por segmentos de reta.',
  'https://www.fao.org/4/X0490E/x0490e0b.htm',
  'Referência inicial. Valores devem ser ajustados às condições climáticas, molhamento e calibração local quando disponível.'
),
(
  'embrapa-soja-tb14',
  'embrapa',
  'Temperatura-base para estimativa dos graus-dia para cultivares de soja',
  'Pesquisa Agropecuária Brasileira / Embrapa',
  'Camargo, Brunini & Miranda',
  1987,
  'Camargo et al. Temperatura-base de 14 °C estimada para plantio-maturação nas cultivares avaliadas em SP.',
  'https://apct.sede.embrapa.br/pab/article/view/14252',
  'Não é valor universal de cultivar. Soja também responde fortemente ao fotoperíodo.'
),
(
  'embrapa-soja-fotoperiodo',
  'embrapa',
  'Resposta quantitativa do florescimento da soja à temperatura e ao fotoperíodo',
  'Pesquisa Agropecuária Brasileira / Embrapa',
  'Rodrigues et al.',
  2001,
  'Rodrigues et al. Modelo linear de florescimento considerando temperatura e fotoperíodo.',
  'https://apct.sede.embrapa.br/pab/article/view/6172',
  'Usar para justificar que graus-dia isolado não deve definir R1/R8 de todas as cultivares.'
),
(
  'embrapa-algodao-tb155',
  'embrapa',
  'Agrometeorologia dos Cultivos — Capítulo Algodão',
  'Embrapa',
  'Chiavegato, Salvatierra & Gottardo',
  2015,
  'Tabela de unidades de calor do algodoeiro calculadas com temperatura basal de 15,5 °C.',
  'https://www.embrapa.br/documents/1355291/37056285/Bases%2Bclimatol%C3%B3gicas_G.R.CUNHA_Livro_Agrometeorologia%2Bdos%2Bcultivos.pdf/13d616f5-cbd1-7261-b157-351eaa31188d?version=1.0',
  'Referência de manejo térmico; validar por cultivar e ambiente.'
),
(
  'fehr-caviness-soy',
  'universidade',
  'Stages of Soybean Development',
  'Iowa State University',
  'Fehr & Caviness',
  1977,
  'Fehr & Caviness. Stages of Soybean Development. Special Report 80.',
  NULL,
  'Escala VE/VC/Vn/R1–R8.'
),
(
  'marur-ruano-cotton',
  'artigo',
  'Escala do algodoeiro herbáceo',
  'Instituto Agronômico do Paraná',
  'Marur & Ruano',
  2001,
  'Escala fenológica brasileira do algodoeiro baseada em V, B, F e C.',
  NULL,
  'Usada como referência para marcadores de desenvolvimento do algodão.'
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type = EXCLUDED.source_type,
  title = EXCLUDED.title,
  institution = EXCLUDED.institution,
  authors = EXCLUDED.authors,
  publication_year = EXCLUDED.publication_year,
  citation = EXCLUDED.citation,
  source_url = EXCLUDED.source_url,
  notes = EXCLUDED.notes,
  updated_at = now();

ALTER TABLE agronomic_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY agronomic_sources_read_all ON agronomic_sources FOR SELECT USING (true);

-- ── Cultura base ────────────────────────────────────────────────────────────
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS phenology_scale TEXT;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kc_method TEXT NOT NULL DEFAULT 'linear_phenological'
  CHECK (kc_method IN ('linear_phenological','constant','dual_future'));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS degree_day_method TEXT NOT NULL DEFAULT 'simple_mean'
  CHECK (degree_day_method IN ('simple_mean','simple_mean_capped'));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS upper_temperature_c DOUBLE PRECISION
  CHECK (upper_temperature_c IS NULL OR (upper_temperature_c BETWEEN 0 AND 60));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS photoperiod_sensitive BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS thermal_source_id UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS kc_source_id UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS phenology_source_id UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS agronomic_confidence TEXT NOT NULL DEFAULT 'nao_validada'
  CHECK (agronomic_confidence IN ('alta','media','baixa','nao_validada'));
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS requires_local_calibration BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS agronomic_notes TEXT;

COMMENT ON COLUMN cultures.kc_method IS
  'Método do Kc. linear_phenological = Kc diário interpolado linearmente entre âncoras fenológicas.';
COMMENT ON COLUMN cultures.degree_day_method IS
  'Método térmico. simple_mean = max(0, ((Tmax+Tmin)/2)-Tb).';
COMMENT ON COLUMN cultures.photoperiod_sensitive IS
  'True quando o modelo fenológico não deve depender apenas de graus-dia; soja é o caso prioritário.';
COMMENT ON COLUMN cultures.requires_local_calibration IS
  'Indica que a literatura é referência inicial e deve ser confrontada com observações locais.';

-- ── Cultivar/variedade ──────────────────────────────────────────────────────
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS relative_maturity_group DOUBLE PRECISION
  CHECK (relative_maturity_group IS NULL OR (relative_maturity_group BETWEEN 0 AND 12));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS growth_habit TEXT
  CHECK (growth_habit IS NULL OR growth_habit IN (
    'determinado','semideterminado','indeterminado','desconhecido'
  ));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS long_juvenile_period BOOLEAN;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS photoperiod_sensitivity TEXT
  CHECK (photoperiod_sensitivity IS NULL OR photoperiod_sensitivity IN (
    'baixa','media','alta','desconhecida'
  ));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS basal_temperature_c DOUBLE PRECISION
  CHECK (basal_temperature_c IS NULL OR (basal_temperature_c BETWEEN 0 AND 30));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS upper_temperature_c DOUBLE PRECISION
  CHECK (upper_temperature_c IS NULL OR (upper_temperature_c BETWEEN 0 AND 60));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS optimal_temperature_c DOUBLE PRECISION
  CHECK (optimal_temperature_c IS NULL OR (optimal_temperature_c BETWEEN 0 AND 45));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS degree_day_method TEXT
  CHECK (degree_day_method IS NULL OR degree_day_method IN ('simple_mean','simple_mean_capped'));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS thermal_source_id UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS phenology_source_id UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS calibration_status TEXT NOT NULL DEFAULT 'nao_calibrada'
  CHECK (calibration_status IN (
    'nao_calibrada','em_calibracao','calibracao_parcial','calibrada_localmente'
  ));
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS phenology_model_level INTEGER NOT NULL DEFAULT 1
  CHECK (phenology_model_level BETWEEN 1 AND 4);
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS last_calibrated_at TIMESTAMPTZ;
ALTER TABLE culture_varieties ADD COLUMN IF NOT EXISTS calibration_notes TEXT;

COMMENT ON COLUMN culture_varieties.relative_maturity_group IS
  'Grupo de maturidade relativa da soja, quando aplicável. NULL para culturas onde não se aplica.';
COMMENT ON COLUMN culture_varieties.phenology_model_level IS
  '1=DAE+janela; 2=GDA+janela; 3=GDA+fotoperíodo; 4=modelo local calibrado.';
COMMENT ON COLUMN culture_varieties.basal_temperature_c IS
  'Override térmico específico da cultivar. NULL = herda cultures.basal_temperature_c.';

-- ── Rastreio de fonte por fase de manejo ───────────────────────────────────
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS source_note TEXT;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS critical_water_stage BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS physiological_process TEXT;
ALTER TABLE culture_phases ADD COLUMN IF NOT EXISTS yield_component_risk TEXT;

-- ── Marcadores fenológicos detalhados ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS culture_phenology_markers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id           UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  stage_code           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  marker_order         INTEGER NOT NULL,
  management_phase_key TEXT,
  critical_water_stage BOOLEAN NOT NULL DEFAULT false,
  physiological_process TEXT,
  yield_component_risk TEXT,
  source_id            UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL,
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(culture_id, stage_code),
  UNIQUE(culture_id, marker_order)
);

CREATE INDEX IF NOT EXISTS idx_cpm_culture ON culture_phenology_markers(culture_id, marker_order);

COMMENT ON TABLE culture_phenology_markers IS
  'Marcadores fenológicos detalhados (ex.: soja R1/R3/R5; algodão B1/F1/cutout). Não substitui culture_phases; complementa a previsão e calibração.';

-- ── Alvos fenológicos por cultivar ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS culture_variety_phenology_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variety_id     UUID NOT NULL REFERENCES culture_varieties(id) ON DELETE CASCADE,
  marker_id      UUID NOT NULL REFERENCES culture_phenology_markers(id) ON DELETE CASCADE,
  expected_dae   DOUBLE PRECISION CHECK (expected_dae IS NULL OR expected_dae >= 0),
  expected_gdd   DOUBLE PRECISION CHECK (expected_gdd IS NULL OR expected_gdd >= 0),
  calibrated_dae DOUBLE PRECISION CHECK (calibrated_dae IS NULL OR calibrated_dae >= 0),
  calibrated_gdd DOUBLE PRECISION CHECK (calibrated_gdd IS NULL OR calibrated_gdd >= 0),
  use_calibrated BOOLEAN NOT NULL DEFAULT false,
  source_id      UUID REFERENCES agronomic_sources(id) ON DELETE SET NULL,
  confidence     TEXT NOT NULL DEFAULT 'nao_validada'
                 CHECK (confidence IN ('alta','media','baixa','nao_validada')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(variety_id, marker_id)
);

CREATE INDEX IF NOT EXISTS idx_cvpt_variety ON culture_variety_phenology_targets(variety_id);

-- ── Observações de campo para calibração ───────────────────────────────────
CREATE TABLE IF NOT EXISTS phenology_observations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                   UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_crop_assignment_id  UUID NOT NULL REFERENCES pivot_crop_assignments(id) ON DELETE CASCADE,
  culture_id                UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  variety_id                UUID REFERENCES culture_varieties(id) ON DELETE SET NULL,
  marker_id                 UUID NOT NULL REFERENCES culture_phenology_markers(id) ON DELETE RESTRICT,
  observed_date             DATE NOT NULL,
  dae                       DOUBLE PRECISION NOT NULL CHECK (dae >= 0),
  gdd_accumulated           DOUBLE PRECISION CHECK (gdd_accumulated IS NULL OR gdd_accumulated >= 0),
  base_temperature_c        DOUBLE PRECISION CHECK (base_temperature_c IS NULL OR (base_temperature_c BETWEEN 0 AND 30)),
  photoperiod_hours         DOUBLE PRECISION CHECK (photoperiod_hours IS NULL OR (photoperiod_hours BETWEEN 0 AND 24)),
  quality                   TEXT NOT NULL DEFAULT 'campo'
                            CHECK (quality IN ('campo','estimada','revisada','descartada')),
  observed_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pivot_crop_assignment_id, marker_id, observed_date)
);

CREATE INDEX IF NOT EXISTS idx_pheno_obs_farm ON phenology_observations(farm_id);
CREATE INDEX IF NOT EXISTS idx_pheno_obs_variety ON phenology_observations(variety_id, marker_id);
CREATE INDEX IF NOT EXISTS idx_pheno_obs_date ON phenology_observations(observed_date DESC);

ALTER TABLE phenology_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_access_phenology_observations ON phenology_observations
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- ── Resultados de calibração local ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS culture_calibrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id            UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  culture_id         UUID NOT NULL REFERENCES cultures(id) ON DELETE CASCADE,
  variety_id         UUID REFERENCES culture_varieties(id) ON DELETE CASCADE,
  marker_id          UUID REFERENCES culture_phenology_markers(id) ON DELETE CASCADE,
  calibration_type   TEXT NOT NULL CHECK (calibration_type IN (
    'fenologia','temperatura_base','alinhamento_kc_fenologia','kc_etc'
  )),
  sowing_window      TEXT,
  base_temperature_c DOUBLE PRECISION CHECK (base_temperature_c IS NULL OR (base_temperature_c BETWEEN 0 AND 30)),
  n_observations     INTEGER NOT NULL DEFAULT 0 CHECK (n_observations >= 0),
  mean_gdd           DOUBLE PRECISION,
  median_gdd         DOUBLE PRECISION,
  sd_gdd             DOUBLE PRECISION,
  cv_pct             DOUBLE PRECISION,
  rmse_days          DOUBLE PRECISION,
  parameters         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'rascunho'
                     CHECK (status IN ('rascunho','aprovada','rejeitada')),
  approved_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at        TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_culture_calibration_scope
  ON culture_calibrations(farm_id, culture_id, variety_id, marker_id, calibration_type);
CREATE INDEX IF NOT EXISTS idx_culture_calibration_status
  ON culture_calibrations(status, created_at DESC);

ALTER TABLE culture_calibrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_access_culture_calibrations ON culture_calibrations
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- ── Histórico aceita eventos de calibração ─────────────────────────────────
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'culture_history'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%change_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE culture_history DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE culture_history
  ADD CONSTRAINT culture_history_change_type_check CHECK (change_type IN (
    'criacao','edicao','variedade_add','variedade_edit','variedade_del',
    'fase_add','fase_edit','fase_del','associacao',
    'parametro_agronomico','observacao_fenologica','calibracao_criada','calibracao_aprovada'
  ));

-- ── Referências iniciais, sem sobrescrever cadastro existente ───────────────
UPDATE cultures c
   SET phenology_scale = COALESCE(c.phenology_scale, 'Fehr & Caviness (VE–R8)'),
       basal_temperature_c = COALESCE(c.basal_temperature_c, 14.0),
       degree_day_method = COALESCE(c.degree_day_method, 'simple_mean'),
       photoperiod_sensitive = true,
       thermal_source_id = COALESCE(c.thermal_source_id,
         (SELECT id FROM agronomic_sources WHERE source_key = 'embrapa-soja-tb14')),
       kc_source_id = COALESCE(c.kc_source_id,
         (SELECT id FROM agronomic_sources WHERE source_key = 'fao56-kc-single')),
       phenology_source_id = COALESCE(c.phenology_source_id,
         (SELECT id FROM agronomic_sources WHERE source_key = 'fehr-caviness-soy')),
       agronomic_confidence = CASE WHEN c.agronomic_confidence = 'nao_validada' THEN 'media' ELSE c.agronomic_confidence END,
       requires_local_calibration = true,
       agronomic_notes = COALESCE(c.agronomic_notes,
         'Referência térmica inicial; na soja, graus-dia isolado não substitui cultivar, grupo de maturidade, janela de semeadura e fotoperíodo.')
 WHERE lower(c.name) = 'soja'
    OR lower(COALESCE(c.scientific_name,'')) LIKE '%glycine max%';

UPDATE cultures c
   SET phenology_scale = COALESCE(c.phenology_scale, 'Marur & Ruano (V/B/F/C)'),
       basal_temperature_c = COALESCE(c.basal_temperature_c, 15.5),
       degree_day_method = COALESCE(c.degree_day_method, 'simple_mean'),
       thermal_source_id = COALESCE(c.thermal_source_id,
         (SELECT id FROM agronomic_sources WHERE source_key = 'embrapa-algodao-tb155')),
       kc_source_id = COALESCE(c.kc_source_id,
         (SELECT id FROM agronomic_sources WHERE source_key = 'fao56-kc-single')),
       phenology_source_id = COALESCE(c.phenology_source_id,
         (SELECT id FROM agronomic_sources WHERE source_key = 'marur-ruano-cotton')),
       agronomic_confidence = CASE WHEN c.agronomic_confidence = 'nao_validada' THEN 'media' ELSE c.agronomic_confidence END,
       requires_local_calibration = true,
       agronomic_notes = COALESCE(c.agronomic_notes,
         'Temperatura basal de 15,5 °C é referência de literatura para unidades de calor; validar por cultivar e ambiente.')
 WHERE lower(c.name) IN ('algodão','algodao')
    OR lower(COALESCE(c.scientific_name,'')) LIKE '%gossypium%';

-- ── Marcadores padrão de SOJA (somente se a cultura existir) ───────────────
INSERT INTO culture_phenology_markers
(culture_id, stage_code, name, marker_order, management_phase_key, critical_water_stage, physiological_process, yield_component_risk, source_id)
SELECT c.id, x.stage_code, x.name, x.marker_order, x.phase_key, x.critical, x.process, x.risk,
       (SELECT id FROM agronomic_sources WHERE source_key = 'fehr-caviness-soy')
FROM cultures c
CROSS JOIN (VALUES
  ('VE','Emergência',1,'emergencia',false,'Emergência e estabelecimento','Estande e uniformidade'),
  ('VC','Cotilédones desenvolvidos',2,'emergencia',false,'Estabelecimento inicial','Estande'),
  ('R1','Início do florescimento',3,'florescimento',true,'Florescimento e início da demanda reprodutiva','Número potencial de flores e nós reprodutivos'),
  ('R2','Florescimento pleno',4,'florescimento',true,'Florescimento pleno','Retenção de flores'),
  ('R3','Início da formação de vagens',5,'formacao_vagens',true,'Formação e pegamento de vagens','Número de vagens'),
  ('R4','Vagem completamente desenvolvida',6,'formacao_vagens',true,'Retenção e crescimento de vagens','Número de vagens'),
  ('R5','Início do enchimento de grãos',7,'enchimento_graos',true,'Acúmulo de matéria seca nos grãos','Número e peso de grãos'),
  ('R6','Grão cheio',8,'enchimento_graos',true,'Final do enchimento','Peso de grãos'),
  ('R7','Início da maturação',9,'maturacao',false,'Senescência e maturação','Peso final e qualidade'),
  ('R8','Maturação plena',10,'maturacao',false,'Maturação','Colheita e qualidade')
) AS x(stage_code,name,marker_order,phase_key,critical,process,risk)
WHERE (lower(c.name) = 'soja' OR lower(COALESCE(c.scientific_name,'')) LIKE '%glycine max%')
ON CONFLICT (culture_id, stage_code) DO NOTHING;

-- ── Marcadores padrão de ALGODÃO ───────────────────────────────────────────
INSERT INTO culture_phenology_markers
(culture_id, stage_code, name, marker_order, management_phase_key, critical_water_stage, physiological_process, yield_component_risk, source_id)
SELECT c.id, x.stage_code, x.name, x.marker_order, x.phase_key, x.critical, x.process, x.risk,
       (SELECT id FROM agronomic_sources WHERE source_key = 'marur-ruano-cotton')
FROM cultures c
CROSS JOIN (VALUES
  ('V0','Emergência',1,'emergencia',false,'Emergência e estabelecimento','Estande'),
  ('RF1','Primeiro ramo frutífero',2,'vegetativo',false,'Transição para arquitetura reprodutiva','Número de posições frutíferas'),
  ('B1','Primeiro botão floral',3,'botoes',true,'Diferenciação e crescimento de botões','Número de estruturas reprodutivas'),
  ('F1','Primeira flor branca',4,'florescimento',true,'Florescimento e pegamento','Retenção de flores e maçãs'),
  ('PF','Pico de florescimento',5,'florescimento',true,'Máxima atividade reprodutiva','Retenção de estruturas'),
  ('CO','Cutout / corte fisiológico',6,'formacao_macas',true,'Equilíbrio fonte-dreno e cessação de novas posições','Número e enchimento de maçãs'),
  ('C1','Primeiro capulho aberto',7,'enchimento',false,'Maturação e deiscência','Qualidade e peso de fibra'),
  ('MAT','Maturidade / pré-colheita',8,'maturacao',false,'Maturação final','Qualidade de fibra e colheita')
) AS x(stage_code,name,marker_order,phase_key,critical,process,risk)
WHERE (lower(c.name) IN ('algodão','algodao') OR lower(COALESCE(c.scientific_name,'')) LIKE '%gossypium%')
ON CONFLICT (culture_id, stage_code) DO NOTHING;

-- Rastreia que o Kc existente de soja/algodão é referência, não verdade de cultivar.
UPDATE culture_phases p
   SET source_id = COALESCE(p.source_id, (SELECT id FROM agronomic_sources WHERE source_key = 'fao56-kc-single')),
       source_note = COALESCE(p.source_note,
         'Curva linear de referência. Âncoras devem ser revisadas por literatura regional e/ou calibração local; não representam automaticamente uma cultivar específica.')
 WHERE p.culture_id IN (
   SELECT id FROM cultures
    WHERE lower(name) IN ('soja','algodão','algodao')
       OR lower(COALESCE(scientific_name,'')) LIKE '%glycine max%'
       OR lower(COALESCE(scientific_name,'')) LIKE '%gossypium%'
 );

-- ── Fim ────────────────────────────────────────────────────────────────────
