begin;
-- O Radar esvazia quando a lista vai para o agente; este resumo mostra, na
-- própria lista, o que aconteceu com os contatos (só contagens, sem dados pessoais).
create function crm.radar_list_progress(job uuid) returns jsonb language sql stable security definer set search_path=crm,pg_temp as $$
 select case when not exists(select 1 from crm.mining_jobs j where j.id=job and crm.tenant_member(j.organization_id)) then null else
 (select jsonb_build_object(
   'total',(select count(*) from crm.mining_leads m0 where m0.job_id=job),
   'com_agente',count(*),
   'na_fila',count(*) filter (where q.status in ('PENDING','RUNNING')),
   'na_cadencia',count(*) filter (where q.status='ENROLLED'),
   'revisao',count(*) filter (where q.status='REVIEW'),
   'parados',count(*) filter (where q.status='STOPPED'),
   'com_receita',count(*) filter (where l.dados->'receita'->>'status'='ok'),
   'emails_enviados',(select count(*) from crm.automation_jobs a join crm.sdr_queue q2 on q2.lead_id=a.lead_id join crm.mining_leads m2 on m2.id=q2.mining_lead_id
      where m2.job_id=job and a.dispatch_started_at is not null),
   'respostas',(select count(*) from crm.sdr_alerts s join crm.sdr_queue q3 on q3.lead_id=s.lead_id join crm.mining_leads m3 on m3.id=q3.mining_lead_id where m3.job_id=job),
   'motivos',(select coalesce(jsonb_agg(jsonb_build_object('motivo',r,'n',n) order by n desc),'[]'::jsonb) from
      (select q4.reason r,count(*) n from crm.sdr_queue q4 join crm.mining_leads m4 on m4.id=q4.mining_lead_id
       where m4.job_id=job and q4.status in ('REVIEW','PENDING') and q4.reason is not null group by 1) x))
  from crm.sdr_queue q join crm.mining_leads m on m.id=q.mining_lead_id join crm.leads l on l.id=q.lead_id where m.job_id=job) end
$$;
revoke all on function crm.radar_list_progress(uuid) from public,anon;
grant execute on function crm.radar_list_progress(uuid) to authenticated,service_role;
commit;
