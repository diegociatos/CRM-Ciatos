begin;
-- Preserve a durable association between each Radar result and its named job.
-- Existing leads remain untouched unless their contact_source already proves the Radar job.
update crm.leads l set dados=jsonb_set(l.dados,'{radarJobIds}',coalesce(l.dados->'radarJobIds','[]'::jsonb)||to_jsonb(m.job_id::text))
from crm.mining_leads m
where m.organization_id=l.organization_id and m.imported and m.cnpj_raw=l.cnpj_raw
  and l.contact_source like 'Radar '||m.job_id||' · %'
  and not (coalesce(l.dados->'radarJobIds','[]'::jsonb) ? m.job_id::text);
alter table crm.sdr_settings add column radar_job_id uuid;
alter table crm.sdr_settings add constraint sdr_settings_radar_job_company foreign key(radar_job_id,organization_id) references crm.mining_jobs(id,organization_id) on delete set null (radar_job_id);
create or replace function crm.save_sdr_settings(org uuid, active boolean, sid uuid, simulation boolean, basis text, recipient text, tracking boolean)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if sid is not null and not exists(select 1 from crm.outreach_sequences where id=sid and organization_id=org and settings->>'publico'='prospect') then raise exception 'Escolha uma cadência de prospecção desta empresa.'; end if;
 if active and (sid is null or length(trim(basis)) not between 10 and 500 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Informe cadência, finalidade/base avaliada e destinatário dos alertas.'; end if;
 if length(recipient)>254 or length(basis)>500 then raise exception 'Configuração inválida'; end if;
 if active and not exists(select 1 from crm.outreach_sequences where id=sid and status='ACTIVE') then raise exception 'Ative a cadência antes de ligar o agente.'; end if;
 insert into crm.sdr_settings(organization_id,enabled,sequence_id,simulate,contact_basis,notify_email,tracking_enabled,updated_at) values(org,active,sid,simulation,trim(basis),lower(trim(recipient)),tracking,now())
 on conflict(organization_id) do update set enabled=excluded.enabled,sequence_id=excluded.sequence_id,simulate=excluded.simulate,
 contact_basis=excluded.contact_basis,notify_email=excluded.notify_email,tracking_enabled=excluded.tracking_enabled,updated_at=now();
 if not active then
 update crm.sequence_enrollments set status='PAUSED',stop_reason='agent_paused' where organization_id=org and context->>'source'='sdr' and status='ACTIVE';
 end if;
end $$;

create function crm.save_sdr_settings(org uuid, active boolean, sid uuid, simulation boolean, basis text, recipient text, tracking boolean, job uuid)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if job is not null and not exists(select 1 from crm.mining_jobs where id=job and organization_id=org) then raise exception 'Lista do Radar inválida para esta empresa'; end if;
 perform crm.save_sdr_settings(org,active,sid,simulation,basis,recipient,tracking);
 update crm.sdr_settings set radar_job_id=job where organization_id=org;
end $$;
revoke all on function crm.save_sdr_settings(uuid,boolean,uuid,boolean,text,text,boolean,uuid) from public,anon;
grant execute on function crm.save_sdr_settings(uuid,boolean,uuid,boolean,text,text,boolean,uuid) to authenticated,service_role;

create or replace function crm.prepare_sdr_queue() returns integer language plpgsql security definer set search_path=crm,pg_temp as $$
declare m record; lid uuid; n integer:=0; begin
 for m in select ml.*,s.sequence_id,s.simulate,s.contact_basis from crm.mining_leads ml
 join crm.sdr_settings s on s.organization_id=ml.organization_id and s.enabled and (s.radar_job_id is null or s.radar_job_id=ml.job_id)
 join crm.organizations o on o.id=s.organization_id and o.ativo
 join crm.outreach_sequences seq on seq.id=s.sequence_id and seq.status='ACTIVE'
 where not ml.imported and not exists(select 1 from crm.sdr_queue q where q.mining_lead_id=ml.id)
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


-- Enroll only contacts that really belong to the selected list in this workspace.
create function crm.enroll_radar_list(sid uuid, job uuid, lids uuid[], simulate boolean default true) returns jsonb
language plpgsql security definer set search_path=crm,pg_temp as $$
declare org uuid; begin
 select organization_id into org from crm.outreach_sequences where id=sid;
 if org is null or not crm.tenant_member(org,true) or not exists(select 1 from crm.mining_jobs where id=job and organization_id=org) then
   raise exception 'Cadência ou lista indisponível nesta empresa'; end if;
 if coalesce(array_length(lids,1),0)>2000 then raise exception 'Selecione no máximo 2000 contatos'; end if;
 if exists(select 1 from unnest(lids) selected(id) left join crm.leads l on l.id=selected.id and l.organization_id=org
   where l.id is null or not (coalesce(l.dados->>'radarJobId','')=job::text or coalesce(l.dados->'radarJobIds','[]'::jsonb) ? job::text)) then
   raise exception 'Um ou mais contatos não pertencem à lista selecionada'; end if;
 return crm.enroll_leads(sid,lids,simulate);
end $$;
revoke all on function crm.enroll_radar_list(uuid,uuid,uuid[],boolean) from public,anon;
grant execute on function crm.enroll_radar_list(uuid,uuid,uuid[],boolean) to authenticated,service_role;
commit;
