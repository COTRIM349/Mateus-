-- =============================================================================
-- Solo padrao do Cerrado (franco-argiloso) aplicado a TODOS os pivos.
-- Objetivo: planejar irrigacoes por CLIMA sem o operador gerenciar solo.
-- A plataforma exige solo por pivo (gatilho + NOT NULL no vinculo); este solo
-- unico satisfaz essa exigencia de forma automatica e transparente.
-- Valores tipicos de franco-argiloso do Cerrado (ajustaveis depois):
--   CC 0,28 · PMP 0,15 · densidade 1,25 g/cm3 · infiltracao 15 mm/h · prof. 0,60 m
-- Idempotente: cria o solo por fazenda se faltar e so preenche pivos sem solo.
-- =============================================================================

-- 1) Cria o solo padrao por fazenda (Karitel e RDM)
INSERT INTO soils (farm_id, name, texture, field_capacity, wilting_point, bulk_density, infiltration_rate, effective_depth)
SELECT f.id, 'Padrao Cerrado (franco-argiloso)', 'franco-argiloso', 0.28, 0.15, 1.25, 15, 0.60
FROM farms f
WHERE (f.name ILIKE '%karitel%' OR f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%')
  AND NOT EXISTS (
    SELECT 1 FROM soils s WHERE s.farm_id = f.id AND s.name = 'Padrao Cerrado (franco-argiloso)'
  );

-- 2) Aplica o solo padrao a todos os pivos da fazenda que ainda nao tem solo
UPDATE pivots p
SET soil_id = s.id
FROM soils s
WHERE s.farm_id = p.farm_id
  AND s.name = 'Padrao Cerrado (franco-argiloso)'
  AND p.soil_id IS NULL;
