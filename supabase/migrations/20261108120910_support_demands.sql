begin;
-- Deliberately separate from platform_support_tickets: these records belong to a tenant.
create table crm.support_demands (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 lead_id uuid,
 title text not null check(length(trim(title)) between 2 and 200),
 description text not null default '' check(length(description)<=20000),
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','WAITING','RESOLVED','CANCELLED')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT')),
 due_at timestamptz,
 assigned_to uuid references crm.profiles(id) on delete set null,
 created_by uuid references crm.profiles(id) on delete set null,
 request_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_at timestamptz,
 version integer not null default 1 check(version>0),
 unique(id,organization_id),
 constraint support_demands_request_unique unique(organization_id,created_by,request_id),
 foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade
);
create index support_demands_queue_idx on crm.support_demands(organization_id,status,due_at);
create index support_demands_lead_idx on crm.support_demands(organization_id,lead_id);
create index support_demands_assignee_idx on crm.support_demands(organization_id,assigned_to);
create table crm.support_demand_activity (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 demand_id uuid not null,
 actor_id uuid references crm.profiles(id) on delete set null,
 kind text not null check(kind in ('CREATED','UPDATED','NOTE')),
 body text check(body is null or length(trim(body)) between 1 and 10000),
 changes jsonb not null default '{}'::jsonb,
 request_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 foreign key(demand_id,organization_id) references crm.support_demands(id,organization_id) on delete cascade,
 unique(demand_id,actor_id,request_id)
);
create index support_demand_activity_timeline_idx on crm.support_demand_activity(organization_id,demand_id,created_at,id);
alter table crm.support_demands enable row level security;
alter table crm.support_demand_activity enable row level security;
create policy support_demands_read on crm.support_demands for select to authenticated using(crm.tenant_member(organization_id));
create policy support_demand_activity_read on crm.support_demand_activity for select to authenticated using(crm.tenant_member(organization_id));
-- Only audited RPCs can write. No INSERT/UPDATE/DELETE policies or browser grants.
revoke all on crm.support_demands,crm.support_demand_activity from public,anon,authenticated;
grant select on crm.support_demands,crm.support_demand_activity to authenticated;

create function crm.create_support_demand(org uuid,demand_title text,demand_description text default '',related_lead uuid default null,demand_priority text default 'NORMAL',demand_due_at timestamptz default null,assignee uuid default null,request_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; begin
 if auth.uid() is null or not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
 if request_id is null then raise exception 'Request ID required'; end if;
 select d.id into saved from crm.support_demands d where d.organization_id=org and d.created_by=auth.uid() and d.request_id=create_support_demand.request_id;
 if found then return saved; end if;
 if related_lead is not null and not exists(select 1 from crm.leads where id=related_lead and organization_id=org) then raise exception 'Invalid lead'; end if;
 if assignee is not null and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=assignee and m.ativo and p.ativo) then raise exception 'Invalid assignee'; end if;
 insert into crm.support_demands(organization_id,lead_id,title,description,priority,due_at,assigned_to,created_by,request_id)
 values(org,related_lead,trim(demand_title),coalesce(demand_description,''),demand_priority,demand_due_at,assignee,auth.uid(),request_id)
 on conflict on constraint support_demands_request_unique do nothing returning id into saved;
 if saved is null then
  select d.id into saved from crm.support_demands d where d.organization_id=org and d.created_by=auth.uid() and d.request_id=create_support_demand.request_id;
  return saved;
 end if;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,changes)
 select org,saved,auth.uid(),'CREATED',jsonb_build_object('after',to_jsonb(d)-'request_id') from crm.support_demands d where id=saved;
 return saved;
end $$;

create function crm.update_support_demand(demand uuid,expected_version integer,patch jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare previous crm.support_demands; updated crm.support_demands; begin
 select * into previous from crm.support_demands where id=demand for update;
 if not found or auth.uid() is null or not crm.tenant_member(previous.organization_id) then raise exception 'Demand unavailable'; end if;
 if expected_version is distinct from previous.version then raise exception 'Demand changed; reload before saving' using errcode='40001'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in ('title','description','lead_id','status','priority','due_at','assigned_to')) then raise exception 'Invalid patch'; end if;
 if exists(select 1 from jsonb_each(patch) e where jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Invalid field type'; end if;
 updated:=previous;
 if patch ? 'title' then updated.title:=trim(patch->>'title'); end if;
 if patch ? 'description' then updated.description:=patch->>'description'; end if;
 if patch ? 'status' then updated.status:=patch->>'status'; end if;
 if patch ? 'priority' then updated.priority:=patch->>'priority'; end if;
 if patch ? 'lead_id' then updated.lead_id:=(patch->>'lead_id')::uuid; end if;
 if patch ? 'assigned_to' then updated.assigned_to:=(patch->>'assigned_to')::uuid; end if;
 if patch ? 'due_at' then updated.due_at:=(patch->>'due_at')::timestamptz; end if;
 if updated.lead_id is not null and not exists(select 1 from crm.leads where id=updated.lead_id and organization_id=previous.organization_id) then raise exception 'Invalid lead'; end if;
 -- Validate changed assignments; an inactive former assignee must not block unrelated edits.
 if patch ? 'assigned_to' and updated.assigned_to is not null and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=previous.organization_id and m.user_id=updated.assigned_to and m.ativo and p.ativo) then raise exception 'Invalid assignee'; end if;
 if updated is not distinct from previous then return previous.version; end if;
 updated.resolved_at:=case when updated.status='RESOLVED' then coalesce(previous.resolved_at,now()) else null end;
 update crm.support_demands set title=updated.title,description=updated.description,lead_id=updated.lead_id,status=updated.status,priority=updated.priority,due_at=updated.due_at,assigned_to=updated.assigned_to,resolved_at=updated.resolved_at,updated_at=now(),version=previous.version+1 where id=demand returning * into updated;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,changes)
 values(previous.organization_id,demand,auth.uid(),'UPDATED',jsonb_build_object('before',to_jsonb(previous)-'request_id','after',to_jsonb(updated)-'request_id'));
 return updated.version;
end $$;

create function crm.add_support_demand_note(demand uuid,note_body text,request_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; saved uuid; begin
 select organization_id into org from crm.support_demands where id=demand for update;
 if not found or auth.uid() is null or not crm.tenant_member(org) then raise exception 'Demand unavailable'; end if;
 if request_id is null then raise exception 'Request ID required'; end if;
 select a.id into saved from crm.support_demand_activity a where a.demand_id=demand and a.actor_id=auth.uid() and a.request_id=add_support_demand_note.request_id;
 if found then return saved; end if;
 if note_body is null or length(trim(note_body)) not between 1 and 10000 then raise exception 'Invalid note'; end if;
 insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind,body,request_id)
 values(org,demand,auth.uid(),'NOTE',trim(note_body),request_id) returning id into saved;
 return saved;
end $$;
revoke all on function crm.create_support_demand(uuid,text,text,uuid,text,timestamptz,uuid,uuid),crm.update_support_demand(uuid,integer,jsonb),crm.add_support_demand_note(uuid,text,uuid) from public,anon;
grant execute on function crm.create_support_demand(uuid,text,text,uuid,text,timestamptz,uuid,uuid),crm.update_support_demand(uuid,integer,jsonb),crm.add_support_demand_note(uuid,text,uuid) to authenticated;
-- Keep the established contact privacy workflows complete. Historical links count:
-- unlinking a demand must not strand personal information in its audit snapshots.
create or replace function crm.lead_privacy_export(lid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l crm.leads; demand_ids uuid[]; begin
 select * into l from crm.leads where id=lid;
 if not found or auth.uid() is null or not crm.tenant_member(l.organization_id,true) then raise exception 'Forbidden'; end if;
 select coalesce(array_agg(d.id),'{}'::uuid[]) into demand_ids from crm.support_demands d
 where d.organization_id=l.organization_id and (d.lead_id=lid or exists(
  select 1 from crm.support_demand_activity a where a.demand_id=d.id and a.organization_id=l.organization_id
  and (a.changes#>>'{before,lead_id}'=lid::text or a.changes#>>'{after,lead_id}'=lid::text)));
 return jsonb_build_object('lead',to_jsonb(l),
 'interactions',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from crm.interactions i where i.lead_id=lid),
 'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from crm.message_events e where e.lead_id=lid),
 'ai_runs',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from crm.ai_runs a where a.lead_id=lid),
 'handoffs',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from crm.human_handoffs h where h.lead_id=lid),
 'inbox_messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.received_at),'[]') from crm.inbox_messages m
  join crm.inbox_conversations c on c.id=m.conversation_id and c.organization_id=m.organization_id
  where c.organization_id=l.organization_id and c.lead_id=lid),
 'support_demands',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from crm.support_demands d where d.id=any(demand_ids)),
 'support_demand_activity',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from crm.support_demand_activity a where a.demand_id=any(demand_ids)));
end $$;
-- Existing erase_lead and ordinary authorized lead deletion both purge historical
-- support links. Normal operators cannot alter or delete activity individually.
create function crm.erase_support_demand_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from crm.support_demands d where d.organization_id=old.organization_id and (d.lead_id=old.id or exists(
  select 1 from crm.support_demand_activity a where a.demand_id=d.id and a.organization_id=old.organization_id
  and (a.changes#>>'{before,lead_id}'=old.id::text or a.changes#>>'{after,lead_id}'=old.id::text)));
 return old;
end $$;
create trigger erase_support_demand_history before delete on crm.leads
 for each row execute function crm.erase_support_demand_history();
revoke all on function crm.erase_support_demand_history() from public,anon,authenticated;
-- CREATE OR REPLACE preserves the export's prior grants; reinforce anon denial.
revoke all on function crm.lead_privacy_export(uuid) from public,anon;
commit;
