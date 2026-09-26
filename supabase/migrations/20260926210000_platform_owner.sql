-- Platform ownership is separate from customer membership and operating roles.
begin;
create table crm.platform_admins(user_id uuid primary key references crm.profiles(id) on delete cascade,created_at timestamptz not null default now());
alter table crm.platform_admins enable row level security;
revoke all on crm.platform_admins from public,anon,authenticated;
grant all on crm.platform_admins to service_role;
-- Preserve the previously trusted group administrators during this upgrade only.
insert into crm.platform_admins(user_id) select p.id from crm.profiles p join crm.organization_members m on m.user_id=p.id
 where p.ativo and p.papel='ADMIN' and m.ativo and m.papel='ADMIN' and m.organization_id='00000000-0000-4000-8000-000000000001';
alter table crm.organization_members add column is_master boolean not null default false;
create function crm.platform_admin() returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select exists(select 1 from crm.platform_admins a join crm.profiles p on p.id=a.user_id where a.user_id=auth.uid() and p.ativo)
$$;
create or replace function crm.group_admin() returns boolean language sql stable security definer set search_path=crm,pg_temp as $$ select crm.platform_admin() $$;
create function crm.can_manage_company(org uuid) returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select exists(select 1 from crm.organizations where id=org and ativo) and (crm.platform_admin() or (crm.tenant_member(org,true) and exists(select 1 from crm.organization_members where organization_id=org and user_id=auth.uid() and is_master)))
$$;
drop function crm.my_companies();
create function crm.my_companies() returns table(id uuid,nome text,registration jsonb,operating_role text,can_manage boolean,can_platform boolean,is_master boolean)
 language sql stable security definer set search_path=crm,pg_temp as $$
 select o.id,o.nome,o.registration,m.operating_role,crm.can_manage_company(o.id),crm.platform_admin(),m.is_master from crm.organizations o
 join crm.organization_members m on m.organization_id=o.id and m.user_id=auth.uid() where crm.tenant_member(o.id) order by o.nome
$$;
create function crm.platform_clients() returns table(id uuid,nome text,registration jsonb,ativo boolean,master_email text,active_users bigint)
 language plpgsql stable security definer set search_path=crm,pg_temp as $$ begin
 if not crm.platform_admin() then raise exception 'Acesso exclusivo do dono da plataforma.'; end if;
 return query select o.id,o.nome,o.registration,o.ativo,
 (select string_agg(p.email,', ' order by p.email) from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=o.id and m.is_master and m.ativo and p.ativo),
 (select count(*) from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=o.id and m.ativo and p.ativo)
 from crm.organizations o order by o.nome;
 end $$;
create or replace function crm.save_company(company_id uuid,company_name text,details jsonb default '{}') returns uuid
 language plpgsql security definer set search_path=crm,pg_temp as $$ declare result uuid; begin
 if company_id is null and not crm.platform_admin() then raise exception 'Somente o dono da plataforma cadastra empresas.'; end if;
 if company_id is not null and not crm.can_manage_company(company_id) then raise exception 'Sem permissão para administrar esta empresa.'; end if;
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

 update crm.organizations set nome=trim(company_name),registration=details,updated_at=now() where id=company_id; result:=company_id;
 end if;
 insert into crm.audit_logs(organization_id,user_id,acao,entidade,entidade_id) values(result,auth.uid(),'SAVE','organizations',result::text);
 return result;
end $$;
create or replace function crm.set_company_member(org uuid,member_email text,member_role text,enabled boolean default true) returns void
 language plpgsql security definer set search_path=crm,pg_temp as $$ declare target uuid; begin
 if not crm.can_manage_company(org) then raise exception 'Sem permissão para administrar acessos.'; end if;
 if member_role not in ('ADMIN','MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING') then raise exception 'Perfil inválido.'; end if;
 select id into target from crm.profiles where lower(email)=lower(trim(member_email)) and ativo;
 if target is null then raise exception 'Usuário ainda não cadastrado no CRM. Cadastre-o em Gestão de Usuários primeiro.'; end if;
 -- Serialize membership changes, preserving an active admin and the group owner's access.
 perform 1 from crm.organizations where id=org for update;
 if exists(select 1 from crm.organization_members where organization_id=org and user_id=target and is_master) then raise exception 'O acesso master é administrado pelo dono da plataforma.'; end if;
 if target=auth.uid() then raise exception 'Peça a outro administrador para alterar o seu acesso.'; end if;
 if (not enabled or member_role<>'ADMIN') and exists(select 1 from crm.organization_members where organization_id=org and user_id=target and ativo and papel='ADMIN')
 and not exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id<>target and m.ativo and m.papel='ADMIN' and p.ativo) then raise exception 'Mantenha ao menos um administrador ativo.'; end if;
 insert into crm.organization_members(organization_id,user_id,papel,operating_role,ativo) values(org,target,case when member_role='ADMIN' then 'ADMIN' else 'MEMBER' end,member_role,enabled)
 on conflict(organization_id,user_id) do update set papel=excluded.papel,operating_role=excluded.operating_role,ativo=excluded.ativo;
 insert into crm.audit_logs(organization_id,user_id,acao,entidade,entidade_id,depois) values(org,auth.uid(),'MEMBERSHIP','organization_members',target::text,jsonb_build_object('role',member_role,'enabled',enabled));
end $$;

-- Requires an existing identity. No credentials, mail or operational access are changed.
create function crm.assign_company_master(org uuid,master_email text) returns void language plpgsql security definer set search_path=crm,pg_temp as $$
 declare target uuid; begin
 if not crm.platform_admin() then raise exception 'Acesso exclusivo do dono da plataforma.'; end if;
 perform 1 from crm.organizations where id=org and ativo for update;
 if not found then raise exception 'Empresa não encontrada ou inativa.'; end if;
 select id into target from crm.profiles where lower(email)=lower(trim(master_email)) and ativo;
 if target is null then raise exception 'Cadastre primeiro o usuário no CRM.'; end if;
 insert into crm.organization_members(organization_id,user_id,papel,operating_role,ativo,is_master) values(org,target,'ADMIN','ADMIN',true,true)
 on conflict(organization_id,user_id) do update set papel='ADMIN',operating_role='ADMIN',ativo=true,is_master=true;
 insert into crm.audit_logs(organization_id,user_id,acao,entidade,entidade_id) values(org,auth.uid(),'ASSIGN_MASTER','organization_members',target::text);
 end $$;
revoke all on function crm.platform_admin(),crm.can_manage_company(uuid),crm.my_companies(),crm.platform_clients(),crm.assign_company_master(uuid,text) from public,anon;
grant execute on function crm.platform_admin(),crm.can_manage_company(uuid),crm.my_companies(),crm.platform_clients(),crm.assign_company_master(uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
