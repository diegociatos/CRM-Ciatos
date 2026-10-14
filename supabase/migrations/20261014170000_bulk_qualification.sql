-- Invoker keeps INSERT/SELECT subject to tenant RLS and platform limits.
begin;
create function crm.bulk_qualification(org uuid, rows jsonb, preview boolean default true)
returns jsonb language plpgsql security invoker set search_path=crm,pg_temp as $$
declare r jsonb; v jsonb; doc text; mail text; problem text; result jsonb:='[]'; lid uuid;
  seen_docs text[]:='{}'; seen_emails text[]:='{}'; total integer; i integer; n integer; digit integer;
begin
 if not crm.tenant_member(org) then raise exception 'Sem permissão nesta empresa.'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>100 then raise exception 'Lote inválido (máximo 100).'; end if;
 -- Serialize imports in this organization; other tenants remain independent.
 perform pg_advisory_xact_lock(hashtextextended(org::text, 14102026));
 for r in select value from jsonb_array_elements(rows) loop
  v:=r->'values'; problem:=null; lid:=null;
  doc:=upper(regexp_replace(coalesce(v->>'cnpj',''),'[./\s-]','','g'));
  mail:=lower(trim(coalesce(v->>'email','')));
  if coalesce(trim(v->>'legalName'),'')='' or coalesce(trim(v->>'name'),'')='' or coalesce(trim(v->>'phone'),'')='' then problem:='Preencha razão social, contato e telefone'; end if;
  if doc !~ '^[A-Z0-9]{12}[0-9]{2}$' or doc ~ '^(.)\1{13}$' then problem:='CNPJ inválido';
  else
   for n in 12..13 loop
    total:=0;for i in 1..n loop total:=total+(ascii(substr(doc,i,1))-48)*((n-i)%8+2);end loop;
    digit:=case when total%11<2 then 0 else 11-total%11 end;
    if substr(doc,n+1,1)::integer<>digit then problem:='CNPJ inválido';end if;
   end loop;
  end if;
  if (mail<>'' and mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') or
    (coalesce(v->>'companyEmail','')<>'' and v->>'companyEmail' !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then problem:='E-mail inválido';end if;
  if problem is null and (doc=any(seen_docs) or (mail<>'' and mail=any(seen_emails))) then problem:='Duplicado no lote';end if;
  if problem is null and exists(select 1 from crm.leads where organization_id=org and
    (cnpj_raw=doc or (mail<>'' and lower(trim(email))=mail))) then problem:='Já cadastrado nesta empresa';end if;
  if problem is null then
   seen_docs:=array_append(seen_docs,doc);if mail<>'' then seen_emails:=array_append(seen_emails,mail);end if;
   if not preview then
    begin
     insert into crm.leads(organization_id,nome,email,telefone,empresa,cnpj_raw,owner_id,status,phase_id,in_queue,relacao,segmento,cidade,uf,dados)
     values(org,trim(v->>'name'),nullif(mail,''),trim(v->>'phone'),coalesce(nullif(trim(v->>'tradeName'),''),trim(v->>'legalName')),doc,auth.uid(),
      'Qualificação','ph-qualificado',true,'prospect',v->>'segment',v->>'city',v->>'state',
      (v - array['id','organizationId','marketingAutomation','tasks','interactions','ownerId','status','phaseId','inQueue']) ||
      jsonb_build_object('cnpj',doc,'cnpjRaw',doc,'tasks','[]'::jsonb,'interactions','[]'::jsonb,'detailedPartners','[]'::jsonb,'closeProbability',1,'importSource','bulk')) returning id into lid;
    exception when unique_violation then problem:='Já cadastrado nesta empresa';
     when others then problem:=SQLERRM;
    end;
   end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('line',r->'line','error',problem,'id',lid));
 end loop;
 return result;
end $$;
revoke all on function crm.bulk_qualification(uuid,jsonb,boolean) from public,anon;
grant execute on function crm.bulk_qualification(uuid,jsonb,boolean) to authenticated;
commit;
