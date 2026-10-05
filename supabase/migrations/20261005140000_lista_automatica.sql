begin;
-- Importou a lista, começou: a fila do agente passa a aceitar "só esta lista,
-- inteira, agora". Sem argumentos continua igual (10 por execução do worker).
drop function crm.prepare_sdr_queue();
create function crm.prepare_sdr_queue(only_job uuid default null, max_n integer default 10) returns integer
language plpgsql security definer set search_path=crm,pg_temp as $$
declare m record; lid uuid; v_email text; n integer:=0; begin
 for m in select ml.*,s.sequence_id,s.simulate,s.contact_basis from crm.mining_leads ml
 join crm.sdr_settings s on s.organization_id=ml.organization_id and s.enabled and (s.radar_job_id is null or s.radar_job_id=ml.job_id)
 join crm.organizations o on o.id=s.organization_id and o.ativo
 join crm.outreach_sequences seq on seq.id=s.sequence_id and seq.status='ACTIVE'
 where not ml.imported and coalesce(ml.dados->>'sourceProvider','') <> 'snov'
 and (only_job is null or ml.job_id=only_job)
 and not exists(select 1 from crm.sdr_queue q where q.mining_lead_id=ml.id)
 order by ml.created_at for update of ml skip locked limit greatest(1,least(coalesce(max_n,10),5000)) loop
   v_email:=case when m.dados->>'emailCompany' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then lower(m.dados->>'emailCompany') else '' end;
   lid:=null;
   select id into lid from crm.leads where organization_id=m.organization_id and nullif(cnpj_raw,'')=nullif(m.cnpj_raw,'') limit 1;
   if lid is null and nullif(m.cnpj_raw,'') is null and v_email<>'' then
     select id into lid from crm.leads where organization_id=m.organization_id and lower(email)=v_email order by created_at limit 1;
   end if;
   if lid is null then
     insert into crm.leads(organization_id,nome,empresa,email,telefone,cnpj_raw,segmento,cidade,uf,dados,contact_basis,contact_source,relacao)
     values(m.organization_id,coalesce(m.dados->>'contactName',''),coalesce(m.dados->>'tradeName',m.dados->>'name'),
       v_email,
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
revoke all on function crm.prepare_sdr_queue(uuid,integer) from public,anon,authenticated;
grant execute on function crm.prepare_sdr_queue(uuid,integer) to service_role;

-- Liga o agente nesta lista com a cadência escolhida e já coloca a lista toda
-- na fila. Quem pode e o que é exigido (cadência ativa de prospecção, base de
-- contato, e-mail de aviso) continua sendo decidido por save_sdr_settings.
-- Contatos de listas anteriores que já estão na fila seguem com a cadência deles.
create function crm.start_list_automation(org uuid, job uuid, sid uuid, simulation boolean, basis text, recipient text)
returns integer language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if job is null or not exists(select 1 from crm.mining_jobs where id=job and organization_id=org and coalesce(dados->>'sourceProvider','')<>'snov') then
   raise exception 'Lista inválida para esta empresa.'; end if;
 perform crm.save_sdr_settings(org,true,sid,coalesce(simulation,true),basis,recipient,
   coalesce((select tracking_enabled from crm.sdr_settings where organization_id=org),false),job);
 return crm.prepare_sdr_queue(job,5000);
end $$;
revoke all on function crm.start_list_automation(uuid,uuid,uuid,boolean,text,text) from public,anon;
grant execute on function crm.start_list_automation(uuid,uuid,uuid,boolean,text,text) to authenticated,service_role;
commit;
