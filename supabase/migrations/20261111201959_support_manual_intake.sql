begin;
-- Provenance is attached to the existing demand, not a second ticket queue.
alter table crm.support_demands add column intake jsonb not null default '{}'::jsonb
 check(jsonb_typeof(intake)='object');

create function crm.create_support_intake(org uuid,details jsonb,demand_title text,demand_description text default '',demand_priority text default 'NORMAL',assignee uuid default null,is_confidential boolean default false,request_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare normalized jsonb; fingerprint text; saved uuid; previous jsonb; k text; duration integer;
begin
 if auth.uid() is null or not crm.support_member(org) then raise exception 'Forbidden' using errcode='42501'; end if;
 -- Keep the caller's access stable until this transaction completes.
 perform 1 from crm.organization_members m join crm.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=auth.uid() and m.ativo and p.ativo for share of m,p;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if request_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
 if length(trim(coalesce(demand_title,''))) not between 2 and 160 then raise exception 'Informe um assunto entre 2 e 160 caracteres' using errcode='22023'; end if;
 if length(trim(coalesce(demand_description,''))) not between 2 and 20000 then raise exception 'Informe o relato e próximo passo' using errcode='22023'; end if;
 if details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid intake' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(details) key where key not in ('channel','name','company','phone','email','direction','outcome','duration_seconds')) then raise exception 'Invalid intake field' using errcode='22023'; end if;
 for k in select jsonb_object_keys(details) loop
  if k<>'duration_seconds' and jsonb_typeof(details->k) not in ('string','null') then raise exception 'Invalid field type' using errcode='22023'; end if;
 end loop;
 if coalesce(details->>'channel','') not in ('phone','email','whatsapp','in_person','other') then raise exception 'Invalid channel' using errcode='22023'; end if;
 if length(trim(coalesce(details->>'name',''))) not between 2 and 160 or length(coalesce(details->>'company',''))>200 or length(coalesce(details->>'phone',''))>40 or length(coalesce(details->>'email',''))>254 then raise exception 'Invalid contact' using errcode='22023'; end if;
 if nullif(trim(details->>'email'),'') is not null and trim(details->>'email') !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then raise exception 'Invalid email' using errcode='22023'; end if;
 if details->>'channel' in ('phone','whatsapp') and regexp_replace(coalesce(details->>'phone',''),'[^0-9]','','g') !~ '^[0-9]{8,15}$' then raise exception 'Informe um telefone com DDD' using errcode='22023'; end if;
 if details->>'channel'='email' and nullif(trim(details->>'email'),'') is null then raise exception 'Informe o e-mail' using errcode='22023'; end if;
 if details->>'channel'='phone' then
  if coalesce(details->>'direction','') not in ('INBOUND','OUTBOUND') or coalesce(details->>'outcome','') not in ('ANSWERED','MISSED','CALLBACK') then raise exception 'Invalid call outcome' using errcode='22023'; end if;
  if coalesce(details->>'duration_seconds','') !~ '^[0-9]{1,5}$' then raise exception 'Invalid duration' using errcode='22023'; end if;
  duration:=(details->>'duration_seconds')::integer;
  if duration>86400 or (details->>'outcome'='MISSED' and duration<>0) then raise exception 'Invalid duration' using errcode='22023'; end if;
 end if;
 normalized:=jsonb_build_object('source','manual','channel',details->>'channel','name',trim(details->>'name'),'company',trim(coalesce(details->>'company','')),'phone',trim(coalesce(details->>'phone','')),'email',lower(trim(coalesce(details->>'email',''))));
 if details->>'channel'='phone' then normalized:=normalized||jsonb_build_object('direction',details->>'direction','outcome',details->>'outcome','duration_seconds',duration); end if;
 fingerprint:=md5(jsonb_build_object('details',normalized,'title',trim(demand_title),'description',trim(coalesce(demand_description,'')),'priority',demand_priority,'assignee',assignee,'confidential',coalesce(is_confidential,false))::text);
 perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||request_id::text,11112026));
 select d.id,d.intake into saved,previous from crm.support_demands d where d.organization_id=org and d.created_by=auth.uid() and d.request_id=create_support_intake.request_id;
 if found then
  if previous->>'fingerprint' is distinct from fingerprint then raise exception 'Request already used with different content' using errcode='23514'; end if;
  return saved;
 end if;
 saved:=crm.create_support_demand(org,trim(demand_title),trim(coalesce(demand_description,'')),null,demand_priority,null,assignee,request_id,is_confidential);
 update crm.support_demands set intake=normalized||jsonb_build_object('fingerprint',fingerprint) where id=saved and organization_id=org;
 -- Record final creation state atomically before it becomes visible.
 update crm.support_demand_activity a set changes=jsonb_build_object('after',to_jsonb(d)-'request_id') from crm.support_demands d where d.id=saved and a.demand_id=d.id and a.kind='CREATED';
 return saved;
end $$;
revoke all on function crm.create_support_intake(uuid,jsonb,text,text,text,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function crm.create_support_intake(uuid,jsonb,text,text,text,uuid,boolean,uuid) to authenticated;
commit;
