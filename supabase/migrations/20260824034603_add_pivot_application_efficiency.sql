-- Adiciona a coluna application_efficiency em pivots.
-- No banco original foi criada fora das migrations rastreadas; esta migration
-- repoe a coluna para um banco NOVO antes da constraint que usa
-- COALESCE(application_efficiency, efficiency) (20260824034604). Idempotente.

ALTER TABLE public.pivots
  ADD COLUMN IF NOT EXISTS application_efficiency DOUBLE PRECISION;
