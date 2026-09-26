begin;
-- Auth app_metadata is server-controlled. A user cannot clear this requirement
-- by changing editable user_metadata or calling the database directly.
create function crm.password_ready() returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->'app_metadata'->>'crm_password_change_required','false') <> 'true'
 and exists(select 1 from auth.users u where u.id=auth.uid()
 and coalesce(to_jsonb(u)->'raw_app_meta_data'->>'crm_password_change_required','false') <> 'true')
$$;
revoke all on function crm.password_ready() from public,anon;
grant execute on function crm.password_ready() to authenticated,service_role;
create or replace function crm.tenant_member(org uuid, admin_only boolean default false) returns boolean
language sql stable security definer set search_path=crm,pg_temp as $$
 select crm.password_ready() and exists(select 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id
 join crm.organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=auth.uid() and m.ativo and p.ativo and o.ativo
 and (not admin_only or m.papel='ADMIN'))
$$;

create or replace function crm.platform_admin() returns boolean language sql stable security definer set search_path=crm,pg_temp as $$
 select crm.password_ready() and exists(select 1 from crm.platform_admins a join crm.profiles p on p.id=a.user_id where a.user_id=auth.uid() and p.ativo)
$$;
notify pgrst,'reload schema';
commit;
