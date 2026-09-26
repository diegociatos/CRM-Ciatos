-- Full operational workspaces. Existing data remains in Grupo Ciatos.
begin;
alter table crm.organizations add column registration jsonb not null default '{}';
alter table crm.organization_members add column operating_role text not null default 'SDR'
 check(operating_role in ('ADMIN','MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING'));
update crm.organization_members m set operating_role=case when m.papel='ADMIN' then 'ADMIN' else p.papel end
 from crm.profiles p where p.id=m.user_id;

create function crm.group_admin() returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select exists(select 1 from crm.profiles p where p.id=auth.uid() and p.ativo and p.papel='ADMIN')
 and crm.tenant_member('00000000-0000-4000-8000-000000000001',true)
$$;
create function crm.company_role(org uuid) returns text language sql stable security definer set search_path=crm,pg_temp as $$
 select operating_role from crm.organization_members where organization_id=org and user_id=auth.uid() and crm.tenant_member(org)
$$;

-- Explicit tenant on every operational table, including previously global settings.
do $$ declare t text; begin
 foreach t in array array['config','interactions','agenda_events','scripts','onboarding_templates','email_templates','user_goals','mining_jobs','mining_leads','audit_logs'] loop
 execute format('alter table crm.%I add column organization_id uuid references crm.organizations(id)',t);
 end loop;
end $$;
update crm.interactions i set organization_id=l.organization_id from crm.leads l where l.id=i.lead_id;
update crm.agenda_events e set organization_id=l.organization_id from crm.leads l where l.id=e.lead_id;
do $$ declare t text; begin
 foreach t in array array['config','interactions','agenda_events','scripts','onboarding_templates','email_templates','user_goals','mining_jobs','mining_leads','audit_logs'] loop
 execute format('update crm.%I set organization_id=%L where organization_id is null',t,'00000000-0000-4000-8000-000000000001');
 execute format('alter table crm.%I alter column organization_id set not null',t);
 execute format('create index on crm.%I(organization_id)',t);
 end loop;
end $$;
alter table crm.leads alter column organization_id drop default;
alter table crm.config drop constraint config_pkey, add primary key(organization_id,id);
alter table crm.onboarding_templates drop constraint onboarding_templates_pkey, add primary key(organization_id,id);
alter table crm.user_goals drop constraint user_goals_user_id_mes_ano_key, add unique(organization_id,user_id,mes,ano);
alter table crm.mining_jobs add unique(id,organization_id);
alter table crm.interactions add foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade;
alter table crm.agenda_events add foreign key(lead_id,organization_id) references crm.leads(id,organization_id) on delete cascade;
alter table crm.mining_leads add foreign key(job_id,organization_id) references crm.mining_jobs(id,organization_id) on delete cascade;

create function crm.immutable_company() returns trigger language plpgsql as $$ begin
 if new.organization_id is distinct from old.organization_id then raise exception 'Empresa do registro não pode ser alterada.'; end if;
 return new;
end $$;
do $$ declare t text; p record; begin
 foreach t in array array['config','interactions','agenda_events','scripts','onboarding_templates','email_templates','user_goals','mining_jobs','mining_leads','audit_logs'] loop
 execute format('create trigger immutable_company before update on crm.%I for each row execute function crm.immutable_company()',t);
 for p in select policyname from pg_policies where schemaname='crm' and tablename=t loop
 execute format('drop policy %I on crm.%I',p.policyname,t); end loop;
 execute format('create policy company_read on crm.%I for select to authenticated using(crm.tenant_member(organization_id))',t);
 end loop;
end $$;
-- Audit is private to administrators of that company.
drop policy company_read on crm.audit_logs;
create policy company_read on crm.audit_logs for select to authenticated using(crm.tenant_member(organization_id,true));
do $$ declare t text; begin
 foreach t in array array['agenda_events','mining_jobs','mining_leads'] loop
 execute format('create policy company_write on crm.%I for all to authenticated using(crm.tenant_member(organization_id)) with check(crm.tenant_member(organization_id))',t);
 end loop;
 foreach t in array array['config','onboarding_templates','user_goals'] loop
 execute format('create policy company_write on crm.%I for all to authenticated using(crm.company_role(organization_id) in (''ADMIN'',''MANAGER'')) with check(crm.company_role(organization_id) in (''ADMIN'',''MANAGER''))',t);
 end loop;
end $$;
create policy company_insert on crm.interactions for insert to authenticated with check(crm.tenant_member(organization_id) and (autor_id is null or autor_id=auth.uid()));
create policy company_delete on crm.interactions for delete to authenticated using(crm.tenant_member(organization_id,true));
create policy company_insert on crm.scripts for insert to authenticated with check(crm.tenant_member(organization_id) and (author_id is null or author_id=auth.uid()));
create policy company_update on crm.scripts for update to authenticated using(crm.tenant_member(organization_id) and (crm.tenant_member(organization_id,true) or author_id=auth.uid())) with check(crm.tenant_member(organization_id));
create policy company_delete on crm.scripts for delete to authenticated using(crm.tenant_member(organization_id) and (crm.tenant_member(organization_id,true) or author_id=auth.uid()));
create policy company_write on crm.email_templates for all to authenticated using(crm.company_role(organization_id) in ('ADMIN','MANAGER','MARKETING')) with check(crm.company_role(organization_id) in ('ADMIN','MANAGER','MARKETING'));
drop policy company_read on crm.user_goals;
create policy company_read on crm.user_goals for select to authenticated using(crm.tenant_member(organization_id) and (user_id=auth.uid() or crm.company_role(organization_id) in ('ADMIN','MANAGER')));

-- Foreign keys alone ensure existence, not that a person works in this company.
create function crm.company_person_guard() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$
 declare field text; person uuid; value jsonb:=to_jsonb(new); begin
 foreach field in array TG_ARGV loop
 if TG_OP='UPDATE' and value->field is not distinct from to_jsonb(old)->field then continue; end if;
 person:=nullif(value->>field,'')::uuid;
 if person is not null and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=new.organization_id and m.user_id=person and m.ativo and p.ativo) then
 raise exception 'O responsável deve ter acesso a esta empresa.'; end if;
 end loop; return new;
end $$;
create trigger company_people before insert or update on crm.leads for each row execute function crm.company_person_guard('owner_id','qualified_by_id');
create trigger company_people before insert or update on crm.agenda_events for each row execute function crm.company_person_guard('assigned_to_id','creator_id');
create trigger company_people before insert or update on crm.interactions for each row execute function crm.company_person_guard('autor_id');
create trigger company_people before insert or update on crm.scripts for each row execute function crm.company_person_guard('author_id');
create trigger company_people before insert or update on crm.user_goals for each row execute function crm.company_person_guard('user_id');
create trigger company_people before insert or update on crm.mining_jobs for each row execute function crm.company_person_guard('created_by');
create trigger company_people before insert or update on crm.config for each row execute function crm.company_person_guard('updated_by');

create or replace function crm.audit_delete() returns trigger language plpgsql security definer set search_path=crm,pg_temp as $$ begin
 insert into crm.audit_logs(user_id,acao,entidade,entidade_id,organization_id)
 values(auth.uid(),'DELETE',tg_table_name,old.id::text,old.organization_id); return old;
end $$;
-- Profiles are identity only; operational roles belong to memberships.
drop policy profiles_select on crm.profiles;
drop policy profiles_update on crm.profiles;
create policy profiles_select on crm.profiles for select to authenticated using(id=auth.uid());
create policy profiles_update on crm.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create or replace function crm.profiles_guard() returns trigger language plpgsql as $$ begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if new.papel is distinct from old.papel or new.ativo is distinct from old.ativo or new.email is distinct from old.email or new.id is distinct from old.id then
 raise exception 'A identidade e o acesso global são administrados no servidor.'; end if; return new;
end $$;

create function crm.my_companies() returns table(id uuid,nome text,registration jsonb,operating_role text,can_manage boolean)
 language sql stable security definer set search_path=crm,pg_temp as $$
 select o.id,o.nome,o.registration,m.operating_role,crm.group_admin() from crm.organizations o
 join crm.organization_members m on m.organization_id=o.id and m.user_id=auth.uid()
 where crm.tenant_member(o.id) order by o.nome
$$;
create function crm.company_users(org uuid) returns table(id uuid,nome text,email text,papel text,departamento text,avatar text,ativo boolean)
 language sql stable security definer set search_path=crm,pg_temp as $$
 select p.id,p.nome,p.email,m.operating_role,p.departamento,p.avatar,m.ativo from crm.organization_members m
 join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.ativo and p.ativo and crm.tenant_member(org)
$$;
create function crm.save_company(company_id uuid,company_name text,details jsonb default '{}') returns uuid
 language plpgsql security definer set search_path=crm,pg_temp as $$ declare result uuid; begin
 if not crm.group_admin() then raise exception 'Somente a administração do grupo cadastra empresas.'; end if;
 if length(trim(company_name))<2 or length(company_name)>120 then raise exception 'Informe um nome de 2 a 120 caracteres.'; end if;
 if jsonb_typeof(details)<>'object' or length(details::text)>3000 then raise exception 'Cadastro inválido.'; end if;
 details:=jsonb_build_object('legalName',left(coalesce(details->>'legalName',''),160),'cnpj',left(coalesce(details->>'cnpj',''),18),'email',left(coalesce(details->>'email',''),160),'phone',left(coalesce(details->>'phone',''),30));
 if company_id is null then
 result:=gen_random_uuid();
 insert into crm.organizations(id,nome,slug,registration) values(result,trim(company_name),'empresa-'||result,details);
 insert into crm.organization_members(organization_id,user_id,papel,operating_role) values(result,auth.uid(),'ADMIN','ADMIN');
 insert into crm.config(organization_id,id) values(result,1);
 insert into crm.outreach_policy(organization_id) values(result);
 else
 if not crm.tenant_member(company_id,true) then raise exception 'Sem acesso à empresa.'; end if;
 update crm.organizations set nome=trim(company_name),registration=details,updated_at=now() where id=company_id; result:=company_id;
 end if;
 insert into crm.audit_logs(organization_id,user_id,acao,entidade,entidade_id) values(result,auth.uid(),'SAVE','organizations',result::text);
 return result;
end $$;
create function crm.set_company_member(org uuid,member_email text,member_role text,enabled boolean default true) returns void
 language plpgsql security definer set search_path=crm,pg_temp as $$ declare target uuid; begin
 if not crm.group_admin() or not crm.tenant_member(org,true) then raise exception 'Sem permissão para administrar acessos.'; end if;
 if member_role not in ('ADMIN','MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING') then raise exception 'Perfil inválido.'; end if;
 select id into target from crm.profiles where lower(email)=lower(trim(member_email)) and ativo;
 if target is null then raise exception 'Usuário ainda não cadastrado no CRM. Cadastre-o em Gestão de Usuários primeiro.'; end if;
 -- Serialize membership changes, preserving an active admin and the group owner's access.
 perform 1 from crm.organizations where id=org for update;
 if target=auth.uid() then raise exception 'Peça a outro administrador para alterar o seu acesso.'; end if;
 if (not enabled or member_role<>'ADMIN') and exists(select 1 from crm.organization_members where organization_id=org and user_id=target and ativo and papel='ADMIN')
 and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id<>target and m.ativo and m.papel='ADMIN' and p.ativo) then raise exception 'Mantenha ao menos um administrador ativo.'; end if;
 insert into crm.organization_members(organization_id,user_id,papel,operating_role,ativo) values(org,target,case when member_role='ADMIN' then 'ADMIN' else 'MEMBER' end,member_role,enabled)
 on conflict(organization_id,user_id) do update set papel=excluded.papel,operating_role=excluded.operating_role,ativo=excluded.ativo;
 insert into crm.audit_logs(organization_id,user_id,acao,entidade,entidade_id,depois) values(org,auth.uid(),'MEMBERSHIP','organization_members',target::text,jsonb_build_object('role',member_role,'enabled',enabled));
end $$;
revoke all on function crm.group_admin(),crm.company_role(uuid),crm.my_companies(),crm.company_users(uuid),crm.save_company(uuid,text,jsonb),crm.set_company_member(uuid,text,text,boolean),crm.immutable_company(),crm.company_person_guard() from public,anon;
grant execute on function crm.group_admin(),crm.company_role(uuid),crm.my_companies(),crm.company_users(uuid),crm.save_company(uuid,text,jsonb),crm.set_company_member(uuid,text,text,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
