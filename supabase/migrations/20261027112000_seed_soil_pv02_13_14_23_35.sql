-- ============================================================================
-- Dados de solo fornecidos pelo usuário — PV 02, 13, 14, 23 e 35
-- Fazenda Karitel
-- Fonte: capturas do Scheduling enviadas em 27/10/2026.
-- Unidade explícita: % em peso.
-- Não preencher classe/VIB aqui: preservar o que já existe no cadastro.
-- ============================================================================

WITH gravimetric_pivots(pivot_name) AS (
  VALUES ('Pivô 02'),('Pivô 13'),('Pivô 14'),('Pivô 23'),('Pivô 35')
)
UPDATE pivot_soils ps
SET cc_pmp_unit = 'gravimetric_pct'
FROM pivots p
JOIN farms f ON f.id = p.farm_id
JOIN gravimetric_pivots d ON d.pivot_name = p.name
WHERE ps.pivot_id = p.id
  AND f.name = 'FAZENDA KARITEL';

WITH provided_layers(
  pivot_name, layer_number, thickness_m, field_capacity_pct,
  wilting_point_pct, bulk_density_g_cm3
) AS (
  VALUES
    ('Pivô 02',1,0.20,13.3,6.9,1.85),
    ('Pivô 02',2,0.20,13.3,6.8,1.85),
    ('Pivô 02',3,0.20,13.3,6.8,1.85),

    ('Pivô 13',1,0.20,13.6,5.8,1.87),
    ('Pivô 13',2,0.20,11.8,4.9,1.87),
    ('Pivô 13',3,0.20,11.8,4.9,1.87),

    ('Pivô 14',1,0.20,10.1,4.0,1.72),
    ('Pivô 14',2,0.20,12.2,5.1,1.72),
    ('Pivô 14',3,0.20,12.2,5.1,1.72),

    ('Pivô 23',1,0.20,11.5,4.8,1.74),
    ('Pivô 23',2,0.20,12.1,5.1,1.74),
    ('Pivô 23',3,0.20,12.1,5.1,1.74),

    ('Pivô 35',1,0.20,12.3,5.1,1.81),
    ('Pivô 35',2,0.20,10.5,4.2,1.81),
    ('Pivô 35',3,0.20,10.5,4.2,1.81)
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
