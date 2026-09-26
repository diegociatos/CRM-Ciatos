-- CRM Ciatos — schema isolado `crm` dentro do projeto Supabase do Chekly.
-- Nada aqui toca no schema `public` (Chekly). Usuários do Chekly compartilham
-- auth.users, mas só enxergam o CRM quem tiver linha ativa em crm.profiles.
--
-- Modelo "híbrido": as colunas que servem para filtro, RLS e automação são
-- reais; o restante do objeto do front (Lead, SalesScript etc.) vai em `dados`
-- (jsonb). Assim o front migra sem reescrever todas as telas, e as fases
-- seguintes normalizam o que precisar.

create schema if not exists crm;

grant usage on schema crm to authenticated, service_role;
revoke all on schema crm from anon;

-- ---------------------------------------------------------------------------
-- Perfis (quem pode usar o CRM)
-- ---------------------------------------------------------------------------
create table crm.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  papel text not null check (papel in ('ADMIN','MANAGER','SDR','CLOSER','OPERATIONAL','CS','MARKETING')),
  departamento text not null default 'Comercial',
  avatar text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function crm.papel_atual() returns text
language sql stable security definer set search_path = crm, pg_temp as $$
  select papel from crm.profiles where id = auth.uid() and ativo
$$;

create or replace function crm.eh_membro() returns boolean
language sql stable security definer set search_path = crm, pg_temp as $$
  select exists (select 1 from crm.profiles where id = auth.uid() and ativo)
$$;

create or replace function crm.eh_gestor() returns boolean
language sql stable security definer set search_path = crm, pg_temp as $$
  select coalesce(crm.papel_atual() in ('ADMIN','MANAGER'), false)
$$;

create or replace function crm.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- O próprio usuário só pode mudar nome/avatar; papel/ativo/e-mail só gestor.
create or replace function crm.profiles_guard() returns trigger
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  if auth.uid() is null or crm.papel_atual() = 'ADMIN' then
    return new;
  end if;
  if new.papel is distinct from old.papel
     or new.ativo is distinct from old.ativo
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'Somente administradores alteram papel, status ou e-mail.';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on crm.profiles
  for each row execute function crm.profiles_guard();
create trigger profiles_touch before update on crm.profiles
  for each row execute function crm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Configuração do sistema (linha única)
-- ---------------------------------------------------------------------------
create table crm.config (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references crm.profiles(id)
);
insert into crm.config (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Leads / clientes
-- ---------------------------------------------------------------------------
create table crm.leads (
  id uuid primary key default gen_random_uuid(),
  nome text,                     -- contato / decisor
  email text,
  telefone text,
  empresa text,
  cnpj_raw text,                 -- só dígitos
  status text not null default 'Qualificação',
  phase_id text not null default 'ph-qualificado',
  owner_id uuid references crm.profiles(id) on delete set null,
  qualified_by_id uuid references crm.profiles(id) on delete set null,
  in_queue boolean not null default true,
  icp_score numeric not null default 0,
  engagement_score numeric not null default 0,
  segmento text,
  cidade text,
  uf text,
  opt_out boolean not null default false,     -- LGPD: não recebe cadência
  dados jsonb not null default '{}'::jsonb,   -- restante do objeto Lead
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_cnpj_raw_uk on crm.leads (cnpj_raw) where cnpj_raw is not null and cnpj_raw <> '';
create index leads_owner_idx on crm.leads (owner_id);
create index leads_status_idx on crm.leads (status);
create index leads_phase_idx on crm.leads (phase_id);
create index leads_email_idx on crm.leads (lower(email));
create trigger leads_touch before update on crm.leads
  for each row execute function crm.touch_updated_at();

create table crm.interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm.leads(id) on delete cascade,
  tipo text not null,
  titulo text,
  conteudo text,
  autor_id uuid references crm.profiles(id) on delete set null,
  autor_nome text,
  score_impact numeric,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index interactions_lead_idx on crm.interactions (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------
create table crm.agenda_events (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz,
  assigned_to_id uuid references crm.profiles(id) on delete set null,
  lead_id uuid references crm.leads(id) on delete cascade,
  creator_id uuid references crm.profiles(id) on delete set null,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agenda_inicio_idx on crm.agenda_events (inicio);
create trigger agenda_touch before update on crm.agenda_events
  for each row execute function crm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Playbook / scripts, templates, metas
-- ---------------------------------------------------------------------------
create table crm.scripts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references crm.profiles(id) on delete set null,
  dados jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger scripts_touch before update on crm.scripts
  for each row execute function crm.touch_updated_at();

create table crm.onboarding_templates (
  id text primary key,
  dados jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger onb_touch before update on crm.onboarding_templates
  for each row execute function crm.touch_updated_at();

create table crm.email_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  assunto text not null,
  corpo text not null,
  created_by uuid references crm.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger email_templates_touch before update on crm.email_templates
  for each row execute function crm.touch_updated_at();

create table crm.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references crm.profiles(id) on delete cascade,
  mes smallint not null check (mes between 0 and 11),
  ano smallint not null,
  dados jsonb not null default '{}'::jsonb,
  unique (user_id, mes, ano)
);

-- ---------------------------------------------------------------------------
-- Radar (mineração de empresas)
-- ---------------------------------------------------------------------------
create table crm.mining_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references crm.profiles(id) on delete set null,
  status text not null default 'Running',
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger mining_jobs_touch before update on crm.mining_jobs
  for each row execute function crm.touch_updated_at();

create table crm.mining_leads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references crm.mining_jobs(id) on delete cascade,
  cnpj_raw text,
  imported boolean not null default false,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index mining_leads_job_idx on crm.mining_leads (job_id);
create unique index mining_leads_job_cnpj_uk on crm.mining_leads (job_id, cnpj_raw)
  where cnpj_raw is not null and cnpj_raw <> '';

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create table crm.audit_logs (
  id bigserial primary key,
  user_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id text,
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);

create or replace function crm.audit_delete() returns trigger
language plpgsql security definer set search_path = crm, pg_temp as $$
begin
  insert into crm.audit_logs (user_id, acao, entidade, entidade_id, antes)
  values (auth.uid(), 'DELETE', tg_table_name, old.id::text, to_jsonb(old));
  return old;
end $$;
create trigger leads_audit_delete after delete on crm.leads
  for each row execute function crm.audit_delete();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table crm.profiles enable row level security;
alter table crm.config enable row level security;
alter table crm.leads enable row level security;
alter table crm.interactions enable row level security;
alter table crm.agenda_events enable row level security;
alter table crm.scripts enable row level security;
alter table crm.onboarding_templates enable row level security;
alter table crm.email_templates enable row level security;
alter table crm.user_goals enable row level security;
alter table crm.mining_jobs enable row level security;
alter table crm.mining_leads enable row level security;
alter table crm.audit_logs enable row level security;

-- profiles: membros veem a equipe; cada um edita o próprio (guard trava papel);
-- criação/remoção só pela Edge Function (service role).
create policy profiles_select on crm.profiles for select to authenticated
  using (crm.eh_membro() or id = auth.uid());
create policy profiles_update on crm.profiles for update to authenticated
  using (id = auth.uid() or crm.papel_atual() = 'ADMIN')
  with check (id = auth.uid() or crm.papel_atual() = 'ADMIN');

create policy config_select on crm.config for select to authenticated using (crm.eh_membro());
create policy config_update on crm.config for update to authenticated
  using (crm.eh_gestor()) with check (crm.eh_gestor());

-- leads: equipe pequena e colaborativa — todo membro lê/cria/atualiza;
-- excluir é só gestor.
create policy leads_select on crm.leads for select to authenticated using (crm.eh_membro());
create policy leads_insert on crm.leads for insert to authenticated with check (crm.eh_membro());
create policy leads_update on crm.leads for update to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());
create policy leads_delete on crm.leads for delete to authenticated using (crm.eh_gestor());

create policy interactions_select on crm.interactions for select to authenticated using (crm.eh_membro());
create policy interactions_insert on crm.interactions for insert to authenticated
  with check (crm.eh_membro() and (autor_id is null or autor_id = auth.uid()));
create policy interactions_delete on crm.interactions for delete to authenticated using (crm.eh_gestor());

create policy agenda_all on crm.agenda_events for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());

create policy scripts_select on crm.scripts for select to authenticated using (crm.eh_membro());
create policy scripts_write on crm.scripts for insert to authenticated with check (crm.eh_membro());
create policy scripts_update on crm.scripts for update to authenticated
  using (crm.eh_gestor() or author_id = auth.uid()) with check (crm.eh_membro());
create policy scripts_delete on crm.scripts for delete to authenticated
  using (crm.eh_gestor() or author_id = auth.uid());

create policy onb_select on crm.onboarding_templates for select to authenticated using (crm.eh_membro());
create policy onb_write on crm.onboarding_templates for all to authenticated
  using (crm.eh_gestor()) with check (crm.eh_gestor());

create policy email_templates_select on crm.email_templates for select to authenticated using (crm.eh_membro());
create policy email_templates_write on crm.email_templates for all to authenticated
  using (crm.papel_atual() in ('ADMIN','MANAGER','MARKETING'))
  with check (crm.papel_atual() in ('ADMIN','MANAGER','MARKETING'));

create policy goals_select on crm.user_goals for select to authenticated
  using (crm.eh_gestor() or user_id = auth.uid());
create policy goals_write on crm.user_goals for all to authenticated
  using (crm.eh_gestor()) with check (crm.eh_gestor());

create policy mining_jobs_all on crm.mining_jobs for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());
create policy mining_leads_all on crm.mining_leads for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());

create policy audit_select on crm.audit_logs for select to authenticated using (crm.papel_atual() = 'ADMIN');

-- Grants (RLS continua valendo; anon não tem nada)
grant select, insert, update, delete on all tables in schema crm to authenticated;
grant usage, select on all sequences in schema crm to authenticated;
grant all on all tables in schema crm to service_role;
grant all on all sequences in schema crm to service_role;
grant execute on all functions in schema crm to authenticated, service_role;
revoke execute on all functions in schema crm from anon, public;
grant execute on function crm.papel_atual(), crm.eh_membro(), crm.eh_gestor() to authenticated;
