-- Atendimento, fase A: perfil de Suporte (negado por padrao fora do atendimento), metricas de
-- atendimento sobre as conversas do Inbox, fila do atendente e painel do gestor.
-- Incremental: nao altera migrations anteriores, nao concede acesso a ninguem (o perfil so existe
-- quando um administrador o atribui) e nao liga nenhum canal nem envio.
begin;

alter table crm.organization_members drop constraint if exists organization_members_operating_role_check;
alter table crm.organization_members add constraint organization_members_operating_role_check
 check(operating_role in ('ADMIN','MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING','SUPPORT'));

-- support_member = membro ativo da empresa, inclusive Suporte (regra anterior de tenant_member).
-- tenant_member passa a negar o perfil Suporte: tudo o que ja usa tenant_member (leads, comercial,
-- configuracoes, exportacoes) continua fechado para esse perfil, sem mexer em cada politica.
create function crm.support_member(org uuid) returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select crm.password_ready() and crm.company_available(org) and exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
 where m.organization_id=org and m.user_id=auth.uid() and m.ativo and p.ativo)
$$;
create or replace function crm.tenant_member(org uuid,admin_only boolean default false) returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select crm.password_ready() and crm.company_available(org) and exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
 where m.organization_id=org and m.user_id=auth.uid() and m.ativo and p.ativo and m.operating_role<>'SUPPORT' and (not admin_only or m.papel='ADMIN'))
$$;
create function crm.support_manager(org uuid) returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select crm.support_member(org) and exists(select 1 from crm.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.ativo
 and (m.papel='ADMIN' or m.operating_role in ('ADMIN','MANAGER')))
$$;

-- Superficies de atendimento passam a valer para o perfil Suporte tambem: troca as chamadas de um
-- argumento tenant_member(x) por support_member(x). Chamadas com administrador (tenant_member(x,true)) ficam.
do $$ declare f record; pol record; def text; expr text; w text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm' and p.proname in (
  'add_inbox_note','update_inbox_conversation','mark_inbox_read','save_inbox_quick_reply','archive_inbox_quick_reply',
  'create_support_demand','update_support_demand','add_support_demand_note','get_support_settings','save_support_settings',
  'mark_support_alerts_read','support_demand_visible','my_companies','company_users') loop
  def:=pg_get_functiondef(f.oid);
  def:=regexp_replace(def,'(crm\.)?tenant_member\(([^,()]*)\)','crm.support_member(\2)','g');
  execute def;
 end loop;
 for pol in select policyname,tablename,qual,with_check from pg_policies where schemaname='crm' and tablename in (
  'inbox_conversations','inbox_messages','inbox_reads','inbox_quick_replies','support_demands','support_demand_alerts','support_settings','support_sla_policies')
  and (coalesce(qual,'') like '%tenant_member(%' or coalesce(with_check,'') like '%tenant_member(%') loop
  expr:=regexp_replace(coalesce(pol.qual,''),'(crm\.)?tenant_member\(([^,()]*)\)','crm.support_member(\2)','g');
  w:=regexp_replace(coalesce(pol.with_check,''),'(crm\.)?tenant_member\(([^,()]*)\)','crm.support_member(\2)','g');
  execute format('alter policy %I on crm.%I%s%s',pol.policyname,pol.tablename,
   case when pol.qual is not null then ' using ('||expr||')' else '' end,
   case when pol.with_check is not null then ' with check ('||w||')' else '' end);
 end loop;
 -- Falha alto se alguma chamada de um argumento sobrou (o texto decompilado pode variar entre versoes).
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm' and p.proname in (
  'add_inbox_note','update_inbox_conversation','mark_inbox_read','save_inbox_quick_reply','archive_inbox_quick_reply','create_support_demand','update_support_demand','add_support_demand_note',
  'get_support_settings','save_support_settings','mark_support_alerts_read','support_demand_visible','my_companies','company_users')
  and pg_get_functiondef(p.oid) ~ 'tenant_member\([^,()]*\)')
  or exists(select 1 from pg_policies where schemaname='crm' and tablename in ('inbox_conversations','inbox_messages','inbox_reads','inbox_quick_replies','support_demands','support_demand_alerts','support_settings','support_sla_policies')
  and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'tenant_member\([^,()]*\)') then
  raise exception 'support_member substitution incomplete';
 end if;
end $$;

-- Metricas por atendimento (conversa), mantidas por gatilhos a partir de fatos registrados.
alter table crm.inbox_conversations
 add column awaiting_human boolean not null default false,
 add column last_customer_message_at timestamptz,
 add column first_human_reply_at timestamptz,
 add column reopen_count integer not null default 0,
 add column reopened_at timestamptz,
 add column resolved_at timestamptz,
 add column resolved_by uuid references crm.profiles(id) on delete set null,
 add column resolution_note text check(resolution_note is null or length(resolution_note) between 3 and 2000);
-- Preenchimento inicial a partir das mensagens existentes: recompute_case_state (apenas resposta humana ACEITA conta).
create index inbox_conversations_attention on crm.inbox_conversations(organization_id,status,awaiting_human,assigned_to);

-- Estado de espera derivado dos fatos (mensagens), nunca incrementado: aguarda retorno quando ha mensagem
-- do cliente (nao automatica) sem resposta humana ACEITA igual ou posterior a ela, e o atendimento esta aberto.
create function crm.recompute_case_state(cid uuid) returns void language sql security definer set search_path=crm,pg_temp as $$
 update crm.inbox_conversations c set
  last_customer_message_at=x.last_in,
  first_human_reply_at=x.first_out,
  awaiting_human=(c.status<>'CLOSED' and x.last_in is not null and not coalesce(x.last_out>=x.last_in,false))
 from (select (select max(m.received_at) from crm.inbox_messages m where m.conversation_id=cid and m.direction='INBOUND' and m.classification is distinct from 'automatic') last_in,
              (select min(m.received_at) from crm.inbox_messages m where m.conversation_id=cid and m.direction='OUTBOUND' and m.delivery_status='ACCEPTED') first_out,
              (select max(m.received_at) from crm.inbox_messages m where m.conversation_id=cid and m.direction='OUTBOUND' and m.delivery_status='ACCEPTED') last_out) x
 where c.id=cid
$$;
create function crm.inbox_conversation_case_state() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if old.status<>'CLOSED' and new.status='CLOSED' then
  new.resolved_at:=now(); new.resolved_by:=auth.uid(); new.awaiting_human:=false;
 elsif old.status='CLOSED' and new.status<>'CLOSED' then
  new.reopen_count:=old.reopen_count+1; new.reopened_at:=now(); new.resolved_at:=null; new.resolved_by:=null; new.resolution_note:=null;
  -- Ao reabrir, a espera volta a refletir as mensagens (o fechamento a havia zerado).
  new.awaiting_human:=exists(select 1 from crm.inbox_messages m where m.conversation_id=new.id and m.direction='INBOUND' and m.classification is distinct from 'automatic')
   and not exists(select 1 from crm.inbox_messages o where o.conversation_id=new.id and o.direction='OUTBOUND' and o.delivery_status='ACCEPTED'
     and o.received_at>=(select max(i.received_at) from crm.inbox_messages i where i.conversation_id=new.id and i.direction='INBOUND' and i.classification is distinct from 'automatic'));
 end if;
 return new;
end $$;
create trigger inbox_conversation_case_state before update of status on crm.inbox_conversations
 for each row when (old.status is distinct from new.status) execute function crm.inbox_conversation_case_state();

create function crm.inbox_message_case_state() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if (new.direction='INBOUND' and new.classification is distinct from 'automatic')
  or (new.direction='OUTBOUND' and new.delivery_status='ACCEPTED' and (tg_op='INSERT' or old.delivery_status is distinct from 'ACCEPTED')) then
  perform crm.recompute_case_state(new.conversation_id);
 end if;
 return new;
end $$;
create trigger inbox_message_case_state after insert or update of delivery_status on crm.inbox_messages
 for each row execute function crm.inbox_message_case_state();

select crm.recompute_case_state(id) from crm.inbox_conversations;

-- Prazos e auditoria da mesa de atendimento por empresa.
create table crm.support_desk_settings (
 organization_id uuid primary key references crm.organizations(id) on delete cascade,
 first_response_hours integer not null default 4 check(first_response_hours between 1 and 168),
 resolution_hours integer not null default 72 check(resolution_hours between 1 and 2160),
 updated_by uuid references crm.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table crm.support_audit (
 id bigint generated always as identity primary key,
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 actor uuid references crm.profiles(id) on delete set null,
 action text not null,
 subject uuid,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table crm.support_desk_settings enable row level security;
alter table crm.support_audit enable row level security;
create policy support_desk_settings_read on crm.support_desk_settings for select to authenticated using(crm.support_member(organization_id));
create policy support_audit_read on crm.support_audit for select to authenticated using(crm.support_manager(organization_id));
revoke all on crm.support_desk_settings,crm.support_audit from public,anon,authenticated;
grant select on crm.support_desk_settings,crm.support_audit to authenticated;

create function crm.get_support_desk_settings(org uuid) returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare s crm.support_desk_settings; begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 select * into s from crm.support_desk_settings where organization_id=org;
 return jsonb_build_object('first_response_hours',coalesce(s.first_response_hours,4),'resolution_hours',coalesce(s.resolution_hours,72),'can_manage',crm.pode_administrar(org));
end $$;
create function crm.save_support_desk_settings(org uuid,first_hours integer,resolution_hours integer) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if first_hours not between 1 and 168 or resolution_hours not between 1 and 2160 then raise exception 'Invalid settings'; end if;
 insert into crm.support_desk_settings(organization_id,first_response_hours,resolution_hours,updated_by,updated_at) values(org,first_hours,resolution_hours,auth.uid(),now())
 on conflict(organization_id) do update set first_response_hours=excluded.first_response_hours,resolution_hours=excluded.resolution_hours,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into crm.support_audit(organization_id,actor,action,detail) values(org,auth.uid(),'DESK_SETTINGS',jsonb_build_object('first_response_hours',first_hours,'resolution_hours',resolution_hours));
end $$;

-- Atribuicao explicita do perfil Suporte por administrador. Nunca altera administradores/masters, nem a si mesmo.
create function crm.set_support_profile(org uuid,person uuid,enabled boolean,fallback_role text default 'SDR') returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare m crm.organization_members; begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 select * into m from crm.organization_members where organization_id=org and user_id=person and ativo for update;
 if not found or person=auth.uid() or m.papel='ADMIN' or m.is_master then raise exception 'Invalid member'; end if;
 if enabled then
  update crm.organization_members set operating_role='SUPPORT' where organization_id=org and user_id=person;
 else
  if m.operating_role<>'SUPPORT' then raise exception 'Invalid member'; end if;
  if fallback_role not in ('MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING') then raise exception 'Invalid role'; end if;
  update crm.organization_members set operating_role=fallback_role where organization_id=org and user_id=person;
 end if;
 insert into crm.support_audit(organization_id,actor,action,subject,detail) values(org,auth.uid(),case when enabled then 'SUPPORT_PROFILE_ON' else 'SUPPORT_PROFILE_OFF' end,person,jsonb_build_object('previous_role',m.operating_role));
end $$;

-- Atualizacao de estado/responsavel (usada pelo Inbox): nao conclui sem justificativa (support_resolve) e
-- ninguem alem de gestor mexe em atendimento de outra pessoa.
create or replace function crm.update_inbox_conversation(cid uuid,new_status text,new_assignee uuid)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; begin
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or auth.uid() is null or not crm.support_member(c.organization_id) or new_status not in ('OPEN','IN_PROGRESS','CLOSED') then raise exception 'Invalid conversation or access'; end if;
 if new_status='CLOSED' and c.status<>'CLOSED' then raise exception 'Conclua o atendimento informando a justificativa'; end if;
 if c.status<>'CLOSED' and c.assigned_to is not null and c.assigned_to<>auth.uid() and not crm.support_manager(c.organization_id) then raise exception 'Conversation assigned to another user'; end if;
 if new_assignee is not null and new_assignee<>auth.uid() and not crm.support_manager(c.organization_id) then raise exception 'Only managers assign to others'; end if;
 if new_assignee is not null and not exists(
  select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
  where m.organization_id=c.organization_id and m.user_id=new_assignee and m.ativo and p.ativo
 ) then raise exception 'Assignee is not a company member'; end if;
 update crm.inbox_conversations set status=new_status,assigned_to=new_assignee,updated_at=now() where id=cid;
end $$;

-- Contato minimo para o atendimento: so contatos que tem conversa nesta empresa (sem acesso a tabela de leads).
create function crm.support_contacts(org uuid,lead_ids uuid[]) returns table(id uuid,nome text,empresa text,email text,telefone text,opt_out boolean)
language plpgsql stable security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 return query select l.id,l.nome,l.empresa,l.email,l.telefone,l.opt_out from crm.leads l
  where l.organization_id=org and l.id=any(coalesce(lead_ids,'{}')) and exists(select 1 from crm.inbox_conversations c where c.organization_id=org and c.lead_id=l.id);
end $$;

create function crm.support_assume(cid uuid) returns boolean language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; begin
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or auth.uid() is null or not crm.support_member(c.organization_id) or c.status='CLOSED' then raise exception 'Conversation unavailable'; end if;
 if c.assigned_to=auth.uid() then return true; end if;
 if c.assigned_to is not null then return false; end if;
 update crm.inbox_conversations set assigned_to=auth.uid(),status='IN_PROGRESS',updated_at=now() where id=cid;
 return true;
end $$;
create function crm.support_resolve(cid uuid,note text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; clean text:=trim(coalesce(note,'')); begin
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or auth.uid() is null or not crm.support_member(c.organization_id) or c.status='CLOSED' then raise exception 'Conversation unavailable'; end if;
 if c.assigned_to is not null and c.assigned_to<>auth.uid() and not crm.support_manager(c.organization_id) then raise exception 'Conversation assigned to another user'; end if;
 if length(clean) not between 3 and 2000 then raise exception 'Resolution note required'; end if;
 update crm.inbox_conversations set status='CLOSED',resolution_note=clean,assigned_to=coalesce(assigned_to,auth.uid()),updated_at=now() where id=cid;
end $$;

-- Escopos da fila. Os mesmos escopos alimentam os contadores e as listas dos indicadores.
create function crm.support_queue(org uuid,scope text default 'open',query text default '',max_rows integer default 50,skip_rows integer default 0,only_assignee uuid default null,from_at timestamptz default null,to_at timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare needle text:=lower(trim(coalesce(query,''))); total integer; rows jsonb; begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 if scope not in ('mine','unassigned','awaiting_first','awaiting_reply','attention','overdue_resolution','uncertain','reopened','received','open','closed','all') then raise exception 'Invalid scope'; end if;
 if only_assignee is not null and not crm.support_manager(org) and only_assignee<>auth.uid() then raise exception 'Forbidden'; end if;
 with s as (select coalesce((select first_response_hours from crm.support_desk_settings where organization_id=org),4) frh, coalesce((select resolution_hours from crm.support_desk_settings where organization_id=org),72) rh),
 b as (
  select c.id,c.lead_id,c.subject,c.status,c.assigned_to,c.created_at,c.last_message_at,c.awaiting_human,c.last_customer_message_at,c.first_human_reply_at,c.reopen_count,c.reopened_at,c.resolved_at,c.resolution_note,
   l.nome,l.empresa,l.email,l.opt_out,
   (c.awaiting_human and c.status<>'CLOSED') waiting,
   coalesce(c.last_customer_message_at,c.created_at)+make_interval(hours=>s.frh) reply_due_at,
   coalesce(c.reopened_at,c.created_at)+make_interval(hours=>s.rh) resolution_due_at,
   exists(select 1 from crm.inbox_messages m where m.conversation_id=c.id and m.direction='OUTBOUND' and m.delivery_status in ('SENDING','REVIEW')) uncertain_send,
   (select left(m.body,160) from crm.inbox_messages m where m.conversation_id=c.id and m.direction<>'INTERNAL' order by m.received_at desc,m.id desc limit 1) last_text
  from crm.inbox_conversations c join crm.leads l on l.id=c.lead_id and l.organization_id=c.organization_id cross join s
  where c.organization_id=org and (only_assignee is null or c.assigned_to=only_assignee)
 ),
 f as (
  select *,(waiting and reply_due_at<now()) reply_overdue,(status<>'CLOSED' and resolution_due_at<now()) resolution_overdue from b
  where (needle='' or lower(coalesce(nome,'')||' '||coalesce(empresa,'')||' '||coalesce(email,'')||' '||subject) like '%'||replace(replace(replace(needle,'\','\\'),'%','\%'),'_','\_')||'%')
   and case scope
    when 'mine' then status<>'CLOSED' and assigned_to=auth.uid()
    when 'unassigned' then status<>'CLOSED' and assigned_to is null
    when 'awaiting_first' then waiting and first_human_reply_at is null
    when 'awaiting_reply' then waiting
    when 'attention' then status<>'CLOSED' and ((waiting and reply_due_at<now()) or resolution_due_at<now() or uncertain_send)
    when 'overdue_resolution' then status<>'CLOSED' and resolution_due_at<now()
    when 'uncertain' then status<>'CLOSED' and uncertain_send
    when 'reopened' then reopen_count>0 and (from_at is null or reopened_at>=from_at) and (to_at is null or reopened_at<to_at)
    when 'received' then (from_at is null or created_at>=from_at) and (to_at is null or created_at<to_at)
    when 'open' then status<>'CLOSED'
    when 'closed' then status='CLOSED'
    else true end
 )
 select (select count(*) from f), coalesce(jsonb_agg(to_jsonb(r) - 'waiting'),'[]') into total,rows from (
  select * from f order by case when scope in ('awaiting_first','awaiting_reply','attention','unassigned') then coalesce(last_customer_message_at,created_at) end asc nulls last,last_message_at desc,id
  limit least(greatest(max_rows,1),200) offset greatest(skip_rows,0)) r;
 return jsonb_build_object('total',total,'rows',rows);
end $$;

create function crm.support_queue_counts(org uuid) returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare acc jsonb:='{}'; k text; begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 foreach k in array array['mine','unassigned','awaiting_first','awaiting_reply','attention','open'] loop
  acc:=acc||jsonb_build_object(k,(crm.support_queue(org,k,'',1,0)->>'total')::int);
 end loop;
 return acc;
end $$;

-- Painel do gestor. Numeros de estado atual (fila) e de periodo (recebidos, tempos) sao separados e nomeados.
create function crm.support_desk_overview(org uuid,from_at timestamptz,to_at timestamptz,only_assignee uuid default null) returns jsonb
language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare res jsonb; mbox text; cur crm.sdr_mail_cursor; mail jsonb; reading boolean; begin
 if auth.uid() is null or not crm.support_manager(org) then raise exception 'Forbidden'; end if;
 if from_at is null or to_at is null or to_at<=from_at then raise exception 'Invalid period'; end if;
 select lower(coalesce(nullif(p.reply_to,''),p.sender)) into mbox from crm.outreach_policy p where p.organization_id=org;
 select coalesce(s.enabled,false) into reading from crm.sdr_settings s where s.organization_id=org;
 select * into cur from crm.sdr_mail_cursor k where mbox is not null and k.mailbox=mbox;
 mail:=jsonb_build_object('channel','email','mailbox',mbox,'reading_enabled',coalesce(reading,false),'last_sync_at',cur.updated_at,'last_error',case when cur.last_error is not null then 'Falha na leitura da caixa. Confira a conexão Microsoft 365.' end,
  'status',case when mbox is null then 'not_configured' when not coalesce(reading,false) then 'not_configured' when cur.mailbox is null then 'awaiting' when cur.last_error is not null then 'error' when cur.updated_at<now()-interval '30 minutes' then 'delayed' else 'connected' end,
  'coverage','Somente respostas a cadências desta empresa (token Ciatos). E-mail espontâneo de suporte ainda não é importado.');
 select jsonb_build_object(
  'period',jsonb_build_object('from',from_at,'to',to_at),
  'received',(crm.support_queue(org,'received','',1,0,only_assignee,from_at,to_at)->>'total')::int,
  'awaiting_first',(crm.support_queue(org,'awaiting_first','',1,0,only_assignee)->>'total')::int,
  'awaiting_reply',(crm.support_queue(org,'awaiting_reply','',1,0,only_assignee)->>'total')::int,
  'unassigned',(crm.support_queue(org,'unassigned','',1,0,only_assignee)->>'total')::int,
  'attention',(crm.support_queue(org,'attention','',1,0,only_assignee)->>'total')::int,
  'overdue_resolution',(crm.support_queue(org,'overdue_resolution','',1,0,only_assignee)->>'total')::int,
  'uncertain',(crm.support_queue(org,'uncertain','',1,0,only_assignee)->>'total')::int,
  'reopened',(crm.support_queue(org,'reopened','',1,0,only_assignee,from_at,to_at)->>'total')::int,
  'avg_first_response_hours',(select round((avg(extract(epoch from (c.first_human_reply_at-c.created_at)))/3600)::numeric,1) from crm.inbox_conversations c where c.organization_id=org and c.created_at>=from_at and c.created_at<to_at and c.first_human_reply_at>=c.created_at and (only_assignee is null or c.assigned_to=only_assignee)),
  'avg_resolution_hours',(select round((avg(extract(epoch from (c.resolved_at-c.created_at)))/3600)::numeric,1) from crm.inbox_conversations c where c.organization_id=org and c.resolved_at>=from_at and c.resolved_at<to_at and (only_assignee is null or c.assigned_to=only_assignee)),
  'auto_confirmation',jsonb_build_object('enabled',false,'note','Confirmação automática de recebimento ainda não existe. Nenhuma foi enviada.'),
  'by_assignee',(select coalesce(jsonb_agg(jsonb_build_object('assigned_to',t.assigned_to,'open',t.n,'waiting',t.w) order by t.n desc),'[]') from (
    select c.assigned_to,count(*) n,count(*) filter(where c.awaiting_human) w from crm.inbox_conversations c where c.organization_id=org and c.status<>'CLOSED' group by c.assigned_to) t),
  'channels',jsonb_build_array(mail,jsonb_build_object('channel','whatsapp','status','not_configured','coverage','Não conectado.'),jsonb_build_object('channel','instagram','status','not_configured','coverage','Não conectado.'))
 ) into res;
 return res;
end $$;

revoke all on function crm.support_member(uuid),crm.support_manager(uuid),crm.get_support_desk_settings(uuid),crm.save_support_desk_settings(uuid,integer,integer),crm.set_support_profile(uuid,uuid,boolean,text),
 crm.support_contacts(uuid,uuid[]),crm.support_assume(uuid),crm.support_resolve(uuid,text),crm.support_queue(uuid,text,text,integer,integer,uuid,timestamptz,timestamptz),crm.support_queue_counts(uuid),crm.support_desk_overview(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function crm.support_member(uuid),crm.support_manager(uuid),crm.get_support_desk_settings(uuid),crm.save_support_desk_settings(uuid,integer,integer),crm.set_support_profile(uuid,uuid,boolean,text),
 crm.support_contacts(uuid,uuid[]),crm.support_assume(uuid),crm.support_resolve(uuid,text),crm.support_queue(uuid,text,text,integer,integer,uuid,timestamptz,timestamptz),crm.support_queue_counts(uuid),crm.support_desk_overview(uuid,timestamptz,timestamptz,uuid) to authenticated;
revoke all on function crm.inbox_conversation_case_state(),crm.inbox_message_case_state(),crm.recompute_case_state(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
