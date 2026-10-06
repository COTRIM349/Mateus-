-- Seed: variedades (culture_varieties) de Soja e Algodao, com maturacao,
-- ciclo (janela de ocupacao) e GRM (em observations; nao ha coluna GRM).
-- Idempotente: ON CONFLICT (culture_id,name) atualiza.

INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'ATAQUE I2X', 'tardio', 140, 'GRM 8.2; janela de ocupacao 140 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'BMX DOMINIO IPRO', 'medio', 130, 'GRM 8.4; janela de ocupacao 130 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'BMX Olimpo IPRO', 'medio', 122, 'GRM 7.7; janela de ocupacao 122 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'COMBATE IPRO', 'precoce', 114, 'GRM 7.4; janela de ocupacao 114 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'COMPLETA IPRO', 'medio', 120, 'GRM 7.9; janela de ocupacao 120 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'CZ 37B07 I2X', 'precoce', 108, 'GRM 7.0; janela de ocupacao 108 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'CZ 48B18 IPRO', 'medio', 125, 'GRM 8.1; janela de ocupacao 125 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'CZ 58B10 I2X', 'medio', 125, 'GRM 8.1; janela de ocupacao 125 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'M8434 12X', 'medio', 130, 'GRM 8.4; janela de ocupacao 130 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'MURALHA IPRO', 'medio', 125, 'GRM 8.2; janela de ocupacao 125 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'NEO 690 I2X', 'precoce', 108, 'GRM 6.9; janela de ocupacao 108 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'NEO 761 I2X', 'precoce', 116, 'GRM 7.6; janela de ocupacao 116 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'ST 76KA72', 'precoce', 116, 'GRM 7.6; janela de ocupacao 116 dias' FROM cultures c WHERE c.name='Soja'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'DP 1949 B3RF', 'precoce', 180, 'janela de ocupacao 180 dias; classe Precoce' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'FM 911 GLTP', 'precoce', 180, 'janela de ocupacao 180 dias; classe Precoce' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'FM 974 GLT', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'FM 985 GLTP', 'tardio', 210, 'janela de ocupacao 210 dias; classe Tardio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'FM 990 STP', 'tardio', 210, 'janela de ocupacao 210 dias; classe Tardio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'TMG 33 B3RF', 'precoce', 180, 'janela de ocupacao 180 dias; classe Precoce' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'DP 2111 B3RF', 'precoce', 180, 'janela de ocupacao 180 dias; classe Precoce' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'IMA 5901 B2RF', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'DP 2176 B3RF', 'tardio', 210, 'janela de ocupacao 210 dias; classe Tardio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'FM 933 STP', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'TAURA B3XF', 'precoce', 180, 'janela de ocupacao 180 dias; classe Precoce' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'IMA 5801 B2RF', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'DP 2104 B3XF', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'FM 979 STP', 'tardio', 210, 'janela de ocupacao 210 dias; classe Tardio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'IMA 563 B3XF', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'TMG 44 B2RF', 'medio', 195, 'janela de ocupacao 195 dias; classe Medio' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
INSERT INTO culture_varieties (culture_id, name, maturity, cycle_days, observations)
SELECT c.id, 'TMG 22 GLTP', 'precoce', 180, 'janela de ocupacao 180 dias; classe Precoce' FROM cultures c WHERE c.name='Algodão'
ON CONFLICT (culture_id, name) DO UPDATE SET maturity=EXCLUDED.maturity, cycle_days=EXCLUDED.cycle_days, observations=EXCLUDED.observations;
