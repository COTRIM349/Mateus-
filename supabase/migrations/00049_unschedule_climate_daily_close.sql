-- Remove o fechamento climático automático agendado hoje.
-- A versão de 28/08 não tinha essa rota; o job passaria a 404 após o revert.

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'climate-daily-close'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;
