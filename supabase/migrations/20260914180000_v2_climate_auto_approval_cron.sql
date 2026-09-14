-- Versão 2.0: troca o coletor legado pelo pipeline climático operacional.
-- A rota climate-v2 ingere os dados, executa o gate de qualidade, grava a
-- seleção diária auditável e aprova automaticamente somente fontes elegíveis.

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
      FROM cron.job
     WHERE jobname IN (
       'meteoblue-agro-twice-daily',
       'climate-v2-twice-daily'
     )
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;
END $$;

SELECT cron.schedule(
  'climate-v2-twice-daily',
  '15 9,21 * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cotrim_app_url') || '/api/cron/climate-v2',
    headers := jsonb_build_object(
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cotrim_meteoblue_cron_secret'),
      'x-vercel-protection-bypass',(select decrypted_secret from vault.decrypted_secrets where name = 'cotrim_vercel_bypass_secret'),
      'Accept','application/json'
    ),
    timeout_milliseconds := 300000
  );
  $job$
);
