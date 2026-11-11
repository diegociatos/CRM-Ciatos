# Operação do help desk integrado ao CRM

O atendimento e o comercial compartilham a plataforma e mantêm permissões por empresa. O piloto começa pela operação jurídica e pode ser ampliado às outras equipes. A arquitetura usa o React e o Supabase existentes; não exige instalar Chatwoot ou n8n para registrar e acompanhar atendimentos manuais.

## Fluxo disponível

Em Atendimento, **Novo atendimento** registra uma ligação, uma solicitação recebida no aplicativo WhatsApp Business, e-mail, atendimento presencial ou outro canal. A equipe informa solicitante, telefone/e-mail, empresa do solicitante, assunto, relato, próximo passo, responsável, prioridade e confidencialidade. Para ligações, informa direção, resultado e duração.

Salvar cria uma demanda na base existente. **Acompanhar demanda** abre o registro para atribuir, registrar notas, aguardar retorno, resolver ou reabrir. A aba **Registros e demandas** permite acessar essa mesma base dentro do Atendimento. A fila de conversas continua refletindo somente os canais conectados; os indicadores da Central de demandas cobrem os registros manuais e internos. Os contadores têm universos distintos e não devem ser somados como se fossem clientes únicos.

O contato manual não vira lead, não é mesclado por telefone/nome e não recebe cadência. A equipe comercial continua usando cadastro, importação, qualificação e pipeline. O perfil Suporte não ganha acesso aos cadastros comerciais por abrir a aba de demandas.

Os prazos continuam seguindo a política existente em **horas corridas**, desde a criação do registro. A data de registro não comprova quando a chamada ocorreu. Duração e resultado são informados pela equipe, sem evidência de operadora. Não há gravação, transcrição, discador ou áudio no navegador nesta entrega.

## Proteção dos registros

- `support_demands.intake` conserva a origem manual e o solicitante sob a mesma RLS e confidencialidade da demanda.
- `create_support_intake` valida o vínculo ativo, usa o autor autenticado e cria a demanda pela função auditada existente. Não permite escolher outro autor nem escrever diretamente no campo de origem.
- A criação é atômica. A chave única por empresa, autor e UUID, a trava transacional e a comparação do conteúdo normalizado evitam duplicação nas repetições da mesma solicitação.
- Após timeout, o formulário preserva o conteúdo original e permite conferir com o mesmo UUID. Erro explícito de validação libera a correção. Uma rejeição posterior a resultado incerto não desbloqueia o conteúdo original.
- Trocar empresa/usuário desmonta o formulário e descarta respostas atrasadas. Fechar rascunho pede confirmação; sair/recarregar com dados pendentes aciona o aviso do navegador. O UUID não é persistido após recarga: se isso acontecer, conferir a Central de demandas antes de registrar novamente.
- Não são criadas mensagens, inscrições, tarefas de envio ou leads. A atribuição pode gerar o aviso interno existente para o responsável.

Os registros manuais sem lead devem ser considerados nas rotinas de privacidade por solicitante. A exportação por lead existente não identifica automaticamente texto livre ou solicitantes sem vínculo. Não registrar dados pessoais desnecessários no relato; definir a política de retenção antes de ampliar o piloto.

## Canais reais e automações

| Canal | Base existente | Dependência para operar |
| --- | --- | --- |
| E-mail | Microsoft 365, Inbox, ingestão e confirmação controlada de suporte | Caixa por empresa, permissões Microsoft, publicação/agendamento da função e ativação explícita |
| WhatsApp | Adaptador da API oficial, assinatura de webhook e conta por empresa | Elegibilidade da conta/número, configuração Meta, tokens no servidor, verificação e ativação; o aplicativo Business sozinho não fornece webhook |
| Ligações | Registro manual ligado à demanda | Identificar fornecedor do PABX, eventos/API, ramais e vínculo por empresa; áudio no navegador exige suporte de mídia do provedor |
| n8n | Opcional como orquestrador | Instância e finalidade definidas; credenciais por empresa e eventos autenticados; não conectar diretamente com service role no navegador |
| SharePoint | Biblioteca documental possível | Definir site/pastas e permissões Microsoft; não é servidor de aplicação e não há conector nesta entrega |

Uma caixa/número deve ter um único fluxo responsável pela ingestão e pelo envio. Não ligar leitores, bots ou confirmações paralelos no n8n. Eventos externos precisam de origem verificada, deduplicação e vínculo da conta com a empresa; resultado incerto não autoriza reenvio automático.

## Implantação e verificação

Aplicar somente `20261111201959_support_manual_intake.sql` após confirmar as migrations anteriores. Não executar reset ou push global no Supabase compartilhado. A mudança acrescenta uma coluna e uma função; mantém políticas e ciclo de vida existentes. Publicar o frontend depois do banco. Para reverter o frontend, conservar a coluna e os dados registrados.

No piloto: validar com duas pessoas autorizadas, criar registro não confidencial e confidencial, atribuir e registrar retorno, resolver/reabrir, testar outra empresa e conferir ausência de envios externos. Usar registros identificados como teste e não excluir dados reais para testar rollback.

Testes automatizados: PostgreSQL/PGlite com RLS, vínculo inativo/ausente, confidencialidade, campos inválidos, repetição e conflito de conteúdo; navegador com criação, timeout, rejeição, leitura do contexto, navegação, edição e layout de celular. Os testes usam dados fictícios e não comprovam conectividade com operadoras ou provedores reais.

## Evolução após o piloto

Conectar uma caixa e um número por empresa, homologar eventos e retornos reais e só então ampliar. Prioridades seguintes: calendário de horário comercial e feriados para SLA, conhecimento por empresa, pesquisa de satisfação, anexos documentais e integração com PABX. Cada canal deve ter um responsável operacional e um teste real autorizado antes de ser apresentado como conectado.

Chatwoot, Zammad e Frappe Helpdesk foram avaliados como alternativas. A decisão desta entrega é evoluir o núcleo existente; nenhum código desses projetos foi incorporado. A CLI do Claude revisou o desenho conceitual de idempotência e autorização, sem acesso aos arquivos privados.
