# Inbox: respostas e atendimento

O item **Caixa de entrada** mostra respostas recebidas a cadências do CRM na empresa selecionada. Cada conversa pertence a uma empresa e a um lead. A equipe pode consultar a resposta, abrir o cadastro, assumir ou atribuir o atendimento, mudar o estado e registrar notas internas. As notas não são enviadas ao cliente.

## Escopo desta etapa

- O worker grava o corpo em texto de respostas correlacionadas pelo token da campanha. Mensagens sem esse token continuam na caixa Microsoft 365 e não são importadas. E-mails anteriores à implantação não são importados automaticamente.
- A classificação existente (`hot`, revisão, descadastro ou resposta automática) acompanha a mensagem. Aberturas de e-mail não são tratadas como interesse.
- Mensagens e leituras ficam sob RLS por empresa; gravações do usuário passam por funções que verificam a participação na empresa. O identificador externo torna a ingestão idempotente.
- A equipe pode escrever uma resposta, revisar a prévia e confirmar um único envio pela caixa Microsoft 365 conectada. O histórico distingue "aceito pela Microsoft" de "envio a conferir"; aceitação não prova entrega. Não há sincronização completa da caixa, WhatsApp ou anexos.
- Responder exige conversa aberta, membro ativo da empresa, contato sem opt-out/suppression, endereço igual ao remetente da resposta recebida, token de correlação da campanha, política de envio da empresa ativa e interruptor global `CRM_LIVE_SEND_ENABLED=true`. Uma conversa atribuída a outra pessoa só pode ser respondida por um administrador da empresa.
- A solicitação é reservada no banco com UUID único antes de chamar a Microsoft. Uma repetição da mesma solicitação nunca reenvia. Após erro ou timeout, o resultado fica para conferência manual na caixa Microsoft 365.
- **Respostas rápidas** são modelos por empresa. A equipe pode criar e revisar textos, arquivar e restaurar; ao escolher um modelo, ele apenas preenche o rascunho, que continua exigindo revisão e confirmação. Quatro sugestões neutras são criadas para cada empresa ativa na implantação.

## Implantação

1. Aplicar `supabase/migrations/20260930150000_inbox_foundation.sql` e depois `supabase/migrations/20260930160000_inbox_replies.sql` no schema `crm`. O projeto Supabase é compartilhado; não executar reset ou push global de migrations.
2. Publicar `crm-automation-worker` e `crm-inbox-send` após as migrations. O worker grava alertas e respostas recebidas; a nova função envia apenas após confirmação humana na interface.
3. Publicar o frontend após banco e funções. As migrations não habilitam o agente, não mudam flags de envio e não enviam mensagens.
4. Para receber respostas, `CRM_REPLY_READ_ENABLED=true` exige permissões delegadas `Mail.Read` e `Mail.Read.Shared` no Entra e reconexão da caixa Microsoft 365 pelo proprietário. Verificar o status em **Central da IA → Agente SDR → Conexões e execução**. Sem essa configuração, o Inbox exibe estado vazio e nenhum e-mail é lido.

## Verificação sem disparos

`npm run typecheck`, `npm test`, `npx deno check supabase/functions/crm-inbox-send/index.ts`, `npx playwright test tests/ui/inbox.spec.ts` e `npm run build`. Os testes usam banco descartável e transporte simulado; não confirmam entrega ou leitura da caixa real. Não usar o botão de confirmação para testes em produção.

## Publicação de 29/09/2026

Após autorização já concedida para o deploy, a migration foi aplicada exclusivamente ao schema `crm` do projeto vinculado. A versão atualizada de `crm-automation-worker` foi publicada antes da interface. O frontend foi publicado pelo workflow Cloudflare [36623945179](https://github.com/diegociatos/CRM-Ciatos/actions/runs/36623945179), concluído com sucesso no commit `a3578e9`.

Verificação remota: tabelas presentes, função de captura indisponível para o papel `authenticated`, função de notas disponível ao usuário autenticado, zero conversas e zero mensagens. O navegador abriu o Inbox no CafeWorking e exibiu o estado vazio sem erro. Nenhum agente SDR foi ligado nesta implantação; políticas de envio preexistentes não foram alteradas. Nenhuma mensagem de teste foi enviada.

## Respostas manuais publicadas em 29/09/2026

A migration `20260930160000_inbox_replies.sql` foi aplicada somente ao schema `crm` e a função `crm-inbox-send` foi publicada. O frontend do commit `928fe91` foi publicado pelo [workflow 36626894138](https://github.com/diegociatos/CRM-Ciatos/actions/runs/36626894138), concluído com sucesso. No navegador, o Inbox do CafeWorking abriu sem erro; não há conversas nessa empresa para exercitar a resposta visualmente em produção. Os três fluxos de interface foram testados localmente com transporte simulado.

Verificação remota: zero respostas manuais registradas, função de reserva negada a `authenticated` e liberada somente a `service_role`. As duas políticas de empresa previamente ativas permaneceram assim; nenhuma flag, agente ou configuração de remetente foi alterada nesta publicação. Nenhum e-mail de teste foi enviado.

## Biblioteca de respostas rápidas

Aplicar `supabase/migrations/20260930170000_inbox_quick_replies.sql` depois das duas migrations acima e publicar o frontend. A tabela tem isolamento por empresa; as funções de edição e arquivamento exigem vínculo ativo, e modelos de outros autores só podem ser alterados por administradores da empresa. Arquivar não apaga o texto; a aba **Arquivadas** permite editá-lo e restaurá-lo. Esta migration não chama Microsoft 365, não altera políticas e não dispara mensagens.

Publicada em 30/09/2026: migration aplicada somente ao schema `crm`, 40 sugestões em dez empresas; frontend publicado pelo [workflow 36719393547](https://github.com/diegociatos/CRM-Ciatos/actions/runs/36719393547). No CafeWorking, a biblioteca foi aberta no navegador e exibiu quatro modelos e o formulário de edição sem erro. A função de gravação está indisponível a anônimos, e o banco continua com zero respostas manuais enviadas. Nenhum modelo foi editado em produção durante a verificação.
