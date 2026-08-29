-- Agenda o fechamento climático diário usando a infraestrutura pg_cron
-- já adotada pela plataforma. O token permanece no Supabase Vault.

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

SELECT cron.schedule(
  'climate-daily-close',
  '30 9 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cotrim_app_url') || '/api/cron/climate-daily',
    headers := jsonb_build_object(
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cotrim_meteoblue_cron_secret'),
      'x-vercel-protection-bypass',(select decrypted_secret from vault.decrypted_secrets where name = 'cotrim_vercel_bypass_secret'),
      'Accept','application/json'
    ),
    timeout_milliseconds := 120000
  );
  $$
);
