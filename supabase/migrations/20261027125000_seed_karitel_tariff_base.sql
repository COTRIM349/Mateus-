-- =============================================================================
-- Base oficial de tarifas da planilha:
-- Manejo_Irrigacao_Karitel_RDM_31_com_custo_1 aderir na plataforma.xlsx
-- Aba BASE_TARIFAS · nov/2025 a out/2026
--
-- Mapeamento:
--   demand_rate   = Demanda HFP (R$/kW)
--   rate_peak     = HP total (TUSD + TE)
--   rate_off_peak = HFP total (TUSD + TE)
--   rate_reserved = HR total (TUSD + TE)
--
-- Não altera demanda contratada: a planilha não fornece esse valor.
-- =============================================================================

WITH karitel AS (
  SELECT id
  FROM public.farms
  WHERE name = 'FAZENDA KARITEL'
  ORDER BY created_at
  LIMIT 1
)
UPDATE public.energy_tariffs et
SET active = false,
    updated_at = now()
FROM karitel k
WHERE et.farm_id = k.id;

WITH karitel AS (
  SELECT id
  FROM public.farms
  WHERE name = 'FAZENDA KARITEL'
  ORDER BY created_at
  LIMIT 1
),
rates(valid_from, valid_to, demand_rate, rate_peak, rate_off_peak, rate_reserved) AS (
  VALUES
    (DATE '2025-11-01', DATE '2025-11-30', 15.264696::double precision, 0.524250::double precision, 0.345317::double precision, 0.034532::double precision),
    (DATE '2025-12-01', DATE '2025-12-31', 15.135251, 0.519805, 0.342390, 0.034239),
    (DATE '2026-01-01', DATE '2026-01-31', 15.036792, 0.516423, 0.340162, 0.034016),
    (DATE '2026-02-01', DATE '2026-02-28', 14.968153, 0.514066, 0.338609, 0.033861),
    (DATE '2026-03-01', DATE '2026-03-31', 15.094744, 0.518413, 0.341473, 0.034147),
    (DATE '2026-04-01', DATE '2026-04-30', 15.927012, 0.541882, 0.354573, 0.035457),
    (DATE '2026-05-01', DATE '2026-05-31', 17.217972, 0.574421, 0.370563, 0.037056),
    (DATE '2026-06-01', DATE '2026-06-30', 17.153285, 0.572263, 0.369171, 0.036917),
    (DATE '2026-07-01', DATE '2026-07-31', 16.913633, 0.564268, 0.364013, 0.036401),
    (DATE '2026-08-01', DATE '2026-08-31', 17.204996, 0.573988, 0.370285, 0.037029),
    (DATE '2026-09-01', DATE '2026-09-30', 17.116691, 0.571042, 0.368384, 0.036839),
    (DATE '2026-10-01', DATE '2026-10-31', 17.140238, 0.571828, 0.368891, 0.036889)
)
INSERT INTO public.energy_tariffs (
  farm_id,
  tariff_type,
  demand_rate,
  rate_peak,
  rate_off_peak,
  rate_reserved,
  peak_start,
  peak_end,
  valid_from,
  valid_to,
  active
)
SELECT
  k.id,
  'verde',
  r.demand_rate,
  r.rate_peak,
  r.rate_off_peak,
  r.rate_reserved,
  18,
  21,
  r.valid_from,
  r.valid_to,
  true
FROM karitel k
CROSS JOIN rates r;
