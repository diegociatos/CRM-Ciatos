# Central de demandas: primeira etapa

## O que foi implementado

O CRM continua sendo o centro da operação. A nova **Central de demandas** complementa o Inbox, o cadastro de clientes, o onboarding e o pós-venda existentes.

- Solicitações internas ou vinculadas a um contato da empresa selecionada.
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

Criação e notas usam identificadores de solicitação. Se o retorno falhar, a repetição do mesmo conteúdo não duplica o registro. Durante uma tentativa pendente, o conteúdo enviado fica travado para evitar apresentar uma edição não salva como confirmada. A troca de empresa/usuário desmonta a tela e descarta seus rascunhos e respostas atrasadas.

O histórico não tem API de edição ou exclusão individual. Cancelamento é o encerramento normal, reversível. A exportação de privacidade do contato preserva os dados já existentes, incluindo o Inbox, e acrescenta demandas e histórico. A exclusão de um contato remove as demandas vinculadas atualmente ou em qualquer momento do histórico, junto de todo seu histórico, mesmo se o vínculo foi removido ou alterado depois. Demandas internas não vinculadas e demandas sem relação com aquele contato permanecem. Evite registrar informações pessoais de contatos desvinculados em demandas internas, pois texto livre não permite uma associação automática confiável.

## Implantação, ainda não executada

1. Revisar o PR e aguardar os checks. Validar também a interface em ambiente de homologação, com dois usuários e duas empresas.
2. Aplicar **somente** `supabase/migrations/20261108120910_support_demands.sql` no schema CRM do projeto correto, seguindo o processo existente do repositório. Não executar reset nem push global de migrations: o projeto Supabase é compartilhado com outro sistema.
3. Publicar o frontend somente após a migration e após autorização. Não há novas Edge Functions, segredos, provedores ou permissões OAuth nesta etapa.
4. Verificar leitura por empresa, criação, atribuição, notas, conflito de edição, encerramento/reabertura e exportação/exclusão em dados de teste. Não usar dados reais para testes de exclusão.

Reverter apenas o frontend deixa as tabelas aditivas preservadas. Não remover as tabelas como rollback automático, pois isso apagaria demandas registradas.

## Validação

- `npm ci` e `npm run typecheck`.
- `npm test`, incluindo testes PostgreSQL/PGlite do ciclo de vida, RLS, chamadas anônimas, atribuição/cliente entre empresas, idempotência, versão concorrente, exportação e exclusão.
- `npm run test:ui` inclui os fluxos novos em `tests/ui/support-demands.spec.ts`, usando dados fictícios e cliente simulado. Exercita criação, repetição após retorno interrompido, cancelamento, edição concorrente, notas, filtros/paginação, troca de empresa e largura de celular.
- `npm run build`.

Em executores com limite de memória, TypeScript pode precisar de `node --max-old-space-size=384 --max-semi-space-size=1 node_modules/typescript/bin/tsc --noEmit`. PGlite pode precisar de `node --max-old-space-size=256 --liftoff-only --wasm-lazy-compilation --wasm-num-compilation-tasks=1 --import tsx --test --test-concurrency=1 tests/*.test.ts`.

Os testes de navegador precisam de Chromium e suporte aos sockets de processo do navegador. Uma falha de inicialização do navegador não equivale a validação de interface aprovada. A implementação não foi validada contra dados ou infraestrutura de produção.

## Código e próximas etapas

Implementação original sobre o React, Supabase/PostgreSQL e componentes existentes. Não foram copiados módulos de sistemas de terceiros nem adicionadas dependências. O repositório atual não tem licença raiz identificada; isso não autoriza reutilizar código externo sem conferir a licença e suas obrigações.

A auditoria de dependências em 08/11/2026 encontrou três alertas nas ferramentas de desenvolvimento existentes. Foram aplicadas correções compatíveis no lockfile: Vite 6.4.3 → 6.4.5, postcss-selector-parser 6.1.4 → 6.1.5 e source-map-js 1.2.1 → 1.2.2, sem alterar as faixas de versões do package.json. A nova auditoria npm informou zero vulnerabilidades conhecidas; esse resultado não substitui auditoria completa da aplicação.

Próximas etapas possíveis, a escolher depois desta validação: categorias/equipes e SLA configurável, base de conhecimento, notificações internas, associação persistente entre conversa e demanda, portal de acompanhamento e novos canais de entrada. Integrações externas e acesso persistente exigem configuração e autorização próprias; não estão habilitados por esta entrega.
