# CRM Ciatos Autonomous — arquitetura alvo

## Objetivo
Transformar o CRM atual em uma plataforma multiempresa/white-label que prospecta, enriquece, prioriza e nutre leads de forma autônoma, chamando uma pessoa quando houver intenção comercial, risco, dúvida ou necessidade de negociação.

## Princípios
1. **IA propõe; políticas controlam.** O agente nunca ignora opt-out, limites de envio, horário comercial, permissões ou regras de tenant.
2. **Segredos somente no servidor.** OPENAI_API_KEY, SNOV_CLIENT_ID/SECRET, RESEND_API_KEY e credenciais futuras ficam em Supabase Secrets/secret manager.
3. **Fila persistente.** Esperas de horas/dias não vivem no navegador. Cada próximo passo é um job idempotente persistido.
4. **Human-in-the-loop.** Resposta positiva, pedido de reunião, dúvida sensível, baixa confiança ou oportunidade relevante cria human_handoff.
5. **Multi-tenant desde a base.** Grupo Ciatos é o primeiro tenant; empresas do grupo podem ser workspaces/unidades. Venda futura usa a mesma fundação.
6. **Auditável.** Cada decisão de IA registra modelo, ação, confiança, resumo de entrada/saída, custo e resultado.
7. **LGPD e reputação.** Opt-out/suppression, minimização de dados, rastreabilidade da origem e limites de contato são requisitos de produto.

## Agentes propostos
- **Scout**: descobre empresas e fontes.
- **Enrichment**: completa domínio, decisor, e-mail e validação via provedores como Snov.io.
- **ICP Analyst**: pontua fit por empresa/unidade de negócio.
- **Copywriter**: personaliza mensagem usando contexto verificável, sem inventar fatos.
- **SDR Agent**: escolhe próximo passo da cadência dentro das políticas.
- **Reply Triage**: classifica resposta (positivo, objeção, não agora, opt-out, fora do escritório, erro).
- **Meeting Concierge**: sugere agenda e prepara briefing.
- **Supervisor**: decide quando parar automação e criar handoff humano.

## Fluxo autônomo
Radar/importação -> deduplicação -> enriquecimento -> score -> sequência -> job -> mensagem -> webhook/evento -> IA classifica -> próximo job OU handoff humano.

## Provedores
- **OpenAI**: agente/orquestração via Responses API; ferramenta/function calling no backend.
- **Snov.io (opcional, recomendado para outbound B2B)**: finder/enrichment/verificação, campanhas e webhooks.
- **Resend**: manter para e-mails transacionais; outbound frio deve ter domínio/caixas e reputação separados.
- **Supabase**: banco, Auth, RLS, Edge Functions e scheduler/worker.
- **Cloudflare Pages**: frontend.

## Gates antes de envio automático
- lead não está em suppression/opt_out;
- e-mail válido/verificado quando política exigir;
- limite diário do tenant e da caixa;
- horário permitido;
- deduplicação/idempotência;
- cadência ativa;
- não houve reply/reunião após o job ter sido criado;
- conteúdo passou por regras de tamanho, identidade da marca e campos permitidos.

## Handoff para Diego/equipe
Criar alerta quando: resposta positiva; pedido de preço/proposta; lead pede ligação; reunião marcada; score/intenção acima do limite; IA com baixa confiança; assunto jurídico/tributário que exige análise humana; reclamação/opt-out; oportunidade de cross-sell.

## Roadmap
### Fase 1 — Fundação
Multi-tenant, sequências persistentes, fila, eventos, suppression, AI runs, human handoffs. **Iniciada neste PR.**

### Fase 2 — Worker + e-mail real
Edge Functions crm-automation-worker e crm-email-webhook; cron; Resend/Snov adapter; limites e idempotência.

### Fase 3 — OpenAI Agent
Provider abstraction e agente supervisor. Usar Responses API no servidor. Nunca expor API key no Vite.

### Fase 4 — Enriquecimento
Adapter Snov.io, finder/verifier, cache, custo por lead e fallback de fontes públicas.

### Fase 5 — UX comercial
Inbox unificada, Central da IA, fila “Precisa de você”, editor visual de cadência, analytics de funil e deliverability.

### Fase 6 — SaaS
Billing, planos/limites, onboarding self-service, domínio/custom branding, isolamento RLS estrito por organization_id, logs e exportação LGPD.
