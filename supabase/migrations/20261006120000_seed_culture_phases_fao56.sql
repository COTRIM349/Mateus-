-- =============================================================================
-- Seed: curvas de Kc por FASE (FAO-56) -> base do Kc por DAE
-- Soja, Milho e Algodao. Fonte: FAO-56 (literatura), estagios pelo ciclo.
-- Idempotente: localiza a cultura pelo NOME e refaz as fases.
-- O motor (interpolateKc em modules/culture) usa culture_phases para dar o Kc/DAE.
-- =============================================================================

DO $$
DECLARE
  v_soja   UUID := (SELECT id FROM cultures WHERE name = 'Soja'    LIMIT 1);
  v_milho  UUID := (SELECT id FROM cultures WHERE name = 'Milho'   LIMIT 1);
  v_algo   UUID := (SELECT id FROM cultures WHERE name = 'Algodão' LIMIT 1);
BEGIN
  -- -------------------------------------------------------------------------
  -- SOJA  (ciclo ~120 d) — FAO-56: Kc_ini 0,40 / Kc_mid 1,15 / Kc_end 0,50
  -- -------------------------------------------------------------------------
  IF v_soja IS NOT NULL THEN
    DELETE FROM culture_phases WHERE culture_id = v_soja;
    INSERT INTO culture_phases
      (culture_id, phase_order, name, days_after_plant, duration_days,
       kc_start, kc_end, root_depth_start, root_depth_end, depletion_factor, description) VALUES
      (v_soja, 1, 'Inicial',                 0, 20, 0.40, 0.40, 0.10, 0.20, 0.50, 'Germinacao/emergencia (FAO-56)'),
      (v_soja, 2, 'Desenvolvimento',        20, 30, 0.40, 1.15, 0.20, 0.60, 0.55, 'Vegetativo ate cobertura total'),
      (v_soja, 3, 'Medio (floracao/enchimento)', 50, 40, 1.15, 1.15, 0.60, 0.60, 0.50, 'R1-R6 (floracao e enchimento de graos)'),
      (v_soja, 4, 'Final (maturacao)',       90, 30, 1.15, 0.50, 0.60, 0.60, 0.55, 'R7-R8 (maturacao/senescencia)');
  END IF;

  -- -------------------------------------------------------------------------
  -- MILHO (ciclo ~140 d) — FAO-56: Kc_ini 0,30 / Kc_mid 1,20 / Kc_end 0,60
  -- -------------------------------------------------------------------------
  IF v_milho IS NOT NULL THEN
    DELETE FROM culture_phases WHERE culture_id = v_milho;
    INSERT INTO culture_phases
      (culture_id, phase_order, name, days_after_plant, duration_days,
       kc_start, kc_end, root_depth_start, root_depth_end, depletion_factor, description) VALUES
      (v_milho, 1, 'Inicial',                 0, 25, 0.30, 0.30, 0.10, 0.30, 0.50, 'V1 emergencia (FAO-56)'),
      (v_milho, 2, 'Desenvolvimento',        25, 35, 0.30, 1.20, 0.30, 0.80, 0.55, 'Vegetativo'),
      (v_milho, 3, 'Medio (pendoamento/granacao)', 60, 40, 1.20, 1.20, 0.80, 0.80, 0.55, 'R1-R4'),
      (v_milho, 4, 'Final (maturacao)',      100, 40, 1.20, 0.60, 0.80, 0.80, 0.60, 'R5-R6');
  END IF;

  -- -------------------------------------------------------------------------
  -- ALGODAO (ciclo ~180 d) — FAO-56: Kc_ini 0,35 / Kc_mid 1,20 / Kc_end 0,60
  -- -------------------------------------------------------------------------
  IF v_algo IS NOT NULL THEN
    DELETE FROM culture_phases WHERE culture_id = v_algo;
    INSERT INTO culture_phases
      (culture_id, phase_order, name, days_after_plant, duration_days,
       kc_start, kc_end, root_depth_start, root_depth_end, depletion_factor, description) VALUES
      (v_algo, 1, 'Inicial',                 0, 30, 0.35, 0.35, 0.10, 0.30, 0.65, 'Emergencia (FAO-56)'),
      (v_algo, 2, 'Desenvolvimento',        30, 50, 0.35, 1.20, 0.30, 1.00, 0.65, 'Vegetativo ate 1o floral'),
      (v_algo, 3, 'Medio (floracao/macas)', 80, 55, 1.20, 1.20, 1.00, 1.00, 0.65, 'Floracao e formacao de macas'),
      (v_algo, 4, 'Final (abertura)',      135, 45, 1.20, 0.60, 1.00, 1.00, 0.70, 'Abertura de capulhos/senescencia');
  END IF;
END $$;
