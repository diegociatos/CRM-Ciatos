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

Revisão pelo Claude Code concluída após autorização específica do usuário para as novas alterações de interface e estilos. Foram enviados somente código e estilos, sem credenciais nem dados de clientes. Os apontamentos foram conferidos contra o código antes de gerar correções.

## Publicação em 13/11/2026

[PR 9](https://github.com/diegociatos/CRM-Ciatos/pull/9), integrado no commit `0bcd4146419ac1ca153f640549e90fea898564c9`.

[Validação completa](https://github.com/diegociatos/CRM-Ciatos/actions/runs/43448816771): 110 testes de regras/banco e 68 testes de interface aprovados, além de TypeScript, build e verificação das funções existentes.

[Publicação](https://github.com/diegociatos/CRM-Ciatos/actions/runs/43449487868) concluída. Conferidos no navegador autenticado de produção os cartões da fila e a aba de canais. Em viewport de 390 px, a página de canais não apresentou transbordamento horizontal. Restaurado o tamanho original do navegador.

A validação também identificou e corrigiu a busca inicial que podia desfazer a página escolhida na fila de demandas, além de tornar o teste de tarefas explícito sobre aguardar o resultado persistido na lista.

## Correções da revisão pelo Claude

- Painéis de e-mail e Meta permanecem montados ao alternar o canal. Cada um tem sua própria revisão de dados: salvar um canal não recarrega nem descarta o rascunho do outro.
- Escolher um canal abre diretamente sua configuração, sem outra expansão. O foco acompanha o formulário selecionado.
- Alterar o perfil reinicia o atendimento em uma aba válida e remove as configurações restritas.
- A busca de clientes volta à primeira página na mesma atualização do campo. O resumo flexiona “cliente/clientes” e anuncia a mudança de página; a barra de saúde não é desenhada para avaliação ausente.
- Atalhos do painel usam conteúdo HTML apropriado dentro dos botões e passam para uma coluna nas telas intermediárias.
- O tema escuro externo do painel estratégico é explícito. A hipótese inicial de texto ilegível era parcial: o componente já tinha seu próprio fundo escuro; a correção preserva também o entorno.

Testes adicionais verificam preservação de rascunhos ao trocar de canal e salvar o outro, abertura direta dos campos, foco no formulário e troca de perfil com o mesmo usuário. Nenhuma integração ou autorização de provedor é criada por essas correções.

### Publicação das correções

[PR 10](https://github.com/diegociatos/CRM-Ciatos/pull/10) e [PR 11](https://github.com/diegociatos/CRM-Ciatos/pull/11) integrados. A conferência visual acrescentou rolagem explícita para posicionar o formulário abaixo do cabeçalho fixo ao escolher o canal.

[Validação final](https://github.com/diegociatos/CRM-Ciatos/actions/runs/43493898969) aprovada, com 110 testes de regras/banco e 70 de interface. [Implantação final](https://github.com/diegociatos/CRM-Ciatos/actions/runs/43494419692) concluída no commit `6876e12f220c527b3c5b06a80b2bcd8f20b59a44`.

No navegador autenticado de produção, o título da configuração ficou a aproximadamente 118 px do topo, abaixo do cabeçalho de 76 px no computador e de 72 px no celular. Em 390 px de largura, não houve transbordamento horizontal. Confirmado também o fundo externo escuro do painel estratégico. Nenhum cadastro de canal foi salvo durante a conferência; o tamanho do navegador foi restaurado.

A segunda conferência do Claude considerou os apontamentos tratados resolvidos. Sua ressalva condicional de tipagem foi verificada: `executive_bi` já está em `NavigationState`, e a checagem de tipos foi aprovada.
