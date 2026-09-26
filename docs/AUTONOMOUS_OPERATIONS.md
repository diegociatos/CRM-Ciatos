# Operação do CRM autônomo

Esta versão é um piloto seguro para homologação. Aplicar migrations não agenda tarefas nem habilita envio. Nenhuma credencial ou ambiente real foi usado na validação do código.

## O que funciona

- Central da IA: seleção de empresa, cadências persistentes, inscrição em simulação, fila Precisa de você, decisões e eventos, opt-out e exportação de dados.
- Worker transacional: agenda próximos passos no PostgreSQL, reivindica uma tarefa com `SKIP LOCKED`, usa lease e token de execução. Não depende de navegador aberto.
- EMAIL, WAIT, AI_DECISION e NOTIFY_HUMAN. CREATE_TASK e CHANGE_PHASE são encaminhados para revisão humana nesta versão, sem alterações automáticas silenciosas.
- Editor inicial: e-mail + espera de 1–30 dias + revisão humana. Passos avançados podem ser provisionados por administrador do banco antes de inscrever leads. Não editar sequências com inscrições existentes.
- Resend: envio de texto, chave idempotente estável, opt-out por link/one-click, assinatura HMAC dos eventos e deduplicação. Abertura/clique não significam intenção e não liberam envio adicional.
- OpenAI Responses (sem armazenamento solicitado à API) e Claude Messages no servidor: decisões validadas, cotas, tokens e histórico. Baixa confiança e negociação pedem intervenção; a IA não recebe ferramentas de envio ou SQL.
- Snov.io opcional: descoberta de até 20 perfis por domínio e verificação assíncrona. Sem ativação não há consumo. Limite de 25 solicitações novas/empresa/dia, deduplicação persistente; resultados desconhecidos/catch-all não verificam e-mail. Consultas concluídas ficam em cache; renovar exige revisão operacional.

## Instalação em homologação

1. Crie um projeto Supabase **de homologação**, separado do projeto compartilhado com Chekly. Configure Auth e exponha somente os schemas necessários (`crm`) no Data API. Preserve backups e teste restauração antes de planejar produção.
2. Instale dependências com `npm ci`. Execute `npm run typecheck`, `npm test`, `npm run build`. Os testes usam PostgreSQL embarcado (PGlite) e transportes simulados, sem credenciais reais.
3. Aplique as migrations em ordem cronológica. Se as duas migrations iniciais já existirem no banco, aplique somente as posteriores, conferindo o histórico. As novas migrations assumem o schema inicial do repositório: customizações externas exigem comparar schemas antes.
4. A migração atribui leads existentes ao workspace `grupo-ciatos` e associa os perfis existentes. Perfis criados **depois** precisam de associação explícita em `organization_members` (o endpoint legado atualizado faz isso para Ciatos). Se houver dados de empresas independentes no banco antigo, prepare a atribuição correta antes da migração.
5. Configure secrets no servidor a partir de `supabase/secrets.env.example`. Gere valores aleatórios fortes e distintos para `CRM_WORKER_SECRET` e `CRM_INBOUND_SECRET`. Mantenha `CRM_LIVE_SEND_ENABLED=false`, `CRM_AI_ENABLED=false` e `CRM_SNOV_ENABLED=false`.
6. Publique as funções `crm-automation-worker`, `crm-email-webhook`, `crm-unsubscribe`, `crm-inbound-event`, `crm-enrichment`, `crm-ai-supervisor`, além das versões atualizadas `crm-ia` e `crm-admin-users`. O arquivo `supabase/config.toml` desabilita JWT de gateway **apenas** nos endpoints com autenticação própria ou token público de opt-out. Nunca desabilite autenticação do enriquecimento/supervisor.
7. Frontend: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto de homologação. São as únicas variáveis de acesso ao Supabase no navegador. Build `npm run build`, diretório `dist`, fallback SPA para `/index.html`. Não reutilize secrets de produção em previews.
8. Abra Central da IA, crie uma cadência, ative e inscreva um lead de teste em simulação. Faça POST ao worker usando o secret configurado. As simulações respeitam segunda–sexta, 09h–18h, fuso da política. À noite/fim de semana a fila reagenda para nova avaliação em uma hora.
9. Para execução contínua, habilite `pg_cron`, `pg_net` e Vault em homologação. Crie no Vault `crm_worker_url` e `crm_worker_secret`. Revise e execute manualmente `supabase/ops/scheduler.sql`. Uma invocação/minuto processa até uma tarefa: capacidade inicial aproximada de 60 tarefas/hora, sem compromisso de SLA.
10. Valide a persistência fechando o navegador, a pausa de cadência, os alertas, opt-out, replay de evento e isolamento usando dois usuários de empresas diferentes. Só depois prepare a implantação real.

## Secrets e ativação deliberada

| Nome | Uso |
| --- | --- |
| `CRM_WORKER_SECRET` | Autoriza apenas o scheduler/worker; nunca usar chave service_role como token público |
| `CRM_INBOUND_SECRET` | Ponte confiável de respostas/reuniões |
| `CRM_LIVE_SEND_ENABLED` | `true` habilita capacidade real do servidor; padrão desativado |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Envio e validação de eventos |
| `CRM_AI_ENABLED`, `CRM_AI_PROVIDER` | Ativação e provider `openai` ou `anthropic` |
| `OPENAI_API_KEY`, `CRM_OPENAI_MODEL` | Modelo escolhido/configurado pelo operador; não existe fallback silencioso |
| `ANTHROPIC_API_KEY`, `CRM_CLAUDE_MODEL` | Claude; Radar/assistentes legados ainda dependem de Claude |
| `CRM_SNOV_ENABLED`, `SNOV_CLIENT_ID`, `SNOV_CLIENT_SECRET` | Snov.io opcional |
| `CRM_APP_URLS` | Origens permitidas para convites legados |

As variáveis internas `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` são do runtime Supabase. Nunca coloque service_role, chaves de IA, Resend, Snov ou secrets em VITE_, tabelas de configuração, logs, commits ou chat.

Envio real exige **todos** os controles: flag global, política `outreach_policy.live_enabled`, remetente verificado em formato `email@dominio`, inscrição com `dry_run=false`, cadência ativa, tenant ativo, email verificado há menos de 30 dias, `contact_basis` e `contact_source`, ausência de opt-out/supressão e cotas disponíveis. A tela só cria inscrições simuladas. Não converter simulações em envios: criar outra cadência/inscrição após revisão. As verificações e políticas de envio são alteráveis apenas no servidor.

A revisão de origem/base de contato não é determinação jurídica automática. Registre a avaliação da finalidade e base legal, mantenha canal para direitos do titular e valide política de retenção com o responsável de privacidade. Resend deve ser usado somente para tráfego permitido pelos termos do provedor e com domínio autenticado; descoberta de e-mail não é consentimento.

## Webhooks e respostas

Configure Resend para `crm-email-webhook` com eventos sent, delivered, opened, clicked, bounced e complained. A verificação usa corpo bruto, `svix-id`, timestamp com tolerância de cinco minutos e HMAC SHA-256. Eventos sem mensagem correlacionada retornam erro transitório para permitir retry (inclui corrida webhook antes de concluir envio). Replays não duplicam efeitos.

**Respostas e reuniões não são inferidas de cliques.** Integre sua caixa/calendário a `crm-inbound-event`, autenticando com `CRM_INBOUND_SECRET`, e envie:

```json
{"event_id":"id-estavel-da-origem","message_id":"id-original-do-envio-resend","kind":"reply","occurred_at":"2026-09-28T15:00:00Z"}
```

`kind` aceita `reply` ou `meeting`. A ponte precisa correlacionar o evento ao envio original; não aceite IDs arbitrários de um navegador. Todas as cadências desse lead param e um alerta humano abre. Sem essa ponte, a equipe deve usar os botões Recebemos resposta/Reunião marcada na Central. Esta versão não instala IMAP, OAuth de caixa, sincronização de calendário ou agenda reuniões automaticamente.

Opt-out GET mostra confirmação para não cancelar por scanners de links; POST processa a solicitação, inclusive one-click. A suppression usa o destinatário original registrado, mesmo se o email do lead mudar depois.

## Concorrência, falhas e reconciliação

O job tem identidade `enrollment:step`, lease de cinco minutos e conclusão protegida por token. Antes de reservar envio, revalida contato, cadência, supressão e quotas. As cotas contam reservas, inclusive falhas incertas, por dia UTC; horário comercial usa o fuso configurado. Remetentes são endereços simples, normalizados na contagem compartilhada entre empresas.

Lease expirada antes do despacho pode ser retomada até cinco tentativas. Depois que o despacho começa, falha/timeout exige revisão humana: não reenviar automaticamente, mesmo após expirar a janela de idempotência do provedor. Consulte o provedor pela chave estável antes de criar outro contato. O sistema não promete exactly-once entre PostgreSQL e uma API externa. Um opt-out ocorrido depois do último controle e durante uma chamada já em trânsito não pode recolher uma mensagem enviada; ele bloqueia contatos posteriores.

Pausar uma cadência impede novos despachos; não desfaz uma chamada externa em andamento. Resolver um handoff não retoma envio. O workflow atual prioriza revisão manual em falhas de provedor, em vez de retries de envio cegos. Jobs FAILED, leases antigas, filas vencidas, ai_runs RUNNING antigas e enrichment RUNNING antigas precisam de monitoramento operacional. Defina alertas no ambiente de implantação.

## Multiempresa e white-label progressivos

Leads, cadências, execuções, eventos, decisões, handoffs, supressões e enriquecimento têm escopo de organização; chaves compostas impedem inscrições cruzadas. Membership ativo e perfil ativo são exigidos. Branding `organizations.branding.displayName` aparece na Central. Membership e políticas são provisionadas por operador confiável, nunca por autoinscrição do navegador.

**Ainda não comercializar como SaaS self-service.** Configuração, templates, Radar, metas, agenda sem lead e gestão legada permanecem internos ao workspace Ciatos. As telas antigas não oferecem seleção de empresa e podem agregar leads de organizações às quais o mesmo usuário pertence. O restante da marca global continua Ciatos. Não cadastrar clientes externos nessas telas; usar projeto/instância separada até concluir migração de todo legado, branding global, onboarding, billing, isolamento de credenciais por tenant e revisão de segurança. Não compartilhar um usuário administrativo entre clientes independentes.

## Privacidade e retenção

- `lead_privacy_export` exporta lead, interações, eventos, decisões e handoffs para administrador do tenant.
- `erase_lead` suprime e remove o lead e dependências, retendo email mínimo na suppression para impedir reimportação. Exige autorização do administrador; nenhuma exclusão é executada na instalação.
- Novas auditorias de exclusão não copiam PII. Avaliar dados antigos em audit_logs, mining_leads e sistemas externos separadamente. Exportação/exclusão do lead não substitui inventário completo de dados nem apaga cópias em provedores/backups.
- Definir retenção de resultados de enriquecimento, logs, snapshots antigos e backups antes de produção. Não foi escolhido um prazo jurídico universal.

## Reversão e operação

1. Defina flags globais de envio/IA/Snov como `false` e desative o cron (`cron.unschedule`).
2. Pause sequências; verifique requisições já em voo e jobs incertos no provedor.
3. Preserve dados e logs mínimos. Não faça rollback destrutivo das migrations em produção. Corrija para frente após backup ou restaure homologação a partir do snapshot.
4. Rotacione segredos no secret manager/Vault em caso de exposição; nunca os cole em incidentes.

## Referências de contratos

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Claude Messages](https://platform.claude.com/docs/en/api/messages/create)
- [Resend envio](https://resend.com/docs/api-reference/emails/send-email) e [assinatura de webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Snov.io API](https://snov.io/api)

Os contratos foram consultados para a implementação; os testes locais simulam as respostas. Homologação com credenciais de teste ainda é necessária para validar disponibilidade de modelos, domínios, limites da conta e entrega real.
