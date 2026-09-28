-- Onboarding do cliente, versão 2:
-- * fases em tabela própria (antes ficavam dentro de leads.dados, sem como
--   o servidor achar prazos para lembrar ninguém);
-- * cada fase tem responsável interno, prazo calculado pelo modelo e quem
--   executa (equipe ou cliente);
-- * fila de e-mails (atribuída, liberada, lembrete, atraso, pedido ao cliente,
--   resumo diário) processada pelo crm-automation-worker;
-- * convites no calendário Outlook (via caixa do Microsoft 365) para as fases
--   e para a Agenda do CRM: campos calendar_* marcam o que precisa sincronizar.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists crm.onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  lead_id uuid not null references crm.leads(id) on delete cascade,
  template_id text,
  template_phase_id text,
  ordem integer not null,
  titulo text not null check (length(titulo) between 1 and 200),
  descricao text,
  executor text not null default 'equipe' check (executor in ('equipe','cliente')),
  responsavel_id uuid references crm.profiles(id) on delete set null,
  cliente_email text,
  obrigatoria boolean not null default true,
  status text not null default 'Pendente' check (status in ('Pendente','Em Andamento','Aguardando Cliente','Bloqueado','Concluido')),
  prazo date,
  concluida_em timestamptz,
  concluida_por uuid references crm.profiles(id) on delete set null,
  calendar_event_id text,
  calendar_dirty boolean not null default true,
  calendar_tentativas integer not null default 0,
  calendar_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboarding_steps_lead_idx on crm.onboarding_steps (lead_id, ordem);
create index if not exists onboarding_steps_resp_idx on crm.onboarding_steps (responsavel_id, status, prazo);
create index if not exists onboarding_steps_org_idx on crm.onboarding_steps (organization_id, status, prazo);
create index if not exists onboarding_steps_cal_idx on crm.onboarding_steps (calendar_dirty) where calendar_dirty;
drop trigger if exists onboarding_steps_touch on crm.onboarding_steps;
create trigger onboarding_steps_touch before update on crm.onboarding_steps for each row execute function crm.touch_updated_at();
drop trigger if exists company_people on crm.onboarding_steps;
create trigger company_people before insert or update on crm.onboarding_steps
  for each row execute function crm.company_person_guard('responsavel_id');

create table if not exists crm.onboarding_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  step_id uuid not null references crm.onboarding_steps(id) on delete cascade,
  autor_id uuid references crm.profiles(id) on delete set null,
  autor_nome text,
  texto text not null check (length(texto) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists onboarding_comments_step_idx on crm.onboarding_comments (step_id, created_at);

create table if not exists crm.onboarding_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  step_id uuid not null references crm.onboarding_steps(id) on delete cascade,
  path text not null unique,
  nome text not null,
  tamanho bigint,
  tipo text,
  enviado_por uuid references crm.profiles(id) on delete set null,
  enviado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_files_step_idx on crm.onboarding_files (step_id);

create table if not exists crm.onboarding_notifications (
  id bigserial primary key,
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  step_id uuid references crm.onboarding_steps(id) on delete cascade,
  lead_id uuid references crm.leads(id) on delete cascade,
  tipo text not null check (tipo in ('atribuida','liberada','lembrete_antes','lembrete_dia','atrasada','cliente_pedido','cliente_lembrete','resumo')),
  destinatario text not null,
  destinatario_nome text,
  referencia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
  tentativas integer not null default 0,
  lease_token uuid,
  locked_at timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
-- Um aviso de cada tipo por fase, destinatário e dia: nada de e-mail duplicado.
create unique index if not exists onboarding_notifications_uk
  on crm.onboarding_notifications (coalesce(step_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, lower(destinatario), referencia);
create index if not exists onboarding_notifications_queue_idx on crm.onboarding_notifications (status, created_at);

-- Eventos a cancelar no Outlook (fase apagada/concluída, compromisso excluído).
create table if not exists crm.calendar_cancellations (
  id bigserial primary key,
  organization_id uuid,
  event_id text not null unique,
  motivo text,
  tentativas integer not null default 0,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- Agenda do CRM também vai para o Outlook.
alter table crm.agenda_events add column if not exists calendar_event_id text;
alter table crm.agenda_events add column if not exists calendar_dirty boolean not null default true;
alter table crm.agenda_events add column if not exists calendar_tentativas integer not null default 0;
alter table crm.agenda_events add column if not exists calendar_error text;

-- ---------------------------------------------------------------------------
-- Gatilhos de sincronização com o calendário
-- ---------------------------------------------------------------------------
create or replace function crm.onboarding_calendar_mark() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.prazo is distinct from old.prazo or new.responsavel_id is distinct from old.responsavel_id
      or new.titulo is distinct from old.titulo or new.status is distinct from old.status or new.descricao is distinct from old.descricao) then
    new.calendar_dirty := true; new.calendar_tentativas := 0; new.calendar_error := null;
  end if;
  return new;
end $$;
drop trigger if exists onboarding_calendar_mark on crm.onboarding_steps;
create trigger onboarding_calendar_mark before update on crm.onboarding_steps for each row execute function crm.onboarding_calendar_mark();

create or replace function crm.onboarding_calendar_cancel() returns trigger language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  if old.calendar_event_id is not null then
    insert into crm.calendar_cancellations(organization_id, event_id, motivo) values (old.organization_id, old.calendar_event_id, 'removida') on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists onboarding_calendar_cancel on crm.onboarding_steps;
create trigger onboarding_calendar_cancel after delete on crm.onboarding_steps for each row execute function crm.onboarding_calendar_cancel();

create or replace function crm.agenda_calendar_mark() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.titulo is distinct from old.titulo or new.inicio is distinct from old.inicio or new.fim is distinct from old.fim
      or new.assigned_to_id is distinct from old.assigned_to_id or new.dados->'participants' is distinct from old.dados->'participants'
      or new.dados->>'description' is distinct from old.dados->>'description') then
    new.calendar_dirty := true; new.calendar_tentativas := 0; new.calendar_error := null;
  end if;
  return new;
end $$;
drop trigger if exists agenda_calendar_mark on crm.agenda_events;
create trigger agenda_calendar_mark before update on crm.agenda_events for each row execute function crm.agenda_calendar_mark();
drop trigger if exists agenda_calendar_cancel on crm.agenda_events;
create trigger agenda_calendar_cancel after delete on crm.agenda_events for each row execute function crm.onboarding_calendar_cancel();

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------
-- Fase "liberada": todas as obrigatórias anteriores concluídas.
create or replace function crm.onboarding_liberada(sid uuid) returns boolean
language sql stable security definer set search_path = crm, pg_temp as $$
  select not exists(
    select 1 from crm.onboarding_steps a join crm.onboarding_steps s on s.id = sid
    where a.lead_id = s.lead_id and a.ordem < s.ordem and a.obrigatoria and a.status <> 'Concluido')
$$;

create or replace function crm.onboarding_hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Prazo em dia útil (sábado/domingo vão para segunda).
create or replace function crm.dia_util(d date) returns date language sql immutable as $$
  select case extract(isodow from d) when 6 then d + 2 when 7 then d + 1 else d end
$$;

-- Enfileira os avisos de uma fase que acabou de ficar sob responsabilidade de
-- alguém (atribuída/liberada) e, se for do cliente, o pedido ao cliente.
create or replace function crm.onboarding_avisar(sid uuid, tipo_equipe text) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
declare s crm.onboarding_steps; resp crm.profiles; begin
  select * into s from crm.onboarding_steps where id = sid;
  if not found or s.status = 'Concluido' then return; end if;
  select * into resp from crm.profiles where id = s.responsavel_id and ativo;
  if found and resp.email is not null then
    insert into crm.onboarding_notifications(organization_id, step_id, lead_id, tipo, destinatario, destinatario_nome)
      values (s.organization_id, s.id, s.lead_id, tipo_equipe, lower(resp.email), resp.nome) on conflict do nothing;
  end if;
  if s.executor = 'cliente' and s.cliente_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and crm.onboarding_liberada(s.id) then
    insert into crm.onboarding_notifications(organization_id, step_id, lead_id, tipo, destinatario)
      values (s.organization_id, s.id, s.lead_id, 'cliente_pedido', lower(s.cliente_email)) on conflict do nothing;
  end if;
end $$;

create or replace function crm.start_onboarding(lid uuid, tpl_id text, inicio date, resp uuid) returns integer
language plpgsql security definer set search_path = crm, pg_temp as $$
declare l crm.leads; t jsonb; f jsonb; n integer := 0; prazo date; primeiro uuid; novo uuid; begin
  select * into l from crm.leads where id = lid;
  if not found or not crm.tenant_member(l.organization_id) then raise exception 'Forbidden'; end if;
  if exists(select 1 from crm.onboarding_steps where lead_id = lid) then raise exception 'Este cliente já tem onboarding. Reinicie antes de gerar de novo.'; end if;
  select dados into t from crm.onboarding_templates where id = tpl_id and organization_id = l.organization_id;
  if t is null then raise exception 'Modelo de onboarding não encontrado.'; end if;
  if coalesce(jsonb_array_length(t->'phases'), 0) = 0 then raise exception 'O modelo não tem fases.'; end if;
  prazo := coalesce(inicio, crm.onboarding_hoje());
  for f in select value from jsonb_array_elements(t->'phases') order by coalesce((value->>'order')::int, 0) loop
    prazo := crm.dia_util(prazo + greatest(coalesce((f->>'defaultDueDays')::int, 1), 0));
    insert into crm.onboarding_steps(organization_id, lead_id, template_id, template_phase_id, ordem, titulo, descricao,
        executor, responsavel_id, cliente_email, obrigatoria, prazo, status)
      values (l.organization_id, lid, tpl_id, f->>'id', n, coalesce(nullif(trim(f->>'name'),''), 'Fase ' || (n + 1)), f->>'description',
        case when f->>'executor' = 'cliente' then 'cliente' else 'equipe' end,
        coalesce(nullif(f->>'responsavelId','')::uuid, resp, l.owner_id), nullif(lower(l.email),''),
        coalesce((f->>'mandatory')::boolean, true), prazo, case when n = 0 then 'Em Andamento' else 'Pendente' end)
      returning id into novo;
    if n = 0 then primeiro := novo; end if;
    n := n + 1;
  end loop;
  update crm.leads set dados = jsonb_set(coalesce(dados,'{}'), '{onboardingTemplateId}', to_jsonb(tpl_id)) where id = lid;
  perform crm.onboarding_avisar(primeiro, 'atribuida');
  return n;
end $$;

create or replace function crm.update_onboarding_step(sid uuid, novo_status text default null, novo_resp uuid default null,
  novo_prazo date default null, novo_cliente_email text default null) returns jsonb
language plpgsql security definer set search_path = crm, pg_temp as $$
declare s crm.onboarding_steps; pendente text; prox uuid; begin
  select * into s from crm.onboarding_steps where id = sid for update;
  if not found or not crm.tenant_member(s.organization_id) then raise exception 'Forbidden'; end if;
  if novo_status is not null and novo_status not in ('Pendente','Em Andamento','Aguardando Cliente','Bloqueado','Concluido') then raise exception 'Status inválido.'; end if;
  if novo_status = 'Concluido' and s.status <> 'Concluido' then
    select titulo into pendente from crm.onboarding_steps where lead_id = s.lead_id and ordem < s.ordem and obrigatoria and status <> 'Concluido' order by ordem limit 1;
    if pendente is not null then raise exception 'Conclua antes a fase obrigatória "%".', pendente; end if;
  end if;
  if novo_cliente_email is not null and novo_cliente_email <> '' and novo_cliente_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail do cliente inválido.'; end if;

  update crm.onboarding_steps set
    status = coalesce(novo_status, status),
    responsavel_id = coalesce(novo_resp, responsavel_id),
    prazo = coalesce(novo_prazo, prazo),
    cliente_email = case when novo_cliente_email is null then cliente_email else nullif(lower(trim(novo_cliente_email)),'') end,
    concluida_em = case when coalesce(novo_status, status) = 'Concluido' then coalesce(concluida_em, now()) else null end,
    concluida_por = case when coalesce(novo_status, status) = 'Concluido' then coalesce(concluida_por, auth.uid()) else null end
  where id = sid;

  if novo_resp is not null and novo_resp is distinct from s.responsavel_id and crm.onboarding_liberada(sid) then
    perform crm.onboarding_avisar(sid, 'atribuida');
  end if;
  if novo_cliente_email is not null and novo_cliente_email is distinct from s.cliente_email then
    perform crm.onboarding_avisar(sid, 'atribuida');
  end if;
  -- Concluiu: libera a próxima fase (avisa o responsável e, se for do cliente, o cliente).
  if novo_status = 'Concluido' and s.status <> 'Concluido' then
    select id into prox from crm.onboarding_steps where lead_id = s.lead_id and ordem > s.ordem and status <> 'Concluido' order by ordem limit 1;
    if prox is not null then
      update crm.onboarding_steps set status = case when executor = 'cliente' then 'Aguardando Cliente' else 'Em Andamento' end
        where id = prox and status = 'Pendente';
      perform crm.onboarding_avisar(prox, 'liberada');
    end if;
  end if;
  return (select to_jsonb(x) from crm.onboarding_steps x where x.id = sid);
end $$;

create or replace function crm.add_onboarding_comment(sid uuid, texto text) returns uuid
language plpgsql security definer set search_path = crm, pg_temp as $$
declare s crm.onboarding_steps; novo uuid; begin
  select * into s from crm.onboarding_steps where id = sid;
  if not found or not crm.tenant_member(s.organization_id) then raise exception 'Forbidden'; end if;
  insert into crm.onboarding_comments(organization_id, step_id, autor_id, autor_nome, texto)
    values (s.organization_id, sid, auth.uid(), (select nome from crm.profiles where id = auth.uid()), trim(texto)) returning id into novo;
  return novo;
end $$;

create or replace function crm.register_onboarding_file(sid uuid, file_path text, file_name text, file_size bigint, file_type text) returns uuid
language plpgsql security definer set search_path = crm, pg_temp as $$
declare s crm.onboarding_steps; novo uuid; begin
  select * into s from crm.onboarding_steps where id = sid;
  if not found or not crm.tenant_member(s.organization_id) then raise exception 'Forbidden'; end if;
  if file_path not like s.organization_id::text || '/' || s.lead_id::text || '/' || sid::text || '/%' then raise exception 'Caminho inválido.'; end if;
  insert into crm.onboarding_files(organization_id, step_id, path, nome, tamanho, tipo, enviado_por, enviado_por_nome)
    values (s.organization_id, sid, file_path, left(file_name, 250), file_size, left(file_type, 120), auth.uid(), (select nome from crm.profiles where id = auth.uid()))
    returning id into novo;
  return novo;
end $$;

create or replace function crm.delete_onboarding_file(fid uuid) returns text
language plpgsql security definer set search_path = crm, pg_temp as $$
declare f crm.onboarding_files; begin
  select * into f from crm.onboarding_files where id = fid;
  if not found or not crm.tenant_member(f.organization_id) then raise exception 'Forbidden'; end if;
  delete from crm.onboarding_files where id = fid;
  return f.path;
end $$;

-- Reinicia (apaga as fases; os convites do Outlook são cancelados pelo gatilho).
create or replace function crm.reset_onboarding(lid uuid) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  if not exists(select 1 from crm.leads where id = lid and crm.pode_administrar(organization_id)) then raise exception 'Somente administradores reiniciam o onboarding.'; end if;
  delete from crm.onboarding_steps where lead_id = lid;
end $$;

-- Lembretes do dia (idempotente; o worker chama a cada minuto, só age depois das 8h).
create or replace function crm.enqueue_onboarding_reminders() returns integer
language plpgsql security definer set search_path = crm, pg_temp as $$
declare hoje date := crm.onboarding_hoje(); n integer := 0; c integer; begin
  if extract(hour from now() at time zone 'America/Sao_Paulo') < 8 then return 0; end if;
  -- Equipe: 2 dias antes, no dia e atraso (diário), só para fases liberadas.
  insert into crm.onboarding_notifications(organization_id, step_id, lead_id, tipo, destinatario, destinatario_nome, referencia)
  select s.organization_id, s.id, s.lead_id,
         case when s.prazo = hoje + 2 then 'lembrete_antes' when s.prazo = hoje then 'lembrete_dia' else 'atrasada' end,
         lower(p.email), p.nome, hoje
  from crm.onboarding_steps s join crm.profiles p on p.id = s.responsavel_id and p.ativo
  where s.status <> 'Concluido' and s.prazo is not null and (s.prazo in (hoje, hoje + 2) or s.prazo < hoje)
    and crm.company_available(s.organization_id) and crm.onboarding_liberada(s.id)
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;
  -- Cliente: 2 dias antes, no dia e, se atrasar, a cada 3 dias.
  insert into crm.onboarding_notifications(organization_id, step_id, lead_id, tipo, destinatario, referencia)
  select s.organization_id, s.id, s.lead_id, 'cliente_lembrete', lower(s.cliente_email), hoje
  from crm.onboarding_steps s
  where s.executor = 'cliente' and s.status <> 'Concluido' and s.prazo is not null
    and s.cliente_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and (s.prazo in (hoje, hoje + 2) or (s.prazo < hoje and (hoje - s.prazo) % 3 = 0))
    and crm.company_available(s.organization_id) and crm.onboarding_liberada(s.id)
    and not exists(select 1 from crm.leads l where l.id = s.lead_id and l.opt_out)
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;
  -- Resumo diário para quem tem fase atrasada ou vencendo em até 3 dias.
  insert into crm.onboarding_notifications(organization_id, tipo, destinatario, destinatario_nome, referencia)
  select distinct on (p.id) s.organization_id, 'resumo', lower(p.email), p.nome, hoje
  from crm.onboarding_steps s join crm.profiles p on p.id = s.responsavel_id and p.ativo
  where s.status <> 'Concluido' and s.prazo <= hoje + 3 and crm.company_available(s.organization_id)
  order by p.id
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;

-- Worker: reserva avisos pendentes com os dados para montar o e-mail.
create or replace function crm.claim_onboarding_notifications(max_n integer default 10) returns jsonb
language plpgsql security definer set search_path = crm, pg_temp as $$
declare lote jsonb; begin
  update crm.onboarding_notifications set status = 'FAILED', erro = 'dispatch_uncertain' where status = 'SENDING' and locked_at < now() - interval '5 minutes';
  with alvo as (
    select id from crm.onboarding_notifications where status = 'PENDING' and tentativas < 3
    order by created_at, id for update skip locked limit greatest(1, least(max_n, 30))
  ), marcados as (
    update crm.onboarding_notifications n set status = 'SENDING', locked_at = now(), lease_token = gen_random_uuid(), tentativas = n.tentativas + 1
    from alvo where n.id = alvo.id returning n.*
  )
  select jsonb_agg(jsonb_build_object(
    'id', m.id, 'lease', m.lease_token, 'tipo', m.tipo, 'para', m.destinatario, 'para_nome', m.destinatario_nome,
    'empresa', o.nome, 'organization_id', m.organization_id, 'lead_id', m.lead_id, 'referencia', m.referencia,
    'cliente', (select coalesce(l.empresa, l.nome) from crm.leads l where l.id = m.lead_id),
    'contato', (select l.nome from crm.leads l where l.id = m.lead_id),
    'fase', (select jsonb_build_object('titulo', s.titulo, 'descricao', s.descricao, 'prazo', s.prazo, 'executor', s.executor,
               'ordem', s.ordem, 'total', (select count(*) from crm.onboarding_steps x where x.lead_id = s.lead_id),
               'responsavel', (select jsonb_build_object('nome', p.nome, 'email', p.email) from crm.profiles p where p.id = s.responsavel_id))
             from crm.onboarding_steps s where s.id = m.step_id),
    'itens', case when m.tipo = 'resumo' then (
       select coalesce(jsonb_agg(jsonb_build_object('fase', s.titulo, 'cliente', coalesce(l.empresa, l.nome), 'prazo', s.prazo, 'lead_id', s.lead_id) order by s.prazo), '[]')
       from crm.onboarding_steps s join crm.leads l on l.id = s.lead_id join crm.profiles p on p.id = s.responsavel_id
       where lower(p.email) = m.destinatario and s.status <> 'Concluido' and s.prazo <= m.referencia + 3) end,
    'reply_to', (select x.reply_to from crm.outreach_policy x where x.organization_id = m.organization_id)
  )) into lote
  from marcados m join crm.organizations o on o.id = m.organization_id;
  return lote;
end $$;

create or replace function crm.finish_onboarding_notification(nid bigint, token uuid, ok boolean, motivo text default null) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  update crm.onboarding_notifications set
    status = case when ok then 'SENT' when tentativas >= 3 then 'FAILED' else 'PENDING' end,
    sent_at = case when ok then now() end, erro = case when ok then null else left(motivo, 300) end, lease_token = null
  where id = nid and lease_token = token and status = 'SENDING';
end $$;

-- Worker: o que precisa ir para o Outlook.
create or replace function crm.claim_calendar_work(max_n integer default 10) returns jsonb
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  return jsonb_build_object(
    'steps', (select coalesce(jsonb_agg(x), '[]') from (
      select s.id, s.titulo, s.descricao, s.prazo, s.status, s.executor, s.calendar_event_id, s.lead_id, s.organization_id,
             coalesce(l.empresa, l.nome) cliente, p.email resp_email, p.nome resp_nome
      from crm.onboarding_steps s join crm.leads l on l.id = s.lead_id left join crm.profiles p on p.id = s.responsavel_id
      where s.calendar_dirty and s.calendar_tentativas < 5 order by s.updated_at limit max_n) x),
    'agenda', (select coalesce(jsonb_agg(x), '[]') from (
      select e.id, e.titulo, e.inicio, e.fim, e.calendar_event_id, e.dados->>'description' descricao, e.organization_id,
             (select coalesce(l.empresa, l.nome) from crm.leads l where l.id = e.lead_id) cliente,
             (select coalesce(jsonb_agg(distinct lower(p.email)), '[]') from crm.profiles p
               where p.ativo and (p.id = e.assigned_to_id or p.id::text in (select jsonb_array_elements(coalesce(e.dados->'participants','[]'))->>'userId'))) convidados
      from crm.agenda_events e where e.calendar_dirty and e.calendar_tentativas < 5 order by e.updated_at limit max_n) x),
    'cancelar', (select coalesce(jsonb_agg(x), '[]') from (
      select c.id, c.event_id from crm.calendar_cancellations c where not c.done and c.tentativas < 5 order by c.id limit max_n) x));
end $$;

create or replace function crm.finish_calendar_item(kind text, item_id text, ok boolean, event_id text default null, motivo text default null) returns void
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  if kind = 'step' then
    update crm.onboarding_steps set calendar_dirty = not ok, calendar_event_id = case when ok then event_id else calendar_event_id end,
      calendar_tentativas = case when ok then 0 else calendar_tentativas + 1 end, calendar_error = case when ok then null else left(motivo, 300) end
    where id = item_id::uuid;
  elsif kind = 'agenda' then
    update crm.agenda_events set calendar_dirty = not ok, calendar_event_id = case when ok then event_id else calendar_event_id end,
      calendar_tentativas = case when ok then 0 else calendar_tentativas + 1 end, calendar_error = case when ok then null else left(motivo, 300) end
    where id = item_id::uuid;
  elsif kind = 'cancel' then
    update crm.calendar_cancellations set done = ok, tentativas = tentativas + case when ok then 0 else 1 end where id = item_id::bigint;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table crm.onboarding_steps enable row level security;
alter table crm.onboarding_comments enable row level security;
alter table crm.onboarding_files enable row level security;
alter table crm.onboarding_notifications enable row level security;
alter table crm.calendar_cancellations enable row level security;
drop policy if exists onboarding_steps_read on crm.onboarding_steps;
create policy onboarding_steps_read on crm.onboarding_steps for select to authenticated using (crm.tenant_member(organization_id));
drop policy if exists onboarding_comments_read on crm.onboarding_comments;
create policy onboarding_comments_read on crm.onboarding_comments for select to authenticated using (crm.tenant_member(organization_id));
drop policy if exists onboarding_files_read on crm.onboarding_files;
create policy onboarding_files_read on crm.onboarding_files for select to authenticated using (crm.tenant_member(organization_id));
drop policy if exists onboarding_notifications_read on crm.onboarding_notifications;
create policy onboarding_notifications_read on crm.onboarding_notifications for select to authenticated using (crm.pode_administrar(organization_id));
revoke all on crm.onboarding_steps, crm.onboarding_comments, crm.onboarding_files, crm.onboarding_notifications, crm.calendar_cancellations from anon, authenticated;
grant select on crm.onboarding_steps, crm.onboarding_comments, crm.onboarding_files, crm.onboarding_notifications to authenticated;
grant all on crm.onboarding_steps, crm.onboarding_comments, crm.onboarding_files, crm.onboarding_notifications, crm.calendar_cancellations to service_role;
grant usage, select on all sequences in schema crm to service_role;

revoke execute on function crm.start_onboarding(uuid, text, date, uuid), crm.update_onboarding_step(uuid, text, uuid, date, text),
  crm.add_onboarding_comment(uuid, text), crm.register_onboarding_file(uuid, text, text, bigint, text), crm.delete_onboarding_file(uuid),
  crm.reset_onboarding(uuid), crm.onboarding_liberada(uuid) from public, anon;
grant execute on function crm.start_onboarding(uuid, text, date, uuid), crm.update_onboarding_step(uuid, text, uuid, date, text),
  crm.add_onboarding_comment(uuid, text), crm.register_onboarding_file(uuid, text, text, bigint, text), crm.delete_onboarding_file(uuid),
  crm.reset_onboarding(uuid), crm.onboarding_liberada(uuid) to authenticated, service_role;
revoke execute on function crm.enqueue_onboarding_reminders(), crm.claim_onboarding_notifications(integer),
  crm.finish_onboarding_notification(bigint, uuid, boolean, text), crm.claim_calendar_work(integer),
  crm.finish_calendar_item(text, text, boolean, text, text), crm.onboarding_avisar(uuid, text) from public, anon, authenticated;
grant execute on function crm.enqueue_onboarding_reminders(), crm.claim_onboarding_notifications(integer),
  crm.finish_onboarding_notification(bigint, uuid, boolean, text), crm.claim_calendar_work(integer),
  crm.finish_calendar_item(text, text, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Anexos no Storage (bucket privado; caminho org/lead/fase/arquivo)
-- ---------------------------------------------------------------------------
create or replace function crm.storage_onboarding_ok(object_name text) returns boolean
language plpgsql stable security definer set search_path = crm, pg_temp as $$
declare org uuid; begin
  begin org := split_part(object_name, '/', 1)::uuid; exception when others then return false; end;
  return crm.tenant_member(org);
end $$;
grant execute on function crm.storage_onboarding_ok(text) to authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
      values ('crm-onboarding', 'crm-onboarding', false, 20971520) on conflict (id) do nothing;
    execute 'drop policy if exists crm_onboarding_read on storage.objects';
    execute 'create policy crm_onboarding_read on storage.objects for select to authenticated using (bucket_id = ''crm-onboarding'' and crm.storage_onboarding_ok(name))';
    execute 'drop policy if exists crm_onboarding_insert on storage.objects';
    execute 'create policy crm_onboarding_insert on storage.objects for insert to authenticated with check (bucket_id = ''crm-onboarding'' and crm.storage_onboarding_ok(name))';
    execute 'drop policy if exists crm_onboarding_delete on storage.objects';
    execute 'create policy crm_onboarding_delete on storage.objects for delete to authenticated using (bucket_id = ''crm-onboarding'' and crm.storage_onboarding_ok(name))';
  end if;
end $$;
