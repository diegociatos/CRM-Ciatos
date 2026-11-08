-- Run MANUALLY, after migration 20261108150000_support_demand_sla.sql is applied and verified.
-- Not a migration: applying the schema must never start a background job.
-- Prerequisite: pg_cron enabled in the project (Database > Extensions). No Edge Function, secret or
-- outbound call is involved: the job only writes internal alerts into crm.support_demand_alerts.
select cron.schedule('crm-support-demand-scan', '*/10 * * * *', $cron$ select crm.scan_support_demands(); $cron$);
-- Check: select * from cron.job where jobname = 'crm-support-demand-scan';
-- Emergency stop: select cron.unschedule('crm-support-demand-scan');
