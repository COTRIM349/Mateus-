-- ============================================================================
-- 00051 — Dados de solo informados para Pivôs 01, 03–12 (Fazenda Karitel)
-- ----------------------------------------------------------------------------
-- Fonte: capturas do Scheduling enviadas pelo usuário.
-- Não há extrapolação para pivôs sem imagem/dado (ex.: Pivô 02).
-- Unidade explícita nas telas: % em peso.
-- ============================================================================

WITH targets(pivot_name) AS (
  VALUES
    ('Pivô 01'),
    ('Pivô 03'),
    ('Pivô 04'),
    ('Pivô 05'),
    ('Pivô 06'),
    ('Pivô 07'),
    ('Pivô 08'),
    ('Pivô 09'),
    ('Pivô 10'),
    ('Pivô 11'),
    ('Pivô 12')
)
UPDATE pivot_soils ps
SET cc_pmp_unit = 'gravimetric_pct'
FROM pivots p
JOIN farms f ON f.id = p.farm_id
JOIN targets t ON t.pivot_name = p.name
WHERE ps.pivot_id = p.id
  AND f.name = 'FAZENDA KARITEL';

WITH provided_layers(
  pivot_name, layer_number, thickness_m, field_capacity_pct,
  wilting_point_pct, bulk_density_g_cm3
) AS (
  VALUES
    ('Pivô 01',1,0.20,12.4,6.3,1.82),
    ('Pivô 01',2,0.20,12.2,6.1,1.82),
    ('Pivô 01',3,0.20,12.2,6.1,1.82),

    ('Pivô 03',1,0.20,11.7,4.8,1.82),
    ('Pivô 03',2,0.20,12.4,6.2,1.82),
    ('Pivô 03',3,0.20,12.4,6.2,1.82),

    ('Pivô 04',1,0.20,13.3,6.9,1.93),
    ('Pivô 04',2,0.20,15.1,6.6,1.93),
    ('Pivô 04',3,0.20,15.1,6.6,1.93),

    ('Pivô 05',1,0.20,12.2,5.1,1.81),
    ('Pivô 05',2,0.20,11.9,5.0,1.81),
    ('Pivô 05',3,0.20,11.9,5.0,1.81),

    ('Pivô 06',1,0.20,13.3,5.7,1.85),
    ('Pivô 06',2,0.20,13.2,5.6,1.85),
    ('Pivô 06',3,0.20,13.2,5.6,1.85),

    ('Pivô 07',1,0.20,13.3,5.6,1.85),
    ('Pivô 07',2,0.20,12.9,5.5,1.85),
    ('Pivô 07',3,0.20,12.9,5.5,1.85),

    ('Pivô 08',1,0.20,13.6,5.8,1.87),
    ('Pivô 08',2,0.20,13.2,5.6,1.87),
    ('Pivô 08',3,0.20,13.2,5.6,1.87),

    ('Pivô 09',1,0.20,12.8,5.4,1.83),
    ('Pivô 09',2,0.20,13.2,5.6,1.83),
    ('Pivô 09',3,0.20,13.2,5.6,1.83),

    ('Pivô 10',1,0.20,12.8,5.4,1.79),
    ('Pivô 10',2,0.20,11.8,4.9,1.79),
    ('Pivô 10',3,0.20,11.8,4.9,1.79),

    ('Pivô 11',1,0.20,13.5,5.7,1.83),
    ('Pivô 11',2,0.20,12.8,5.4,1.83),
    ('Pivô 11',3,0.20,12.8,5.4,1.83),

    ('Pivô 12',1,0.20,10.9,4.5,1.76),
    ('Pivô 12',2,0.20,13.3,5.7,1.76),
    ('Pivô 12',3,0.20,13.3,5.7,1.76)
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
