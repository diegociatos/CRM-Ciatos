# Experiência visual e atendimento

## Entrega

- Resumo da fila com quatro cartões acionáveis: responsável, distribuição, retorno e atenção. Os valores usam `support_queue_counts`; não há métricas demonstrativas em produção. Os cartões se sobrepõem e não devem ser somados.
- Aba **Canais de atendimento**, disponível para administradores e gestores, com escolha entre e-mail e mensagens Meta. Reutiliza as configurações e verificações existentes, sem alterar autorizações nem enviar mensagens.
- Atalhos para atendimento, demandas e agenda no painel principal; cores nos indicadores e distribuição visual da carga por atendente.
- Texto operacional em fonte de sistema e títulos com a identidade Ciatos. Controles maiores, foco visível, adaptação ao celular e respeito à preferência de movimento reduzido.
- Lista de clientes em páginas de 25 registros, com busca sobre a base disponível completa. Uma avaliação ausente aparece como **Sem avaliação**; uma avaliação real igual a zero continua como **0%**.
- Cadastro de lead oculto para Suporte na navegação e no cabeçalho. Isso complementa, e não substitui, as permissões existentes do servidor.
- Botões do registro manual permanecem acessíveis durante a rolagem. Preservados rascunho, confirmação de saída e repetição segura após resposta incerta.

## Limites desta entrega

Não altera banco, políticas de acesso, conteúdo de clientes ou contas conectadas. A revisão visual não conclui todas as recomendações da auditoria.

A integração existente ainda aceita um WhatsApp por empresa. Vários números na mesma empresa exigem evolução do modelo de contas, recebimento, roteamento e envio. O cadastro da interface não substitui autorização Meta ou Microsoft 365. A aba explicita esse limite para evitar a substituição acidental de um canal ativo.

Permanecem como próximos trabalhos funcionais: conexão guiada por autorização do provedor, suporte real a múltiplos números por empresa, vínculo entre registro manual e cliente com permissões próprias, prazo de próximo retorno separado da resolução, ajuda contextual por perfil e simplificação adicional dos módulos comerciais.

## Verificação

Revisão visual no navegador em computador e celular de 390 px. Testes cobrem navegação da fila, configurações, rascunho e repetição segura do registro manual; testes adicionais verificam filtro pelos cartões, restrição da aba por perfil, ausência de transbordamento horizontal e paginação com avaliação ausente versus zero real.

Revisão pelo Claude solicitada; o envio das novas alterações depende da autorização específica exigida pela análise automática. Não descrever como revisão concluída enquanto isso não ocorrer.

## Publicação em 13/11/2026

[PR 9](https://github.com/diegociatos/CRM-Ciatos/pull/9), integrado no commit `0bcd4146419ac1ca153f640549e90fea898564c9`.

[Validação completa](https://github.com/diegociatos/CRM-Ciatos/actions/runs/43448816771): 110 testes de regras/banco e 68 testes de interface aprovados, além de TypeScript, build e verificação das funções existentes.

[Publicação](https://github.com/diegociatos/CRM-Ciatos/actions/runs/43449487868) concluída. Conferidos no navegador autenticado de produção os cartões da fila e a aba de canais. Em viewport de 390 px, a página de canais não apresentou transbordamento horizontal. Restaurado o tamanho original do navegador.

A validação também identificou e corrigiu a busca inicial que podia desfazer a página escolhida na fila de demandas, além de tornar o teste de tarefas explícito sobre aguardar o resultado persistido na lista.
