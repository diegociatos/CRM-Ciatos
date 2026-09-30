begin;
alter table crm.mining_leads add column snov_prospect_id text;
create unique index mining_leads_snov_list_uk on crm.mining_leads(job_id,snov_prospect_id);
create unique index mining_jobs_snov_list_uk on crm.mining_jobs(organization_id,(dados->>'snovListId')) where dados->>'sourceProvider'='snov';
-- Snov lists are only a reviewed Radar source. The generic SDR worker must
-- never turn newly imported third-party contacts into active outreach.
create or replace function crm.prepare_sdr_queue() returns integer language plpgsql security definer set search_path=crm,pg_temp as $$
declare m record; lid uuid; n integer:=0; begin
 for m in select ml.*,s.sequence_id,s.simulate,s.contact_basis from crm.mining_leads ml
 join crm.sdr_settings s on s.organization_id=ml.organization_id and s.enabled and (s.radar_job_id is null or s.radar_job_id=ml.job_id)
 join crm.organizations o on o.id=s.organization_id and o.ativo
 join crm.outreach_sequences seq on seq.id=s.sequence_id and seq.status='ACTIVE'
 where not ml.imported and coalesce(ml.dados->>'sourceProvider','') <> 'snov'
 and not exists(select 1 from crm.sdr_queue q where q.mining_lead_id=ml.id)
 order by ml.created_at for update of ml skip locked limit 10 loop
   select id into lid from crm.leads where organization_id=m.organization_id and nullif(cnpj_raw,'')=nullif(m.cnpj_raw,'') limit 1;
   if lid is null then
     insert into crm.leads(organization_id,nome,empresa,email,telefone,cnpj_raw,segmento,cidade,uf,dados,contact_basis,contact_source,relacao)
     values(m.organization_id,coalesce(m.dados->>'contactName',''),coalesce(m.dados->>'tradeName',m.dados->>'name'),
       case when m.dados->>'emailCompany' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then lower(m.dados->>'emailCompany') else '' end,
       coalesce(m.dados->>'phoneCompany',m.dados->>'phone'),m.cnpj_raw,m.dados->>'segment',m.dados->>'city',m.dados->>'state',m.dados||jsonb_build_object('radarJobId',m.job_id),
       m.contact_basis,'Radar '||m.job_id||' · '||left(coalesce(m.dados->'sources','[]')::text,800),'prospect') returning id into lid;
   end if;
   update crm.leads set dados=jsonb_set(dados,'{radarJobIds}',coalesce(dados->'radarJobIds','[]'::jsonb) || to_jsonb(m.job_id::text))
   where id=lid and organization_id=m.organization_id and not (coalesce(dados->'radarJobIds','[]'::jsonb) ? m.job_id::text);
   insert into crm.sdr_queue(organization_id,mining_lead_id,lead_id,sequence_id,simulate) values(m.organization_id,m.id,lid,m.sequence_id,m.simulate) on conflict do nothing;
   update crm.mining_leads set imported=true where id=m.id;
   n:=n+1;
 end loop;
 return n;
end $$;
commit;
