# Status e retomada (Aplicativo Grupo Ciatos, prioridade: Atendimento)

Atualizado em 2026-11-09. Repositório: diegociatos/CRM-Ciatos, branch `main`. Supabase compartilhado: projeto `rylbvqsjnmjohxvvzstm`.

## Como retomar em outro computador

```bash
git clone https://github.com/diegociatos/CRM-Ciatos.git   # ou git pull, se já existir
npm install
npx tsx --test tests/*.test.ts      # testes de banco/lógica (PGlite)
npx playwright test                 # testes de navegador
npm run build
```

Detalhes de cada fase: [ATENDIMENTO_DIAGNOSTICO.md](ATENDIMENTO_DIAGNOSTICO.md) (seções 6 e 7).

## O que está em produção

| Item | Estado |
| --- | --- |
| Fase 1 (migrations 20261108120910, 20261108150000) | Aplicada e verificada |
| Fase A: perfil Suporte, fila, painel do gestor (20261108190000) | Aplicada e verificada; frontend publicado |
| Fase B: e-mail espontâneo, protocolo, confirmação controlada (20261109120000) | Aplicada em 2026-11-09 e verificada (5 tabelas, RLS ligado, `ingest_support_email`, colunas das conversas); frontend enviado à `main` no commit 3ce2b80 |
| Fase C: WhatsApp e Instagram por empresa (20261110120000) | Aplicada em 2026-11-09 e verificada só com leitura (2 tabelas com RLS, 12 funções, colunas de evidência de entrega, sem execução para anon/public); frontend no commit 0324e4c, deploy do Cloudflare Pages concluído com sucesso |

Comprovado: banco, código e deploy. Não comprovado: nenhuma conta Meta conectada, função `crm-support-meta` não publicada, nenhuma mensagem real recebida ou enviada. A Fase C só foi testada com transporte simulado.

## O que está desligado (nada conectado)

- Nenhuma caixa de e-mail lida; confirmação automática não envia.
- Função `crm-support-mail` não publicada nem agendada.
- Ninguém tem o perfil Suporte ainda.
- WhatsApp e Instagram: construídos e aplicados no banco, mas desligados; faltam as contas Meta, os segredos e a publicação de `crm-support-meta` e `crm-support-meta-verify` (seção 8 do diagnóstico).

## O que só o dono pode autorizar ou fornecer

1. Publicar e agendar `crm-support-mail` (Edge Function).
2. Autorizar a caixa de suporte no Microsoft 365 (Mail.Read.Shared, Mail.Send.Shared).
3. Variáveis: `CRM_SUPPORT_MAIL_ENABLED`, `CRM_LIVE_SEND_ENABLED`, `CRM_WORKER_SECRET`.
4. Aprovar o texto da confirmação (sem prazo numérico).
5. WhatsApp Cloud API: número, conta Meta Business, orçamento. Instagram: conta profissional elegível.
6. Escolher a empresa piloto.

Passo a passo do e-mail: seção 7 do documento de diagnóstico.

## Validação que falta (humana)

- Atribuir o perfil Suporte a uma pessoa de teste e testar com duas pessoas e duas empresas.
- Uma conversa real controlada por canal autorizado.
- Conferir o deploy e o Inbox em produção.

## Próximas fases

- Fase C: WhatsApp Cloud API e Instagram (só com contas reais), IA para classificar, resumir e sugerir resposta com revisão humana e base de conhecimento por empresa.
- Pendências menores: validação de CNPJ alfanumérico, kanban/tabelas, adicionar LICENSE.

## Como aplicar migrations em produção

Via SQL Editor do Supabase: colar o arquivo, rodar (aparece um aviso de operações destrutivas; é esperado quando a migration recria funções), depois conferir com consulta somente leitura. Nunca reaplicar migration já aplicada nem resetar o banco compartilhado.

## Regras do projeto

- Só canais oficiais (WhatsApp Cloud API, Microsoft Graph, Instagram); sem WhatsApp Web, scraping ou sessões pessoais.
- Estado de entrega só com evidência; resultado incerto nunca é reenviado sozinho.
- Isolamento por empresa com RLS; dados de demonstração sempre rotulados.
- Não instalar, criar credenciais, alterar permissões, contratar serviços nem ligar envios sem aprovação.
