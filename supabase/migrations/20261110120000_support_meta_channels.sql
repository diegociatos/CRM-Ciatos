-- Atendimento, fase C: WhatsApp (Cloud API) e Instagram (mensagens diretas) por empresa, via webhook oficial da Meta.
-- Incremental e desligado por padrao: nada aqui conecta conta, cria credencial ou envia mensagem. O canal so age quando
-- (1) a empresa cadastra o identificador da conta e a habilita, (2) o operador cria o segredo do token no servidor
-- e (3) CRM_SUPPORT_META_ENABLED=true. Tokens nunca ficam no banco: o banco guarda so o NOME esperado do segredo (derivado,
-- nao editavel), para uma empresa nunca ler o segredo de outra.
begin;

alter table crm.inbox_conversations drop constraint inbox_conversations_channel_check;
alter table crm.inbox_conversations add constraint inbox_conversations_channel_check check(channel in ('email','whatsapp','instagram'));
alter table crm.inbox_conversations drop constraint inbox_conversations_source_check;
alter table crm.inbox_conversations add constraint inbox_conversations_source_check check(source in ('campaign','support_mail','whatsapp','instagram'));
alter table crm.inbox_messages drop constraint inbox_messages_provider_check;
alter table crm.inbox_messages add constraint inbox_messages_provider_check check(provider in ('microsoft365','crm','whatsapp','instagram'));
alter table crm.inbox_messages drop constraint inbox_messages_delivery_status_check;
alter table crm.inbox_messages add constraint inbox_messages_delivery_status_check check(delivery_status in ('SENDING','ACCEPTED','REVIEW','FAILED'));
-- Evidencias de entrega informadas pelo canal (nao confundir com "aceita pelo provedor").
alter table crm.inbox_messages add column delivered_at timestamptz, add column read_at timestamptz,
 add column delivery_evidence text check(delivery_evidence is null or delivery_evidence in ('provider_accepted','channel_status','manual_confirmation')),
 add column delivery_error text check(delivery_error is null or length(delivery_error)<=300);

-- Uma resposta que o canal depois informa como NAO entregue deixa de contar como primeira resposta.
create or replace function crm.inbox_message_case_state() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if (new.direction='INBOUND' and new.classification is distinct from 'automatic')
  or (new.direction='OUTBOUND' and new.delivery_status='ACCEPTED' and (tg_op='INSERT' or old.delivery_status is distinct from 'ACCEPTED'))
  or (new.direction='OUTBOUND' and tg_op='UPDATE' and old.delivery_status='ACCEPTED' and new.delivery_status is distinct from 'ACCEPTED') then
  perform crm.recompute_case_state(new.conversation_id);
 end if;
 return new;
end $$;

-- Pessoa que escreve por WhatsApp/Instagram: identidade pelo identificador do canal. Nunca fundida com outra
-- pessoa por nome e nunca fundida entre canais (a mesma pessoa em e-mail e WhatsApp gera dois contatos).
alter table crm.support_people alter column email drop not null;
alter table crm.support_people
 add column whatsapp_id text check(whatsapp_id is null or whatsapp_id ~ '^[0-9]{8,15}$'),
 add column instagram_id text check(instagram_id is null or instagram_id ~ '^[0-9]{5,30}$');
alter table crm.support_people add constraint support_people_identity check(email is not null or whatsapp_id is not null or instagram_id is not null);
create unique index support_people_whatsapp on crm.support_people(organization_id,whatsapp_id) where whatsapp_id is not null;
create unique index support_people_instagram on crm.support_people(organization_id,instagram_id) where instagram_id is not null;

-- Limite de novos atendimentos por hora e empresa vindos de canais de entrada aberta (e-mail de suporte, WhatsApp,
-- Instagram). Excedido, a gravacao falha e o canal tenta de novo depois: nada se perde e nao ha inundacao de fila.
create function crm.inbox_conversation_intake_limit() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 if new.source<>'campaign' then perform pg_advisory_xact_lock(hashtext('intake:'||new.organization_id::text)); end if;
 if new.source<>'campaign' and (select count(*) from crm.inbox_conversations c where c.organization_id=new.organization_id and c.source<>'campaign' and c.created_at>now()-interval '1 hour')>=100 then
  raise exception 'Intake limit reached';
 end if;
 return new;
end $$;
create trigger inbox_conversation_intake_limit before insert on crm.inbox_conversations for each row execute function crm.inbox_conversation_intake_limit();

-- Conta de canal por empresa. Um identificador de conta pertence a uma unica empresa.
create table crm.support_meta_accounts (
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 channel text not null check(channel in ('whatsapp','instagram')),
 account_id text not null check(account_id ~ '^[0-9]{5,30}$'),
 display_name text not null default '' check(length(display_name)<=120),
 enabled boolean not null default false,
 verified_at timestamptz,
 last_event_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=300),
 updated_by uuid references crm.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,channel)
);
-- Posse: so uma empresa pode ter a conta VERIFICADA (o token da empresa acessou a conta na Meta). Cadastro sem verificacao nao roteia nada.
create unique index support_meta_account_unique on crm.support_meta_accounts(channel,account_id) where verified_at is not null;
create index support_meta_account_lookup on crm.support_meta_accounts(channel,account_id);
alter table crm.support_meta_accounts enable row level security;
create policy support_meta_read on crm.support_meta_accounts for select to authenticated using(crm.support_manager(organization_id));
revoke all on crm.support_meta_accounts from public,anon,authenticated;
grant select on crm.support_meta_accounts to authenticated;
grant all on crm.support_meta_accounts to service_role;

-- Nome do segredo do token no servidor: derivado da empresa e do canal (nunca informado por usuario).
create function crm.support_meta_token_ref(org uuid,chan text) returns text language sql immutable set search_path=pg_temp as $$
 select 'META_TOKEN_'||upper(chan)||'_'||upper(replace(org::text,'-',''))
$$;

create function crm.get_support_meta_accounts(org uuid) returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.support_manager(org) then raise exception 'Forbidden'; end if;
 return jsonb_build_object('can_manage',crm.pode_administrar(org),'accounts',(select coalesce(jsonb_agg(jsonb_build_object(
  'channel',ch.c,'account_id',a.account_id,'display_name',a.display_name,'enabled',coalesce(a.enabled,false),'verified',a.verified_at is not null,'last_event_at',a.last_event_at,'last_error',a.last_error,
  'token_ref',crm.support_meta_token_ref(org,ch.c)) order by ch.c),'[]')
  from (values('whatsapp'),('instagram')) ch(c) left join crm.support_meta_accounts a on a.organization_id=org and a.channel=ch.c));
end $$;
create function crm.save_support_meta_account(org uuid,chan text,acct text,name text,enable boolean) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare id text:=nullif(trim(coalesce(acct,'')),''); begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 if chan not in ('whatsapp','instagram') then raise exception 'Invalid channel'; end if;
 if id is null then
  if enable then raise exception 'Informe o identificador da conta'; end if;
  delete from crm.support_meta_accounts where organization_id=org and channel=chan;
 else
  if id !~ '^[0-9]{5,30}$' then raise exception 'O identificador deve conter apenas números'; end if;
  if length(coalesce(name,''))>120 then raise exception 'Nome muito longo'; end if;
  if exists(select 1 from crm.support_meta_accounts where channel=chan and account_id=id and organization_id<>org and verified_at is not null) then raise exception 'Este identificador já está em uso'; end if;
  insert into crm.support_meta_accounts(organization_id,channel,account_id,display_name,enabled,updated_by,updated_at) values(org,chan,id,trim(coalesce(name,'')),enable,auth.uid(),now())
  on conflict(organization_id,channel) do update set account_id=excluded.account_id,display_name=excluded.display_name,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at,
   last_error=case when excluded.account_id is distinct from crm.support_meta_accounts.account_id or (excluded.enabled and not crm.support_meta_accounts.enabled) then null else crm.support_meta_accounts.last_error end,
   last_event_at=case when excluded.account_id is distinct from crm.support_meta_accounts.account_id then null else crm.support_meta_accounts.last_event_at end,
   verified_at=case when excluded.account_id is distinct from crm.support_meta_accounts.account_id then null else crm.support_meta_accounts.verified_at end;
 end if;
 insert into crm.support_audit(organization_id,actor,action,detail) values(org,auth.uid(),'META_ACCOUNT_SAVED',jsonb_build_object('channel',chan,'enabled',enable and id is not null));
end $$;

-- Verificacao de posse: o servidor prova que o TOKEN DESTA EMPRESA acessa a conta na Meta antes de rotear qualquer evento.
create function crm.get_support_meta_target(org uuid,chan text) returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare a crm.support_meta_accounts; begin
 if auth.uid() is null or not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
 select * into a from crm.support_meta_accounts where organization_id=org and channel=chan;
 if not found then raise exception 'Cadastre o identificador da conta antes de verificar'; end if;
 return jsonb_build_object('account_id',a.account_id,'token_ref',crm.support_meta_token_ref(org,chan));
end $$;
create function crm.mark_support_meta_verified(org uuid,chan text,acct text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 update crm.support_meta_accounts set verified_at=now(),last_error=null where organization_id=org and channel=chan and account_id=acct;
 if not found then raise exception 'Account changed'; end if;
 insert into crm.support_audit(organization_id,actor,action,detail) values(org,null,'META_ACCOUNT_VERIFIED',jsonb_build_object('channel',chan));
end $$;

-- Roteamento do webhook (somente servidor): conta habilitada e a empresa dona.
create function crm.resolve_support_meta_account(chan text,acct text) returns jsonb language sql stable security definer set search_path=crm,pg_temp as $$
 select jsonb_build_object('organization_id',a.organization_id,'channel',a.channel,'account_id',a.account_id)
 from crm.support_meta_accounts a join crm.organizations o on o.id=a.organization_id and o.ativo where a.channel=chan and a.account_id=acct and a.enabled and a.verified_at is not null
$$;

-- Mensagem recebida (somente servidor): idempotente por id externo; um contato = um atendimento por canal (reabre se concluido).
create function crm.ingest_support_meta(org uuid,chan text,acct text,ext_id text,contact text,contact_name text,msg_body text,received timestamptz) returns jsonb
language plpgsql security definer set search_path=crm,pg_temp as $$
declare a crm.support_meta_accounts; pid uuid; cid uuid; made boolean:=false; prot text; clean text; key text; begin
 select * into a from crm.support_meta_accounts where organization_id=org and channel=chan and account_id=acct and enabled and verified_at is not null for update;
 if not found then raise exception 'Channel disabled'; end if;
 if length(coalesce(ext_id,'')) not between 1 and 500 or received is null or (chan='whatsapp' and contact !~ '^[0-9]{8,15}$') or (chan='instagram' and contact !~ '^[0-9]{5,30}$') then raise exception 'Invalid message'; end if;
 if exists(select 1 from crm.inbox_messages where organization_id=org and provider=chan and external_id=ext_id) then return jsonb_build_object('status','duplicate'); end if;
 clean:=left(trim(coalesce(msg_body,'')),8000);
 if length(clean)<1 then clean:='(Mensagem sem texto; abra o aplicativo do canal.)'; end if;
 if chan='whatsapp' then
  insert into crm.support_people(organization_id,name,whatsapp_id) values(org,left(trim(coalesce(contact_name,'')),200),contact)
   on conflict(organization_id,whatsapp_id) where whatsapp_id is not null do update set name=case when crm.support_people.name='' then excluded.name else crm.support_people.name end returning id into pid;
 else
  insert into crm.support_people(organization_id,name,instagram_id) values(org,left(trim(coalesce(contact_name,'')),200),contact)
   on conflict(organization_id,instagram_id) where instagram_id is not null do update set name=case when crm.support_people.name='' then excluded.name else crm.support_people.name end returning id into pid;
 end if;
 key:='p:'||pid::text;
 select id into cid from crm.inbox_conversations where organization_id=org and channel=chan and thread_key=key for update;
 if not found then
  insert into crm.inbox_conversations(organization_id,person_id,channel,status,subject,last_message_at,thread_key,source)
  values(org,pid,chan,'OPEN',case chan when 'whatsapp' then 'WhatsApp' else 'Instagram' end,received,key,chan) returning id,protocol into cid,prot;
  made:=true;
 else
  update crm.inbox_conversations set status=case when status='CLOSED' then 'OPEN' else status end,last_message_at=greatest(last_message_at,received),updated_at=now() where id=cid returning protocol into prot;
 end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,external_id,sender,recipient,body,received_at)
 values(cid,org,'INBOUND',chan,ext_id,contact,acct,clean,received);
 update crm.support_meta_accounts set last_event_at=now(),last_error=null where organization_id=org and channel=chan;
 return jsonb_build_object('status','stored','conversation_id',cid,'protocol',prot,'created',made);
end $$;

-- Estado que chegou antes de sabermos o id da mensagem enviada: guardado e reaplicado quando o id for registrado.
create table crm.support_meta_pending_status (
 id bigint generated always as identity primary key,
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 channel text not null check(channel in ('whatsapp','instagram')),
 external_id text not null check(length(external_id) between 1 and 500),
 status text not null check(status in ('sent','delivered','read','failed')),
 at timestamptz not null,
 error text check(error is null or length(error)<=300),
 created_at timestamptz not null default now(),
 unique(organization_id,channel,external_id,status)
);
alter table crm.support_meta_pending_status enable row level security;
revoke all on crm.support_meta_pending_status from public,anon,authenticated;
grant all on crm.support_meta_pending_status to service_role;

-- Estado informado pelo canal para uma mensagem enviada por nos (somente servidor). Nunca regride: entregue/lida nao voltam.
create function crm.apply_support_meta_status(org uuid,chan text,ext_id text,st text,at timestamptz,err text default null) returns text
language plpgsql security definer set search_path=crm,pg_temp as $$
declare m crm.inbox_messages; begin
 select * into m from crm.inbox_messages where organization_id=org and provider=chan and external_id=ext_id and direction='OUTBOUND' for update;
 if not found then
  delete from crm.support_meta_pending_status where created_at<now()-interval '7 days';
  if st in ('sent','delivered','read','failed') and (select count(*) from crm.support_meta_pending_status where organization_id=org)<5000 then
   insert into crm.support_meta_pending_status(organization_id,channel,external_id,status,at,error) values(org,chan,ext_id,st,at,left(err,300)) on conflict do nothing;
   return 'queued';
  end if;
  return 'unmatched';
 end if;
 if st='sent' then
  if m.delivery_status in ('SENDING','REVIEW') then update crm.inbox_messages set delivery_status='ACCEPTED',delivery_error=null where id=m.id; end if;
 elsif st='delivered' then
  update crm.inbox_messages set delivery_evidence=case when delivery_evidence='manual_confirmation' then delivery_evidence else 'channel_status' end,delivered_at=coalesce(delivered_at,at),delivery_status=case when delivery_status in ('SENDING','REVIEW','FAILED') then 'ACCEPTED' else delivery_status end,delivery_error=null where id=m.id;
 elsif st='read' then
  update crm.inbox_messages set delivery_evidence=case when delivery_evidence='manual_confirmation' then delivery_evidence else 'channel_status' end,read_at=coalesce(read_at,at),delivered_at=coalesce(delivered_at,at),delivery_status=case when delivery_status in ('SENDING','REVIEW','FAILED') then 'ACCEPTED' else delivery_status end,delivery_error=null where id=m.id;
 elsif st='failed' then
  if m.delivered_at is not null or m.read_at is not null then return 'ignored'; end if;
  update crm.inbox_messages set delivery_status='FAILED',delivery_error=left(coalesce(err,'Recusada pelo canal'),300) where id=m.id;
  update crm.support_meta_accounts set last_error='Uma mensagem foi recusada pelo canal.' where organization_id=org and channel=chan;
 else return 'ignored'; end if;
 return 'applied';
end $$;

-- Resposta humana por WhatsApp/Instagram. Texto livre so dentro da janela de 24 horas desde a ultima mensagem do cliente
-- (fora dela o canal exige modelo aprovado, ainda nao suportado: a mensagem e recusada antes de qualquer envio).
create function crm.reserve_support_meta_reply(cid uuid,actor uuid,rid uuid,reply_body text) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare c crm.inbox_conversations; p crm.support_people; a crm.support_meta_accounts; m crm.inbox_messages; contact text; last_in timestamptz; sent_today integer; begin
 if actor is null or rid is null or length(trim(coalesce(reply_body,''))) not between 1 and 4000 then raise exception 'Invalid reply'; end if;
 select * into c from crm.inbox_conversations where id=cid for update;
 if not found or c.status='CLOSED' or c.person_id is null or c.channel not in ('whatsapp','instagram') or not exists(
  select 1 from crm.organization_members om join crm.profiles pr on pr.id=om.user_id join crm.organizations o on o.id=om.organization_id
  where om.organization_id=c.organization_id and om.user_id=actor and om.ativo and pr.ativo and o.ativo) then raise exception 'Conversation unavailable'; end if;
 if c.assigned_to is not null and c.assigned_to<>actor and not exists(select 1 from crm.organization_members where organization_id=c.organization_id and user_id=actor and ativo and (papel='ADMIN' or operating_role='MANAGER')) then raise exception 'Conversation assigned to another user'; end if;
 select * into m from crm.inbox_messages where request_id=rid;
 if found then
  if m.conversation_id<>cid or m.author_id<>actor or m.body<>trim(reply_body) then raise exception 'Request ID already used'; end if;
  return jsonb_build_object('send',false,'status',m.delivery_status,'message_id',m.id);
 end if;
 select * into p from crm.support_people where id=c.person_id and organization_id=c.organization_id;
 select * into a from crm.support_meta_accounts where organization_id=c.organization_id and channel=c.channel and enabled and verified_at is not null;
 if p.id is null or a.organization_id is null then raise exception 'Support channel not enabled'; end if;
 contact:=case c.channel when 'whatsapp' then p.whatsapp_id else p.instagram_id end;
 if contact is null then raise exception 'Reply correlation requires review'; end if;
 if exists(select 1 from crm.inbox_messages where conversation_id=cid and direction='OUTBOUND' and delivery_status in ('SENDING','REVIEW')) then raise exception 'Resultado incerto: confira antes de enviar outra resposta'; end if;
 select max(received_at) into last_in from crm.inbox_messages where conversation_id=cid and direction='INBOUND';
 if last_in is null or last_in<now()-interval '24 hours' then raise exception 'A janela de 24 horas deste canal encerrou. Aguarde o cliente escrever novamente.'; end if;
 perform pg_advisory_xact_lock(hashtext(a.channel||':'||a.account_id));
 select count(*) into sent_today from crm.inbox_messages where organization_id=c.organization_id and provider=c.channel and direction='OUTBOUND' and received_at>=date_trunc('day',now());
 if sent_today>=300 then raise exception 'Daily sending limit reached'; end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,sender,recipient,body,author_id,delivery_status,request_id)
 values(cid,c.organization_id,'OUTBOUND',c.channel,a.account_id,contact,trim(reply_body),actor,'SENDING',rid) returning * into m;
 update crm.inbox_conversations set status='IN_PROGRESS',assigned_to=coalesce(assigned_to,actor),last_message_at=now(),updated_at=now() where id=cid;
 return jsonb_build_object('send',true,'status','SENDING','message_id',m.id,'channel',c.channel,'account_id',a.account_id,'token_ref',crm.support_meta_token_ref(a.organization_id,a.channel),'to',contact,'body',m.body);
end $$;
create function crm.finish_support_meta_reply(rid uuid,result text,ext_id text default null,failure text default null) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare m crm.inbox_messages; pend crm.support_meta_pending_status; begin
 if result not in ('ACCEPTED','REVIEW','FAILED') then raise exception 'Invalid result'; end if;
 update crm.inbox_messages set delivery_status=result,external_id=coalesce(ext_id,external_id),delivery_error=left(failure,300),delivery_evidence=case when result='ACCEPTED' then 'provider_accepted' end
 where request_id=rid and direction='OUTBOUND' and delivery_status='SENDING' returning * into m;
 if not found then raise exception 'Not sending'; end if;
  update crm.support_meta_accounts set last_error=case when result='ACCEPTED' then null else left(coalesce(failure,'Envio sem confirmação do canal.'),300) end where organization_id=m.organization_id and channel=m.provider;
 if ext_id is not null then
  for pend in select * from crm.support_meta_pending_status where organization_id=m.organization_id and channel=m.provider and external_id=ext_id order by at,id loop
   perform crm.apply_support_meta_status(pend.organization_id,pend.channel,pend.external_id,pend.status,pend.at,pend.error);
  end loop;
  delete from crm.support_meta_pending_status where organization_id=m.organization_id and channel=m.provider and external_id=ext_id;
 end if;
end $$;
-- Gestor resolve resposta de WhatsApp/Instagram em "a conferir": nunca reenvia; so registra o que ele conferiu no aplicativo do canal.
create function crm.resolve_support_meta_reply(mid uuid,action text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare m crm.inbox_messages; begin
 select * into m from crm.inbox_messages where id=mid for update;
 if not found or m.direction<>'OUTBOUND' or m.provider not in ('whatsapp','instagram') or auth.uid() is null or not crm.support_manager(m.organization_id) then raise exception 'Unavailable'; end if;
 if m.delivery_status<>'REVIEW' then raise exception 'Ação inválida para o estado atual'; end if;
 if action='confirm_sent' then update crm.inbox_messages set delivery_status='ACCEPTED',delivery_evidence='manual_confirmation',delivery_error=null where id=mid;
 elsif action='confirm_not_sent' then update crm.inbox_messages set delivery_status='FAILED',delivery_error='Conferido manualmente: não foi enviada' where id=mid;
 else raise exception 'Ação inválida'; end if;
 insert into crm.support_audit(organization_id,actor,action,subject,detail) values(m.organization_id,auth.uid(),'META_REPLY_'||upper(action),mid,jsonb_build_object('channel',m.provider));
end $$;

create function crm.support_meta_channel_json(org uuid,chan text) returns jsonb language sql stable security definer set search_path=crm,pg_temp as $$
 select jsonb_build_object('channel',chan,'label',case chan when 'whatsapp' then 'WhatsApp' else 'Instagram' end,
  'status',case when a.organization_id is null or not a.enabled then 'not_configured' when a.verified_at is null then 'awaiting' when a.last_error is not null then 'error' when a.last_event_at is null then 'awaiting' else 'connected' end,
  'last_sync_at',a.last_event_at,
  'last_error',case when a.last_error is not null then 'Falha no envio ou na recepção. Confira a conexão com a Meta.' end,
  'coverage',case chan when 'whatsapp' then 'Mensagens de texto recebidas pelo número configurado; mídia aparece como aviso. Resposta livre só até 24 h após a última mensagem do cliente.'
   else 'Mensagens diretas de texto da conta configurada. Resposta só até 24 h após a última mensagem do cliente.' end)
 from (select 1) x left join crm.support_meta_accounts a on a.organization_id=org and a.channel=chan
$$;

-- A cota diaria de e-mail conta so e-mail (respostas pelo WhatsApp/Instagram tem limite proprio).
create or replace function crm.emails_sent_today(org uuid) returns bigint
language sql stable security definer set search_path=crm,pg_temp as $$
 select (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id
         where a.organization_id=org and not n.dry_run and a.job_type='EMAIL' and a.dispatch_started_at>=date_trunc('day',now()))
      + (select count(*) from crm.broadcast_recipients r where r.organization_id=org
         and r.status in ('SENDING','SENT','FAILED') and coalesce(r.sent_at,r.locked_at)>=date_trunc('day',now()))
      + (select count(*) from crm.inbox_messages m where m.organization_id=org and m.direction='OUTBOUND' and m.provider in ('microsoft365','crm')
         and m.received_at>=date_trunc('day',now()))
$$;

create or replace function crm.reserve_support_reply(cid uuid,actor uuid,rid uuid,reply_body text) returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
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
 select (select count(*) from crm.inbox_messages where organization_id=c.organization_id and direction='OUTBOUND' and provider in ('microsoft365','crm') and received_at>=date_trunc('day',now()))
  +(select count(*) from crm.support_outbox where organization_id=c.organization_id and status in ('SENDING','ACCEPTED') and started_at>=date_trunc('day',now())) into sent_today;
 if sent_today>=300 then raise exception 'Daily sending limit reached'; end if;
 insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,sender,recipient,subject,body,author_id,delivery_status,request_id)
 values(cid,c.organization_id,'OUTBOUND','microsoft365',a.mailbox,p.email,left(c.subject,250),trim(reply_body),actor,'SENDING',rid) returning * into m;
 update crm.inbox_conversations set status='IN_PROGRESS',assigned_to=coalesce(assigned_to,actor),last_message_at=now(),updated_at=now() where id=cid;
 return jsonb_build_object('send',true,'status','SENDING','message_id',m.id,'sender',a.mailbox,'sender_name',(select nome from crm.organizations where id=c.organization_id),'reply_to',null,'recipient',p.email,'subject',m.subject,'body',m.body);
end $$;

-- Contato por conversa: telefone do WhatsApp para pessoas desse canal.
create or replace function crm.support_conversation_contacts(org uuid,cids uuid[]) returns table(conversation_id uuid,nome text,empresa text,email text,telefone text,opt_out boolean,is_person boolean)
language plpgsql stable security definer set search_path=crm,pg_temp as $$ begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 return query select c.id,coalesce(l.nome,nullif(pp.name,'')),l.empresa,coalesce(l.email,pp.email),coalesce(l.telefone,case when pp.whatsapp_id is not null then '+'||pp.whatsapp_id end),coalesce(l.opt_out,false),c.person_id is not null
  from crm.inbox_conversations c left join crm.leads l on l.id=c.lead_id and l.organization_id=c.organization_id left join crm.support_people pp on pp.id=c.person_id and pp.organization_id=c.organization_id
  where c.organization_id=org and c.id=any(coalesce(cids,'{}'));
end $$;

-- Fila e painel passam a mostrar o canal e o estado real de WhatsApp/Instagram.
create or replace function crm.support_queue(org uuid,scope text default 'open',query text default '',max_rows integer default 50,skip_rows integer default 0,only_assignee uuid default null,from_at timestamptz default null,to_at timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=crm,pg_temp as $$
declare needle text:=lower(trim(coalesce(query,''))); total integer; rows jsonb; begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden'; end if;
 if scope not in ('mine','unassigned','awaiting_first','awaiting_reply','attention','overdue_resolution','uncertain','reopened','received','open','closed','all','ack_pending','ack_failed') then raise exception 'Invalid scope'; end if;
 if only_assignee is not null and not crm.support_manager(org) and only_assignee<>auth.uid() then raise exception 'Forbidden'; end if;
 with s as (select coalesce((select first_response_hours from crm.support_desk_settings where organization_id=org),4) frh, coalesce((select resolution_hours from crm.support_desk_settings where organization_id=org),72) rh),
 b as (
  select c.id,c.lead_id,c.person_id,c.protocol,c.source,c.channel,c.subject,c.status,c.assigned_to,c.created_at,c.last_message_at,c.awaiting_human,c.last_customer_message_at,c.first_human_reply_at,c.reopen_count,c.reopened_at,c.resolved_at,c.resolution_note,
   coalesce(l.nome,nullif(pp.name,'')) nome,l.empresa,coalesce(l.email,pp.email) email,pp.whatsapp_id,coalesce(l.opt_out,false) opt_out,
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
  where (needle='' or lower(coalesce(nome,'')||' '||coalesce(empresa,'')||' '||coalesce(email,'')||' '||coalesce(whatsapp_id,'')||' '||subject||' '||coalesce(protocol,'')) like '%'||replace(replace(replace(needle,'\','\\'),'%','\%'),'_','\_')||'%')
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
  'channels',jsonb_build_array(support_mail,mail,crm.support_meta_channel_json(org,'whatsapp'),crm.support_meta_channel_json(org,'instagram'))
 ) into res;
 return res;
end $$;

revoke all on function crm.get_support_meta_accounts(uuid),crm.save_support_meta_account(uuid,text,text,text,boolean),crm.resolve_support_meta_account(text,text),
 crm.ingest_support_meta(uuid,text,text,text,text,text,text,timestamptz),crm.apply_support_meta_status(uuid,text,text,text,timestamptz,text),
 crm.reserve_support_meta_reply(uuid,uuid,uuid,text),crm.finish_support_meta_reply(uuid,text,text,text),crm.support_meta_channel_json(uuid,text),crm.support_meta_token_ref(uuid,text),
 crm.inbox_conversation_intake_limit(),crm.get_support_meta_target(uuid,text),crm.mark_support_meta_verified(uuid,text,text),crm.resolve_support_meta_reply(uuid,text) from public,anon,authenticated;
grant execute on function crm.get_support_meta_accounts(uuid),crm.save_support_meta_account(uuid,text,text,text,boolean),crm.get_support_meta_target(uuid,text),crm.resolve_support_meta_reply(uuid,text) to authenticated;
grant execute on function crm.resolve_support_meta_account(text,text),crm.ingest_support_meta(uuid,text,text,text,text,text,text,timestamptz),crm.apply_support_meta_status(uuid,text,text,text,timestamptz,text),
 crm.reserve_support_meta_reply(uuid,uuid,uuid,text),crm.finish_support_meta_reply(uuid,text,text,text),crm.support_meta_token_ref(uuid,text),crm.mark_support_meta_verified(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
