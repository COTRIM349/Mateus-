-- Importação controlada de soja fornecida em dados de cultura(1).xlsx.
-- Apenas identificação, GRM e janela de ocupação. Sem Kc/Tb/GDA/raiz/p.

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
   WHERE lower(name)='soja' OR lower(scientific_name)='glycine max'
   ORDER BY active DESC, created_at LIMIT 1;

  IF crop IS NOT NULL THEN
    INSERT INTO culture_varieties(
      culture_id,name,maturity,relative_maturity_group,planning_occupancy_days,
      data_source_id,data_confidence,observations
    ) VALUES
      (crop,'CZ 37B07 I2X',NULL,7.0,108,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'COMBATE IPRO',NULL,7.4,114,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'ATAQUE I2X',NULL,8.2,140,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'NEO 761 I2X',NULL,7.6,116,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'BMX Olimpo IPRO',NULL,7.7,122,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'NEO 690 I2X',NULL,6.9,108,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'CZ 48B18 IPRO',NULL,8.1,125,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'M8434 12X',NULL,8.4,130,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'CZ 58B10 I2X',NULL,8.1,125,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'COMPLETA IPRO',NULL,7.9,120,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'MURALHA IPRO',NULL,8.2,125,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'BMX DOMINIO IPRO',NULL,8.4,130,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'GUEPARDO',NULL,6.7,105,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'NEO 780 CE',NULL,7.8,120,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'ST 76KA72',NULL,7.6,116,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'SPARTA I2X',NULL,7.7,120,src,'nao_validada','Base de estudo fornecida pelo usuário.'),
      (crop,'NEO 811 I2X',NULL,8.1,125,src,'nao_validada','Base de estudo fornecida pelo usuário.')
    ON CONFLICT(culture_id,name) DO UPDATE SET
      relative_maturity_group=COALESCE(culture_varieties.relative_maturity_group,EXCLUDED.relative_maturity_group),
      planning_occupancy_days=COALESCE(culture_varieties.planning_occupancy_days,EXCLUDED.planning_occupancy_days),
      data_source_id=COALESCE(culture_varieties.data_source_id,EXCLUDED.data_source_id);

    INSERT INTO legacy_agronomic_data(
      culture_id,legacy_table,parameter_code,raw_value,classification,operational_active,notes
    )
    SELECT crop,'dados de cultura(1).xlsx','combined_cultivar_record',
      jsonb_build_object('raw_name','BMX Olimpo IPRO/CZ 48B18 IPRO','grm',8.1,'planning_occupancy_days',125),
      'requires_source',false,
      'Registro combinado preservado sem divisão automática.'
    WHERE NOT EXISTS(
      SELECT 1 FROM legacy_agronomic_data
       WHERE culture_id=crop AND legacy_table='dados de cultura(1).xlsx'
         AND parameter_code='combined_cultivar_record'
    );
  END IF;
END $$;
