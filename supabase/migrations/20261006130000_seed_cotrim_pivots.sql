-- =============================================================================
-- Seed: cadastro de PIVOS + MODULOS + CASAS DE BOMBA (Karitel + RDM)
-- Fonte: arquivo "informacoes pivos e reservatorios" da fazenda.
-- Idempotente: casa a fazenda pelo NOME; cria modulo/casa de bomba se faltar;
-- insere cada pivo so se ainda nao existir (farm + nome).
-- efficiency=0,85 (aplicacao, ajustar com CUC/CUD real). radius calculado da area.
-- Pivos 75/76: vazao/potencia/coords ESTIMADOS (media da fazenda) - REVISAR.
-- VALIDAR EM STAGING antes de aplicar em producao.
-- =============================================================================

-- MODULOS --
INSERT INTO production_modules (farm_id, name, total_area)
SELECT f.id, 'Módulo 01', 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM production_modules m WHERE m.farm_id=f.id AND m.name='Módulo 01');
INSERT INTO production_modules (farm_id, name, total_area)
SELECT f.id, 'Módulo 02', 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM production_modules m WHERE m.farm_id=f.id AND m.name='Módulo 02');
INSERT INTO production_modules (farm_id, name, total_area)
SELECT f.id, 'Módulo 03', 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM production_modules m WHERE m.farm_id=f.id AND m.name='Módulo 03');
INSERT INTO production_modules (farm_id, name, total_area)
SELECT f.id, 'Módulo 01', 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM production_modules m WHERE m.farm_id=f.id AND m.name='Módulo 01');
INSERT INTO production_modules (farm_id, name, total_area)
SELECT f.id, 'Módulo 02', 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM production_modules m WHERE m.farm_id=f.id AND m.name='Módulo 02');

-- CASAS DE BOMBA --
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'C3Z3/R7', 4018.6, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='C3Z3/R7');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R0', 2242.5, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R0');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R1', 2762.6, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R1');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R10', 1196.2, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R10');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R11', 3419.8, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R11');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R12', 2202.0, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R12');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R13', 2398.1, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R13');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R14', 1843.0, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R14');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R15', 3299.9, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R15');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R16', 2129.0, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R16');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R17', 1886.8, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R17');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R18', 1459.7, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R18');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R2', 2715.0, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R2');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R3', 2715.5, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R3');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R4', 1428.7, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R4');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R5', 1601.8, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R5');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R6', 1931.3, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R6');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R7', 2604.2, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R7');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R8', 2593.4, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R8');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'R9', 1798.8, 2, 0 FROM farms f
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='R9');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM1', 485.8, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM1');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM2', 971.5, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM2');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM3', 971.5, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM3');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM4', 2496.2, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM4');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM5', 4244.1, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM5');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM6', 4700.4, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM6');
INSERT INTO pump_houses (farm_id, name, max_flow_rate, max_simultaneous, power_kw)
SELECT f.id, 'RM7', 5681.9, 2, 0 FROM farms f
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_houses ph WHERE ph.farm_id=f.id AND ph.name='RM7');

-- PIVOS --
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 01', 'P01', 150.01, 691.0, 714.33, 149.14, 0.85, -14.79212962, -45.61143553, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 01');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 02', 'P02', 123.72, 627.5, 523.8, 149.14, 0.85, -14.80045751, -45.60237602, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 02');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 03', 'P03', 150.01, 691.0, 714.33, 149.14, 0.85, -14.78919873, -45.59743225, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 03');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 04', 'P04', 62.76, 447.0, 290.0, 29.83, 0.85, -14.79851588, -45.59206112, 'Valley', 29.83
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 04');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 05', 'P05', 150.01, 691.0, 692.9, 186.42, 0.85, -14.78565482, -45.58115236, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 05');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 06', 'P06', 150.01, 691.0, 641.0, 186.42, 0.85, -14.78298992, -45.56839508, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 06');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 07', 'P07', 120.13, 618.4, 572.05, 186.42, 0.85, -14.79639358, -45.57552005, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 07');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 08', 'P08', 150.01, 691.0, 714.33, 186.42, 0.85, -14.79465771, -45.56323351, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 08');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 09', 'P09', 120.13, 618.4, 572.5, 149.14, 0.85, -14.80781753, -45.57572757, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 09');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 10', 'P10', 150.01, 691.0, 714.33, 186.42, 0.85, -14.80735985, -45.56333247, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 10');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 11', 'P11', 121.12, 620.9, 547.92, 149.14, 0.85, -14.81957316, -45.57243687, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 11');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 12', 'P12', 150.01, 691.0, 714.33, 186.42, 0.85, -14.81965019, -45.56002878, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 12');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 13', 'P13', 71.3, 476.4, 339.52, 111.9, 0.85, -14.82958937, -45.57112464, 'Valley', 111.9
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 13');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 14', 'P14', 150.01, 691.0, 614.33, 55.93, 0.85, -14.83234568, -45.56043023, 'Valley', 55.93
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 14');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 15', 'P15', 150.01, 691.0, 714.33, 149.14, 0.85, -14.77936481, -45.55263281, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 15');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 16', 'P16', 150.01, 691.0, 714.33, 186.42, 0.85, -14.77666375, -45.53995903, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 16');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 17', 'P17', 150.01, 691.0, 714.33, 149.14, 0.85, -14.79184831, -45.55020324, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 17');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 18', 'P18', 150.01, 691.0, 714.33, 149.14, 0.85, -14.78900196, -45.53764478, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 18');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 19', 'P19', 150.01, 691.0, 714.33, 149.14, 0.85, -14.80451651, -45.54925049, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 19');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 20', 'P20', 150.01, 691.0, 714.33, 74.57, 0.85, -14.80182629, -45.53648748, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 20');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 21', 'P21', 150.01, 691.0, 714.33, 149.14, 0.85, -14.81556742, -45.54279463, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 21');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 22', 'P22', 150.01, 691.0, 714.33, 149.14, 0.85, -14.81382869, -45.52987058, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 22');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 23', 'P23', 150.01, 691.0, 602.63, 149.14, 0.85, -14.82724292, -45.54814067, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 23');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 24', 'P24', 150.01, 691.0, 714.33, 186.42, 0.85, -14.82583383, -45.53510235, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 24');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 25', 'P25', 99.7, 563.3, 474.76, 74.57, 0.85, -14.84057799, -45.54206213, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 25');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 26', 'P26', 150.01, 691.0, 650.04, 186.42, 0.85, -14.843101, -45.55360735, 'Valley', 186.42
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 26');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 27', 'P27', 99.14, 561.8, 472.1, 74.57, 0.85, -14.85114425, -45.54520856, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 27');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 28', 'P28', 132.99, 650.6, 633.29, 149.14, 0.85, -14.84838326, -45.52857468, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 28');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 29', 'P29', 78.55, 500.0, 374.05, 74.57, 0.85, -14.85598298, -45.53657107, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 29');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 30', 'P30', 150.01, 691.0, 664.33, 90.78, 0.85, -14.84350933, -45.51553747, 'Valley', 90.78
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 30');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 31', 'P31', 150.01, 691.0, 645.04, 93.21, 0.85, -14.85603018, -45.51761404, 'Valley', 93.21
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 31');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 32', 'P32', 138.03, 662.8, 657.29, 93.21, 0.85, -14.866817044121, -45.532033271147, 'Valley', 93.21
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 32');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 33', 'P33', 137.67, 662.0, 590.01, 109.62, 0.85, -14.8633665, -45.50742515, 'Valley', 109.62
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 33');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 34', 'P34', 150.01, 691.0, 714.33, 111.85, 0.85, -14.876818545414, -45.523261959994, 'Valley', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 34');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 75', 'P75', 82.0, 510.9, 390.5, 148.39, 0.85, -14.781139, -45.524859, 'Valley', 148.39
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 75');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 76', 'P76', 75.0, 488.6, 357.1, 148.39, 0.85, -14.781139, -45.524859, 'Valley', 148.39
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 76');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 35', 'P35', 150.54, 692.2, 641.68, 175.24, 0.85, -14.769885666, -45.5728756446, 'Lindsay', 175.24
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 35');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 36', 'P36', 150.54, 692.2, 716.86, 164.05, 0.85, -14.7664575988, -45.5595387601, 'Lindsay', 164.05
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 36');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 37', 'P37', 72.0, 478.7, 517.97, 111.85, 0.85, -14.7583135412, -45.5719524478, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 37');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 38', 'P38', 141.0, 669.9, 716.86, 164.8, 0.85, -14.7535503952, -45.5603032938, 'Lindsay', 164.8
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 38');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 39', 'P39', 100.65, 566.0, 479.29, 111.85, 0.85, -14.7647298899, -45.54206912, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 39');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 40', 'P40', 150.54, 692.2, 716.86, 160.33, 0.85, -14.7541353801, -45.547135982, 'Lindsay', 160.33
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 40');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 41', 'P41', 138.55, 664.1, 659.74, 148.39, 0.85, -14.7430609953, -45.5528451439, 'Lindsay', 148.39
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 41');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 42', 'P42', 100.65, 566.0, 479.29, 111.85, 0.85, -14.7355400687, -45.5666655345, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 42');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 43', 'P43', 138.55, 664.1, 659.74, 148.39, 0.85, -14.731093704, -45.5551018284, 'Lindsay', 148.39
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 43');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 45', 'P45', 123.47, 626.9, 587.93, 163.31, 0.85, -14.7562252671, -45.5299048442, 'Lindsay', 163.31
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 45');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 46', 'P46', 159.45, 712.4, 759.3, 180.46, 0.85, -14.7440849245, -45.5335584404, 'Lindsay', 180.46
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 46');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 47', 'P47', 159.45, 712.4, 721.34, 223.71, 0.85, -14.7318497964, -45.5380625663, 'Lindsay', 223.71
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 47');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 48', 'P48', 159.45, 712.4, 759.3, 157.34, 0.85, -14.7184368462, -45.5427903476, 'Lindsay', 157.34
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 48');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 49', 'P49', 124.31, 629.0, 591.97, 146.9, 0.85, -14.7218974858, -45.5306199793, 'Lindsay', 146.9
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 49');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 52', 'P52', 159.45, 712.4, 759.3, 187.92, 0.85, -14.743345361, -45.5197469108, 'Lindsay', 187.92
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 52');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 73', 'P73', 159.45, 712.4, 683.37, 223.71, 0.85, -14.7733811927, -45.5120290942, 'Lindsay', 223.71
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 73');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 74', 'P74', 159.45, 712.4, 759.3, 223.71, 0.85, -14.760445, -45.514392, 'Lindsay', 223.71
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 74');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 44', 'P44', 74.68, 487.6, 550.14, 55.93, 0.85, -14.7523, -45.5063, 'Lindsay', 55.93
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 44');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 50', 'P50', 120.31, 618.8, 572.9, 111.85, 0.85, -14.7696, -45.4919, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 50');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 51', 'P51', 119.34, 616.3, 550.14, 111.85, 0.85, -14.7711, -45.4804, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 51');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 53', 'P53', 74.68, 487.6, 550.14, 55.93, 0.85, -14.7487, -45.4977, 'Lindsay', 55.93
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 53');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 54', 'P54', 121.22, 621.2, 577.24, 111.85, 0.85, -14.7586, -45.4944, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 54');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 55', 'P55', 151.33, 694.0, 720.62, 223.71, 0.85, -14.7469, -45.4869, 'Lindsay', 223.71
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 55');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 56', 'P56', 151.2, 693.7, 720.0, 111.85, 0.85, -14.7589, -45.4817, 'Lindsay', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 56');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 57', 'P57', 150.24, 691.5, 715.43, 149.14, 0.85, -14.7426052, -45.4746871, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 57');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 58', 'P58', 150.24, 691.5, 715.43, 111.85, 0.85, -14.7547837, -45.469599, 'Valley', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 58');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 59', 'P59', 144.4, 678.0, 687.62, 130.5, 0.85, -14.7382462, -45.4625578, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 59');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 60', 'P60', 150.24, 691.5, 701.12, 130.5, 0.85, -14.7501302, -45.4574015, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 60');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 61', 'P61', 145.71, 681.0, 693.86, 130.5, 0.85, -14.7339704, -45.4500229, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 61');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 62', 'P62', 140.89, 669.7, 670.9, 130.5, 0.85, -14.7455635, -45.4456233, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 62');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 63', 'P63', 80.15, 505.1, 383.71, 74.57, 0.85, -14.7776564303508, -45.4720966679258, 'Bauer', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 63');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 64', 'P64', 80.15, 505.1, 383.71, 55.93, 0.85, -14.7776892948062, -45.4624718838355, 'Bauer', 55.93
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 64');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 65', 'P65', 150.24, 691.5, 692.3, 149.14, 0.85, -14.7674541780747, -45.4677617368227, 'Bauer', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 65');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 66', 'P66', 100.86, 566.6, 480.29, 130.5, 0.85, -14.758987, -45.4497469, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 66');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 67', 'P67', 80.25, 505.4, 382.14, 130.5, 0.85, -14.755102, -45.4405245, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 67');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 68', 'P68', 80.25, 505.4, 382.14, 130.5, 0.85, -14.7639804, -45.4374511, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 68');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 69', 'P69', 80.25, 505.4, 382.14, 130.5, 0.85, -14.7270413, -45.4649619, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 69');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 70', 'P70', 150.24, 691.5, 715.43, 130.5, 0.85, -14.7216264, -45.4545221, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 70');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 71', 'P71', 40.23, 357.8, 191.57, 29.83, 0.85, -14.7191232, -45.464138, 'Valley', 29.83
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 71');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 72', 'P72', 125.51, 632.1, 597.67, 130.5, 0.85, -14.7100502, -45.4584609, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 72');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 101', 'P101', 116.2, 608.2, 552.48, 111.85, 0.85, -14.65041, -45.241249, 'Valley', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 101');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 102', 'P102', 102.19, 570.3, 486.62, 93.21, 0.85, -14.636059, -45.245848, 'Valley', 93.21
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 102');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 103', 'P103', 102.01, 569.8, 485.76, 74.57, 0.85, -14.65171763, -45.25268555, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 103');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 104', 'P104', 102.01, 569.8, 485.76, 74.57, 0.85, -14.64100526, -45.25633335, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 104');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 105', 'P105', 102.01, 569.8, 485.76, 74.57, 0.85, -14.656, -45.2644, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 105');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 106', 'P106', 102.01, 569.8, 485.76, 74.57, 0.85, -14.64524, -45.26644, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 106');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 107', 'P107', 102.01, 569.8, 485.76, 93.21, 0.85, -14.6601, -45.2742, 'Valley', 93.21
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 107');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 108', 'P108', 102.01, 569.8, 485.76, 74.57, 0.85, -14.649136, -45.276528, 'Valley', 74.57
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 108');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 109', 'P109', 102.01, 569.8, 485.76, 93.21, 0.85, -14.630407, -45.259343, 'Valley', 93.21
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 109');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 110', 'P110', 102.19, 570.3, 485.62, 93.21, 0.85, -14.634951, -45.268913, 'Valley', 93.21
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 01'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 110');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 112', 'P112', 150.34, 691.8, 715.9, 130.5, 0.85, -14.650916077245, -45.210244193749, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 112');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 113', 'P113', 150.14, 691.3, 714.95, 130.5, 0.85, -14.6208, -45.222, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 113');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 114', 'P114', 120.13, 618.4, 572.05, 111.85, 0.85, -14.6425, -45.2046, 'Valley', 111.85
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 114');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 115', 'P115', 150.34, 691.8, 715.9, 130.5, 0.85, -14.6297, -45.2101, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 115');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 116', 'P116', 150.34, 691.8, 701.59, 130.5, 0.85, -14.6408, -45.1921, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 116');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 117', 'P117', 150.34, 691.8, 715.9, 130.5, 0.85, -14.629, -45.197, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 117');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 118', 'P118', 150.14, 691.3, 694.93, 130.5, 0.85, -14.6395, -45.1793, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 118');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 119', 'P119', 150.34, 691.8, 715.9, 149.14, 0.85, -14.6274, -45.1842, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 119');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 120', 'P120', 150.34, 691.8, 715.9, 149.14, 0.85, -14.6383, -45.1664, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 120');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 121', 'P121', 150.34, 691.8, 715.9, 130.5, 0.85, -14.6263, -45.1712, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 121');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 122', 'P122', 150.14, 691.3, 714.95, 149.14, 0.85, -14.637957363841, -45.153328338623, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 122');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 123', 'P123', 150.34, 691.8, 715.9, 130.5, 0.85, -14.6247, -45.1577, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 123');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 124', 'P124', 150.14, 691.3, 700.65, 130.5, 0.85, -14.6127, -45.1627, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 124');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 125', 'P125', 100.79, 566.4, 479.95, 130.5, 0.85, -14.6021, -45.1745, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 125');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 126', 'P126', 140.57, 668.9, 669.39, 130.5, 0.85, -14.6142, -45.174, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 126');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 127', 'P127', 102.43, 571.0, 487.76, 149.14, 0.85, -14.8041, -45.1846, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 127');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 128', 'P128', 140.57, 668.9, 669.39, 130.5, 0.85, -14.6151, -45.1876, 'Valley', 130.5
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 128');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 129', 'P129', 102.43, 571.0, 487.76, 149.14, 0.85, -14.6051, -45.1951, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 129');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 130', 'P130', 150.14, 691.3, 714.95, 149.14, 0.85, -14.6162, -45.2003, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 130');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 131', 'P131', 100.1, 564.5, 762.67, 149.14, 0.85, -14.6182668, -45.2119053, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 131');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 132', 'P132', 100.1, 564.5, 762.67, 149.14, 0.85, -14.6192632, -45.2225091, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 132');
INSERT INTO pivots (farm_id, module_id, name, code, area, radius, flow_rate, pump_power, efficiency, latitude, longitude, manufacturer, installed_power_kw)
SELECT f.id, m.id, 'Pivô 133', 'P133', 101.12, 567.3, 481.52, 149.14, 0.85, -14.5048, -45.1675, 'Valley', 149.14
FROM farms f JOIN production_modules m ON m.farm_id=f.id AND m.name='Módulo 02'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pivots p2 WHERE p2.farm_id=f.id AND p2.name='Pivô 133');

-- VINCULO CASA DE BOMBA <-> PIVO --
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R0'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 01'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R0'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 02'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R0'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 03'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R0'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 04'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R1'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 05'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R1'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 06'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R2'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 07'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R2'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 08'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R3'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 09'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R3'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 10'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 11'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 12'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 13'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 14'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R1'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 15'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R1'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 16'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R2'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 17'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R2'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 18'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R3'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 19'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R3'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 20'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 21'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 22'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 23'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 24'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 25'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 26'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 27'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 28'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 29'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 30'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 31'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 32'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 33'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 34'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 75'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='C3Z3/R7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 76'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R8'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 35'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R8'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 36'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R8'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 37'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R8'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 38'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R10'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 39'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R10'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 40'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R9'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 41'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R9'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 42'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R9'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 43'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R11'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 45'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R11'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 46'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R11'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 47'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R11'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 48'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R11'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 49'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R12'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 52'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R12'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 73'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R12'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 74'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R13'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 44'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R14'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 50'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R14'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 51'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R13'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 53'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R13'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 54'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R13'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 55'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R14'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 56'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R15'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 57'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R15'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 58'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R15'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 59'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R15'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 60'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R16'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 61'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R16'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 62'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R18'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 63'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R18'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 64'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R18'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 65'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R15'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 66'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R16'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 67'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R16'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 68'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R17'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 69'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R17'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 70'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R17'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 71'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='R17'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 72'
WHERE f.name ILIKE '%karitel%' AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 101'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 102'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 103'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 104'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM3'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 105'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM2'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 106'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM3'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 107'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM2'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 108'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM1'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 109'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM4'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 110'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 112'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 113'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 114'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 115'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 116'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 117'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 118'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 119'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 120'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 121'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 122'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 123'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 124'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 125'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 126'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 127'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 128'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 129'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM6'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 130'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 131'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM5'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 132'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
INSERT INTO pump_house_pivots (pump_house_id, pivot_id, hydraulic_line, priority_order)
SELECT ph.id, pv.id, '', 0
FROM farms f JOIN pump_houses ph ON ph.farm_id=f.id AND ph.name='RM7'
JOIN pivots pv ON pv.farm_id=f.id AND pv.name='Pivô 133'
WHERE (f.name ILIKE '%rdm%' OR f.name ILIKE '%rio do meio%') AND NOT EXISTS (SELECT 1 FROM pump_house_pivots x WHERE x.pump_house_id=ph.id AND x.pivot_id=pv.id);
