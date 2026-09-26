# Revisão do CRM publicado — 26/09/2026

Escopo: sessão autenticada de administrador em https://crm-ciatos.pages.dev/, navegação desktop e verificação da Central a 390 × 844. Base sem leads. Não houve disparos, consultas pagas, criação de usuários ou remoção de dados de produção.

## Cobertura

- Inspecionadas as 16 entradas do menu: Central, BI executivo, painel geral, consultor, SDR, playbook, Radar, qualificação, marketing, pipeline, agenda, onboarding, clientes, pós-venda, usuários e configurações.
- Cadastro: modal abre, quatro campos obrigatórios impedem submissão vazia e descarte fecha sem salvar.
- Busca global: defeito reproduzido; correção coberta com lead sintético apenas no fixture local, seleção abre o callback do dossiê e pesquisa ausente informa ausência.
- Central: falha reproduzida no banco publicado. Consultas agora são verificadas contra todas as migrations em PostgreSQL local (PGlite), sob papel autenticado. Teste de interface cobre simulação, atendimento humano, troca de empresa, falha de consulta e recuperação.
- Backend: 12 testes incluem leases, persistência, horários, cotas, proteção contra reenvio após resultado incerto, isolamento, supressão, webhook assinado, replay, exportação/apagamento em banco descartável, IA e Snov com transporte simulado.
- Interface: 2 testes locais, incluindo busca, metas ausentes e NPS sem respostas. Typecheck e build de produção executados.

## Corrigido nesta revisão

1. Central ordenava `message_events` por `created_at`, inexistente; agora usa `occurred_at`. Carregamento/erro deixam de exibir falsos zeros e falsos estados vazios. Atualização bem-sucedida limpa o erro.
2. Pesquisa global passou a filtrar os leads acessíveis à conta, com até dez resultados e abertura do dossiê.
3. Metas diárias inexistentes deixam de aparecer atingidas. Removida comparação fixa e falsa de eficiência com 12%.
4. NPS fixo de 9,2 substituído pelo cálculo de promotores menos detratores nas respostas concluídas, com ausência explícita de respostas. Alertas de meta exigem meta configurada. Health Score zero deixa de ser tratado como 100/85.
5. Pós-venda não afirma saúde positiva sem contrato/avaliação. Removidas afirmações estáticas de conformidade e criptografia do BI.
6. Menu recolhível no celular e conteúdo sem margem lateral fixa em telas pequenas. Botões de menu/notificações com nomes acessíveis.
7. Botões sem implementação (auditoria detalhada, QBR e exportações mensais) sinalizam indisponibilidade e ficam desabilitados.

## Melhorias prioritárias ainda pendentes

- P1 — Auditoria financeira: o BI usa faturamento anual do prospect como valor do pipeline e data de criação do lead para receita mensal. Usar valor da oportunidade e data real do fechamento antes de decisões financeiras.
- P1 — Relatórios por período: revisar filtros de ano e fuso nos painéis legados; há filtros baseados apenas no mês. Validar com uma base de homologação contendo históricos de anos distintos.
- P1 — Homologação com dados: CRUD completo, arrastar pipeline, agenda, NPS, onboarding e permissões por papel precisam de cenários preenchidos e contas distintas. A navegação vazia não comprova esses fluxos.
- P1 — Integrações reais: entrega, bounce, resposta, IA e enriquecimento ainda precisam de homologação com contas de teste e configuração explícita. Flags de envio/IA/Snov continuam desligadas.
- P2 — Compilar Tailwind no build: atualmente depende do CDN em tempo de execução e gera aviso no console.
- P2 — Carregamento sob demanda: bundle principal perto de 1,2 MB (aprox. 325 KB gzip), com aviso do Vite. Separar módulos e gráficos.
- P2 — Responsividade completa: shell e Central corrigidos; tabelas largas, modais e painéis legados ainda requerem adaptação específica e testes em vários tamanhos.
- P2 — Implementar exportações mensais, QBR e auditoria detalhada antes de reabilitar os controles.
- P2 — Paginação e contagens agregadas na Central: o limite de 200 registros por categoria não representa totais históricos.
- P2 — Estados vazios com próxima ação em Playbook e Radar, rótulos de campos e acessibilidade de gráficos/controles de ícone.

## Limites

Esta revisão não é certificação de segurança nem comprovação de conformidade legal. As integrações foram testadas com mocks e o banco descartável cobre cenários determinísticos. Nenhum teste destrutivo foi executado na base real. O frontend continua publicado a partir da branch do PR; um deploy de main anterior à incorporação pode substituir as correções.
