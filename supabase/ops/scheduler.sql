-- Run MANUALLY in staging, after Edge deployment and Vault secret provisioning.
-- Not a migration: applying the schema must never start an outbound worker.
-- Prerequisites: pg_cron, pg_net, Vault; secrets crm_worker_url and crm_worker_secret.
-- crm_worker_url = https://<staging-project>.supabase.co/functions/v1/crm-automation-worker
-- crm_worker_secret must match CRM_WORKER_SECRET. Provision it through the secret UI.
select cron.schedule('crm-outreach-worker','* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='crm_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='crm_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$cron$);
-- Emergency stop: select cron.unschedule('crm-outreach-worker');
