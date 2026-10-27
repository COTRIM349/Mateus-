-- Base histórica de horímetros por pivô
-- Fonte: lancamentos_horimetro.xlsx
-- Para cada pivô, foi selecionado o H.Final da linha mais recente por Data
-- (em empate, a última linha da base).
--
-- Regra operacional:
-- 1) último lançamento válido da plataforma, quando posterior/coerente;
-- 2) último horímetro desta base histórica;
-- 3) vazio somente se não houver nenhuma referência.

ALTER TABLE public.pivots
  ADD COLUMN IF NOT EXISTS horimeter_base_value DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS horimeter_base_date DATE,
  ADD COLUMN IF NOT EXISTS horimeter_base_source TEXT;

COMMENT ON COLUMN public.pivots.horimeter_base_value IS
  'Último horímetro histórico conhecido antes/fora dos lançamentos operacionais da plataforma.';
COMMENT ON COLUMN public.pivots.horimeter_base_date IS
  'Data do horímetro histórico base.';
COMMENT ON COLUMN public.pivots.horimeter_base_source IS
  'Origem do horímetro histórico base.';

WITH base(code, horimeter_base_value, horimeter_base_date) AS (
VALUES
  ('P01', 1380.0000::double precision, DATE '2026-10-19'),
  ('P02', 1198.0000::double precision, DATE '2026-10-20'),
  ('P03', 966.0000::double precision, DATE '2026-10-16'),
  ('P04', 1489.0000::double precision, DATE '2026-10-17'),
  ('P05', 3417.0000::double precision, DATE '2026-10-20'),
  ('P06', 1127.0000::double precision, DATE '2026-10-18'),
  ('P07', 2427.0000::double precision, DATE '2026-09-20'),
  ('P08', 760.0000::double precision, DATE '2026-09-21'),
  ('P09', 1001.0000::double precision, DATE '2026-09-16'),
  ('P10', 1052.0000::double precision, DATE '2026-09-19'),
  ('P11', 1053.0000::double precision, DATE '2026-09-27'),
  ('P12', 1209.0000::double precision, DATE '2026-10-12'),
  ('P13', 334.0000::double precision, DATE '2026-10-19'),
  ('P14', 1639.0000::double precision, DATE '2026-10-18'),
  ('P15', 922.0000::double precision, DATE '2026-10-20'),
  ('P16', 556.0000::double precision, DATE '2026-07-19'),
  ('P17', 676.0000::double precision, DATE '2026-10-16'),
  ('P18', 2056.0000::double precision, DATE '2026-10-12'),
  ('P19', 1229.0000::double precision, DATE '2026-10-20'),
  ('P20', 2048.0000::double precision, DATE '2026-10-20'),
  ('P21', 1232.0000::double precision, DATE '2026-10-19'),
  ('P22', 1556.0000::double precision, DATE '2026-10-19'),
  ('P23', 1668.0000::double precision, DATE '2026-10-20'),
  ('P24', 155.0000::double precision, DATE '2026-10-16'),
  ('P25', 3202.0000::double precision, DATE '2026-10-18'),
  ('P26', 845.0000::double precision, DATE '2026-10-19'),
  ('P27', 3616.0000::double precision, DATE '2026-10-20'),
  ('P28', 1265.0000::double precision, DATE '2026-10-18'),
  ('P29', 3994.0000::double precision, DATE '2026-10-19'),
  ('P30', 836.0000::double precision, DATE '2026-06-05'),
  ('P31', 673.0000::double precision, DATE '2026-06-11'),
  ('P32', 2607.0000::double precision, DATE '2026-10-20'),
  ('P33', 340.0000::double precision, DATE '2026-10-20'),
  ('P34', 1701.0000::double precision, DATE '2026-10-20'),
  ('P35', 869.0000::double precision, DATE '2026-10-19'),
  ('P36', 1160.0000::double precision, DATE '2026-10-17'),
  ('P37', 831.0000::double precision, DATE '2026-10-17'),
  ('P38', 916.0000::double precision, DATE '2026-10-18'),
  ('P39', 871.0000::double precision, DATE '2026-08-13'),
  ('P40', 808.0000::double precision, DATE '2026-10-20'),
  ('P41', 549.0000::double precision, DATE '2026-08-05'),
  ('P42', 1677.0000::double precision, DATE '2026-10-18'),
  ('P43', 2725.0000::double precision, DATE '2026-10-10'),
  ('P44', 906.0000::double precision, DATE '2026-10-16'),
  ('P45', 804.0000::double precision, DATE '2026-10-18'),
  ('P46', 2949.0000::double precision, DATE '2026-10-18'),
  ('P47', 2364.0000::double precision, DATE '2026-08-06'),
  ('P48', 46.0000::double precision, DATE '2026-09-08'),
  ('P49', 1437.0000::double precision, DATE '2026-09-08'),
  ('P50', 1112.0000::double precision, DATE '2026-10-20'),
  ('P51', 1660.0000::double precision, DATE '2026-08-06'),
  ('P52', 1204.0000::double precision, DATE '2026-10-17'),
  ('P53', 1013.0000::double precision, DATE '2026-07-18'),
  ('P54', 1737.0000::double precision, DATE '2026-07-18'),
  ('P55', 890.0000::double precision, DATE '2026-08-03'),
  ('P56', 602.0000::double precision, DATE '2026-10-19'),
  ('P57', 1181.0000::double precision, DATE '2026-10-19'),
  ('P58', 1780.0000::double precision, DATE '2026-08-05'),
  ('P59', 1682.0000::double precision, DATE '2026-10-18'),
  ('P60', 2270.0000::double precision, DATE '2026-10-20'),
  ('P61', 2510.0000::double precision, DATE '2026-10-19'),
  ('P62', 1495.0000::double precision, DATE '2026-10-20'),
  ('P63', 1448.0000::double precision, DATE '2026-10-15'),
  ('P64', 1043.0000::double precision, DATE '2026-10-20'),
  ('P65', 1698.0000::double precision, DATE '2026-10-20'),
  ('P66', 1083.0000::double precision, DATE '2026-10-20'),
  ('P67', 964.0000::double precision, DATE '2026-10-20'),
  ('P68', 2210.0000::double precision, DATE '2026-10-16'),
  ('P69', 739.0000::double precision, DATE '2026-07-22'),
  ('P70', 1722.0000::double precision, DATE '2026-10-20'),
  ('P71', 689.0000::double precision, DATE '2026-10-18'),
  ('P72', 1350.0000::double precision, DATE '2026-10-20'),
  ('P73', 1737.0000::double precision, DATE '2026-10-19'),
  ('P74', 1102.0000::double precision, DATE '2026-09-23'),
  ('P101', 3150.8000::double precision, DATE '2026-07-19'),
  ('P102', 1406.2000::double precision, DATE '2026-10-24'),
  ('P103', 2078.6000::double precision, DATE '2026-10-19'),
  ('P104', 3349.8000::double precision, DATE '2026-10-22'),
  ('P105', 861.2000::double precision, DATE '2026-10-24'),
  ('P106', 886.1000::double precision, DATE '2026-10-23'),
  ('P107', 888.9000::double precision, DATE '2026-10-23'),
  ('P108', 1830.6000::double precision, DATE '2026-10-19'),
  ('P109', 1568.5000::double precision, DATE '2026-10-23'),
  ('P110', 2042.0000::double precision, DATE '2026-10-24'),
  ('P112', 678.7000::double precision, DATE '2026-10-23'),
  ('P113', 531.8000::double precision, DATE '2026-10-23'),
  ('P114', 552.5000::double precision, DATE '2026-07-19'),
  ('P115', 724.9000::double precision, DATE '2026-10-14'),
  ('P116', 1096.7000::double precision, DATE '2026-08-19'),
  ('P117', 1350.7000::double precision, DATE '2026-10-23'),
  ('P118', 949.8000::double precision, DATE '2026-10-19'),
  ('P119', 486.3000::double precision, DATE '2026-05-26'),
  ('P120', 954.0000::double precision, DATE '2026-10-19'),
  ('P121', 233.0000::double precision, DATE '2026-10-23'),
  ('P122', 3102.4000::double precision, DATE '2026-10-24'),
  ('P123', 3581.7000::double precision, DATE '2026-10-24'),
  ('P124', 958.1000::double precision, DATE '2026-10-24'),
  ('P125', 1992.8000::double precision, DATE '2026-10-09'),
  ('P126', 1435.9000::double precision, DATE '2026-09-23'),
  ('P127', 1069.0000::double precision, DATE '2026-10-23'),
  ('P128', 842.5000::double precision, DATE '2026-10-19'),
  ('P129', 1582.9000::double precision, DATE '2026-10-24'),
  ('P130', 1709.0000::double precision, DATE '2026-10-12'),
  ('P131', 1239.1000::double precision, DATE '2026-10-24'),
  ('P132', 1228.7000::double precision, DATE '2026-10-24'),
  ('P133', 1597.8000::double precision, DATE '2026-10-16')
)
UPDATE public.pivots p
SET horimeter_base_value = b.horimeter_base_value,
    horimeter_base_date = b.horimeter_base_date,
    horimeter_base_source = 'lancamentos_horimetro.xlsx',
    updated_at = now()
FROM base b
WHERE p.code = b.code
  AND p.active = true;
