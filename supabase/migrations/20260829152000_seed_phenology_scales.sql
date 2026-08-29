-- ============================================================================
-- Completar marcadores fenológicos sobre a fundação 00056
-- Nenhum DAE, GDA, Kc, raiz, p ou sensibilidade é inferido aqui.
-- ============================================================================

DO $$
DECLARE
  soy_source UUID;
  soy_r5_source UUID;
  cotton_source UUID;
  soy_crop UUID;
  cotton_crop UUID;
BEGIN
  SELECT id INTO soy_source
  FROM agronomic_sources
  WHERE source_key='fehr-caviness-soy';

  SELECT id INTO cotton_source
  FROM agronomic_sources
  WHERE source_key='marur-ruano-cotton';

  SELECT id INTO soy_r5_source
  FROM agronomic_sources
  WHERE source_key='embrapa-soja-r5-subdivision';

  IF soy_r5_source IS NULL THEN
    INSERT INTO agronomic_sources(
      source_key,source_type,title,institution,authors,publication_year,citation,methodology,notes
    ) VALUES (
      'embrapa-soja-r5-subdivision',
      'embrapa',
      'Subdivisão operacional do estádio R5 da soja',
      'Embrapa Soja',
      'Yorinori, J. T. (referência indicada pela Embrapa)',
      1996,
      'Referência operacional da Embrapa para subdivisão de R5 em R5.1–R5.5; manter separada da escala original de Fehr & Caviness.',
      'Subdivisão observacional do enchimento de grãos.',
      'Não atribuir R5.1–R5.5 à publicação original de Fehr & Caviness.'
    ) RETURNING id INTO soy_r5_source;
  END IF;

  SELECT id INTO soy_crop
  FROM cultures
  WHERE lower(name)='soja' OR lower(COALESCE(scientific_name,'')) LIKE '%glycine max%'
  ORDER BY active DESC, created_at
  LIMIT 1;

  IF soy_crop IS NOT NULL THEN
    INSERT INTO culture_phenology_markers(
      culture_id,stage_code,name,marker_order,management_phase_key,
      critical_water_stage,physiological_process,yield_component_risk,source_id,active
    )
    VALUES
      (soy_crop,'V1','Primeiro nó',11,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura e interceptação de radiação',soy_source,true),
      (soy_crop,'V2','Segundo nó',12,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura e interceptação de radiação',soy_source,true),
      (soy_crop,'V3','Terceiro nó',13,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura e interceptação de radiação',soy_source,true),
      (soy_crop,'V4','Quarto nó',14,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura e interceptação de radiação',soy_source,true),
      (soy_crop,'V5','Quinto nó',15,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura e interceptação de radiação',soy_source,true),
      (soy_crop,'VN','Enésimo nó',16,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura e interceptação de radiação',soy_source,true),
      (soy_crop,'R5.1','R5.1',71,'enchimento_graos',true,'Início do enchimento de grãos','Número e peso de grãos',soy_r5_source,true),
      (soy_crop,'R5.2','R5.2',72,'enchimento_graos',true,'Enchimento de grãos','Peso de grãos',soy_r5_source,true),
      (soy_crop,'R5.3','R5.3',73,'enchimento_graos',true,'Enchimento de grãos','Peso de grãos',soy_r5_source,true),
      (soy_crop,'R5.4','R5.4',74,'enchimento_graos',true,'Enchimento de grãos','Peso de grãos',soy_r5_source,true),
      (soy_crop,'R5.5','R5.5',75,'enchimento_graos',true,'Final de R5','Peso de grãos',soy_r5_source,true)
    ON CONFLICT(culture_id,stage_code) DO UPDATE SET
      name=EXCLUDED.name,
      management_phase_key=EXCLUDED.management_phase_key,
      source_id=EXCLUDED.source_id,
      active=true;

    INSERT INTO planting_windows(culture_id,cultivar_id,name,start_month_day,end_month_day,active,notes)
    VALUES
      (soy_crop,NULL,'Setembro','09-01','09-30',true,'Janela para separar calibrações por época de semeadura.'),
      (soy_crop,NULL,'Outubro','10-01','10-31',true,'Janela para separar calibrações por época de semeadura.'),
      (soy_crop,NULL,'Novembro','11-01','11-30',true,'Janela para separar calibrações por época de semeadura.')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO cotton_crop
  FROM cultures
  WHERE lower(name) IN ('algodão','algodao')
     OR lower(COALESCE(scientific_name,'')) LIKE '%gossypium%'
  ORDER BY active DESC, created_at
  LIMIT 1;

  IF cotton_crop IS NOT NULL THEN
    INSERT INTO culture_phenology_markers(
      culture_id,stage_code,name,marker_order,management_phase_key,
      critical_water_stage,physiological_process,yield_component_risk,source_id,active
    )
    VALUES
      (cotton_crop,'V1','Vegetativo V1',11,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura da planta',cotton_source,true),
      (cotton_crop,'V2','Vegetativo V2',12,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura da planta',cotton_source,true),
      (cotton_crop,'V3','Vegetativo V3',13,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura da planta',cotton_source,true),
      (cotton_crop,'VN','Vegetativo Vn',14,'vegetativo',false,'Desenvolvimento vegetativo','Arquitetura da planta',cotton_source,true),
      (cotton_crop,'B2','Botão floral B2',31,'botoes',true,'Formação de botões florais','Número de estruturas reprodutivas',cotton_source,true),
      (cotton_crop,'B3','Botão floral B3',32,'botoes',true,'Formação de botões florais','Número de estruturas reprodutivas',cotton_source,true),
      (cotton_crop,'BN','Botões florais Bn',33,'botoes',true,'Formação de botões florais','Número de estruturas reprodutivas',cotton_source,true),
      (cotton_crop,'F2','Florescimento F2',41,'florescimento',true,'Florescimento e pegamento','Retenção de flores e maçãs',cotton_source,true),
      (cotton_crop,'F3','Florescimento F3',42,'florescimento',true,'Florescimento e pegamento','Retenção de flores e maçãs',cotton_source,true),
      (cotton_crop,'FN','Florescimento Fn',43,'florescimento',true,'Florescimento e pegamento','Retenção de flores e maçãs',cotton_source,true),
      (cotton_crop,'C2','Abertura C2',71,'maturacao',false,'Abertura de capulhos','Qualidade de fibra',cotton_source,true),
      (cotton_crop,'C3','Abertura C3',72,'maturacao',false,'Abertura de capulhos','Qualidade de fibra',cotton_source,true),
      (cotton_crop,'CN','Abertura Cn',73,'maturacao',false,'Abertura de capulhos','Qualidade de fibra',cotton_source,true)
    ON CONFLICT(culture_id,stage_code) DO UPDATE SET
      name=EXCLUDED.name,
      management_phase_key=EXCLUDED.management_phase_key,
      source_id=EXCLUDED.source_id,
      active=true;

    INSERT INTO planting_windows(culture_id,cultivar_id,name,start_month_day,end_month_day,active,notes)
    VALUES
      (cotton_crop,NULL,'Novembro','11-01','11-30',true,'Janela para separar calibrações por época de semeadura.'),
      (cotton_crop,NULL,'Dezembro','12-01','12-31',true,'Janela para separar calibrações por época de semeadura.'),
      (cotton_crop,NULL,'Janeiro','01-01','01-31',true,'Janela para separar calibrações por época de semeadura.'),
      (cotton_crop,NULL,'Fevereiro','02-01','02-29',true,'Janela para separar calibrações por época de semeadura.')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
