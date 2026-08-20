-- ============================================================================
-- Etapa A — Pivô como ficha técnica (equipamento permanente)
-- ----------------------------------------------------------------------------
-- Cultura, cultivar, estádio, safra e Kc NÃO pertencem ao pivô.
-- A coluna culture_id permanece no banco (sem DROP, sem apagar dados) e
-- fica depreciada: o cadastro deixa de ler/gravar esse vínculo.
--
-- Campos aditivos da ficha técnica que ainda não existiam.
-- ============================================================================

COMMENT ON COLUMN pivots.culture_id IS
  'DEPRECATED (Etapa A). Cultura pertence à parcela (pivot_crop_assignments). O cadastro do equipamento não lê nem grava este campo.';

COMMENT ON COLUMN pivots.status IS
  'DEPRECATED (Etapa A). Status operacional não faz parte da ficha técnica. Derivar da parcela ativa e dos eventos de irrigação.';

-- ── Campos técnicos faltantes ──────────────────────────────────────────────
ALTER TABLE pivots ADD COLUMN IF NOT EXISTS tower_count INTEGER
  CHECK (tower_count IS NULL OR tower_count > 0);

COMMENT ON COLUMN pivots.tower_count IS
  'Número de torres do equipamento.';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS length_m DOUBLE PRECISION
  CHECK (length_m IS NULL OR length_m > 0);

COMMENT ON COLUMN pivots.length_m IS
  'Comprimento total do equipamento (m).';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS min_depth_mm DOUBLE PRECISION
  CHECK (min_depth_mm IS NULL OR min_depth_mm >= 0);

COMMENT ON COLUMN pivots.min_depth_mm IS
  'Lâmina mínima aplicável (mm) — limite técnico do percentímetro.';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS max_depth_mm DOUBLE PRECISION
  CHECK (max_depth_mm IS NULL OR max_depth_mm >= 0);

COMMENT ON COLUMN pivots.max_depth_mm IS
  'Lâmina máxima aplicável (mm) — limite técnico do percentímetro.';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS technical_notes TEXT;

COMMENT ON COLUMN pivots.technical_notes IS
  'Observações técnicas do equipamento. Sem dados agronômicos de cultura.';

ALTER TABLE pivots ADD COLUMN IF NOT EXISTS water_source TEXT
  CHECK (water_source IS NULL OR water_source IN (
    'rio','poco','reservatorio','canal','outorga','misto','outro'
  ));

COMMENT ON COLUMN pivots.water_source IS
  'Fonte hídrica do equipamento (infraestrutura). A parcela pode registrar contexto operacional próprio.';
