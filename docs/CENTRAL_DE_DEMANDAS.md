# Central de demandas: primeira etapa

## O que foi implementado

O CRM continua sendo o centro da operação. A nova **Central de demandas** complementa o Inbox, o cadastro de clientes, o onboarding e o pós-venda existentes.

- Solicitações internas ou vinculadas a um contato da empresa selecionada. O contato é definido na criação e não pode ser trocado depois; para outro contato, abra uma nova demanda.
- Título, descrição, responsável, prioridade e prazo opcional.
- Estados: aberta, em andamento, aguardando retorno, resolvida e cancelada. Uma demanda encerrada pode ser reaberta.
- Filas de abertas, minhas, atrasadas, encerradas e todas; busca literal por título e filtro de prioridade no servidor, com paginação de 25 registros.
- Histórico de criação/alterações e notas internas. As alterações exibem quem fez e os valores anteriores e novos.
- Botão **Criar demanda** no Inbox, preenchendo contato e assunto. A conversa permanece no Inbox; não há sincronização automática entre o estado da conversa e o estado da demanda.
- Botão para abrir o cadastro do contato a partir da demanda.

Nenhuma destas ações envia e-mail, WhatsApp ou notificações ao cliente. Os prazos são informados no horário local do dispositivo e persistidos como instantes UTC. “Atrasada” indica prazo vencido de uma demanda ainda aberta, inclusive aguardando retorno; não representa um SLA contratual calculado automaticamente.

## Segurança e consistência

As novas tabelas ficam somente no schema `crm`. `support_demands` e `support_demand_activity` têm RLS por empresa; o navegador só possui leitura direta. As gravações passam por RPCs que validam sessão e vínculo ativo, conferem cliente e responsável da mesma empresa, validam campos e registram o histórico na mesma transação. Membros ativos da empresa podem colaborar nas demandas, como no Inbox existente.

Uma versão numérica impede sobrescrever silenciosamente a edição de outra pessoa. O formulário preserva o rascunho quando há conflito; a pessoa decide quando recarregar os dados e descartar suas alterações.

Criação e notas usam identificadores de solicitação. Se o retorno falhar, a repetição do mesmo conteúdo não duplica o registro. Uma rejeição explícita de validação ou autorização libera o rascunho para correção. Após qualquer resultado incerto, o conteúdo permanece fixo até a confirmação, inclusive se uma repetição for rejeitada. Durante uma tentativa pendente, o conteúdo enviado fica travado para evitar apresentar uma edição não salva como confirmada. A troca de empresa/usuário desmonta a tela e descarta seus rascunhos e respostas atrasadas.

O histórico não tem API de edição ou exclusão individual. Cancelamento é o encerramento normal, reversível. A exportação de privacidade do contato preserva os dados já existentes, incluindo o Inbox, e acrescenta demandas e histórico. O vínculo com o contato é imutável, inclusive quando a demanda foi criada como interna. Assim, exportação e exclusão não misturam históricos de contatos diferentes. A exclusão de um contato remove somente suas demandas e o histórico correspondente via FK cascade. Demandas internas e de outros contatos permanecem. Evite registrar informações pessoais de contatos desvinculados em demandas internas, pois texto livre não permite uma associação automática confiável.

## Implantação, ainda não executada

1. Revisar o PR e aguardar os checks. Inspecionar no destino a definição atual de `crm.lead_privacy_export` antes de aplicar: a migration substitui essa função para acrescentar as demandas, preservando os campos conhecidos da versão do repositório. Validar também a interface em ambiente de homologação, com dois usuários e duas empresas.
2. Aplicar, **nesta ordem**, `supabase/migrations/20261108120910_support_demands.sql` e depois `supabase/migrations/20261108150000_support_demand_sla.sql` (Fase 1, abaixo) no schema CRM do projeto correto, seguindo o processo existente do repositório. O frontend atual depende das duas: a segunda cria a coluna `confidential` e o parâmetro `is_confidential` de `create_support_demand`. Não executar reset nem push global de migrations: o projeto Supabase é compartilhado com outro sistema. Antes, conferir no destino quais das duas já foram aplicadas (estado real do banco não verificado: sem acesso).
3. Publicar o frontend somente após as duas migrations confirmadas e a verificação do destino. Não há novas Edge Functions, segredos, provedores ou permissões OAuth nesta etapa.
4. Verificar leitura por empresa, criação, atribuição, notas, conflito de edição, encerramento/reabertura e exportação/exclusão em dados de teste. Não usar dados reais para testes de exclusão.

O merge na `main` dispara o deploy Cloudflare. Não mesclar enquanto o banco não estiver pronto. Na verificação de 08/11/2026, o projeto Supabase CRM/Chekly não apareceu entre os projetos acessíveis pela conexão e uma consulta somente de leitura no destino retornou `You do not have permission to perform this action`. Nenhuma migration (nem a da Fase 1) foi aplicada. É necessário disponibilizar o acesso autorizado ao projeto correto ou um administrador executar a migration pelo processo existente.

Reverter apenas o frontend deixa as tabelas novas preservadas. Não remover as tabelas como rollback automático, pois isso apagaria demandas registradas.

## Validação

- `npm ci` e `npm run typecheck`.
- `npm test`, incluindo testes PostgreSQL/PGlite do ciclo de vida, RLS, chamadas anônimas, atribuição/cliente entre empresas, idempotência, versão concorrente, exportação e exclusão.
- `npm run test:ui` inclui os fluxos novos em `tests/ui/support-demands.spec.ts`, usando dados fictícios e cliente simulado. Exercita criação, repetição após retorno interrompido, rejeição explícita com correção do rascunho, cancelamento, edição concorrente, notas, filtros/paginação, histórico paginado com limite de linhas, troca de empresa e largura de celular.
- `npm run build`.

Em executores com limite de memória, TypeScript pode precisar de `node --max-old-space-size=384 --max-semi-space-size=1 node_modules/typescript/bin/tsc --noEmit`. PGlite pode precisar de `node --max-old-space-size=256 --liftoff-only --wasm-lazy-compilation --wasm-num-compilation-tasks=1 --import tsx --test --test-concurrency=1 tests/*.test.ts`.

Os testes de navegador precisam de Chromium e suporte aos sockets de processo do navegador. Uma falha de inicialização do navegador não equivale a validação de interface aprovada. A prévia do PR carregou a tela de login, sem iniciar sessão nem ler dados reais. A implementação não foi validada com usuários reais autenticados nem contra dados ou infraestrutura de produção.

## Código e próximas etapas

Implementação original sobre o React, Supabase/PostgreSQL e componentes existentes. Não foram copiados módulos de sistemas de terceiros nem adicionadas dependências. O repositório atual não tem licença raiz identificada; isso não autoriza reutilizar código externo sem conferir a licença e suas obrigações.

A auditoria de dependências em 08/11/2026 encontrou três alertas nas ferramentas de desenvolvimento existentes. Foram aplicadas correções compatíveis no lockfile: Vite 6.4.3 → 6.4.5, postcss-selector-parser 6.1.4 → 6.1.5 e source-map-js 1.2.1 → 1.2.2, sem alterar as faixas de versões do package.json. A nova auditoria npm informou zero vulnerabilidades conhecidas; esse resultado não substitui auditoria completa da aplicação.

Próximas etapas possíveis, a escolher depois desta validação: categorias/equipes e SLA configurável, base de conhecimento, notificações internas, associação persistente entre conversa e demanda, portal de acompanhamento e novos canais de entrada. Integrações externas e acesso persistente exigem configuração e autorização próprias; não estão habilitados por esta entrega.

## Fase 1: prazo automático, triagem, avisos, painel e confidencialidade

Migration `20261108150000_support_demand_sla.sql` (aplicar **depois** de `20261108120910_support_demands.sql`, também só no schema CRM e sem reset nem push global).

- **Prazo automático (SLA simples).** Sem prazo informado, `due_at` vem da prioridade da empresa, em **horas corridas** (sem dias úteis, horário comercial ou feriados). Padrões: Urgente 4 h, Alta 24 h, Normal 72 h, Baixa 120 h, ajustáveis por empresa por administradores. Prazo digitado à mão nunca é recalculado; se a prioridade mudar e o prazo ainda vier da política, ele é recalculado a partir da criação. Ao limpar o prazo na edição, ele volta a seguir a política (horas da prioridade contadas desde a abertura, como na criação; pode já nascer vencido em demanda antiga). Não é um SLA contratual.
- **Responsável de triagem.** Cada empresa pode escolher quem recebe as demandas criadas sem responsável. Se essa pessoa deixar de ser membro ativo, a demanda fica sem responsável em vez de falhar. Fila "Sem responsável" na lista.
- **Avisos internos.** Tabela `support_demand_alerts`, visível só ao destinatário. Tipos: atribuída a você (gerada na hora), vence em breve, atrasada, sem responsável há mais de 1 h (um aviso por período sem responsável, inclusive após desatribuir; `unassigned_since`) e atraso escalado (após X horas, padrão 4 h, aos administradores/masters). A função `crm.scan_support_demands()` gera os avisos sem duplicar e só o `service_role` a executa. **Reabertura:** reabrir uma demanda resolvida/cancelada inicia um novo ciclo (`reopen_count`), então uma demanda reaberta já vencida avisa o responsável de novo, uma vez; o prazo não é alterado em silêncio. Contador no menu lateral e lista "Meus avisos" na tela, paginada ("Mostrar mais avisos"); "Marcar como lidos" afeta só os avisos exibidos, nunca os que ainda não apareceram. **Nenhum e-mail, WhatsApp ou mensagem é enviado.**
- **Painel por empresa.** `support_demand_stats(org)` roda com as permissões de quem consulta, então só conta o que a pessoa pode ver. Não existe visão que cruze empresas.
- **Demanda confidencial.** Marcada na criação e imutável depois. Só criador, responsável e administradores/masters da empresa leem a demanda e o histórico, nas consultas diretas e nas funções de edição e nota. Ao atribuir a outra pessoa, ela passa a ver. A exportação de privacidade do contato continua incluindo essas demandas (restrita a administradores).

### Implantação da Fase 1 (ainda não executada)
1. Aplicar a migration de demandas (`20261108120910`), depois esta (`20261108150000`), somente no schema CRM do projeto correto, e confirmar no destino o que já existe.
2. Conferir `select * from cron.job` e rodar manualmente `supabase/ops/support-scan.sql` (agendador a cada 10 minutos; para parar, `cron.unschedule`).
3. Publicar o frontend **só depois das duas migrations**: sem a segunda, o frontend atual falha ao listar e criar demandas (coluna `confidential` e parâmetro `is_confidential` inexistentes).
4. No painel, definir o responsável de triagem de cada empresa e revisar os prazos.

### Testes
`tests/support-demand-sla.test.ts` (banco descartável): prazo por política e sem recálculo manual, configuração restrita a administradores, triagem com membro inativo, varredura sem duplicar, aviso de sem responsável por período, reabertura de demanda vencida, prazo limpo voltando à política, escalonamento, leitura de avisos privada, isolamento entre empresas e confidencialidade. `tests/ui/support-demands.spec.ts`: painel, configuração, fila sem responsável e paginação de avisos com cliente simulado. Limites desta fase: horas corridas; avisos só na tela (sem e-mail); fuso do painel fixo em America/Sao_Paulo.
