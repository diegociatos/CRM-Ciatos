# Agente SDR e revisão da operação — 28/09/2026

## Fluxo implementado nesta entrega

Central da IA → Cadências contém dez modelos com quatro e-mails cada. A instalação cria rascunhos idempotentes, sem inscrever contatos. A provisão do Grupo Ciatos distribui os serviços conforme a empresa; o workspace Grupo Ciatos contém a biblioteca completa. A ausência de resposta encerra as cadências da biblioteca sem chamar o contato de lead quente.

Central da IA → Agente SDR configura cadência, simulação, finalidade/base de contato avaliada, destinatário de alertas e acompanhamento de possíveis aberturas. Cada empresa tem sua política. A configuração não substitui as flags globais, a caixa conectada, permissões de leitura ou verificação do endereço.

O worker existente, agendado a cada minuto, importa resultados pendentes do Radar de empresas com agente habilitado para uma fila persistente. Deduplica por CNPJ e por contato/cadência. O cadastro preserva origem e telefone disponível; não inventa celular. Clientes da carteira não são automaticamente inscritos em cadência de prospecção. A simulação não consulta o Snov.io nem envia e-mail.

No modo real, usa o e-mail corporativo encontrado e o verifica. Se não existe endereço, procura perfis pelo domínio, seleciona apenas coincidência de nome ou decisor inequívoco, revela o e-mail e depois verifica. Mais de um candidato/endereço exige revisão. Endereço inválido, desconhecido, catch-all, pedido de descadastro ou cadência concorrente bloqueiam a inscrição. A cota existente de 25 solicitações novas por empresa/dia permanece; falhas de reserva/provedor ficam em revisão, sem consumir créditos repetidamente.

O envio registra um identificador opaco no assunto (`[Ciatos:UUID]`). A leitura consulta somente caixas de resposta configuradas nas empresas com agente ligado. Antes de classificar, correlaciona identificador, endereço original do destinatário e momento do envio. Apenas mensagens correlacionadas seguem para IA, usando `uniqueBody`, sem anexos. Mensagens não correlacionadas não geram alertas nem são enviadas à IA. A resposta fica na caixa; o CRM armazena classificação/resumo. O identificador deve permanecer no assunto; respostas com assunto totalmente novo precisam de registro manual.

Uma resposta humana pausa a cadência antes de consultar a IA. Interesse explícito em reunião/conversa/proposta, com confiança de pelo menos 0,9, gera lead quente, sininho persistente por usuário e aviso ao destinatário configurado (Diego no provisionamento interno). Ambiguidades e erros da IA vão para revisão. Pedidos de descadastro suprimem o endereço original e o cadastro; respostas automáticas não viram oportunidades.

O e-mail do alerta contém empresa, contato, e-mail, telefone disponível, motivo e link para o cadastro/empresa correta. Falha ou resultado incerto de envio do alerta exige revisão; não há repetição cega. O sininho continua disponível. As consultas são limitadas a 100 alertas na interface, com atualização a cada 20 segundos.

O pixel opcional registra somente a primeira **possível abertura**. Não coleta IP, agente de navegador nem cookies. Não aumenta o interesse nem cria lead quente: scanners, pré-carregamento e bloqueio de imagens impedem tratá-lo como prova de leitura. As aberturas aparecem na Atividade. Não foi adicionado acompanhamento de cliques.

## Estado da implantação

A migração remota foi bloqueada pela revisão automática de aprovação, que solicitou autorização específica para alterar tabelas/funções do worker em produção. Nenhuma parte desta atualização do SDR foi aplicada ao banco ou às funções remotas. Frontend e cadências também aguardam essa etapa para publicação conjunta. A implantação anterior do editor de onboarding permanece intacta.

## Implantação e ativação

1. Testar `npm run typecheck`, `npm test`, `npm run test:ui`, `npm run build` e Deno check das funções modificadas.
2. Aplicar exclusivamente `20260930120000_sdr_agent.sql` ao schema `crm`. O projeto é compartilhado: não executar reset, push global de migrations nem alterar schemas de outros sistemas. A migration é transacional e não habilita agente/envios.
3. Publicar `crm-automation-worker`, `crm-email-open` (JWT de gateway desativado, token de pixel opaco), `crm-ms365`. Funções externas continuam autenticadas. `crm-email-open` não permite escrever outros eventos ou acessar dados de contatos.
4. Executar `npx tsx supabase/ops/install-ciatos-sdr.ts`, revisar o SQL gerado em `.deployment-backup.local/install-ciatos-sdr.sql` e aplicar somente aos nove IDs internos verificados. É idempotente e cria somente rascunhos/configuração desligada. Não executa a fila nem modifica listas existentes.
5. Provisionar `SNOV_CLIENT_ID` e `SNOV_CLIENT_SECRET` no secret manager do servidor, nunca em VITE, Git, chat ou banco público. `CRM_SNOV_ENABLED=true` permite uso; configurar cotas e finalidade antes de ativar. A presença das chaves, sozinha, não valida créditos/entrega.
6. Para leitura: configurar permissões delegadas `Mail.Read` e `Mail.Read.Shared` no Entra e acesso às caixas de resposta utilizadas. Definir `CRM_REPLY_READ_ENABLED=true` no servidor; o dono da plataforma deve reconectar a caixa e autorizar a Microsoft. O CLI não pode conceder esse consentimento por ele. Sessões existentes de Mail.Send e calendário continuam solicitando apenas os escopos anteriores, mesmo enquanto a leitura aguarda consentimento.
7. Conferir `Agente SDR → Conexões e execução`: heartbeat recente, Snov configurado e caixa de resposta monitorada. Envios autônomos exigem leitura sem erro e watermark recente; caso contrário são adiados. Um identificador de lease impede workers sobrepostos; expire em cinco minutos após interrupção. Até uma resposta é classificada por ciclo para não monopolizar a execução.
8. Revisar a cadência dos serviços da empresa e ativá-la. Registrar finalidade/base avaliada, confirmar destinatário do alerta e escolher operação real. O agente desligado não processa resultados; desligá-lo pausa suas inscrições ativas. Cadências já pausadas não são retomadas automaticamente: reativação exige revisão operacional. O modo de cada item na fila é congelado na entrada; mudar a configuração não converte simulações antigas em envios.

O scheduler `crm-outreach-worker` já estava ativo na inspeção; não criar outro agendamento duplicado. Não foi feito envio de teste a leads nem consumo de créditos Snov durante esta entrega. Testes com transportes simulados não confirmam entregabilidade real.

## Revisão dos itens do menu

Inspeção da navegação em produção, na Ciatos Contabilidade. A carteira estava vazia: testes que exigem clientes, contratos ou gravações foram feitos com dados fictícios no ambiente local. Não é uma afirmação de cobertura exaustiva de todos os campos/regras de negócio.

| Item | Verificação e resultado |
|---|---|
| Painel Geral | Carrega estados vazios e ações; sem indicadores fictícios. |
| Central da IA | Abas, simulação, inscrição, atendimento e erros cobertos por testes; agente, biblioteca e rastreamento adicionados. |
| Clientes Ativos | Pesquisa e tabela vazia disponíveis. Importação/contratos testados localmente. |
| Pipeline Comercial | Etapas carregam. Cadastro, seleção e movimentação cobertos pelo fluxo local. |
| Minha Agenda | Troca de mês, abertura e cancelamento verificados. Corrigida mutação da data que podia pular mês em dias 29–31; controles receberam nomes acessíveis. |
| Radar Inteligente | Duas buscas interrompidas, uma com 47 resultados preservados. Rótulos em português, retomada, ligação à Central e estado de carregamento corrigidos. Não reiniciada busca paga. A busca web original ainda processa páginas a partir do navegador; o agente assume a lista persistida independentemente do navegador. |
| Fila de Qualificação | Filtros e cadastro disponíveis; aprovação e cadastro com falha/repetição testados localmente. |
| Comunicados | Formulário/público/importação testados com mocks. Conexão Microsoft foi confirmada no banco; corrigida a mensagem de erro que confundia indisponibilidade da consulta com caixa desconectada. Nenhum comunicado enviado. |
| Sales Playbook | Biblioteca e busca carregam; sem scripts cadastrados na empresa. |
| Automação Marketing | Direcionada à mesma Central persistente, eliminando a segunda tela de simulação como caminho principal. |
| Estratégico | Indicadores vazios sem inventar receita/NPS. Auditoria detalhada ainda aparece como indisponível. |
| Performance Consultor | Seletores e métricas vazias coerentes. Exportação mensal ainda indisponível. |
| Minha Produção SDR | Seletores e indicadores sem metas inventadas. Exportação mensal ainda indisponível. |
| Onboarding | Estados vazios/modelos, início, falhas, responsáveis e conclusão testados localmente. |
| Pós-Venda | Estado sem contrato verificado. QBR ainda indisponível. |
| Ajuda | Guia ilustrado carrega; texto atualizado para refletir simulação e envio real. |
| Importar contatos | CSV/Excel, cliente/prospect, deduplicação, origem e erro testados localmente. |
| Gestão de Usuários | Equipe da empresa carregada; permissões/multiempresa testadas localmente. Não alterados acessos reais. |
| Configurações | Pipeline, jornada e demais abas acessíveis; editor testado em desktop/celular. Não alterados modelos da equipe. |

## Limites e próximos passos observados

Na inspeção dos nomes de secrets, os dois secrets Snov não estavam presentes; a leitura de respostas também não tinha flag configurada. Essas dependências impedem declarar o SDR real como ativado. As cadências e o código podem ser publicados e revisados sem elas. Há caminhos legados de relatório/exportação explicitamente indisponíveis e a busca web inicial do Radar ainda depende do navegador. Não confundir essas limitações com a fila de enriquecimento/envio, que é persistente.

Falhas da busca original do Radar, crédito Snov indisponível, candidaturas ambíguas, informações ausentes e negociação exigem revisão. Esta entrega automatiza preparação, cadência e triagem; não promete negociação contratual, atendimento jurídico/tributário ou conclusão de venda sem uma pessoa.

## Contratos técnicos consultados

- [Snov.io API](https://snov.io/api): descoberta, revelação e verificação são operações separadas.
- [Microsoft Graph: listar mensagens](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0): paginação, projeção e permissões.
- [OpenAI: saída estruturada](https://developers.openai.com/api/docs/guides/structured-outputs): validação do classificador. O provider/modelo existente é mantido; não há escolha automática de outro modelo.
