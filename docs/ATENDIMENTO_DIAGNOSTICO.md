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

## 6. Fase A: o que foi implementado

Migration `20261108190000_support_desk_foundation.sql` (incremental; não altera as anteriores) e telas "Atendimento".

**Funciona (verificado em banco descartável e com cliente simulado):**
- Perfil **Suporte** (`operating_role='SUPPORT'`), atribuído só por administrador da empresa (`crm.set_support_profile`), nunca a si mesmo, a administradores ou masters, com auditoria (`crm.support_audit`). Nenhum acesso existente muda.
- Restrição no banco: `crm.tenant_member` passou a negar Suporte (leads, comercial, configurações, exportações seguem fechados) e `crm.support_member` o inclui nas superfícies de atendimento (Inbox, respostas rápidas, Central de demandas, empresas do usuário). Suporte lê contatos só por `crm.support_contacts` (apenas quem tem conversa na empresa).
- Atendimento sobre a conversa do Inbox: espera de retorno, primeira resposta humana **aceita pelo provedor** (enviando/incerto não contam), reaberturas e conclusão com justificativa obrigatória (`crm.support_resolve`). Estado derivado das mensagens (`recompute_case_state`), robusto a evento fora de ordem e confirmação tardia.
- Fila do atendente (`crm.support_queue`, contadores, assumir sem corrida) e painel do gestor (`crm.support_desk_overview`) com definição de cada número; cada indicador abre a lista que o forma. Prazos de 1ª resposta e de resolução separados, por empresa.
- Saúde dos canais: e-mail (a partir do cursor de leitura existente), WhatsApp e Instagram **"Não configurado"**. Confirmação automática aparece como **"Não habilitada"**: não existe.
- A RPC antiga `update_inbox_conversation` não conclui sem justificativa e não permite mexer no atendimento de outra pessoa (achado da revisão do Codex).

**Não existe ainda (não afirmar como funcionando):** e-mail espontâneo, WhatsApp, Instagram, confirmação automática, eventos de entrega/leitura do provedor, vários assuntos por conversa (uma conversa por contato e canal), contato sem lead, ligação persistente entre atendimento e demanda.

**Limites conhecidos:** a caixa de leitura Microsoft é global; o painel mostra mensagem genérica de falha. Um contato que volta a escrever reabre a mesma conversa (sem separar assuntos). Horas corridas, sem dias úteis.

**Revisão independente:** o Codex CLI revisou a migration em modo somente leitura; os achados de gravidade alta/média (bypass pela RPC antiga, confirmação tardia, reabertura, regexp frágil) foram corrigidos e cobertos por teste.

**Implantação:** aplicar `20261108190000` no schema CRM (a migration aborta se alguma troca de `tenant_member` ficar incompleta) e em seguida publicar o frontend. Depois, um administrador atribui o perfil Suporte a uma pessoa de teste e valida com dois usuários e duas empresas.

## 7. Fase B: e-mail de suporte espontâneo e confirmação controlada

Migration `20261109120000_support_email_intake.sql`, módulo `supabase/functions/_shared/supportMail.ts` e função `crm-support-mail`. **Tudo desligado por padrão.** Nada é lido nem enviado até um administrador habilitar o canal no app **e** as chaves de servidor serem ligadas.

**O que existe (testado em banco descartável e com transporte simulado):**
- Contato sem lead: `crm.support_people`, identidade por e-mail exato dentro da empresa (nunca fundida por nome parecido, nunca vira lead).
- Um assunto = um atendimento (`thread_key` do e-mail). Mensagens repetidas do mesmo assunto entram na mesma conversa; assuntos diferentes da mesma pessoa ficam separados. Protocolo sequencial por empresa (`ATD-000001`).
- Ingestão idempotente por id externo; ignora rascunhos, automáticas (`Auto-Submitted`, `X-Auto-Response-Suppress`, `Precedence`, listas), `no-reply` e a própria caixa. A caixa pertence a uma única empresa.
- Confirmação automática: texto por empresa, com aprovação explícita; editar volta a rascunho e desliga o envio; sem prazo numérico (checagem simples, não substitui revisão humana). Uma confirmação por atendimento e por remetente a cada 24 h, limite diário, cancelada se já houve resposta humana aceita ou o atendimento foi concluído. Ela **não conta** como resposta humana.
- Estados com evidência: na fila, enviando, aceita pelo provedor (entrega **não informada** pelo canal), falhou, incerta, cancelada. 4xx definitivo = falha; timeout/5xx = incerta, nunca reenviada sozinha. Incerta é reconciliada em Itens Enviados (cabeçalho `X-Ciatos-Outbox`); só vira falha após 15 min com listagem completa; reenvio só por decisão do gestor.
- Resposta humana a pessoa sem lead pela caixa da empresa (`reserve_support_reply`), idempotente.
- Privacidade: exportação e exclusão de uma pessoa do suporte (administrador). Bloqueios de marketing não são enfraquecidos: o fluxo de campanhas segue como antes; o atendimento solicitado pelo cliente é um fluxo separado e não usa listas de marketing.
- Painel: confirmações pendentes/falhas viram indicadores com lista; canais mostram "E-mail de suporte" separado do "E-mail de cadências".

**Para ligar (depende de você; nada disto foi feito):**
1. Publicar a função `crm-support-mail` e agendá-la (ex.: a cada 2 min) com `CRM_WORKER_SECRET`.
2. Autorizar leitura da caixa de suporte (Mail.Read.Shared) e envio (Mail.Send.Shared) para a conexão Microsoft e definir `CRM_SUPPORT_MAIL_ENABLED=true`; o envio da confirmação ainda exige `CRM_LIVE_SEND_ENABLED=true`.
3. No app: informar a caixa, aprovar o texto, ler a caixa e só então habilitar a confirmação. Começar por uma empresa piloto e uma conversa real controlada.

**Limites:** só caixa de entrada e mensagens novas (sem histórico); a conexão Microsoft continua global; horas corridas; "aceita pelo provedor" não prova entrega; WhatsApp e Instagram seguem sem conexão.

**Ajustes da revisão independente (Codex) na Fase B:** a leitura só grava se a caixa lida ainda for a caixa atual da empresa; cada confirmação fica presa à caixa de origem (cancelada se a caixa mudar); a confirmação só é enfileirada para remetente autenticado (DMARC/CompAuth do Exchange), para não escrever a um endereço falsificado; ausência em Itens Enviados **não** autoriza reenvio (permanece incerta até conferência humana); outro participante no mesmo thread vira atendimento próprio; a confirmação sai com `X-Auto-Response-Suppress`. **Risco que permanece:** mensagens de remetentes desconhecidos são sempre gravadas (não descartamos mensagem de cliente), então um flood cria atendimentos; só as confirmações têm limite (uma por remetente a cada 24 h, 200 por dia).

## 8. Fase C: WhatsApp e Instagram por empresa (código pronto, nada conectado)

Migration `20261110120000_support_meta_channels.sql`, módulo `supabase/functions/_shared/supportMeta.ts` e funções `crm-support-meta` (webhook) e `crm-support-meta-verify` (prova de posse). **Tudo desligado por padrão.** Cada empresa tem a própria conta de WhatsApp e de Instagram.

**O que existe (testado em banco descartável e com transporte simulado):**
- Webhook oficial da Meta: verificação (GET) e eventos (POST). A assinatura `X-Hub-Signature-256` é conferida sobre o corpo bruto, em tempo constante, **antes** de qualquer acesso ao banco. Cada item do lote é independente; qualquer falha devolve 500 para a Meta reenviar (a gravação é idempotente por id externo). Evento de conta desconhecida, desabilitada ou não verificada é ignorado com 200.
- **Prova de posse da conta:** cadastrar um identificador não basta. O administrador salva o identificador e pede "Verificar conta": o servidor usa o **token secreto desta empresa** para consultar a conta na Meta e só então ela passa a rotear eventos. Sem isso, uma empresa poderia cadastrar o identificador de outra e capturar mensagens. Trocar o identificador derruba a verificação; só uma empresa pode ter a conta verificada.
- WhatsApp: texto, botões e listas viram mensagem; mídia vira aviso; reações ignoradas. Instagram: mensagens diretas de texto; ecos e mensagens do próprio perfil ignorados.
- Um contato = um atendimento por canal (reabre se concluído), protocolo por empresa, contato sem lead. A mesma pessoa em e-mail e WhatsApp são dois contatos (sem fusão automática).
- Resposta humana (`crm-inbox-send`): texto livre só até 24 h depois da última mensagem do cliente (fora disso o canal exige modelo aprovado, ainda não suportado). Idempotente por `request_id`; 4xx definitivo = falha (e o editor continua livre); timeout/5xx/429/resposta sem id = "a conferir", nunca reenviada sozinha. **Um gestor registra o que conferiu no aplicativo do canal** ("foi enviada" / "não foi enviada"), de forma auditada, e isso libera nova resposta.
- Estados com evidência: "aceita pela Meta" não prova entrega. WhatsApp informa enviada/entregue/lida/falhou; Instagram informa só "lida". Um status que chega **antes** de gravarmos o id da mensagem fica guardado e é reaplicado depois (não se perde). Entregue/lida nunca viram falha; falha informada deixa de contar como primeira resposta.
- Token: nunca no banco nem no navegador. O banco guarda só o **nome derivado** do segredo (`META_TOKEN_<CANAL>_<UUID da empresa, 32 hex>`); o servidor recusa qualquer outro nome (impede ler `SUPABASE_SERVICE_ROLE_KEY` ou o segredo de outra empresa).
- Limites: 100 novos atendimentos por hora e empresa vindos de canais abertos (e-mail de suporte, WhatsApp, Instagram), contados com trava por empresa. Excedido, a gravação falha e a Meta reenvia depois (nada se perde; mensagens de atendimentos existentes continuam entrando). Resposta: 300 por dia e canal. A cota diária de **e-mail** não conta mais mensagens do WhatsApp/Instagram.
- Painel do gestor: canal "Aguardando" até a conta ser verificada e receber a primeira mensagem real; "Conectado" só depois de um evento; falha de envio aparece como "Com erro". Tela por empresa (identificador, nome, habilitar, verificar) sem campo de token.
- Sem confirmação automática nem resposta automática nesses canais.

**Ajustes da revisão independente (Codex) na Fase C:** prova de posse da conta, conferência manual de resposta incerta, status adiantado guardado, itens do lote independentes, nome do segredo com UUID completo, cota de e-mail separada, trava por empresa no limite, leitura do Instagram e textos por canal no Inbox. **Risco que permanece:** sob inundação contínua de novos contatos (acima de 100/h), novos contatos só entram quando a janela de 1 hora liberar e a Meta ainda estiver reenviando (cerca de 7 dias).

**Para ligar (depende de você; nada disto foi feito):**
1. Aplicar a migration (SQL Editor do Supabase) e publicar `crm-support-meta` **sem verificação de JWT** (a Meta não envia JWT; a autenticidade vem da assinatura) e `crm-support-meta-verify` com JWT.
2. Na Meta (conta Meta Business da empresa): criar o app, adicionar WhatsApp e/ou Instagram, gerar token permanente (usuário do sistema) e anotar o Phone number ID / ID da conta profissional. Cadastrar o webhook `.../functions/v1/crm-support-meta` com o token de verificação, assinando `messages` (WhatsApp e Instagram) e `message_reads`/`messaging_seen` (Instagram).
3. Segredos no Supabase (Edge Functions): `META_APP_SECRET`, `META_VERIFY_TOKEN`, `CRM_SUPPORT_META_ENABLED=true`, `CRM_LIVE_SEND_ENABLED=true` e, por empresa/canal, o segredo com o nome mostrado na tela.
4. No app (administrador da empresa): informar o identificador, habilitar, **Verificar conta**. Começar por uma empresa piloto e uma conversa real controlada.

**Limites:** sem modelos de mensagem (templates) nem envio fora da janela de 24 h; sem download de mídia; sem confirmação automática; um único app Meta (`META_APP_SECRET`) para todas as empresas; custos de conversa do WhatsApp são da conta Meta de cada empresa.
