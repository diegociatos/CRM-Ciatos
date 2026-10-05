begin;
alter table crm.enrichment_requests drop constraint enrichment_requests_kind_check;
alter table crm.enrichment_requests add constraint enrichment_requests_kind_check check(kind in ('discover','verify','reveal'));
-- Additive and opt-in: existing campaigns and policies are never activated here.
create table crm.sdr_settings (
 organization_id uuid primary key references crm.organizations(id) on delete cascade,
 enabled boolean not null default false,
 sequence_id uuid references crm.outreach_sequences(id),
 simulate boolean not null default true,
 contact_basis text not null default '',
 notify_email text not null default '',
 tracking_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table crm.sdr_queue (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crm.organizations(id),
 mining_lead_id uuid unique references crm.mining_leads(id) on delete set null,
 lead_id uuid not null, sequence_id uuid not null references crm.outreach_sequences(id),
 simulate boolean not null, status text not null default 'PENDING' check(status in ('PENDING','RUNNING','ENROLLED','REVIEW','STOPPED')),
 lease uuid, locked_at timestamptz, next_at timestamptz not null default now(), attempts integer not null default 0,
 reason text, created_at timestamptz not null default now(),
 foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade,
 unique(lead_id,sequence_id)
);
create table crm.sdr_alerts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crm.organizations(id),
 lead_id uuid not null, event_id text not null unique, kind text not null check(kind in ('hot','review','opt_out','automatic')),
 summary text not null, created_at timestamptz not null default now(),
 mail_status text not null default 'PENDING' check(mail_status in ('PENDING','SENDING','SENT','REVIEW','SKIPPED')),
 mail_lease uuid, mail_started_at timestamptz,
 foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade
);
create table crm.sdr_alert_reads (
 alert_id uuid not null references crm.sdr_alerts(id) on delete cascade,
 user_id uuid not null references crm.profiles(id) on delete cascade,
 primary key(alert_id,user_id)
);
create table crm.sdr_mail_cursor (mailbox text primary key, watermark timestamptz not null default now(), next_path text, last_error text, updated_at timestamptz not null default now());
create table crm.sdr_worker_state(id integer primary key check(id=1),lease uuid,locked_at timestamptz,finished_at timestamptz,status jsonb not null default '{}');
insert into crm.sdr_worker_state(id) values(1);
alter table crm.sdr_worker_state enable row level security;
grant all on crm.sdr_worker_state to service_role;
alter table crm.sdr_mail_cursor add column lease uuid, add column locked_at timestamptz;
alter table crm.automation_jobs add column tracking_token uuid not null default gen_random_uuid();
create unique index automation_tracking_token on crm.automation_jobs(tracking_token);
alter table crm.automation_jobs add column reply_token uuid not null default gen_random_uuid();
create unique index automation_reply_token on crm.automation_jobs(reply_token);
alter table crm.automation_jobs add column opened_at timestamptz;
alter table crm.human_handoffs add column sdr_event_id text unique;
do $$ declare t text; begin
 foreach t in array array['sdr_settings','sdr_queue','sdr_alerts'] loop
 execute format('alter table crm.%I enable row level security',t);
 execute format('create policy tenant_read on crm.%I for select to authenticated using(crm.tenant_member(organization_id))',t);
 execute format('grant select on crm.%I to authenticated',t);
 execute format('grant all on crm.%I to service_role',t);
 end loop;
end $$;
alter table crm.sdr_alert_reads enable row level security;
alter table crm.sdr_mail_cursor enable row level security;
create policy own_reads on crm.sdr_alert_reads for select to authenticated using(user_id=auth.uid());
grant select on crm.sdr_alert_reads to authenticated;
grant all on crm.sdr_alert_reads,crm.sdr_mail_cursor to service_role;

create function crm.save_sdr_settings(org uuid, active boolean, sid uuid, simulation boolean, basis text, recipient text, tracking boolean)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if sid is not null and not exists(select 1 from crm.outreach_sequences where id=sid and organization_id=org and settings->>'publico'='prospect') then raise exception 'Escolha uma cadência de prospecção desta empresa.'; end if;
 if active and (sid is null or length(trim(basis)) not between 10 and 500 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Informe cadência, finalidade/base avaliada e destinatário dos alertas.'; end if;
 if length(recipient)>254 or length(basis)>500 then raise exception 'Configuração inválida'; end if;
 if active and not exists(select 1 from crm.outreach_sequences where id=sid and status='ACTIVE') then raise exception 'Ative a cadência antes de ligar o agente.'; end if;
 insert into crm.sdr_settings values(org,active,sid,simulation,trim(basis),lower(trim(recipient)),tracking,now())
 on conflict(organization_id) do update set enabled=excluded.enabled,sequence_id=excluded.sequence_id,simulate=excluded.simulate,
 contact_basis=excluded.contact_basis,notify_email=excluded.notify_email,tracking_enabled=excluded.tracking_enabled,updated_at=now();
 if not active then
 update crm.sequence_enrollments set status='PAUSED',stop_reason='agent_paused' where organization_id=org and context->>'source'='sdr' and status='ACTIVE';
 end if;
end $$;
create function crm.install_sdr_library(org uuid, library jsonb) returns integer language plpgsql security definer set search_path=crm,pg_temp as $$
declare item jsonb; sid uuid; n integer:=0; begin
 if not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if jsonb_typeof(library)<>'array' or jsonb_array_length(library)>20 then raise exception 'Invalid library'; end if;
 perform pg_advisory_xact_lock(hashtext(org::text||':sdr_library'));
 for item in select * from jsonb_array_elements(library) loop
 if nullif(item->>'id','') is null then raise exception 'Invalid library key'; end if;
 if exists(select 1 from crm.outreach_sequences where organization_id=org and settings->>'library_key'=item->>'id') then continue; end if;
 sid:=crm.create_cadence_v2(org,item->>'titulo','prospect',item->'passos',5);
 update crm.outreach_sequences set settings=settings||jsonb_build_object('library_key',item->>'id','service',item->>'name') where id=sid;
 -- Silence after the final waiting period is not a hot lead or a human task.
 update crm.outreach_steps set tipo='WAIT',config='{}' where sequence_id=sid and tipo='NOTIFY_HUMAN';
 n:=n+1;
 end loop;return n;
end $$;

-- Durable Radar-to-lead transfer. Only opted-in organizations, preserving original data.
create function crm.prepare_sdr_queue() returns integer language plpgsql security definer set search_path=crm,pg_temp as $$
declare m record; lid uuid; n integer:=0; begin
 for m in select ml.*,s.sequence_id,s.simulate,s.contact_basis from crm.mining_leads ml
 join crm.sdr_settings s on s.organization_id=ml.organization_id and s.enabled
 join crm.organizations o on o.id=s.organization_id and o.ativo
 join crm.outreach_sequences seq on seq.id=s.sequence_id and seq.status='ACTIVE'
 where not ml.imported and not exists(select 1 from crm.sdr_queue q where q.mining_lead_id=ml.id)
 order by ml.created_at for update of ml skip locked limit 10 loop
   select id into lid from crm.leads where organization_id=m.organization_id and nullif(cnpj_raw,'')=nullif(m.cnpj_raw,'') limit 1;
   if lid is null then
     insert into crm.leads(organization_id,nome,empresa,email,telefone,cnpj_raw,segmento,cidade,uf,dados,contact_basis,contact_source,relacao)
     values(m.organization_id,coalesce(m.dados->>'contactName',''),coalesce(m.dados->>'tradeName',m.dados->>'name'),
       case when m.dados->>'emailCompany' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then lower(m.dados->>'emailCompany') else '' end,
       coalesce(m.dados->>'phoneCompany',m.dados->>'phone'),m.cnpj_raw,m.dados->>'segment',m.dados->>'city',m.dados->>'state',m.dados,
       m.contact_basis,'Radar '||m.job_id||' · '||left(coalesce(m.dados->'sources','[]')::text,800),'prospect') returning id into lid;
   end if;
   insert into crm.sdr_queue(organization_id,mining_lead_id,lead_id,sequence_id,simulate) values(m.organization_id,m.id,lid,m.sequence_id,m.simulate) on conflict do nothing;
   update crm.mining_leads set imported=true where id=m.id;
   n:=n+1;
 end loop;
 return n;
end $$;

create function crm.claim_sdr_lead() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare q crm.sdr_queue; l crm.leads; begin
 update crm.sdr_queue set status='REVIEW',reason='Tempo de enriquecimento excedido; revisar antes de repetir.' where status='RUNNING' and locked_at<now()-interval '5 minutes';
 select a.* into q from crm.sdr_queue a join crm.sdr_settings s on s.organization_id=a.organization_id and s.enabled
 join crm.organizations o on o.id=a.organization_id and o.ativo
 where a.status='PENDING' and a.next_at<=now() order by a.next_at for update of a skip locked limit 1;
 if not found then return null; end if;
 select * into l from crm.leads where id=q.lead_id;
 if l.opt_out or exists(select 1 from crm.suppression_list where organization_id=q.organization_id and lower(email)=lower(l.email)) then
 update crm.sdr_queue set status='STOPPED',reason='Não contatar' where id=q.id; return null; end if;
 update crm.sdr_queue set status='RUNNING',lease=gen_random_uuid(),locked_at=now(),attempts=attempts+1 where id=q.id returning * into q;
 return to_jsonb(q)||jsonb_build_object('lead',to_jsonb(l));
end $$;

create function crm.finish_sdr_lead(qid uuid, token uuid, outcome text, detail text default null) returns void
language plpgsql security definer set search_path=crm,pg_temp as $$ declare q crm.sdr_queue; l crm.leads; begin
 select * into q from crm.sdr_queue where id=qid for update;
 if q.status<>'RUNNING' or q.lease is distinct from token then raise exception 'Stale lease'; end if;
 if outcome not in ('PENDING','REVIEW','ENROLLED','STOPPED') then raise exception 'Invalid outcome'; end if;
 if outcome='ENROLLED' then
   select * into l from crm.leads where id=q.lead_id;
   if l.opt_out or l.relacao<>'prospect' or (not q.simulate and (l.email_verified_at is null or l.email_verified_at<now()-interval '30 days'))
   or nullif(l.email,'') is null or nullif(l.contact_basis,'') is null or nullif(l.contact_source,'') is null
   or not exists(select 1 from crm.sdr_settings where organization_id=q.organization_id and enabled)
   or not exists(select 1 from crm.outreach_sequences where id=q.sequence_id and organization_id=q.organization_id and status='ACTIVE')
   or exists(select 1 from crm.suppression_list where organization_id=q.organization_id and lower(email)=lower(l.email))
   or exists(select 1 from crm.sequence_enrollments where lead_id=l.id and status in ('ACTIVE','PAUSED')) then
      outcome:='REVIEW'; detail:='Contato inelegível ou já tem cadência em andamento.';
   else
     insert into crm.sequence_enrollments(organization_id,sequence_id,lead_id,dry_run,next_run_at,context)
     values(q.organization_id,q.sequence_id,q.lead_id,q.simulate,now(),'{"source":"sdr"}') on conflict(sequence_id,lead_id) do nothing;
   end if;
 end if;
 update crm.sdr_queue set status=case when outcome='PENDING' and attempts>=120 then 'REVIEW' else outcome end,
 reason=left(detail,500),next_at=now()+interval '2 minutes',lease=null where id=qid;
end $$;

-- The public pixel records only a first possible open. Never increases intent or sends an alert.
create function crm.record_sdr_open(pixel uuid) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; begin
 update crm.automation_jobs a set opened_at=now() from crm.sequence_enrollments e,crm.sdr_settings s
 where a.tracking_token=pixel and a.enrollment_id=e.id and not e.dry_run and s.organization_id=a.organization_id
 and s.tracking_enabled and a.dispatch_started_at is not null and a.opened_at is null returning a.* into j;
 if found then insert into crm.message_events(organization_id,lead_id,enrollment_id,provider,provider_message_id,event_type,metadata)
 values(j.organization_id,j.lead_id,j.enrollment_id,'crm-pixel',j.id::text,'email.opened','{"reliability":"possible_open_not_intent"}') on conflict do nothing; end if;
end $$;

create function crm.record_sdr_reply(jid bigint, event_key text, category text, summary text) returns void
language plpgsql security definer set search_path=crm,pg_temp as $$ declare j crm.automation_jobs; begin
 select * into j from crm.automation_jobs where id=jid for update;
 if not found or category not in ('hot','review','opt_out','automatic') or length(event_key)>500 then raise exception 'Invalid reply'; end if;
 if not exists(select 1 from crm.sequence_enrollments where id=j.enrollment_id and not dry_run) then raise exception 'Simulated message'; end if;
 insert into crm.sdr_alerts(organization_id,lead_id,event_id,kind,summary,mail_status)
 values(j.organization_id,j.lead_id,event_key,category,left(summary,2000),case when category='hot' then 'PENDING' else 'SKIPPED' end) on conflict(event_id) do nothing;
 if not found then return; end if;
 if category='opt_out' then perform crm.suppress_contact(j.organization_id,j.payload->>'recipient','reply_opt_out'); update crm.leads set opt_out=true where id=j.lead_id; end if;
 if category<>'automatic' then
 update crm.sequence_enrollments set status='STOPPED',stop_reason='reply_'||category where lead_id=j.lead_id and status in ('ACTIVE','PAUSED');
 insert into crm.human_handoffs(organization_id,lead_id,reason,priority,ai_summary,suggested_action,sdr_event_id)
 values(j.organization_id,j.lead_id,case when category='hot' then 'Lead quente: interesse em conversar' else 'Resposta recebida: revisar' end,
 case when category='hot' then 'HIGH' else 'NORMAL' end,left(summary,2000),'Abra o cadastro para conferir o contexto e os contatos.',event_key) on conflict(sdr_event_id) do nothing;
 end if;
end $$;

create function crm.sdr_notifications(org uuid) returns jsonb language sql stable security definer set search_path=crm,pg_temp as $$
 select coalesce(jsonb_agg(x),'[]') from (select a.id,a.lead_id,a.kind,a.summary,a.created_at,l.empresa,l.nome,l.email,l.telefone,
 exists(select 1 from crm.sdr_alert_reads r where r.alert_id=a.id and r.user_id=auth.uid()) as read
 from crm.sdr_alerts a join crm.leads l on l.id=a.lead_id where a.organization_id=org and crm.tenant_member(org) and a.kind in ('hot','review') order by a.created_at desc limit 100) x
$$;
create function crm.read_sdr_notification(aid uuid) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 insert into crm.sdr_alert_reads select aid,auth.uid() from crm.sdr_alerts where id=aid and crm.tenant_member(organization_id) on conflict do nothing;
end $$;

create function crm.claim_sdr_alert() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare a crm.sdr_alerts; l crm.leads; p crm.outreach_policy; dest text; begin
 update crm.sdr_alerts set mail_status='REVIEW' where mail_status='SENDING' and mail_started_at<now()-interval '5 minutes';
 select x.* into a from crm.sdr_alerts x join crm.sdr_settings s on s.organization_id=x.organization_id
 join crm.organizations o on o.id=x.organization_id and o.ativo
 where x.mail_status='PENDING' and nullif(s.notify_email,'') is not null order by x.created_at for update of x skip locked limit 1;
 if not found then return null; end if;
 select * into l from crm.leads where id=a.lead_id;
 select * into p from crm.outreach_policy where organization_id=a.organization_id;
 select notify_email into dest from crm.sdr_settings where organization_id=a.organization_id;
 update crm.sdr_alerts set mail_status='SENDING',mail_lease=gen_random_uuid(),mail_started_at=now() where id=a.id returning * into a;
 return to_jsonb(a)||jsonb_build_object('lead',jsonb_build_object('nome',l.nome,'empresa',l.empresa,'email',l.email,'telefone',l.telefone),'recipient',dest,'sender',p.sender);
end $$;
create function crm.finish_sdr_alert(aid uuid, token uuid, ok boolean) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 update crm.sdr_alerts set mail_status=case when ok then 'SENT' else 'REVIEW' end where id=aid and mail_lease=token and mail_status='SENDING';
end $$;
create function crm.claim_sdr_mailbox() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$ declare c crm.sdr_mail_cursor; begin
 insert into crm.sdr_mail_cursor(mailbox,watermark)
 select distinct lower(coalesce(nullif(p.reply_to,''),p.sender)),now()-interval '1 day' from crm.outreach_policy p join crm.sdr_settings s on s.organization_id=p.organization_id and s.enabled
 where coalesce(nullif(p.reply_to,''),p.sender) is not null on conflict do nothing;
 select x.* into c from crm.sdr_mail_cursor x where (x.locked_at is null or x.locked_at<now()-interval '5 minutes')
 and exists(select 1 from crm.outreach_policy p join crm.sdr_settings s on s.organization_id=p.organization_id and s.enabled where lower(coalesce(nullif(p.reply_to,''),p.sender))=x.mailbox)
 order by x.updated_at for update skip locked limit 1;
 if not found then return null; end if;
 update crm.sdr_mail_cursor set lease=gen_random_uuid(),locked_at=now() where mailbox=c.mailbox returning * into c;
 return to_jsonb(c);
end $$;
create function crm.finish_sdr_mailbox(address text, token uuid, next_url text, through_at timestamptz, failure text default null) returns void
language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 update crm.sdr_mail_cursor set next_path=case when failure is null then next_url else next_path end,
 watermark=case when failure is null and next_url is null then through_at else watermark end,
 last_error=failure,lease=null,locked_at=null,updated_at=now() where mailbox=address and lease=token;
end $$;
create function crm.claim_sdr_worker() returns uuid language plpgsql security definer set search_path=crm,pg_temp as $$ declare token uuid; begin
 update crm.sdr_worker_state set lease=gen_random_uuid(),locked_at=now() where id=1 and (lease is null or locked_at<now()-interval '5 minutes') returning lease into token;return token;
end $$;
create function crm.finish_sdr_worker(token uuid, report jsonb) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 update crm.sdr_worker_state set lease=null,finished_at=now(),status=report where id=1 and lease=token;
end $$;
create function crm.sdr_health(org uuid) returns jsonb language sql stable security definer set search_path=crm,pg_temp as $$
 select jsonb_build_object('finished_at',finished_at,'status',status) from crm.sdr_worker_state where id=1 and crm.tenant_member(org)
$$;
-- Autonomous sends fail closed if their reply mailbox is not being monitored.
alter function crm.authorize_dispatch(bigint,uuid) rename to authorize_dispatch_before_sdr;
create function crm.authorize_dispatch(jid bigint, token uuid) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; e crm.sequence_enrollments; target_mailbox text; begin
 select * into j from crm.automation_jobs where id=jid for update;
 if j.status<>'RUNNING' or j.lease_token is distinct from token then raise exception 'Invalid lease'; end if;
 select * into e from crm.sequence_enrollments where id=j.enrollment_id;
 if not e.dry_run and e.context->>'source'='sdr' and j.job_type='EMAIL' then
 select lower(coalesce(nullif(reply_to,''),sender)) into target_mailbox from crm.outreach_policy where organization_id=j.organization_id;
 if not exists(select 1 from crm.sdr_settings where organization_id=j.organization_id and enabled)
 or not exists(select 1 from crm.sdr_mail_cursor c where c.mailbox=target_mailbox and c.last_error is null and c.updated_at>now()-interval '10 minutes' and c.watermark>now()-interval '15 minutes') then
 update crm.automation_jobs set status='PENDING',run_at=now()+interval '5 minutes',lease_token=null,last_error='reply_monitor_required' where id=jid;
 return jsonb_build_object('allowed',false,'reason','reply_monitor_required');
 end if;
 end if;
 return crm.authorize_dispatch_before_sdr(jid,token);
end $$;
revoke all on function crm.authorize_dispatch(bigint,uuid) from public,anon,authenticated;
grant execute on function crm.authorize_dispatch(bigint,uuid) to service_role;

-- Every RPC is closed by default. Browser writes always check membership.
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm'
 and p.proname in ('sdr_health','claim_sdr_worker','finish_sdr_worker','install_sdr_library','save_sdr_settings','prepare_sdr_queue','claim_sdr_lead','finish_sdr_lead','record_sdr_open','record_sdr_reply','sdr_notifications','read_sdr_notification','claim_sdr_alert','finish_sdr_alert','claim_sdr_mailbox','finish_sdr_mailbox') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 if f.proname in ('sdr_health','install_sdr_library','save_sdr_settings','sdr_notifications','read_sdr_notification') then execute format('grant execute on function %s to authenticated',f.sig); end if;
 end loop;
end $$;
commit;
