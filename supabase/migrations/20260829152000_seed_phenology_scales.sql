-- ============================================================================
-- Escalas fenológicas estruturais para soja e algodão
-- Nenhum DAE, GDA, Kc, raiz ou sensibilidade é inferido nesta migration.
-- ============================================================================

DO $$
DECLARE
  soy_source UUID;
  soy_r5_source UUID;
  cotton_source UUID;
  soy_crop UUID;
  cotton_crop UUID;
  soy_scale UUID;
  cotton_scale UUID;
BEGIN
  SELECT id INTO soy_source FROM agronomic_sources
   WHERE title = 'Stages of soybean development'
     AND year = 1977
   ORDER BY created_at LIMIT 1;

  IF soy_source IS NULL THEN
    INSERT INTO agronomic_sources(
      source_type,institution,authors,year,title,reference,methodology,notes
    ) VALUES (
      'universidade',
      'Iowa State University of Science and Technology',
      'Fehr, W. R.; Caviness, C. E.',
      1977,
      'Stages of soybean development',
      'FEHR, W. R.; CAVINESS, C. E. Stages of soybean development. Ames: Iowa State University of Science and Technology, 1977. 11 p. Special Report 80.',
      'Sistema de identificação de estádios vegetativos e reprodutivos da soja.',
      'Fonte cadastrada para a escala fenológica. Não fornece automaticamente parâmetros específicos de cultivar.'
    ) RETURNING id INTO soy_source;
  END IF;

  SELECT id INTO soy_r5_source FROM agronomic_sources
   WHERE title = 'Subdivisão do estádio R5 da soja'
   ORDER BY created_at LIMIT 1;

  IF soy_r5_source IS NULL THEN
    INSERT INTO agronomic_sources(
      source_type,institution,authors,year,title,reference,methodology,notes
    ) VALUES (
      'embrapa',
      'Embrapa Soja',
      'Yorinori, J. T. (referência indicada pela Embrapa)',
      1996,
      'Subdivisão do estádio R5 da soja',
      'Embrapa Soja registra a subdivisão de R5 em R5.1 a R5.5 e atribui a proposta a Yorinori (1996), em referência à Circular Técnica 14.',
      'Subdivisão observacional do enchimento de grãos por porcentagem de granação.',
      'Extensão da escala operacional; não pertence à proposta original de Fehr & Caviness (1977).'
    ) RETURNING id INTO soy_r5_source;
  END IF;

  SELECT id INTO cotton_source FROM agronomic_sources
   WHERE title = 'A reference system for determination of developmental stages of upland cotton'
     AND year = 2001
   ORDER BY created_at LIMIT 1;

  IF cotton_source IS NULL THEN
    INSERT INTO agronomic_sources(
      source_type,institution,authors,year,title,reference,methodology,notes
    ) VALUES (
      'artigo_cientifico',
      'Revista de Oleaginosas e Fibrosas',
      'Marur, C. J.; Ruano, O.',
      2001,
      'A reference system for determination of developmental stages of upland cotton',
      'MARUR, C. J.; RUANO, O. A reference system for determination of developmental stages of upland cotton. Revista de Oleaginosas e Fibrosas, v. 5, n. 2, p. 313-317, 2001.',
      'Escala fenológica do algodoeiro dividida em fases V, B, F e C.',
      'Fonte cadastrada para a estrutura fenológica. Não atribui automaticamente valores térmicos ou hídricos.'
    ) RETURNING id INTO cotton_source;
  END IF;

  SELECT id INTO soy_crop FROM cultures
   WHERE lower(name) = 'soja' OR lower(scientific_name) = 'glycine max'
   ORDER BY active DESC, created_at LIMIT 1;

  IF soy_crop IS NOT NULL THEN
    INSERT INTO phenology_scales(culture_id,name,source_id,active,notes)
    VALUES(soy_crop,'Fehr & Caviness',soy_source,true,'Escala padrão de fenologia da soja.')
    ON CONFLICT(culture_id,name) DO UPDATE SET source_id=EXCLUDED.source_id, active=true
    RETURNING id INTO soy_scale;

    IF soy_scale IS NULL THEN
      SELECT id INTO soy_scale FROM phenology_scales WHERE culture_id=soy_crop AND name='Fehr & Caviness';
    END IF;

    UPDATE cultures SET phenology_scale_id=soy_scale WHERE id=soy_crop;

    INSERT INTO phenology_stages(scale_id,source_id,code,name,stage_order,stage_group,description)
    VALUES
      (soy_scale,soy_source,'VE','Emergência',1.0,'vegetativo','Emergência dos cotilédones acima da superfície.'),
      (soy_scale,soy_source,'VC','Cotilédones',2.0,'vegetativo','Cotilédones expandidos; folhas unifolioladas em desenvolvimento.'),
      (soy_scale,soy_source,'V1','Primeiro nó',3.0,'vegetativo','Primeiro estádio vegetativo nodal.'),
      (soy_scale,soy_source,'V2','Segundo nó',4.0,'vegetativo','Segundo estádio vegetativo nodal.'),
      (soy_scale,soy_source,'V3','Terceiro nó',5.0,'vegetativo','Terceiro estádio vegetativo nodal.'),
      (soy_scale,soy_source,'V4','Quarto nó',6.0,'vegetativo','Quarto estádio vegetativo nodal.'),
      (soy_scale,soy_source,'V5','Quinto nó',7.0,'vegetativo','Quinto estádio vegetativo nodal.'),
      (soy_scale,soy_source,'Vn','Enésimo nó',8.0,'vegetativo','Continuação da sequência vegetativa por número de nós.'),
      (soy_scale,soy_source,'R1','Início do florescimento',10.0,'reprodutivo','Início do florescimento.'),
      (soy_scale,soy_source,'R2','Florescimento pleno',11.0,'reprodutivo','Florescimento pleno.'),
      (soy_scale,soy_source,'R3','Início da formação de vagens',12.0,'reprodutivo','Início da formação de vagens.'),
      (soy_scale,soy_source,'R4','Vagem completamente desenvolvida',13.0,'reprodutivo','Vagem completamente desenvolvida.'),
      (soy_scale,soy_source,'R5','Início do enchimento de grãos',14.0,'reprodutivo','Início do enchimento de grãos.'),
      (soy_scale,soy_r5_source,'R5.1','R5.1',14.1,'reprodutivo','Subdivisão operacional do enchimento de grãos; requer protocolo local para observação.'),
      (soy_scale,soy_r5_source,'R5.2','R5.2',14.2,'reprodutivo','Subdivisão operacional do enchimento de grãos; requer protocolo local para observação.'),
      (soy_scale,soy_r5_source,'R5.3','R5.3',14.3,'reprodutivo','Subdivisão operacional do enchimento de grãos; requer protocolo local para observação.'),
      (soy_scale,soy_r5_source,'R5.4','R5.4',14.4,'reprodutivo','Subdivisão operacional do enchimento de grãos; requer protocolo local para observação.'),
      (soy_scale,soy_r5_source,'R5.5','R5.5',14.5,'reprodutivo','Subdivisão operacional do enchimento de grãos; requer protocolo local para observação.'),
      (soy_scale,soy_source,'R6','Grão cheio',15.0,'reprodutivo','Grão cheio.'),
      (soy_scale,soy_source,'R7','Início da maturação',16.0,'reprodutivo','Início da maturação.'),
      (soy_scale,soy_source,'R8','Maturação plena',17.0,'reprodutivo','Maturação plena.')
    ON CONFLICT(scale_id,code) DO UPDATE SET
      name=EXCLUDED.name,
      stage_order=EXCLUDED.stage_order,
      stage_group=EXCLUDED.stage_group,
      description=EXCLUDED.description,
      source_id=EXCLUDED.source_id;
  END IF;

  SELECT id INTO cotton_crop FROM cultures
   WHERE lower(name) IN ('algodão','algodao') OR lower(scientific_name) LIKE 'gossypium%'
   ORDER BY active DESC, created_at LIMIT 1;

  IF cotton_crop IS NOT NULL THEN
    INSERT INTO phenology_scales(culture_id,name,source_id,active,notes)
    VALUES(cotton_crop,'Marur & Ruano',cotton_source,true,'Escala V/B/F/C para o algodoeiro.')
    ON CONFLICT(culture_id,name) DO UPDATE SET source_id=EXCLUDED.source_id, active=true
    RETURNING id INTO cotton_scale;

    IF cotton_scale IS NULL THEN
      SELECT id INTO cotton_scale FROM phenology_scales WHERE culture_id=cotton_crop AND name='Marur & Ruano';
    END IF;

    UPDATE cultures SET phenology_scale_id=cotton_scale WHERE id=cotton_crop;

    INSERT INTO phenology_stages(scale_id,source_id,code,name,stage_order,stage_group,description)
    VALUES
      (cotton_scale,cotton_source,'V0','Vegetativo V0',1.0,'vegetativo','Da emergência até a primeira folha verdadeira atingir o critério da escala.'),
      (cotton_scale,cotton_source,'V1','Vegetativo V1',2.0,'vegetativo','Segundo passo da sequência vegetativa.'),
      (cotton_scale,cotton_source,'V2','Vegetativo V2',3.0,'vegetativo','Terceiro passo da sequência vegetativa.'),
      (cotton_scale,cotton_source,'V3','Vegetativo V3',4.0,'vegetativo','Continuação da sequência vegetativa.'),
      (cotton_scale,cotton_source,'Vn','Vegetativo Vn',5.0,'vegetativo','Sequência vegetativa por número de folhas/nós conforme a escala.'),
      (cotton_scale,cotton_source,'B1','Primeiro botão floral',10.0,'botao','Primeiro botão floral visível.'),
      (cotton_scale,cotton_source,'B2','Botão floral B2',11.0,'botao','Primeiro botão floral do segundo ramo frutífero visível.'),
      (cotton_scale,cotton_source,'B3','Botão floral B3',12.0,'botao','Primeiro botão floral do terceiro ramo frutífero visível.'),
      (cotton_scale,cotton_source,'Bn','Botões florais Bn',13.0,'botao','Continuação da sequência de botões florais.'),
      (cotton_scale,cotton_source,'F1','Primeira flor',20.0,'floracao','Primeira flor conforme a escala.'),
      (cotton_scale,cotton_source,'F2','Florescimento F2',21.0,'floracao','Florescimento no segundo ramo frutífero conforme a escala.'),
      (cotton_scale,cotton_source,'F3','Florescimento F3',22.0,'floracao','Continuação do florescimento conforme a escala.'),
      (cotton_scale,cotton_source,'Fn','Florescimento Fn',23.0,'floracao','Continuação da sequência de florescimento.'),
      (cotton_scale,cotton_source,'C1','Primeiro capulho aberto',30.0,'capulho','Início da abertura de capulhos.'),
      (cotton_scale,cotton_source,'C2','Abertura C2',31.0,'capulho','Continuação da abertura de capulhos.'),
      (cotton_scale,cotton_source,'C3','Abertura C3',32.0,'capulho','Continuação da abertura de capulhos.'),
      (cotton_scale,cotton_source,'Cn','Abertura Cn',33.0,'capulho','Continuação da sequência de abertura de capulhos.'),
      (cotton_scale,cotton_source,'FIRST_FRUITING_BRANCH','Primeiro ramo frutífero',8.0,'evento','Evento agronômico observado em campo.'),
      (cotton_scale,cotton_source,'PEAK_FLOWERING','Pico de florescimento',24.0,'evento','Evento agronômico observado em campo.'),
      (cotton_scale,cotton_source,'CUTOUT','Cutout',25.0,'evento','Evento agronômico; critério de campo deve ser registrado no protocolo usado.'),
      (cotton_scale,cotton_source,'MATURITY','Maturidade',40.0,'evento','Maturidade conforme protocolo de campo adotado.'),
      (cotton_scale,cotton_source,'DEFOLIANT','Aplicação de desfolhante',41.0,'manejo','Evento de manejo, não estádio térmico automático.'),
      (cotton_scale,cotton_source,'HARVEST','Colheita',42.0,'manejo','Evento de manejo/encerramento da parcela.')
    ON CONFLICT(scale_id,code) DO UPDATE SET
      name=EXCLUDED.name,
      stage_order=EXCLUDED.stage_order,
      stage_group=EXCLUDED.stage_group,
      description=EXCLUDED.description,
      source_id=EXCLUDED.source_id;
  END IF;

-- Janelas padrão apenas para AGRUPAMENTO de calibração; são configuráveis e
-- não carregam qualquer duração fenológica ou parâmetro agronômico.
  IF soy_crop IS NOT NULL THEN
    INSERT INTO planting_windows(culture_id,cultivar_id,name,start_month_day,end_month_day,active,notes)
    SELECT soy_crop,NULL,v.name,v.start_md,v.end_md,true,
      'Janela operacional padrão para separar calibrações por época de semeadura.'
    FROM (VALUES
      ('Setembro','09-01','09-30'),
      ('Outubro','10-01','10-31'),
      ('Novembro','11-01','11-30')
    ) AS v(name,start_md,end_md)
    WHERE NOT EXISTS (
      SELECT 1 FROM planting_windows pw
      WHERE pw.culture_id=soy_crop AND pw.cultivar_id IS NULL AND pw.name=v.name
    );
  END IF;

  IF cotton_crop IS NOT NULL THEN
    INSERT INTO planting_windows(culture_id,cultivar_id,name,start_month_day,end_month_day,active,notes)
    SELECT cotton_crop,NULL,v.name,v.start_md,v.end_md,true,
      'Janela operacional padrão para separar calibrações por época de semeadura.'
    FROM (VALUES
      ('Novembro','11-01','11-30'),
      ('Dezembro','12-01','12-31'),
      ('Janeiro','01-01','01-31'),
      ('Fevereiro','02-01','02-29')
    ) AS v(name,start_md,end_md)
    WHERE NOT EXISTS (
      SELECT 1 FROM planting_windows pw
      WHERE pw.culture_id=cotton_crop AND pw.cultivar_id IS NULL AND pw.name=v.name
    );
  END IF;
END $$;
