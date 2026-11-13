# Registro da implantação do help desk — 13/11/2026

## Banco

Projeto `rylbvqsjnmjohxvvzstm` (check-ciatos), organização App Planejar. A conexão MCP não tinha permissão para o projeto; o usuário indicou a sessão do navegador. Após renovar o login existente, a atualização foi aplicada pelo SQL Editor, somente no schema `crm`, sem reset/push global.

- Pré-verificação: `support_demand_tasks` e `save_support_task` ainda ausentes; coluna `intake` existente. Corpo de `lead_privacy_export` conferido contra a versão conhecida do repositório, incluindo normalização de quebras de linha.
- Atualização incremental `20261113120359_support_sector_tasks.sql` aplicada com sucesso, em transação. A entrada no SQL Editor foi reformatada, preservando a mesma estrutura e regras; não foi registrada no histórico de migrations do sistema compartilhado.
- Teste funcional de produção com usuário administrativo ativo e papel `authenticated`: criou demanda e tarefa fictícias, repetiu sem duplicar, verificou bloqueio de resolução pendente, concluiu tarefa e resolveu demanda. **Rollback integral** das gravações de teste.
- Resultado conferido: RLS `true`; authenticated executa RPC `true`; anon executa RPC `false`; escrita direta de authenticated `false`; trigger de bloqueio `true`.
- Nenhum dado de cliente foi alterado, nenhum canal foi ativado e nenhuma mensagem externa foi enviada.

## Validação local

- TypeScript e build de produção aprovados. Mantido aviso preexistente de tamanho de alguns pacotes.
- 64 testes de interface aprovados, incluindo os três cenários novos.
- Dois cenários visuais adicionais em 390 e 1440 pixels aprovados; formulário de tarefas inspecionado, identidade tipográfica do CRM preservada e alinhamento do campo de obrigatoriedade ajustado.
- Suíte de regras/banco: 110 verificações executadas; 109 passaram na primeira execução. A expectativa antiga das chaves da exportação precisou ser atualizada para incluir tarefas. O arquivo afetado foi repetido: três testes aprovados. Testes novos de tarefas/relatório: nove verificações aprovadas, também após os ajustes da revisão.
- Claude Code participou da revisão conceitual e do código novo, autorizado pelo usuário; correções incorporadas e descritas no guia operacional.

## Publicação

O deploy automático anterior do GitHub permaneceu em fila sem executor durante a preparação. A sessão Cloudflare OAuth existente foi conferida como alternativa, mas a publicação automática voltou a funcionar antes da integração desta versão. Banco e frontend foram verificados separadamente, conforme os resultados abaixo.

### Publicação confirmada

Autorização explícita do usuário recebida para publicar o código/documentação no repositório público, abrir/integrar o PR e publicar o frontend. A publicação ocorreu pelo fluxo automático existente, que voltou a executar; não foi necessário deploy manual pela CLI.

- PR integrado: https://github.com/diegociatos/CRM-Ciatos/pull/8
- Commit de código: `82cc86d7e69a76407f173f30bf962f72f25ef07c`.
- Validação remota concluída com sucesso: https://github.com/diegociatos/CRM-Ciatos/actions/runs/43433076675 — **110/110 testes de regras/banco e 66/66 testes de interface**, além de TypeScript, build e checagem das funções.
- Deploy concluído com sucesso: https://github.com/diegociatos/CRM-Ciatos/actions/runs/43433604641
- Versão Cloudflare: https://4b9be320.crm-ciatos.pages.dev
- Endereço operacional: https://crm.grupociatos.com.br/
- Conferência autenticada no endereço operacional: Atendimento exibiu **Novo atendimento**, **Registros e demandas**, a Central de demandas e **Relatório mensal do cliente**, com contadores e fila carregados sem erro. Não foram criados registros reais nem enviados contatos para essa conferência. O formulário de tarefas foi validado pelos testes de interface; o ciclo funcional foi conferido no banco de produção com rollback, conforme acima.

Esta atualização documental registra os resultados; não altera o código implantado.

## Limites

A integração real dos números WhatsApp, caixas Microsoft 365 e telefonia continua dependente das contas/permissões e homologação de cada canal. Esta atualização não transforma registros manuais em mensagens recebidas pela API nem em evidência de retorno.
