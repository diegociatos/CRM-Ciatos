# CRM Ciatos

CRM comercial do Grupo Ciatos: prospecção (Radar), qualificação, funil, playbook, agenda, onboarding e pós-venda.

- **Frontend:** React 19 + Vite, hospedado no Cloudflare Pages (`crm-ciatos.pages.dev`), deploy automático pelo GitHub Actions a cada push na `main`.
- **Backend:** Supabase do Chekly (`rylbvqsjnmjohxvvzstm`), schema **isolado `crm`**. Não usa nem altera o schema `public` do Chekly.
- **Login:** Supabase Auth (compartilhado com o Chekly). Só entra no CRM quem tem linha ativa em `crm.profiles`. Usuários novos são convidados pela tela "Gestão de Usuários" e recebem por e-mail o link para criar a senha.
- **IA:** Claude, só no servidor (Edge Function `crm-ia`). Nenhuma chave vai para o navegador.

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencher VITE_SUPABASE_ANON_KEY
npm run dev                   # http://localhost:3000
```

No Windows, clonar sem a pasta `migrated_prompt_history/`, que tem nomes de arquivo inválidos no NTFS:

```bash
git clone --no-checkout https://github.com/diegociatos/CRM-Ciatos.git
cd CRM-Ciatos
git sparse-checkout set --no-cone '/*' '!/migrated_prompt_history/'
git checkout main
```

## Banco e funções

- Migrations em `supabase/migrations/`, aplicadas com `supabase db query --linked -f <arquivo>` a partir da pasta do Chekly (o projeto é o mesmo). **Não** registrar no histórico de migrations do Chekly.
- Funções em `supabase/functions/`, com prefixo `crm-` para não colidir com as do Chekly:
  `npx supabase functions deploy crm-ia --project-ref rylbvqsjnmjohxvvzstm --use-api`
- Secrets usados: `ANTHROPIC_API_KEY` (IA), `RESEND_API_KEY` (já existe, compartilhado), `CRM_EMAIL_FROM` (opcional), `CRM_APP_URLS` (opcional; origens permitidas no link de convite).
# CRM autônomo — implantação e operação

Veja [o guia de homologação, secrets e operação](docs/AUTONOMOUS_OPERATIONS.md).
A Central da IA usa filas persistentes e inicia em simulação, sem envio real.
Validação local: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
