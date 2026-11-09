-- Atendimento, fase B: e-mail de suporte espontaneo (sem depender de token de campanha), contatos sem lead,
-- protocolo, assuntos separados por conversa, confirmacao automatica CONTROLADA (texto aprovado, desligada
-- por padrao, idempotente, com reconciliacao de resultado incerto). Incremental: nada aqui liga canal, leitura
-- ou envio. O worker so age com a conta habilitada aqui E as chaves de servidor (ver docs).
begin;

-- Pessoa que escreve para o suporte: identidade por canal (e-mail exato). Nunca fundida por nome parecido
-- e nunca vira lead/oportunidade automaticamente.
create table crm.support_people (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 name text not null default '',
 email text not null check(length(email) between 3 and 254 and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
 created_at timestamptz not null default now(),
 unique(id,organization_id)
);
create unique index support_people_email on crm.support_people(organization_id,lower(email));
alter table crm.support_people enable row level security;
create policy support_people_read on crm.support_people for select to authenticated using(crm.support_member(organization_id));
revoke all on crm.support_people from public,anon,authenticated;
grant select on crm.support_people to authenticated;
grant all on crm.support_people to service_role;

alter table crm.inbox_conversations alter column lead_id drop not null;
alter table crm.inbox_conversations
 add column person_id uuid,
 add column thread_key text check(thread_key is null or length(thread_key) between 1 and 500),
 add column protocol text,
 add column source text not null default 'campaign' check(source in ('campaign','support_mail'));
alter table crm.inbox_conversations add constraint inbox_conversations_person_fk foreign key(person_id,organization_id) references crm.support_people(id,organization_id) on delete cascade;
alter table crm.inbox_conversations add constraint inbox_conversations_contact check(lead_id is not null or person_id is not null);
-- Um assunto (thread do e-mail) = um atendimento; assuntos diferentes da mesma pessoa ficam separados.
create unique index inbox_conversations_thread on crm.inbox_conversations(organization_id,channel,thread_key) where thread_key is not null;

-- Protocolo sequencial por empresa.
create table crm.support_protocol_counters (organization_id uuid primary key references crm.organizations(id) on delete cascade, last_value integer not null default 0);
alter table crm.support_protocol_counters enable row level security;
revoke all on crm.support_protocol_counters from public,anon,authenticated;
create function crm.next_support_protocol(org uuid) returns text language plpgsql security definer set search_path=crm,pg_temp as $$
declare n integer; begin
 insert into crm.support_protocol_counters(organization_id,last_value) values(org,1) on conflict(organization_id) do update set last_value=crm.support_protocol_counters.last_value+1 returning last_value into n;
 return 'ATD-'||lpad(n::text,6,'0');
end $$;
with numbered as (select id,organization_id,row_number() over(partition by organization_id order by created_at,id) rn from crm.inbox_conversations)
 update crm.inbox_conversations c set protocol='ATD-'||lpad(numbered.rn::text,6,'0') from numbered where numbered.id=c.id;
insert into crm.support_protocol_counters(organization_id,last_value) select organization_id,count(*) from crm.inbox_conversations group by organization_id on conflict(organization_id) do update set last_value=excluded.last_value;
create unique index inbox_conversations_protocol on crm.inbox_conversations(organization_id,protocol);
create function crm.inbox_conversation_protocol() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if new.protocol is null then new.protocol:=crm.next_support_protocol(new.organization_id); end if;
 return new;
end $$;
create trigger inbox_conversation_protocol before insert on crm.inbox_conversations for each row execute function crm.inbox_conversation_protocol();

-- Canal de e-mail de suporte por empresa (desligado por padrao). Uma caixa pertence a uma unica empresa.
create table crm.support_channel_accounts (
 organization_id uuid primary key references crm.organizations(id) on delete cascade,
 mailbox text check(mailbox is null or mailbox ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
 ingest_enabled boolean not null default false,
 auto_ack_enabled boolean not null default false,
 watermark timestamptz not null default now(),
 next_path text, last_sync_at timestamptz, last_error text, lease uuid, locked_at timestamptz,
 updated_by uuid references crm.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create unique index support_channel_mailbox on crm.support_channel_accounts(lower(mailbox)) where mailbox is not null;
create table crm.support_ack_templates (
 organization_id uuid primary key references crm.organizations(id) on delete cascade,
 subject text not null check(length(subject) between 3 and 200),
 body text not null check(length(body) between 20 and 2000),
 status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED')),
 approved_by uuid references crm.profiles(id) on delete set null,
 approved_at timestamptz,
 updated_by uuid references crm.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table crm.support_outbox (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 conversation_id uuid not null,
 kind text not null default 'ACK' check(kind in ('ACK')),
 recipient text not null,
 mailbox text not null,
 subject text not null,
 body text not null,
 status text not null default 'QUEUED' check(status in ('QUEUED','SENDING','ACCEPTED','FAILED','UNCERTAIN','CANCELLED')),
 attempts integer not null default 0,
 evidence text check(evidence is null or evidence in ('provider_accepted','sent_items_match','manual_confirmation')),
 last_error text,
 queued_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz,
 foreign key(conversation_id,organization_id) references crm.inbox_conversations(id,organization_id) on delete cascade,
 unique(conversation_id,kind)
);
create index support_outbox_status on crm.support_outbox(status,queued_at);
alter table crm.support_channel_accounts enable row level security;
alter table crm.support_ack_templates enable row level security;
alter table crm.support_outbox enable row level security;
create policy support_channel_read on crm.support_channel_accounts for select to authenticated using(crm.support_manager(organization_id));
create policy support_ack_template_read on crm.support_ack_templates for select to authenticated using(crm.support_manager(organization_id));
create policy support_outbox_read on crm.support_outbox for select to authenticated using(crm.support_member(organization_id));
revoke all on crm.support_channel_accounts,crm.support_ack_templates,crm.support_outbox from public,anon,authenticated;
grant select on crm.support_channel_accounts,crm.support_ack_templates,crm.support_outbox to authenticated;
grant all on crm.support_channel_accounts,crm.support_ack_templates,crm.support_outbox to service_role;

-- Texto da confirmacao: so placeholders conhecidos, sem prometer prazo numerico. Edicao exige nova aprovacao.
create function crm.save_support_ack_template(org uuid,tpl_subject text,tpl_body text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare s text:=trim(coalesce(tpl_subject,'')); b text:=trim(coalesce(tpl_body,'')); begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if length(s) not between 3 and 200 or length(b) not between 20 and 2000 then raise exception 'Invalid template'; end if;
 if position('{{protocolo}}' in b)=0 then raise exception 'O texto precisa conter {{protocolo}}'; end if;
 if (s||' '||b) ~ '\{\{[^}]*\}\}' and regexp_replace(s||' '||b,'\{\{(protocolo|nome)\}\}','','g') ~ '\{\{' then raise exception 'Placeholder desconhecido'; end if;
 if (s||' '||b) ~* '(em at[eé]|dentro de|no prazo de|prazo de|responderemos em)\s*\d' or (s||' '||b) ~* '\d+\s*(horas|h|dias|minutos)\s*(uteis|úteis)?\s*(para|de resposta)' then raise exception 'Não prometa prazos numéricos na confirmação'; end if;
 insert into crm.support_ack_templates(organization_id,subject,body,status,updated_by,updated_at) values(org,s,b,'DRAFT',auth.uid(),now())
 on conflict(organization_id) do update set subject=excluded.subject,body=excluded.body,status='DRAFT',approved_by=null,approved_at=null,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 update crm.support_channel_accounts set auto_ack_enabled=false,updated_at=now() where organization_id=org and auto_ack_enabled;
 insert into crm.support_audit(organization_id,actor,action,detail) values(org,auth.uid(),'ACK_TEMPLATE_SAVED','{}');
end $$;
create function crm.approve_support_ack_template(org uuid) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 update crm.support_ack_templates set status='APPROVED',approved_by=auth.uid(),approved_at=now() where organization_id=org;
 if not found then raise exception 'No template'; end if;
 insert into crm.support_audit(organization_id,actor,action,detail) values(org,auth.uid(),'ACK_TEMPLATE_APPROVED','{}');
end $$;
create function crm.save_support_channel(org uuid,box text,ingest boolean,ack boolean) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare m text:=nullif(lower(trim(coalesce(box,''))),''); prev crm.support_channel_accounts; begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if (ingest or ack) and m is null then raise exception 'Informe a caixa de e-mail'; end if;
 if ack and not ingest then raise exception 'A confirmação automática exige a leitura da caixa'; end if;
 if ack and not exists(select 1 from crm.support_ack_templates where organization_id=org and status='APPROVED') then raise exception 'Aprove o texto da confirmação antes de habilitar'; end if;
 select * into prev from crm.support_channel_accounts where organization_id=org for update;
 insert into crm.support_channel_accounts(organization_id,mailbox,ingest_enabled,auto_ack_enabled,watermark,updated_by,updated_at) values(org,m,ingest,ack,now(),auth.uid(),now())
 on conflict(organization_id) do update set mailbox=excluded.mailbox,ingest_enabled=excluded.ingest_enabled,auto_ack_enabled=excluded.auto_ack_enabled,
  -- a leitura comeca na ativacao (sem importar historico anterior) e quando a caixa muda
  watermark=case when (excluded.ingest_enabled and not crm.support_channel_accounts.ingest_enabled) or excluded.mailbox is distinct from crm.support_channel_accounts.mailbox then now() else crm.support_channel_accounts.watermark end,
  next_path=case when excluded.mailbox is distinct from crm.support_channel_accounts.mailbox then null else crm.support_channel_accounts.next_path end,
  updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into crm.support_audit(organization_id,actor,action,detail) values(org,auth.uid(),'CHANNEL_SAVED',jsonb_build_object('mailbox',m,'ingest',ingest,'auto_ack',ack));
exception when unique_violation then raise exception 'Esta caixa já pertence a outra empresa';
end $$;
create function crm.get_support_channel(org uuid) returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare a crm.support_channel_accounts; t crm.support_ack_templates; begin
 if auth.uid() is null or not crm.support_manager(org) then raise exception 'Forbidden'; end if;
 select * into a from crm.support_channel_accounts where organization_id=org;
 select * into t from crm.support_ack_templates where organization_id=org;
 return jsonb_build_object('can_manage',crm.pode_administrar(org),
  'account',jsonb_build_object('mailbox',a.mailbox,'ingest_enabled',coalesce(a.ingest_enabled,false),'auto_ack_enabled',coalesce(a.auto_ack_enabled,false),'last_sync_at',a.last_sync_at),
  'template',jsonb_build_object('subject',t.subject,'body',t.body,'status',coalesce(t.status,'NONE'),'approved_at',t.approved_at));
end $$;

-- Gestor resolve falhas/incertezas de forma explicita: incerto nunca e reenviado sem antes ser reconciliado.
create function crm.resolve_support_outbox(oid uuid,action text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare o crm.support_outbox; begin
 select * into o from crm.support_outbox where id=oid for update;
 if not found or auth.uid() is null or not crm.support_manager(o.organization_id) then raise exception 'Unavailable'; end if;
 if action='confirm_sent' and o.status in ('UNCERTAIN','FAILED') then
  update crm.support_outbox set status='ACCEPTED',evidence='manual_confirmation',finished_at=now() where id=oid;
 elsif action='confirm_not_sent' and o.status='UNCERTAIN' then
  update crm.support_outbox set status='FAILED',last_error='Conferido manualmente: não foi enviado',finished_at=now() where id=oid;
 elsif action='retry' and o.status='FAILED' and o.attempts<5 then
  update crm.support_outbox set status='QUEUED',last_error=null,queued_at=now() where id=oid;
 elsif action='cancel' and o.status in ('QUEUED','FAILED','UNCERTAIN') then
  update crm.support_outbox set status='CANCELLED',finished_at=now() where id=oid;
 else raise exception 'Ação inválida para o estado atual'; end if;
 insert into crm.support_audit(organization_id,actor,action,subject,detail) values(o.organization_id,auth.uid(),'OUTBOX_'||upper(action),oid,jsonb_build_object('from',o.status));
end $$;

-- Ingestao (somente servidor): idempotente por id externo, ignora automaticas/no-reply/proprio remetente.
create function crm.claim_support_account() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare a crm.support_channel_accounts; begin
 select * into a from crm.support_channel_accounts where ingest_enabled and mailbox is not null and (locked_at is null or locked_at<now()-interval '5 minutes')
  order by coalesce(last_sync_at,'-infinity') for update skip locked limit 1;
 if not found then return null; end if;
 update crm.support_channel_accounts set lease=gen_random_uuid(),locked_at=now() where organization_id=a.organization_id returning * into a;
 return to_jsonb(a)-'last_error';
end $$;
create function crm.finish_support_account(org uuid,token uuid,next_url text,through_at timestamptz,failure text default null) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 update crm.support_channel_accounts set next_path=case when failure is null then next_url else next_path end,
  watermark=case when failure is null and next_url is null then through_at else watermark end,
  last_error=failure,last_sync_at=case when failure is null then now() else last_sync_at end,lease=null,locked_at=null
 where organization_id=org and lease=token;
end $$;
create function crm.ingest_support_email(org uuid,ext_id text,thread text,sender text,sender_name text,mail_subject text,mail_body text,received timestamptz,automatic boolean,box text,verified boolean default false) returns jsonb
language plpgsql security definer set search_path=crm,pg_temp as $$
declare acc crm.support_channel_accounts; addr text:=lower(trim(coalesce(sender,''))); pid uuid; cid uuid; made boolean:=false; tpl crm.support_ack_templates; prot text; queued boolean:=false; clean text; todays integer; rows integer; begin
 select * into acc from crm.support_channel_accounts where organization_id=org and ingest_enabled and mailbox is not null for update;
 if not found then raise exception 'Channel disabled'; end if;
 -- A caixa lida precisa ser a caixa atual da empresa (troca de caixa durante a leitura nao mistura empresas).
 if lower(coalesce(box,''))<>lower(acc.mailbox) then raise exception 'Mailbox changed'; end if;
 if length(coalesce(ext_id,'')) not between 1 and 500 or length(coalesce(thread,'')) not between 1 and 500 or received is null
  or addr !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or length(addr)>254 then raise exception 'Invalid message'; end if;
 if automatic or addr=lower(acc.mailbox) or split_part(addr,'@',1) ~* '^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)' then return jsonb_build_object('status','skipped'); end if;
 if exists(select 1 from crm.inbox_messages where organization_id=org and provider='microsoft365' and external_id=ext_id) then return jsonb_build_object('status','duplicate'); end if;
 clean:=left(trim(coalesce(mail_body,'')),8000);
 if length(clean)<1 then clean:='(Mensagem sem texto legível; confira a caixa de e-mail.)'; end if;
 insert into crm.support_people(organization_id,name,email) values(org,left(trim(coalesce(sender_name,'')),200),addr)
  on conflict(organization_id,lower(email)) do update set name=case when crm.support_people.name='' then excluded.name else crm.support_people.name end returning id into pid;
 select id into cid from crm.inbox_conversations where organization_id=org and channel='email' and thread_key=thread and person_id=pid for update;
 if not found then
  -- outro participante no mesmo thread nao entra na conversa de outra pessoa: atendimento proprio
  thread:=case when exists(select 1 from crm.inbox_conversations where organization_id=org and channel='email' and thread_key=thread) then left(thread,440)||'#'||pid::text else thread end;
  select id into cid from crm.inbox_conversations where organization_id=org and channel='email' and thread_key=thread for update;
 end if;
 if not found then
  insert into crm.inbox_conversations(organization_id,person_id,channel,status,subject,last_message_at,thread_key,source)
  values(org,pid,'email','OPEN',left(coalesce(mail_subject,''),250),received,thread,'support_mail') returning id,protocol into cid,prot;
  made:=true;
 else
  update crm.inbox_conversations set status=case when status='CLOSED' then 'OPEN' else status end,last_message_at=greatest(last_message_at,received),updated_at=now() where id=cid returning protocol into prot;
 end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,external_id,sender,recipient,subject,body,received_at)
 values(cid,org,'INBOUND','microsoft365',ext_id,addr,lower(acc.mailbox),left(coalesce(mail_subject,''),250),clean,received);
 if made and acc.auto_ack_enabled then
  select * into tpl from crm.support_ack_templates where organization_id=org and status='APPROVED';
  select count(*) into todays from crm.support_outbox where organization_id=org and kind='ACK' and queued_at>=date_trunc('day',now());
  if verified and tpl.organization_id is not null and todays<200 and not exists(select 1 from crm.support_outbox o where o.organization_id=org and lower(o.recipient)=addr and o.kind='ACK' and o.queued_at>now()-interval '24 hours') then
   insert into crm.support_outbox(organization_id,conversation_id,kind,recipient,mailbox,subject,body)
   values(org,cid,'ACK',addr,lower(acc.mailbox),replace(replace(tpl.subject,'{{protocolo}}',prot),'{{nome}}',coalesce(nullif((select name from crm.support_people where id=pid),''),'')),
          replace(replace(tpl.body,'{{protocolo}}',prot),'{{nome}}',coalesce(nullif((select name from crm.support_people where id=pid),''),''))) on conflict do nothing;
   get diagnostics rows=row_count; queued:=rows>0;
  end if;
 end if;
 return jsonb_build_object('status','stored','conversation_id',cid,'protocol',prot,'created',made,'ack_queued',queued);
end $$;

-- Fila de envio da confirmacao (somente servidor).
create function crm.claim_support_outbox() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare r crm.support_outbox; begin
 update crm.support_outbox set status='UNCERTAIN',finished_at=now(),last_error='Envio interrompido sem confirmação' where status='SENDING' and started_at<now()-interval '5 minutes';
 -- Nao envia confirmacao tardia nem depois de resposta humana aceita ou com o atendimento ja concluido.
 update crm.support_outbox o set status='CANCELLED',finished_at=now(),last_error='Cancelada antes do envio' where o.status='QUEUED' and (
  o.queued_at<now()-interval '6 hours' or not exists(select 1 from crm.support_channel_accounts a where a.organization_id=o.organization_id and lower(a.mailbox)=lower(o.mailbox)) or exists(select 1 from crm.inbox_conversations c where c.id=o.conversation_id and (c.first_human_reply_at is not null or c.status='CLOSED')));
 select o.* into r from crm.support_outbox o join crm.support_channel_accounts a on a.organization_id=o.organization_id and a.auto_ack_enabled and a.ingest_enabled and a.mailbox is not null
  where o.status='QUEUED' order by o.queued_at for update of o skip locked limit 1;
 if not found then return null; end if;
 update crm.support_outbox set status='SENDING',attempts=attempts+1,started_at=now() where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
create function crm.finish_support_outbox(oid uuid,outcome text,failure text default null) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if outcome not in ('ACCEPTED','FAILED','UNCERTAIN') then raise exception 'Invalid result'; end if;
 update crm.support_outbox set status=outcome,evidence=case when outcome='ACCEPTED' then 'provider_accepted' end,last_error=left(failure,300),finished_at=now() where id=oid and status='SENDING';
 if not found then raise exception 'Not sending'; end if;
end $$;
create function crm.list_support_outbox_uncertain() returns jsonb language sql stable security definer set search_path=crm,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'mailbox',o.mailbox,'started_at',o.started_at)),'[]') from (select * from crm.support_outbox where status='UNCERTAIN' and finished_at<now()-interval '2 minutes' order by finished_at limit 20) o
$$;
create function crm.reconcile_support_outbox(oid uuid,found_in_sent boolean) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare o crm.support_outbox; begin
 select * into o from crm.support_outbox where id=oid for update;
 if not found or o.status<>'UNCERTAIN' then return; end if;
 if found_in_sent then update crm.support_outbox set status='ACCEPTED',evidence='sent_items_match',finished_at=now() where id=oid;
 elsif o.started_at<now()-interval '15 minutes' then
  -- Ausencia em Itens Enviados nao prova que nao foi enviada (copia removida/movida): segue incerta e exige conferencia humana.
  update crm.support_outbox set last_error='Não encontrada em Itens Enviados; confira a caixa antes de decidir' where id=oid;
 end if;
end $$;

-- Resposta humana a uma pessoa sem lead (mesmas garantias do Inbox atual: idempotente, uma pessoa por vez).
create function crm.reserve_support_reply(cid uuid,actor uuid,rid uuid,reply_body text) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; p crm.support_people; a crm.support_channel_accounts; m crm.inbox_messages; address text; sent_today integer; begin
 if actor is null or rid is null or length(trim(coalesce(reply_body,''))) not between 1 and 4000 then raise exception 'Invalid reply'; end if;
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or c.status='CLOSED' or c.person_id is null or not exists(
  select 1 from crm.organization_members om join crm.profiles pr on pr.id=om.user_id join crm.organizations o on o.id=om.organization_id
  where om.organization_id=c.organization_id and om.user_id=actor and om.ativo and pr.ativo and o.ativo) then raise exception 'Conversation unavailable'; end if;
 if c.assigned_to is not null and c.assigned_to<>actor and not exists(select 1 from crm.organization_members where organization_id=c.organization_id and user_id=actor and ativo and (papel='ADMIN' or operating_role='MANAGER')) then raise exception 'Conversation assigned to another user'; end if;
 select * into m from crm.inbox_messages where request_id=rid;
 if found then
  if m.conversation_id<>cid or m.author_id<>actor or m.body<>trim(reply_body) then raise exception 'Request ID already used'; end if;
  return jsonb_build_object('send',false,'status',m.delivery_status,'message_id',m.id);
 end if;
 select * into p from crm.support_people where id=c.person_id and organization_id=c.organization_id;
 select * into a from crm.support_channel_accounts where organization_id=c.organization_id and ingest_enabled and mailbox is not null;
 if p.id is null or a.organization_id is null then raise exception 'Support channel not enabled'; end if;
 select lower(sender) into address from crm.inbox_messages where conversation_id=cid and direction='INBOUND' order by received_at desc,id desc limit 1;
 if address is null or address<>lower(p.email) then raise exception 'Reply correlation requires review'; end if;
 perform pg_advisory_xact_lock(hashtext(lower(a.mailbox)));
 select (select count(*) from crm.inbox_messages where organization_id=c.organization_id and direction='OUTBOUND' and received_at>=date_trunc('day',now()))
  +(select count(*) from crm.support_outbox where organization_id=c.organization_id and status in ('SENDING','ACCEPTED') and started_at>=date_trunc('day',now())) into sent_today;
 if sent_today>=300 then raise exception 'Daily sending limit reached'; end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,sender,recipient,subject,body,author_id,delivery_status,request_id)
 values(cid,c.organization_id,'OUTBOUND','microsoft365',a.mailbox,p.email,left(c.subject,250),trim(reply_body),actor,'SENDING',rid) returning * into m;
 update crm.inbox_conversations set status='IN_PROGRESS',assigned_to=coalesce(assigned_to,actor),last_message_at=now(),updated_at=now() where id=cid;
 return jsonb_build_object('send',true,'status','SENDING','message_id',m.id,'sender',a.mailbox,'sender_name',(select nome from crm.organizations where id=c.organization_id),'reply_to',null,'recipient',p.email,'subject',m.subject,'body',m.body);
end $$;

-- Contato por conversa (lead ou pessoa), sem acesso a tabela de leads.
create function crm.support_conversation_contacts(org uuid,cids uuid[]) returns table(conversation_id uuid,nome text,empresa text,email text,telefone text,opt_out boolean,is_person boolean)
language plpgsql stable security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 return query select c.id,coalesce(l.nome,nullif(pp.name,'')),l.empresa,coalesce(l.email,pp.email),l.telefone,coalesce(l.opt_out,false),c.person_id is not null
  from crm.inbox_conversations c left join crm.leads l on l.id=c.lead_id and l.organization_id=c.organization_id left join crm.support_people pp on pp.id=c.person_id and pp.organization_id=c.organization_id
  where c.organization_id=org and c.id=any(coalesce(cids,'{}'));
end $$;

-- Privacidade: exportacao e exclusao de uma pessoa do suporte (somente administrador da empresa).
create function crm.support_person_export(org uuid,person uuid) returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare p crm.support_people; begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 select * into p from crm.support_people where id=person and organization_id=org;
 if not found then raise exception 'Not found'; end if;
 return jsonb_build_object('person',to_jsonb(p),
  'conversations',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from crm.inbox_conversations c where c.person_id=person and c.organization_id=org),
  'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.received_at),'[]') from crm.inbox_messages m join crm.inbox_conversations c on c.id=m.conversation_id and c.organization_id=m.organization_id where c.person_id=person and c.organization_id=org),
  'outbox',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from crm.support_outbox o join crm.inbox_conversations c on c.id=o.conversation_id and c.organization_id=o.organization_id where c.person_id=person and c.organization_id=org));
end $$;
create function crm.support_person_erase(org uuid,person uuid) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 delete from crm.support_people where id=person and organization_id=org;
 if not found then raise exception 'Not found'; end if;
 insert into crm.support_audit(organization_id,actor,action,subject) values(org,auth.uid(),'PERSON_ERASED',person);
end $$;

-- Fila e painel passam a enxergar pessoas (sem lead), protocolo e o estado da confirmacao automatica.
create or replace function crm.support_queue(org uuid,scope text default 'open',query text default '',max_rows integer default 50,skip_rows integer default 0,only_assignee uuid default null,from_at timestamptz default null,to_at timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare needle text:=lower(trim(coalesce(query,''))); total integer; rows jsonb; begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 if scope not in ('mine','unassigned','awaiting_first','awaiting_reply','attention','overdue_resolution','uncertain','reopened','received','open','closed','all','ack_pending','ack_failed') then raise exception 'Invalid scope'; end if;
 if only_assignee is not null and not crm.support_manager(org) and only_assignee<>auth.uid() then raise exception 'Forbidden'; end if;
 with s as (select coalesce((select first_response_hours from crm.support_desk_settings where organization_id=org),4) frh, coalesce((select resolution_hours from crm.support_desk_settings where organization_id=org),72) rh),
 b as (
  select c.id,c.lead_id,c.person_id,c.protocol,c.source,c.subject,c.status,c.assigned_to,c.created_at,c.last_message_at,c.awaiting_human,c.last_customer_message_at,c.first_human_reply_at,c.reopen_count,c.reopened_at,c.resolved_at,c.resolution_note,
   coalesce(l.nome,nullif(pp.name,'')) nome,l.empresa,coalesce(l.email,pp.email) email,coalesce(l.opt_out,false) opt_out,
   (c.awaiting_human and c.status<>'CLOSED') waiting,
   coalesce(c.last_customer_message_at,c.created_at)+make_interval(hours=>s.frh) reply_due_at,
   coalesce(c.reopened_at,c.created_at)+make_interval(hours=>s.rh) resolution_due_at,
   exists(select 1 from crm.inbox_messages m where m.conversation_id=c.id and m.direction='OUTBOUND' and m.delivery_status in ('SENDING','REVIEW')) uncertain_send,
   (select o.status from crm.support_outbox o where o.conversation_id=c.id and o.kind='ACK') ack_status,
   (select left(m.body,160) from crm.inbox_messages m where m.conversation_id=c.id and m.direction<>'INTERNAL' order by m.received_at desc,m.id desc limit 1) last_text
  from crm.inbox_conversations c left join crm.leads l on l.id=c.lead_id and l.organization_id=c.organization_id
  left join crm.support_people pp on pp.id=c.person_id and pp.organization_id=c.organization_id cross join s
  where c.organization_id=org and (only_assignee is null or c.assigned_to=only_assignee)
 ),
 f as (
  select *,(waiting and reply_due_at<now()) reply_overdue,(status<>'CLOSED' and resolution_due_at<now()) resolution_overdue from b
  where (needle='' or lower(coalesce(nome,'')||' '||coalesce(empresa,'')||' '||coalesce(email,'')||' '||subject||' '||coalesce(protocol,'')) like '%'||replace(replace(replace(needle,'\','\\'),'%','\%'),'_','\_')||'%')
   and case scope
    when 'mine' then status<>'CLOSED' and assigned_to=auth.uid()
    when 'unassigned' then status<>'CLOSED' and assigned_to is null
    when 'awaiting_first' then waiting and first_human_reply_at is null
    when 'awaiting_reply' then waiting
    when 'attention' then status<>'CLOSED' and ((waiting and reply_due_at<now()) or resolution_due_at<now() or uncertain_send or ack_status in ('FAILED','UNCERTAIN'))
    when 'overdue_resolution' then status<>'CLOSED' and resolution_due_at<now()
    when 'uncertain' then status<>'CLOSED' and uncertain_send
    when 'ack_pending' then ack_status in ('QUEUED','SENDING')
    when 'ack_failed' then ack_status in ('FAILED','UNCERTAIN')
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

create or replace function crm.support_desk_overview(org uuid,from_at timestamptz,to_at timestamptz,only_assignee uuid default null) returns jsonb
language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare res jsonb; mbox text; cur crm.sdr_mail_cursor; mail jsonb; reading boolean; acc crm.support_channel_accounts; support_mail jsonb; ack_note text; begin
 if auth.uid() is null or not crm.support_manager(org) then raise exception 'Forbidden'; end if;
 if from_at is null or to_at is null or to_at<=from_at then raise exception 'Invalid period'; end if;
 select lower(coalesce(nullif(p.reply_to,''),p.sender)) into mbox from crm.outreach_policy p where p.organization_id=org;
 select coalesce(s.enabled,false) into reading from crm.sdr_settings s where s.organization_id=org;
 select * into cur from crm.sdr_mail_cursor k where mbox is not null and k.mailbox=mbox;
 mail:=jsonb_build_object('channel','email','label','E-mail (respostas a cadências)','mailbox',mbox,'reading_enabled',coalesce(reading,false),'last_sync_at',cur.updated_at,
  'last_error',case when cur.last_error is not null then 'Falha na leitura da caixa. Confira a conexão Microsoft 365.' end,
  'status',case when mbox is null then 'not_configured' when not coalesce(reading,false) then 'not_configured' when cur.mailbox is null then 'awaiting' when cur.last_error is not null then 'error' when cur.updated_at<now()-interval '30 minutes' then 'delayed' else 'connected' end,
  'coverage','Somente respostas a cadências desta empresa (token Ciatos).');
 select * into acc from crm.support_channel_accounts where organization_id=org;
 support_mail:=jsonb_build_object('channel','email','label','E-mail de suporte (caixa da empresa)','mailbox',acc.mailbox,'last_sync_at',acc.last_sync_at,
  'last_error',case when acc.last_error is not null then 'Falha na leitura da caixa. Confira a conexão Microsoft 365.' end,
  'status',case when acc.organization_id is null or acc.mailbox is null or not acc.ingest_enabled then 'not_configured' when acc.last_sync_at is null then 'awaiting' when acc.last_error is not null then 'error' when acc.last_sync_at<now()-interval '30 minutes' then 'delayed' else 'connected' end,
  'coverage','Mensagens novas da caixa de entrada a partir da ativação. Não importa histórico anterior nem outras pastas.');
 ack_note:=case when coalesce(acc.auto_ack_enabled,false) then 'Habilitada com texto aprovado. Aceita pelo provedor não prova entrega.' else 'Desabilitada. Nenhuma confirmação é enviada.' end;
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
  'ack_pending',(crm.support_queue(org,'ack_pending','',1,0,only_assignee)->>'total')::int,
  'ack_failed',(crm.support_queue(org,'ack_failed','',1,0,only_assignee)->>'total')::int,
  'avg_first_response_hours',(select round((avg(extract(epoch from (c.first_human_reply_at-c.created_at)))/3600)::numeric,1) from crm.inbox_conversations c where c.organization_id=org and c.created_at>=from_at and c.created_at<to_at and c.first_human_reply_at>=c.created_at and (only_assignee is null or c.assigned_to=only_assignee)),
  'avg_resolution_hours',(select round((avg(extract(epoch from (c.resolved_at-c.created_at)))/3600)::numeric,1) from crm.inbox_conversations c where c.organization_id=org and c.resolved_at>=from_at and c.resolved_at<to_at and (only_assignee is null or c.assigned_to=only_assignee)),
  'auto_confirmation',jsonb_build_object('enabled',coalesce(acc.auto_ack_enabled,false),'note',ack_note),
  'by_assignee',(select coalesce(jsonb_agg(jsonb_build_object('assigned_to',t.assigned_to,'open',t.n,'waiting',t.w) order by t.n desc),'[]') from (
    select c.assigned_to,count(*) n,count(*) filter(where c.awaiting_human) w from crm.inbox_conversations c where c.organization_id=org and c.status<>'CLOSED' group by c.assigned_to) t),
  'channels',jsonb_build_array(support_mail,mail,jsonb_build_object('channel','whatsapp','label','WhatsApp','status','not_configured','coverage','Não conectado.'),jsonb_build_object('channel','instagram','label','Instagram','status','not_configured','coverage','Não conectado.'))
 ) into res;
 return res;
end $$;

revoke all on function crm.save_support_ack_template(uuid,text,text),crm.approve_support_ack_template(uuid),crm.save_support_channel(uuid,text,boolean,boolean),crm.get_support_channel(uuid),crm.resolve_support_outbox(uuid,text),
 crm.support_conversation_contacts(uuid,uuid[]),crm.support_person_export(uuid,uuid),crm.support_person_erase(uuid,uuid),
 crm.claim_support_account(),crm.finish_support_account(uuid,uuid,text,timestamptz,text),crm.ingest_support_email(uuid,text,text,text,text,text,text,timestamptz,boolean,text,boolean),
 crm.claim_support_outbox(),crm.finish_support_outbox(uuid,text,text),crm.list_support_outbox_uncertain(),crm.reconcile_support_outbox(uuid,boolean),crm.reserve_support_reply(uuid,uuid,uuid,text),
 crm.next_support_protocol(uuid),crm.inbox_conversation_protocol() from public,anon,authenticated;
grant execute on function crm.save_support_ack_template(uuid,text,text),crm.approve_support_ack_template(uuid),crm.save_support_channel(uuid,text,boolean,boolean),crm.get_support_channel(uuid),crm.resolve_support_outbox(uuid,text),
 crm.support_conversation_contacts(uuid,uuid[]),crm.support_person_export(uuid,uuid),crm.support_person_erase(uuid,uuid) to authenticated;
grant execute on function crm.claim_support_account(),crm.finish_support_account(uuid,uuid,text,timestamptz,text),crm.ingest_support_email(uuid,text,text,text,text,text,text,timestamptz,boolean,text,boolean),
 crm.claim_support_outbox(),crm.finish_support_outbox(uuid,text,text),crm.list_support_outbox_uncertain(),crm.reconcile_support_outbox(uuid,boolean),crm.reserve_support_reply(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
