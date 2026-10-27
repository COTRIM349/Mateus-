-- Horímetros do evento de irrigação
-- Permite registrar a leitura inicial e final do equipamento.
-- A diferença entre as leituras representa as horas reais de operação.

ALTER TABLE public.irrigation_events
  ADD COLUMN IF NOT EXISTS horimeter_initial DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS horimeter_final DOUBLE PRECISION;

ALTER TABLE public.irrigation_events
  DROP CONSTRAINT IF EXISTS irrigation_events_horimeter_initial_nonnegative,
  ADD CONSTRAINT irrigation_events_horimeter_initial_nonnegative
    CHECK (horimeter_initial IS NULL OR horimeter_initial >= 0);

ALTER TABLE public.irrigation_events
  DROP CONSTRAINT IF EXISTS irrigation_events_horimeter_final_nonnegative,
  ADD CONSTRAINT irrigation_events_horimeter_final_nonnegative
    CHECK (horimeter_final IS NULL OR horimeter_final >= 0);

ALTER TABLE public.irrigation_events
  DROP CONSTRAINT IF EXISTS irrigation_events_horimeter_order,
  ADD CONSTRAINT irrigation_events_horimeter_order
    CHECK (
      horimeter_initial IS NULL
      OR horimeter_final IS NULL
      OR horimeter_final >= horimeter_initial
    );

COMMENT ON COLUMN public.irrigation_events.horimeter_initial IS
  'Leitura do horímetro no início da irrigação.';

COMMENT ON COLUMN public.irrigation_events.horimeter_final IS
  'Leitura do horímetro ao final da irrigação.';
