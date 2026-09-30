# Diagnóstico operacional do CRM — 30/09/2026

## Resultado

O CRM está publicado, navega pelas áreas da empresa selecionada e passa as verificações locais: TypeScript, build, 29 testes de regras/banco e 31 testes de interface. Esses testes usam dados e provedores simulados. A inspeção no navegador foi feita no CafeWorking, sem cadastrar contatos, alterar permissões ou enviar mensagens reais.

O CafeWorking **ainda não está pronto para prospecção autônoma real**. A empresa tem duas cadências em rascunho (4 e 6 e-mails), nenhum lead, nenhuma lista do Radar, nenhum contato na fila SDR e agente desligado. A política de envio da empresa está desligada. A caixa Microsoft 365 aparece conectada para envio, mas a leitura de respostas aguarda permissão e reconexão. O monitor do worker reporta ausência das credenciais Snov.io no servidor. O status de conexão não comprova entregabilidade nem permissão de leitura.

## Áreas verificadas

| Área | Inspeção no CafeWorking | Verificação funcional local |
| --- | --- | --- |
| Painel Geral | Abre, mostra duas cadências e indicadores vazios coerentes | Navegação, cartões e responsividade |
| Caixa de entrada | Abre sem conversas; aviso de configuração disponível | Isolamento, leitura, atribuição, notas, prévia e resposta simulada |
| Central da IA | Cadências em rascunho, agente desligado, fila e alertas vazios | Simulação, biblioteca, decisão, privacidade e isolamento |
| Clientes Ativos | Estado vazio | Importação, deduplicação e contratos no ambiente de teste |
| Pipeline Comercial | Estado vazio | Cadastro, qualificação e movimentação no ambiente de teste |
| Minha Agenda | Abre na data atual | Criação, cancelamento e erro de gravação no ambiente de teste |
| Radar Inteligente | Abre sem lista nesta empresa | Filtros, lista nomeada e seleção para cadência |
| Fila de Qualificação | Estado vazio | Cadastro, filtros e recuperação de erro |
| Comunicados | Caixa Microsoft conectada; envio da empresa desligado | Público, rascunho, importação e teste com transporte simulado |
| Sales Playbook | Scripts do CafeWorking disponíveis | Biblioteca e busca |
| Automação Marketing | Abre a gestão de cadências | Cadências e agente testados na Central |
| Estratégico, Performance Consultor, Minha Produção SDR | Abrem sem inventar resultado; metas não configuradas | Estados vazios e métricas testados |
| Onboarding do Cliente | Abre estado vazio da empresa | Modelos, fases, responsáveis e conclusão testados |
| Pós-Venda / Sucesso | Abre estado sem contratos | Estado vazio testado |
| Ajuda e passo a passo | Guia abre | Fluxo guiado testado |
| Importar contatos | Formulário abre | CSV/Excel, complemento e deduplicação testados |
| Gestão de Usuários | Abre para administrador | Isolamento multiempresa e fluxos administrativos testados |
| Configurações | Abre | Editor de modelos e definições testado em desktop/celular |

Nenhum teste local prova entrega de e-mail, disponibilidade/créditos de provedor, qualidade dos dados do Radar ou classificação de uma resposta real. A auditoria detalhada, os relatórios mensais e o QBR continuam indisponíveis nas respectivas telas. A primeira busca do Radar ainda depende do navegador; a fila posterior do agente é persistente. O isolamento de empresas externas para venda como SaaS exige revisão adicional do legado, conforme `docs/MULTIEMPRESAS.md`.

## Preparação para operar

1. Revisar os e-mails e ativar a cadência pertinente à empresa. Não ativar modelos que ainda precisam de ajustes de oferta, público ou assinatura.
2. Criar uma lista nomeada no Radar ou importar contatos reais na empresa correta. Registrar origem e finalidade/base de contato; não presumir consentimento apenas por encontrar um e-mail.
3. Configurar Snov.io no servidor (`SNOV_CLIENT_ID`, `SNOV_CLIENT_SECRET`, `CRM_SNOV_ENABLED`) sem copiar chaves para o navegador, banco público ou repositório.
4. Conceder `Mail.Read` e `Mail.Read.Shared` ao aplicativo Microsoft, habilitar `CRM_REPLY_READ_ENABLED` no servidor e reconectar a caixa. Confirmar monitor de respostas na Central da IA.
5. Revisar remetente, endereço de resposta e limite diário em Comunicados. O envio real também exige `CRM_LIVE_SEND_ENABLED=true` no servidor. A conexão da caixa, sozinha, não liga o envio.
6. Ligar o agente primeiro em **simulação** para uma lista controlada. Conferir deduplicação, contatos sem e-mail, fila de revisão e alertas. Depois de validar, decidir sobre a ativação real com limite baixo e acompanhamento diário.

A nova seção **Antes de ligar o agente** na Central da IA mostra os itens pendentes e impede a ativação pela interface quando faltam pré-requisitos verificáveis. O servidor mantém seus próprios bloqueios para envio. Nenhum agente, cadência ou política foi ativado nesta revisão, e nenhum e-mail real foi disparado.
