begin;
create function crm.reserve_ai_run(org uuid,lid uuid) returns bigint language plpgsql security definer set search_path=crm,pg_temp as $$
declare p crm.outreach_policy; rid bigint; begin
 select * into p from crm.outreach_policy where organization_id=org for update;
 if not found or (lid is not null and not exists(select 1 from crm.leads where id=lid and organization_id=org and not opt_out)) then raise exception 'Invalid lead'; end if;
 if (select count(*) from crm.ai_runs where organization_id=org and created_at>=date_trunc('day',now()))>=p.ai_daily_limit then raise exception 'AI quota exceeded'; end if;
 insert into crm.ai_runs(organization_id,lead_id,agent,provider,model,action)
 values(org,lid,'supervisor','pending','pending','review') returning id into rid;
 return rid;
end $$;

create function crm.contact_action(lid uuid, action text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare l crm.leads; begin
 select * into l from crm.leads where id=lid;
 if not crm.tenant_member(l.organization_id) then raise exception 'Forbidden'; end if;
 if action='opt_out' then perform crm.suppress_contact(l.organization_id,l.email,'manual_opt_out');
 elsif action in ('reply','meeting') then
   update crm.sequence_enrollments set status='STOPPED',stop_reason=action where lead_id=lid and status in ('ACTIVE','PAUSED');
   insert into crm.human_handoffs(organization_id,lead_id,reason,priority,suggested_action) values(l.organization_id,lid,action,'HIGH','Contato registrado pela equipe. Revisar antes de iniciar outra cadência.');
 else raise exception 'Invalid action'; end if;
end $$;

-- Preserve tenant assignment and stop all dependent execution when a lead opts out.
create function crm.stop_opted_out_lead() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if new.opt_out and (TG_OP='INSERT' or not old.opt_out) then
   insert into crm.suppression_list(organization_id,email,reason,source) values(new.organization_id,lower(new.email),'opt_out','lead') on conflict do nothing;
   update crm.sequence_enrollments set status='STOPPED',stop_reason='opt_out' where lead_id=new.id and status in ('ACTIVE','PAUSED');
 end if;
 return new;
end $$;
create trigger stop_opted_out_lead after insert or update on crm.leads for each row execute function crm.stop_opted_out_lead();

-- Legacy child rows must not disclose a different tenant's leads.
create policy interactions_tenant_guard on crm.interactions as restrictive for all to authenticated
 using(exists(select 1 from crm.leads l where l.id=lead_id and crm.tenant_member(l.organization_id)))
 with check(exists(select 1 from crm.leads l where l.id=lead_id and crm.tenant_member(l.organization_id)));
create policy agenda_tenant_guard on crm.agenda_events as restrictive for all to authenticated
 using(lead_id is null or exists(select 1 from crm.leads l where l.id=lead_id and crm.tenant_member(l.organization_id)))
 with check(lead_id is null or exists(select 1 from crm.leads l where l.id=lead_id and crm.tenant_member(l.organization_id)));
create policy profiles_tenant_guard on crm.profiles as restrictive for select to authenticated
 using(id=auth.uid() or exists(select 1 from crm.organization_members m where m.user_id=profiles.id and crm.tenant_member(m.organization_id)));
-- Old audit snapshots are internal-only. Do not retain copies of deleted lead data.
create or replace function crm.audit_delete() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 insert into crm.audit_logs(user_id,acao,entidade,entidade_id) values(auth.uid(),'DELETE',tg_table_name,old.id::text);
 return old;
end $$;

create function crm.lead_privacy_export(lid uuid) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare l crm.leads; begin
 select * into l from crm.leads where id=lid;
 if not crm.tenant_member(l.organization_id,true) then raise exception 'Forbidden'; end if;
 return jsonb_build_object('lead',to_jsonb(l),'interactions',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from crm.interactions i where i.lead_id=lid),
 'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from crm.message_events e where e.lead_id=lid),
 'ai_runs',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from crm.ai_runs a where a.lead_id=lid),
 'handoffs',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from crm.human_handoffs h where h.lead_id=lid));
end $$;

create table crm.enrichment_requests(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references crm.organizations(id),
 lead_id uuid not null,kind text not null check(kind in ('discover','verify')),input text not null,
 status text not null default 'PENDING',task_hash text,result jsonb,created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade,
 unique(organization_id,lead_id,kind,input)
);
alter table crm.enrichment_requests enable row level security;
create policy enrich_read on crm.enrichment_requests for select to authenticated using(crm.tenant_member(organization_id));
grant select on crm.enrichment_requests to authenticated;
grant all on crm.enrichment_requests to service_role;
create function crm.reserve_enrichment(org uuid,lid uuid,operation text,value text) returns uuid language plpgsql security definer set search_path=crm,pg_temp as $$
declare rid uuid; begin
 perform 1 from crm.outreach_policy where organization_id=org for update;
 if not found or not exists(select 1 from crm.leads where id=lid and organization_id=org and not opt_out) then raise exception 'Invalid lead'; end if;
 select id into rid from crm.enrichment_requests where organization_id=org and lead_id=lid and kind=operation and input=value;
 if found then return rid; end if;
 if (select count(*) from crm.enrichment_requests where organization_id=org and created_at>=date_trunc('day',now()))>=25 then raise exception 'Enrichment quota exceeded'; end if;
 insert into crm.enrichment_requests(organization_id,lead_id,kind,input) values(org,lid,operation,value) returning id into rid;
 return rid;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm'
 and p.proname in ('reserve_ai_run','contact_action','lead_privacy_export','reserve_enrichment','lead_contact_guard','stop_opted_out_lead') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 if f.proname in ('contact_action','lead_privacy_export') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
create function crm.complete_enrichment(rid uuid,verified boolean,candidates jsonb) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare r crm.enrichment_requests; begin
 select * into r from crm.enrichment_requests where id=rid for update;
 if r.status<>'WAITING' then return; end if;
 if r.kind='verify' then
   update crm.leads set email_verified_at=case when verified then now() else null end
   where id=r.lead_id and organization_id=r.organization_id and email=r.input and not opt_out;
 end if;
 update crm.enrichment_requests set status='DONE',updated_at=now(),result=jsonb_build_object('verified',verified,'candidates',candidates) where id=rid;
end $$;
revoke all on function crm.complete_enrichment(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function crm.complete_enrichment(uuid,boolean,jsonb) to service_role;

create policy profiles_update_tenant_guard on crm.profiles as restrictive for update to authenticated
 using(id=auth.uid() or exists(select 1 from crm.organization_members m where m.user_id=profiles.id and m.organization_id='00000000-0000-4000-8000-000000000001'));

-- Use a dedicated erasure workflow; deletion always preserves a minimal suppression record.
create function crm.erase_lead(lid uuid) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare l crm.leads; begin
 select * into l from crm.leads where id=lid for update;
 if not crm.tenant_member(l.organization_id,true) then raise exception 'Forbidden'; end if;
 perform crm.suppress_contact(l.organization_id,l.email,'privacy_erasure');
 delete from crm.audit_logs where entidade='leads' and entidade_id=lid::text;
 delete from crm.leads where id=lid;
end $$;
revoke all on function crm.erase_lead(uuid) from public,anon;
grant execute on function crm.erase_lead(uuid) to authenticated,service_role;
create function crm.save_contact_basis(lid uuid,basis text,source text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if length(trim(basis)) not between 3 and 500 or length(trim(source)) not between 3 and 1000 then raise exception 'Invalid contact basis'; end if;
 update crm.leads set contact_basis=trim(basis),contact_source=trim(source) where id=lid and crm.tenant_member(organization_id,true);
 if not found then raise exception 'Forbidden'; end if;
end $$;
revoke all on function crm.save_contact_basis(uuid,text,text) from public,anon;
grant execute on function crm.save_contact_basis(uuid,text,text) to authenticated,service_role;
create function crm.suppress_deleted_lead() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 insert into crm.suppression_list(organization_id,email,reason,source) values(old.organization_id,lower(old.email),'lead_deleted','privacy') on conflict do nothing;
 return old;
end $$;
create trigger suppress_deleted_lead before delete on crm.leads for each row execute function crm.suppress_deleted_lead();
revoke all on function crm.suppress_deleted_lead() from public,anon,authenticated;
grant usage,select on all sequences in schema crm to service_role;
create index leads_tenant_idx on crm.leads(organization_id);
create index jobs_tenant_created_idx on crm.automation_jobs(organization_id,created_at desc);
commit;
