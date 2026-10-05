begin;

create table crm.inbox_quick_replies (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crm.organizations(id) on delete cascade,
 title text not null check(length(trim(title)) between 2 and 80),
 body text not null check(length(trim(body)) between 1 and 2000),
 created_by uuid references crm.profiles(id) on delete set null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,title)
);
create index inbox_quick_replies_active on crm.inbox_quick_replies(organization_id,title) where active;
alter table crm.inbox_quick_replies enable row level security;
create policy inbox_quick_replies_read on crm.inbox_quick_replies for select to authenticated
 using(crm.tenant_member(organization_id));
grant select on crm.inbox_quick_replies to authenticated;
grant all on crm.inbox_quick_replies to service_role;

create function crm.save_inbox_quick_reply(org uuid,rid uuid,reply_title text,reply_body text)
returns uuid language plpgsql security definer set search_path=crm,pg_temp as $$
declare previous crm.inbox_quick_replies; saved uuid; begin
 if not crm.tenant_member(org) or length(trim(coalesce(reply_title,''))) not between 2 and 80
  or length(trim(coalesce(reply_body,''))) not between 1 and 2000
  or reply_title ~ '[\r\n]' then raise exception 'Invalid quick reply or access'; end if;
 if rid is null then
   insert into crm.inbox_quick_replies(organization_id,title,body,created_by)
   values(org,trim(reply_title),trim(reply_body),auth.uid()) returning id into saved;
 else
   select * into previous from crm.inbox_quick_replies where id=rid and organization_id=org for update;
   if not found or (previous.created_by is distinct from auth.uid() and not crm.tenant_member(org,true))
   then raise exception 'Quick reply unavailable'; end if;
   update crm.inbox_quick_replies set title=trim(reply_title),body=trim(reply_body),active=true,updated_at=now()
   where id=rid returning id into saved;
 end if;
 return saved;
end $$;

create function crm.archive_inbox_quick_reply(rid uuid)
returns void language plpgsql security definer set search_path=crm,pg_temp as $$
declare q crm.inbox_quick_replies; begin
 select * into q from crm.inbox_quick_replies where id=rid for update;
 if not found or not crm.tenant_member(q.organization_id)
  or (q.created_by is distinct from auth.uid() and not crm.tenant_member(q.organization_id,true))
 then raise exception 'Quick reply unavailable'; end if;
 update crm.inbox_quick_replies set active=false,updated_at=now() where id=rid;
end $$;

revoke execute on function crm.save_inbox_quick_reply(uuid,uuid,text,text),crm.archive_inbox_quick_reply(uuid) from public,anon;
grant execute on function crm.save_inbox_quick_reply(uuid,uuid,text,text),crm.archive_inbox_quick_reply(uuid) to authenticated;

insert into crm.inbox_quick_replies(organization_id,title,body)
select o.id,x.title,x.body from crm.organizations o cross join (values
 ('Agradecer e compreender','Obrigado pelo retorno. Para eu orientar a pessoa certa da nossa equipe, pode me contar qual é a prioridade da sua empresa neste momento?'),
 ('Propor uma conversa','Obrigado por explicar o contexto. Podemos reservar uma conversa breve para entender a necessidade e combinar um próximo passo? Qual horário funciona melhor para você?'),
 ('Pedir mais detalhes','Para não sugerir uma solução genérica, pode me dizer o que já foi tentado, qual prazo importa e quem mais participa da decisão?'),
 ('Encerrar com respeito','Obrigado pela resposta. Vou registrar que este não é o momento adequado e encerrar o contato. Se precisar de nós no futuro, estaremos à disposição.')
) as x(title,body) where o.ativo
on conflict(organization_id,title) do nothing;

commit;
