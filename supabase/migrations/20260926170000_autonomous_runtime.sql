-- Apply in staging first. No cron or outbound traffic is enabled by this migration.
begin;
insert into crm.organizations(id,nome,slug) values
 ('00000000-0000-4000-8000-000000000001','Grupo Ciatos','grupo-ciatos') on conflict do nothing;
insert into crm.organization_members(organization_id,user_id,papel)
 select '00000000-0000-4000-8000-000000000001',id,
 case when papel in ('ADMIN','MANAGER') then 'ADMIN' else 'MEMBER' end from crm.profiles
 on conflict do nothing;

create function crm.tenant_member(org uuid, admin_only boolean default false) returns boolean
language sql stable security definer set search_path=crm,pg_temp as $$
 select exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
 join crm.organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=auth.uid() and m.ativo and p.ativo and o.ativo
 and (not admin_only or m.papel='ADMIN'))
$$;
revoke all on function crm.tenant_member(uuid,boolean) from public,anon;
grant execute on function crm.tenant_member(uuid,boolean) to authenticated,service_role;

alter table crm.leads add column organization_id uuid references crm.organizations(id)
 default '00000000-0000-4000-8000-000000000001';
alter table crm.leads alter column organization_id set not null;
alter table crm.leads add column email_verified_at timestamptz;
alter table crm.leads add column contact_basis text;
alter table crm.leads add column contact_source text;
alter table crm.leads add unique(id,organization_id);
drop index crm.leads_cnpj_raw_uk;
create unique index leads_cnpj_raw_uk on crm.leads(organization_id,cnpj_raw) where cnpj_raw is not null and cnpj_raw<>'';

-- Existing legacy screens are restricted to the original internal workspace.
create or replace function crm.eh_membro() returns boolean language sql stable security definer
 set search_path=crm,pg_temp as $$ select crm.tenant_member('00000000-0000-4000-8000-000000000001') $$;
create or replace function crm.papel_atual() returns text language sql stable security definer
 set search_path=crm,pg_temp as $$ select papel from crm.profiles where id=auth.uid() and ativo
 and crm.tenant_member('00000000-0000-4000-8000-000000000001') $$;

-- Remove permissive foundation policies: permissive policies combine with OR.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='crm' and tablename in
 ('organizations','organization_members','outreach_sequences','outreach_steps','sequence_enrollments',
 'automation_jobs','message_events','suppression_list','ai_runs','human_handoffs','leads') loop
 execute format('drop policy %I on crm.%I',p.policyname,p.tablename); end loop;
end $$;
create policy organizations_read on crm.organizations for select to authenticated using(crm.tenant_member(id));
create policy members_read on crm.organization_members for select to authenticated using(crm.tenant_member(organization_id));
-- Organization settings/membership are service-only to prevent self escalation and enabling live traffic.
revoke insert,update,delete on crm.organizations,crm.organization_members from authenticated;
create policy leads_read on crm.leads for select to authenticated using(crm.tenant_member(organization_id));
create policy leads_insert on crm.leads for insert to authenticated with check(crm.tenant_member(organization_id));
create policy leads_update on crm.leads for update to authenticated using(crm.tenant_member(organization_id)) with check(crm.tenant_member(organization_id));
create policy leads_delete on crm.leads for delete to authenticated using(crm.tenant_member(organization_id,true));

-- Leads cannot move between tenants or forge verification via a browser request.
create function crm.lead_contact_guard() returns trigger language plpgsql as $$ begin
 if TG_OP='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Tenant immutable'; end if;
 if current_user not in ('postgres','service_role','supabase_admin') then
   if TG_OP='INSERT' then new.email_verified_at:=null;
   elsif new.email_verified_at is distinct from old.email_verified_at then raise exception 'Verification is server-only'; end if;
 end if;
 if TG_OP='UPDATE' and lower(coalesce(new.email,''))<>lower(coalesce(old.email,'')) then new.email_verified_at:=null; end if;
 return new;
end $$;
create trigger lead_contact_guard before insert or update on crm.leads for each row execute function crm.lead_contact_guard();

do $$ declare t text; begin
 foreach t in array array['outreach_sequences','sequence_enrollments','automation_jobs','message_events','suppression_list','ai_runs','human_handoffs'] loop
 execute format('update crm.%I set organization_id=%L where organization_id is null',t,'00000000-0000-4000-8000-000000000001');
 execute format('alter table crm.%I alter column organization_id set not null',t);
 execute format('create policy tenant_read on crm.%I for select to authenticated using(crm.tenant_member(organization_id))',t);
 end loop;
end $$;
alter table crm.outreach_sequences add unique(id,organization_id);
alter table crm.sequence_enrollments add constraint enrollment_tenant_lead foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade;
alter table crm.sequence_enrollments add constraint enrollment_tenant_sequence foreign key(sequence_id,organization_id) references crm.outreach_sequences(id,organization_id) on delete cascade;
alter table crm.sequence_enrollments add column dry_run boolean not null default true;
alter table crm.automation_jobs add column lease_token uuid;
alter table crm.automation_jobs add column dispatch_started_at timestamptz;
alter table crm.automation_jobs add column provider_message_id text unique;
alter table crm.automation_jobs add column step_order integer;
alter table crm.automation_jobs add column optout_token uuid not null default gen_random_uuid();
alter table crm.human_handoffs add column job_id bigint unique references crm.automation_jobs(id) on delete set null;
alter table crm.message_events add column provider_event_id text;
create unique index message_event_delivery_uk on crm.message_events(provider,provider_event_id);
create policy steps_read on crm.outreach_steps for select to authenticated using(exists
 (select 1 from crm.outreach_sequences s where s.id=sequence_id and crm.tenant_member(s.organization_id)));
-- Browser writes go through narrowly scoped RPCs, not arbitrary execution payloads.
revoke insert,update,delete on crm.outreach_sequences,crm.outreach_steps,crm.sequence_enrollments,
 crm.suppression_list,crm.human_handoffs,crm.automation_jobs,crm.message_events,crm.ai_runs from authenticated;

create table crm.outreach_policy (
 organization_id uuid primary key references crm.organizations(id),
 live_enabled boolean not null default false,
 daily_limit integer not null default 25 check(daily_limit between 1 and 1000),
 mailbox_daily_limit integer not null default 25 check(mailbox_daily_limit between 1 and 1000),
 sender text check(sender is null or sender ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
 timezone text not null default 'America/Sao_Paulo',
 ai_daily_limit integer not null default 50 check(ai_daily_limit between 0 and 1000)
);
insert into crm.outreach_policy(organization_id) select id from crm.organizations;
alter table crm.outreach_policy enable row level security;
create policy policy_read on crm.outreach_policy for select to authenticated using(crm.tenant_member(organization_id));
grant select on crm.outreach_policy to authenticated;
grant all on crm.outreach_policy to service_role;

create function crm.create_cadence(org uuid, title text, subject text, body text, delay_days integer default 2) returns uuid
language plpgsql security definer set search_path=crm,pg_temp as $$ declare sid uuid; begin
 if not crm.tenant_member(org,true) then raise exception 'Forbidden'; end if;
 if length(trim(title)) not between 1 and 100 or length(trim(subject)) not between 1 and 200
 or length(trim(body)) not between 1 and 6000 or delay_days not between 1 and 30 then raise exception 'Invalid cadence'; end if;
 insert into crm.outreach_sequences(organization_id,nome,status,created_by) values(org,title,'DRAFT',auth.uid()) returning id into sid;
 insert into crm.outreach_steps(sequence_id,ordem,tipo,config) values(sid,0,'EMAIL',jsonb_build_object('subject',subject,'body',body));
 insert into crm.outreach_steps(sequence_id,ordem,tipo,delay_minutes,config) values(sid,1,'NOTIFY_HUMAN',delay_days*1440,'{"reason":"Cadência concluída. Avaliar próximo contato."}');
 return sid;
end $$;
create function crm.set_cadence_state(sid uuid, new_status text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if new_status not in ('ACTIVE','PAUSED','ARCHIVED') or not exists(select 1 from crm.outreach_sequences where id=sid and crm.tenant_member(organization_id,true)) then raise exception 'Forbidden'; end if;
 update crm.outreach_sequences set status=new_status where id=sid;
end $$;
create function crm.enroll_lead(sid uuid,lid uuid,simulate boolean default true) returns uuid
language plpgsql security definer set search_path=crm,pg_temp as $$ declare s crm.outreach_sequences; eid uuid; begin
 select * into s from crm.outreach_sequences where id=sid;
 if not crm.tenant_member(s.organization_id,true) or s.status<>'ACTIVE' then raise exception 'Forbidden or inactive cadence'; end if;
 if not exists(select 1 from crm.leads where id=lid and organization_id=s.organization_id and not opt_out) then raise exception 'Invalid lead'; end if;
 if not simulate and not exists(select 1 from crm.outreach_policy where organization_id=s.organization_id and live_enabled) then raise exception 'Live disabled'; end if;
 insert into crm.sequence_enrollments(organization_id,sequence_id,lead_id,dry_run,next_run_at)
 values(s.organization_id,sid,lid,simulate,now()) returning id into eid;
 return eid;
end $$;
create function crm.resolve_handoff(hid bigint, resolution text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if resolution not in ('ACKNOWLEDGED','RESOLVED','DISMISSED') then raise exception 'Invalid status'; end if;
 update crm.human_handoffs set status=resolution,assigned_to=auth.uid(),resolved_at=case when resolution in ('RESOLVED','DISMISSED') then now() end
 where id=hid and crm.tenant_member(organization_id);
 if not found then raise exception 'Forbidden'; end if;
end $$;

-- Atomic scheduler, recoverable leases and conservative recovery after dispatch.
create function crm.claim_outreach() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; e crm.sequence_enrollments; s crm.outreach_steps; l crm.leads; begin
 update crm.automation_jobs set status='FAILED',last_error='dispatch_uncertain' where status='RUNNING'
 and locked_at<now()-interval '5 minutes' and dispatch_started_at is not null;
 insert into crm.human_handoffs(organization_id,lead_id,job_id,reason,priority,suggested_action)
 select organization_id,lead_id,id,'Envio com resultado incerto','HIGH','Conferir o provedor antes de qualquer novo envio.'
 from crm.automation_jobs where status='FAILED' and last_error='dispatch_uncertain' on conflict(job_id) do nothing;
 update crm.sequence_enrollments set status='PAUSED',stop_reason='dispatch_uncertain'
 where id in(select enrollment_id from crm.automation_jobs where status='FAILED' and last_error='dispatch_uncertain') and status='ACTIVE';
 update crm.automation_jobs set status=case when attempts>=max_attempts then 'FAILED' else 'PENDING' end,lease_token=null
 where status='RUNNING' and locked_at<now()-interval '5 minutes' and dispatch_started_at is null;
 update crm.sequence_enrollments set status='FAILED',stop_reason='attempts_exhausted' where status='ACTIVE' and id in
 (select enrollment_id from crm.automation_jobs where status='FAILED');
 insert into crm.automation_jobs(organization_id,enrollment_id,lead_id,job_type,idempotency_key,step_order)
 select enr.organization_id,enr.id,enr.lead_id,st.tipo,enr.id::text||':'||st.ordem,st.ordem
 from crm.sequence_enrollments enr join crm.outreach_sequences q on q.id=enr.sequence_id
 join crm.outreach_steps st on st.sequence_id=enr.sequence_id and st.ordem=enr.current_step
 where enr.status='ACTIVE' and q.status='ACTIVE' and enr.next_run_at<=now()
 on conflict(idempotency_key) do nothing;
 select a.* into j from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id
 join crm.outreach_sequences q on q.id=n.sequence_id
 where a.status='PENDING' and a.run_at<=now() and n.status='ACTIVE' and q.status='ACTIVE'
 order by a.run_at,a.id for update of a skip locked limit 1;
 if not found then return null; end if;
 update crm.automation_jobs set status='RUNNING',locked_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1
 where id=j.id returning * into j;
 select * into e from crm.sequence_enrollments where id=j.enrollment_id;
 select * into s from crm.outreach_steps where sequence_id=e.sequence_id and ordem=j.step_order;
 select * into l from crm.leads where id=e.lead_id and organization_id=e.organization_id;
 update crm.automation_jobs set payload=jsonb_build_object('recipient',l.email,'config',s.config) where id=j.id;
 return jsonb_build_object('id',j.id,'lease',j.lease_token,'kind',s.tipo,'config',s.config,'dry_run',e.dry_run,
 'organization_id',e.organization_id,'lead_id',l.id,'lead',jsonb_build_object('name',l.nome,'company',l.empresa,'email',l.email,'segment',l.segmento),
 'optout_token',j.optout_token,'idempotency_key',j.idempotency_key);
end $$;

-- Recheck eligibility immediately before any external send; serialize quota reservations.
create function crm.authorize_dispatch(jid bigint, token uuid) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; e crm.sequence_enrollments; l crm.leads; p crm.outreach_policy; local_time timestamp; reason text; begin
 select * into j from crm.automation_jobs where id=jid for update;
 if j.status<>'RUNNING' or j.lease_token is distinct from token or j.locked_at<now()-interval '4 minutes' or j.dispatch_started_at is not null then raise exception 'Invalid lease'; end if;
 select * into e from crm.sequence_enrollments where id=j.enrollment_id;
 select * into l from crm.leads where id=e.lead_id;
 select * into p from crm.outreach_policy where organization_id=e.organization_id for update;
 if not found then reason:='policy_missing';
 elsif e.status<>'ACTIVE' or not exists(select 1 from crm.outreach_sequences where id=e.sequence_id and status='ACTIVE') then reason:='paused';
 elsif not exists(select 1 from crm.organizations where id=e.organization_id and ativo) then reason:='organization_inactive';
 elsif l.opt_out or exists(select 1 from crm.suppression_list where organization_id=e.organization_id and lower(email)=lower(l.email)) then reason:='suppressed';
 elsif j.payload->>'recipient' is distinct from l.email then reason:='contact_changed';
 elsif j.job_type='EMAIL' then
   local_time:=now() at time zone p.timezone;
   if l.email is null or l.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then reason:='invalid_email';
   elsif not e.dry_run and (not p.live_enabled or p.sender is null) then reason:='live_disabled';
   elsif not e.dry_run and (l.email_verified_at is null or l.email_verified_at<now()-interval '30 days' or nullif(trim(l.contact_basis),'') is null or nullif(trim(l.contact_source),'') is null) then reason:='contact_review_required';
   elsif extract(isodow from local_time)>5 or extract(hour from local_time)<9 or extract(hour from local_time)>=18 then
     update crm.automation_jobs set status='PENDING',run_at=now()+interval '1 hour',lease_token=null where id=jid;
     return jsonb_build_object('allowed',false,'reason','business_hours');
   elsif not e.dry_run then
     -- Shared sender lock also bounds multiple organizations using the same mailbox.
     perform pg_advisory_xact_lock(hashtext(lower(p.sender)));
     if (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id where a.organization_id=e.organization_id and not n.dry_run and a.job_type='EMAIL' and a.dispatch_started_at>=date_trunc('day',now()))>=p.daily_limit
     or (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id join crm.outreach_policy x on x.organization_id=a.organization_id where lower(x.sender)=lower(p.sender) and not n.dry_run and a.job_type='EMAIL' and a.dispatch_started_at>=date_trunc('day',now()))>=p.mailbox_daily_limit then
       update crm.automation_jobs set status='PENDING',run_at=now()+interval '1 hour',lease_token=null where id=jid;
       return jsonb_build_object('allowed',false,'reason','daily_limit');
     end if;
   end if;
 end if;
 if reason is not null then
   update crm.automation_jobs set status='CANCELLED',last_error=reason where id=jid;
   update crm.sequence_enrollments set status='STOPPED',stop_reason=reason where id=e.id;
   insert into crm.human_handoffs(organization_id,lead_id,job_id,reason,suggested_action) values(e.organization_id,l.id,jid,reason,'Revisar elegibilidade do contato. Não reiniciar sem avaliação.') on conflict(job_id) do nothing;
   return jsonb_build_object('allowed',false,'reason',reason);
 end if;
 update crm.automation_jobs set dispatch_started_at=now() where id=jid;
 return jsonb_build_object('allowed',true,'sender',p.sender);
end $$;

create function crm.finish_outreach(jid bigint, token uuid, outcome text, message_id text default null, summary text default null) returns void
language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; e crm.sequence_enrollments; nxt crm.outreach_steps; begin
 select * into j from crm.automation_jobs where id=jid for update;
 if j.status<>'RUNNING' or j.lease_token is distinct from token then raise exception 'Stale lease'; end if;
 if outcome not in ('sent','simulated','wait','handoff','failed') then raise exception 'Invalid outcome'; end if;
 select * into e from crm.sequence_enrollments where id=j.enrollment_id for update;
 update crm.automation_jobs set status=case when outcome='failed' then 'FAILED' else 'DONE' end,
 provider_message_id=message_id,result=jsonb_build_object('outcome',outcome),last_error=case when outcome='failed' then 'provider_or_validation_failure' end where id=jid;
 if outcome in ('handoff','failed') then
   insert into crm.human_handoffs(organization_id,lead_id,job_id,reason,ai_summary,suggested_action)
   values(e.organization_id,e.lead_id,jid,case when outcome='failed' then 'Falha na automação' else 'Precisa de você' end,left(summary,2000),'Revisar o histórico e decidir o próximo contato.') on conflict(job_id) do nothing;
   update crm.sequence_enrollments set status='PAUSED',stop_reason=outcome where id=e.id and status='ACTIVE';
 elsif e.status='ACTIVE' then
   select * into nxt from crm.outreach_steps where sequence_id=e.sequence_id and ordem>e.current_step order by ordem limit 1;
   if not found then update crm.sequence_enrollments set status='COMPLETED',next_run_at=null where id=e.id;
   else update crm.sequence_enrollments set current_step=nxt.ordem,next_run_at=now()+make_interval(mins=>nxt.delay_minutes) where id=e.id; end if;
 end if;
end $$;

create function crm.suppress_contact(org uuid, address text, why text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 insert into crm.suppression_list(organization_id,email,reason,source) values(org,lower(trim(address)),why,'autonomous') on conflict do nothing;
 update crm.leads set opt_out=true where organization_id=org and lower(email)=lower(trim(address));
 update crm.sequence_enrollments set status='STOPPED',stop_reason=why where organization_id=org
 and lead_id in(select id from crm.leads where organization_id=org and lower(email)=lower(trim(address))) and status in ('ACTIVE','PAUSED');
 update crm.automation_jobs set status='CANCELLED',last_error=why where enrollment_id in
 (select id from crm.sequence_enrollments where organization_id=org and stop_reason=why and status='STOPPED') and status='PENDING';
end $$;
create function crm.unsubscribe_outreach(token uuid) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ declare j crm.automation_jobs; address text; begin
 select * into j from crm.automation_jobs where optout_token=token;
 if not found then return; end if;
 address:=j.payload->>'recipient';
 perform crm.suppress_contact(j.organization_id,address,'unsubscribe');
end $$;

create function crm.record_outreach_event(event_id text, mid text, kind text, happened timestamptz) returns void
language plpgsql security definer set search_path=crm,pg_temp as $$ declare j crm.automation_jobs; address text; begin
 if kind not in ('email.sent','email.delivered','email.opened','email.clicked','email.bounced','email.complained','reply','meeting') then return; end if;
 select * into j from crm.automation_jobs where provider_message_id=mid;
 if not found then raise exception 'Message not yet correlated'; end if;
 insert into crm.message_events(organization_id,lead_id,enrollment_id,provider,provider_message_id,provider_event_id,event_type,occurred_at)
 values(j.organization_id,j.lead_id,j.enrollment_id,'resend',mid,event_id,kind,happened) on conflict do nothing;
 if not found then return; end if;
 if kind in ('email.bounced','email.complained') then
 address:=j.payload->>'recipient';
 perform crm.suppress_contact(j.organization_id,address,kind);
 end if;
 if kind in ('reply','meeting','email.bounced','email.complained') then
 update crm.sequence_enrollments set status='STOPPED',stop_reason=kind where lead_id=j.lead_id and organization_id=j.organization_id and status in ('ACTIVE','PAUSED');
 insert into crm.human_handoffs(organization_id,lead_id,job_id,reason,priority,suggested_action)
 values(j.organization_id,j.lead_id,j.id,kind,'HIGH','Revisar resposta ou evento antes de retomar contato.') on conflict(job_id) do update set reason=excluded.reason,priority='HIGH',status='OPEN';
 end if;
end $$;

-- All newly created functions default to PUBLIC execute unless explicitly revoked.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='crm' and p.proname in ('create_cadence','set_cadence_state','enroll_lead','resolve_handoff','claim_outreach','authorize_dispatch','finish_outreach','suppress_contact','unsubscribe_outreach','record_outreach_event') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 if f.proname in ('create_cadence','set_cadence_state','enroll_lead','resolve_handoff') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
commit;
