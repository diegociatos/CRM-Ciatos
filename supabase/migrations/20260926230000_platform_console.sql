-- Owner console: private administration, no payment provider or outbound activation.
begin;
create table crm.platform_plans(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 2 and 100),
 monthly_cents integer not null default 0 check(monthly_cents>=0),annual_cents integer not null default 0 check(annual_cents>=0),
 max_users integer check(max_users>0),max_leads integer check(max_leads>0),active boolean not null default true,
 description text not null default '',created_at timestamptz not null default now());
create table crm.platform_accounts(
 organization_id uuid primary key references crm.organizations(id),plan_id uuid references crm.platform_plans(id),
 status text not null default 'internal' check(status in ('internal','trial','active','past_due','suspended','cancelled')),
 billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','annual')),
 price_cents integer not null default 0 check(price_cents>=0),trial_ends_on date,next_billing_on date,
 billing_email text not null default '',notes text not null default '',onboarding text not null default 'pending' check(onboarding in ('pending','ready')),
 updated_at timestamptz not null default now());
insert into crm.platform_accounts(organization_id,onboarding) select id,'ready' from crm.organizations;
create table crm.platform_invoices(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references crm.organizations(id),reference text not null,
 description text not null,amount_cents integer not null check(amount_cents>0),due_on date not null,
 status text not null default 'pending' check(status in ('pending','paid','void')),paid_at timestamptz,
 notes text not null default '',created_at timestamptz not null default now(),unique(organization_id,reference));
create table crm.platform_tickets(
 id uuid primary key default gen_random_uuid(),organization_id uuid references crm.organizations(id),subject text not null,
 body text not null default '',priority text not null default 'normal' check(priority in ('low','normal','high')),
 status text not null default 'open' check(status in ('open','in_progress','resolved')),resolution text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table crm.platform_settings(id boolean primary key default true check(id),data jsonb not null default '{}');
insert into crm.platform_settings values(true,'{"product_name":"Ciatos CRM","support_email":"","terms_url":"","privacy_url":"","commercial_notes":""}');
create table crm.platform_audit(id bigint generated always as identity primary key,actor uuid references crm.profiles(id),
 action text not null,entity_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['platform_plans','platform_accounts','platform_invoices','platform_tickets','platform_settings','platform_audit'] loop
 execute format('alter table crm.%I enable row level security',t);
 execute format('revoke all on crm.%I from public,anon,authenticated',t);
 execute format('grant all on crm.%I to service_role',t);
 end loop;end $$;
create function crm.company_available(org uuid) returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select exists(select 1 from crm.organizations o left join crm.platform_accounts a on a.organization_id=o.id
 where o.id=org and o.ativo and coalesce(a.status,'internal') not in ('suspended','cancelled')
 and (a.status is distinct from 'trial' or a.trial_ends_on>=current_date))
$$;
create or replace function crm.tenant_member(org uuid,admin_only boolean default false) returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select crm.password_ready() and crm.company_available(org) and exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
 where m.organization_id=org and m.user_id=auth.uid() and m.ativo and p.ativo and (not admin_only or m.papel='ADMIN'))
$$;
-- Enforce contracted limits in the database, including direct API requests and imports.
create function crm.platform_limit_guard() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$
 declare cap integer;used bigint;begin
 if tg_table_name='organization_members' then
 if not new.ativo or (tg_op='UPDATE' and old.ativo) then return new;end if;
 if tg_op='INSERT' and exists(select 1 from crm.organization_members where organization_id=new.organization_id and user_id=new.user_id and ativo) then return new;end if;
 end if;
 perform 1 from crm.organizations where id=new.organization_id for update;
 if tg_table_name='leads' then
 select p.max_leads into cap from crm.platform_accounts a join crm.platform_plans p on p.id=a.plan_id where a.organization_id=new.organization_id;
 select count(*) into used from crm.leads where organization_id=new.organization_id;
 else
 select p.max_users into cap from crm.platform_accounts a join crm.platform_plans p on p.id=a.plan_id where a.organization_id=new.organization_id;
 select count(*) into used from crm.organization_members where organization_id=new.organization_id and ativo;
 end if;
 if cap is not null and used>=cap then raise exception 'Limite do plano atingido. Solicite um ajuste ao administrador da plataforma.';end if;
 return new;end $$;
create trigger platform_limit before insert on crm.leads for each row execute function crm.platform_limit_guard();
create trigger platform_limit before insert or update of ativo on crm.organization_members for each row execute function crm.platform_limit_guard();

create function crm.platform_console(action text default 'snapshot',payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path=crm,pg_temp as $$
 declare target uuid;org uuid;person uuid;result jsonb;previous jsonb;vstatus text;vrole text;master boolean;enabled boolean;plan crm.platform_plans;cnt bigint;tax text;
 begin
 if not crm.platform_admin() then raise exception 'Acesso exclusivo do dono da plataforma.';end if;
 if payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>16000 then raise exception 'Dados inválidos.';end if;
 if action='snapshot' then
 return jsonb_build_object(
 'clients',coalesce((select jsonb_agg(x order by x.nome) from (select o.id,o.nome,o.registration,o.branding,o.ativo,o.created_at,
 coalesce(to_jsonb(a)-'organization_id','{}') account,p.name plan_name,
 (select string_agg(pr.email,', ' order by pr.email) from crm.organization_members m join crm.profiles pr on pr.id=m.user_id where m.organization_id=o.id and m.ativo and m.is_master and pr.ativo) master_email,
 (select count(*) from crm.organization_members m where m.organization_id=o.id and m.ativo) active_users,
 (select count(*) from crm.leads l where l.organization_id=o.id) lead_count,
 p.max_users,p.max_leads,crm.company_available(o.id) available
 from crm.organizations o left join crm.platform_accounts a on a.organization_id=o.id left join crm.platform_plans p on p.id=a.plan_id) x),'[]'),
 'plans',coalesce((select jsonb_agg(p order by p.name) from crm.platform_plans p),'[]'),
 'invoices',coalesce((select jsonb_agg(i order by i.created_at desc) from crm.platform_invoices i),'[]'),
 'tickets',coalesce((select jsonb_agg(t order by t.updated_at desc) from crm.platform_tickets t),'[]'),
 'settings',(select data from crm.platform_settings where id),
 'audit',coalesce((select jsonb_agg(x order by x.id desc) from (select a.*,p.email actor_email from crm.platform_audit a left join crm.profiles p on p.id=a.actor order by a.id desc limit 200) x),'[]'));
 elsif action='members' then
 org:=(payload->>'organization_id')::uuid;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'email',p.email,'role',m.operating_role,'is_master',m.is_master,'active',m.ativo,'profile_active',p.ativo) order by p.nome)
 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org),'[]');
 elsif action='client_save' then
 target:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 if length(trim(coalesce(payload->>'name','')))<2 or length(payload->>'name')>120 then raise exception 'Informe o nome da empresa.';end if;
 tax:=regexp_replace(coalesce(payload->>'cnpj',''),'[^0-9]','','g');
 if tax<>'' and length(tax)<>14 then raise exception 'CNPJ deve conter 14 dígitos.';end if;
 perform pg_advisory_xact_lock(hashtext('platform-cnpj:'||tax));
 if tax<>'' and exists(select 1 from crm.organizations where id<>target and regexp_replace(registration->>'cnpj','[^0-9]','','g')=tax) then raise exception 'Já existe uma empresa com este CNPJ.';end if;
 if coalesce(payload->>'color','#123039') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida.';end if;
 select to_jsonb(o) into previous from crm.organizations o where id=target for update;
 insert into crm.organizations(id,nome,slug,registration,branding) values(target,trim(payload->>'name'),'empresa-'||target,
 jsonb_build_object('legalName',left(coalesce(payload->>'legalName',''),160),'cnpj',case when tax='' then '' else substr(tax,1,2)||'.'||substr(tax,3,3)||'.'||substr(tax,6,3)||'/'||substr(tax,9,4)||'-'||substr(tax,13,2) end,'email',left(coalesce(payload->>'email',''),160),'phone',left(coalesce(payload->>'phone',''),30)),
 jsonb_build_object('display_name',left(coalesce(payload->>'brand_name',''),80),'color',coalesce(payload->>'color','#123039')))
 on conflict(id) do update set nome=excluded.nome,registration=excluded.registration,branding=excluded.branding,updated_at=now();
 insert into crm.platform_accounts(organization_id) values(target) on conflict do nothing;
 insert into crm.config(organization_id,id) values(target,1) on conflict do nothing;
 insert into crm.outreach_policy(organization_id) values(target) on conflict do nothing;
 result:=jsonb_build_object('id',target);
 elsif action='plan_save' then
 target:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 select * into plan from crm.platform_plans where id=target for update;
 perform 1 from crm.organizations where id in(select organization_id from crm.platform_accounts where plan_id=target) order by id for update;
 if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do plano.';end if;
 if exists(select 1 from crm.platform_accounts a where a.plan_id=target and
 ((nullif(payload->>'max_users','')::int is not null and (select count(*) from crm.organization_members m where m.organization_id=a.organization_id and m.ativo)>nullif(payload->>'max_users','')::int)
 or (nullif(payload->>'max_leads','')::int is not null and (select count(*) from crm.leads l where l.organization_id=a.organization_id)>nullif(payload->>'max_leads','')::int))) then raise exception 'O limite é menor que o uso de um cliente deste plano.';end if;
 insert into crm.platform_plans(id,name,monthly_cents,annual_cents,max_users,max_leads,active,description)
 values(target,trim(payload->>'name'),(payload->>'monthly_cents')::int,(payload->>'annual_cents')::int,nullif(payload->>'max_users','')::int,nullif(payload->>'max_leads','')::int,coalesce((payload->>'active')::boolean,true),left(coalesce(payload->>'description',''),2000))
 on conflict(id) do update set name=excluded.name,monthly_cents=excluded.monthly_cents,annual_cents=excluded.annual_cents,max_users=excluded.max_users,max_leads=excluded.max_leads,active=excluded.active,description=excluded.description;
 result:=jsonb_build_object('id',target);
 elsif action='account_save' then
 target:=(payload->>'organization_id')::uuid;
 perform 1 from crm.organizations where id=target for update;if not found then raise exception 'Empresa não encontrada.';end if;
 vstatus:=payload->>'status';
 if target='00000000-0000-4000-8000-000000000001' and vstatus in ('suspended','cancelled') then raise exception 'O espaço original do proprietário não pode ser suspenso por este painel.';end if;
 if vstatus='trial' and nullif(payload->>'trial_ends_on','')::date is null then raise exception 'Informe o fim do teste.';end if;
 select * into plan from crm.platform_plans where id=nullif(payload->>'plan_id','')::uuid;
 if nullif(payload->>'plan_id','') is not null and (plan.id is null or (not plan.active and not exists(select 1 from crm.platform_accounts where organization_id=target and plan_id=plan.id))) then raise exception 'Selecione um plano ativo.';end if;
 if vstatus in ('active','trial','past_due') and plan.id is null then raise exception 'Selecione o plano contratado.';end if;
 if plan.max_users is not null and (select count(*) from crm.organization_members where organization_id=target and ativo)>plan.max_users then raise exception 'O plano não comporta os usuários ativos.';end if;
 if plan.max_leads is not null and (select count(*) from crm.leads where organization_id=target)>plan.max_leads then raise exception 'O plano não comporta os contatos existentes.';end if;
 select to_jsonb(a) into previous from crm.platform_accounts a where organization_id=target;
 insert into crm.platform_accounts(organization_id,plan_id,status,billing_cycle,price_cents,trial_ends_on,next_billing_on,billing_email,notes,onboarding)
 values(target,plan.id,vstatus,payload->>'billing_cycle',(payload->>'price_cents')::int,nullif(payload->>'trial_ends_on','')::date,nullif(payload->>'next_billing_on','')::date,left(coalesce(payload->>'billing_email',''),160),left(coalesce(payload->>'notes',''),4000),payload->>'onboarding')
 on conflict(organization_id) do update set plan_id=excluded.plan_id,status=excluded.status,billing_cycle=excluded.billing_cycle,price_cents=excluded.price_cents,trial_ends_on=excluded.trial_ends_on,next_billing_on=excluded.next_billing_on,billing_email=excluded.billing_email,notes=excluded.notes,onboarding=excluded.onboarding,updated_at=now();
 if vstatus in ('suspended','cancelled') then
 update crm.sequence_enrollments set status='PAUSED',stop_reason='platform_'||vstatus where organization_id=target and status='ACTIVE';
 end if;
 result:=jsonb_build_object('id',target);
 elsif action='member_save' then
 org:=(payload->>'organization_id')::uuid;person:=(payload->>'user_id')::uuid;target:=org;
 vrole:=payload->>'role';master:=coalesce((payload->>'is_master')::boolean,false);enabled:=coalesce((payload->>'active')::boolean,true);
 if vrole not in ('ADMIN','MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING') then raise exception 'Perfil inválido.';end if;
 if person=auth.uid() then raise exception 'Não altere seu próprio vínculo pelo painel.';end if;
 perform 1 from crm.organizations where id=org for update;
 if not exists(select 1 from crm.profiles where id=person and ativo) then raise exception 'Usuário inválido ou inativo.';end if;
 if exists(select 1 from crm.organization_members where organization_id=org and user_id=person and is_master and ativo) and (not master or not enabled)
 and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id<>person and m.is_master and m.ativo and p.ativo) then raise exception 'Defina outro master antes de remover o último.';end if;
 insert into crm.organization_members(organization_id,user_id,papel,operating_role,ativo,is_master) values(org,person,case when master or vrole='ADMIN' then 'ADMIN' else 'MEMBER' end,case when master then 'ADMIN' else vrole end,enabled,master)
 on conflict(organization_id,user_id) do update set papel=excluded.papel,operating_role=excluded.operating_role,ativo=excluded.ativo,is_master=excluded.is_master;
 result:='{"ok":true}';
 elsif action='invoice_save' then
 target:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());org:=(payload->>'organization_id')::uuid;
 select to_jsonb(i) into previous from crm.platform_invoices i where id=target for update;
 if previous is not null and (previous->>'organization_id')::uuid<>org then raise exception 'Empresa da cobrança não pode ser alterada.';end if;
 vstatus:=payload->>'status';
 if previous->>'status' in ('paid','void') and (vstatus<>'void' or length(trim(coalesce(payload->>'notes','')))<5) then raise exception 'Registro liquidado só pode ser cancelado com justificativa.';end if;
 if length(trim(coalesce(payload->>'reference','')))<1 or length(trim(coalesce(payload->>'description','')))<2 then raise exception 'Informe referência e descrição.';end if;
 insert into crm.platform_invoices(id,organization_id,reference,description,amount_cents,due_on,status,paid_at,notes)
 values(target,org,left(payload->>'reference',80),left(payload->>'description',500),(payload->>'amount_cents')::int,(payload->>'due_on')::date,vstatus,case when vstatus='paid' then now() end,left(coalesce(payload->>'notes',''),2000))
 on conflict(id) do update set status=excluded.status,paid_at=case when excluded.status='paid' then coalesce(crm.platform_invoices.paid_at,now()) else crm.platform_invoices.paid_at end,
 reference=case when crm.platform_invoices.status='pending' then excluded.reference else crm.platform_invoices.reference end,
 description=case when crm.platform_invoices.status='pending' then excluded.description else crm.platform_invoices.description end,
 amount_cents=case when crm.platform_invoices.status='pending' then excluded.amount_cents else crm.platform_invoices.amount_cents end,
 due_on=case when crm.platform_invoices.status='pending' then excluded.due_on else crm.platform_invoices.due_on end,notes=excluded.notes;
 result:=jsonb_build_object('id',target);
 elsif action='ticket_save' then
 target:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 if length(trim(coalesce(payload->>'subject','')))<3 then raise exception 'Informe o assunto.';end if;
 if payload->>'status'='resolved' and length(trim(coalesce(payload->>'resolution','')))<3 then raise exception 'Descreva a resolução.';end if;
 insert into crm.platform_tickets(id,organization_id,subject,body,priority,status,resolution)
 values(target,nullif(payload->>'organization_id','')::uuid,left(payload->>'subject',160),left(coalesce(payload->>'body',''),4000),payload->>'priority',payload->>'status',left(coalesce(payload->>'resolution',''),4000))
 on conflict(id) do update set organization_id=excluded.organization_id,subject=excluded.subject,body=excluded.body,priority=excluded.priority,status=excluded.status,resolution=excluded.resolution,updated_at=now();
 result:=jsonb_build_object('id',target);
 elsif action='settings_save' then
 if length(trim(coalesce(payload->>'product_name','')))<2 then raise exception 'Informe o nome do produto.';end if;
 if (coalesce(payload->>'terms_url','')<>'' and payload->>'terms_url' !~ '^https://') or (coalesce(payload->>'privacy_url','')<>'' and payload->>'privacy_url' !~ '^https://') then raise exception 'Use links HTTPS.';end if;
 update crm.platform_settings set data=jsonb_build_object('product_name',left(payload->>'product_name',100),'support_email',left(coalesce(payload->>'support_email',''),160),'terms_url',left(coalesce(payload->>'terms_url',''),500),'privacy_url',left(coalesce(payload->>'privacy_url',''),500),'commercial_notes',left(coalesce(payload->>'commercial_notes',''),4000)) where id;
 result:='{"ok":true}';
 else raise exception 'Ação desconhecida.';
 end if;
 insert into crm.platform_audit(actor,action,entity_id,details) values(auth.uid(),action,target,
 jsonb_strip_nulls(jsonb_build_object('status',vstatus,'previous_status',previous->>'status','role',vrole,'master',master,'enabled',enabled,'user_id',person,'name',left(payload->>'name',120),'plan_id',payload->>'plan_id','price_cents',payload->>'price_cents','monthly_cents',payload->>'monthly_cents','annual_cents',payload->>'annual_cents','max_users',payload->>'max_users','max_leads',payload->>'max_leads','amount_cents',payload->>'amount_cents')));
 return result;
 end $$;
revoke all on function crm.company_available(uuid),crm.platform_limit_guard(),crm.platform_console(text,jsonb) from public,anon;
grant execute on function crm.company_available(uuid),crm.platform_console(text,jsonb) to authenticated,service_role;

create or replace function crm.claim_outreach() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
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
 where crm.company_available(enr.organization_id) and enr.status='ACTIVE' and q.status='ACTIVE' and enr.next_run_at<=now()
 on conflict(idempotency_key) do nothing;
 select a.* into j from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id
 join crm.outreach_sequences q on q.id=n.sequence_id
 where crm.company_available(a.organization_id) and a.status='PENDING' and a.run_at<=now() and n.status='ACTIVE' and q.status='ACTIVE'
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

create or replace function crm.authorize_dispatch(jid bigint, token uuid) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; e crm.sequence_enrollments; l crm.leads; p crm.outreach_policy; local_time timestamp; reason text; begin
 select * into j from crm.automation_jobs where id=jid for update;
 if j.status<>'RUNNING' or j.lease_token is distinct from token or j.locked_at<now()-interval '4 minutes' or j.dispatch_started_at is not null then raise exception 'Invalid lease'; end if;
 select * into e from crm.sequence_enrollments where id=j.enrollment_id;
 select * into l from crm.leads where id=e.lead_id;
 select * into p from crm.outreach_policy where organization_id=e.organization_id for update;
 if not found then reason:='policy_missing';
 elsif e.status<>'ACTIVE' or not exists(select 1 from crm.outreach_sequences where id=e.sequence_id and status='ACTIVE') then reason:='paused';
 elsif not crm.company_available(e.organization_id) then reason:='organization_inactive';
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

drop function crm.my_companies();
create function crm.my_companies() returns table(id uuid,nome text,registration jsonb,operating_role text,can_manage boolean,can_platform boolean,is_master boolean,branding jsonb)
 language sql stable security definer set search_path=crm,pg_temp as $$
 select o.id,o.nome,o.registration,m.operating_role,crm.can_manage_company(o.id),crm.platform_admin(),m.is_master,o.branding from crm.organizations o
 join crm.organization_members m on m.organization_id=o.id and m.user_id=auth.uid() where crm.tenant_member(o.id) order by o.nome
$$;
revoke all on function crm.my_companies() from public,anon;
grant execute on function crm.my_companies() to authenticated,service_role;
notify pgrst,'reload schema';
commit;
