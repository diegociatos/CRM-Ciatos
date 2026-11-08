-- Central de demandas, fase 1: prazo automatico (SLA simples), responsavel de triagem,
-- avisos internos, painel e demandas confidenciais. Somente schema crm, nada e enviado
-- a clientes e nenhum agendador e ligado por esta migration (ver supabase/ops/support-scan.sql).
begin;

-- Configuracao por empresa. Sem linha = padroes (ver crm.support_sla_hours).
create table crm.support_settings (
 organization_id uuid primary key references crm.organizations(id) on delete cascade,
 triage_assignee uuid references crm.profiles(id) on delete set null,
 due_soon_hours integer not null default 4 check(due_soon_hours between 1 and 168),
 escalate_after_hours integer not null default 4 check(escalate_after_hours between 1 and 720),
 updated_by uuid references crm.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table crm.support_sla_policies (
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 priority text not null check(priority in ('LOW','NORMAL','HIGH','URGENT')),
 resolve_hours integer not null check(resolve_hours between 1 and 2160),
 primary key(organization_id,priority)
);
alter table crm.support_settings enable row level security;
alter table crm.support_sla_policies enable row level security;
create policy support_settings_read on crm.support_settings for select to authenticated using(crm.tenant_member(organization_id));
create policy support_sla_policies_read on crm.support_sla_policies for select to authenticated using(crm.tenant_member(organization_id));
revoke all on crm.support_settings,crm.support_sla_policies from public,anon,authenticated;
grant select on crm.support_settings,crm.support_sla_policies to authenticated;

create function crm.support_sla_hours(org uuid,demand_priority text) returns integer
language sql stable security definer set search_path='' as $$
 select coalesce((select p.resolve_hours from crm.support_sla_policies p where p.organization_id=org and p.priority=demand_priority),
  case demand_priority when 'URGENT' then 4 when 'HIGH' then 24 when 'LOW' then 120 else 72 end)
$$;

-- Demandas: prazo veio da politica? confidencial?
alter table crm.support_demands add column sla_due boolean not null default false;
alter table crm.support_demands add column confidential boolean not null default false;

-- Visibilidade: membro ativo da empresa; confidencial so criador, responsavel e administrador.
create function crm.support_demand_visible(org uuid,is_confidential boolean,creator uuid,assignee uuid) returns boolean
language sql stable set search_path='' as $$
 select crm.tenant_member(org) and (not is_confidential or coalesce(creator=auth.uid(),false) or coalesce(assignee=auth.uid(),false) or crm.pode_administrar(org))
$$;
drop policy support_demands_read on crm.support_demands;
create policy support_demands_read on crm.support_demands for select to authenticated
 using(crm.support_demand_visible(organization_id,confidential,created_by,assigned_to));
drop policy support_demand_activity_read on crm.support_demand_activity;
create policy support_demand_activity_read on crm.support_demand_activity for select to authenticated
 using(exists(select 1 from crm.support_demands d where d.id=demand_id and d.organization_id=support_demand_activity.organization_id));

-- Avisos internos (somente membros da empresa; nunca o contato).
create table crm.support_demand_alerts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 demand_id uuid not null,
 recipient uuid not null references crm.profiles(id) on delete cascade,
 kind text not null check(kind in ('ASSIGNED','DUE_SOON','OVERDUE','UNASSIGNED','ESCALATED')),
 bucket text not null,
 title text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 foreign key(demand_id,organization_id) references crm.support_demands(id,organization_id) on delete cascade,
 unique(demand_id,recipient,kind,bucket)
);
create index support_demand_alerts_inbox_idx on crm.support_demand_alerts(recipient,organization_id,read_at,created_at desc);
alter table crm.support_demand_alerts enable row level security;
create policy support_demand_alerts_read on crm.support_demand_alerts for select to authenticated
 using(recipient=auth.uid() and crm.tenant_member(organization_id) and exists(select 1 from crm.support_demands d where d.id=demand_id and d.organization_id=support_demand_alerts.organization_id));
revoke all on crm.support_demand_alerts from public,anon,authenticated;
grant select on crm.support_demand_alerts to authenticated;

create function crm.mark_support_alerts_read(org uuid,alert_ids uuid[] default null) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; begin
 if auth.uid() is null or not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
 update crm.support_demand_alerts set read_at=now()
 where organization_id=org and recipient=auth.uid() and read_at is null and (alert_ids is null or id=any(alert_ids));
 get diagnostics n=row_count; return n;
end $$;

-- Criacao: prazo da politica e responsavel de triagem quando nao informados.
drop function crm.create_support_demand(uuid,text,text,uuid,text,timestamptz,uuid,uuid);
create function crm.create_support_demand(org uuid,demand_title text,demand_description text default '',related_lead uuid default null,demand_priority text default 'NORMAL',demand_due_at timestamptz default null,assignee uuid default null,request_id uuid default gen_random_uuid(),is_confidential boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; final_due timestamptz; from_policy boolean:=false; final_assignee uuid:=assignee; triage uuid; begin
 if auth.uid() is null or not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
 if request_id is null then raise exception 'Request ID required'; end if;
 select d.id into saved from crm.support_demands d where d.organization_id=org and d.created_by=auth.uid() and d.request_id=create_support_demand.request_id;
 if found then return saved; end if;
 if demand_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'Invalid priority'; end if;
 if related_lead is not null and not exists(select 1 from crm.leads where id=related_lead and organization_id=org) then raise exception 'Invalid lead'; end if;
 if assignee is not null and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=assignee and m.ativo and p.ativo) then raise exception 'Invalid assignee'; end if;
 if final_assignee is null then
  select s.triage_assignee into triage from crm.support_settings s where s.organization_id=org;
  if triage is not null and exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=triage and m.ativo and p.ativo) then final_assignee:=triage; end if;
 end if;
 final_due:=demand_due_at;
 if final_due is null then final_due:=now()+make_interval(hours=>crm.support_sla_hours(org,demand_priority)); from_policy:=true; end if;
 insert into crm.support_demands(organization_id,lead_id,title,description,priority,due_at,assigned_to,created_by,request_id,sla_due,confidential)
 values(org,related_lead,trim(demand_title),coalesce(demand_description,''),demand_priority,final_due,final_assignee,auth.uid(),request_id,from_policy,coalesce(is_confidential,false))
 on conflict on constraint support_demands_request_unique do nothing returning id into saved;
 if saved is null then
  select d.id into saved from crm.support_demands d where d.organization_id=org and d.created_by=auth.uid() and d.request_id=create_support_demand.request_id;
  return saved;
 end if;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,changes)
 select org,saved,auth.uid(),'CREATED',jsonb_build_object('after',to_jsonb(d)-'request_id') from crm.support_demands d where id=saved;
 if final_assignee is not null and final_assignee<>auth.uid() then
  insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title) values(org,saved,final_assignee,'ASSIGNED','v1',trim(demand_title)) on conflict do nothing;
 end if;
 return saved;
end $$;

create or replace function crm.update_support_demand(demand uuid,expected_version integer,patch jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare previous crm.support_demands; updated crm.support_demands; begin
 select * into previous from crm.support_demands where id=demand for update;
 if not found or auth.uid() is null or not crm.support_demand_visible(previous.organization_id,previous.confidential,previous.created_by,previous.assigned_to) then raise exception 'Demand unavailable'; end if;
 if expected_version is distinct from previous.version then raise exception 'Demand changed; reload before saving' using errcode='40001'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in ('title','description','lead_id','status','priority','due_at','assigned_to')) then raise exception 'Invalid patch'; end if;
 if exists(select 1 from jsonb_each(patch) e where jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Invalid field type'; end if;
 updated:=previous;
 if patch ? 'title' then updated.title:=trim(patch->>'title'); end if;
 if patch ? 'description' then updated.description:=patch->>'description'; end if;
 if patch ? 'status' then updated.status:=patch->>'status'; end if;
 if patch ? 'priority' then updated.priority:=patch->>'priority'; end if;
 -- Contact association is immutable, including an internal demand's null link.
 if patch ? 'lead_id' and (patch->>'lead_id')::uuid is distinct from previous.lead_id then
  raise exception 'O contato da demanda não pode ser alterado após a criação. Crie uma nova demanda para outro contato.' using errcode='23514';
 end if;
 if patch ? 'assigned_to' then updated.assigned_to:=(patch->>'assigned_to')::uuid; end if;
 if patch ? 'due_at' then updated.due_at:=(patch->>'due_at')::timestamptz; updated.sla_due:=false; end if;
 -- Prioridade mudou e o prazo ainda vem da politica: recalcula a partir da criacao.
 if updated.priority is distinct from previous.priority and previous.sla_due and not (patch ? 'due_at') and updated.priority in ('LOW','NORMAL','HIGH','URGENT') then
  updated.due_at:=previous.created_at+make_interval(hours=>crm.support_sla_hours(previous.organization_id,updated.priority));
 end if;
 if patch ? 'assigned_to' and updated.assigned_to is not null and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=previous.organization_id and m.user_id=updated.assigned_to and m.ativo and p.ativo) then raise exception 'Invalid assignee'; end if;
 if updated is not distinct from previous then return previous.version; end if;
 updated.resolved_at:=case when updated.status='RESOLVED' then coalesce(previous.resolved_at,now()) else null end;
 update crm.support_demands set title=updated.title,description=updated.description,status=updated.status,priority=updated.priority,due_at=updated.due_at,sla_due=updated.sla_due,assigned_to=updated.assigned_to,resolved_at=updated.resolved_at,updated_at=now(),version=previous.version+1 where id=demand returning * into updated;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,changes)
 values(previous.organization_id,demand,auth.uid(),'UPDATED',jsonb_build_object('before',to_jsonb(previous)-'request_id','after',to_jsonb(updated)-'request_id'));
 if updated.assigned_to is not null and updated.assigned_to is distinct from previous.assigned_to and updated.assigned_to<>auth.uid() then
  insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title) values(updated.organization_id,demand,updated.assigned_to,'ASSIGNED','v'||updated.version,updated.title) on conflict do nothing;
 end if;
 return updated.version;
end $$;

create or replace function crm.add_support_demand_note(demand uuid,note_body text,request_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path='' as $$
declare d crm.support_demands; saved uuid; begin
 select * into d from crm.support_demands where id=demand for update;
 if not found or auth.uid() is null or not crm.support_demand_visible(d.organization_id,d.confidential,d.created_by,d.assigned_to) then raise exception 'Demand unavailable'; end if;
 if request_id is null then raise exception 'Request ID required'; end if;
 select a.id into saved from crm.support_demand_activity a where a.demand_id=demand and a.actor_id=auth.uid() and a.request_id=add_support_demand_note.request_id;
 if found then return saved; end if;
 if note_body is null or length(trim(note_body)) not between 1 and 10000 then raise exception 'Invalid note'; end if;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,body,request_id)
 values(d.organization_id,demand,auth.uid(),'NOTE',trim(note_body),request_id) returning id into saved;
 return saved;
end $$;

-- Configuracao efetiva (padroes + ajustes da empresa) e gravacao restrita a administradores.
create function crm.get_support_settings(org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s crm.support_settings; begin
 if auth.uid() is null or not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
 select * into s from crm.support_settings where organization_id=org;
 return jsonb_build_object(
  'triage_assignee',s.triage_assignee,
  'due_soon_hours',coalesce(s.due_soon_hours,4),
  'escalate_after_hours',coalesce(s.escalate_after_hours,4),
  'can_manage',crm.pode_administrar(org),
  'policies',jsonb_build_object('URGENT',crm.support_sla_hours(org,'URGENT'),'HIGH',crm.support_sla_hours(org,'HIGH'),'NORMAL',crm.support_sla_hours(org,'NORMAL'),'LOW',crm.support_sla_hours(org,'LOW')));
end $$;

create function crm.save_support_settings(org uuid,settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p text; hours integer; triage uuid; soon integer; esc integer; begin
 if auth.uid() is null or not crm.tenant_member(org) or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if settings is null or jsonb_typeof(settings)<>'object' or exists(select 1 from jsonb_object_keys(settings) k where k not in ('triage_assignee','due_soon_hours','escalate_after_hours','policies')) then raise exception 'Invalid settings'; end if;
 triage:=nullif(settings->>'triage_assignee','')::uuid;
 if triage is not null and not exists(select 1 from crm.organization_members m join crm.profiles pr on pr.id=m.user_id where m.organization_id=org and m.user_id=triage and m.ativo and pr.ativo) then raise exception 'Invalid assignee'; end if;
 soon:=coalesce((settings->>'due_soon_hours')::integer,4); esc:=coalesce((settings->>'escalate_after_hours')::integer,4);
 insert into crm.support_settings(organization_id,triage_assignee,due_soon_hours,escalate_after_hours,updated_by,updated_at)
 values(org,triage,soon,esc,auth.uid(),now())
 on conflict(organization_id) do update set triage_assignee=excluded.triage_assignee,due_soon_hours=excluded.due_soon_hours,escalate_after_hours=excluded.escalate_after_hours,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 if settings ? 'policies' then
  if jsonb_typeof(settings->'policies')<>'object' then raise exception 'Invalid settings'; end if;
  for p in select k from jsonb_object_keys(settings->'policies') k loop
   if p not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'Invalid settings'; end if;
   hours:=(settings->'policies'->>p)::integer;
   insert into crm.support_sla_policies(organization_id,priority,resolve_hours) values(org,p,hours)
   on conflict(organization_id,priority) do update set resolve_hours=excluded.resolve_hours;
  end loop;
 end if;
end $$;

-- Painel: security invoker, portanto a RLS (inclusive confidencialidade) limita o que e contado.
create function crm.support_demand_stats(org uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with active as (select * from crm.support_demands d where d.organization_id=org and d.status in ('OPEN','IN_PROGRESS','WAITING')),
 closed as (select * from crm.support_demands d where d.organization_id=org and d.status='RESOLVED' and d.resolved_at>=now()-interval '90 days')
 select jsonb_build_object(
  'open',(select count(*) from active),
  'overdue',(select count(*) from active where due_at<now()),
  'due_today',(select count(*) from active where due_at>=now() and (due_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date),
  'unassigned',(select count(*) from active where assigned_to is null),
  'avg_resolution_hours',(select round((avg(extract(epoch from (resolved_at-created_at)))/3600)::numeric,1) from closed),
  'by_assignee',(select coalesce(jsonb_agg(jsonb_build_object('assigned_to',assigned_to,'open',n,'overdue',late) order by n desc),'[]'::jsonb)
   from (select assigned_to,count(*) n,count(*) filter(where due_at<now()) late from active group by assigned_to) t))
$$;

-- Varredura periodica (agendador do servidor). Nunca executavel pelo navegador.
create function crm.scan_support_demands() returns integer
language plpgsql security definer set search_path='' as $$
declare total integer:=0; n integer; begin
 -- Atrasadas: avisa o responsavel.
 insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title)
 select d.organization_id,d.id,d.assigned_to,'OVERDUE',extract(epoch from d.due_at)::bigint::text,d.title
 from crm.support_demands d join crm.organizations o on o.id=d.organization_id and o.ativo
 join crm.organization_members m on m.organization_id=d.organization_id and m.user_id=d.assigned_to and m.ativo
 join crm.profiles p on p.id=d.assigned_to and p.ativo
 where d.status in ('OPEN','IN_PROGRESS','WAITING') and d.due_at<now() on conflict do nothing;
 get diagnostics n=row_count; total:=total+n;
 -- Vencem em breve.
 insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title)
 select d.organization_id,d.id,d.assigned_to,'DUE_SOON',extract(epoch from d.due_at)::bigint::text,d.title
 from crm.support_demands d join crm.organizations o on o.id=d.organization_id and o.ativo
 join crm.organization_members m on m.organization_id=d.organization_id and m.user_id=d.assigned_to and m.ativo
 join crm.profiles p on p.id=d.assigned_to and p.ativo
 left join crm.support_settings s on s.organization_id=d.organization_id
 where d.status in ('OPEN','IN_PROGRESS','WAITING') and d.due_at>=now() and d.due_at<now()+make_interval(hours=>coalesce(s.due_soon_hours,4)) on conflict do nothing;
 get diagnostics n=row_count; total:=total+n;
 -- Sem responsavel ha mais de 1 hora: avisa administradores/masters da empresa.
 insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title)
 select d.organization_id,d.id,a.user_id,'UNASSIGNED','once',d.title
 from crm.support_demands d join crm.organizations o on o.id=d.organization_id and o.ativo
 join crm.organization_members a on a.organization_id=d.organization_id and a.ativo and (a.papel='ADMIN' or a.is_master)
 join crm.profiles p on p.id=a.user_id and p.ativo
 where d.status in ('OPEN','IN_PROGRESS','WAITING') and d.assigned_to is null and d.created_at<now()-interval '1 hour' on conflict do nothing;
 get diagnostics n=row_count; total:=total+n;
 -- Escalonamento: atraso alem do limite da empresa avisa administradores/masters.
 insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title)
 select d.organization_id,d.id,a.user_id,'ESCALATED',extract(epoch from d.due_at)::bigint::text,d.title
 from crm.support_demands d join crm.organizations o on o.id=d.organization_id and o.ativo
 left join crm.support_settings s on s.organization_id=d.organization_id
 join crm.organization_members a on a.organization_id=d.organization_id and a.ativo and (a.papel='ADMIN' or a.is_master)
 join crm.profiles p on p.id=a.user_id and p.ativo
 where d.status in ('OPEN','IN_PROGRESS','WAITING') and d.due_at<now()-make_interval(hours=>coalesce(s.escalate_after_hours,4)) on conflict do nothing;
 get diagnostics n=row_count; total:=total+n;
 return total;
end $$;

revoke all on function crm.support_sla_hours(uuid,text),crm.support_demand_visible(uuid,boolean,uuid,uuid),crm.mark_support_alerts_read(uuid,uuid[]),crm.create_support_demand(uuid,text,text,uuid,text,timestamptz,uuid,uuid,boolean),crm.update_support_demand(uuid,integer,jsonb),crm.add_support_demand_note(uuid,text,uuid),crm.get_support_settings(uuid),crm.save_support_settings(uuid,jsonb),crm.support_demand_stats(uuid),crm.scan_support_demands() from public,anon,authenticated;
grant execute on function crm.support_demand_visible(uuid,boolean,uuid,uuid),crm.mark_support_alerts_read(uuid,uuid[]),crm.create_support_demand(uuid,text,text,uuid,text,timestamptz,uuid,uuid,boolean),crm.update_support_demand(uuid,integer,jsonb),crm.add_support_demand_note(uuid,text,uuid),crm.get_support_settings(uuid),crm.save_support_settings(uuid,jsonb),crm.support_demand_stats(uuid) to authenticated;
grant execute on function crm.support_sla_hours(uuid,text) to service_role;
grant execute on function crm.scan_support_demands() to service_role;
notify pgrst,'reload schema';
commit;
