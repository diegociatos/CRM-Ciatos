-- Envio de e-mail do CRM pelo Microsoft 365 (Graph sendMail), no mesmo modelo
-- do ContaOne: app do Entra (tenant/client/secret) + caixa conectada por OAuth
-- delegado. Segredos (client secret e refresh token) ficam CIFRADOS (AES-GCM,
-- chave CRM_CRYPTO_KEY só no servidor). Uma conexão para o CRM inteiro; cada
-- empresa escolhe o endereço remetente (a caixa conectada ou uma em que ela
-- tenha permissão "Enviar como").

create table if not exists crm.mail_integration (
  id smallint primary key default 1 check (id = 1),
  tenant_id text,
  client_id text,
  client_secret_cif text,
  refresh_token_cif text,
  conta_email text,
  conta_nome text,
  envia_como text check (envia_como is null or envia_como ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  conectado_em timestamptz,
  updated_at timestamptz not null default now()
);
insert into crm.mail_integration (id) values (1) on conflict do nothing;

alter table crm.mail_integration enable row level security;
-- Sem políticas: só o service_role (Edge Functions) lê ou grava.
revoke all on crm.mail_integration from anon, authenticated;
grant all on crm.mail_integration to service_role;
