-- Seed: reservatorios (Karitel+RDM). Idempotente por (fazenda,nome).
-- current_volume inicia = capacidade. Fonte: arquivo da fazenda.

INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R0', 'reservatorio', 19153.0, 19153.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R0');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R1', 'reservatorio', 19153.0, 19153.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R1');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R2', 'reservatorio', 35575.25, 35575.25, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R2');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R3', 'reservatorio', 54073.0, 54073.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R3');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R4', 'reservatorio', 19060.98, 19060.98, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R4');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R5', 'reservatorio', 20006.0, 20006.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R5');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R6', 'reservatorio', 17398.0, 17398.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R6');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R7', 'reservatorio', 74924.0, 74924.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R7');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'C3Z3', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='C3Z3');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R8', 'reservatorio', 43203.0, 43203.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R8');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R9', 'reservatorio', 27135.0, 27135.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R9');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R10', 'reservatorio', 18060.0, 18060.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R10');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R11', 'reservatorio', 62246.0, 62246.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R11');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R12', 'reservatorio', 79396.0, 79396.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R12');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R13', 'reservatorio', 82650.0, 82650.0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R13');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R14', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R14');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R15', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R15');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R16', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R16');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'R17', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='R17');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM1', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM1');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM2', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM2');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM3', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM3');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM4', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM4');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM5', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM5');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM6', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM6');
INSERT INTO reservoirs (farm_id, name, type, max_capacity, current_volume, min_operational_level, recharge_rate)
SELECT f.id, 'RM7', 'reservatorio', 0, 0, 0, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM reservoirs x WHERE x.farm_id=f.id AND x.name='RM7');
