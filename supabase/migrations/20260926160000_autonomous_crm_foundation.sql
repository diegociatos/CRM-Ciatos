-- CRM Ciatos — fundação para SaaS multiempresa + motor autônomo de prospecção.
-- Esta migration é ADITIVA: não altera as tabelas atuais nem ativa automações sozinha.
-- Segredos de provedores (OpenAI/Snov/Resend etc.) devem ficar em Supabase Secrets,
-- nunca nesta tabela, no frontend ou no GitHub.

create table if not exists crm.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  plano text not null default 'internal',
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm.organization_members (
  organization_id uuid not null references crm.organizations(id) on delete cascade,
  user_id uuid not null references crm.profiles(id) on delete cascade,
  papel text not null default 'MEMBER',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists crm.outreach_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references crm.organizations(id) on delete cascade,
  nome text not null,
  objetivo text,
  canal text not null default 'EMAIL',
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  stop_on_reply boolean not null default true,
  stop_on_meeting boolean not null default true,
  respect_business_hours boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references crm.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm.outreach_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references crm.outreach_sequences(id) on delete cascade,
  ordem integer not null check (ordem >= 0),
  tipo text not null check (tipo in ('EMAIL','WAIT','AI_DECISION','CREATE_TASK','NOTIFY_HUMAN','CHANGE_PHASE')),
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  template_id uuid references crm.email_templates(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  unique(sequence_id, ordem)
);

create table if not exists crm.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references crm.organizations(id) on delete cascade,
  sequence_id uuid not null references crm.outreach_sequences(id) on delete cascade,
  lead_id uuid not null references crm.leads(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','COMPLETED','STOPPED','FAILED')),
  current_step integer not null default 0,
  next_run_at timestamptz,
  stop_reason text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sequence_id, lead_id)
);
create index if not exists sequence_enrollments_due_idx
  on crm.sequence_enrollments(status, next_run_at) where status = 'ACTIVE';

create table if not exists crm.automation_jobs (
  id bigserial primary key,
  organization_id uuid references crm.organizations(id) on delete cascade,
  enrollment_id uuid references crm.sequence_enrollments(id) on delete cascade,
  lead_id uuid references crm.leads(id) on delete cascade,
  job_type text not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','DONE','FAILED','CANCELLED')),
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  idempotency_key text unique,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_jobs_due_idx
  on crm.automation_jobs(status, run_at) where status = 'PENDING';

create table if not exists crm.message_events (
  id bigserial primary key,
  organization_id uuid references crm.organizations(id) on delete cascade,
  lead_id uuid references crm.leads(id) on delete cascade,
  enrollment_id uuid references crm.sequence_enrollments(id) on delete set null,
  provider text not null,
  provider_message_id text,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists message_events_lead_idx on crm.message_events(lead_id, occurred_at desc);
create unique index if not exists message_events_provider_uk
  on crm.message_events(provider, provider_message_id, event_type)
  where provider_message_id is not null;

create table if not exists crm.suppression_list (
  id bigserial primary key,
  organization_id uuid references crm.organizations(id) on delete cascade,
  email text,
  phone text,
  reason text not null,
  source text,
  created_at timestamptz not null default now()
);
create unique index if not exists suppression_email_uk
  on crm.suppression_list(organization_id, lower(email)) where email is not null;

create table if not exists crm.ai_runs (
  id bigserial primary key,
  organization_id uuid references crm.organizations(id) on delete cascade,
  lead_id uuid references crm.leads(id) on delete cascade,
  agent text not null,
  provider text not null,
  model text not null,
  action text not null,
  status text not null default 'RUNNING',
  input_summary jsonb not null default '{}'::jsonb,
  output jsonb,
  confidence numeric,
  tokens_in integer,
  tokens_out integer,
  estimated_cost numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists crm.human_handoffs (
  id bigserial primary key,
  organization_id uuid references crm.organizations(id) on delete cascade,
  lead_id uuid not null references crm.leads(id) on delete cascade,
  assigned_to uuid references crm.profiles(id) on delete set null,
  reason text not null,
  priority text not null default 'NORMAL',
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  ai_summary text,
  suggested_action text,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists human_handoffs_open_idx on crm.human_handoffs(status, priority, created_at desc);

-- RLS: nesta fase, mantém compatibilidade com a equipe atual.
-- A próxima etapa migra leads e demais entidades para organization_id e endurece isolamento por tenant.
alter table crm.organizations enable row level security;
alter table crm.organization_members enable row level security;
alter table crm.outreach_sequences enable row level security;
alter table crm.outreach_steps enable row level security;
alter table crm.sequence_enrollments enable row level security;
alter table crm.automation_jobs enable row level security;
alter table crm.message_events enable row level security;
alter table crm.suppression_list enable row level security;
alter table crm.ai_runs enable row level security;
alter table crm.human_handoffs enable row level security;

create policy organizations_member_select on crm.organizations for select to authenticated
  using (exists (select 1 from crm.organization_members m where m.organization_id = id and m.user_id = auth.uid() and m.ativo));
create policy organizations_admin_write on crm.organizations for all to authenticated
  using (crm.papel_atual() = 'ADMIN') with check (crm.papel_atual() = 'ADMIN');

create policy organization_members_select on crm.organization_members for select to authenticated
  using (user_id = auth.uid() or crm.eh_gestor());
create policy organization_members_admin_write on crm.organization_members for all to authenticated
  using (crm.papel_atual() = 'ADMIN') with check (crm.papel_atual() = 'ADMIN');

create policy outreach_sequences_member on crm.outreach_sequences for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());
create policy outreach_steps_member on crm.outreach_steps for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());
create policy sequence_enrollments_member on crm.sequence_enrollments for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());
create policy automation_jobs_member on crm.automation_jobs for select to authenticated using (crm.eh_membro());
create policy message_events_member on crm.message_events for select to authenticated using (crm.eh_membro());
create policy suppression_member on crm.suppression_list for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());
create policy ai_runs_member on crm.ai_runs for select to authenticated using (crm.eh_membro());
create policy human_handoffs_member on crm.human_handoffs for all to authenticated
  using (crm.eh_membro()) with check (crm.eh_membro());

grant select, insert, update, delete on crm.organizations, crm.organization_members,
  crm.outreach_sequences, crm.outreach_steps, crm.sequence_enrollments,
  crm.suppression_list, crm.human_handoffs to authenticated;
grant select on crm.automation_jobs, crm.message_events, crm.ai_runs to authenticated;
grant usage, select on all sequences in schema crm to authenticated;
grant all on crm.organizations, crm.organization_members, crm.outreach_sequences,
  crm.outreach_steps, crm.sequence_enrollments, crm.automation_jobs, crm.message_events,
  crm.suppression_list, crm.ai_runs, crm.human_handoffs to service_role;

create trigger organizations_touch before update on crm.organizations
  for each row execute function crm.touch_updated_at();
create trigger outreach_sequences_touch before update on crm.outreach_sequences
  for each row execute function crm.touch_updated_at();
create trigger sequence_enrollments_touch before update on crm.sequence_enrollments
  for each row execute function crm.touch_updated_at();
create trigger automation_jobs_touch before update on crm.automation_jobs
  for each row execute function crm.touch_updated_at();
