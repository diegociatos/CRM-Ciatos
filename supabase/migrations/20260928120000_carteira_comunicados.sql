-- Carteira de clientes, importação, comunicados (avisos/notícias) e cadências
-- com vários e-mails.
--
-- * leads.relacao: 'cliente' (carteira, relação contratual) ou 'prospect'.
--   Cliente da carteira NÃO precisa de verificação de e-mail pelo Snov.io para
--   receber cadência/comunicado; prospect continua exigindo (e-mail frio).
-- * leads.tags: segmentação livre (ex.: "Simples Nacional", "Newsletter").
-- * outreach_policy: nome do remetente e endereço de resposta (reply_to).
-- * broadcasts / broadcast_recipients: comunicado único para um público.
--   O envio é feito pelo crm-automation-worker, em lotes, com descadastro.

-- Quem administra a operação da empresa: papel ADMIN no vínculo, ou master /
-- dono da plataforma que também seja membro ativo.
create or replace function crm.pode_administrar(org uuid) returns boolean
language sql stable security definer set search_path = crm, pg_temp as $$
  select crm.tenant_member(org, true) or (crm.tenant_member(org) and crm.can_manage_company(org))
$$;
revoke execute on function crm.pode_administrar(uuid) from public, anon;
grant execute on function crm.pode_administrar(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leads: relação e etiquetas
-- ---------------------------------------------------------------------------
alter table crm.leads add column if not exists relacao text not null default 'prospect';
alter table crm.leads drop constraint if exists leads_relacao_check;
alter table crm.leads add constraint leads_relacao_check check (relacao in ('prospect','cliente'));
alter table crm.leads add column if not exists tags text[] not null default '{}';
create index if not exists leads_tags_idx on crm.leads using gin (tags);
create index if not exists leads_relacao_idx on crm.leads (organization_id, relacao);

-- Fechou contrato => vira cliente da carteira. Cliente sem base registrada
-- recebe a base contratual automaticamente (pode ser editada depois).
create or replace function crm.lead_relacao_defaults() returns trigger language plpgsql as $$
begin
  if new.status = 'Fechado (Ganho)' then new.relacao := 'cliente'; end if;
  new.tags := coalesce((select array_agg(distinct t order by t) from unnest(new.tags) t where length(trim(t)) > 0), '{}');
  if new.relacao = 'cliente' then
    if nullif(trim(new.contact_basis),'') is null then new.contact_basis := 'Cliente da carteira: relação contratual'; end if;
    if nullif(trim(new.contact_source),'') is null then new.contact_source := 'Cadastro do cliente no CRM'; end if;
  end if;
  return new;
end $$;
drop trigger if exists lead_relacao_defaults on crm.leads;
create trigger lead_relacao_defaults before insert or update on crm.leads
  for each row execute function crm.lead_relacao_defaults();

update crm.leads set relacao = 'cliente' where status = 'Fechado (Ganho)' and relacao <> 'cliente';

-- ---------------------------------------------------------------------------
-- Política de envio: nome do remetente e resposta
-- ---------------------------------------------------------------------------
alter table crm.outreach_policy add column if not exists sender_name text;
alter table crm.outreach_policy add column if not exists reply_to text;
alter table crm.outreach_policy drop constraint if exists outreach_policy_reply_to_check;
alter table crm.outreach_policy add constraint outreach_policy_reply_to_check
  check (reply_to is null or reply_to ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$');
alter table crm.outreach_policy drop constraint if exists outreach_policy_sender_name_check;
alter table crm.outreach_policy add constraint outreach_policy_sender_name_check
  check (sender_name is null or (length(sender_name) between 2 and 80 and sender_name !~ '[<>"\r\n]'));

create or replace function crm.save_outreach_policy(org uuid, live boolean, sender_email text, from_name text, reply_address text, per_day integer)
returns void language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  -- Ligar envio real é decisão do dono da plataforma ou do master da empresa.
  if not crm.can_manage_company(org) then raise exception 'Somente o master da empresa ou o dono da plataforma configura o envio.'; end if;
  if per_day is null or per_day not between 1 and 1000 then raise exception 'Limite diário deve ficar entre 1 e 1000.'; end if;
  if live and nullif(trim(sender_email),'') is null then raise exception 'Informe o e-mail remetente antes de ligar o envio.'; end if;
  insert into crm.outreach_policy(organization_id) values (org) on conflict do nothing;
  update crm.outreach_policy set
    live_enabled = live,
    sender = nullif(lower(trim(sender_email)),''),
    sender_name = nullif(trim(from_name),''),
    reply_to = nullif(lower(trim(reply_address)),''),
    daily_limit = per_day,
    mailbox_daily_limit = greatest(mailbox_daily_limit, per_day)
  where organization_id = org;
end $$;

-- ---------------------------------------------------------------------------
-- Cadência: cliente da carteira dispensa verificação Snov; remetente com nome
-- ---------------------------------------------------------------------------
create or replace function crm.authorize_dispatch(jid bigint, token uuid) returns jsonb
language plpgsql security definer set search_path to 'crm', 'pg_temp' as $function$
declare j crm.automation_jobs; e crm.sequence_enrollments; l crm.leads; p crm.outreach_policy; local_time timestamp; reason text; begin
 select * into j from crm.automation_jobs where id=jid for update;
 if j.status<>'RUNNING' or j.lease_token is distinct from token or j.locked_at<now()-interval '4 minutes' or j.dispatch_started_at is not null then raise exception 'Invalid lease'; end if;
 select * into e from crm.sequence_enrollments where id=j.enrollment_id;
 select * into l from crm.leads where id=e.lead_id;
 select * into p from crm.outreach_policy where organization_id=e.organization_id for update;
 if not found then reason:='policy_missing';
 elsif e.status<>'ACTIVE' or not exists(select 1 from crm.outreach_sequences where id=e.sequence_id and status='ACTIVE') then reason:='paused';
 elsif not crm.company_available(e.organization_id) then reason:='organization_inactive';
 elsif l.opt_out or exists(select 1 from crm.suppression_list where organization_id=e.organization_id and lower(email)=lower(l.email)) then reason:='suppressed';
 elsif j.payload->>'recipient' is distinct from l.email then reason:='contact_changed';
 elsif j.job_type='EMAIL' then
   local_time:=now() at time zone p.timezone;
   if l.email is null or l.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then reason:='invalid_email';
   elsif not e.dry_run and (not p.live_enabled or p.sender is null) then reason:='live_disabled';
   -- Prospect (e-mail frio) exige e-mail verificado há menos de 30 dias; cliente
   -- da carteira não. Ambos exigem base e origem do contato registradas.
   elsif not e.dry_run and ((l.relacao<>'cliente' and (l.email_verified_at is null or l.email_verified_at<now()-interval '30 days'))
         or nullif(trim(l.contact_basis),'') is null or nullif(trim(l.contact_source),'') is null) then reason:='contact_review_required';
   elsif extract(isodow from local_time)>5 or extract(hour from local_time)<9 or extract(hour from local_time)>=18 then
     update crm.automation_jobs set status='PENDING',run_at=now()+interval '1 hour',lease_token=null where id=jid;
     return jsonb_build_object('allowed',false,'reason','business_hours');
   elsif not e.dry_run then
     perform pg_advisory_xact_lock(hashtext(lower(p.sender)));
     if crm.emails_sent_today(e.organization_id) >= p.daily_limit
     or (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id=a.enrollment_id join crm.outreach_policy x on x.organization_id=a.organization_id where lower(x.sender)=lower(p.sender) and not n.dry_run and a.job_type='EMAIL' and a.dispatch_started_at>=date_trunc('day',now()))>=p.mailbox_daily_limit then
       update crm.automation_jobs set status='PENDING',run_at=now()+interval '1 hour',lease_token=null where id=jid;
       return jsonb_build_object('allowed',false,'reason','daily_limit');
     end if;
   end if;
 end if;
 if reason is not null then
   update crm.automation_jobs set status='CANCELLED',last_error=reason where id=jid;
   update crm.sequence_enrollments set status='STOPPED',stop_reason=reason where id=e.id;
   insert into crm.human_handoffs(organization_id,lead_id,job_id,reason,suggested_action) values(e.organization_id,l.id,jid,reason,'Revisar elegibilidade do contato. Não reiniciar sem avaliação.') on conflict(job_id) do nothing;
   return jsonb_build_object('allowed',false,'reason',reason);
 end if;
 update crm.automation_jobs set dispatch_started_at=now() where id=jid;
 return jsonb_build_object('allowed',true,'sender',p.sender,'sender_name',coalesce(p.sender_name,(select nome from crm.organizations where id=e.organization_id)),'reply_to',p.reply_to);
end $function$;

-- Cadência com vários e-mails. passos = [{assunto, corpo, espera_dias}], o
-- primeiro sai na hora da inscrição; depois do último, revisão humana.
create or replace function crm.create_cadence_v2(org uuid, title text, publico text, passos jsonb, espera_final integer default 3)
returns uuid language plpgsql security definer set search_path = crm, pg_temp as $$
declare sid uuid; p jsonb; i integer := 0; espera integer; begin
  if not crm.pode_administrar(org) then raise exception 'Forbidden'; end if;
  if length(trim(title)) not between 1 and 100 then raise exception 'Nome da cadência inválido.'; end if;
  if publico not in ('cliente','prospect') then raise exception 'Público inválido.'; end if;
  if jsonb_typeof(passos) <> 'array' or jsonb_array_length(passos) not between 1 and 8 then raise exception 'A cadência precisa de 1 a 8 e-mails.'; end if;
  if espera_final is null or espera_final not between 1 and 30 then raise exception 'Espera final deve ficar entre 1 e 30 dias.'; end if;
  insert into crm.outreach_sequences(organization_id, nome, status, created_by, settings)
    values (org, trim(title), 'DRAFT', auth.uid(), jsonb_build_object('publico', publico)) returning id into sid;
  for p in select * from jsonb_array_elements(passos) loop
    espera := coalesce((p->>'espera_dias')::integer, 0);
    if length(trim(coalesce(p->>'assunto',''))) not between 1 and 200 or length(trim(coalesce(p->>'corpo',''))) not between 1 and 6000 then
      raise exception 'E-mail % sem assunto ou mensagem.', i + 1; end if;
    if i > 0 and espera not between 1 and 30 then raise exception 'Espera antes do e-mail % deve ficar entre 1 e 30 dias.', i + 1; end if;
    insert into crm.outreach_steps(sequence_id, ordem, tipo, delay_minutes, config)
      values (sid, i, 'EMAIL', case when i = 0 then 0 else espera * 1440 end,
              jsonb_build_object('subject', trim(p->>'assunto'), 'body', trim(p->>'corpo')));
    i := i + 1;
  end loop;
  insert into crm.outreach_steps(sequence_id, ordem, tipo, delay_minutes, config)
    values (sid, i, 'NOTIFY_HUMAN', espera_final * 1440, '{"reason":"Cadência concluída sem resposta. Avaliar próximo contato."}');
  return sid;
end $$;

-- Inscrição em lote. Ignora (sem erro) quem não pode receber.
create or replace function crm.enroll_leads(sid uuid, lids uuid[], simulate boolean default true)
returns jsonb language plpgsql security definer set search_path = crm, pg_temp as $$
declare s crm.outreach_sequences; inscritos integer := 0; total integer := coalesce(array_length(lids,1),0); begin
  select * into s from crm.outreach_sequences where id = sid;
  if not found or not crm.pode_administrar(s.organization_id) or s.status <> 'ACTIVE' then raise exception 'Cadência inativa ou sem permissão.'; end if;
  if total > 2000 then raise exception 'Inscreva no máximo 2000 contatos por vez.'; end if;
  if not simulate and not exists(select 1 from crm.outreach_policy where organization_id = s.organization_id and live_enabled and sender is not null) then
    raise exception 'O envio real está desligado nesta empresa. Configure o envio primeiro.'; end if;
  insert into crm.sequence_enrollments(organization_id, sequence_id, lead_id, dry_run, next_run_at)
  select s.organization_id, sid, l.id, simulate, now()
  from crm.leads l
  where l.id = any(lids) and l.organization_id = s.organization_id and not l.opt_out
    and l.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and not exists(select 1 from crm.suppression_list x where x.organization_id = s.organization_id and lower(x.email) = lower(l.email))
    and not exists(select 1 from crm.sequence_enrollments n where n.sequence_id = sid and n.lead_id = l.id and n.status in ('ACTIVE','PAUSED'));
  get diagnostics inscritos = row_count;
  return jsonb_build_object('inscritos', inscritos, 'ignorados', total - inscritos);
end $$;

-- ---------------------------------------------------------------------------
-- Importação de contatos
-- ---------------------------------------------------------------------------
-- linhas: [{razao_social, nome_fantasia, cnpj, contato, cargo, email, telefone,
--           cidade, uf, segmento, observacoes, tags}]
-- Casa por CNPJ (14 dígitos) ou, sem CNPJ, por e-mail. Registro existente só
-- tem campos VAZIOS completados (nunca sobrescreve) e etiquetas somadas.
create or replace function crm.import_leads(org uuid, tipo text, linhas jsonb, etiquetas text[] default '{}', fonte text default 'Importação de planilha')
returns jsonb language plpgsql security definer set search_path = crm, pg_temp as $$
declare r jsonb; n integer := 0; ins integer := 0; upd integer := 0; ign integer := 0; erros jsonb := '[]';
  v_cnpj text; v_email text; v_emp text; v_tags text[]; existente uuid; cliente boolean := tipo = 'cliente'; dono uuid; begin
  if not crm.pode_administrar(org) then raise exception 'Somente administradores importam contatos.'; end if;
  -- Responsável = quem importa, se for membro da empresa (o dono da plataforma pode não ser).
  dono := case when exists(select 1 from crm.organization_members m where m.organization_id = org and m.user_id = auth.uid() and m.ativo) then auth.uid() end;
  if tipo not in ('cliente','prospect') then raise exception 'Tipo inválido.'; end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) > 1000 then raise exception 'Envie no máximo 1000 linhas por lote.'; end if;
  for r in select * from jsonb_array_elements(linhas) loop
    n := n + 1;
    begin
      v_cnpj := nullif(regexp_replace(coalesce(r->>'cnpj',''), '\D', '', 'g'), '');
      if v_cnpj is not null and length(v_cnpj) <> 14 then v_cnpj := null; end if;
      v_email := nullif(lower(trim(coalesce(r->>'email',''))), '');
      if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        erros := erros || jsonb_build_object('linha', n, 'motivo', 'E-mail inválido: importado sem e-mail'); v_email := null; end if;
      v_emp := nullif(trim(coalesce(nullif(trim(r->>'nome_fantasia'),''), r->>'razao_social', '')), '');
      if v_emp is null and nullif(trim(r->>'contato'),'') is null and v_email is null then
        ign := ign + 1; erros := erros || jsonb_build_object('linha', n, 'motivo', 'Sem empresa, contato ou e-mail'); continue; end if;
      v_tags := coalesce(etiquetas, '{}') || coalesce((select array_agg(trim(t)) from unnest(string_to_array(coalesce(r->>'tags',''), ';')) t where trim(t) <> ''), '{}');

      existente := null;
      if v_cnpj is not null then select id into existente from crm.leads where organization_id = org and cnpj_raw = v_cnpj; end if;
      if existente is null and v_email is not null then select id into existente from crm.leads where organization_id = org and lower(email) = v_email limit 1; end if;

      if existente is not null then
        update crm.leads set
          nome = coalesce(nullif(nome,''), nullif(trim(r->>'contato'),'')),
          email = coalesce(nullif(email,''), v_email),
          telefone = coalesce(nullif(telefone,''), nullif(trim(r->>'telefone'),'')),
          empresa = coalesce(nullif(empresa,''), v_emp),
          cnpj_raw = coalesce(cnpj_raw, v_cnpj),
          cidade = coalesce(nullif(cidade,''), nullif(trim(r->>'cidade'),'')),
          uf = coalesce(nullif(uf,''), nullif(upper(left(trim(r->>'uf'),2)),'')),
          segmento = coalesce(nullif(segmento,''), nullif(trim(r->>'segmento'),'')),
          tags = tags || v_tags,
          relacao = case when cliente then 'cliente' else relacao end
        where id = existente;
        upd := upd + 1;
      else
        insert into crm.leads(organization_id, nome, email, telefone, empresa, cnpj_raw, status, phase_id, owner_id, in_queue,
                              segmento, cidade, uf, relacao, tags, contact_basis, contact_source, dados)
        values (org, nullif(trim(r->>'contato'),''), v_email, nullif(trim(r->>'telefone'),''), v_emp, v_cnpj,
                case when cliente then 'Fechado (Ganho)' else 'Qualificação' end,
                case when cliente then 'ph-fech' else 'ph-qualificado' end,
                dono, not cliente,
                nullif(trim(r->>'segmento'),''), nullif(trim(r->>'cidade'),''), nullif(upper(left(trim(r->>'uf'),2)),''),
                tipo, v_tags,
                case when cliente then 'Cliente da carteira: relação contratual' else null end,
                left(trim(fonte), 1000),
                jsonb_strip_nulls(jsonb_build_object(
                  'legalName', nullif(trim(r->>'razao_social'),''), 'tradeName', v_emp,
                  'cnpj', case when v_cnpj is not null then regexp_replace(v_cnpj, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5') end,
                  'role', nullif(trim(r->>'cargo'),''), 'notes', nullif(trim(r->>'observacoes'),''),
                  'companyEmail', v_email, 'importadoEm', now())));
        ins := ins + 1;
      end if;
    exception when others then
      ign := ign + 1; erros := erros || jsonb_build_object('linha', n, 'motivo', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('inseridos', ins, 'atualizados', upd, 'ignorados', ign, 'erros', erros);
end $$;

-- ---------------------------------------------------------------------------
-- Comunicados
-- ---------------------------------------------------------------------------
create table if not exists crm.broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 120),
  assunto text not null check (length(assunto) between 1 and 200 and assunto !~ '[\r\n]'),
  corpo text not null check (length(corpo) between 1 and 20000),
  audiencia jsonb not null default '{}',
  status text not null default 'DRAFT' check (status in ('DRAFT','SCHEDULED','SENDING','SENT','CANCELLED')),
  scheduled_at timestamptz,
  launched_at timestamptz,
  finished_at timestamptz,
  total integer not null default 0,
  created_by uuid references crm.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists broadcasts_org_idx on crm.broadcasts (organization_id, created_at desc);
drop trigger if exists broadcasts_touch on crm.broadcasts;
create trigger broadcasts_touch before update on crm.broadcasts for each row execute function crm.touch_updated_at();

create table if not exists crm.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references crm.broadcasts(id) on delete cascade,
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  lead_id uuid references crm.leads(id) on delete set null,
  email text not null,
  nome text,
  empresa text,
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','SKIPPED','FAILED')),
  lease_token uuid,
  locked_at timestamptz,
  provider_message_id text unique,
  optout_token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists broadcast_recipients_email_uk on crm.broadcast_recipients (broadcast_id, lower(email));
create index if not exists broadcast_recipients_queue_idx on crm.broadcast_recipients (broadcast_id, status);
create index if not exists broadcast_recipients_sent_idx on crm.broadcast_recipients (organization_id, sent_at);

alter table crm.message_events add column if not exists broadcast_id uuid references crm.broadcasts(id) on delete cascade;

alter table crm.broadcasts enable row level security;
alter table crm.broadcast_recipients enable row level security;
drop policy if exists broadcasts_read on crm.broadcasts;
create policy broadcasts_read on crm.broadcasts for select to authenticated using (crm.tenant_member(organization_id));
drop policy if exists broadcast_recipients_read on crm.broadcast_recipients;
create policy broadcast_recipients_read on crm.broadcast_recipients for select to authenticated using (crm.pode_administrar(organization_id));
revoke all on crm.broadcasts, crm.broadcast_recipients from anon, authenticated;
grant select on crm.broadcasts, crm.broadcast_recipients to authenticated;
grant all on crm.broadcasts, crm.broadcast_recipients to service_role;

-- E-mails reais já despachados hoje pela empresa (cadência + comunicado).
create or replace function crm.emails_sent_today(org uuid) returns bigint
language sql stable security definer set search_path = crm, pg_temp as $$
  select (select count(*) from crm.automation_jobs a join crm.sequence_enrollments n on n.id = a.enrollment_id
          where a.organization_id = org and not n.dry_run and a.job_type = 'EMAIL' and a.dispatch_started_at >= date_trunc('day', now()))
       + (select count(*) from crm.broadcast_recipients r
          where r.organization_id = org and r.status in ('SENDING','SENT','FAILED') and coalesce(r.sent_at, r.locked_at) >= date_trunc('day', now()))
$$;

-- Público: {relacao: 'cliente'|'prospect'|'todos', tags: [...], uf: 'MG', segmento: '...'}
create or replace function crm.broadcast_audience(org uuid, aud jsonb)
returns table(lead_id uuid, email text, nome text, empresa text)
language sql stable security definer set search_path = crm, pg_temp as $$
  select distinct on (lower(l.email)) l.id, lower(l.email), l.nome, l.empresa
  from crm.leads l
  where l.organization_id = org and not l.opt_out
    and l.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and not exists(select 1 from crm.suppression_list x where x.organization_id = org and lower(x.email) = lower(l.email))
    and (coalesce(aud->>'relacao','cliente') = 'todos' or l.relacao = coalesce(aud->>'relacao','cliente'))
    and (coalesce(jsonb_array_length(aud->'tags'),0) = 0 or l.tags && array(select jsonb_array_elements_text(aud->'tags')))
    and (nullif(aud->>'uf','') is null or upper(l.uf) = upper(aud->>'uf'))
    and (nullif(aud->>'segmento','') is null or l.segmento ilike '%' || (aud->>'segmento') || '%')
    and (l.relacao <> 'prospect' or (l.email_verified_at >= now() - interval '30 days' and nullif(trim(l.contact_basis),'') is not null))
  order by lower(l.email), l.created_at
$$;
revoke execute on function crm.broadcast_audience(uuid, jsonb) from public, anon, authenticated;

create or replace function crm.broadcast_audience_count(org uuid, aud jsonb) returns jsonb
language plpgsql stable security definer set search_path = crm, pg_temp as $$
begin
  if not crm.tenant_member(org) then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'total', (select count(*) from crm.broadcast_audience(org, aud)),
    'exemplos', coalesce((select jsonb_agg(coalesce(empresa, nome, email)) from (select * from crm.broadcast_audience(org, aud) limit 5) x), '[]'));
end $$;

create or replace function crm.save_broadcast(org uuid, bid uuid, title text, subject text, body text, aud jsonb)
returns uuid language plpgsql security definer set search_path = crm, pg_temp as $$
declare result uuid; begin
  if not crm.pode_administrar(org) then raise exception 'Somente administradores criam comunicados.'; end if;
  if bid is null then
    insert into crm.broadcasts(organization_id, titulo, assunto, corpo, audiencia, created_by)
      values (org, trim(title), trim(subject), trim(body), coalesce(aud, '{}'), auth.uid()) returning id into result;
  else
    update crm.broadcasts set titulo = trim(title), assunto = trim(subject), corpo = trim(body), audiencia = coalesce(aud, '{}')
      where id = bid and organization_id = org and status = 'DRAFT' returning id into result;
    if result is null then raise exception 'Só é possível editar comunicados em rascunho.'; end if;
  end if;
  return result;
end $$;

create or replace function crm.delete_broadcast(bid uuid) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  delete from crm.broadcasts b where b.id = bid and b.status = 'DRAFT' and crm.pode_administrar(b.organization_id);
  if not found then raise exception 'Só rascunhos podem ser excluídos.'; end if;
end $$;

create or replace function crm.launch_broadcast(bid uuid, quando timestamptz default null) returns jsonb
language plpgsql security definer set search_path = crm, pg_temp as $$
declare b crm.broadcasts; n integer; begin
  select * into b from crm.broadcasts where id = bid for update;
  if not found or not crm.pode_administrar(b.organization_id) then raise exception 'Forbidden'; end if;
  if b.status <> 'DRAFT' then raise exception 'Este comunicado já foi disparado.'; end if;
  if not exists(select 1 from crm.outreach_policy where organization_id = b.organization_id and live_enabled and sender is not null) then
    raise exception 'O envio está desligado nesta empresa. Configure o envio antes de disparar.'; end if;
  insert into crm.broadcast_recipients(broadcast_id, organization_id, lead_id, email, nome, empresa)
    select bid, b.organization_id, a.lead_id, a.email, a.nome, a.empresa from crm.broadcast_audience(b.organization_id, b.audiencia) a
    on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nenhum contato elegível para este público.'; end if;
  update crm.broadcasts set total = n, launched_at = now(),
    scheduled_at = case when quando > now() then quando end,
    status = case when quando > now() then 'SCHEDULED' else 'SENDING' end
  where id = bid;
  return jsonb_build_object('total', n);
end $$;

create or replace function crm.cancel_broadcast(bid uuid) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  update crm.broadcasts b set status = 'CANCELLED', finished_at = now()
    where b.id = bid and b.status in ('SCHEDULED','SENDING') and crm.pode_administrar(b.organization_id);
  if not found then raise exception 'Nada a cancelar.'; end if;
  update crm.broadcast_recipients set status = 'SKIPPED', error = 'cancelled' where broadcast_id = bid and status = 'PENDING';
end $$;

-- Worker: reserva um lote de destinatários de UM comunicado, respeitando o
-- limite diário da empresa. Resultado incerto nunca é reenviado.
create or replace function crm.claim_broadcast_batch(max_n integer default 20) returns jsonb
language plpgsql security definer set search_path = crm, pg_temp as $$
declare b crm.broadcasts; p crm.outreach_policy; livres integer; lote jsonb; begin
  update crm.broadcast_recipients set status = 'FAILED', error = 'dispatch_uncertain'
    where status = 'SENDING' and locked_at < now() - interval '5 minutes';
  update crm.broadcasts set status = 'SENDING' where status = 'SCHEDULED' and scheduled_at <= now();
  update crm.broadcasts x set status = 'SENT', finished_at = now()
    where x.status = 'SENDING' and not exists(select 1 from crm.broadcast_recipients r where r.broadcast_id = x.id and r.status in ('PENDING','SENDING'));

  select * into b from crm.broadcasts x
    where x.status = 'SENDING' and crm.company_available(x.organization_id)
      and exists(select 1 from crm.broadcast_recipients r where r.broadcast_id = x.id and r.status = 'PENDING')
    order by x.launched_at for update skip locked limit 1;
  if not found then return null; end if;
  select * into p from crm.outreach_policy where organization_id = b.organization_id;
  if not found or not p.live_enabled or p.sender is null then return null; end if;

  -- Quem se descadastrou depois do disparo sai da fila.
  update crm.broadcast_recipients r set status = 'SKIPPED', error = 'suppressed'
    where r.broadcast_id = b.id and r.status = 'PENDING'
      and (exists(select 1 from crm.suppression_list x where x.organization_id = b.organization_id and lower(x.email) = lower(r.email))
        or exists(select 1 from crm.leads l where l.id = r.lead_id and l.opt_out));

  perform pg_advisory_xact_lock(hashtext(lower(p.sender)));
  livres := least(greatest(max_n, 1), 50, p.daily_limit - crm.emails_sent_today(b.organization_id));
  if livres <= 0 then return null; end if;

  with alvo as (
    select id from crm.broadcast_recipients where broadcast_id = b.id and status = 'PENDING'
    order by created_at, id for update skip locked limit livres
  ), marcados as (
    update crm.broadcast_recipients r set status = 'SENDING', locked_at = now(), lease_token = gen_random_uuid()
    from alvo where r.id = alvo.id
    returning r.id, r.email, r.nome, r.empresa, r.optout_token, r.lease_token
  )
  select jsonb_agg(to_jsonb(marcados)) into lote from marcados;
  if lote is null then return null; end if;

  return jsonb_build_object(
    'broadcast_id', b.id, 'organization_id', b.organization_id, 'assunto', b.assunto, 'corpo', b.corpo,
    'sender', p.sender, 'sender_name', coalesce(p.sender_name, (select nome from crm.organizations where id = b.organization_id)),
    'reply_to', p.reply_to, 'empresa_remetente', (select nome from crm.organizations where id = b.organization_id),
    'recipients', lote);
end $$;

create or replace function crm.finish_broadcast_recipient(rid uuid, token uuid, ok boolean, message_id text default null, motivo text default null)
returns void language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  update crm.broadcast_recipients set
    status = case when ok then 'SENT' else 'FAILED' end,
    provider_message_id = message_id, sent_at = case when ok then now() end,
    error = case when ok then null else left(coalesce(motivo, 'provider_failure'), 200) end,
    lease_token = null
  where id = rid and status = 'SENDING' and lease_token = token;
  if not found then raise exception 'Stale lease'; end if;
end $$;

revoke execute on function crm.claim_broadcast_batch(integer), crm.finish_broadcast_recipient(uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function crm.claim_broadcast_batch(integer), crm.finish_broadcast_recipient(uuid, uuid, boolean, text, text) to service_role;

-- Estatística por comunicado (para a tela).
create or replace function crm.broadcast_stats(org uuid) returns table(broadcast_id uuid, enviados bigint, falhas bigint, pendentes bigint, entregues bigint, abertos bigint, clicados bigint, devolvidos bigint, descadastros bigint)
language sql stable security definer set search_path = crm, pg_temp as $$
  select b.id,
    (select count(*) from crm.broadcast_recipients r where r.broadcast_id = b.id and r.status = 'SENT'),
    (select count(*) from crm.broadcast_recipients r where r.broadcast_id = b.id and r.status = 'FAILED'),
    (select count(*) from crm.broadcast_recipients r where r.broadcast_id = b.id and r.status in ('PENDING','SENDING')),
    (select count(distinct provider_message_id) from crm.message_events e where e.broadcast_id = b.id and e.event_type = 'email.delivered'),
    (select count(distinct provider_message_id) from crm.message_events e where e.broadcast_id = b.id and e.event_type = 'email.opened'),
    (select count(distinct provider_message_id) from crm.message_events e where e.broadcast_id = b.id and e.event_type = 'email.clicked'),
    (select count(distinct provider_message_id) from crm.message_events e where e.broadcast_id = b.id and e.event_type in ('email.bounced','email.complained')),
    (select count(*) from crm.broadcast_recipients r join crm.suppression_list x on x.organization_id = r.organization_id and lower(x.email) = lower(r.email)
       where r.broadcast_id = b.id and x.reason = 'unsubscribe')
  from crm.broadcasts b where b.organization_id = org and crm.tenant_member(org)
$$;

-- ---------------------------------------------------------------------------
-- Webhook e descadastro também reconhecem comunicados
-- ---------------------------------------------------------------------------
create or replace function crm.record_outreach_event(event_id text, mid text, kind text, happened timestamptz) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
declare j crm.automation_jobs; r crm.broadcast_recipients; address text; begin
 if kind not in ('email.sent','email.delivered','email.opened','email.clicked','email.bounced','email.complained','reply','meeting') then return; end if;
 select * into j from crm.automation_jobs where provider_message_id = mid;
 if not found then
   select * into r from crm.broadcast_recipients where provider_message_id = mid;
   if not found then
     -- O webhook do Resend recebe eventos de TODA a conta (Chekly, ContaOne...).
     -- Evento antigo sem correspondência não é deste CRM: ignora em vez de
     -- pedir reenvio eterno. Evento recente pode ser corrida com o envio.
     if happened < now() - interval '10 minutes' then return; end if;
     raise exception 'Message not yet correlated';
   end if;
   insert into crm.message_events(organization_id, lead_id, broadcast_id, provider, provider_message_id, provider_event_id, event_type, occurred_at)
     values (r.organization_id, r.lead_id, r.broadcast_id, 'resend', mid, event_id, kind, happened) on conflict do nothing;
   if found and kind in ('email.bounced','email.complained') then perform crm.suppress_contact(r.organization_id, r.email, kind); end if;
   return;
 end if;
 insert into crm.message_events(organization_id,lead_id,enrollment_id,provider,provider_message_id,provider_event_id,event_type,occurred_at)
 values(j.organization_id,j.lead_id,j.enrollment_id,'resend',mid,event_id,kind,happened) on conflict do nothing;
 if not found then return; end if;
 if kind in ('email.bounced','email.complained') then
   address := j.payload->>'recipient';
   perform crm.suppress_contact(j.organization_id,address,kind);
 end if;
 if kind in ('reply','meeting','email.bounced','email.complained') then
   update crm.sequence_enrollments set status='STOPPED',stop_reason=kind where lead_id=j.lead_id and organization_id=j.organization_id and status in ('ACTIVE','PAUSED');
   insert into crm.human_handoffs(organization_id,lead_id,job_id,reason,priority,suggested_action)
   values(j.organization_id,j.lead_id,j.id,kind,'HIGH','Revisar resposta ou evento antes de retomar contato.') on conflict(job_id) do update set reason=excluded.reason,priority='HIGH',status='OPEN';
 end if;
end $$;

create or replace function crm.unsubscribe_outreach(token uuid) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
declare j crm.automation_jobs; r crm.broadcast_recipients; begin
 select * into j from crm.automation_jobs where optout_token = token;
 if found then perform crm.suppress_contact(j.organization_id, j.payload->>'recipient', 'unsubscribe'); return; end if;
 select * into r from crm.broadcast_recipients where optout_token = token;
 if found then perform crm.suppress_contact(r.organization_id, r.email, 'unsubscribe'); end if;
end $$;

-- Permissões das novas funções chamadas pelo navegador
revoke execute on function crm.save_outreach_policy(uuid, boolean, text, text, text, integer),
  crm.create_cadence_v2(uuid, text, text, jsonb, integer), crm.enroll_leads(uuid, uuid[], boolean),
  crm.import_leads(uuid, text, jsonb, text[], text), crm.broadcast_audience_count(uuid, jsonb),
  crm.save_broadcast(uuid, uuid, text, text, text, jsonb), crm.delete_broadcast(uuid),
  crm.launch_broadcast(uuid, timestamptz), crm.cancel_broadcast(uuid), crm.broadcast_stats(uuid),
  crm.emails_sent_today(uuid) from public, anon;
grant execute on function crm.save_outreach_policy(uuid, boolean, text, text, text, integer),
  crm.create_cadence_v2(uuid, text, text, jsonb, integer), crm.enroll_leads(uuid, uuid[], boolean),
  crm.import_leads(uuid, text, jsonb, text[], text), crm.broadcast_audience_count(uuid, jsonb),
  crm.save_broadcast(uuid, uuid, text, text, text, jsonb), crm.delete_broadcast(uuid),
  crm.launch_broadcast(uuid, timestamptz), crm.cancel_broadcast(uuid), crm.broadcast_stats(uuid)
  to authenticated, service_role;
grant execute on function crm.emails_sent_today(uuid) to service_role;
