# Aplicativo Grupo Ciatos: diagnóstico do Atendimento e plano por fases

Base verificada no código da `main` (commit `76b43fe`, PR #6 mesclado). Nada abaixo descreve algo ligado a canais reais além do que está marcado como "existe".

## 1. O que existe (verificado)

| Tema | Situação no código |
|---|---|
| Central de Demandas | Existe e está em produção: responsável, prioridade, prazo por política, avisos internos, painel, confidencial. Registrar demanda **não** envia mensagem ao cliente. |
| Inbox | Existe. Tabela `crm.inbox_conversations` aceita só `channel='email'`, exige `lead_id` e tem `unique(organization_id, lead_id, channel)`: **uma conversa por contato**, sem separar assuntos. |
| Entrada de e-mail | `supabase/functions/_shared/sdrInbox.ts` lê a caixa de resposta **somente** de mensagens cujo assunto tem `[Ciatos:<uuid>]` ligado a uma cadência e cujo remetente é o destinatário da cadência. E-mail espontâneo de suporte, WhatsApp e Instagram **não** entram. |
| Resposta | Resposta manual por Microsoft 365 com prévia e confirmação humana. O estado `ACCEPTED` significa aceito pela Microsoft, não entregue (a tela já avisa). |
| "Resposta automática" | Classificação de uma mensagem **recebida** (cabeçalho `Auto-submitted`). Não existe confirmação automática enviada pelo aplicativo. |
| Perfis | `papel`/`operating_role`: ADMIN, MANAGER, SDR, CLOSER, OPERATIONAL, CS, MARKETING. **Não há perfil de Suporte.** No menu, "Caixa de entrada" e "Central de demandas" usam `Object.values(UserRole)`: aparecem para todos. |
| Isolamento | `crm.tenant_member(org)` exige membro ativo da empresa; administrador de plataforma **não** vira membro automaticamente. Mas as políticas de leitura do Inbox liberam qualquer membro ativo (sem distinção de função). |
| Inbox → Demanda | Botão "Criar demanda" leva contato e assunto ao formulário. Não há vínculo persistente entre demanda e conversa. |
| Conexão Microsoft | Integração global (`mail_integration`, linha única): não isola caixas por empresa. |

## 2. O que falta para o objetivo

1. Perfil de Suporte e permissões de gestão do atendimento, no banco (RLS e funções), com menus derivados da permissão.
2. Modelo de atendimento: unidade atendente, cliente, contato, conta do canal, conversa, atendimento (caso). Contato sem virar lead. Vários assuntos por cliente. Vínculo conversa ↔ atendimento ↔ demanda.
3. Eventos de entrega com evidência (recebida, confirmação enfileirada, aceita, entregue, lida, falha, incerta, resolvida), cada um com identificador e horário.
4. Confirmação automática controlada: texto aprovado por empresa/canal, habilitação explícita, idempotência, reconciliação de resultado incerto, fila de falhas.
5. Painel do gestor com definições claras (atendimentos, não mensagens; primeira resposta humana separada de resolução) e saúde/cobertura dos canais.
6. Canais oficiais: e-mail espontâneo por caixa de empresa (Microsoft Graph), WhatsApp Cloud API, Instagram.
7. Interface de fila, conversa e contexto, com diferença clara entre mensagem ao cliente e nota interna.

## 3. Fases

**Fase A (primeiro incremento, sem canal novo).** Perfil Suporte + permissões no servidor; modelo de atendimento (tabelas, RLS, auditoria) sobre o Inbox existente; telas de Atendente e Gestor com dados **reais do que já existe** (e-mail de cadências e demandas); estados de evidência já derivados do que o sistema sabe (aceito pela Microsoft, falha, incerto); indicadores com definição e lista de casos. Sem envio automático.

**Fase B (fluxo real de ponta a ponta, um canal).** E-mail espontâneo da caixa de suporte de uma empresa piloto: entrada, protocolo, confirmação automática **revisada e habilitada**, responsável, resposta humana, conclusão com justificativa e reabertura. Depende de autorização de leitura/envio da caixa.

**Fase C (expansão).** WhatsApp Cloud API (número, conta empresarial, modelos, custos, eventos de entrega) e Instagram (conta elegível, permissões, revisão do app). IA para classificar, resumir e sugerir, sempre com revisão humana e bases separadas por empresa.

Cada fase termina com: o que funciona, o que é demonstração, testes, o que depende de autorização, próximo passo. Piloto numa empresa antes de ampliar.

## 4. Decisões que dependem de você (nada foi conectado ou contratado)

- Empresa e caixa de e-mail do piloto.
- Aprovar o texto da confirmação automática e a habilitação de envio real.
- WhatsApp: número, conta Meta Business e orçamento por conversa; Instagram: conta profissional elegível.
- Como migrar os acessos atuais (nenhum acesso existente será alterado sem sua autorização).

## 5. Banco e migrations

A Central de Demandas (`20261108120910`, `20261108150000`) está aplicada no projeto de produção. Novas mudanças serão **migrations incrementais** novas; as aplicadas não serão editadas nem reaplicadas, sem reset nem push global no projeto compartilhado.
