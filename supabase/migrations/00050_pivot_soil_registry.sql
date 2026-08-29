-- ============================================================================
-- 00050 — Cadastro físico de solo por pivô (independente do balanço hídrico)
-- ----------------------------------------------------------------------------
-- Regras:
--   • 1 cadastro de solo para cada pivô, criado automaticamente.
--   • Sem catálogo genérico e sem etapa manual de associação/vinculação.
--   • Somente dados fornecidos: classe, VIB, unidade CC/PMP e camadas.
--   • Camadas: espessura, CC, PMP, densidade aparente.
--   • DTA e CAD são derivados por camada; não armazenam estimativas.
--   • Este cadastro NÃO substitui soils/soil_layers usados pelo motor hídrico.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pivot_soils (
  pivot_id UUID PRIMARY KEY REFERENCES pivots(id) ON DELETE CASCADE,
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  soil_class TEXT,
  infiltration_rate_mm_h DOUBLE PRECISION
    CHECK (infiltration_rate_mm_h IS NULL OR infiltration_rate_mm_h >= 0),
  cc_pmp_unit TEXT
    CHECK (cc_pmp_unit IS NULL OR cc_pmp_unit IN ('gravimetric_pct', 'volumetric_pct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pivot_soils IS
  'Cadastro físico 1:1 do solo de cada pivô. Não é catálogo genérico e não depende de cultura, parcela ou balanço hídrico.';

COMMENT ON COLUMN pivot_soils.soil_class IS
  'Classificação do solo exatamente como fornecida. NULL = não informado.';

COMMENT ON COLUMN pivot_soils.infiltration_rate_mm_h IS
  'Velocidade de infiltração básica (mm/h) fornecida. NULL = não informado.';

COMMENT ON COLUMN pivot_soils.cc_pmp_unit IS
  'Unidade dos valores de CC/PMP fornecidos: gravimetric_pct = % em peso; volumetric_pct = % volumétrica.';

CREATE INDEX IF NOT EXISTS idx_pivot_soils_farm ON pivot_soils(farm_id);

CREATE TABLE IF NOT EXISTS pivot_soil_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id UUID NOT NULL REFERENCES pivot_soils(pivot_id) ON DELETE CASCADE,
  layer_number INTEGER NOT NULL CHECK (layer_number > 0),
  thickness_m DOUBLE PRECISION
    CHECK (thickness_m IS NULL OR thickness_m > 0),
  field_capacity_pct DOUBLE PRECISION,
  wilting_point_pct DOUBLE PRECISION,
  bulk_density_g_cm3 DOUBLE PRECISION
    CHECK (bulk_density_g_cm3 IS NULL OR bulk_density_g_cm3 > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pivot_soil_layer UNIQUE (pivot_id, layer_number),
  CONSTRAINT chk_pivot_soil_layer_cc_pmp
    CHECK (
      field_capacity_pct IS NULL
      OR wilting_point_pct IS NULL
      OR field_capacity_pct > wilting_point_pct
    )
);

COMMENT ON TABLE pivot_soil_layers IS
  'Camadas do cadastro físico por pivô. Não contém argila, areia, silte, KL, AFD ou dados de manejo.';

COMMENT ON COLUMN pivot_soil_layers.field_capacity_pct IS
  'Capacidade de campo no valor percentual exatamente informado na origem. A unidade vem de pivot_soils.cc_pmp_unit.';

COMMENT ON COLUMN pivot_soil_layers.wilting_point_pct IS
  'Ponto de murchamento no valor percentual exatamente informado na origem. A unidade vem de pivot_soils.cc_pmp_unit.';

COMMENT ON COLUMN pivot_soil_layers.bulk_density_g_cm3 IS
  'Densidade aparente fornecida em g/cm³.';

CREATE INDEX IF NOT EXISTS idx_pivot_soil_layers_pivot
  ON pivot_soil_layers(pivot_id, layer_number);

-- Atualização automática de updated_at.
DROP TRIGGER IF EXISTS trg_pivot_soils_updated ON pivot_soils;
CREATE TRIGGER trg_pivot_soils_updated
  BEFORE UPDATE ON pivot_soils
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_pivot_soil_layers_updated ON pivot_soil_layers;
CREATE TRIGGER trg_pivot_soil_layers_updated
  BEFORE UPDATE ON pivot_soil_layers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Cria o cadastro de solo automaticamente ao criar um pivô e mantém farm_id coerente.
CREATE OR REPLACE FUNCTION ensure_pivot_soil_registry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO pivot_soils (pivot_id, farm_id)
  VALUES (NEW.id, NEW.farm_id)
  ON CONFLICT (pivot_id)
  DO UPDATE SET farm_id = EXCLUDED.farm_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_pivot_soil_registry ON pivots;
CREATE TRIGGER trg_ensure_pivot_soil_registry
  AFTER INSERT OR UPDATE OF farm_id ON pivots
  FOR EACH ROW EXECUTE FUNCTION ensure_pivot_soil_registry();

-- Backfill de todos os pivôs já existentes: cada pivô passa a ter seu cadastro.
INSERT INTO pivot_soils (pivot_id, farm_id)
SELECT id, farm_id
FROM pivots
ON CONFLICT (pivot_id)
DO UPDATE SET farm_id = EXCLUDED.farm_id;

-- RLS.
ALTER TABLE pivot_soils ENABLE ROW LEVEL SECURITY;
ALTER TABLE pivot_soil_layers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_access_pivot_soils" ON pivot_soils;
CREATE POLICY "farm_access_pivot_soils" ON pivot_soils
  FOR ALL
  USING (farm_id IN (SELECT auth_farm_ids()))
  WITH CHECK (farm_id IN (SELECT auth_farm_ids()));

DROP POLICY IF EXISTS "farm_access_pivot_soil_layers" ON pivot_soil_layers;
CREATE POLICY "farm_access_pivot_soil_layers" ON pivot_soil_layers
  FOR ALL
  USING (
    pivot_id IN (
      SELECT pivot_id
      FROM pivot_soils
      WHERE farm_id IN (SELECT auth_farm_ids())
    )
  )
  WITH CHECK (
    pivot_id IN (
      SELECT pivot_id
      FROM pivot_soils
      WHERE farm_id IN (SELECT auth_farm_ids())
    )
  );

-- View somente de leitura com DTA e CAD derivados dos dados fornecidos.
-- Fórmulas:
-- % em peso: DTA = ((CC - PMP) × Da) / 10   [mm/cm]
-- % volumétrica: DTA = (CC - PMP) / 10      [mm/cm]
-- CAD camada = DTA × espessura_cm            [mm]
CREATE OR REPLACE VIEW pivot_soil_layers_calculated
WITH (security_invoker = true)
AS
SELECT
  l.id,
  l.pivot_id,
  l.layer_number,
  l.thickness_m,
  l.field_capacity_pct,
  l.wilting_point_pct,
  l.bulk_density_g_cm3,
  ps.cc_pmp_unit,
  CASE
    WHEN l.field_capacity_pct IS NULL
      OR l.wilting_point_pct IS NULL
      OR ps.cc_pmp_unit IS NULL
    THEN NULL
    WHEN ps.cc_pmp_unit = 'gravimetric_pct' AND l.bulk_density_g_cm3 IS NOT NULL
    THEN ((l.field_capacity_pct - l.wilting_point_pct) * l.bulk_density_g_cm3) / 10.0
    WHEN ps.cc_pmp_unit = 'volumetric_pct'
    THEN (l.field_capacity_pct - l.wilting_point_pct) / 10.0
    ELSE NULL
  END AS dta_mm_cm,
  CASE
    WHEN l.thickness_m IS NULL
      OR l.field_capacity_pct IS NULL
      OR l.wilting_point_pct IS NULL
      OR ps.cc_pmp_unit IS NULL
    THEN NULL
    WHEN ps.cc_pmp_unit = 'gravimetric_pct' AND l.bulk_density_g_cm3 IS NOT NULL
    THEN (((l.field_capacity_pct - l.wilting_point_pct) * l.bulk_density_g_cm3) / 10.0)
         * (l.thickness_m * 100.0)
    WHEN ps.cc_pmp_unit = 'volumetric_pct'
    THEN ((l.field_capacity_pct - l.wilting_point_pct) / 10.0)
         * (l.thickness_m * 100.0)
    ELSE NULL
  END AS cad_mm,
  l.created_at,
  l.updated_at
FROM pivot_soil_layers l
JOIN pivot_soils ps ON ps.pivot_id = l.pivot_id;

-- ============================================================================
-- Dados fornecidos pelo usuário — Fazenda Karitel
-- Não há extrapolação: ausência de dado permanece NULL.
-- ============================================================================

-- Classe + VIB fornecidos em planilha para PV 01–24.
WITH provided_profiles(pivot_name, soil_class, vib) AS (
  VALUES
    ('Pivô 01','Franco-Arenoso',60.0),
    ('Pivô 02','Franco-Arenoso',60.0),
    ('Pivô 03','Franco-Arenoso',60.0),
    ('Pivô 04','Franco-Arenoso',60.0),
    ('Pivô 05','Franco-Arenoso',60.0),
    ('Pivô 06','Franco-Arenoso',60.0),
    ('Pivô 07','Franco-Arenoso',60.0),
    ('Pivô 08','Franco-Arenoso',60.0),
    ('Pivô 09','Franco-Arenoso',60.0),
    ('Pivô 10','Franco-Arenoso',60.0),
    ('Pivô 11','Franco-Arenoso',60.0),
    ('Pivô 12','Franco-Arenoso',60.0),
    ('Pivô 13','Franco-Arenoso',60.0),
    ('Pivô 14','Franco-Arenoso',60.0),
    ('Pivô 15','Franco-Arenoso',60.0),
    ('Pivô 16','Franco-Arenoso',60.0),
    ('Pivô 17','Franco-Arenoso',60.0),
    ('Pivô 18','Franco-Arenoso',60.0),
    ('Pivô 19','Franco-Arenoso',60.0),
    ('Pivô 20','Franco-Arenoso',60.0),
    ('Pivô 21','Franco-Arenoso',60.0),
    ('Pivô 22','Franco-Arenoso',60.0),
    ('Pivô 23','Franco-Arenoso',60.0),
    ('Pivô 24','Franco-Arenoso',60.0)
)
UPDATE pivot_soils ps
SET soil_class = d.soil_class,
    infiltration_rate_mm_h = d.vib
FROM pivots p
JOIN farms f ON f.id = p.farm_id
JOIN provided_profiles d ON d.pivot_name = p.name
WHERE ps.pivot_id = p.id
  AND f.name = 'FAZENDA KARITEL';

-- Classe + VIB fornecidos na tela do Scheduling para PV 50–64.
WITH provided_profiles(pivot_name, soil_class, vib) AS (
  VALUES
    ('Pivô 50','Franco-Arenoso',60.0),
    ('Pivô 51','Franco-Arenoso',60.0),
    ('Pivô 52','Franco-Arenoso',60.0),
    ('Pivô 53','Franco-Arenoso',60.0),
    ('Pivô 54','Franco-Arenoso',60.0),
    ('Pivô 55','Franco-Arenoso',60.0),
    ('Pivô 56','Franco-Arenoso',60.0),
    ('Pivô 57','Franco-Arenoso',60.0),
    ('Pivô 58','Franco-Arenoso',60.0),
    ('Pivô 59','Franco-Arenoso',60.0),
    ('Pivô 60','Franco-Arenoso',60.0),
    ('Pivô 61','Franco-Arenoso',60.0),
    ('Pivô 62','Franco-Arenoso',60.0),
    ('Pivô 63','Franco-Arenoso',60.0),
    ('Pivô 64','Franco-Arenoso',60.0)
)
UPDATE pivot_soils ps
SET soil_class = d.soil_class,
    infiltration_rate_mm_h = d.vib
FROM pivots p
JOIN farms f ON f.id = p.farm_id
JOIN provided_profiles d ON d.pivot_name = p.name
WHERE ps.pivot_id = p.id
  AND f.name = 'FAZENDA KARITEL';

-- A unidade "% em peso" foi explicitamente mostrada nos cadastros abaixo.
WITH gravimetric_pivots(pivot_name) AS (
  VALUES
    ('Pivô 15'),('Pivô 16'),('Pivô 17'),('Pivô 18'),('Pivô 19'),
    ('Pivô 20'),('Pivô 21'),('Pivô 22'),('Pivô 24'),('Pivô 25'),
    ('Pivô 26'),('Pivô 27'),('Pivô 28'),('Pivô 29'),('Pivô 30'),
    ('Pivô 31'),('Pivô 32'),('Pivô 33'),('Pivô 34'),('Pivô 50')
)
UPDATE pivot_soils ps
SET cc_pmp_unit = 'gravimetric_pct'
FROM pivots p
JOIN farms f ON f.id = p.farm_id
JOIN gravimetric_pivots d ON d.pivot_name = p.name
WHERE ps.pivot_id = p.id
  AND f.name = 'FAZENDA KARITEL';

-- Camadas fornecidas nas capturas do Scheduling.
WITH provided_layers(
  pivot_name, layer_number, thickness_m, field_capacity_pct,
  wilting_point_pct, bulk_density_g_cm3
) AS (
  VALUES
    ('Pivô 15',1,0.20,11.9,5.0,1.81),('Pivô 15',2,0.20,12.2,5.1,1.81),('Pivô 15',3,0.20,12.2,5.1,1.81),
    ('Pivô 16',1,0.20,12.7,5.4,1.84),('Pivô 16',2,0.20,12.2,5.1,1.84),('Pivô 16',3,0.20,12.2,5.1,1.84),
    ('Pivô 17',1,0.20,12.3,5.1,1.81),('Pivô 17',2,0.20,13.2,5.6,1.81),('Pivô 17',3,0.20,13.2,5.6,1.81),
    ('Pivô 18',1,0.20,12.7,5.4,1.83),('Pivô 18',2,0.20,12.9,5.5,1.83),('Pivô 18',3,0.20,12.9,5.5,1.83),
    ('Pivô 19',1,0.20,13.6,5.8,1.87),('Pivô 19',2,0.20,13.3,5.6,1.87),('Pivô 19',3,0.20,13.3,5.6,1.87),
    ('Pivô 20',1,0.20,12.7,5.4,1.85),('Pivô 20',2,0.20,13.2,5.6,1.85),('Pivô 20',3,0.20,13.2,5.6,1.85),
    ('Pivô 21',1,0.20,11.5,4.8,1.80),('Pivô 21',2,0.20,12.1,5.1,1.80),('Pivô 21',3,0.20,12.1,5.1,1.80),
    ('Pivô 22',1,0.20,14.8,6.4,1.54),('Pivô 22',2,0.20,15.1,6.6,1.54),('Pivô 22',3,0.20,15.1,6.6,1.54),
    ('Pivô 24',1,0.20,11.4,4.7,1.77),('Pivô 24',2,0.20,11.2,4.6,1.77),('Pivô 24',3,0.20,11.2,4.6,1.77),
    ('Pivô 25',1,0.20,12.7,6.5,1.54),('Pivô 25',2,0.20,15.1,8.1,1.54),('Pivô 25',3,0.20,15.1,8.1,1.54),
    ('Pivô 26',1,0.20,11.4,4.7,1.77),('Pivô 26',2,0.20,11.3,4.6,1.77),('Pivô 26',3,0.20,11.3,4.6,1.77),
    ('Pivô 27',1,0.20,13.1,5.6,1.85),('Pivô 27',2,0.20,11.5,5.2,1.85),('Pivô 27',3,0.20,11.5,5.2,1.85),
    ('Pivô 28',1,0.20,11.3,4.7,1.77),('Pivô 28',2,0.20,10.2,4.1,1.77),('Pivô 28',3,0.20,10.2,4.1,1.77),
    ('Pivô 29',1,0.20,12.3,5.1,1.84),('Pivô 29',2,0.20,13.1,5.5,1.84),('Pivô 29',3,0.20,13.1,5.5,1.84),
    ('Pivô 30',1,0.20,9.0,4.0,1.68),('Pivô 30',2,0.20,8.7,3.8,1.68),('Pivô 30',3,0.20,8.7,3.8,1.68),
    ('Pivô 31',1,0.20,9.9,4.0,1.71),('Pivô 31',2,0.20,9.7,3.9,1.71),('Pivô 31',3,0.20,9.7,3.9,1.71),
    ('Pivô 32',1,0.20,8.4,3.7,1.70),('Pivô 32',2,0.20,9.6,4.4,1.70),('Pivô 32',3,0.20,9.6,4.4,1.70),
    ('Pivô 33',1,0.20,9.8,4.6,1.74),('Pivô 33',2,0.20,10.5,5.0,1.74),('Pivô 33',3,0.20,10.5,5.0,1.74),
    ('Pivô 34',1,0.20,9.4,4.3,1.76),('Pivô 34',2,0.20,10.9,5.3,1.76),('Pivô 34',3,0.20,10.9,5.3,1.76),
    ('Pivô 50',1,0.20,10.9,5.3,1.58),('Pivô 50',2,0.20,10.5,5.0,1.58),('Pivô 50',3,0.20,10.5,5.0,1.58)
)
INSERT INTO pivot_soil_layers (
  pivot_id, layer_number, thickness_m, field_capacity_pct,
  wilting_point_pct, bulk_density_g_cm3
)
SELECT
  p.id, d.layer_number, d.thickness_m, d.field_capacity_pct,
  d.wilting_point_pct, d.bulk_density_g_cm3
FROM provided_layers d
JOIN pivots p ON p.name = d.pivot_name
JOIN farms f ON f.id = p.farm_id
WHERE f.name = 'FAZENDA KARITEL'
ON CONFLICT (pivot_id, layer_number)
DO UPDATE SET
  thickness_m = EXCLUDED.thickness_m,
  field_capacity_pct = EXCLUDED.field_capacity_pct,
  wilting_point_pct = EXCLUDED.wilting_point_pct,
  bulk_density_g_cm3 = EXCLUDED.bulk_density_g_cm3;
