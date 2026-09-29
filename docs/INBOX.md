# Inbox: primeira etapa

O item **Caixa de entrada** mostra respostas recebidas a cadências do CRM na empresa selecionada. Cada conversa pertence a uma empresa e a um lead. A equipe pode consultar a resposta, abrir o cadastro, assumir ou atribuir o atendimento, mudar o estado e registrar notas internas. As notas não são enviadas ao cliente.

## Escopo desta etapa

- O worker grava o corpo em texto de respostas correlacionadas pelo token da campanha. Mensagens sem esse token continuam na caixa Microsoft 365 e não são importadas. E-mails anteriores à implantação não são importados automaticamente.
- A classificação existente (`hot`, revisão, descadastro ou resposta automática) acompanha a mensagem. Aberturas de e-mail não são tratadas como interesse.
- Mensagens e leituras ficam sob RLS por empresa; gravações do usuário passam por funções que verificam a participação na empresa. O identificador externo torna a ingestão idempotente.
- Não há envio pelo Inbox, sincronização completa da caixa, WhatsApp ou anexos nesta etapa. A resposta ao cliente continua na caixa Microsoft 365. A UI declara esse limite.

## Implantação

1. Revisar e aplicar **somente** `supabase/migrations/20260930150000_inbox_foundation.sql` no schema `crm`, depois das migrations anteriores. O projeto Supabase é compartilhado; não executar reset ou push global de migrations.
2. Publicar a versão atualizada da função `crm-automation-worker` após a migration. Ela chama `capture_sdr_inbox_reply`, que grava o alerta SDR e a mensagem de forma atômica. Sem essa ordem, o worker antigo continua classificando respostas, mas o Inbox permanece vazio.
3. Publicar o frontend após o banco e o worker. A migration não habilita o agente, não muda flags de envio e não envia mensagens.
4. Para receber respostas, `CRM_REPLY_READ_ENABLED=true` exige permissões delegadas `Mail.Read` e `Mail.Read.Shared` no Entra e reconexão da caixa Microsoft 365 pelo proprietário. Verificar o status em **Central da IA → Agente SDR → Conexões e execução**. Sem essa configuração, o Inbox exibe estado vazio e nenhum e-mail é lido.

## Verificação sem disparos

`npm run typecheck`, `npm test`, `npx playwright test tests/ui/inbox.spec.ts` e `npm run build`. Os testes usam banco descartável e transporte simulado; não confirmam entrega ou leitura da caixa real. Antes de habilitar qualquer envio, confirmar isolamento entre empresas e permissões da conta Microsoft na operação real.

## Publicação de 29/09/2026

Após autorização já concedida para o deploy, a migration foi aplicada exclusivamente ao schema `crm` do projeto vinculado. A versão atualizada de `crm-automation-worker` foi publicada antes da interface. O frontend foi publicado pelo workflow Cloudflare [36623945179](https://github.com/diegociatos/CRM-Ciatos/actions/runs/36623945179), concluído com sucesso no commit `a3578e9`.

Verificação remota: tabelas presentes, função de captura indisponível para o papel `authenticated`, função de notas disponível ao usuário autenticado, zero conversas e zero mensagens. O navegador abriu o Inbox no CafeWorking e exibiu o estado vazio sem erro. Nenhum agente SDR foi ligado nesta implantação; políticas de envio preexistentes não foram alteradas. Nenhuma mensagem de teste foi enviada.
