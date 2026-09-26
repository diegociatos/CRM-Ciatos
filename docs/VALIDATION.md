# Validação do piloto autônomo

Executado localmente em 26/09/2026, sem credenciais de provedores, envios reais ou acesso ao banco de produção:

- `npm run typecheck`: passou, incluindo correções de tipos anteriores em Dashboard, MiningLead e navegação.
- `npm test`: 12 testes passaram, incluindo migrations executadas em PostgreSQL embarcado, RLS com usuários de dois tenants, simulação persistente, espera, fencing, recuperação de lease, envio incerto, horário comercial, cotas, alteração de email, opt-out, AI quota/handoff, deduplicação Snov, exclusão e validação de assinatura/replay de webhook.
- `npm run test:ui`: 1 teste de navegador passou com respostas do banco simuladas: assumir handoff, inscrição com `simulate=true`, troca de empresa e estado de erro. Validação funcional, não uma auditoria visual/responsiva completa.
- `npm run build`: passou. Há aviso de bundle principal acima de 500 kB (aproximadamente 1,2 MB antes de gzip); dividir telas/charts é uma otimização futura.
- `npx deno check`: passou nas oito funções alteradas/criadas (worker, webhook, opt-out, supervisor, enrichment, inbound, crm-ia e crm-admin-users).
- `npm install` reportou zero vulnerabilidades nas dependências instaladas. Isso não substitui revisão de segurança.

Não validado aqui: entrega real de mensagens, eventos reais de Resend, disponibilidade/custos dos modelos na conta, respostas reais Snov, integração de caixa/calendário, cron/Vault em Supabase hospedado, migração de dados customizados externos, carga multi-instância e branding em todas as telas legadas.

O workflow `.github/workflows/validate.yml` repete testes, build, navegador simulado e checagem das funções no GitHub. Os resultados locais acima não presumem que esse workflow já terminou no servidor.
