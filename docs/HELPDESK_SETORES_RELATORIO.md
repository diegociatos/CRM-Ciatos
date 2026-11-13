# Help desk: execução por setor e relatório do cliente

Evolução de 13/11/2026 sobre o Atendimento e a Central de demandas existentes. React/Supabase do CRM; não instala Chatwoot nem n8n, não ativa canais e não envia mensagens.

## Como operar

1. Em **Atendimento → Novo atendimento**, registre a ligação ou solicitação recebida fora do sistema. Conversas dos canais conectados permanecem na fila e no Inbox.
2. Em **Registros e demandas** ou **Central de demandas**, escolha a solicitação e atribua o responsável pelo atendimento. Esse é o ponto de coordenação com o cliente.
3. Em **Execução por setor**, crie as tarefas para Contabilidade, Jurídico, Tributário, Comercial, Financeiro, Operações, Experiência do cliente ou Outro. Cada tarefa exige executor e prazo; a obrigatoriedade é definida na criação.
4. Cada setor registra resultado ao concluir. Para dispensar uma tarefa, informe justificativa. Não se apagam tarefas pelo aplicativo, nem se transforma uma tarefa obrigatória em opcional depois da criação.
5. A demanda só passa para resolvida quando não houver tarefa obrigatória pendente. Cancelamento é uma decisão separada, reversível, e não é contabilizado como resolução. Reabrir mantém as tarefas e seus resultados; reabra a tarefa necessária para continuar.

Resolver uma demanda é uma atualização interna: **não comprova retorno ao cliente**. O Inbox continua sendo o lugar das mensagens e evidências de envio dos canais. Não existe envio automático ao concluir tarefas. Demandas antigas sem tarefas mantêm o funcionamento anterior.

Tarefas pertencem à empresa selecionada. Um atendimento pode envolver vários setores dessa empresa; isso não libera compartilhamento entre empresas do grupo. Demandas confidenciais mantêm a regra anterior: criador, responsável e administradores. Para não criar executor sem acesso, a interface restringe a atribuição de tarefas confidenciais ao criador ou responsável. Os administradores continuam com acesso de gestão. Colaboração entre empresas exige projeto de acesso explícito, não é implícita nesta atualização.

## Relatório mensal

Na **Central de demandas → Relatório mensal do cliente**, escolha cadastro e mês. A seleção usa os clientes que o perfil já pode acessar. O perfil Suporte não passa a enxergar a base comercial. A visão de Atendimento que não recebeu cadastros apresenta orientação em vez de fazer busca privilegiada.

- Entradas no mês: demandas criadas no intervalo local de São Paulo.
- Últimas resoluções no mês: demandas cujo estado atual está resolvido e cuja última resolução ocorreu no período. Reabertura remove a resolução atual, como no núcleo existente. Não mede todos os ciclos de resolução.
- Pendentes agora: estoque atual, independente do mês escolhido; **não é saldo histórico no fim do mês**.
- Média de resolução: horas corridas entre abertura e última resolução das demandas do indicador anterior. Não representa horas úteis nem prazo de primeira resposta.
- Lista: união das entradas do período, resoluções do período e pendências atuais; até 200 registros, com aviso se exceder. Os indicadores consideram todos. A exportação CSV usa o mesmo recorte limitado e neutraliza fórmulas.

O relatório respeita a confidencialidade do usuário. Cadastros com homônimos não são mesclados. Atendimentos manuais sem lead continuam fora da agregação por cliente; texto livre de solicitante não prova identidade. Vínculo de contatos manuais, compromissos de retorno e relatório histórico completo continuam como evoluções específicas.

## Concorrência, segurança e privacidade

- A gravação da tarefa trava primeiro a demanda e compara a versão. A mesma trava é usada na resolução; não há janela para acrescentar tarefa pendente enquanto outro usuário resolve.
- Toda alteração de tarefa incrementa a versão da demanda e gera histórico com antes/depois, na mesma transação.
- UUID de tarefa permanece estável durante repetição após retorno interrompido. Uma repetição exata não grava nem audita novamente. Identificador de outra demanda é rejeitado, inclusive em conflito de inserção.
- Resultado incerto trava o conteúdo enviado. O usuário pode conferir com o mesmo conteúdo ou usar **Conferir dados e descartar edição da tarefa** para recarregar; deve conferir se a tarefa apareceu antes de criar outra.
- A tabela tem RLS de leitura herdada da demanda e nenhum grant de escrita para o navegador. A função valida sessão, vínculo, confidencialidade e executor ativo; nenhuma chave de serviço é colocada no cliente.
- Executor desativado permanece no registro histórico. A equipe deve reatribuir a tarefa pendente a membro ativo; esta fase não cria um agendador de reatribuição.
- Exportação de privacidade administrativa acrescenta as tarefas. Ela intencionalmente preserva o escopo administrativo anterior, incluindo demandas confidenciais do contato. Exclusão do contato segue as FKs anteriores e remove suas tarefas; demandas internas não são fundidas ao contato por texto.

## Implantação

Aplicar **somente** `20261113120359_support_sector_tasks.sql`, depois de confirmar as migrations anteriores no destino. O banco é compartilhado com Chekly: não rodar reset nem push global. A migration confere a versão conhecida do corpo de `lead_privacy_export` antes de substituí-la; divergência interrompe a transação para revisão, evitando apagar customização desconhecida.

Conferir nova tabela, RLS, RPCs, execução por authenticated, bloqueio de anon e comportamento de encerramento. Publicar frontend só após o banco. Reverter o frontend preserva as tarefas; não remover tabela como rollback automático.

## Revisão e validação

Claude Code 2.1.283 participou da análise de arquitetura e da revisão dos três arquivos novos, com autorização do usuário e sem credenciais ou dados de clientes. Suas correções concretas incorporadas: obrigatoriedade imutável, proteção contra conflito de ID entre demandas e saída explícita de formulário após conflito/incerteza. Mantida a fronteira de acesso da empresa e a exportação administrativa já existente.

Testes novos de banco cobrem RLS, confidencialidade, executor de outra empresa, validação, repetição sem duplicar, versão, obrigação de resultado/justificativa, bloqueio de fechamento, compatibilidade de demandas anteriores, limites de mês, exportação de privacidade e exclusão em banco descartável. Interface cobre execução por setor, fechamento antecipado, perda de resposta e troca de empresa no relatório. Não são testes de provedores reais.

Consulte o registro de implantação para evidências finais. Nenhuma conta Meta/Microsoft ou telefonia é conectada por esta migration.
