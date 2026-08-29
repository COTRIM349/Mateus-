-- Importação controlada de algodão fornecida em dados de cultura(1).xlsx.
-- Apenas identificação, classe de ciclo informada e janela de ocupação.
-- Janela de ocupação não é convertida em ciclo fenológico.

DO $$
DECLARE
  src UUID;
  crop UUID;
BEGIN
  SELECT id INTO src FROM agronomic_sources
   WHERE title = 'dados de cultura(1).xlsx — base de estudo fornecida pelo usuário'
   ORDER BY created_at LIMIT 1;

  IF src IS NULL THEN
    INSERT INTO agronomic_sources(source_type,institution,title,methodology,notes)
    VALUES(
      'estimativa_provisoria',
      'Dados fornecidos pelo usuário',
      'dados de cultura(1).xlsx — base de estudo fornecida pelo usuário',
      'Importação direta somente dos campos existentes.',
      'Material de estudo; requer validação antes de uso agronômico.'
    ) RETURNING id INTO src;
  END IF;

  SELECT id INTO crop FROM cultures
   WHERE lower(name) IN ('algodão','algodao') OR lower(scientific_name) LIKE 'gossypium%'
   ORDER BY active DESC, created_at LIMIT 1;

  IF crop IS NOT NULL THEN
    INSERT INTO culture_varieties(
      culture_id,name,maturity,planning_occupancy_days,
      data_source_id,data_confidence,observations
    ) VALUES
      (crop,'DP 1949 B3RF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 911 GLTP','precoce',180,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 912 GLTP','precoce',180,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 974 GLT','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 985 GLTP','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 990 STP','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'TMG 33 B3RF','precoce',180,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'DP 2111 B3RF','precoce',180,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'TMG 38 B3RF','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 5901 B2RF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 5801 B2RF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'DP 2176 B3RF','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'DP 2104 B3XF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'TMG 83 B3XF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 933 STP','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 979 STP','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'FM 945 STP','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'TAURA B3XF','precoce',180,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 3479 B2RF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 563 B3XF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'ST APEX 2156 B3RF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'BS 2441 STP','precoce',180,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'BS 2453 GLTP','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 707 B3XF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 497 B3XF','medio',195,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'IMA 3764 B2RF','tardio',210,src,'nao_validada','Base de estudo fornecida pelo usuário.')
    ON CONFLICT(culture_id,name) DO UPDATE SET
      maturity=COALESCE(culture_varieties.maturity,EXCLUDED.maturity),
      planning_occupancy_days=COALESCE(culture_varieties.planning_occupancy_days,EXCLUDED.planning_occupancy_days),
      data_source_id=COALESCE(culture_varieties.data_source_id,EXCLUDED.data_source_id);
  END IF;
END $$;
