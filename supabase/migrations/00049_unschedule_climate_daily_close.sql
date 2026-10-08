-- Remove o fechamento climático automático agendado.
-- Tolerante: sem pg_cron, não há o que remover — pula sem falhar.

DO $do$
DECLARE
  existing_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'climate-daily-close'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $do$;
