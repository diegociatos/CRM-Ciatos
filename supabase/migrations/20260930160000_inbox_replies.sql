begin;

alter table crm.inbox_messages add column delivery_status text
  check (delivery_status in ('SENDING','ACCEPTED','REVIEW'));
alter table crm.inbox_messages add column request_id uuid;
create unique index inbox_reply_request on crm.inbox_messages(request_id) where request_id is not null;

-- Keep one company-wide quota for campaigns, broadcasts and human replies.
create or replace function crm.emails_sent_today(org uuid) returns bigint
language sql stable security definer set search_path=crm,pg_temp as $$
 select (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id
         where a.organization_id=org and not n.dry_run and a.job_type='EMAIL' and a.dispatch_started_at>=date_trunc('day',now()))
      + (select count(*) from crm.broadcast_recipients r where r.organization_id=org
         and r.status in ('SENDING','SENT','FAILED') and coalesce(r.sent_at,r.locked_at)>=date_trunc('day',now()))
      + (select count(*) from crm.inbox_messages m where m.organization_id=org and m.direction='OUTBOUND'
         and m.received_at>=date_trunc('day',now()))
$$;

-- Service-only: the Edge Function supplies the authenticated actor. Reserving a
-- request before Graph prevents a timeout or double click from sending twice.
create function crm.reserve_inbox_reply(cid uuid, actor uuid, rid uuid, reply_body text)
returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; l crm.leads; p crm.outreach_policy; m crm.inbox_messages; address text; begin
 if actor is null or rid is null or length(trim(coalesce(reply_body,''))) not between 1 and 4000 then raise exception 'Invalid reply'; end if;
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or c.status='CLOSED' or not exists(
   select 1 from crm.organization_members om join crm.profiles pr on pr.id=om.user_id
   join crm.organizations o on o.id=om.organization_id
   where om.organization_id=c.organization_id and om.user_id=actor and om.ativo and pr.ativo and o.ativo
 ) then raise exception 'Conversation unavailable'; end if;
 if c.assigned_to is not null and c.assigned_to<>actor and not exists(
   select 1 from crm.organization_members where organization_id=c.organization_id and user_id=actor and ativo and papel='ADMIN'
 ) then raise exception 'Conversation assigned to another user'; end if;
 select * into m from crm.inbox_messages where request_id=rid;
 if found then
   if m.conversation_id<>cid or m.author_id<>actor or m.body<>trim(reply_body) then raise exception 'Request ID already used'; end if;
   return jsonb_build_object('send',false,'status',m.delivery_status,'message_id',m.id);
 end if;
 select * into l from crm.leads where id=c.lead_id and organization_id=c.organization_id;
 if not found or l.opt_out or l.email is null or l.email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
 or exists(select 1 from crm.suppression_list where organization_id=c.organization_id and lower(email)=lower(l.email))
 then raise exception 'Contact blocked or invalid'; end if;
 select lower(sender) into address from crm.inbox_messages
 where conversation_id=cid and direction='INBOUND' order by received_at desc,id desc limit 1;
 if address is null or address<>lower(l.email) or c.subject !~* '\[Ciatos:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]'
 then raise exception 'Reply correlation requires review'; end if;
 select * into p from crm.outreach_policy where organization_id=c.organization_id for update;
 if not found or not p.live_enabled or p.sender is null then raise exception 'Sending disabled for company'; end if;
 perform pg_advisory_xact_lock(hashtext(lower(p.sender)));
 if crm.emails_sent_today(c.organization_id) >= p.daily_limit
 or (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id
     join crm.outreach_policy x on x.organization_id=a.organization_id
     where lower(x.sender)=lower(p.sender) and not n.dry_run and a.job_type='EMAIL' and a.dispatch_started_at>=date_trunc('day',now()))
   + (select count(*) from crm.inbox_messages im join crm.outreach_policy x on x.organization_id=im.organization_id
      where im.direction='OUTBOUND' and lower(x.sender)=lower(p.sender) and im.received_at>=date_trunc('day',now())) >= p.mailbox_daily_limit
 then raise exception 'Daily sending limit reached'; end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,sender,recipient,subject,body,author_id,delivery_status,request_id)
 values(cid,c.organization_id,'OUTBOUND','microsoft365',p.sender,l.email,left(c.subject,250),trim(reply_body),actor,'SENDING',rid)
 returning * into m;
 update crm.inbox_conversations set status='IN_PROGRESS',assigned_to=coalesce(assigned_to,actor),last_message_at=now(),updated_at=now() where id=cid;
 return jsonb_build_object('send',true,'status','SENDING','message_id',m.id,'sender',p.sender,
  'sender_name',coalesce(p.sender_name,(select nome from crm.organizations where id=c.organization_id)),
  'reply_to',p.reply_to,'recipient',l.email,'subject',m.subject,'body',m.body);
end $$;

create function crm.finish_inbox_reply(rid uuid, result text)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$
begin
 if result not in ('ACCEPTED','REVIEW') then raise exception 'Invalid result'; end if;
 update crm.inbox_messages set delivery_status=result
 where request_id=rid and direction='OUTBOUND' and delivery_status='SENDING';
 if not found then raise exception 'Reply not pending'; end if;
end $$;

revoke execute on function crm.reserve_inbox_reply(uuid,uuid,uuid,text),crm.finish_inbox_reply(uuid,text) from public,anon,authenticated;
grant execute on function crm.reserve_inbox_reply(uuid,uuid,uuid,text),crm.finish_inbox_reply(uuid,text) to service_role;

commit;
