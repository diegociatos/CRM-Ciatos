begin;
-- Lista de prospecção vinda de planilha: entra como lista nomeada do Radar
-- (sourceProvider = 'planilha') e segue o mesmo caminho das buscas — o agente
-- SDR verifica/descobre o e-mail no Snov.io e inscreve na cadência escolhida.
-- Nada é enviado aqui; sem agente ligado a lista só fica disponível no Radar.
create function crm.import_radar_sheet(org uuid, job uuid, lista text, linhas jsonb, arquivo text default null)
returns jsonb language plpgsql security definer set search_path = crm, pg_temp as $$
declare r jsonb; n integer := 0; ins integer := 0; ign integer := 0; erros jsonb := '[]'; jid uuid := job; total integer;
  v_cnpj text; v_email text; v_emp text; v_razao text; v_contato text; v_site text; v_fonte text; begin
  if not crm.pode_administrar(org) then raise exception 'Somente administradores importam listas.'; end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) > 1000 then raise exception 'Envie no máximo 1000 linhas por lote.'; end if;
  v_fonte := 'Planilha importada' || coalesce(': ' || nullif(left(trim(arquivo), 150), ''), '');
  if jid is null then
    if length(trim(coalesce(lista, ''))) not between 3 and 120 then raise exception 'Dê um nome à lista (3 a 120 caracteres).'; end if;
    insert into crm.mining_jobs(organization_id, created_by, status, dados)
    values (org, (select id from crm.profiles where id = auth.uid()), 'Completed',
      jsonb_build_object('name', trim(lista), 'sourceProvider', 'planilha', 'sourceFile', left(trim(coalesce(arquivo, '')), 150), 'version', 1,
        'foundCount', 0, 'targetCount', 1,
        'filters', jsonb_build_object('segment', '', 'city', '', 'state', '', 'size', '', 'taxRegime', '', 'fiscalFilter', '')))
    returning id into jid;
  elsif not exists(select 1 from crm.mining_jobs where id = jid and organization_id = org and dados->>'sourceProvider' = 'planilha') then
    raise exception 'Lista inválida para esta empresa.';
  end if;

  for r in select * from jsonb_array_elements(linhas) loop
    n := n + 1;
    v_cnpj := nullif(regexp_replace(coalesce(r->>'cnpj', ''), '\D', '', 'g'), '');
    if v_cnpj is not null and length(v_cnpj) <> 14 then v_cnpj := null; end if;
    v_email := nullif(lower(trim(coalesce(r->>'email', ''))), '');
    if v_email is not null and (v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 254) then
      erros := erros || jsonb_build_object('linha', n, 'motivo', 'E-mail inválido: importado sem e-mail'); v_email := null; end if;
    v_razao := nullif(left(trim(coalesce(r->>'razao_social', '')), 200), '');
    v_emp := coalesce(nullif(left(trim(coalesce(r->>'nome_fantasia', '')), 200), ''), v_razao);
    v_contato := nullif(left(trim(coalesce(r->>'contato', '')), 200), '');
    -- Só o domínio: o agente consulta o Snov.io por domínio, nunca segue a URL.
    v_site := lower(trim(coalesce(r->>'site', '')));
    v_site := regexp_replace(regexp_replace(regexp_replace(v_site, '^https?://', ''), '^www\.', ''), '[/?#].*$', '');
    if v_site !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$' or length(v_site) > 253 then v_site := null; end if;

    if v_emp is null and v_contato is null and v_email is null then
      ign := ign + 1; erros := erros || jsonb_build_object('linha', n, 'motivo', 'Sem empresa, contato ou e-mail'); continue; end if;
    if exists(select 1 from crm.mining_leads m where m.job_id = jid
              and ((v_cnpj is not null and m.cnpj_raw = v_cnpj) or (v_email is not null and lower(m.dados->>'emailCompany') = v_email)
                or (v_cnpj is null and v_email is null and v_site is not null and m.dados->>'website' = v_site
                    and lower(coalesce(m.dados->>'contactName', '')) = lower(coalesce(v_contato, ''))))) then
      ign := ign + 1; erros := erros || jsonb_build_object('linha', n, 'motivo', 'Repetido nesta lista'); continue; end if;
    if v_email is null and v_site is null then
      erros := erros || jsonb_build_object('linha', n, 'motivo', 'Sem e-mail e sem site: o Snov.io não consegue localizar; ficará para revisão'); end if;

    insert into crm.mining_leads(organization_id, job_id, cnpj_raw, dados)
    values (org, jid, v_cnpj, jsonb_strip_nulls(jsonb_build_object(
      'jobId', jid, 'name', coalesce(v_razao, v_emp, v_contato, ''), 'tradeName', coalesce(v_emp, v_contato, ''),
      'cnpj', case when v_cnpj is not null then regexp_replace(v_cnpj, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5') else '' end,
      'contactName', coalesce(v_contato, ''), 'contactRole', nullif(left(trim(coalesce(r->>'cargo', '')), 200), ''),
      'emailCompany', coalesce(v_email, ''), 'contactEmail', coalesce(v_email, ''),
      'phoneCompany', nullif(left(trim(coalesce(r->>'telefone', '')), 40), ''), 'contactPhone', '',
      'website', coalesce(v_site, ''), 'city', left(trim(coalesce(r->>'cidade', '')), 120), 'state', upper(left(trim(coalesce(r->>'uf', '')), 2)),
      'segment', left(trim(coalesce(r->>'segmento', '')), 200), 'reason', nullif(left(trim(coalesce(r->>'observacoes', '')), 1000), ''),
      'partners', '[]'::jsonb, 'sources', jsonb_build_array(v_fonte), 'sourceProvider', 'planilha',
      'scoreIa', 0, 'isGarimpo', false, 'debtStatus', '', 'debtValueEst', '')));
    ins := ins + 1;
  end loop;

  select count(*) into total from crm.mining_leads where job_id = jid;
  update crm.mining_jobs set dados = dados || jsonb_build_object('foundCount', total, 'targetCount', greatest(total, 1)), updated_at = now() where id = jid;
  return jsonb_build_object('job_id', jid, 'inseridos', ins, 'ignorados', ign, 'erros', erros);
end $$;
revoke all on function crm.import_radar_sheet(uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function crm.import_radar_sheet(uuid, uuid, text, jsonb, text) to authenticated, service_role;

-- Planilha quase nunca traz CNPJ: sem isto cada linha viraria um lead novo
-- mesmo quando o e-mail já existe na empresa. Único trecho alterado: a busca
-- do lead existente passa a cair no e-mail quando não há CNPJ.
create or replace function crm.prepare_sdr_queue() returns integer language plpgsql security definer set search_path=crm,pg_temp as $$
declare m record; lid uuid; v_email text; n integer:=0; begin
 for m in select ml.*,s.sequence_id,s.simulate,s.contact_basis from crm.mining_leads ml
 join crm.sdr_settings s on s.organization_id=ml.organization_id and s.enabled and (s.radar_job_id is null or s.radar_job_id=ml.job_id)
 join crm.organizations o on o.id=s.organization_id and o.ativo
 join crm.outreach_sequences seq on seq.id=s.sequence_id and seq.status='ACTIVE'
 where not ml.imported and coalesce(ml.dados->>'sourceProvider','') <> 'snov'
 and not exists(select 1 from crm.sdr_queue q where q.mining_lead_id=ml.id)
 order by ml.created_at for update of ml skip locked limit 10 loop
   v_email:=case when m.dados->>'emailCompany' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then lower(m.dados->>'emailCompany') else '' end;
   lid:=null;
   select id into lid from crm.leads where organization_id=m.organization_id and nullif(cnpj_raw,'')=nullif(m.cnpj_raw,'') limit 1;
   if lid is null and nullif(m.cnpj_raw,'') is null and v_email<>'' then
     select id into lid from crm.leads where organization_id=m.organization_id and lower(email)=v_email order by created_at limit 1;
   end if;
   if lid is null then
     insert into crm.leads(organization_id,nome,empresa,email,telefone,cnpj_raw,segmento,cidade,uf,dados,contact_basis,contact_source,relacao)
     values(m.organization_id,coalesce(m.dados->>'contactName',''),coalesce(m.dados->>'tradeName',m.dados->>'name'),
       v_email,
       coalesce(m.dados->>'phoneCompany',m.dados->>'phone'),m.cnpj_raw,m.dados->>'segment',m.dados->>'city',m.dados->>'state',m.dados||jsonb_build_object('radarJobId',m.job_id),
       m.contact_basis,'Radar '||m.job_id||' · '||left(coalesce(m.dados->'sources','[]')::text,800),'prospect') returning id into lid;
   end if;
   update crm.leads set dados=jsonb_set(dados,'{radarJobIds}',coalesce(dados->'radarJobIds','[]'::jsonb) || to_jsonb(m.job_id::text))
   where id=lid and organization_id=m.organization_id and not (coalesce(dados->'radarJobIds','[]'::jsonb) ? m.job_id::text);
   insert into crm.sdr_queue(organization_id,mining_lead_id,lead_id,sequence_id,simulate) values(m.organization_id,m.id,lid,m.sequence_id,m.simulate) on conflict do nothing;
   update crm.mining_leads set imported=true where id=m.id;
   n:=n+1;
 end loop;
 return n;
end $$;
commit;
