begin;

-- The Inbox starts with replies to CRM campaign messages. A conversation belongs
-- to exactly one company and one lead; external message IDs are idempotent.
create table crm.inbox_conversations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 lead_id uuid not null,
 channel text not null default 'email' check(channel in ('email')),
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','CLOSED')),
 assigned_to uuid references crm.profiles(id) on delete set null,
 subject text not null default '',
 last_message_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade,
 unique(organization_id,lead_id,channel),
 unique(id,organization_id)
);
create index inbox_conversations_recent on crm.inbox_conversations(organization_id,last_message_at desc);

create table crm.inbox_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null,
 organization_id uuid not null,
 direction text not null check(direction in ('INBOUND','OUTBOUND','INTERNAL')),
 provider text not null check(provider in ('microsoft365','crm')),
 external_id text,
 sender text not null default '',
 recipient text not null default '',
 subject text not null default '',
 body text not null check(length(body) between 1 and 8000),
 classification text check(classification in ('hot','review','opt_out','automatic')),
 author_id uuid references crm.profiles(id) on delete set null,
 received_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 foreign key(conversation_id,organization_id) references crm.inbox_conversations(id,organization_id) on delete cascade,
 unique(organization_id,provider,external_id)
);
create index inbox_messages_thread on crm.inbox_messages(conversation_id,received_at,id);

create table crm.inbox_reads (
 conversation_id uuid not null,
 organization_id uuid not null,
 user_id uuid not null references crm.profiles(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(conversation_id,user_id),
 foreign key(conversation_id,organization_id) references crm.inbox_conversations(id,organization_id) on delete cascade
);

alter table crm.inbox_conversations enable row level security;
alter table crm.inbox_messages enable row level security;
alter table crm.inbox_reads enable row level security;
create policy inbox_conversations_read on crm.inbox_conversations for select to authenticated using(crm.tenant_member(organization_id));
create policy inbox_messages_read on crm.inbox_messages for select to authenticated using(crm.tenant_member(organization_id));
create policy inbox_reads_own on crm.inbox_reads for select to authenticated using(user_id=auth.uid() and crm.tenant_member(organization_id));
grant select on crm.inbox_conversations,crm.inbox_messages,crm.inbox_reads to authenticated;
grant all on crm.inbox_conversations,crm.inbox_messages,crm.inbox_reads to service_role;

create function crm.capture_sdr_inbox_reply(jid bigint,event_key text,category text,summary text,message_body text,sender_email text,reply_subject text,received_at timestamptz)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare j crm.automation_jobs; c uuid; clean_body text; begin
 select * into j from crm.automation_jobs where id=jid for update;
 clean_body:=left(trim(message_body),8000);
 if not found or length(event_key) not between 1 and 500 or length(clean_body)<1 or length(sender_email)>254
    or lower(trim(sender_email)) is distinct from lower(j.payload->>'recipient')
    or received_at is null then raise exception 'Invalid reply'; end if;
 perform crm.record_sdr_reply(jid,event_key,category,summary);
 if exists(select 1 from crm.inbox_messages where organization_id=j.organization_id and provider='microsoft365' and external_id=event_key) then return; end if;
 insert into crm.inbox_conversations(organization_id,lead_id,channel,status,subject,last_message_at)
 values(j.organization_id,j.lead_id,'email',case when category='automatic' then 'CLOSED' else 'OPEN' end,
        left(coalesce(reply_subject,''),250),received_at)
 on conflict(organization_id,lead_id,channel) do update set
   status=case when category='automatic' then crm.inbox_conversations.status else 'OPEN' end,
   last_message_at=greatest(crm.inbox_conversations.last_message_at,excluded.last_message_at),
   updated_at=now()
 returning id into c;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,external_id,sender,recipient,subject,body,classification,received_at)
 values(c,j.organization_id,'INBOUND','microsoft365',event_key,lower(trim(sender_email)),
        coalesce(j.payload->>'sender',''),left(coalesce(reply_subject,''),250),clean_body,category,received_at)
 on conflict(organization_id,provider,external_id) do nothing;
end $$;

create function crm.add_inbox_note(cid uuid,note_text text)
returns uuid language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; mid uuid; begin
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or not crm.tenant_member(c.organization_id) or length(trim(note_text)) not between 1 and 4000 then raise exception 'Invalid note or access'; end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,body,author_id)
 values(c.id,c.organization_id,'INTERNAL','crm',trim(note_text),auth.uid()) returning id into mid;
 update crm.inbox_conversations set updated_at=now() where id=cid;
 return mid;
end $$;

create function crm.update_inbox_conversation(cid uuid,new_status text,new_assignee uuid)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; begin
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or not crm.tenant_member(c.organization_id) or new_status not in ('OPEN','IN_PROGRESS','CLOSED') then raise exception 'Invalid conversation or access'; end if;
 if new_assignee is not null and not exists(
  select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
  where m.organization_id=c.organization_id and m.user_id=new_assignee and m.ativo and p.ativo
 ) then raise exception 'Assignee is not a company member'; end if;
 update crm.inbox_conversations set status=new_status,assigned_to=new_assignee,updated_at=now() where id=cid;
end $$;

create function crm.mark_inbox_read(cid uuid)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare org uuid; begin
 select organization_id into org from crm.inbox_conversations where id=cid;
 if org is null or not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
 insert into crm.inbox_reads(conversation_id,organization_id,user_id,read_at) values(cid,org,auth.uid(),now())
 on conflict(conversation_id,user_id) do update set read_at=excluded.read_at;
end $$;

revoke execute on function crm.capture_sdr_inbox_reply(bigint,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function crm.capture_sdr_inbox_reply(bigint,text,text,text,text,text,text,timestamptz) to service_role;
revoke execute on function crm.add_inbox_note(uuid,text),crm.update_inbox_conversation(uuid,text,uuid),crm.mark_inbox_read(uuid) from public,anon;
grant execute on function crm.add_inbox_note(uuid,text),crm.update_inbox_conversation(uuid,text,uuid),crm.mark_inbox_read(uuid) to authenticated;

-- Include the newly stored correspondence and team notes in the existing
-- privacy export. Erasure already cascades from leads through conversations.
create or replace function crm.lead_privacy_export(lid uuid) returns jsonb
language plpgsql security definer set search_path=crm,pg_temp as $$
declare l crm.leads; begin
 select * into l from crm.leads where id=lid;
 if not found or not coalesce(crm.tenant_member(l.organization_id,true),false) then raise exception 'Forbidden'; end if;
 return jsonb_build_object('lead',to_jsonb(l),
  'interactions',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from crm.interactions i where i.lead_id=lid),
  'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from crm.message_events e where e.lead_id=lid),
  'ai_runs',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from crm.ai_runs a where a.lead_id=lid),
  'handoffs',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from crm.human_handoffs h where h.lead_id=lid),
  'inbox_messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.received_at),'[]') from crm.inbox_messages m
   join crm.inbox_conversations c on c.id=m.conversation_id and c.organization_id=m.organization_id
   where c.organization_id=l.organization_id and c.lead_id=lid));
end $$;

commit;
