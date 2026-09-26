# Nova experiência visual do CRM

## Entrega

- Identidade em azul profundo, dourado e superfícies claras; tipografia de interface sans-serif sem fontes remotas, foco visível e preferência por movimento reduzido respeitada.
- Menu organizado por rotina, desenvolvimento comercial, gestão e workspace. Navegação móvel com fundo de fechamento, Escape e indicação de página atual.
- Visão geral com dados reais da carteira, oportunidades abertas, fila de qualificação, agenda e atalhos funcionais. Removidos gráfico semanal demonstrativo, meta fixa e valor de pipeline calculado pelo faturamento do prospect na página inicial.
- Central da IA com hierarquia de indicadores, abas, estados vazios orientados e modo de simulação explícito. Mantido o limite de 200 registros informado na tela.
- Clientes com busca tolerante a campos ausentes, cabeçalho adaptável e tabela com rolagem horizontal. BI executivo sem margens negativas que invadiam o layout.
- Tailwind gerado no build, sem script externo em tempo de execução. Módulos secundários carregados sob demanda.

## Validação

Typecheck e build; quatro testes de interface (Central, busca/indicadores, layout e navegação em 390 e 1440 pixels). Inspeção visual manual em Chrome para desktop e celular. O bundle JS inicial passou de aproximadamente 1.199 KB para 543 KB (325 para 157 KB gzip), embora ainda exista aviso do Vite acima de 500 KB. O CSS compilado tem aproximadamente 70 KB (13 KB gzip).

## O que esta entrega não implementa

A base unificada com múltiplos contratos por cliente, geração automática de cadências a partir de contratos e qualificação conversacional completa do SDR ainda não estão implementadas. As integrações de e-mail e WhatsApp serão tratadas pelo usuário com Claude. O redesign não habilita envios, não configura provedores e não amplia permissões.

Os relatórios legados ainda requerem revisão dos cálculos financeiros e filtros de período conforme BROWSER_QA_2026-09-26.md. Exportações mensais, QBR e auditoria detalhada permanecem identificados como indisponíveis. A aparência nova não representa conclusão dessas funcionalidades.
