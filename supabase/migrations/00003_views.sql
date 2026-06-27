-- ============================================================================
-- Cotrim Irrigação Pro — Views de consulta
-- ============================================================================

-- View: pivôs com cultura e módulo da safra ativa
CREATE OR REPLACE VIEW v_pivot_overview AS
SELECT
  p.id AS pivot_id,
  p.name AS pivot_name,
  p.area,
  p.flow_rate,
  p.pump_power,
  p.efficiency,
  p.status,
  p.latitude,
  p.longitude,
  p.farm_id,
  pm.name AS module_name,
  c.name AS culture_name,
  pca.crop_stage,
  pca.planting_date,
  s.name AS soil_name,
  s.field_capacity,
  s.wilting_point,
  c.root_depth,
  c.depletion_factor,
  c.kc_by_stage,
  se.name AS season_name,
  pca.id AS assignment_id
FROM pivots p
LEFT JOIN pivot_crop_assignments pca ON pca.pivot_id = p.id AND pca.active = true
LEFT JOIN cultures c ON c.id = pca.culture_id
LEFT JOIN soils s ON s.id = pca.soil_id
LEFT JOIN seasons se ON se.id = pca.season_id
LEFT JOIN production_modules pm ON pm.id = p.module_id
WHERE p.active = true;

-- View: último balanço hídrico por pivô
CREATE OR REPLACE VIEW v_latest_water_balance AS
SELECT DISTINCT ON (wb.pivot_crop_assignment_id)
  wb.*,
  pca.pivot_id,
  pca.season_id,
  pca.culture_id,
  pca.crop_stage
FROM water_balances wb
JOIN pivot_crop_assignments pca ON pca.id = wb.pivot_crop_assignment_id
ORDER BY wb.pivot_crop_assignment_id, wb.date DESC;

-- View: resumo de alertas não resolvidos por fazenda
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT
  a.farm_id,
  a.severity,
  COUNT(*) AS count
FROM alerts a
WHERE a.resolved_at IS NULL
GROUP BY a.farm_id, a.severity;

-- View: status dos sensores por fazenda
CREATE OR REPLACE VIEW v_sensor_status AS
SELECT
  s.farm_id,
  s.type,
  s.status,
  COUNT(*) AS count
FROM sensors s
WHERE s.active = true
GROUP BY s.farm_id, s.type, s.status;
