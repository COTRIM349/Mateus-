-- ============================================================================
-- Sprint 14 · Etapa 1c — Método Sensorial de Solo (Boletins de Campo)
-- ----------------------------------------------------------------------------
-- Método tátil clássico (USDA-NRCS · Marouelli et al./Embrapa) para avaliar
-- umidade do solo por amostragem manual. Agrônomo/pivozeiro pega o solo,
-- avalia consistência/plasticidade/coesão e atribui uma NOTA de 1 a 9 em
-- passos de 0,5. A nota converte para % de Capacidade de Campo via tabela
-- fixa (0031_soil_sensory_scale).
--
-- Uma leitura tem até 3 camadas (superficial, média, profunda). Cada
-- camada tem sua própria nota — o solo pode estar seco em cima e úmido
-- embaixo (ou o contrário).
--
-- Se `use_in_balance = true`, essa leitura substitui o cálculo teórico do
-- balanço hídrico no dia (motor lê e re-inicializa a partir da leitura
-- sensorial — Sprint 14 · Etapa 7).
-- ============================================================================

-- ── Tabela: leituras sensoriais por pivô ──────────────────────────────────

CREATE TABLE IF NOT EXISTS soil_sensory_readings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id              UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id             UUID NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  reading_date         DATE NOT NULL,

  -- Unidade de expressão da umidade (referência do lançamento)
  moisture_unit        TEXT NOT NULL DEFAULT 'weight'
                       CHECK (moisture_unit IN ('weight','volume')),

  -- Se true, esta leitura é usada como ground truth pelo motor de balanço.
  -- Se false, é só registro histórico (auditoria).
  use_in_balance       BOOLEAN NOT NULL DEFAULT true,

  -- Notas por camada (1.0 a 9.0, passo 0.5)
  layer_1_note         NUMERIC(2,1)
                       CHECK (layer_1_note IS NULL OR (layer_1_note BETWEEN 1.0 AND 9.0)),
  layer_2_note         NUMERIC(2,1)
                       CHECK (layer_2_note IS NULL OR (layer_2_note BETWEEN 1.0 AND 9.0)),
  layer_3_note         NUMERIC(2,1)
                       CHECK (layer_3_note IS NULL OR (layer_3_note BETWEEN 1.0 AND 9.0)),

  -- Umidade calculada (% da CC ou % em peso/volume, conforme moisture_unit).
  -- Grava pra auditoria e agilizar consultas — motor recalcula quando muda
  -- a metodologia.
  layer_1_moisture_pct NUMERIC(5,2)
                       CHECK (layer_1_moisture_pct IS NULL OR (layer_1_moisture_pct BETWEEN 0 AND 100)),
  layer_2_moisture_pct NUMERIC(5,2)
                       CHECK (layer_2_moisture_pct IS NULL OR (layer_2_moisture_pct BETWEEN 0 AND 100)),
  layer_3_moisture_pct NUMERIC(5,2)
                       CHECK (layer_3_moisture_pct IS NULL OR (layer_3_moisture_pct BETWEEN 0 AND 100)),

  -- Observações do avaliador
  notes                TEXT,
  observed_by          UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Não pode haver 2 leituras no mesmo pivô/dia
  UNIQUE(pivot_id, reading_date)
);

COMMENT ON TABLE soil_sensory_readings IS
  'Leituras sensoriais (método tátil) de umidade do solo por pivô. Até 3 camadas por leitura. Alimenta o balanço hídrico quando use_in_balance=true.';

CREATE INDEX IF NOT EXISTS idx_ssr_farm ON soil_sensory_readings(farm_id);
CREATE INDEX IF NOT EXISTS idx_ssr_pivot ON soil_sensory_readings(pivot_id);
CREATE INDEX IF NOT EXISTS idx_ssr_date ON soil_sensory_readings(reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_ssr_active ON soil_sensory_readings(use_in_balance) WHERE use_in_balance = true;

-- ── Tabela de referência: escala nota → % CC ───────────────────────────────

-- Tabela FIXA de conversão (não editável pela UI). Mantida em SQL para que
-- consultas SQL puras possam converter sem depender do app.
CREATE TABLE IF NOT EXISTS soil_sensory_scale (
  note              NUMERIC(2,1) PRIMARY KEY
                    CHECK (note BETWEEN 1.0 AND 9.0),
  moisture_pct_cc   NUMERIC(5,2) NOT NULL
                    CHECK (moisture_pct_cc BETWEEN 0 AND 100),
  description_pt    TEXT NOT NULL,
  category          TEXT NOT NULL
                    CHECK (category IN ('umido','moderado','critico','seco'))
);

COMMENT ON TABLE soil_sensory_scale IS
  'Escala fixa de conversão nota tátil (1-9) → % da capacidade de campo. Base: USDA-NRCS / Marouelli et al. Embrapa / Bernardo, Mantovani & Soares 2019.';

-- Seed da escala (17 entradas: 1.0 a 9.0 em passos de 0.5)
INSERT INTO soil_sensory_scale (note, moisture_pct_cc, description_pt, category) VALUES
  (1.0, 100, 'Capacidade de campo — brilho superficial, drenagem livre ao pressionar', 'umido'),
  (1.5,  96, 'Estado plástico, molda fita longa (>5 cm) contínua sem fissuras',       'umido'),
  (2.0,  92, 'Muito plástico, molda fita 3–5 cm, brilho intenso',                     'umido'),
  (2.5,  88, 'Plástico, molda fita curta (2–3 cm), superfície lisa',                  'umido'),
  (3.0,  83, 'Fita curta com fissuras, superfície opaca',                             'umido'),
  (3.5,  79, 'Molda bola facilmente, plasticidade média',                             'moderado'),
  (4.0,  75, 'Bola resiste à pressão moderada, sem brilho',                           'moderado'),
  (4.5,  71, 'Bola frágil, tende a esfarelar sob pressão',                            'moderado'),
  (5.0,  67, 'Bola coesa quebra ao apertar, coesão reduzida',                         'moderado'),
  (5.5,  63, 'Bola fragmenta com pequena pressão, aspecto granuloso',                 'moderado'),
  (6.0,  58, 'Solo esfarela ao moldar, sem plasticidade',                             'moderado'),
  (6.5,  54, 'Torrões pequenos, coesão mínima',                                       'critico'),
  (7.0,  50, 'Limite da AFD — solo pulverulento, ponto crítico de manejo',            'critico'),
  (7.5,  43, 'Solo seco ao tato, agregados quebradiços',                              'critico'),
  (8.0,  35, 'Grãos livres, coloração clara, sem umidade tátil',                      'seco'),
  (8.5,  27, 'Endurecido, torrões duros, aspecto seco intenso',                       'seco'),
  (9.0,  18, 'Próximo ao PMP — extrema secura, fendilhamento visível',                'seco')
ON CONFLICT (note) DO UPDATE
  SET moisture_pct_cc = EXCLUDED.moisture_pct_cc,
      description_pt = EXCLUDED.description_pt,
      category = EXCLUDED.category;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE soil_sensory_readings ENABLE ROW LEVEL SECURITY;

-- Padrão do repositório: função auth_farm_ids() retorna as fazendas do usuário.
CREATE POLICY farm_access_soil_sensory_readings ON soil_sensory_readings
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Escala de referência é read-only pública (todos podem ler).
ALTER TABLE soil_sensory_scale ENABLE ROW LEVEL SECURITY;
CREATE POLICY soil_sensory_scale_read_all ON soil_sensory_scale FOR SELECT USING (true);

-- ── Fim ────────────────────────────────────────────────────────────────────
