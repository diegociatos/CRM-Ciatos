# Referência Nero: o que adaptar ao Ciatos CRM

Análise da apresentação `apresentacao-nero.pdf` (22 páginas), em 29/09/2026. A apresentação é uma referência funcional; não é especificação técnica nem comprovação de que as integrações descritas estejam disponíveis para o Ciatos. Manter identidade, fontes e linguagem do Grupo Ciatos.

| Área apresentada | Situação no Ciatos CRM | Adaptação recomendada |
| --- | --- | --- |
| Inbox multicanal | Respostas de cadências por Microsoft 365, conversa por empresa/lead, responsável, estado, notas e resposta manual revisada. Mensagens sem token de campanha ainda não são capturadas. | Completar histórico da caixa e, depois, WhatsApp oficial conforme credenciais e regras do canal. |
| Radar de risco | O Radar atual descobre leads e organiza listas; não mede relacionamento parado. | Preservar a prospecção e adicionar uma visão distinta de risco/continuidade, baseada em última atividade, próximo compromisso e pendências. |
| Agenda | Calendário, compromissos e vínculo com leads existentes. | Acrescentar visões semana/dia, confirmação, comparecimento e integração bidirecional somente quando o calendário externo estiver autorizado. |
| Respostas rápidas | Biblioteca por empresa no Inbox, com criação, edição, arquivo recuperável e inserção em rascunho. Nenhum modelo é enviado automaticamente. | Adicionar variantes por serviço e métricas de uso após haver volume de atendimento. |
| Funis | Pipeline de etapas por empresa. | Adicionar múltiplos funis por empresa apenas se houver processos realmente distintos; preservar filtros, histórico e motivo de perda. |
| Contatos | Leads, clientes ativos, importação e timeline. | Unificar busca, duplicidade, origem e histórico de canais na ficha do contato, respeitando opt-out e LGPD. |
| Tarefas | Agenda e fases de onboarding; faltam pendências gerais com prioridade e estado. | Criar tarefas vinculadas a contato/negócio, responsável, prazo, prioridade e conclusão. |
| Central CRM | Menu lateral e Painel Geral já oferecem navegação. | Organizar atalhos por objetivo e mostrar ações prioritárias da empresa selecionada. |
| Agentes | Agente SDR, análise de IA e fila “Precisa de você”, com simulação e limites. | Evoluir para agentes versionados por empresa/função, capacidades explícitas, testes e auditoria antes de publicação. |
| Follow-ups | Cadências de e-mail com agendamento, eventos e interrupção por resposta. | Oferecer editor visual gradual e fila de próximos passos; não prometer WhatsApp automático sem canal aprovado. |
| Roteadores | Ausentes. | Adicionar depois do Inbox e de mais de um agente real, com classificação testável e encaminhamento humano. |
| Central IA | Central da IA existente. | Agrupar montar, acompanhar e revisar; tornar consumo, execução e limites mais claros. |
| Conexões | Microsoft 365 e Snov.io opcionais; configuração de envio por empresa. | Exibir saúde e permissões de cada integração em uma área única, sem mostrar segredos no navegador. |
| Webhooks | Há endpoints técnicos para eventos de envio/resposta; não há construtor de fontes e regras equivalente ao descrito. | Criar entrada autenticada por empresa, deduplicação, histórico e regras inicialmente pausadas. |
| Desempenho | Painéis executivo, consultor e SDR. | Padronizar períodos, denominadores e estados “sem dados”; adicionar tempo de resposta e atrito depois do Inbox. |
| Meta Ads | Ausente. | Integração opcional de leitura, dependente de conta Meta autorizada, com distinção entre métricas do anúncio e vendas do CRM. |
| Atividades | Timeline do cliente, eventos e execução da IA, distribuídos em telas diferentes. | Construir linha do tempo consolidada com filtros por origem, pessoa, período e empresa. |
| Central de Análise | Dashboards existentes, sem hub único de relatórios. | Criar hub de relatórios após padronizar métricas e escopo dos dados. |

## Ordem de implementação

1. **Base de atendimento:** modelo de conversas e mensagens, isolamento por empresa, permissões, deduplicação, retenção e trilha de auditoria. Integrar primeiro a caixa Microsoft 365 já conectada, sem ativar envios novos.
2. **Inbox utilizável:** filas, busca, histórico, notas internas, responsável, ficha lateral do contato e “Precisa de você”. Respostas rápidas entram no editor, sempre revisáveis.
3. **Continuidade:** tarefas gerais, Radar de risco separado do Radar de prospecção, agenda e follow-ups ligados a eventos reais da conversa.
4. **IA operacional:** agentes por função, configuração versionada, simulação, limites, classificação e transferência humana. Só automatizar atendimento depois de testar fontes, horários, opt-out e canais.
5. **Integrações e análise:** WhatsApp oficial, webhooks configuráveis, métricas de atendimento e Meta Ads conforme credenciais, consentimentos e contas disponíveis.

## Regras que não devem se perder

- A empresa selecionada define o escopo de conversas, contatos, agentes, scripts e relatórios; o mesmo usuário pode participar de várias empresas.
- Credenciais ficam no servidor. Nenhuma tela deve implicar canal conectado ou mensagem entregue sem confirmação do provedor.
- Opt-out, supressão, idempotência, limites de envio, revisão humana e registro de origem dos dados valem também para os módulos novos.
- A aparência pode aproveitar a clareza e a hierarquia da apresentação, mantendo a marca e a fonte Book Antiqua solicitadas para o Ciatos CRM.

## Pré-requisitos para WhatsApp

A [política oficial do WhatsApp Business](https://whatsappbusiness.com/policy/) exige permissão prévia do destinatário para contato, modelos aprovados para iniciar conversas e limita respostas livres à janela de 24 horas aberta por mensagem do usuário. A integração deve ser feita por empresa e número oficial, com credenciais no servidor, registro do opt-in, templates aprovados, supressão, limites, custos e transferência humana. Nenhuma cadência de WhatsApp foi ativada nesta etapa.
