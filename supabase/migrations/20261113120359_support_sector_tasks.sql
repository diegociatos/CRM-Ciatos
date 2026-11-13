-- Additive help desk extension. No external sends, schedulers or channel activation.
begin;
-- Do not silently replace a customized privacy export in the shared database.
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='crm' and p.proname='lead_privacy_export' and md5(replace(p.prosrc,chr(13),''))='f1ff92f59b34708a3f23ff3608e52f15') then
  raise exception 'A exportação de privacidade mudou. Revise a função do destino antes de aplicar.';
 end if;
end $$;
create table crm.support_demand_tasks (
 id uuid primary key,
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 demand_id uuid not null,
 sector text not null check(sector in ('ACCOUNTING','LEGAL','TAX','COMMERCIAL','FINANCE','OPERATIONS','CX','OTHER')),
 title text not null check(length(trim(title)) between 2 and 160),
 assigned_to uuid references crm.profiles(id) on delete set null,
 due_at timestamptz not null,
 required boolean not null default true,
 status text not null default 'OPEN' check(status in ('OPEN','DONE','WAIVED')),
 result text not null default '' check(length(result)<=4000),
 created_by uuid references crm.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 foreign key(demand_id,organization_id) references crm.support_demands(id,organization_id) on delete cascade,
 check(status='OPEN' or length(trim(result))>=2)
);
create index support_demand_tasks_parent_idx on crm.support_demand_tasks(demand_id,status);
create index support_demand_tasks_executor_idx on crm.support_demand_tasks(organization_id,assigned_to,due_at) where status='OPEN';
alter table crm.support_demand_tasks enable row level security;
create policy support_demand_tasks_read on crm.support_demand_tasks for select to authenticated using(
 exists(select 1 from crm.support_demands d where d.id=demand_id and d.organization_id=support_demand_tasks.organization_id)
);
revoke all on crm.support_demand_tasks from public,anon,authenticated;
grant select on crm.support_demand_tasks to authenticated;

-- Parent lock is shared with update_support_demand: create/complete and resolve serialize.
create function crm.save_support_task(demand uuid,expected_version integer,task_id uuid,task_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare d crm.support_demands; old_task crm.support_demand_tasks; t crm.support_demand_tasks; v integer; affected integer; begin
 select * into d from crm.support_demands where id=demand for update;
 if not found or auth.uid() is null or not crm.support_demand_visible(d.organization_id,d.confidential,d.created_by,d.assigned_to) then raise exception 'Demand unavailable'; end if;
 if task_id is null or task_data is null or jsonb_typeof(task_data)<>'object'
  or exists(select 1 from jsonb_object_keys(task_data) k where k not in ('title','sector','assigned_to','due_at','required','status','result'))
  or not task_data ?& array['title','sector','assigned_to','due_at','required','status','result']
  or exists(select 1 from jsonb_each(task_data) e where (e.key='required' and jsonb_typeof(e.value)<>'boolean') or (e.key<>'required' and jsonb_typeof(e.value) not in ('string','null'))) then raise exception 'Invalid task'; end if;
 select * into old_task from crm.support_demand_tasks where id=task_id;
 if found and old_task.demand_id<>demand then raise exception 'Invalid task'; end if;
 t.id:=task_id; t.organization_id:=d.organization_id; t.demand_id:=demand;
 t.title:=trim(task_data->>'title'); t.sector:=task_data->>'sector'; t.assigned_to:=(task_data->>'assigned_to')::uuid;
 t.due_at:=(task_data->>'due_at')::timestamptz; t.required:=(task_data->>'required')::boolean; t.status:=task_data->>'status'; t.result:=trim(coalesce(task_data->>'result',''));
 -- Exact repetition is a no-op (including a response lost after commit). Never move tasks between parents.
 if old_task.id is not null and row(old_task.title,old_task.sector,old_task.assigned_to,old_task.due_at,old_task.required,old_task.status,old_task.result)
  is not distinct from row(t.title,t.sector,t.assigned_to,t.due_at,t.required,t.status,t.result) then return d.version; end if;
 if expected_version is distinct from d.version then raise exception 'Demand changed; reload before saving' using errcode='40001'; end if;
 if old_task.id is not null and old_task.required is distinct from t.required then raise exception 'A obrigatoriedade é definida na criação. Use dispensa com justificativa.'; end if;
 if d.status in ('RESOLVED','CANCELLED') then raise exception 'Reabra a demanda antes de alterar as tarefas.'; end if;
 if old_task.id is null and (select count(*) from crm.support_demand_tasks where demand_id=demand)>=100 then raise exception 'Limite de 100 tarefas por demanda.'; end if;
 if t.assigned_to is null or not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=d.organization_id and m.user_id=t.assigned_to and m.ativo and p.ativo) then raise exception 'Invalid assignee'; end if;
 -- A task must not grant its executor implicit access to confidential client data.
 if d.confidential and t.assigned_to is distinct from d.created_by and t.assigned_to is distinct from d.assigned_to then raise exception 'Em demanda confidencial, atribua a tarefa ao criador ou ao responsável pelo atendimento.'; end if;
 t.created_by:=coalesce(old_task.created_by,auth.uid()); t.created_at:=coalesce(old_task.created_at,now()); t.updated_at:=now();
 t.completed_at:=case when t.status='OPEN' then null when old_task.status=t.status then coalesce(old_task.completed_at,now()) else now() end;
 insert into crm.support_demand_tasks select (t).* on conflict(id) do update set
  title=excluded.title,sector=excluded.sector,assigned_to=excluded.assigned_to,due_at=excluded.due_at,required=excluded.required,status=excluded.status,result=excluded.result,updated_at=excluded.updated_at,completed_at=excluded.completed_at
  where crm.support_demand_tasks.demand_id=excluded.demand_id;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Invalid task'; end if;
 update crm.support_demands set version=version+1,updated_at=now() where id=demand returning version into v;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,body,changes)
 values(d.organization_id,demand,auth.uid(),'NOTE','Tarefa setorial: '||t.title,jsonb_build_object('task_before',case when old_task.id is null then null else to_jsonb(old_task) end,'task_after',to_jsonb(t)));
 return v;
end $$;

create function crm.guard_support_task_resolution() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='RESOLVED' and old.status is distinct from new.status and exists(select 1 from crm.support_demand_tasks where demand_id=new.id and required and status='OPEN') then
  raise exception 'Conclua ou dispense com justificativa todas as tarefas obrigatórias antes de resolver a demanda.' using errcode='23514';
 end if;
 return new;
end $$;
create trigger support_task_resolution before update of status on crm.support_demands for each row execute function crm.guard_support_task_resolution();
revoke all on function crm.save_support_task(uuid,integer,uuid,jsonb),crm.guard_support_task_resolution() from public,anon;
grant execute on function crm.save_support_task(uuid,integer,uuid,jsonb) to authenticated;

-- Invoker preserves the exact same per-company/confidential visibility as the queue.
-- This is an operational month report, NOT a reconstruction of historical month-end stock.
create function crm.support_client_month(org uuid,client_id uuid,month_start date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare start_at timestamptz; end_at timestamptz; payload jsonb; begin
 if auth.uid() is null or not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
 if month_start is null or extract(day from month_start)<>1 or client_id is null then raise exception 'Informe cliente e primeiro dia do mês.'; end if;
 if not exists(select 1 from crm.leads where id=client_id and organization_id=org) then raise exception 'Cliente indisponível nesta empresa.'; end if;
 start_at:=month_start::timestamp at time zone 'America/Sao_Paulo'; end_at:=(month_start+interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
 with visible as (select * from crm.support_demands where organization_id=org and lead_id=client_id),
 selected as (select * from visible where created_at>=start_at and created_at<end_at or resolved_at>=start_at and resolved_at<end_at or status in ('OPEN','IN_PROGRESS','WAITING'))
 select jsonb_build_object(
  'opened',(select count(*) from visible where created_at>=start_at and created_at<end_at),
  'resolved',(select count(*) from visible where resolved_at>=start_at and resolved_at<end_at),
  'open_now',(select count(*) from visible where status in ('OPEN','IN_PROGRESS','WAITING')),
  'avg_resolution_hours',(select round(avg(extract(epoch from (resolved_at-created_at))/3600)::numeric,1) from visible where resolved_at>=start_at and resolved_at<end_at),
  'total',(select count(*) from selected),
  'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'status',status,'created_at',created_at,'resolved_at',resolved_at,'due_at',due_at,'assigned_to',assigned_to) order by created_at desc,id),'[]'::jsonb) from (select * from selected order by created_at desc,id limit 200) s)
 ) into payload;
 return payload;
end $$;
revoke all on function crm.support_client_month(uuid,uuid,date) from public,anon;
grant execute on function crm.support_client_month(uuid,uuid,date) to authenticated;
create or replace function crm.lead_privacy_export(lid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l crm.leads; demand_ids uuid[]; begin
 select * into l from crm.leads where id=lid;
 if not found or auth.uid() is null or not crm.tenant_member(l.organization_id,true) then raise exception 'Forbidden'; end if;
 select coalesce(array_agg(d.id),'{}'::uuid[]) into demand_ids from crm.support_demands d
 where d.organization_id=l.organization_id and d.lead_id=lid;
 return jsonb_build_object('lead',to_jsonb(l),
 'interactions',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from crm.interactions i where i.lead_id=lid),
 'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from crm.message_events e where e.lead_id=lid),
 'ai_runs',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from crm.ai_runs a where a.lead_id=lid),
 'handoffs',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from crm.human_handoffs h where h.lead_id=lid),
 'inbox_messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.received_at),'[]') from crm.inbox_messages m
  join crm.inbox_conversations c on c.id=m.conversation_id and c.organization_id=m.organization_id
  where c.organization_id=l.organization_id and c.lead_id=lid),
 'support_demand_tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from crm.support_demand_tasks t where t.demand_id=any(demand_ids)),
 'support_demands',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from crm.support_demands d where d.id=any(demand_ids)),
 'support_demand_activity',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from crm.support_demand_activity a where a.demand_id=any(demand_ids)));
end $$;

revoke all on function crm.lead_privacy_export(uuid) from public,anon;
notify pgrst,'reload schema';
commit;
